// tests/classroom-song-queue.test.ts
//
// 0145: THE CLASSROOM SONG QUEUE -- what a student may learn, who may decide,
// and whether an approval and its charge can come apart.
//
// EVERY ASSERTION HERE IS ABOUT A GUARANTEE WHOSE REGRESSION WOULD BE SILENT,
// which is the bar this suite is deliberately narrow to. Nothing about the
// queue's ordinary behaviour is tested here -- a request that fails to save
// fails visibly the first time somebody looks. What is tested is the shape a
// wrong answer takes with nothing on screen changing:
//
//   * a student learning that a CLASSMATE'S request was rejected, and why (the
//     payload still renders; it just carries rows it should not),
//   * a student approving their own request (which looks exactly like an
//     approval working),
//   * a fourth pending request landing (the cap is a number nobody sees),
//   * an approval flipping the row with no coin moving, or a coin moving with
//     no flip (a balance quietly wrong, or a song played for free).
//
// EVERY EXCLUSION IS PAIRED WITH A POSITIVE CONTROL. "A student cannot see the
// rejection" is worthless unless the same fixture demonstrably HAS one to see,
// through a caller who is allowed to see it -- otherwise a projection that
// returned an empty object for everybody would pass every absence assertion in
// this file.
//
// THE MANAGER IN THIS FIXTURE IS NOT AN ADMIN, and that is load-bearing rather
// than incidental. `classroom_manages_section` is `is_admin() OR teacher_email
// = me`, and the teacher of record is the normal approver -- who cannot call
// `coin_log_transaction` at all, since its first line is `is_admin()`. An
// approval charge asserted through an admin would pass on an implementation
// that is broken for every real instructor. `tvargas` is never granted admin
// anywhere in this file, and one test asserts that directly.
//
// The pending cap's concurrency is proven in
// tests/classroom-song-queue-race.test.ts, which needs two live connections and
// a different shape.

import { beforeAll, afterAll, beforeEach, describe, expect, test } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

/**
 * 0145's own dependency chain: the classroom it hangs off, and the coin economy
 * it charges through, up to `0096` (which is what gives `_coin_insert` and
 * `_coin_balance` their current signatures).
 *
 * 0137 goes before it rather than last, which is the production ordering and is
 * correct here for the reason CLAUDE.md gives: the sweep is a one-time repair of
 * what already existed, and a function created AFTER it is not covered by it and
 * must revoke for itself. 0145's seven functions do exactly that, and the grant
 * assertions below are what hold them to it -- if 0145 ever stopped naming the
 * roles, `anon` would hold EXECUTE and this file would redden.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0070_coin_economy.sql',
	// The coin files between 0070 and 0096 are here because 0096 REPLACES
	// functions they create and cannot be applied without them -- the same
	// chain tests/coin-bulk-students.test.ts uses, and not a wider one.
	'0072_coin_my_eating_pass_status.sql',
	'0073_coin_sections.sql',
	'0074_coin_roles.sql',
	'0076_coin_role_quiz_and_expiration.sql',
	'0077_coin_contracts.sql',
	'0079_coin_bulk_payout.sql',
	'0080_coin_category_admin.sql',
	'0081_coin_debt_payment.sql',
	'0084_coin_legacy_import.sql',
	'0087_coin_weekly_wage_tier.sql',
	'0089_coin_public_ledger.sql',
	'0096_coin_medium.sql',
	// The classroom 0145 hangs off: sections, enrollments and the manage rule.
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0137_anon_execute_sweep.sql',
	'0145_classroom_song_queue.sql'
] as const;

let db: TestDb;
let teacher: SeededUser;
let otherTeacher: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let cass: SeededUser;
let sectionId: string;
let otherSectionId: string;

const ANA_NAME = 'Ana Reyes';
const BEN_NAME = 'Ben Okonkwo';

const URL_A = 'https://example.com/track/one?t=42';
const URL_B = 'https://example.com/track/two';

async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

type Json = Record<string, unknown>;

const queue = (user: SeededUser, section = sectionId) =>
	rpc<Json | null>(user, 'public.classroom_song_queue($1::uuid)', [section]);

const request = (user: SeededUser, url = URL_A, note: string | null = null, section = sectionId) =>
	rpc<Json>(user, 'public.classroom_song_request($1::uuid, $2::text, $3::text)', [
		section,
		url,
		note
	]);

/**
 * THE TWO DECISIONS, AND THE HELPERS ARE SEPARATE BECAUSE THE FUNCTIONS ARE.
 * A single helper taking a boolean would let a test exercise the wrong side and
 * still read as though it had covered both -- and the reason being a REQUIRED
 * parameter of the reject function is one of the properties under test.
 */
const approve = (user: SeededUser, requestId: string) =>
	rpc<Json>(user, 'public.classroom_song_approve($1::uuid)', [requestId]);

const reject = (user: SeededUser, requestId: string, reason: string | null) =>
	rpc<Json>(user, 'public.classroom_song_reject($1::uuid, $2::text)', [requestId, reason]);

