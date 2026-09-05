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
import { createHash, randomUUID } from 'node:crypto';

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

	test('both arities of each widened RPC exist, and the wide one takes no defaults', async () => {
		// GENERALIZED FROM "exactly one overload exists". That assertion was
		// the right one while 0133 dropped the deployed arity; it stopped being
		// the right one when 0133 became additive, and deleting it would have
		// thrown away the only check standing between us and the PostgREST
		// trap. The RULE it was standing in for is what is asserted now:
		//
		//   NO CALL MAY BE RESOLVABLE BY MORE THAN ONE OVERLOAD.
		//
		// Two overloads differing only by a DEFAULTED trailing parameter are
		// exactly that failure -- a payload naming the narrow key set binds to
		// both, and PostgREST refuses to choose. What separates them here is
		// that the wide form declares no defaults, so the narrow key set can
		// only reach the narrow form and the wide key set can only reach the
		// wide one. Asserting the count alone would pass on the arrangement
		// that breaks every upload.
		for (const [name, narrow, wide] of [
			[
				'classroom_add_attachment',
				'p_item_id uuid, p_drive_file_id text, p_filename text, p_mime_type text,' +
					' p_size_bytes bigint',
				'p_item_id uuid, p_drive_file_id text, p_filename text, p_mime_type text,' +
					' p_size_bytes bigint, p_storage_key text'
			],
			[
				'classroom_add_submission_file',
				'p_item_id uuid, p_drive_file_id text, p_filename text, p_mime_type text,' +
					' p_size_bytes bigint, p_block_id text, p_caption text',
				'p_item_id uuid, p_drive_file_id text, p_filename text, p_mime_type text,' +
					' p_size_bytes bigint, p_block_id text, p_caption text, p_storage_key text'
			]
		] as const) {
			const { rows } = await db.sql<{
				args: string;
				nargs: number;
				ndefaults: number;
			}>(
				`select pg_get_function_identity_arguments(p.oid) as args,
				        p.pronargs::int as nargs,
				        p.pronargdefaults::int as ndefaults
				 from pg_proc p
				 join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = $1
				 order by p.pronargs`,
				[name]
			);

			expect(rows.map((r) => r.args), `${name} arities`).toEqual([narrow, wide]);

			// The narrow form is 0085's/0086's exactly, trailing defaults and
			// all, so a caller that omits p_size_bytes still resolves to it.
			// The wide form must have none.
			const wideRow = rows[rows.length - 1];
			expect(wideRow.ndefaults, `${name}(${wide}) defaulted parameters`).toBe(0);
			expect(wideRow.nargs, `${name} wide parameter count`).toBe(wide.split(',').length);
		}
	});

	test('the deployed arity still writes a Drive-backed row, and still refuses a blank id', async () => {
		// THE WHOLE POINT OF THE WRAPPER: the client running in production
		// names these five keys and nothing else. If this ever stops working,
		// applying 0133 takes uploads down until a deploy lands.
		const created = await rpc<{ ok: boolean; attachment_id: string; drive_file_id: string }>(
			teacherA.id,
			`public.classroom_add_attachment($1::uuid, 'legacy-drive-xyz', 'handout.pdf', 'application/pdf', 4096)`,
			[posted]
		);
		expect(created.ok).toBe(true);
		expect(created.drive_file_id).toBe('legacy-drive-xyz');

		const { rows } = await db.sql<{ storage_key: string | null; drive_file_id: string }>(
			'select storage_key, drive_file_id from public.classroom_attachments where id = $1',
			[created.attachment_id]
		);
		expect(rows[0].storage_key).toBeNull();
		expect(rows[0].drive_file_id).toBe('legacy-drive-xyz');

		// 0085's refusal text, verbatim, in 0085's position.
		const err = await captureError(() =>
			rpc(
				teacherA.id,
				`public.classroom_add_attachment($1::uuid, '  ', 'handout.pdf', 'application/pdf', 4096)`,
				[posted]
			)
		);
		expect(err.message).toBe('A Drive file id is required.');
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

// ---------------------------------------------------------------------------
// 0182: THE ROW IS LOCKED AND THE BYTES ARE NOT
// ---------------------------------------------------------------------------
//
// Everything above runs on a chain that STOPS AT 0133, and deliberately: those
// assertions were measured against that fixture and adding four files under
// them would change the world every one of them reads. 0182 therefore brings
// its own database, seeded by `seed0182()` below.
//
// THE CHAIN IT BRINGS, and why each file is in it (prompt 0054 found all four
// and this bundle inherits the finding):
//
//   0109  the SCHEDULED-posting gate that lives inside the function a student
//         actually calls. Numerically BEFORE 0133, so it sits in numeric place
//         and not at the end.
//   0134  the conflict-tolerant `classroom_open_submission`. THIS is the
//         function a student reaches, not 0133's; 0133 made student uploads
//         concurrent and 0134 is the repair.
//   0135  a SECOND permissive select policy on `storage.objects`. A permissive
//         policy is OR'd with every other permissive policy on the table, so
//         "does 0135 widen submission-files" is a question only a chain
//         carrying 0135 can answer.
//   0137  the anon EXECUTE sweep, in numeric place AND REPEATED LAST. Repeated
//         because 0160, 0171 and 0182 each create or replace a function after
//         it, which under a hosted project's default privileges hands each one
//         a fresh `anon` grant; production re-runs the sweep by hand after such
//         a file. Running it after 0182 is also the one thing that could break
//         this bundle -- a function named in an RLS `using` clause is evaluated
//         as the QUERYING role, so a sweep that took `authenticated` off the
//         new predicate would not narrow the delete, it would break it. That is
//         the 0070 lesson 0109 writes down, and it is asserted below rather
//         than assumed.
//   0160  submitting unfinished work is accepted, which changes what
//         `classroom_submit_assignment` returns.
//   0171  extra credit, the last classroom migration before this one.
//
// 0182 itself sits in numeric place, so the chain here is the paste order an
// operator will actually use.

const MIGRATIONS_0182 = [
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
	'0182_classroom_submission_object_lock.sql',
	'0137_anon_execute_sweep.sql'
] as const;

/** The chain WITHOUT 0182, for the mutation runs, which apply it themselves. */
const MIGRATIONS_PRE_0182 = MIGRATIONS_0182.filter(
	(f) => f !== '0182_classroom_submission_object_lock.sql'
).slice(0, -1);

const MIGRATION_0182_PATH = join(
	fileURLToPath(new URL('..', import.meta.url)),
	'supabase',
	'migrations',
	'0182_classroom_submission_object_lock.sql'
);

interface World0182 {
	teacherA: SeededUser;
	teacherB: SeededUser;
	alice: SeededUser;
	bruno: SeededUser;
	p1: string;
	item: string;
	sub: string;
}

function rpcOn<T>(fix: TestDb, userId: string, call: string, params: unknown[] = []): Promise<T> {
	return fix.asUser(userId, async (q) => {
		const { rows } = await q<{ r: T }>(`select ${call} as r`, params);
		return rows[0].r;
	});
}

function putOn(fix: TestDb, userId: string, key: string) {
	return fix.asUser(userId, (q) =>
		q(`insert into storage.objects (bucket_id, name) values ('submission-files', $1)`, [key])
	);
}

async function delOn(fix: TestDb, userId: string, key: string): Promise<number> {
	return fix.asUser(userId, async (q) => {
		const res = await q(`delete from storage.objects where bucket_id = 'submission-files' and name = $1`, [key]);
		return res.rowCount ?? 0;
	});
}

async function seesOn(fix: TestDb, userId: string, key: string): Promise<number> {
	return fix.asUser(userId, async (q) => {
		const { rows } = await q<{ n: string }>(
			`select count(*)::text as n from storage.objects where bucket_id = 'submission-files' and name = $1`,
			[key]
		);
		return Number(rows[0].n);
	});
}

/** Attach a row naming an object, the way the record route does. */
function attachOn(fix: TestDb, userId: string, itemId: string, key: string) {
	return rpcOn<{ ok: boolean; reason?: string; file_id?: string }>(
		fix,
		userId,
		`public.classroom_add_submission_file($1::uuid, null, 'part.sldprt', 'application/octet-stream', 4096, null, null, $2)`,
		[itemId, key]
	);
}

/** The RPC the DELETE route calls, resolved from the key the way the route's row read does. */
function deleteRowOn(fix: TestDb, userId: string, key: string) {
	return rpcOn<{ ok: boolean; reason?: string; orphaned?: boolean; storage_key?: string | null }>(
		fix,
		userId,
		`public.classroom_delete_submission_file(
			(select id from public.classroom_submission_files where storage_key = $1))`,
		[key]
	);
}

/**
 * A world with one published assignment in P1 and alice's submission open on
 * it. Rebuilt per database, because every mutation run gets its own.
 */
async function seed0182(fix: TestDb): Promise<World0182> {
	await fix.sql(`grant select, insert, update, delete on storage.objects to authenticated, service_role`);
	await fix.sql(`grant select on storage.buckets to authenticated, anon, service_role`);

	await createUser(fix, 'apina@boscotech.edu', 'Site Owner');
	const tA = await createUser(fix, 'tvargas@boscotech.edu', 'T. Vargas');
	const tB = await createUser(fix, 'mreed@boscotech.edu', 'M. Reed');
	const a = await createUser(fix, 'alice@boscotech.net', 'Alice Alvarez');
	const b = await createUser(fix, 'bruno@boscotech.net', 'Bruno Baptiste');

	const courseId = (
		await rpcOn<{ course_id: string }>(fix, tA.id, 'public.classroom_upsert_course($1, $2)', [
			'IDEA100',
			'Intro to Engineering Design'
		])
	).course_id;
	const section = (
		await rpcOn<{ section_id: string }>(fix, tA.id, 'public.classroom_upsert_section($1::uuid, $2, $3)', [
			courseId,
			'Period 1',
			'Block A'
		])
	).section_id;
	for (const [student, name] of [
		[a, 'Alice Alvarez'],
		[b, 'Bruno Baptiste']
	] as const) {
		await rpcOn(fix, tA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			section,
			student.email,
			name,
			true
		]);
	}

	const itemId = (
		await rpcOn<{ item_id: string }>(
			fix,
			tA.id,
			`public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => 'Bracket hand-in',
				p_body => 'Turn it in.', p_points => 30, p_published => true, p_body_doc => null::jsonb)`,
			[[section]]
		)
	).item_id;
	const submission =
		(await rpcOn<{ submission_id: string }>(fix, a.id, 'public.classroom_open_submission($1::uuid)', [itemId]))
			.submission_id ?? '';

	return { teacherA: tA, teacherB: tB, alice: a, bruno: b, p1: section, item: itemId, sub: submission };
}

describe('0182 the delete asymmetry, closed', () => {
	let fix: TestDb;
	let w: World0182;
	const keyUnder = (submissionId: string) => `${submissionId}/${randomUUID()}.sldprt`;

	beforeAll(async () => {
		fix = await startTestDb(MIGRATIONS_0182);
		w = await seed0182(fix);
	}, 240_000);

	afterAll(async () => {
		await fix?.stop();
	});

	// -------------------------------------------------------------------
	// The grants, first, because everything below is worthless if the
	// trailing 0137 took the predicate away.
	// -------------------------------------------------------------------

	test('the two predicates survive the trailing 0137 sweep with exactly the reach 0182 gave them', async () => {
		const { rows } = await fix.sql<{ fn: string; anon: boolean; auth: boolean }>(
			`select fn,
			        has_function_privilege('anon', fn, 'execute') as anon,
			        has_function_privilege('authenticated', fn, 'execute') as auth
			   from (values
			     ('public.classroom_submission_object_is_locked(text)'),
			     ('public.classroom_submission_prefix_is_locked(text)'),
			     ('public._classroom_submission_is_locked(uuid)')
			   ) as t(fn)`
		);
		const byName = Object.fromEntries(rows.map((r) => [r.fn, r]));

		// The two named inside an RLS `using`/`with check` MUST keep
		// `authenticated`, or the sweep breaks the read rather than narrowing it.
		expect(byName['public.classroom_submission_object_is_locked(text)'].auth).toBe(true);
		expect(byName['public.classroom_submission_prefix_is_locked(text)'].auth).toBe(true);
		// The private state helper is called only from inside those two, whose
		// bodies run as the owner, so it needs no grant at all.
		expect(byName['public._classroom_submission_is_locked(uuid)'].auth).toBe(false);
		// And none of the three is reachable signed out. This is the assertion
		// that would have passed VACUOUSLY before the stub carried the hosted
		// default privileges; it does not now.
		for (const r of rows) expect(r.anon, `${r.fn} anon`).toBe(false);
	});

	// -------------------------------------------------------------------
	// The four cases the policy has to get right
	// -------------------------------------------------------------------

	test('1. a DRAFT hand-in: the row goes and so do the bytes', async () => {
		const key = keyUnder(w.sub);
		await putOn(fix, w.alice.id, key);
		expect((await attachOn(fix, w.alice.id, w.item, key)).ok).toBe(true);

		// Through the RPC, which is what the route does, and then the object
		// sweep the route runs behind it. The RPC deletes the ROW first and
		// hands the key back, which is precisely why a row-keyed predicate lets
		// the sweep through.
		const del = await deleteRowOn(fix, w.alice.id, key);
		expect(del.ok).toBe(true);
		expect(del.orphaned).toBe(true);
		expect(del.storage_key).toBe(key);
		expect(await delOn(fix, w.alice.id, key), 'objects removed').toBe(1);
	});

	test('2. THE ORPHAN SWEEP STILL LANDS, which is what rules out the one-line narrowing', async () => {
		// The shipped shape, in the one case it exists for: bytes up while the
		// work was still open, the record refused because it was turned in
		// meanwhile, and the student's OWN client removing what it just put
		// there. No row ever named this object. A submission-keyed narrowing
		// would refuse this and leave an orphan behind every time.
		const kept = keyUnder(w.sub);
		await putOn(fix, w.alice.id, kept);
		expect((await attachOn(fix, w.alice.id, w.item, kept)).ok).toBe(true);
		expect((await rpcOn<{ ok: boolean }>(fix, w.alice.id, 'public.classroom_submit_assignment($1::uuid)', [w.item])).ok).toBe(true);

		// The object is planted as the connection owner, because the INSERT half
		// now refuses a student writing into a submitted prefix (case 5) -- which
		// is the whole point of it. What is under test here is the DELETE, and
		// the state it has to cope with is an orphan that already exists: one
		// left by a signed upload URL minted while the work was still a draft.
		const orphan = keyUnder(w.sub);
		await fix.sql(`insert into storage.objects (bucket_id, name) values ('submission-files', $1)`, [orphan]);

		const refused = await attachOn(fix, w.alice.id, w.item, orphan);
		expect(refused.ok).toBe(false);
		expect(refused.reason).toBe('locked');

		expect(await delOn(fix, w.alice.id, orphan), 'the sweep').toBe(1);
		// And the object the row DOES name is untouched by that sweep.
		expect(await seesOn(fix, w.alice.id, kept)).toBe(1);
	});

	test('3. a SUBMITTED hand-in: the row refuses AND so do the bytes', async () => {
		const { rows } = await fix.sql<{ storage_key: string }>(
			`select sf.storage_key from public.classroom_submission_files sf
			   join public.classroom_submissions s on s.id = sf.submission_id
			  where s.id = $1 and s.state = 'submitted' and sf.storage_key is not null`,
			[w.sub]
		);
		expect(rows.length).toBe(1);
		const locked = rows[0].storage_key;

		// The half that was already right.
		const del = await deleteRowOn(fix, w.alice.id, locked);
		expect(del.ok).toBe(false);
		expect(del.reason).toBe('locked');

		// The half this bundle closes. 0 rows: RLS refused, silently, exactly as
		// it does for another student's object.
		expect(await delOn(fix, w.alice.id, locked), 'bytes removed by the student').toBe(0);

		// AND THE POINT OF LOCKING IT: the teacher still reads it, and the row
		// still names bytes that are there.
		expect(await seesOn(fix, w.teacherA.id, locked), 'teacher reads the object').toBe(1);
		expect(await seesOn(fix, w.alice.id, locked), 'the student still reads it too').toBe(1);
	});

	test('4. releasing the grade hands the bytes back, in step with the attach', async () => {
		const { rows } = await fix.sql<{ storage_key: string }>(
			`select storage_key from public.classroom_submission_files
			  where submission_id = $1 and storage_key is not null limit 1`,
			[w.sub]
		);
		const key = rows[0].storage_key;
		expect(await delOn(fix, w.alice.id, key), 'still refused while submitted').toBe(0);

		// `returned` is "graded and released (editable again for resubmission)"
		// on 0086's own column comment. The attach reopens there and the bytes
		// have to reopen with it, or the two halves disagree in the other
		// direction.
		await fix.sql(`update public.classroom_submissions set state = 'returned' where id = $1`, [w.sub]);
		expect(await delOn(fix, w.alice.id, key), 'after release').toBe(1);
	});

	test('5. the INSERT half: bytes cannot ARRIVE at a hand-in the teacher is holding', async () => {
		// A2's twin, measured on the unpatched tree before this file existed:
		// the insert policy was ownership-only, so a student could put bytes into
		// their own prefix on a turned-in hand-in. It bought them nothing, but
		// one rule stated in one half is how the delete half came to be
		// forgotten, so both halves say it now.
		const fresh = (
			await rpcOn<{ item_id: string }>(
				fix,
				w.teacherA.id,
				`public.classroom_create_item(
					p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => 'Insert half',
					p_body => 'Turn it in.', p_points => 10, p_published => true, p_body_doc => null::jsonb)`,
				[[w.p1]]
			)
		).item_id;
		const sub2 =
			(await rpcOn<{ submission_id: string }>(fix, w.alice.id, 'public.classroom_open_submission($1::uuid)', [fresh]))
				.submission_id ?? '';

		// THE POSITIVE CONTROL, TAKEN FIRST AND ON THE SAME PREFIX: while it is a
		// draft the identical statement lands. So the 0 below is the state and
		// not the prefix, the bucket or a missing grant.
		const draftKey = `${sub2}/${randomUUID()}.sldprt`;
		await putOn(fix, w.alice.id, draftKey);
		expect(await seesOn(fix, w.alice.id, draftKey), 'draft control').toBe(1);

		// A row has to name it, or `classroom_submit_assignment` refuses the
		// whole hand-in with `nothing_attached` and there is no submitted state
		// to measure the insert against.
		expect((await attachOn(fix, w.alice.id, fresh, draftKey)).ok).toBe(true);
		expect((await rpcOn<{ ok: boolean }>(fix, w.alice.id, 'public.classroom_submit_assignment($1::uuid)', [fresh])).ok).toBe(true);

		const afterKey = `${sub2}/${randomUUID()}.sldprt`;
		const err = await captureError(() => putOn(fix, w.alice.id, afterKey));
		expect(err.message).toMatch(/row-level security/i);
		expect(await seesOn(fix, w.alice.id, afterKey), 'nothing landed').toBe(0);
	});

	// -------------------------------------------------------------------
	// The two halves of "locked" have to keep agreeing. That is the whole
	// defect, and nothing structural holds them together: the RPC's
	// `v_state = 'submitted'` lives in 0133 and the policy's lives in
	// 0182's `_classroom_submission_is_locked`. So it is measured, in
	// every state, in both directions.
	// -------------------------------------------------------------------

	test('the ROW refusal and the BYTES refusal agree in all three states', async () => {
		const item = (
			await rpcOn<{ item_id: string }>(
				fix,
				w.teacherA.id,
				`public.classroom_create_item(
					p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => 'State agreement',
					p_body => 'Turn it in.', p_points => 10, p_published => true, p_body_doc => null::jsonb)`,
				[[w.p1]]
			)
		).item_id;
		const sub =
			(await rpcOn<{ submission_id: string }>(fix, w.alice.id, 'public.classroom_open_submission($1::uuid)', [item]))
				.submission_id ?? '';

		const observed: Record<string, { row: boolean; bytes: boolean }> = {};
		for (const state of ['draft', 'submitted', 'returned'] as const) {
			const key = `${sub}/${randomUUID()}.sldprt`;
			// Planted as the owner so the INSERT half (case 5) is not what is
			// being measured here; this test is about the two REFUSALS.
			await fix.sql(`insert into storage.objects (bucket_id, name) values ('submission-files', $1)`, [key]);
			await fix.sql(
				`insert into public.classroom_submission_files (submission_id, storage_key, filename, mime_type, size_bytes)
				 values ($1, $2, 'part.sldprt', 'application/octet-stream', 10)`,
				[sub, key]
			);
			await fix.sql(`update public.classroom_submissions set state = $2 where id = $1`, [sub, state]);

			const row = await deleteRowOn(fix, w.alice.id, key);
			const rowRefused = row.ok === false;
			// Re-plant the row when the RPC removed it, so the bytes question is
			// asked about the same world in both cases.
			if (!rowRefused) {
				await fix.sql(
					`insert into public.classroom_submission_files (submission_id, storage_key, filename, mime_type, size_bytes)
					 values ($1, $2, 'part.sldprt', 'application/octet-stream', 10)`,
					[sub, key]
				);
			}
			const bytesRefused = (await delOn(fix, w.alice.id, key)) === 0;
			observed[state] = { row: rowRefused, bytes: bytesRefused };
		}

		// Stated as the table rather than as a loop of `toBe(x.row)`, so a run
		// where BOTH halves are wrong in the same direction cannot pass.
		expect(observed).toEqual({
			draft: { row: false, bytes: false },
			submitted: { row: true, bytes: true },
			returned: { row: false, bytes: false }
		});
	});

	test('no other bucket was narrowed, and the SELECT policy did not move', async () => {
		const { rows } = await fix.sql<{ policyname: string; cmd: string; expr: string }>(
			`select policyname, cmd, coalesce(qual, '') || coalesce(with_check, '') as expr
			   from pg_policies
			  where schemaname = 'storage' and tablename = 'objects'
			  order by policyname`
		);
		// POSITIVE CONTROL: there are policies to look at.
		expect(rows.length).toBeGreaterThan(6);
		const naming = rows.filter((r) => r.expr.includes('_is_locked')).map((r) => r.policyname);
		expect(naming.sort()).toEqual([
			'submission files delete own submission',
			'submission files insert own submission'
		]);
		// The read is untouched: a teacher must keep reading a locked hand-in,
		// which is the entire point of it being locked.
		const read = rows.find((r) => r.policyname === 'submission files readable by owner or reviewer');
		expect(read?.expr).toContain('classroom_can_read_submission_object');
		expect(read?.expr).not.toContain('_is_locked');
		// And still no UPDATE policy on either classroom bucket.
		expect(rows.filter((r) => r.cmd === 'UPDATE' && r.expr.includes('submission-files'))).toHaveLength(0);
	});

	test('0182 re-applies: pasting it a second time is a no-op, not a 2BP01', async () => {
		await fix.sql(readFileSync(MIGRATION_0182_PATH, 'utf8'));
		const { rows } = await fix.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			  where schemaname = 'storage' and tablename = 'objects'
			    and policyname like 'submission files %'`
		);
		expect(Number(rows[0].n)).toBe(3);
		// And it still behaves: the submitted case from test 3 is `returned` by
		// now, so take a fresh one.
		const { rows: st } = await fix.sql<{ state: string }>(
			`select state from public.classroom_submissions where id = $1`,
			[w.sub]
		);
		expect(st[0].state).toBe('returned');
	});
});

// ---------------------------------------------------------------------------
// 0182: the mutation controls
// ---------------------------------------------------------------------------
//
// Five denials and permissions above, each put to a database whose own clause
// has been opened in the PERMISSIVE direction, and each confirmed to FLIP. A
// policy that has never been seen to fail is a policy nobody has tested: a
// mistyped bucket name, a predicate that always answers false and a missing
// grant all produce the same clean pass.
//
// THE MUTATION IS MADE TO THE FILE'S TEXT IN MEMORY, NOT TO THE FILE ON DISK.
// `mutate()` reads `0182_...sql`, asserts the substring it is about to rewrite
// occurs EXACTLY ONCE (a `replace()` that matched nothing returns the original
// string happily, which is a mutation run that proves nothing), and applies the
// rewritten TEXT to a database built from the chain WITHOUT 0182. So what is
// under test is the shipped file's own bytes, exactly as an on-disk mutation
// would test them, with nothing on disk ever written -- there is no window in
// which a crashed run leaves a mutant in `supabase/migrations/`, and no
// `cp`-and-restore step that could put back the wrong thing. The guarantee that
// step exists to give is asserted directly instead: the file's md5 is taken
// before the first mutation and after the last, and the two must match.
//
// THE ORDER MATTERS AND IS THE PRODUCTION ONE. The mutant is applied where 0182
// goes, and 0137 is re-run over it afterwards, which is what an operator does
// by hand after applying a file that creates functions.

const MIGRATION_0137_PATH = join(
	fileURLToPath(new URL('..', import.meta.url)),
	'supabase',
	'migrations',
	'0137_anon_execute_sweep.sql'
);

function migration0182Text(): string {
	return readFileSync(MIGRATION_0182_PATH, 'utf8');
}

function md5Of(path: string): string {
	return createHash('md5').update(readFileSync(path)).digest('hex');
}

/**
 * One clause of the shipped file, opened. Asserts the target occurs exactly
 * once BEFORE rewriting it, so a mutation that silently matched nothing cannot
 * pass for a mutation that changed nothing.
 */
function mutate(target: string, replacement: string): string {
	const text = migration0182Text();
	const hits = text.split(target).length - 1;
	if (hits !== 1) {
		throw new Error(`mutation target occurs ${hits} times, expected exactly 1: ${JSON.stringify(target.slice(0, 60))}`);
	}
	return text.replace(target, replacement);
}

/** A database carrying the chain up to 0171, then this text where 0182 goes, then 0137 again. */
async function dbWith0182Text(text: string): Promise<{ fix: TestDb; w: World0182 }> {
	const fix = await startTestDb(MIGRATIONS_PRE_0182);
	const w = await seed0182(fix);
	await fix.sql(text);
	await fix.sql(readFileSync(MIGRATION_0137_PATH, 'utf8'));
	return { fix, w };
}

/** Turn in a hand-in with one file on it, and hand back that file's key. */
async function submittedWithFile(fix: TestDb, w: World0182): Promise<string> {
	const key = `${w.sub}/${randomUUID()}.sldprt`;
	await putOn(fix, w.alice.id, key);
	const added = await attachOn(fix, w.alice.id, w.item, key);
	if (!added.ok) throw new Error(`attach failed: ${JSON.stringify(added)}`);
	const sent = await rpcOn<{ ok: boolean; reason?: string }>(
		fix,
		w.alice.id,
		'public.classroom_submit_assignment($1::uuid)',
		[w.item]
	);
	if (!sent.ok) throw new Error(`submit failed: ${JSON.stringify(sent)}`);
	return key;
}

describe('0182 mutation controls: each case flips when its own clause is opened', () => {
	const before = md5Of(MIGRATION_0182_PATH);

	afterAll(() => {
		// The guarantee a cp-and-restore step exists to give, asserted rather
		// than performed: nothing in this describe wrote the file.
		expect(md5Of(MIGRATION_0182_PATH), 'the shipped migration is byte-identical').toBe(before);
	});

	test('1. THE SUBMITTED-BYTES REFUSAL: with the row predicate opened, the student destroys their turned-in work again', async () => {
		// `p_name is null` rather than `false`: a constant conjunct is folded
		// away by the planner and the function call can vanish from the stored
		// policy expression with it, which would trip 0182's own self-check and
		// report an apply failure instead of a flipped case.
		const { fix, w } = await dbWith0182Text(
			mutate('\t\twhere sf.storage_key = p_name\n', '\t\twhere sf.storage_key = p_name and p_name is null\n')
		);
		try {
			const key = await submittedWithFile(fix, w);
			// The ROW half still refuses, which is what says the two halves are
			// genuinely independent and this mutation opened only one of them.
			expect((await deleteRowOn(fix, w.alice.id, key)).reason).toBe('locked');
			// And the bytes go, which is the defect, reproduced on demand.
			expect(await delOn(fix, w.alice.id, key), 'bytes removed with the clause opened').toBe(1);
			expect(await seesOn(fix, w.teacherA.id, key), 'what the teacher reads afterwards').toBe(0);
		} finally {
			await fix.stop();
		}
	}, 240_000);

	test('2. THE ORPHAN SWEEP: with the predicate keyed on the SUBMISSION instead of the ROW, the sweep is refused', async () => {
		// This is the one-line narrowing 0054 ruled out, applied, so the claim
		// that it breaks the shipped upload path is a measurement and not an
		// argument.
		const { fix, w } = await dbWith0182Text(
			mutate(
				'\tselect exists (\n\t\tselect 1\n\t\tfrom public.classroom_submission_files sf\n\t\twhere sf.storage_key = p_name\n\t\t\tand public._classroom_submission_is_locked(sf.submission_id)\n\t);',
				'\tselect public._classroom_submission_is_locked(public._classroom_storage_prefix_uuid(p_name));'
			)
		);
		try {
			await submittedWithFile(fix, w);
			const orphan = `${w.sub}/${randomUUID()}.sldprt`;
			await fix.sql(`insert into storage.objects (bucket_id, name) values ('submission-files', $1)`, [orphan]);
			expect((await attachOn(fix, w.alice.id, w.item, orphan)).reason).toBe('locked');
			// 0 rows: the sweep the route runs on the student's own client in
			// exactly this case is refused, and the orphan stays for good.
			expect(await delOn(fix, w.alice.id, orphan), 'the sweep under the wrong predicate').toBe(0);
			expect(await seesOn(fix, w.alice.id, orphan), 'the orphan that would be left behind').toBe(1);
		} finally {
			await fix.stop();
		}
	}, 240_000);

	test('3. THE DRAFT CASE: with `draft` added to the locked states, open work stops working', async () => {
		// A RESTRICTIVE mutation, deliberately. Controls 1 and 5 prove a DENIAL
		// and are opened permissively, per the verification standard; controls 2,
		// 3 and 4 prove a PERMISSION, and the only mutation that can flip one of
		// those is one that takes it away.
		const { fix, w } = await dbWith0182Text(
			mutate(
				"\t\twhere s.id = p_submission_id\n\t\t\tand s.state = 'submitted'\n",
				"\t\twhere s.id = p_submission_id\n\t\t\tand s.state in ('draft', 'submitted')\n"
			)
		);
		try {
			const key = `${w.sub}/${randomUUID()}.sldprt`;
			// IT BREAKS AT THE FIRST STEP: the shared state helper is read by BOTH
			// predicates, so locking `draft` shuts the insert half too and a student
			// cannot put a file on open work at all. That is the flip, and it is also
			// what says the two halves really do read ONE statement of "locked"
			// rather than two that happen to agree.
			const err = await captureError(() => putOn(fix, w.alice.id, key));
			expect(err.message).toMatch(/row-level security/i);

			// And the delete half is shut with it. Planted as the connection owner,
			// since the insert above is now refused, and measured while the row is
			// still live -- in the shipped flow `classroom_delete_submission_file`
			// removes the row BEFORE the route sweeps, so a draft's bytes are always
			// swept as an object no row names. This is the same question asked one
			// step earlier, and it is the one a student hitting storage directly
			// would ask.
			await fix.sql(`insert into storage.objects (bucket_id, name) values ('submission-files', $1)`, [key]);
			await fix.sql(
				`insert into public.classroom_submission_files (submission_id, storage_key, filename, mime_type, size_bytes)
				 values ($1, $2, 'part.sldprt', 'application/octet-stream', 10)`,
				[w.sub, key]
			);
			expect(await delOn(fix, w.alice.id, key), 'a draft hand-in with the clause widened').toBe(0);
		} finally {
			await fix.stop();
		}
	}, 240_000);

	test('4. THE RELEASE: with `returned` added to the locked states, releasing the grade does NOT hand the bytes back', async () => {
		const { fix, w } = await dbWith0182Text(
			mutate(
				"\t\twhere s.id = p_submission_id\n\t\t\tand s.state = 'submitted'\n",
				"\t\twhere s.id = p_submission_id\n\t\t\tand s.state in ('submitted', 'returned')\n"
			)
		);
		try {
			const key = await submittedWithFile(fix, w);
			expect(await delOn(fix, w.alice.id, key), 'while submitted').toBe(0);
			await fix.sql(`update public.classroom_submissions set state = 'returned' where id = $1`, [w.sub]);
			// 0 where the shipped file gives 1: a student handed feedback could
			// not replace the file they were told to fix.
			expect(await delOn(fix, w.alice.id, key), 'after release, with the clause widened').toBe(0);
		} finally {
			await fix.stop();
		}
	}, 240_000);

	test('5. THE INSERT HALF: with the prefix predicate opened, bytes land on a turned-in hand-in again', async () => {
		const { fix, w } = await dbWith0182Text(
			mutate(
				'\tselect public._classroom_submission_is_locked(\n\t\tpublic._classroom_storage_prefix_uuid(p_name)\n\t);',
				'\tselect (p_name is null);'
			)
		);
		try {
			await submittedWithFile(fix, w);
			const stray = `${w.sub}/${randomUUID()}.sldprt`;
			await putOn(fix, w.alice.id, stray);
			expect(await seesOn(fix, w.alice.id, stray), 'bytes landed with the clause opened').toBe(1);
			// And the delete half is still shut, which says the two predicates
			// are independent and this mutation opened exactly one of them.
			const key = (
				await fix.sql<{ storage_key: string }>(
					`select sf.storage_key from public.classroom_submission_files sf
					   join public.classroom_submissions s on s.id = sf.submission_id
					  where s.id = $1 and s.state = 'submitted' and sf.storage_key is not null limit 1`,
					[w.sub]
				)
			).rows[0].storage_key;
			expect(await delOn(fix, w.alice.id, key), 'the delete half, still shut').toBe(0);
		} finally {
			await fix.stop();
		}
	}, 240_000);
});
