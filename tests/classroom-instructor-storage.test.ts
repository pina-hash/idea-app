// tests/classroom-instructor-storage.test.ts
//
// 0135: THE THIRD BUCKET, THE PUBLIC READ, AND THE DUPLICATE THAT USED TO RAISE.
//
// WHY THESE ARE TESTED AND MOST FEATURE WORK HERE IS NOT. Every guarantee in
// this file fails INVISIBLY. An instructor-only answer key that a student can
// reach looks exactly like one they cannot until somebody looks; a public
// reference document whose attachment 404s looks fine to the teacher who is
// signed in; and an over-wide anon policy shows nothing at all on any screen.
// Those are the cases CLAUDE.md says to automate, and the positive controls
// beside them are what stop the absence assertions passing vacuously.
//
// THE STORAGE STUB. `tests/db/supabase-stub.sql` supplies enough of `storage`
// for the policies to be real, but a live project's GRANTs on storage.objects
// live outside the migrations, so they are granted here -- including to `anon`,
// which the 0133 suite did not need and this one is entirely about.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

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
	'0101_classroom_decks.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql'
] as const;

const INSTRUCTOR_BUCKET = 'instructor-attachments';
const ATTACHMENT_BUCKET = 'classroom-attachments';
const SUBMISSION_BUCKET = 'submission-files';

let db: TestDb;
let teacherA: SeededUser;
let teacherB: SeededUser;
let alice: SeededUser;
/** Signed in, enrolled in nothing: a visitor with a Google account. */
let visitor: SeededUser;

let p1: string;
let p2: string;
/** Published assignment posted to P1. Not public. */
let posted: string;
/** Published PUBLIC material posted to P1: a reference document. */
let publicDoc: string;
/** Published material posted to P1, NOT flagged public. */
let privateDoc: string;

async function captureError(run: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
	try {
		await run();
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return { code: e.code, message: e.message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[]
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

/** Puts the object row there as the owner, bypassing the insert policy. */
async function seedObject(bucket: string, key: string): Promise<void> {
	await db.sql(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, key]);
}

/** How many objects under this key the caller can SEE. 0 is an RLS denial. */
async function readableCount(userId: string, bucket: string, key: string): Promise<number> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ n: string }>(
			`select count(*)::text as n from storage.objects where bucket_id = $1 and name = $2`,
			[bucket, key]
		);
		return Number(rows[0].n);
	});
}