/** Raw, past RLS and past the grants, for positive controls and for seeding. */
async function rawRequests(): Promise<Json[]> {
	const { rows } = await db.sql<Json>(
		'select * from public.classroom_song_requests order by created_at'
	);
	return rows;
}

async function digitalBalance(email: string): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(
		`select coalesce(sum(amount), 0)::text as n from public.coin_transactions
		 where student_email = $1 and medium = 'digital'`,
		[email]
	);
	return Number(rows[0].n);
}

async function songTransactions(email: string): Promise<Json[]> {
	const { rows } = await db.sql<Json>(
		`select * from public.coin_transactions
		 where student_email = $1 and category_id = 'song_request' order by created_at`,
		[email]
	);
	return rows;
}

/** Every request and every coin row gone, so each test starts derived-empty. */
async function reset(): Promise<void> {
	await db.sql('delete from public.classroom_song_requests');
	await db.sql('delete from public.coin_transactions');
}

/** Submits as `user` and hands back the new id. */
async function requestId(user: SeededUser, url = URL_A, note: string | null = null): Promise<string> {
	const res = await request(user, url, note);
	expect(res.ok).toBe(true);
	return String(res.request_id);
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	otherTeacher = await createUser(db, 'mlopez@boscotech.edu', 'M. Lopez');
	ana = await createUser(db, 'ana@boscotech.net', ANA_NAME);
	ben = await createUser(db, 'ben@boscotech.net', BEN_NAME);
	cass = await createUser(db, 'cass@boscotech.net', 'Cass Ito');

	sectionId = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'IDEA100',
		courseTitle: 'Intro to Engineering Design',
		label: 'Period 1',
		teacherEmail: teacher.email
	});
	otherSectionId = await createClassroomSection(db, {
		as: otherTeacher,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 4',
		teacherEmail: otherTeacher.email
	});

	await enrollStudent(db, { as: teacher, sectionId, email: ana.email, displayName: ANA_NAME });
	await enrollStudent(db, { as: teacher, sectionId, email: ben.email, displayName: BEN_NAME });
	// Cass is a student of a DIFFERENT section. Every "another student" and
	// "somebody else's class" assertion below uses her.
	await enrollStudent(db, {
		as: otherTeacher,
		sectionId: otherSectionId,
		email: cass.email,
		displayName: 'Cass Ito'
	});
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

beforeEach(reset);

// ---------------------------------------------------------------------------
// The floor: the table itself, and who the approver is.
// ---------------------------------------------------------------------------

