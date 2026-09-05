// tests/db/classroom-submission-file-boundary.test.ts
//
// THE STUDENT SIDE OF THE HAND-IN PATH, DRIVEN AS A STUDENT.
//
// `classroom_add_submission_file` (0086, widened in 0133, re-signed in 0134)
// and the three `submission-files` policies (0133) are where a student's
// graded work lands. `tests/classroom-storage-objects.test.ts` already drives
// most of the OBJECT half of that -- and this file does not repeat it. What
// this file is for is the three things that suite does not reach and the one
// chain question it cannot answer:
//
//   * ITS CHAIN STOPS AT 0133. The function a student actually calls is
//     0134's (the conflict-tolerant open), the gate inside it is 0109's (a
//     SCHEDULED assignment does not exist to a student), 0135 adds a SECOND
//     permissive select policy to `storage.objects`, and 0137 is the sweep
//     that decides whether `anon` can call any of it. A permissive policy is
//     OR'd with every other permissive policy on the table, so "does 0135
//     widen submission-files" is a question only a chain carrying 0135 can
//     answer. This one carries all of them, with 0137 last as the harness
//     requires.
//   * THE LIFECYCLE CASES. What the path does once the work is TURNED IN, and
//     once it is GRADED, is the half of this boundary nothing has ever put to
//     a student. Both answers are below, and both are asserted as rules.
//   * THE ENROLLMENT GATE ON THE ATTACH ITSELF. That a student outside the
//     class cannot OPEN a submission is covered; that they cannot ATTACH is a
//     different function with its own copy of the gate.
//
// EVERY DENIAL IS PAIRED TWICE OVER. Once with the permitted caller running
// the identical statement -- a wrong bucket name, a missing grant and a
// mistyped key all produce the same clean "denied" -- and once, in the last
// describe, with a MUTATION that opens the exact clause under test on a
// database of its own and confirms the case flips. A denial nothing has ever
// seen fail is a denial nobody has tested.
//
// THE MUTATIONS ARE MADE TO THE DATABASE, NEVER TO A FILE ON DISK. Each one
// reads the shipped definition out of `pg_get_functiondef` and rewrites one
// substring of it, asserting first that the substring is there -- so a
// mutation that silently matched nothing cannot pass for a mutation that
// changed nothing. There is no file to restore and nothing to md5.
//
// ONE PIECE OF SETUP IS STATED RATHER THAN HIDDEN, the same one
// tests/classroom-storage-objects.test.ts states: tests/db/supabase-stub.sql
// creates storage.objects without the table GRANTS a real Supabase project
// hands `authenticated`. Without them every write here would be refused for
// "permission denied for table objects" -- a true refusal that proves nothing
// about a policy. They are added below to match production, and the
// permitted-caller controls are what say the grant really landed.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';

import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------
//
// Numeric order, with 0137 REPEATED at the end. 0137 is a sweep over whatever
// the chain above it created, and 0160 and 0171 both `create or replace` a
// function after it -- which under a hosted project's default privileges hands
// each a fresh `anon` grant. Production re-runs the sweep by hand after such a
// file (CLAUDE.md says so, and names the three that already do it); the chain
// here does the same thing rather than modelling a database nobody has.

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0090_classroom_instructor_materials.sql',
	'0092_classroom_reference_specs.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql',
	'0137_anon_execute_sweep.sql',
	'0160_classroom_submit_incomplete_work.sql',
	'0171_classroom_extra_credit.sql',
	'0137_anon_execute_sweep.sql'
] as const;

/** The world every describe below reads, and the mutation database rebuilds. */
interface World {
	owner: SeededUser;
	/** Teacher of record for P1. */
	teacherA: SeededUser;
	/** Teacher of record for P9. Reviews nobody in P1. */
	teacherB: SeededUser;
	/** P1. */
	alice: SeededUser;
	/** P1. */
	bruno: SeededUser;
	/** P9 only. Enrolled in the school, in none of alice's classes. */
	carla: SeededUser;
	p1: string;
	p9: string;
	/** Published, posted to P1 only. The assignment every case below uses. */
	posted: string;
	/** Published, posted to P9 only. carla's own, so her control is real. */
	postedP9: string;
}

// ---------------------------------------------------------------------------
// Driving it
// ---------------------------------------------------------------------------

