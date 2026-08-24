// tests/classroom-storage-objects.test.ts
//
// 0133: THE TWO CLASSROOM BUCKETS, AND THE ONE THING THAT MUST NEVER WORK.
//
// Classroom attachments and submission files no longer travel through the app
// server; the browser writes them straight into a private Supabase bucket and
// reads them back through a signed URL. That moves the whole read boundary out
// of `src/routes/api/classroom/*` and into `storage.objects` RLS -- so the
// question "can a student open another student's hand-in" is now answered by
// six policies in a migration rather than by a query in a route.
//
// THAT IS EXACTLY THE SHAPE THIS SUITE EXISTS FOR. A policy that admits too
// much fails invisibly: every screen looks right, every upload works, and the
// only symptom is that a URL somebody was never meant to hold resolves. There
// is nothing to notice.
//
// EVERY DENIAL BELOW IS PAIRED WITH A POSITIVE CONTROL. `bruno cannot read
// alice's object` is worthless on its own -- a typo in the bucket name, a
// missing grant, a wrong prefix all produce the same clean pass -- so each one
// sits beside the identical statement from the caller who SHOULD reach it.
//
// ONE PIECE OF SETUP IS STATED RATHER THAN HIDDEN, the same one
// tests/foundry-policies.test.ts states: tests/db/supabase-stub.sql creates
// storage.objects without the table GRANTS a real Supabase project hands
// `authenticated`. Without them every write here would be refused for
// "permission denied for table objects" -- a true refusal that proves nothing
// about a policy. The grants are added below to match production, and the
// permitted-caller controls are what say the grant really landed.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
	'0133_classroom_storage_attachments.sql'
] as const;

let db: TestDb;
let owner: SeededUser;
let teacherA: SeededUser;
let teacherB: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
let carla: SeededUser;

let p1: string;
let p9: string;
/** Published, posted to P1 only. */
let posted: string;
/** A DRAFT, posted to P1. Its attachments must be unreachable for a student. */
let draft: string;

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

/** An insert into storage.objects as a real client would attempt it. */
function putObject(userId: string, bucket: string, key: string) {
	return db.asUser(userId, (q) =>
		q(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, key])
	);
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