describe('the request table is shut', () => {
	test('RLS is on, with no policy and no client grant', async () => {
		const { rows: rls } = await db.sql<{ relrowsecurity: boolean }>(
			`select relrowsecurity from pg_class where oid = 'public.classroom_song_requests'::regclass`
		);
		expect(rls[0].relrowsecurity).toBe(true);

		const { rows: policies } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			 where schemaname = 'public' and tablename = 'classroom_song_requests'`
		);
		expect(policies[0].n).toBe('0');

		const { rows: grants } = await db.sql<{ grantee: string }>(
			`select grantee from information_schema.role_table_grants
			 where table_schema = 'public' and table_name = 'classroom_song_requests'
			 and grantee in ('anon', 'authenticated', 'public')`
		);
		expect(grants).toEqual([]);
	});

	/**
	 * THE RAW-TABLE PATH, ASSERTED AS A REFUSAL RATHER THAN AS AN EMPTY RESULT.
	 * A select returning zero rows would also satisfy "cannot read a
	 * classmate's rejection", and would do so for the wrong reason -- it would
	 * mean a policy was filtering, which is a thing that can later be widened.
	 * The missing GRANT is what makes this a permission error, and a permission
	 * error is the answer no policy edit can loosen.
	 */
	test('a student selecting the raw table is refused outright, not filtered', async () => {
		const id = await requestId(ana);
		expect(await reject(teacher, id, 'Not appropriate for class.')).toMatchObject({ ok: true });

		const attempt = await db
			.asUser(ben.id, (q) =>
				q('select student_email, rejection_reason from public.classroom_song_requests')
			)
			.then(() => ({ refused: false, code: '' }))
			.catch((e: unknown) => ({ refused: true, code: (e as { code?: string }).code ?? '' }));
		expect(attempt.refused).toBe(true);
		// 42501 -- insufficient_privilege. Not "no rows".
		expect(attempt.code).toBe('42501');

		// POSITIVE CONTROL: the row, the email and the reason are genuinely there
		// to be read, by a caller that bypasses RLS and grants entirely.
		const raw = await rawRequests();
		expect(raw).toHaveLength(1);
		expect(raw[0].student_email).toBe(ana.email);
		expect(raw[0].rejection_reason).toBe('Not appropriate for class.');
	});

	test('anon reaches neither the table nor any of the four RPCs', async () => {
		const table = await db
			.asAnon((q) => q('select 1 from public.classroom_song_requests'))
			.then(() => false)
			.catch(() => true);
		expect(table).toBe(true);

		for (const call of [
			'public.classroom_song_queue($1::uuid)',
			'public.classroom_song_request($1::uuid, \'https://example.com/x\'::text, null::text)'
		]) {
			const refused = await db
				.asAnon((q) => q(`select ${call}`, [sectionId]))
				.then(() => false)
				.catch(() => true);
			expect(refused).toBe(true);
		}
	});
});

describe('the approver is a section manager, not an admin', () => {
	/**
	 * THE PREMISE OF EVERY CHARGE ASSERTION IN THIS FILE. If `tvargas` were an
	 * admin, an approval could be reaching the coin ledger through a path that
	 * is closed to the instructor this feature is actually for, and every charge
	 * test below would be green on an implementation nobody can use.
	 */
	test('the teacher of record manages the section and is NOT an admin', async () => {
		expect(await rpc<boolean>(teacher, 'public.is_admin()')).toBe(false);
		expect(
			await rpc<boolean>(teacher, 'public.classroom_manages_section($1::uuid)', [sectionId])
		).toBe(true);
		// And the admin-gated logger genuinely refuses them, which is why 0145
		// mints the charge itself. Asserted rather than assumed: if this ever
		// stops raising, the duplication in 0145 section 5 can be retired.
		const refused = await db
			.asUser(teacher.id, (q) =>
				q(`select public.coin_log_transaction($1, 'song_request', null, null, null, 'digital')`, [
					ana.email
				])
			)
			.then(() => false)
			.catch(() => true);
		expect(refused).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// DISCLOSURE. The reason this file exists.
// ---------------------------------------------------------------------------

describe('a student never sees another student\'s pending or rejected request', () => {
	/**
	 * THE CENTRAL ASSERTION, WITH ITS POSITIVE CONTROL IN THE SAME TEST. Ana has
	 * one pending and one rejected request. Ben is in the same class. The
	 * manager sees both with names, so the fixture demonstrably HAS what Ben
	 * must not get -- an empty projection could not pass both halves.
	 */
	test('a classmate\'s pending and rejected rows are absent from every list, by any name', async () => {
		const pending = await requestId(ana, URL_A);
		const doomed = await requestId(ana, URL_B);
		expect(await reject(teacher, doomed, 'Lyrics are not classroom appropriate.')).toMatchObject({
			ok: true
		});

		// POSITIVE CONTROL: the manager sees both, with Ana's name and email.
		const asManager = (await queue(teacher)) as Json;
		expect(asManager.scope).toBe('manager');
		const mgrPending = asManager.pending as Json[];
		const mgrDecided = asManager.decided as Json[];
		expect(mgrPending).toHaveLength(1);
		expect(mgrDecided).toHaveLength(1);
		expect(mgrPending[0].student_name).toBe(ANA_NAME);
		expect(mgrPending[0].student_email).toBe(ana.email);
		expect(mgrDecided[0].rejection_reason).toBe('Lyrics are not classroom appropriate.');

		// THE EXCLUSION. Ben's payload is a student payload with no manager keys
		// at all, and neither of Ana's rows is anywhere in it.
		const asBen = (await queue(ben)) as Json;
		expect(asBen.scope).toBe('student');
		expect(asBen.pending).toBeUndefined();
		expect(asBen.decided).toBeUndefined();
		expect(asBen.approved).toEqual([]);
		expect(asBen.mine).toEqual([]);

		// AND NOT BY ID, EITHER. Serialising the whole payload and searching it
		// for the two request ids, Ana's email, her name and the reason text is
		// what catches a field added later under a name this test does not know.
		const serialized = JSON.stringify(asBen);
		for (const secret of [
			pending,
			doomed,
			ana.email,
			ANA_NAME,
			'Lyrics are not classroom appropriate.',
			URL_A,
			URL_B
		]) {
			expect(serialized).not.toContain(secret);
		}
	});

	test('a student\'s own rejection reason reaches them and nobody else', async () => {
		const id = await requestId(ana, URL_A);
		await reject(teacher, id, 'Try something without the intro.');

		const asAna = (await queue(ana)) as Json;
		const mine = asAna.mine as Json[];
		expect(mine).toHaveLength(1);
		expect(mine[0].status).toBe('rejected');
		expect(mine[0].rejection_reason).toBe('Try something without the intro.');

		// POSITIVE CONTROL is the line above: the reason is genuinely in a student
		// payload, so its absence from Ben's is the projection and not emptiness.
		expect(JSON.stringify(await queue(ben))).not.toContain('Try something without the intro.');
	});

	/**
	 * THE APPROVED LIST IS THE ONE PEER-VISIBLE SURFACE, AND IT NAMES NOBODY.
	 * This is the disclosure judgement 0145's header argues for: the SONG is
	 * public within the class by construction (it is going to be played out
	 * loud), the REQUESTER is not. A name appearing here would render perfectly
	 * and report nothing.
	 */
	test('the approved list carries no requester name or email for a peer, only a mine bit', async () => {
		const id = await requestId(ana, URL_A);
		expect(await approve(teacher, id)).toMatchObject({ ok: true });

		const asBen = (await queue(ben)) as Json;
		const approved = asBen.approved as Json[];
		expect(approved).toHaveLength(1);
		expect(approved[0].url).toBe(URL_A);
		// The song is there; the person is not, as a value or as a key.
		expect(approved[0].mine).toBe(false);
		expect(approved[0].student_name).toBeUndefined();
		expect(approved[0].student_email).toBeUndefined();
		expect(approved[0].decided_by).toBeUndefined();
		expect(JSON.stringify(asBen)).not.toContain(ANA_NAME);
		expect(JSON.stringify(asBen)).not.toContain(ana.email);

		// The requester's own row says it is theirs.
		const asAna = (await queue(ana)) as Json;
		expect((asAna.approved as Json[])[0].mine).toBe(true);

		// POSITIVE CONTROL: the manager's list has the name the students' does not.
		const asManager = (await queue(teacher)) as Json;
		expect((asManager.decided as Json[])[0].student_name).toBe(ANA_NAME);
	});

	test('a non-member and an unknown section both answer null, so an id cannot be probed', async () => {
		await requestId(ana, URL_A);
		// Cass is enrolled in a different section entirely.
		expect(await queue(cass, sectionId)).toBeNull();
		// A teacher who manages a different section is equally a non-member here.
		expect(await queue(otherTeacher, sectionId)).toBeNull();
		expect(await queue(ana, '00000000-0000-4000-8000-000000000000')).toBeNull();
	});

	test('the student branch never populates the manager lists, even with rows present', async () => {
		await requestId(ana, URL_A);
		await requestId(ben, URL_B);
		const asAna = (await queue(ana)) as Json;
		// Ana has one pending row of her own and Ben has one. Hers is in `mine`;
		// his is nowhere, and the manager keys do not exist on this object.
		expect((asAna.mine as Json[])).toHaveLength(1);
		expect(Object.keys(asAna).sort()).toEqual(
			['approved', 'mine', 'my_pending', 'pending_cap', 'price', 'scope', 'section_id'].sort()
		);
	});
});

// ---------------------------------------------------------------------------
// THE DECISION GATE.
// ---------------------------------------------------------------------------

describe('only an instructor of the request\'s own section may decide it', () => {
	/**
	 * A STUDENT APPROVING THEIR OWN REQUEST IS THE FAILURE THAT LOOKS LIKE
	 * SUCCESS. It flips the row, charges nobody's judgement and plays the song.
	 * The refusal is the SAME "does not exist" a bad id gets, so the id is not
	 * probeable either.
	 */
	test('the requester cannot approve their own request', async () => {
		const id = await requestId(ana, URL_A);
		await expect(approve(ana, id)).rejects.toThrow(/does not exist/i);
		await expect(reject(ana, id, 'I changed my mind.')).rejects.toThrow(/does not exist/i);

		// NOTHING MOVED: still pending, still uncharged.
		const raw = await rawRequests();
		expect(raw[0].decided_at).toBeNull();
		expect(raw[0].charge_transaction_id).toBeNull();
		expect(await songTransactions(ana.email)).toHaveLength(0);

		// POSITIVE CONTROL: the same id, from the section's own instructor, works.
		expect(await approve(teacher, id)).toMatchObject({ ok: true, status: 'approved' });
	});

	test('a classmate cannot decide it either, and neither can another section\'s teacher', async () => {
		const id = await requestId(ana, URL_A);
		await expect(approve(ben, id)).rejects.toThrow(/does not exist/i);
		await expect(approve(otherTeacher, id)).rejects.toThrow(/does not exist/i);
		await expect(reject(otherTeacher, id, 'no')).rejects.toThrow(/does not exist/i);
		expect((await rawRequests())[0].decided_at).toBeNull();
	});

	test('a second decision is refused and reports the status the request actually has', async () => {
		const id = await requestId(ana, URL_A);
		await reject(teacher, id, 'Not this one.');
		// The approve press that arrived too late must not report an approval.
		expect(await approve(teacher, id)).toMatchObject({
			ok: false,
			reason: 'already_decided',
			status: 'rejected'
		});
		// And it charged nothing on the way past.
		expect(await songTransactions(ana.email)).toHaveLength(0);
	});

	test('an instructor is refused a request of their own with not_a_student', async () => {
		// Instructors hold enrollment rows routinely (0138), so this is the case
		// the enrollment check alone would let through.
		await enrollStudent(db, {
			as: teacher,
			sectionId,
			email: teacher.email,
			displayName: 'T. Vargas'
		});
		expect(await request(teacher, URL_A)).toMatchObject({ ok: false, reason: 'not_a_student' });
		expect(await rawRequests()).toHaveLength(0);
	});
});

describe('a rejection carries a reason', () => {
	test('a blank or whitespace-only reason is refused, and nothing is decided', async () => {
		const id = await requestId(ana, URL_A);
		for (const blank of ['', '   ', '\n\t  \n']) {
			expect(await reject(teacher, id, blank)).toMatchObject({
				ok: false,
				reason: 'reason_required'
			});
		}
		expect(await reject(teacher, id, null)).toMatchObject({ ok: false, reason: 'reason_required' });
		expect((await rawRequests())[0].decided_at).toBeNull();

		// POSITIVE CONTROL: a real reason decides it.
		expect(await reject(teacher, id, 'Too long for a class period.')).toMatchObject({ ok: true });
	});

	/**
	 * THE `btrim` TRAP, ASSERTED DIRECTLY. `btrim` with no second argument
	 * strips SPACES ONLY, so a reason of newlines and tabs would pass a
	 * `length(btrim(x)) > 0` gate -- empty to whoever typed it and empty to the
	 * client's `trim()`, but a rejection with a reason as far as the database is
	 * concerned. The middle case above is exactly that value.
	 */
	test('a rejected request always has a non-blank reason stored', async () => {
		const id = await requestId(ana, URL_A);
		await reject(teacher, id, '  Please pick something instrumental.  ');
		const raw = (await rawRequests())[0];
		// Trimmed on the way in, so the stored value is the sentence itself.
		expect(raw.rejection_reason).toBe('Please pick something instrumental.');
	});
});

// ---------------------------------------------------------------------------
// THE PENDING CAP. Concurrency is tests/classroom-song-queue-race.test.ts.
// ---------------------------------------------------------------------------

describe('the pending cap', () => {
	test('a fourth open request is refused, and the refusal names the cap', async () => {
		for (let i = 0; i < 3; i += 1) {
			expect(await request(ana, `https://example.com/s${i}`)).toMatchObject({ ok: true });
		}
		const fourth = await request(ana, 'https://example.com/s3');
		expect(fourth).toMatchObject({ ok: false, reason: 'pending_cap', cap: 3, pending: 3 });
		// A REFUSAL, NOT A ROW. The count is what a mutation in the permissive
		// direction moves.
		expect(await rawRequests()).toHaveLength(3);
	});

	test('the cap counts PENDING only, so a decided request frees a slot', async () => {
		const ids: string[] = [];
		for (let i = 0; i < 3; i += 1) ids.push(await requestId(ana, `https://example.com/s${i}`));
		expect(await request(ana, 'https://example.com/s3')).toMatchObject({ reason: 'pending_cap' });

		// Rejecting one frees a slot; so does approving one.
		await reject(teacher, ids[0], 'Not this time.');
		expect(await request(ana, 'https://example.com/s3')).toMatchObject({ ok: true });
		expect(await request(ana, 'https://example.com/s4')).toMatchObject({ reason: 'pending_cap' });
		await approve(teacher, ids[1]);
		expect(await request(ana, 'https://example.com/s4')).toMatchObject({ ok: true });
	});

	test('the cap is per student and per section, not shared', async () => {
		for (let i = 0; i < 3; i += 1) await requestId(ana, `https://example.com/s${i}`);
		expect(await request(ana, URL_B)).toMatchObject({ reason: 'pending_cap' });
		// Ben's own three are unaffected by Ana's.
		expect(await request(ben, URL_B)).toMatchObject({ ok: true });
		// And Cass's other section is a different budget entirely.
		expect(await request(cass, URL_B, null, otherSectionId)).toMatchObject({ ok: true });
	});

	test('the cap and the caller\'s own count are on the payload, so a surface can say so first', async () => {
		await requestId(ana, URL_A);
		const asAna = (await queue(ana)) as Json;
		expect(asAna.pending_cap).toBe(3);
		expect(asAna.my_pending).toBe(1);
		// Ben's own count is his own, not the section's.
		expect(((await queue(ben)) as Json).my_pending).toBe(0);
	});
});