async function captureError(run: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
	try {
		await run();
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return { code: e.code, message: e.message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

function rpcOn<T = Record<string, unknown>>(
	target: TestDb,
	userId: string,
	call: string,
	params: unknown[]
): Promise<T> {
	return target.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

/** An insert into storage.objects as a real client's upload lands. */
function putObjectOn(target: TestDb, userId: string, bucket: string, key: string) {
	return target.asUser(userId, (q) =>
		q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, key])
	);
}

/** How many objects under this key the caller can SEE. 0 is an RLS denial. */
async function readableCountOn(
	target: TestDb,
	userId: string,
	bucket: string,
	key: string
): Promise<number> {
	return target.asUser(userId, async (q) => {
		const { rows } = await q<{ n: string }>(
			`select count(*)::text as n from storage.objects where bucket_id = $1 and name = $2`,
			[bucket, key]
		);
		return Number(rows[0].n);
	});
}

async function deleteObjectOn(
	target: TestDb,
	userId: string,
	bucket: string,
	key: string
): Promise<number> {
	return target.asUser(userId, async (q) => {
		const res = await q(`delete from storage.objects where bucket_id = $1 and name = $2`, [
			bucket,
			key
		]);
		return res.rowCount ?? 0;
	});
}

/**
 * The attach, at the WIDE arity. Eight positional arguments bind to the
 * 8-parameter form and to nothing else -- the 0086 arity has no eighth
 * parameter, and the wide one declares no defaults, which is the whole point of
 * the additive pair 0133 shipped and 0134 asserts.
 */
function attachOn(
	target: TestDb,
	userId: string,
	itemId: string,
	storageKey: string | null,
	opts: { filename?: string; driveId?: string | null; sizeBytes?: number } = {}
) {
	return rpcOn<{ ok: boolean; reason?: string; file_id?: string; storage_key?: string | null }>(
		target,
		userId,
		`public.classroom_add_submission_file($1::uuid, $2, $3, 'application/octet-stream', $4::bigint, null, null, $5)`,
		[
			itemId,
			opts.driveId ?? null,
			opts.filename ?? 'bracket.SLDPRT',
			opts.sizeBytes ?? 1024,
			storageKey
		]
	);
}

/** How many submission-file ROWS the caller can read for this submission. */
async function readableRowsOn(target: TestDb, userId: string, submissionId: string): Promise<number> {
	return target.asUser(userId, async (q) => {
		const { rows } = await q<{ n: string }>(
			`select count(*)::text as n from public.classroom_submission_files where submission_id = $1`,
			[submissionId]
		);
		return Number(rows[0].n);
	});
}

function openSubmissionOn(target: TestDb, userId: string, itemId: string) {
	return rpcOn<{ ok: boolean; reason?: string; submission_id?: string }>(
		target,
		userId,
		'public.classroom_open_submission($1::uuid)',
		[itemId]
	);
}

/** A fresh, unused key under a submission's own prefix. */
let keyCounter = 0;
function keyUnder(submissionId: string, ext = 'sldprt'): string {
	keyCounter += 1;
	return `${submissionId}/${String(keyCounter).padStart(8, '0')}-0000-4000-8000-000000000000.${ext}`;
}

// ---------------------------------------------------------------------------
// Seeding, through the real RPCs
// ---------------------------------------------------------------------------

async function seed(target: TestDb): Promise<World> {
	// The grants a real project has and the stub does not. See the header.
	await target.sql(
		`grant select, insert, update, delete on storage.objects to authenticated, service_role`
	);
	// AND `anon` gets SELECT, which the existing suite does not need and this one
	// does. A real project grants it -- 0135's whole point is an anon SELECT
	// POLICY on this table, which would be unreachable without the grant behind
	// it -- so leaving it off would make the signed-out case below refuse one
	// step too early, on a privilege rather than on a policy, and certify a
	// boundary that had never been asked.
	await target.sql(`grant select on storage.objects to anon`);
	await target.sql(`grant select on storage.buckets to authenticated, anon, service_role`);

	const owner = await createUser(target, 'apina@boscotech.edu', 'Site Owner');
	const teacherA = await createUser(target, 'tvargas@boscotech.edu', 'T. Vargas');
	const teacherB = await createUser(target, 'mreed@boscotech.edu', 'M. Reed');
	const alice = await createUser(target, 'alice@boscotech.net', 'Alice Alvarez');
	const bruno = await createUser(target, 'bruno@boscotech.net', 'Bruno Baptiste');
	const carla = await createUser(target, 'carla@boscotech.net', 'Carla Cardenas');

	const courseId = (
		await rpcOn<{ course_id: string }>(target, teacherA.id, 'public.classroom_upsert_course($1, $2)', [
			'IDEA100',
			'Intro to Engineering Design'
		])
	).course_id;
	const p1 = (
		await rpcOn<{ section_id: string }>(
			target,
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 1', 'Block A']
		)
	).section_id;
	const p9 = (
		await rpcOn<{ section_id: string }>(
			target,
			teacherB.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 9', null]
		)
	).section_id;

	for (const [t, section, student, name] of [
		[teacherA, p1, alice, 'Alice Alvarez'],
		[teacherA, p1, bruno, 'Bruno Baptiste'],
		[teacherB, p9, carla, 'Carla Cardenas']
	] as const) {
		await rpcOn(target, t.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			section,
			student.email,
			name,
			true
		]);
	}

	// NAMED notation, and `p_body_doc` named deliberately: 0122's wide arity and
	// 0085's narrow one differ only by two trailing defaulted parameters, so a
	// 10-argument positional call binds to neither uniquely. Naming a parameter
	// only the wide form has is what resolves it -- the same reason PostgREST
	// calls every function in named notation.
	const mk = (userId: string, sections: string[], title: string) =>
		rpcOn<{ item_id: string }>(
			target,
			userId,
			`public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
				p_body => 'Do the work.', p_points => 30, p_published => true,
				p_body_doc => null::jsonb)`,
			[sections, title]
		);
	const posted = (await mk(teacherA.id, [p1], 'Bracket hand-in')).item_id;
	const postedP9 = (await mk(teacherB.id, [p9], 'Period 9 hand-in')).item_id;

	return { owner, teacherA, teacherB, alice, bruno, carla, p1, p9, posted, postedP9 };
}

// ---------------------------------------------------------------------------

let db: TestDb;
let w: World;
/** alice's submission on `posted`, opened once in beforeAll. */
let aliceSub: string;
/** bruno's submission on the same assignment. */
let brunoSub: string;
/** The key alice's own file lands on; every read case below asks about it. */
let aliceKey: string;

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);
	w = await seed(db);

	aliceSub = (await openSubmissionOn(db, w.alice.id, w.posted)).submission_id ?? '';
	brunoSub = (await openSubmissionOn(db, w.bruno.id, w.posted)).submission_id ?? '';
	expect(aliceSub).toMatch(/^[0-9a-f-]{36}$/);
	expect(brunoSub).not.toBe(aliceSub);

	aliceKey = keyUnder(aliceSub);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// The chain this is measured on, stated as an assertion rather than a comment
// ---------------------------------------------------------------------------