async function deleteObject(userId: string, bucket: string, key: string): Promise<number> {
	return db.asUser(userId, async (q) => {
		const res = await q(`delete from storage.objects where bucket_id = $1 and name = $2`, [
			bucket,
			key
		]);
		return res.rowCount ?? 0;
	});
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	// The grants a real project has and the stub does not. See the header.
	await db.sql(
		`grant select, insert, update, delete on storage.objects to authenticated, service_role`
	);
	await db.sql(`grant select on storage.buckets to authenticated, anon, service_role`);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	teacherA = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	teacherB = await createUser(db, 'mreed@boscotech.edu', 'M. Reed');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Baptiste');
	carla = await createUser(db, 'carla@boscotech.net', 'Carla Cardenas');

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
	p9 = (
		await rpc<{ section_id: string }>(
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
		await rpc(t.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			section,
			student.email,
			name,
			true
		]);
	}

	const mk = (userId: string, sections: string[], title: string, publish: boolean) =>
		rpc<{ item_id: string }>(
			userId,
			`public.classroom_create_item('assignment', $1::uuid[], $2, $3, $4, null, null, $5, '[]'::jsonb, false)`,
			[sections, title, 'Do the work.', 30, publish]
		);
	posted = (await mk(teacherA.id, [p1], 'Bracket hand-in', true)).item_id;
	draft = (await mk(teacherA.id, [p1], 'Unfinished handout', false)).item_id;
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// The buckets themselves
// ---------------------------------------------------------------------------

describe('the two buckets', () => {
	test('are private, capped at 200 MiB, and refuse NOTHING by type', async () => {
		const { rows } = await db.sql<{
			id: string;
			public: boolean;
			file_size_limit: string | null;
			allowed_mime_types: string[] | null;
		}>(
			`select id, public, file_size_limit::text as file_size_limit, allowed_mime_types
			 from storage.buckets
			 where id in ('classroom-attachments', 'submission-files')
			 order by id`
		);
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.public).toBe(false);
			expect(row.file_size_limit).toBe('209715200');
			// THE POINT OF THE WHOLE BUNDLE: no allowlist. Asserted as null, not
			// as "does not contain x" -- an empty array would refuse everything
			// and a one-element array would refuse almost everything, and both
			// read as "a list is configured" to whoever looks next.
			expect(row.allowed_mime_types).toBeNull();
		}
	});

	test('no existing bucket was touched', async () => {
		// greenline-decals is the only capped bucket in production and it is the
		// one this bundle must not have widened. It is created by 0057, which is
		// not in this chain, so the assertion here is the negative one that IS
		// available: 0133 inserted exactly two rows and no others.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from storage.buckets
			 where id not in ('avatars', 'classroom-attachments', 'submission-files')`
		);
		expect(Number(rows[0].n)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// classroom-attachments: written by the teacher of record, read by the class
// ---------------------------------------------------------------------------

describe('classroom-attachments objects', () => {
	test('the teacher of record can write under their item, and a student cannot', async () => {
		await putObject(teacherA.id, 'classroom-attachments', `${posted}/aaaa1111.sldprt`);
		expect(await readableCount(teacherA.id, 'classroom-attachments', `${posted}/aaaa1111.sldprt`)).toBe(1);

		const err = await captureError(() =>
			putObject(alice.id, 'classroom-attachments', `${posted}/student-forged.sldprt`)
		);
		expect(err.message).toMatch(/row-level security/i);
	});

	test('an admin can write under any item (the same predicate, no second branch)', async () => {
		await putObject(owner.id, 'classroom-attachments', `${posted}/admin-put.step`);
		expect(await readableCount(owner.id, 'classroom-attachments', `${posted}/admin-put.step`)).toBe(1);
	});

	test('a teacher who does not manage the item cannot write under it', async () => {
		const err = await captureError(() =>
			putObject(teacherB.id, 'classroom-attachments', `${posted}/other-teacher.dxf`)
		);
		expect(err.message).toMatch(/row-level security/i);
	});

	test('an enrolled student reads a PUBLISHED item, and a student in another section does not', async () => {
		const key = `${posted}/aaaa1111.sldprt`;
		expect(await readableCount(alice.id, 'classroom-attachments', key)).toBe(1);
		expect(await readableCount(bruno.id, 'classroom-attachments', key)).toBe(1);
		// Carla is enrolled in P9; this item is posted to P1 only.
		expect(await readableCount(carla.id, 'classroom-attachments', key)).toBe(0);
	});

	test("a DRAFT item's object is invisible to the class and visible to its teacher", async () => {
		const key = `${draft}/draft-only.pdf`;
		await putObject(teacherA.id, 'classroom-attachments', key);
		expect(await readableCount(teacherA.id, 'classroom-attachments', key)).toBe(1);
		expect(await readableCount(alice.id, 'classroom-attachments', key)).toBe(0);
	});

	test('a key whose first segment is not a uuid fails CLOSED, for writes and reads', async () => {
		// The path predicate returns NULL for these, and every caller is written
		// so NULL matches nothing rather than matching everything.
		for (const key of ['flat.sldprt', '../secrets/x.zip', 'not-a-uuid/x.step', '/x.step']) {
			const err = await captureError(() => putObject(teacherA.id, 'classroom-attachments', key));
			expect(err.message).toMatch(/row-level security/i);
		}
		// And the positive control for the same statement shape.
		await putObject(teacherA.id, 'classroom-attachments', `${posted}/control.step`);
		expect(await readableCount(teacherA.id, 'classroom-attachments', `${posted}/control.step`)).toBe(1);
	});

	test('delete is the manager, never the student', async () => {
		const key = `${posted}/to-remove.f3d`;
		await putObject(teacherA.id, 'classroom-attachments', key);
		// A student's delete matches no row under the delete policy. It is not an
		// error -- RLS filters the row out -- so the assertion is the ROW COUNT.
		expect(await deleteObject(alice.id, 'classroom-attachments', key)).toBe(0);
		expect(await readableCount(teacherA.id, 'classroom-attachments', key)).toBe(1);
		expect(await deleteObject(teacherA.id, 'classroom-attachments', key)).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// submission-files: the one that must never leak
// ---------------------------------------------------------------------------

describe('submission-files objects', () => {
	let aliceSubmission: string;
	let brunoSubmission: string;

	test('classroom_open_submission hands a student their own submission id', async () => {
		const a = await rpc<{ ok: boolean; submission_id: string }>(
			alice.id,
			'public.classroom_open_submission($1::uuid)',
			[posted]
		);
		expect(a.ok).toBe(true);
		expect(a.submission_id).toMatch(/^[0-9a-f-]{36}$/);
		aliceSubmission = a.submission_id;

		const b = await rpc<{ ok: boolean; submission_id: string }>(
			bruno.id,
			'public.classroom_open_submission($1::uuid)',
			[posted]
		);
		brunoSubmission = b.submission_id;
		expect(brunoSubmission).not.toBe(aliceSubmission);

		// Calling it twice does not mint a second submission.
		const again = await rpc<{ submission_id: string }>(
			alice.id,
			'public.classroom_open_submission($1::uuid)',
			[posted]
		);
		expect(again.submission_id).toBe(aliceSubmission);
	});

	test('a student not enrolled in the class cannot open a submission at all', async () => {
		const err = await captureError(() =>
			rpc(carla.id, 'public.classroom_open_submission($1::uuid)', [posted])
		);
		expect(err.message).toMatch(/enrolled/i);
	});

	test('a student writes under their own submission prefix and nobody else can', async () => {
		await putObject(alice.id, 'submission-files', `${aliceSubmission}/alice-part.sldprt`);
		expect(
			await readableCount(alice.id, 'submission-files', `${aliceSubmission}/alice-part.sldprt`)
		).toBe(1);

		// THE ONE THAT MUST NEVER WORK, write half.
		const err = await captureError(() =>
			putObject(bruno.id, 'submission-files', `${aliceSubmission}/bruno-plants-this.sldprt`)
		);
		expect(err.message).toMatch(/row-level security/i);

		// Positive control: the identical statement under bruno's OWN prefix.
		await putObject(bruno.id, 'submission-files', `${brunoSubmission}/bruno-part.sldprt`);
		expect(
			await readableCount(bruno.id, 'submission-files', `${brunoSubmission}/bruno-part.sldprt`)
		).toBe(1);
	});

	test('A STUDENT CANNOT READ ANOTHER STUDENT’S SUBMISSION FILE', async () => {
		const aliceKey = `${aliceSubmission}/alice-part.sldprt`;
		// The denial.
		expect(await readableCount(bruno.id, 'submission-files', aliceKey)).toBe(0);
		expect(await readableCount(carla.id, 'submission-files', aliceKey)).toBe(0);
		// The positive controls, same statement, same object.
		expect(await readableCount(alice.id, 'submission-files', aliceKey)).toBe(1);
		expect(await readableCount(teacherA.id, 'submission-files', aliceKey)).toBe(1);
		expect(await readableCount(owner.id, 'submission-files', aliceKey)).toBe(1);
	});

	test('a teacher of another section cannot read it either', async () => {
		const aliceKey = `${aliceSubmission}/alice-part.sldprt`;
		expect(await readableCount(teacherB.id, 'submission-files', aliceKey)).toBe(0);
	});

	test('a teacher cannot WRITE into a student submission, only read it', async () => {
		// Reviewing is not authoring. The insert policy is ownership only, and a
		// teacher is not the owner -- so a teacher planting a file in a hand-in
		// they are about to grade is not expressible.
		const err = await captureError(() =>
			putObject(teacherA.id, 'submission-files', `${aliceSubmission}/teacher-adds.pdf`)
		);
		expect(err.message).toMatch(/row-level security/i);
		expect(await readableCount(teacherA.id, 'submission-files', `${aliceSubmission}/alice-part.sldprt`)).toBe(1);
	});

	test('delete is the owning student, and not the reviewer', async () => {
		const key = `${aliceSubmission}/scrap.dwg`;
		await putObject(alice.id, 'submission-files', key);
		expect(await deleteObject(bruno.id, 'submission-files', key)).toBe(0);
		expect(await deleteObject(teacherA.id, 'submission-files', key)).toBe(0);
		expect(await deleteObject(alice.id, 'submission-files', key)).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// The row half: exactly one handle, and a key that names its own owner
// ---------------------------------------------------------------------------

describe('the attachment row', () => {
	test('exactly one of a Drive id and a storage key, and neither is not allowed', async () => {
		const both = await captureError(() =>
			rpc(
				teacherA.id,
				`public.classroom_add_attachment($1::uuid, 'drive-abc', 'x.sldprt', 'application/octet-stream', 10, $2)`,
				[posted, `${posted}/aaaa1111.sldprt`]
			)
		);
		expect(both.message).toMatch(/exactly one/i);

		const neither = await captureError(() =>
			rpc(
				teacherA.id,
				`public.classroom_add_attachment($1::uuid, null, 'x.sldprt', 'application/octet-stream', 10, null)`,
				[posted]
			)
		);
		expect(neither.message).toMatch(/exactly one/i);
	});

	test('a storage key must name the item it is being attached to', async () => {
		const err = await captureError(() =>
			rpc(
				teacherA.id,
				`public.classroom_add_attachment($1::uuid, null, 'x.sldprt', 'application/octet-stream', 10, $2)`,
				[posted, `${draft}/borrowed.sldprt`]
			)
		);
		expect(err.message).toMatch(/does not belong to this item/i);

		// Positive control: the same call with the item's own prefix.
		const ok = await rpc<{ ok: boolean; storage_key: string; drive_file_id: string | null }>(
			teacherA.id,
			`public.classroom_add_attachment($1::uuid, null, 'bracket.SLDPRT', 'application/octet-stream', 2048, $2)`,
			[posted, `${posted}/aaaa1111.sldprt`]
		);
		expect(ok.ok).toBe(true);
		expect(ok.storage_key).toBe(`${posted}/aaaa1111.sldprt`);
		expect(ok.drive_file_id).toBeNull();
	});

	test('the original filename is kept verbatim, case included', async () => {
		const { rows } = await db.sql<{ filename: string; storage_key: string }>(
			`select filename, storage_key from public.classroom_attachments
			 where item_id = $1 and storage_key is not null order by sort_order desc limit 1`,
			[posted]
		);
		// The KEY is opaque and lowercase; the NAME is what the person typed.
		expect(rows[0].filename).toBe('bracket.SLDPRT');
		expect(rows[0].storage_key).toBe(`${posted}/aaaa1111.sldprt`);
	});

	test('a Drive-backed row still writes, so nothing already posted is stranded', async () => {
		const ok = await rpc<{ ok: boolean; drive_file_id: string; storage_key: string | null }>(
			teacherA.id,
			`public.classroom_add_attachment($1::uuid, 'legacy-drive-id', 'old.pdf', 'application/pdf', 99, null)`,
			[posted]
		);
		expect(ok.ok).toBe(true);
		expect(ok.drive_file_id).toBe('legacy-drive-id');
		expect(ok.storage_key).toBeNull();
	});

	test('the delete RPC reports which handle was orphaned', async () => {
		const created = await rpc<{ attachment_id: string }>(
			teacherA.id,
			`public.classroom_add_attachment($1::uuid, null, 'plate.DXF', 'application/octet-stream', 5, $2)`,
			[posted, `${posted}/bbbb2222.dxf`]
		);
		const gone = await rpc<{
			storage_key: string | null;
			drive_file_id: string | null;
			orphaned: boolean;
		}>(teacherA.id, 'public.classroom_delete_attachment($1::uuid)', [created.attachment_id]);
		expect(gone.storage_key).toBe(`${posted}/bbbb2222.dxf`);
		expect(gone.drive_file_id).toBeNull();
		expect(gone.orphaned).toBe(true);
	});

	test('exactly one overload of each widened RPC exists', async () => {
		// Two overloads differing only by a defaulted trailing parameter make
		// PostgREST unable to resolve the call at all, so this is the assertion
		// that says the drop actually ran.
		for (const name of ['classroom_add_attachment', 'classroom_add_submission_file']) {
			const { rows } = await db.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p
				 join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = $1`,
				[name]
			);
			expect(Number(rows[0].n), `${name} overloads`).toBe(1);
		}
	});
});