describe('the url rule is https and a host, and nothing about which host', () => {
	test('refuses anything that is not https, as a refusal rather than a raise', async () => {
		for (const bad of ['', 'not a url', 'http://example.com/x', 'ftp://example.com/x', 'https://']) {
			expect(await request(ana, bad)).toMatchObject({ ok: false, reason: 'bad_url' });
		}
		expect(await rawRequests()).toHaveLength(0);
	});

	/**
	 * NO SERVICE IS PARSED. Four unrelated hosts, all accepted, which is the
	 * assertion that would redden if somebody added an allowlist "just for the
	 * common ones".
	 */
	test('accepts any https host, and keeps the url exactly as typed', async () => {
		const urls = [
			'https://example.com/watch?v=abc123&list=xyz',
			'https://open.example.org/track/4Xyz',
			'https://cdn.example.net/a/b/c.mp3',
			'https://EXAMPLE.com/Mixed/Case?Q=1'
		];
		// The pending cap is three, so each one is decided before the next is
		// asked for -- this test is about the url rule, not about the cap.
		for (const u of urls) {
			const id = await requestId(ana, u);
			const raw = await db.sql<{ url: string }>(
				'select url from public.classroom_song_requests where id = $1',
				[id]
			);
			// NOT normalized, NOT lowercased and NOT stripped of query parameters:
			// a share link's parameters are frequently what identifies the track.
			expect(raw.rows[0].url).toBe(u);
			await reject(teacher, id, 'Cycling the fixture.');
		}
	});

	test('the note is optional, trimmed, and capped', async () => {
		const bare = await requestId(ana, URL_A, null);
		expect((await db.sql('select note from public.classroom_song_requests where id = $1', [bare]))
			.rows[0].note).toBeNull();
		await reject(teacher, bare, 'cycling');

		const withNote = await requestId(ana, URL_A, '  for the last ten minutes  ');
		expect((await db.sql('select note from public.classroom_song_requests where id = $1', [
			withNote
		])).rows[0].note).toBe('for the last ten minutes');
		await reject(teacher, withNote, 'cycling');

		expect(await request(ana, URL_A, 'x'.repeat(301))).toMatchObject({
			ok: false,
			reason: 'note_too_long',
			max: 300
		});
	});
});