/** The same read with NO session at all: a signed-out request. */
async function anonReadableCount(bucket: string, key: string): Promise<number> {
	return db.asAnon(async (q) => {
		const { rows } = await q<{ n: string }>(
			`select count(*)::text as n from storage.objects where bucket_id = $1 and name = $2`,
			[bucket, key]
		);
		return Number(rows[0].n);
	});
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	await db.sql(
		`grant select, insert, update, delete on storage.objects to authenticated, service_role`
	);
	// `anon` gets SELECT and nothing else. Everything this file proves about a
	// signed-out caller is decided by policy, not by a missing grant -- which
	// is the only way an absence assertion here means anything.
	await db.sql(`grant select on storage.objects to anon`);
	await db.sql(`grant select on storage.buckets to authenticated, anon, service_role`);

	teacherA = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	teacherB = await createUser(db, 'mreed@boscotech.edu', 'M. Reed');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	visitor = await createUser(db, 'someone@gmail.com', 'A Visitor');

	const courseId = (
		await rpc<{ course_id: string }>(teacherA.id, 'public.classroom_upsert_course($1, $2)', [
			'IDEA100',
			'Intro to Engineering Design'
		])
	).course_id;
	p1 = (
		await rpc<{ section_id: string }>(
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 1', 'Block A']
		)
	).section_id;
	p2 = (
		await rpc<{ section_id: string }>(
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 2', 'Block B']
		)
	).section_id;

	await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		p1,
		alice.email,
		'Alice Alvarez',
		true
	]);

	posted = (
		await rpc<{ item_id: string }>(
			teacherA.id,
			`public.classroom_create_item('assignment', array[$1::uuid], 'Bracket hand-in', 'Do the work.', 30, null, null, true, '[]'::jsonb, false)`,
			[p1]
		)
	).item_id;

	const material = async (title: string, isPublic: boolean) => {
		const id = (
			await rpc<{ item_id: string }>(
				teacherA.id,
				`public.classroom_create_item('material', array[$1::uuid], $2, 'Reference.', null, null, null, true, null, false)`,
				[p1, title]
			)
		).item_id;
		if (isPublic) {
			await db.sql('update public.classroom_items set is_public = true where id = $1', [id]);
		}
		return id;
	};
	publicDoc = await material('Unit 1 Reference', true);
	privateDoc = await material('Internal Notes', false);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('the instructor-attachments bucket', () => {
	test('is private, 200 MiB, and refuses nothing for what it is', async () => {
		const { rows } = await db.sql<{
			public: boolean;
			file_size_limit: string | null;
			allowed_mime_types: string[] | null;
		}>(
			`select public, file_size_limit::text as file_size_limit, allowed_mime_types
			 from storage.buckets where id = $1`,
			[INSTRUCTOR_BUCKET]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].public, 'bucket is public').toBe(false);
		expect(rows[0].file_size_limit).toBe('209715200');
		expect(rows[0].allowed_mime_types, 'allowed_mime_types').toBeNull();
	});

	test('a manager reads its objects and an enrolled student cannot', async () => {
		const key = `${posted}/aaaa1111.sldprt`;
		await seedObject(INSTRUCTOR_BUCKET, key);

		// POSITIVE CONTROL FIRST. Without this, the two denials below would
		// pass just as happily against a bucket whose rows do not exist.
		expect(await readableCount(teacherA.id, INSTRUCTOR_BUCKET, key), 'manager').toBe(1);

		expect(await readableCount(alice.id, INSTRUCTOR_BUCKET, key), 'enrolled student').toBe(0);
		expect(await readableCount(teacherB.id, INSTRUCTOR_BUCKET, key), 'other teacher').toBe(0);
		expect(await anonReadableCount(INSTRUCTOR_BUCKET, key), 'signed out').toBe(0);
	});

	test('a student cannot write into it, and a manager can', async () => {
		const mine = `${posted}/bbbb2222.sldasm`;
		await db.asUser(teacherA.id, (q) =>
			q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [
				INSTRUCTOR_BUCKET,
				mine
			])
		);
		expect(await readableCount(teacherA.id, INSTRUCTOR_BUCKET, mine)).toBe(1);

		const err = await captureError(() =>
			db.asUser(alice.id, (q) =>
				q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [
					INSTRUCTOR_BUCKET,
					`${posted}/cccc3333.sldprt`
				])
			)
		);
		expect(err.message).toMatch(/row-level security/i);
	});
});