describe('the submission file row', () => {
	test('a storage key must name the caller’s own submission', async () => {
		const mine = await rpc<{ submission_id: string }>(
			alice.id,
			'public.classroom_open_submission($1::uuid)',
			[posted]
		);
		const theirs = await rpc<{ submission_id: string }>(
			bruno.id,
			'public.classroom_open_submission($1::uuid)',
			[posted]
		);

		const err = await captureError(() =>
			rpc(
				alice.id,
				`public.classroom_add_submission_file($1::uuid, null, 'x.sldprt', 'application/octet-stream', 10, null, null, $2)`,
				[posted, `${theirs.submission_id}/forged.sldprt`]
			)
		);
		expect(err.message).toMatch(/does not belong to this submission/i);

		const ok = await rpc<{ ok: boolean; storage_key: string }>(
			alice.id,
			`public.classroom_add_submission_file($1::uuid, null, 'full-robot.SLDASM', 'application/octet-stream', 62914560, null, null, $2)`,
			[posted, `${mine.submission_id}/cccc3333.sldasm`]
		);
		expect(ok.ok).toBe(true);
		expect(ok.storage_key).toBe(`${mine.submission_id}/cccc3333.sldasm`);
	});

	test('a 60 MB row is an ordinary row', async () => {
		const { rows } = await db.sql<{ size_bytes: string; filename: string }>(
			`select size_bytes::text as size_bytes, filename
			 from public.classroom_submission_files
			 where storage_key is not null order by created_at desc limit 1`
		);
		expect(rows[0].size_bytes).toBe('62914560');
		expect(rows[0].filename).toBe('full-robot.SLDASM');
	});
});