// ---------------------------------------------------------------------------
// THE CHARGE. Approval and the coin move together or neither happens.
// ---------------------------------------------------------------------------

describe('the charge lands at approval, and only at approval', () => {
	test('requesting is free -- no coin row of any kind exists until an approval', async () => {
		const id = await requestId(ana, URL_A);
		expect(await songTransactions(ana.email)).toHaveLength(0);
		expect(await digitalBalance(ana.email)).toBe(0);

		// POSITIVE CONTROL: approving the very same request does mint one.
		expect(await approve(teacher, id)).toMatchObject({ ok: true, charged: 2 });
		expect(await songTransactions(ana.email)).toHaveLength(1);
	});

	test('a rejection charges nothing and refunds nothing, and says charged 0', async () => {
		const id = await requestId(ana, URL_A);
		const res = await reject(teacher, id, 'Not for class.');
		expect(res).toMatchObject({ ok: true, charged: 0 });
		expect(await songTransactions(ana.email)).toHaveLength(0);
		expect(await digitalBalance(ana.email)).toBe(0);
	});

	/**
	 * THE SHAPE OF THE CHARGE, READ OFF THE LEDGER RATHER THAN OFF THE RESPONSE.
	 * A response can claim anything; the row is what a balance sums over.
	 */
	test('one approval mints exactly one row: -2, digital, the requester, this actor', async () => {
		const id = await requestId(ana, URL_A);
		const res = await approve(teacher, id);
		expect(res.ok).toBe(true);

		const txns = await songTransactions(ana.email);
		expect(txns).toHaveLength(1);
		// SIGNED NEGATIVE, because a purchase takes coins. The price comes from
		// coin_categories, which section 7 moved to 2 in this same file.
		expect(txns[0].amount).toBe(-2);
		// DIGITAL, per 0096: an approval in the app hands nobody a physical coin.
		expect(txns[0].medium).toBe('digital');
		expect(txns[0].student_email).toBe(ana.email);
		// The ACTOR is the instructor who pressed, which is what _coin_insert
		// stamps from current_user_email().
		expect(txns[0].actor_email).toBe(teacher.email);
		expect(await digitalBalance(ana.email)).toBe(-2);

		// And the row and the request point at each other.
		expect((await rawRequests())[0].charge_transaction_id).toBe(txns[0].id);
	});

	test('nobody else is charged, and no other medium moves', async () => {
		const id = await requestId(ana, URL_A);
		await approve(teacher, id);
		expect(await songTransactions(ben.email)).toHaveLength(0);
		expect(await songTransactions(teacher.email)).toHaveLength(0);
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_transactions where medium = 'physical'`
		);
		expect(rows[0].n).toBe('0');
	});

	/**
	 * APPROVED IF AND ONLY IF CHARGED, ASSERTED AGAINST THE DATABASE ITSELF
	 * RATHER THAN AGAINST THE RPC.
	 *
	 * The RPC doing both in one transaction is the mechanism; this constraint is
	 * what survives somebody changing the mechanism. Both halves are attempted
	 * as the OWNER, past RLS and past every grant, so nothing but the constraint
	 * can be what refuses -- which is the whole point (CLAUDE.md: assert a
	 * composite/structural invariant with RLS out of the way entirely).
	 */
	test('an approved row with no charge is UNREPRESENTABLE, even to the owner', async () => {
		const id = await requestId(ana, URL_A);
		const flipWithNoCharge = await db
			.sql(
				`update public.classroom_song_requests
				 set decided_at = now(), decided_by = $2 where id = $1`,
				[id, teacher.email]
			)
			.then(() => ({ refused: false, code: '' }))
			.catch((e: unknown) => ({ refused: true, code: (e as { code?: string }).code ?? '' }));
		expect(flipWithNoCharge.refused).toBe(true);
		// 23514 -- check_violation, from classroom_song_requests_approved_is_charged.
		expect(flipWithNoCharge.code).toBe('23514');
	});

	test('a charge with no approval is UNREPRESENTABLE too', async () => {
		const id = await requestId(ana, URL_A);
		// A real coin row, minted the ordinary way, then hung off a pending
		// request. This is the other half of the half-approval and it must fail.
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.coin_transactions
			   (student_email, category_id, amount, medium, semester_key, actor_email)
			 values ($1, 'song_request', -2, 'digital', 'test', 'seed@boscotech.edu') returning id`,
			[ana.email]
		);
		const attempt = await db
			.sql('update public.classroom_song_requests set charge_transaction_id = $2 where id = $1', [
				id,
				rows[0].id
			])
			.then(() => ({ refused: false, code: '' }))
			.catch((e: unknown) => ({ refused: true, code: (e as { code?: string }).code ?? '' }));
		expect(attempt.refused).toBe(true);
		expect(attempt.code).toBe('23514');

		// AND A REJECTION CANNOT CARRY ONE EITHER: rejected is decided-with-a-
		// reason, which the same constraint requires to be uncharged.
		const rejectedWithCharge = await db
			.sql(
				`update public.classroom_song_requests
				 set decided_at = now(), decided_by = $2, rejection_reason = 'no',
				     charge_transaction_id = $3
				 where id = $1`,
				[id, teacher.email, rows[0].id]
			)
			.then(() => false)
			.catch(() => true);
		expect(rejectedWithCharge).toBe(true);

		// POSITIVE CONTROL: the legal pairing goes through, so the constraint is
		// refusing the two illegal shapes rather than everything.
		await db.sql(
			`update public.classroom_song_requests
			 set decided_at = now(), decided_by = $2, charge_transaction_id = $3 where id = $1`,
			[id, teacher.email, rows[0].id]
		);
		expect((await rawRequests())[0].charge_transaction_id).toBe(rows[0].id);
	});
});