describe('the instructor write RPC is additive', () => {
	test('both arities exist and the wide one takes no defaults', async () => {
		const { rows } = await db.sql<{ args: string; ndefaults: number }>(
			`select pg_get_function_identity_arguments(p.oid) as args, p.pronargdefaults::int as ndefaults
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_add_instructor_attachment'
			 order by p.pronargs`,
			[]
		);
		expect(rows.map((r) => r.args)).toEqual([
			'p_item_id uuid, p_drive_file_id text, p_filename text, p_mime_type text, p_size_bytes bigint',
			'p_item_id uuid, p_drive_file_id text, p_filename text, p_mime_type text, p_size_bytes bigint, p_storage_key text'
		]);
		expect(rows[1].ndefaults, 'wide defaulted parameters').toBe(0);
	});

	test('the deployed arity still writes a Drive row and keeps its refusal', async () => {
		const made = await rpc<{ ok: boolean; drive_file_id: string }>(
			teacherA.id,
			`public.classroom_add_instructor_attachment($1::uuid, 'legacy-key-doc', 'key.pdf', 'application/pdf', 1024)`,
			[posted]
		);
		expect(made.ok).toBe(true);
		expect(made.drive_file_id).toBe('legacy-key-doc');

		const err = await captureError(() =>
			rpc(
				teacherA.id,
				`public.classroom_add_instructor_attachment($1::uuid, '  ', 'key.pdf', 'application/pdf', 1024)`,
				[posted]
			)
		);
		expect(err.message).toBe('A Drive file id is required.');
	});

	test('the wide arity writes a storage row, and refuses a key naming another item', async () => {
		const made = await rpc<{ ok: boolean; storage_key: string; attachment_id: string }>(
			teacherA.id,
			`public.classroom_add_instructor_attachment($1::uuid, null, 'answers.SLDPRT', 'application/octet-stream', 62914560, $2)`,
			[posted, `${posted}/dddd4444.sldprt`]
		);
		expect(made.ok).toBe(true);
		expect(made.storage_key).toBe(`${posted}/dddd4444.sldprt`);

		const { rows } = await db.sql<{ drive_file_id: string | null; size_bytes: string }>(
			'select drive_file_id, size_bytes::text as size_bytes from public.classroom_instructor_attachments where id = $1',
			[made.attachment_id]
		);
		expect(rows[0].drive_file_id).toBeNull();
		// 60 MiB: comfortably past the 4 MiB ceiling this bundle exists to lift.
		expect(rows[0].size_bytes).toBe('62914560');

		const err = await captureError(() =>
			rpc(
				teacherA.id,
				`public.classroom_add_instructor_attachment($1::uuid, null, 'x.sldprt', 'application/octet-stream', 10, $2)`,
				[posted, `${publicDoc}/eeee5555.sldprt`]
			)
		);
		expect(err.message).toMatch(/does not belong to this item/i);
	});

	test('exactly one handle, in both directions', async () => {
		const both = await captureError(() =>
			rpc(
				teacherA.id,
				`public.classroom_add_instructor_attachment($1::uuid, 'drive-abc', 'x.pdf', 'application/pdf', 10, $2)`,
				[posted, `${posted}/ffff6666.pdf`]
			)
		);
		expect(both.message).toMatch(/exactly one/i);

		const neither = await captureError(() =>
			rpc(
				teacherA.id,
				`public.classroom_add_instructor_attachment($1::uuid, null, 'x.pdf', 'application/pdf', 10, null)`,
				[posted]
			)
		);
		expect(neither.message).toMatch(/exactly one/i);
	});
});