// ---------------------------------------------------------------------------
// Re-pasting the file
// ---------------------------------------------------------------------------

describe('0133 re-applies', () => {
	test('pasting the migration a second time is a no-op, not a 2BP01', async () => {
		// Re-pasting is ORDINARY here: someone re-runs it, or a first attempt
		// failed partway and gets retried. A migration that only works once fails
		// exactly then, with the schema half built. The catalog guards around the
		// CHECK constraints and the `drop function if exists` ahead of each
		// widened RPC are what make this hold.
		const text = readFileSync(
			join(fileURLToPath(new URL('..', import.meta.url)), 'supabase', 'migrations', '0133_classroom_storage_attachments.sql'),
			'utf8'
		);
		await db.sql(text);

		// And it is still the same schema afterwards, not a doubled one.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_constraint
			 where conname like 'classroom_%_one_handle'`
		);
		expect(Number(rows[0].n)).toBe(2);

		const { rows: policies } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			 where schemaname = 'storage' and tablename = 'objects'
				 and (policyname like 'classroom attachments%' or policyname like 'submission files%')`
		);
		expect(Number(policies[0].n)).toBe(6);

		// The rows written above survived the re-paste.
		const { rows: att } = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.classroom_attachments where storage_key is not null`
		);
		expect(Number(att[0].n)).toBeGreaterThan(0);
	});
});