describe('an approval that cannot be paid for refuses, and writes nothing', () => {
	/** Puts a student's DIGITAL balance below zero the way the desk would. */
	async function putInDigitalDebt(email: string): Promise<void> {
		await db.sql(
			`insert into public.coin_transactions
			   (student_email, category_id, amount, medium, semester_key, note, actor_email)
			 values ($1, 'balance_correction', -5, 'digital', 'test', 'seeded debt', 'seed@boscotech.edu')`,
			[email]
		);
	}

	test('an already-negative digital balance refuses, names the student, and leaves it pending', async () => {
		await putInDigitalDebt(ana.email);
		const id = await requestId(ana, URL_A);

		const res = await approve(teacher, id);
		expect(res).toMatchObject({
			ok: false,
			reason: 'debt',
			student_name: ANA_NAME,
			student_email: ana.email,
			medium: 'digital',
			balance: -5,
			price: 2
		});

		// NOTHING WAS WRITTEN. Still pending, still uncharged, balance untouched
		// -- so the same press works later with nothing to undo.
		const raw = (await rawRequests())[0];
		expect(raw.decided_at).toBeNull();
		expect(raw.decided_by).toBeNull();
		expect(raw.charge_transaction_id).toBeNull();
		expect(await songTransactions(ana.email)).toHaveLength(0);
		expect(await digitalBalance(ana.email)).toBe(-5);

		// It is still in the manager's PENDING queue, not the decided list.
		const asManager = (await queue(teacher)) as Json;
		expect((asManager.pending as Json[])).toHaveLength(1);
		expect((asManager.decided as Json[])).toHaveLength(0);

		// POSITIVE CONTROL: clear the debt and the same press lands.
		await db.sql(
			`insert into public.coin_transactions
			   (student_email, category_id, amount, medium, semester_key, note, actor_email)
			 values ($1, 'balance_correction', 10, 'digital', 'test', 'cleared', 'seed@boscotech.edu')`,
			[ana.email]
		);
		expect(await approve(teacher, id)).toMatchObject({ ok: true, charged: 2 });
	});

	/**
	 * THE EXISTING RULE, NOT A STRICTER ONE. 0070/0096 allow a purchase that
	 * itself dips a non-negative balance below zero; only an ALREADY negative
	 * balance refuses. This feature must not quietly enforce something the coin
	 * desk does not, so the boundary is asserted at exactly 0 and exactly -1.
	 */
	test('a zero balance is approvable and lands at -2; -1 is not', async () => {
		const id = await requestId(ana, URL_A);
		expect(await digitalBalance(ana.email)).toBe(0);
		expect(await approve(teacher, id)).toMatchObject({ ok: true });
		expect(await digitalBalance(ana.email)).toBe(-2);

		// Now already negative: the next one refuses.
		const next = await requestId(ana, URL_B);
		expect(await approve(teacher, next)).toMatchObject({ ok: false, reason: 'debt', balance: -2 });
	});

	test('the PHYSICAL balance is not what is asked about', async () => {
		// Physical debt, digital fine: 0096's lockout is per medium, so this
		// approval must land. A total-balance check would refuse it.
		await db.sql(
			`insert into public.coin_transactions
			   (student_email, category_id, amount, medium, semester_key, note, actor_email)
			 values ($1, 'balance_correction', -50, 'physical', 'test', 'physical debt', 'seed@boscotech.edu')`,
			[ana.email]
		);
		const id = await requestId(ana, URL_A);
		expect(await approve(teacher, id)).toMatchObject({ ok: true, charged: 2 });
	});

	test('a retired price row refuses rather than approving free', async () => {
		const id = await requestId(ana, URL_A);
		await db.sql(`update public.coin_categories set active = false where id = 'song_request'`);
		const res = await approve(teacher, id);
		expect(res).toMatchObject({ ok: false, reason: 'not_priced', student_name: ANA_NAME });
		expect((await rawRequests())[0].decided_at).toBeNull();
		expect(await songTransactions(ana.email)).toHaveLength(0);
		// And the surface can say so first: the read reports a null price.
		expect(((await queue(teacher)) as Json).price).toBeNull();

		await db.sql(`update public.coin_categories set active = true where id = 'song_request'`);
		expect(await approve(teacher, id)).toMatchObject({ ok: true });
	});
});