describe('a public material serves its attachments to a signed-out visitor', () => {
	test('the payload carries the storage key', async () => {
		const made = await rpc<{ attachment_id: string }>(
			teacherA.id,
			`public.classroom_add_attachment($1::uuid, null, 'unit1.pdf', 'application/octet-stream', 2048, $2)`,
			[publicDoc, `${publicDoc}/1111aaaa.pdf`]
		);
		const seen = await db.asAnon(async (q) => {
			const { rows } = await q<{ result: { storage_key: string; filename: string } }>(
				'select public.classroom_public_attachment($1::uuid) as result',
				[made.attachment_id]
			);
			return rows[0].result;
		});
		expect(seen.storage_key).toBe(`${publicDoc}/1111aaaa.pdf`);
		expect(seen.filename).toBe('unit1.pdf');
	});

	test('the object itself is readable with no session', async () => {
		const key = `${publicDoc}/2222bbbb.pdf`;
		await seedObject(ATTACHMENT_BUCKET, key);
		expect(await anonReadableCount(ATTACHMENT_BUCKET, key), 'signed out, public item').toBe(1);
		// A signed-in account enrolled in nothing is the case the enrolled-reader
		// policy alone would refuse, so it is asserted separately.
		expect(await readableCount(visitor.id, ATTACHMENT_BUCKET, key), 'signed in, not enrolled').toBe(1);
	});

	test('PROVING THE NEGATIVE: a private item’s attachment refuses a signed-out read', async () => {
		const key = `${privateDoc}/3333cccc.pdf`;
		await seedObject(ATTACHMENT_BUCKET, key);

		// POSITIVE CONTROL on the very same object: the manager reads it, so a
		// zero below is a policy decision and not a missing row or a typo'd key.
		expect(await readableCount(teacherA.id, ATTACHMENT_BUCKET, key), 'manager control').toBe(1);

		expect(await anonReadableCount(ATTACHMENT_BUCKET, key), 'signed out, private item').toBe(0);
		expect(await readableCount(visitor.id, ATTACHMENT_BUCKET, key), 'signed in, not enrolled').toBe(0);

		// And the payload refuses too, so neither half stands alone.
		const { rows } = await db.sql<{ id: string }>(
			'select id from public.classroom_attachments where item_id = $1 limit 1',
			[privateDoc]
		);
		if (rows.length) {
			const seen = await db.asAnon(async (q) => {
				const r = await q<{ result: unknown }>(
					'select public.classroom_public_attachment($1::uuid) as result',
					[rows[0].id]
				);
				return r.rows[0].result;
			});
			expect(seen, 'public payload for a private item').toBeNull();
		}
	});

	test('a DRAFT public material is not public yet', async () => {
		const draft = (
			await rpc<{ item_id: string }>(
				teacherA.id,
				`public.classroom_create_item('material', array[$1::uuid], 'Not ready', 'Later.', null, null, null, false, null, false)`,
				[p1]
			)
		).item_id;
		await db.sql('update public.classroom_items set is_public = true where id = $1', [draft]);

		const key = `${draft}/4444dddd.pdf`;
		await seedObject(ATTACHMENT_BUCKET, key);
		expect(await readableCount(teacherA.id, ATTACHMENT_BUCKET, key), 'manager control').toBe(1);
		expect(await anonReadableCount(ATTACHMENT_BUCKET, key), 'signed out, unpublished').toBe(0);
	});

	test('NOTHING ELSE became readable without a session', async () => {
		// The other two buckets, asserted against a live positive control each.
		const subKey = `${posted}/5555eeee.sldprt`;
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.classroom_submissions (item_id, student_email)
			 values ($1, $2) returning id`,
			[posted, alice.email]
		);
		const realSubKey = `${rows[0].id}/5555eeee.sldprt`;
		await seedObject(SUBMISSION_BUCKET, realSubKey);
		expect(await readableCount(alice.id, SUBMISSION_BUCKET, realSubKey), 'owner control').toBe(1);
		expect(await anonReadableCount(SUBMISSION_BUCKET, realSubKey), 'signed out').toBe(0);

		const instrKey = `${publicDoc}/6666ffff.sldprt`;
		await seedObject(INSTRUCTOR_BUCKET, instrKey);
		expect(await readableCount(teacherA.id, INSTRUCTOR_BUCKET, instrKey), 'manager control').toBe(1);
		// The item here is the PUBLIC one, so this is the sharpest version of
		// the question: publicness must not leak across buckets.
		expect(await anonReadableCount(INSTRUCTOR_BUCKET, instrKey), 'signed out').toBe(0);

		expect(subKey).toBeTruthy();
	});

	test('no anon-facing policy on storage.objects mentions the private buckets', async () => {
		const { rows } = await db.sql<{ policyname: string; qual: string }>(
			`select policyname, coalesce(qual, '') as qual from pg_policies
			 where schemaname = 'storage' and tablename = 'objects' and 'anon' = any (roles)`
		);
		// POSITIVE CONTROL: there IS an anon policy, so an empty list would not
		// be silently passing this.
		expect(rows.length, 'anon-facing policies on storage.objects').toBeGreaterThan(0);
		for (const row of rows) {
			expect(row.qual, `${row.policyname} mentions submission-files`).not.toContain(
				'submission-files'
			);
			expect(row.qual, `${row.policyname} mentions instructor-attachments`).not.toContain(
				'instructor-attachments'
			);
		}
	});
});

describe('duplicating an item carries the storage handle', () => {
	test('an item holding a storage-backed attachment duplicates without raising', async () => {
		// THE REGRESSION, WITH ITS MEASURED FAILURE. Before 0135 this raised
		//   new row for relation "classroom_attachments"
		//   violates check constraint "classroom_attachments_one_handle"
		// because classroom_duplicate_item's column list predates storage_key.
		const source = (
			await rpc<{ item_id: string }>(
				teacherA.id,
				`public.classroom_create_item('material', array[$1::uuid], 'Carries files', 'Body.', null, null, null, true, null, false)`,
				[p1]
			)
		).item_id;
		const key = `${source}/7777aaaa.sldprt`;
		await rpc(
			teacherA.id,
			`public.classroom_add_attachment($1::uuid, null, 'part.SLDPRT', 'application/octet-stream', 4096, $2)`,
			[source, key]
		);
		await rpc(
			teacherA.id,
			`public.classroom_add_instructor_attachment($1::uuid, null, 'answers.SLDPRT', 'application/octet-stream', 4096, $2)`,
			[source, `${source}/8888bbbb.sldprt`]
		);

		const copy = await rpc<{ ok: boolean; item_id: string }>(
			teacherA.id,
			'public.classroom_duplicate_item($1::uuid, array[$2::uuid])',
			[source, p2]
		);
		expect(copy.ok).toBe(true);

		const { rows } = await db.sql<{ storage_key: string | null; drive_file_id: string | null }>(
			'select storage_key, drive_file_id from public.classroom_attachments where item_id = $1',
			[copy.item_id]
		);
		expect(rows, 'the copy carries one attachment row').toHaveLength(1);
		expect(rows[0].storage_key, 'the copy carries the key by reference').toBe(key);
		expect(rows[0].drive_file_id).toBeNull();

		const { rows: instr } = await db.sql<{ storage_key: string | null }>(
			'select storage_key from public.classroom_instructor_attachments where item_id = $1',
			[copy.item_id]
		);
		expect(instr, 'the copy carries one instructor attachment row').toHaveLength(1);
		expect(instr[0].storage_key).toBe(`${source}/8888bbbb.sldprt`);
	});

	test('a reader of the COPY can open the object the copy points at', async () => {
		// The copy's key still names the ORIGINAL item in its first segment, so
		// a prefix-only read predicate would refuse this. 0135 section 8 is what
		// makes it pass, and this is the assertion that says so.
		const source = (
			await rpc<{ item_id: string }>(
				teacherA.id,
				`public.classroom_create_item('material', array[$1::uuid], 'For next year', 'Body.', null, null, null, true, null, false)`,
				[p2]
			)
		).item_id;
		const key = `${source}/9999cccc.pdf`;
		await rpc(
			teacherA.id,
			`public.classroom_add_attachment($1::uuid, null, 'handout.pdf', 'application/octet-stream', 512, $2)`,
			[source, key]
		);
		await seedObject(ATTACHMENT_BUCKET, key);

		// Alice is enrolled in P1 and the source is posted to P2 only, so she
		// cannot read it yet. POSITIVE CONTROL for the assertion after it.
		expect(await readableCount(alice.id, ATTACHMENT_BUCKET, key), 'before the copy').toBe(0);

		const copy = await rpc<{ item_id: string }>(
			teacherA.id,
			'public.classroom_duplicate_item($1::uuid, array[$2::uuid])',
			[source, p1]
		);
		// A duplicate is always a DRAFT, so publish it: an unpublished item is
		// not readable by a student, which would make the next line pass for
		// the wrong reason.
		await db.sql('update public.classroom_items set published = true where id = $1', [
			copy.item_id
		]);

		expect(await readableCount(alice.id, ATTACHMENT_BUCKET, key), 'after the copy').toBe(1);
	});
});