describe('the chain under test is the deployed one', () => {
	test('the attach a student calls is 0134’s, at two arities, the wide one with no defaults', async () => {
		const { rows } = await db.sql<{ nargs: number; ndefaults: number }>(
			`select p.pronargs as nargs, p.pronargdefaults as ndefaults
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'classroom_add_submission_file'
			  order by p.pronargs`
		);
		// Both arities present -- the pair 0133 shipped so a deployed client and a
		// hand-applied migration never block each other.
		expect(rows.map((r) => r.nargs)).toEqual([7, 8]);
		// And they cannot both answer one call: the wide form takes no defaults,
		// so the smallest call it accepts is larger than the largest the narrow
		// one does. A count of two passes on exactly the arrangement that breaks
		// every call, which is why the defaults are asserted and not just the count.
		expect(rows[1].ndefaults).toBe(0);

		// 0134 is the body, not 0133's: the conflict-tolerant open is what tells
		// them apart, and it is what makes this a test of the live function.
		const { rows: src } = await db.sql<{ has: boolean }>(
			`select prosrc like '%on conflict (item_id, student_email) do nothing%' as has
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'classroom_add_submission_file'
				and p.pronargs = 8`
		);
		expect(src[0].has).toBe(true);
	});

	test('the enrollment gate inside it is 0109’s, which a scheduled item does not pass', async () => {
		const { rows } = await db.sql<{ has: boolean }>(
			`select prosrc like '%_classroom_item_live%' as has
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = '_classroom_engine_student'`
		);
		expect(rows[0].has).toBe(true);
	});

	test('0135 added a second permissive select policy, and it does NOT name submission-files', async () => {
		// A permissive policy is OR'd with every other permissive policy on the
		// table, so one mis-scoped policy anywhere on storage.objects widens every
		// bucket it names. This is the assertion that the second one 0135 adds is
		// not one of those -- and the count beside it is what says 0135 really ran,
		// so a chain that quietly dropped it could not pass this vacuously.
		const { rows } = await db.sql<{ policyname: string; roles: string; qual: string }>(
			`select policyname, array_to_string(roles, ',') as roles, coalesce(qual, '') as qual
			   from pg_policies
			  where schemaname = 'storage' and tablename = 'objects'
			  order by policyname`
		);
		const anonReaching = rows.filter(
			(r) => r.roles.includes('anon') && r.qual.includes('submission-files')
		);
		expect(anonReaching).toEqual([]);

		const anonAtAll = rows.filter((r) => r.roles.includes('anon'));
		// The positive control on the line above: there IS an anon policy here, it
		// simply names a different bucket. Zero of them would make the filter above
		// pass over an empty list.
		expect(anonAtAll.length).toBeGreaterThan(0);
		for (const p of anonAtAll) expect(p.qual).toContain('classroom-attachments');
	});

	test('after the sweep, `anon` cannot execute either student write function', async () => {
		const { rows } = await db.sql<{ f: string; anon: boolean; authed: boolean }>(
			`select p.proname as f,
					has_function_privilege('anon', p.oid, 'execute') as anon,
					has_function_privilege('authenticated', p.oid, 'execute') as authed
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public'
				and p.proname in ('classroom_add_submission_file', 'classroom_open_submission')`
		);
		expect(rows.length).toBe(3); // two arities of the attach, one open
		// The ACL is read back rather than the sweep's own verdict being trusted:
		// a migration's self-check passing says the guard ran, not what is granted.
		for (const r of rows) {
			expect(r.anon, `${r.f} anon`).toBe(false);
			expect(r.authed, `${r.f} authenticated`).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// 1-2. Attaching: to your own work, and to somebody else's
// ---------------------------------------------------------------------------

describe('attaching', () => {
	test('1. a student attaches a file to their OWN submission', async () => {
		await putObjectOn(db, w.alice.id, 'submission-files', aliceKey);
		const res = await attachOn(db, w.alice.id, w.posted, aliceKey, {
			filename: 'bracket-v3.SLDPRT',
			sizeBytes: 62_914_560
		});
		expect(res.ok).toBe(true);
		expect(res.storage_key).toBe(aliceKey);

		const { rows } = await db.sql<{ filename: string; size_bytes: string; mime_type: string }>(
			`select filename, size_bytes::text as size_bytes, mime_type
			   from public.classroom_submission_files where storage_key = $1`,
			[aliceKey]
		);
		expect(rows.length).toBe(1);
		// The name is kept verbatim, case included: nothing a person typed is in
		// the KEY, so nothing has to be sanitised out of it.
		expect(rows[0].filename).toBe('bracket-v3.SLDPRT');
		expect(rows[0].size_bytes).toBe('62914560');
	});

	test('2. a student cannot attach to ANOTHER student’s submission, and there is no parameter to try it with', async () => {
		// The structural half first. `classroom_add_submission_file` takes no
		// student identity of any kind -- the caller is `auth.uid()` by way of
		// `_classroom_engine_student` -- so "attach as somebody else" is not
		// expressible in the signature. That is a property of the SIGNATURE and
		// not a check that could be got wrong, which is why it is asserted here
		// rather than reasoned about.
		// Parameter NAMES only. Reading the whole argument string here is what
		// the first draft did, and `uuid` contains `uid` -- so the sweep matched
		// its own first parameter's TYPE and reported an identity parameter that
		// is not there. A sweep that cannot tell a type from a name is a sweep
		// that would have missed a real one.
		const { rows: args } = await db.sql<{ name: string }>(
			`select unnest(p.proargnames) as name
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'classroom_add_submission_file'`
		);
		expect(args.length).toBeGreaterThan(0);
		for (const r of args) {
			expect(r.name, `parameter ${r.name}`).not.toMatch(
				/email|student|_user|_uid|caller|as_/i
			);
		}
		// The positive control on that sweep: the REVIEW-side function, which is
		// the same feature seen from the teacher's end, genuinely does take a
		// student. So the pattern finds one when there is one to find.
		const { rows: review } = await db.sql<{ name: string }>(
			`select unnest(p.proargnames) as name
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'classroom_can_review_submission'`
		);
		expect(review.some((r) => /email|student/i.test(r.name))).toBe(true);

		// So the only way to aim at another student's work is a FORGED KEY, and
		// that is what the row check refuses.
		const forged = `${brunoSub}/deadbeef-0000-4000-8000-000000000000.sldprt`;
		const err = await captureError(() => attachOn(db, w.alice.id, w.posted, forged));
		expect(err.message).toMatch(/does not belong to this submission/i);

		// Nothing landed anywhere: not under bruno's submission, and not under
		// alice's own either.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.classroom_submission_files where storage_key = $1`,
			[forged]
		);
		expect(Number(rows[0].n)).toBe(0);

		// Positive control: the identical call under alice's OWN prefix.
		const mine = keyUnder(aliceSub);
		await putObjectOn(db, w.alice.id, 'submission-files', mine);
		expect((await attachOn(db, w.alice.id, w.posted, mine)).ok).toBe(true);
	});

	test('6. a student cannot attach to an assignment posted to a class they are not in', async () => {
		// carla is a real, actively enrolled student -- of Period 9. This is the
		// gate inside `_classroom_engine_student`, asked by the ATTACH rather than
		// by `classroom_open_submission`, which is a different function with its
		// own copy of it.
		const err = await captureError(() =>
			attachOn(db, w.carla.id, w.posted, `${aliceSub}/whatever.sldprt`)
		);
		expect(err.message).toMatch(/enrolled/i);

		// It refuses BEFORE the key is looked at, so a well-formed key of her own
		// does not get her any further either.
		const carlaOwn = await openSubmissionOn(db, w.carla.id, w.postedP9);
		const carlaKey = keyUnder(carlaOwn.submission_id ?? '');
		const err2 = await captureError(() => attachOn(db, w.carla.id, w.posted, carlaKey));
		expect(err2.message).toMatch(/enrolled/i);

		// Positive control: the identical call on HER OWN class's assignment.
		await putObjectOn(db, w.carla.id, 'submission-files', carlaKey);
		expect((await attachOn(db, w.carla.id, w.postedP9, carlaKey)).ok).toBe(true);
	});

	test('a student whose enrollment was deactivated is refused too', async () => {
		// 0082 soft-deletes an enrollment by clearing `active`, and the gate reads
		// it. This is the same refusal as case 6 reached by the other route, and it
		// is the one that decides what happens to a student who drops the class.
		const dropped = await createUser(db, 'dario@boscotech.net', 'Dario Duarte');
		await rpcOn(db, w.teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			w.p1,
			dropped.email,
			'Dario Duarte',
			true
		]);
		// Positive control FIRST, while the enrollment is still active.
		const sub = await openSubmissionOn(db, dropped.id, w.posted);
		const k = keyUnder(sub.submission_id ?? '');
		await putObjectOn(db, dropped.id, 'submission-files', k);
		expect((await attachOn(db, dropped.id, w.posted, k)).ok).toBe(true);

		await rpcOn(db, w.teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			w.p1,
			dropped.email,
			'Dario Duarte',
			false
		]);
		const k2 = keyUnder(sub.submission_id ?? '');
		const err = await captureError(() => attachOn(db, dropped.id, w.posted, k2));
		expect(err.message).toMatch(/enrolled/i);
	});
});

// ---------------------------------------------------------------------------
// 3-5, 9-10. Reading and writing the bytes
// ---------------------------------------------------------------------------

describe('the object', () => {
	test('3. a student reads their own submission file, row and bytes alike', async () => {
		expect(await readableCountOn(db, w.alice.id, 'submission-files', aliceKey)).toBe(1);
		expect(await readableRowsOn(db, w.alice.id, aliceSub)).toBeGreaterThan(0);
	});

	test('4. A STUDENT CANNOT READ ANOTHER STUDENT’S SUBMISSION FILE, row or bytes', async () => {
		// The bytes.
		expect(await readableCountOn(db, w.bruno.id, 'submission-files', aliceKey)).toBe(0);
		expect(await readableCountOn(db, w.carla.id, 'submission-files', aliceKey)).toBe(0);
		// And the ROW that names them, which is the other half of the same
		// question: a key is only useful to somebody who can learn it.
		expect(await readableRowsOn(db, w.bruno.id, aliceSub)).toBe(0);
		expect(await readableRowsOn(db, w.carla.id, aliceSub)).toBe(0);

		// The positive controls, same statements, same object and same rows.
		expect(await readableCountOn(db, w.alice.id, 'submission-files', aliceKey)).toBe(1);
		expect(await readableRowsOn(db, w.alice.id, aliceSub)).toBeGreaterThan(0);
	});

	test('5. a student cannot write into another student’s storage folder', async () => {
		const err = await captureError(() =>
			putObjectOn(db, w.bruno.id, 'submission-files', `${aliceSub}/bruno-plants-this.sldprt`)
		);
		expect(err.message).toMatch(/row-level security/i);
		expect(
			await readableCountOn(db, w.alice.id, 'submission-files', `${aliceSub}/bruno-plants-this.sldprt`)
		).toBe(0);

		// Positive control: the identical statement under bruno's OWN prefix.
		const own = keyUnder(brunoSub);
		await putObjectOn(db, w.bruno.id, 'submission-files', own);
		expect(await readableCountOn(db, w.bruno.id, 'submission-files', own)).toBe(1);
	});

	test('9. the teacher of record for that student’s section reads it', async () => {
		expect(await readableCountOn(db, w.teacherA.id, 'submission-files', aliceKey)).toBe(1);
		expect(await readableRowsOn(db, w.teacherA.id, aliceSub)).toBeGreaterThan(0);
		// An admin too, through the same predicate rather than a second branch.
		expect(await readableCountOn(db, w.owner.id, 'submission-files', aliceKey)).toBe(1);
	});

	test('10. a teacher of a DIFFERENT section reads nothing of it', async () => {
		expect(await readableCountOn(db, w.teacherB.id, 'submission-files', aliceKey)).toBe(0);
		expect(await readableRowsOn(db, w.teacherB.id, aliceSub)).toBe(0);
		// Positive control: teacherB is not a broken account -- she reads her own
		// section's work by the identical statement.
		const carlaSub = (await openSubmissionOn(db, w.carla.id, w.postedP9)).submission_id ?? '';
		const carlaKey = keyUnder(carlaSub);
		await putObjectOn(db, w.carla.id, 'submission-files', carlaKey);
		expect(await readableCountOn(db, w.teacherB.id, 'submission-files', carlaKey)).toBe(1);
	});

	test('a signed-out caller reaches no submission object and no row', async () => {
		const objects = await db.asAnon(async (q) => {
			const { rows } = await q<{ n: string }>(
				`select count(*)::text as n from storage.objects where bucket_id = 'submission-files'`
			);
			return Number(rows[0].n);
		});
		expect(objects).toBe(0);
		// The row half fails one step earlier, on the table grant rather than a
		// policy -- which is a different refusal and is asserted as one.
		const err = await captureError(() =>
			db.asAnon((q) => q(`select count(*) from public.classroom_submission_files`))
		);
		expect(err.message).toMatch(/permission denied/i);

		// Positive control: the same object count as a signed-in owner.
		const seen = await db.asUser(w.alice.id, async (q) => {
			const { rows } = await q<{ n: string }>(
				`select count(*)::text as n from storage.objects where bucket_id = 'submission-files'`
			);
			return Number(rows[0].n);
		});
		expect(seen).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// 7-8. The lifecycle: turned in, and graded
// ---------------------------------------------------------------------------
//
// These are the two the audit could not answer from anywhere in the repository,
// and neither is asserted as "whatever it happens to do". Each states the RULE
// the pair of functions implements, and states it with the assertion that makes
// it safe rather than on its own.

describe('once the work is turned in', () => {
	let sub: string;
	let item: string;

	beforeAll(async () => {
		item = (
			await rpcOn<{ item_id: string }>(
				db,
				w.teacherA.id,
				`public.classroom_create_item(
					p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => 'Lifecycle hand-in',
					p_body => 'Turn it in.', p_points => 20, p_published => true, p_body_doc => null::jsonb)`,
				[[w.p1]]
			)
		).item_id;
		sub = (await openSubmissionOn(db, w.alice.id, item)).submission_id ?? '';
		const k = keyUnder(sub);
		await putObjectOn(db, w.alice.id, 'submission-files', k);
		expect((await attachOn(db, w.alice.id, item, k)).ok).toBe(true);
	});

	test('7. THE ATTACH IS REFUSED, as a structured refusal and not a raise', async () => {
		const submitted = await rpcOn<{ ok: boolean; state?: string }>(
			db,
			w.alice.id,
			'public.classroom_submit_assignment($1::uuid)',
			[item]
		);
		expect(submitted.ok).toBe(true);
		expect(submitted.state).toBe('submitted');

		const k = keyUnder(sub);
		await putObjectOn(db, w.alice.id, 'submission-files', k);
		const res = await attachOn(db, w.alice.id, item, k);
		// `{ok:false, reason}` and NOT an exception, because this is a refusal a
		// caller must display gracefully rather than genuine misuse: the student
		// did nothing wrong, the work is simply closed. The route reads exactly
		// this reason to say "This is turned in, so files are locked."
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('locked');

		// And nothing landed.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.classroom_submission_files where storage_key = $1`,
			[k]
		);
		expect(Number(rows[0].n)).toBe(0);
	});

	test('7b. and the way back in is the student’s own, while nobody has graded it', async () => {
		// The refusal above is only right because it is not a dead end. Unsubmit
		// is the student's, so a hand-in made too early is theirs to reopen -- and
		// the attach works again immediately afterwards, which is what says the
		// two functions read the same state.
		const un = await rpcOn<{ ok: boolean; state?: string }>(
			db,
			w.alice.id,
			'public.classroom_unsubmit_assignment($1::uuid)',
			[item]
		);
		expect(un.ok).toBe(true);
		expect(un.state).toBe('draft');

		const k = keyUnder(sub);
		await putObjectOn(db, w.alice.id, 'submission-files', k);
		expect((await attachOn(db, w.alice.id, item, k)).ok).toBe(true);
	});
});

describe('once the work is graded', () => {
	let item: string;
	let sub: string;

	beforeAll(async () => {
		item = (
			await rpcOn<{ item_id: string }>(
				db,
				w.teacherA.id,
				`public.classroom_create_item(
					p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => 'Graded hand-in',
					p_body => 'Turn it in.', p_points => 10, p_published => true, p_body_doc => null::jsonb)`,
				[[w.p1]]
			)
		).item_id;
		await rpcOn(db, w.teacherA.id, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
			item,
			JSON.stringify([
				{
					id: 'craft',
					criterion: 'Craft',
					points: 10,
					levels: [
						{ points: 10, label: 'Exemplary', descriptor: 'Everything is where it should be.' },
						{ points: 5, label: 'Developing', descriptor: 'Most of it is where it should be.' },
						{ points: 0, label: 'Not yet', descriptor: 'Nothing is where it should be.' }
					]
				}
			])
		]);
		sub = (await openSubmissionOn(db, w.alice.id, item)).submission_id ?? '';
		const k = keyUnder(sub);
		await putObjectOn(db, w.alice.id, 'submission-files', k);
		await attachOn(db, w.alice.id, item, k);
		await rpcOn(db, w.alice.id, 'public.classroom_submit_assignment($1::uuid)', [item]);
	});

	/** The wide grade arity: seven positional arguments, no defaults on it. */
	function grade(release: boolean) {
		return rpcOn<{ ok: boolean; state?: string; score?: number }>(
			db,
			w.teacherA.id,
			`public.classroom_grade_submission($1::uuid, $2, $3::jsonb, null, $4::boolean, null::jsonb, null::numeric)`,
			// 5 is the middle LEVEL's own points. An off-level score is a
			// deliberate override and 0171 refuses it without a per-criterion
			// comment (`override_needs_comment`) -- a real refusal, and not this
			// test's subject, so the score sits on a level.
			[item, w.alice.email, JSON.stringify({ craft: 5 }), release]
		);
	}

	test('8a. GRADED BUT NOT RELEASED IS STILL LOCKED, and the student cannot reopen it either', async () => {
		const graded = await grade(false);
		expect(graded.ok).toBe(true);
		// Grading does not move the state on its own. The work stays `submitted`,
		// which is what the attach reads.
		expect(graded.state).toBe('submitted');

		const k = keyUnder(sub);
		await putObjectOn(db, w.alice.id, 'submission-files', k);
		const res = await attachOn(db, w.alice.id, item, k);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('locked');

		// AND the door 7b opened is now shut. This is the assertion that makes the
		// one above mean anything: without it a student could unsubmit, attach and
		// resubmit under a grade that had already been written.
		const un = await rpcOn<{ ok: boolean; reason?: string }>(
			db,
			w.alice.id,
			'public.classroom_unsubmit_assignment($1::uuid)',
			[item]
		);
		expect(un.ok).toBe(false);
		expect(un.reason).toBe('graded');
	});

	test('8b. RELEASING THE GRADE OPENS THE WORK AGAIN, which is the resubmission path and is deliberate', async () => {
		// `returned` is documented on the column as "graded and released (editable
		// again for resubmission)", and this is that rule holding: the ONLY way
		// back into a graded hand-in is the teacher releasing it, which 8a is what
		// establishes. A student who has been given feedback can act on it; a
		// student who has not cannot touch the work.
		const released = await grade(true);
		expect(released.ok).toBe(true);
		expect(released.state).toBe('returned');

		const k = keyUnder(sub);
		await putObjectOn(db, w.alice.id, 'submission-files', k);
		expect((await attachOn(db, w.alice.id, item, k)).ok).toBe(true);
	});

	test('8c. and the row keeps its grade with nothing on it saying the work moved afterwards', async () => {
		// NOT a pin on a behaviour: this is the reporting consequence of 8b, stated
		// where somebody deciding to build a "changed since you graded it" signal
		// will find it. The attach writes a `classroom_submission_files` row and
		// touches `classroom_submissions` not at all, so `graded_at` and
		// `updated_at` both still describe the grade rather than the work.
		const { rows } = await db.sql<{
			score: string | null;
			graded_after_update: boolean;
			file_after_grade: boolean;
		}>(
			`select s.score::text as score,
					s.graded_at >= s.updated_at as graded_after_update,
					exists (
						select 1 from public.classroom_submission_files f
						 where f.submission_id = s.id and f.created_at > s.graded_at
					) as file_after_grade
			   from public.classroom_submissions s where s.id = $1`,
			[sub]
		);
		expect(rows[0].score).toBe('5');
		// A file genuinely landed after the grade was written...
		expect(rows[0].file_after_grade).toBe(true);
		// ...and the submission row does not know: its own timestamps still put the
		// grade last. The evidence exists, on the FILE, and only there.
		expect(rows[0].graded_after_update).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// The one asymmetry the audit found
// ---------------------------------------------------------------------------

describe('deleting a turned-in hand-in', () => {
	let item: string;
	let sub: string;
	let key: string;
	let fileId: string;

	beforeAll(async () => {
		item = (
			await rpcOn<{ item_id: string }>(
				db,
				w.teacherA.id,
				`public.classroom_create_item(
					p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => 'Delete-after-submit',
					p_body => 'Turn it in.', p_points => 10, p_published => true, p_body_doc => null::jsonb)`,
				[[w.p1]]
			)
		).item_id;
		sub = (await openSubmissionOn(db, w.alice.id, item)).submission_id ?? '';
		key = keyUnder(sub);
		await putObjectOn(db, w.alice.id, 'submission-files', key);
		fileId = (await attachOn(db, w.alice.id, item, key)).file_id ?? '';
		await rpcOn(db, w.alice.id, 'public.classroom_submit_assignment($1::uuid)', [item]);
	});

	test('the ROW is locked, exactly as the attach is', async () => {
		const res = await rpcOn<{ ok: boolean; reason?: string }>(
			db,
			w.alice.id,
			'public.classroom_delete_submission_file($1::uuid)',
			[fileId]
		);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('locked');

		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.classroom_submission_files where id = $1`,
			[fileId]
		);
		expect(Number(rows[0].n)).toBe(1);
	});

	test('THE BYTES ARE NOT: the storage delete policy carries no lock, so a student can remove work a teacher is grading', async () => {
		// THIS IS THE FINDING, and it is stated as one rather than pinned. The row
		// half above refuses because `classroom_delete_submission_file` reads the
		// submission's state; the OBJECT half asks
		// `classroom_owns_submission_object`, which is ownership and nothing else.
		// So the two halves of one decision disagree, and the half with no undo is
		// the open one -- a Storage delete cannot be reversed and this repository
		// holds no backup of a bucket.
		//
		// WHAT IT COSTS: the row survives and points at nothing, so the hand-in is
		// still listed, still counted, still gradeable on paper, and the download a
		// teacher clicks 404s. That reads as a platform fault rather than as
		// something the student did.
		//
		// It is NOT reachable from any surface: the browser's delete goes through
		// the RPC, which refuses. It is reachable by anyone holding their own
		// session, which is every student -- the session cookies are not httpOnly.
		const removed = await deleteObjectOn(db, w.alice.id, 'submission-files', key);
		expect(removed).toBe(1);

		// The row is still there, naming bytes that are gone.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.classroom_submission_files
			  where id = $1 and storage_key = $2`,
			[fileId, key]
		);
		expect(Number(rows[0].n)).toBe(1);

		// And the teacher, who could read those bytes a moment ago, now cannot.
		expect(await readableCountOn(db, w.teacherA.id, 'submission-files', key)).toBe(0);
	});

	test('a student can also add BYTES to a submitted hand-in, though no row can name them', async () => {
		// The milder twin of the same omission, in the insert policy: ownership,
		// no state. What it buys is nothing -- the attach refuses, so the object is
		// orphaned the moment it lands, serves to nobody and is listed by nothing.
		// It is recorded here because the two policies are one decision and a
		// migration closing the delete should say why it leaves this alone.
		const stray = keyUnder(sub);
		await putObjectOn(db, w.alice.id, 'submission-files', stray);
		expect(await readableCountOn(db, w.alice.id, 'submission-files', stray)).toBe(1);

		const res = await attachOn(db, w.alice.id, item, stray);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('locked');
	});
});

// ---------------------------------------------------------------------------
// Mutation proof
// ---------------------------------------------------------------------------
//
// Every denial above, put to a database whose corresponding clause has been
// opened in the PERMISSIVE direction. A policy commented out entirely fails
// closed and reddens almost nothing; `using (true)` and a `raise` turned into a
// no-op reproduce the real leak.
//
// The mutations are made to the DATABASE and read the shipped definition out of
// `pg_get_functiondef` first, so nothing here retypes a rule and there is no
// file on disk to restore. Each rewrite asserts its target substring was
// present before it replaces it -- a `replace()` that matched nothing returns
// the original string happily, and a mutation suite that suddenly all passes is
// the tell CLAUDE.md warns about.

describe('mutation proof: each denial fails when its own clause is opened', () => {
	let mut: TestDb;
	let m: World;
	let aSub: string;
	let bSub: string;
	let aKey: string;

	beforeAll(async () => {
		mut = await startTestDb(MIGRATIONS);
		m = await seed(mut);
		aSub = (await openSubmissionOn(mut, m.alice.id, m.posted)).submission_id ?? '';
		bSub = (await openSubmissionOn(mut, m.bruno.id, m.posted)).submission_id ?? '';
		aKey = keyUnder(aSub);
		await putObjectOn(mut, m.alice.id, 'submission-files', aKey);
		expect((await attachOn(mut, m.alice.id, m.posted, aKey)).ok).toBe(true);
	}, 240_000);

	afterAll(async () => {
		await mut?.stop();
	});

	/**
	 * Runs `body` against a database in which ONE function has been rewritten,
	 * and puts the original back afterwards.
	 *
	 * EVERY MUTATION IS UNDONE, AND THE UNDO IS PROVEN. The first draft of this
	 * block left each mutation in place, so by the fourth test the database no
	 * longer resembled the one under test: the key-ownership mutation was still
	 * live when the enrollment mutation was measured, and the enrollment case
	 * "flipped" for the wrong reason. That is the accumulating-mutant failure in
	 * its quietest form -- everything passes, and what passed was not what the
	 * test said. So the original definition is captured from the catalog first,
	 * re-applied in `finally`, and the restored definition is asserted
	 * byte-identical to the captured one.
	 *
	 * `mutate` is asserted to have CHANGED the text. A rewrite whose target
	 * substring is absent returns the original string happily, and a mutation
	 * suite that suddenly all passes is exactly what that looks like.
	 */
	async function withMutation(
		signature: string,
		mutate: (def: string) => string,
		body: () => Promise<void>
	): Promise<void> {
		const { rows } = await mut.sql<{ def: string }>(
			`select pg_get_functiondef($1::regprocedure) as def`,
			[signature]
		);
		const original = rows[0].def;
		const mutated = mutate(original);
		expect(mutated, `the rewrite of ${signature} changed nothing`).not.toBe(original);

		try {
			await mut.sql(mutated);
			await body();
		} finally {
			await mut.sql(original);
			const { rows: back } = await mut.sql<{ def: string }>(
				`select pg_get_functiondef($1::regprocedure) as def`,
				[signature]
			);
			expect(back[0].def, `${signature} was not restored`).toBe(original);
		}
	}

	/** Replaces `from` with `to`, asserting it occurred exactly `count` times. */
	function swap(from: string, to: string, count: number) {
		return (def: string) => {
			const occurrences = def.split(from).length - 1;
			expect(occurrences, `occurrences of "${from}"`).toBe(count);
			return def.split(from).join(to);
		};
	}

	/** Replaces a whole SQL predicate body with `true`, keeping its header. */
	function openPredicate() {
		return (def: string) => {
			const at = def.indexOf('AS $function$');
			expect(at, 'the definition has a $function$ body').toBeGreaterThan(-1);
			return `${def.slice(0, at)}AS $function$ select true $function$`;
		};
	}

	test('4 + 10 flip: opening classroom_can_read_submission_object makes the object readable to everyone', async () => {
		// Before, on the untouched database.
		expect(await readableCountOn(mut, m.bruno.id, 'submission-files', aKey)).toBe(0);
		expect(await readableCountOn(mut, m.teacherB.id, 'submission-files', aKey)).toBe(0);

		await withMutation(
			'public.classroom_can_read_submission_object(text)',
			openPredicate(),
			async () => {
				// The SAME statements now answer 1. That is what says the zeros
				// above were the policy refusing and not the query missing.
				expect(await readableCountOn(mut, m.bruno.id, 'submission-files', aKey)).toBe(1);
				expect(await readableCountOn(mut, m.teacherB.id, 'submission-files', aKey)).toBe(1);
			}
		);

		// And back, which is the restore's own control.
		expect(await readableCountOn(mut, m.bruno.id, 'submission-files', aKey)).toBe(0);
		expect(await readableCountOn(mut, m.teacherB.id, 'submission-files', aKey)).toBe(0);
	});

	test('5 flips: opening classroom_owns_submission_object lets a student write into another’s folder', async () => {
		const target = `${aSub}/mutation-plants-this.sldprt`;
		const before = await captureError(() =>
			putObjectOn(mut, m.bruno.id, 'submission-files', target)
		);
		expect(before.message).toMatch(/row-level security/i);

		await withMutation(
			'public.classroom_owns_submission_object(text)',
			openPredicate(),
			async () => {
				// The insert no longer raises. It is measured as an insert and not
				// as a read-back: the SELECT policy asks a DIFFERENT predicate
				// (`classroom_can_read_submission_object`), so bruno still cannot
				// see what he just planted -- which is the two policies being two
				// decisions, and is why a read-back would have reported this
				// mutation as not biting when it bit exactly as intended.
				await putObjectOn(mut, m.bruno.id, 'submission-files', target);
				const { rows } = await mut.sql<{ n: string }>(
					`select count(*)::text as n from storage.objects
					  where bucket_id = 'submission-files' and name = $1`,
					[target]
				);
				expect(Number(rows[0].n)).toBe(1);
				// And ALICE, whose folder it is, now reads a file she never put
				// there. That is the leak in the form somebody would notice.
				expect(await readableCountOn(mut, m.alice.id, 'submission-files', target)).toBe(1);
			}
		);

		const after = await captureError(() =>
			putObjectOn(mut, m.bruno.id, 'submission-files', `${aSub}/again.sldprt`)
		);
		expect(after.message).toMatch(/row-level security/i);
	});

	test('2 flips: removing the key-ownership clause lets a row point outside its own submission', async () => {
		const forged = `${bSub}/forged-by-mutation.sldprt`;
		const before = await captureError(() => attachOn(mut, m.alice.id, m.posted, forged));
		expect(before.message).toMatch(/does not belong to this submission/i);

		await withMutation(
			'public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text)',
			// The clause, made trivially satisfiable rather than deleted: the shape
			// of the `if` is untouched, only what it compares.
			swap(
				'is distinct from v_submission_id then',
				'is distinct from public._classroom_storage_prefix_uuid(v_key) then',
				1
			),
			async () => {
				expect((await attachOn(mut, m.alice.id, m.posted, forged)).ok).toBe(true);
			}
		);

		// THE INVARIANT THE CLAUSE HOLDS, stated as one: every row's key names its
		// OWN submission. With the clause open, alice's row carries a key under
		// bruno's prefix -- which is what a signed-URL mint would then be asked
		// for on her behalf, and what a teacher reviewing her work would be
		// pointed at.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.classroom_submission_files
			  where storage_key is not null
				and public._classroom_storage_prefix_uuid(storage_key) is distinct from submission_id`
		);
		expect(Number(rows[0].n), 'rows on the UNMUTATED database').toBe(0);

		const { rows: leaked } = await mut.sql<{ n: string }>(
			`select count(*)::text as n from public.classroom_submission_files
			  where storage_key is not null
				and public._classroom_storage_prefix_uuid(storage_key) is distinct from submission_id`
		);
		expect(Number(leaked[0].n), 'rows the mutation let through').toBe(1);

		// And the clause refuses again now it is back.
		const again = await captureError(() =>
			attachOn(mut, m.alice.id, m.posted, `${bSub}/second-forgery.sldprt`)
		);
		expect(again.message).toMatch(/does not belong to this submission/i);
	});

	test('6 flips: turning the enrollment refusal into a no-op lets an outsider through the gate', async () => {
		const carlaSub = (await openSubmissionOn(mut, m.carla.id, m.postedP9)).submission_id ?? '';
		const k = keyUnder(carlaSub);
		await putObjectOn(mut, m.carla.id, 'submission-files', k);

		const before = await captureError(() => attachOn(mut, m.carla.id, m.posted, k));
		expect(before.message).toMatch(/enrolled/i);

		await withMutation(
			'public._classroom_engine_student(uuid)',
			// The `raise` becomes `null` -- a valid plpgsql no-op, so the guard
			// still evaluates and simply stops refusing. Nothing else moves.
			swap(
				"raise exception 'Only a student enrolled in this class can work on this assignment.';",
				'null;',
				1
			),
			async () => {
				// carla is now inside an assignment posted only to Period 1. The
				// refusal she meets is the NEXT one down -- the key check, because
				// the attach opened her a brand-new submission on this item and her
				// key names her Period 9 one. The gate is what flipped, and the
				// message is how that is measured: it is no longer about enrollment.
				const after = await captureError(() => attachOn(mut, m.carla.id, m.posted, k));
				expect(after.message).toMatch(/does not belong to this submission/i);
				expect(after.message).not.toMatch(/enrolled/i);

				// And the whole of it, measured on a statement that COMMITS. The
				// attach above raises, and a raise rolls its own statement back --
				// including the submission row it had just inserted -- so counting
				// rows after it would report zero and read as a mutation that did
				// not bite. `classroom_open_submission` asks the identical gate and
				// returns rather than raising, so the row it opens survives: carla
				// now holds a submission on an assignment posted only to Period 1.
				const opened = await openSubmissionOn(mut, m.carla.id, m.posted);
				expect(opened.ok).toBe(true);
				const { rows } = await mut.sql<{ n: string }>(
					`select count(*)::text as n from public.classroom_submissions
					  where item_id = $1 and student_email = $2`,
					[m.posted, m.carla.email]
				);
				expect(Number(rows[0].n)).toBe(1);
			}
		);

		// Restored: the gate refuses her again, by name.
		const again = await captureError(() => attachOn(mut, m.carla.id, m.posted, k));
		expect(again.message).toMatch(/enrolled/i);
	});

	test('7 flips: removing the locked refusal lets a student attach to work they turned in', async () => {
		const item = (
			await rpcOn<{ item_id: string }>(
				mut,
				m.teacherA.id,
				`public.classroom_create_item(
					p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => 'Mutation lifecycle',
					p_body => 'Turn it in.', p_points => 10, p_published => true, p_body_doc => null::jsonb)`,
				[[m.p1]]
			)
		).item_id;
		const sub = (await openSubmissionOn(mut, m.alice.id, item)).submission_id ?? '';
		const k1 = keyUnder(sub);
		await putObjectOn(mut, m.alice.id, 'submission-files', k1);
		await attachOn(mut, m.alice.id, item, k1);
		await rpcOn(mut, m.alice.id, 'public.classroom_submit_assignment($1::uuid)', [item]);

		const k2 = keyUnder(sub);
		await putObjectOn(mut, m.alice.id, 'submission-files', k2);
		const before = await attachOn(mut, m.alice.id, item, k2);
		expect(before.ok).toBe(false);
		expect(before.reason).toBe('locked');

		await withMutation(
			'public.classroom_add_submission_file(uuid, text, text, text, bigint, text, text, text)',
			// BOTH spellings of the refusal: the first read, and the re-read after
			// the conflict-tolerant insert. Replacing only one would leave a
			// mutation that bites on one path and not the other, which is the
			// weaker instrument silently.
			swap("if v_state = 'submitted' then", 'if false then', 2),
			async () => {
				expect((await attachOn(mut, m.alice.id, item, k2)).ok).toBe(true);
			}
		);

		const k3 = keyUnder(sub);
		await putObjectOn(mut, m.alice.id, 'submission-files', k3);
		const after = await attachOn(mut, m.alice.id, item, k3);
		expect(after.ok).toBe(false);
		expect(after.reason).toBe('locked');
	});
});

// ---------------------------------------------------------------------------
// The fix this bundle did NOT ship, measured so the next one does not have to
// guess
// ---------------------------------------------------------------------------
//
// The delete asymmetry above is a defect and this bundle reports it rather than
// migrating it -- the argument is in the ledger and the history entry, and the
// short form is that the hole destroys only the student's OWN work while the
// policy it sits in is load-bearing for a shipped upload path that no test here
// can drive.
//
// WHAT THAT PATH IS, exactly, because it is the whole reason the obvious
// one-line narrowing is wrong: `src/routes/api/classroom/submission-file/
// +server.ts` uploads the bytes FIRST and records the row SECOND, and when the
// record is refused it sweeps the orphaned object using THE STUDENT'S OWN
// client. A `state <> 'submitted'` narrowing would refuse that sweep in exactly
// the case it exists for -- the `locked` refusal -- and leave an orphan behind
// every time a student picks a file for work they have already turned in.
//
// So the predicate below keys on the ROW rather than on the submission: an
// object NO LIVE ROW NAMES is always the owner's to remove (that is the sweep),
// and an object a SUBMITTED row names is nobody's. It is applied here, exercised
// against all three cases, and taken back off -- so this file still leaves its
// database exactly as it found it, and the next session inherits a measurement
// instead of a suggestion.

describe('the proposed narrowing, applied and measured (not shipped)', () => {
	let fix: TestDb;
	let f: World;
	let item: string;
	let sub: string;

	beforeAll(async () => {
		fix = await startTestDb(MIGRATIONS);
		f = await seed(fix);
		item = (
			await rpcOn<{ item_id: string }>(
				fix,
				f.teacherA.id,
				`public.classroom_create_item(
					p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => 'Proposed narrowing',
					p_body => 'Turn it in.', p_points => 10, p_published => true, p_body_doc => null::jsonb)`,
				[[f.p1]]
			)
		).item_id;
		sub = (await openSubmissionOn(fix, f.alice.id, item)).submission_id ?? '';

		await fix.sql(`
			create or replace function public.classroom_submission_object_is_locked(p_name text)
			returns boolean
			language sql
			stable
			security definer
			set search_path = ''
			as $fix$
				select exists (
					select 1
					from public.classroom_submission_files sf
					join public.classroom_submissions s on s.id = sf.submission_id
					where sf.storage_key = p_name and s.state = 'submitted'
				);
			$fix$;
		`);
		await fix.sql(
			`revoke all on function public.classroom_submission_object_is_locked(text)
			   from public, anon, authenticated, service_role`
		);
		await fix.sql(
			`grant execute on function public.classroom_submission_object_is_locked(text) to authenticated`
		);
		await fix.sql(`drop policy if exists "submission files delete own submission" on storage.objects`);
		await fix.sql(`
			create policy "submission files delete own submission"
				on storage.objects
				for delete
				to authenticated
				using (
					bucket_id = 'submission-files'
					and public.classroom_owns_submission_object(name)
					and not public.classroom_submission_object_is_locked(name)
				);
		`);
	}, 240_000);

	afterAll(async () => {
		await fix?.stop();
	});

	test('a DRAFT hand-in’s bytes are still the student’s to remove', async () => {
		const k = keyUnder(sub);
		await putObjectOn(fix, f.alice.id, 'submission-files', k);
		expect((await attachOn(fix, f.alice.id, item, k)).ok).toBe(true);
		// Through the RPC, which is what the surface actually does, and then the
		// object sweep the route runs behind it.
		const del = await rpcOn<{ ok: boolean; orphaned?: boolean; storage_key?: string }>(
			fix,
			f.alice.id,
			`public.classroom_delete_submission_file(
				(select id from public.classroom_submission_files where storage_key = $1))`,
			[k]
		);
		expect(del.ok).toBe(true);
		expect(del.orphaned).toBe(true);
		expect(await deleteObjectOn(fix, f.alice.id, 'submission-files', k)).toBe(1);
	});

	test('THE ORPHAN SWEEP STILL WORKS, which is what rules out the one-line narrowing', async () => {
		// The shipped shape: bytes up, record refused, student's own client
		// removes what it just put there. No row ever named this object, so the
		// predicate must let it go -- and a `state <> 'submitted'` narrowing would
		// not have.
		const k = keyUnder(sub);
		await putObjectOn(fix, f.alice.id, 'submission-files', k);
		await attachOn(fix, f.alice.id, item, k);
		await rpcOn(fix, f.alice.id, 'public.classroom_submit_assignment($1::uuid)', [item]);

		const orphan = keyUnder(sub);
		await putObjectOn(fix, f.alice.id, 'submission-files', orphan);
		const refused = await attachOn(fix, f.alice.id, item, orphan);
		expect(refused.ok).toBe(false);
		expect(refused.reason).toBe('locked');

		expect(await deleteObjectOn(fix, f.alice.id, 'submission-files', orphan)).toBe(1);
	});

	test('and the SUBMITTED hand-in’s own bytes are refused, which is the hole closed', async () => {
		const { rows } = await fix.sql<{ storage_key: string }>(
			`select sf.storage_key from public.classroom_submission_files sf
			   join public.classroom_submissions s on s.id = sf.submission_id
			  where s.id = $1 and s.state = 'submitted'`,
			[sub]
		);
		expect(rows.length).toBe(1);
		const locked = rows[0].storage_key;

		// 0 rows deleted: RLS refused, silently, exactly as it does for another
		// student's object.
		expect(await deleteObjectOn(fix, f.alice.id, 'submission-files', locked)).toBe(0);
		// The bytes are still there, and the teacher still reads them.
		expect(await readableCountOn(fix, f.teacherA.id, 'submission-files', locked)).toBe(1);

		// THE POSITIVE CONTROL IS ON THE UNPATCHED DATABASE, so this is a
		// comparison and not a claim: the identical statement, against an object
		// in the identical state, on the fixture every other describe in this file
		// uses. It removes it. The only difference between the two runs is the
		// policy, which is what makes the 0 above the policy's doing.
		const control = (
			await rpcOn<{ item_id: string }>(
				db,
				w.teacherA.id,
				`public.classroom_create_item(
					p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => 'Narrowing control',
					p_body => 'Turn it in.', p_points => 10, p_published => true, p_body_doc => null::jsonb)`,
				[[w.p1]]
			)
		).item_id;
		const controlSub = (await openSubmissionOn(db, w.alice.id, control)).submission_id ?? '';
		const controlKey = keyUnder(controlSub);
		await putObjectOn(db, w.alice.id, 'submission-files', controlKey);
		await attachOn(db, w.alice.id, control, controlKey);
		await rpcOn(db, w.alice.id, 'public.classroom_submit_assignment($1::uuid)', [control]);
		expect(await deleteObjectOn(db, w.alice.id, 'submission-files', controlKey)).toBe(1);
	});

	test('releasing the grade hands the bytes back, in step with the attach', async () => {
		// `returned` reopens the work (8b), so the delete has to reopen with it or
		// the two halves disagree again in the other direction.
		await fix.sql(
			`update public.classroom_submissions set state = 'returned' where id = $1`,
			[sub]
		);
		const { rows } = await fix.sql<{ storage_key: string }>(
			`select storage_key from public.classroom_submission_files
			  where submission_id = $1 and storage_key is not null limit 1`,
			[sub]
		);
		expect(await deleteObjectOn(fix, f.alice.id, 'submission-files', rows[0].storage_key)).toBe(1);
	});
});