// ---------------------------------------------------------------------------
// The price list, and the function grants.
// ---------------------------------------------------------------------------

describe('the price list', () => {
	test('song_request is 2i¢, an active flat purchase, under its original id', async () => {
		const { rows } = await db.sql<{
			amount: number;
			kind: string;
			pricing_model: string;
			active: boolean;
			notes: string;
		}>(
			`select amount, kind, pricing_model, active, notes
			 from public.coin_categories where id = 'song_request'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].amount).toBe(2);
		expect(rows[0].kind).toBe('purchase');
		expect(rows[0].pricing_model).toBe('flat');
		expect(rows[0].active).toBe(true);
		// 0070's note said the price was for the REQUEST. Under 0145 that is the
		// opposite of the truth, so the sentence is gone rather than merely
		// supplemented.
		expect(rows[0].notes).not.toContain('The price is for the request');
		expect(rows[0].notes).toContain('APPROVES');
	});

	/**
	 * THE PRICE IS NOT WRITTEN DOWN IN THE MIGRATION'S FUNCTION BODIES. Moving
	 * the row moves what an approval charges, with no second edit -- which is
	 * the property that would break silently if somebody inlined a 2.
	 */
	test('the charge follows the price list, with no second copy of the number', async () => {
		await db.sql(`update public.coin_categories set amount = 7 where id = 'song_request'`);
		const id = await requestId(ana, URL_A);
		expect(await approve(teacher, id)).toMatchObject({ ok: true, charged: 7 });
		expect((await songTransactions(ana.email))[0].amount).toBe(-7);
		await db.sql(`update public.coin_categories set amount = 2 where id = 'song_request'`);
	});
});

describe('the function grants', () => {
	test('the four RPCs are authenticated-only and the three helpers are granted to nobody', async () => {
		const { rows } = await db.sql<{
			name: string;
			anon_x: boolean;
			auth_x: boolean;
			service_x: boolean;
		}>(
			`select p.oid::regprocedure::text as name,
			        has_function_privilege('anon', p.oid, 'execute') as anon_x,
			        has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
			        has_function_privilege('service_role', p.oid, 'execute') as service_x
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and (p.proname like 'classroom\\_song%' or p.proname like '\\_classroom\\_song%')
			 order by 1`
		);
		// Four public RPCs and three private helpers, and the count is asserted so
		// a sweep that generated nothing cannot pass.
		expect(rows).toHaveLength(7);
		const publics = rows.filter((r) => !r.name.startsWith('_classroom'));
		const helpers = rows.filter((r) => r.name.startsWith('_classroom'));
		expect(publics).toHaveLength(4);
		expect(helpers).toHaveLength(3);
		for (const r of publics) {
			expect({ name: r.name, anon: r.anon_x, auth: r.auth_x }).toEqual({
				name: r.name,
				anon: false,
				auth: true
			});
		}
		for (const r of helpers) {
			expect({ name: r.name, anon: r.anon_x, auth: r.auth_x, svc: r.service_x }).toEqual({
				name: r.name,
				anon: false,
				auth: false,
				svc: false
			});
		}
	});

	/**
	 * THE SIGNATURE TRAP. Each of these is created for the first time here, so
	 * exactly one row per name is what "no stray overload" means -- and two
	 * overloads differing by a defaulted trailing parameter would make PostgREST
	 * unable to resolve the call at all.
	 */
	test('each function exists exactly once', async () => {
		const { rows } = await db.sql<{ proname: string; n: string }>(
			`select p.proname, count(*)::text as n
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and (p.proname like 'classroom\\_song%' or p.proname like '\\_classroom\\_song%')
			 group by p.proname order by p.proname`
		);
		expect(rows).toHaveLength(7);
		for (const r of rows) expect({ name: r.proname, n: r.n }).toEqual({ name: r.proname, n: '1' });
	});
});
