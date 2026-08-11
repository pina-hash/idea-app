// tests/classroom-canonical.test.ts
//
// What the canonical-plus-postings model PROMISES, against a real Postgres.
// Its companion, classroom-security.test.ts, pins who may see what; this one
// pins the behaviour that model exists to deliver -- and every guarantee here
// fails silently if it regresses. A teacher fixing a typo in Period 1 and not
// in Period 2 does not see an error; they see a class that quietly still has
// the typo, which is exactly what 0085 was written to end.
//
//   1. ONE canonical record: an edit from any surface reaches every class the
//      item is posted to, and publishing a draft publishes it everywhere.
//   2. Unlink isolation: removing a class removes THAT posting and nothing
//      else, the content survives for the classes that still hold it, and the
//      last posting is refused rather than orphaning the item.
//   3. Duplication makes a genuinely INDEPENDENT draft that carries its
//      attachments by reference (no re-upload) and does not share state.
//   4. The student write path (mark-viewed) cannot touch another student's row,
//      because it has no parameter with which to name one.
//   5. Feedback: a signed-in user inserts only their OWN row; the console read
//      and the status move are admin-only.
//   6. Pin and reorder are NOT content edits, so neither raises an "Updated"
//      badge -- the thing that makes the badge worth trusting.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql'
] as const;

let db: TestDb;
let owner: SeededUser;
let teacher: SeededUser;
let studentA: SeededUser;
let studentB: SeededUser;
let courseId: string;
let p1: string;
let p2: string;

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

function createItem(
	userId: string,
	kind: 'post' | 'assignment' | 'material',
	sectionIds: string[],
	opts: {
		title?: string | null;
		body?: string;
		points?: number | null;
		dueAt?: string | null;
		category?: string | null;
		published?: boolean;
		links?: { label: string; url: string }[];
	} = {}
): Promise<{ item_id: string; section_ids: string[]; published: boolean }> {
	return rpc(
		userId,
		'public.classroom_create_item($1, $2::uuid[], $3, $4, $5, $6::timestamptz, $7, $8, $9::jsonb, false)',
		[
			kind,
			sectionIds,
			opts.title ?? null,
			opts.body ?? '',
			opts.points ?? null,
			opts.dueAt ?? null,
			opts.category ?? null,
			opts.published ?? true,
			JSON.stringify(opts.links ?? [])
		]
	);
}

function updateItem(
	userId: string,
	id: string,
	opts: {
		title?: string | null;
		body?: string;
		points?: number | null;
		dueAt?: string | null;
		category?: string | null;
		published?: boolean | null;
		resources?: { label: string; url: string }[] | null;
	} = {}
): Promise<{ item_id: string; published: boolean; edited: boolean }> {
	return rpc(
		userId,
		'public.classroom_update_item($1::uuid, $2, $3, $4, $5::timestamptz, $6, $7, $8::jsonb)',
		[
			id,
			opts.title ?? null,
			opts.body ?? '',
			opts.points ?? null,
			opts.dueAt ?? null,
			opts.category ?? null,
			opts.published ?? null,
			opts.resources === undefined || opts.resources === null ? null : JSON.stringify(opts.resources)
		]
	);
}

/** What a student would actually read in one class, RLS and all. */
async function studentSees(
	userId: string,
	sectionId: string
): Promise<{ id: string; title: string | null; body: string }[]> {
	const { rows } = await db.asUser(userId, (q) =>
		q<{ id: string; title: string | null; body: string }>(
			`select i.id, i.title, i.body
			 from public.classroom_items i
			 join public.classroom_postings p on p.item_id = i.id
			 where p.section_id = $1
			 order by i.created_at`,
			[sectionId]
		)
	);
	return rows;
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	studentA = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	studentB = await createUser(db, 'bruno@boscotech.net', 'Bruno Baptiste');

	courseId = (
		await rpc<{ course_id: string }>(teacher.id, 'public.classroom_upsert_course($1, $2)', [
			'IDEA100',
			'Intro to Engineering Design'
		])
	).course_id;
	p1 = (
		await rpc<{ section_id: string }>(teacher.id, 'public.classroom_upsert_section($1::uuid, $2)', [
			courseId,
			'Period 1'
		])
	).section_id;
	p2 = (
		await rpc<{ section_id: string }>(teacher.id, 'public.classroom_upsert_section($1::uuid, $2)', [
			courseId,
			'Period 2'
		])
	).section_id;

	// One student in each class, so "did the other class see it" is a real read
	// by a real account rather than an admin peeking.
	await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3)', [
		p1,
		studentA.email,
		'Alice Alvarez'
	]);
	await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3)', [
		p2,
		studentB.email,
		'Bruno Baptiste'
	]);
}, 240_000);

afterAll(async () => {
	await db.stop();
});

describe('one canonical record across every class', () => {
	test('a multi-class publish makes ONE item and one posting per class', async () => {
		const made = await createItem(teacher.id, 'assignment', [p1, p2], {
			title: 'Bridge sketch',
			body: 'Original instructions.',
			points: 20
		});
		const { rows } = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.classroom_postings where item_id = $1',
			[made.item_id]
		);
		expect(rows[0].n).toBe('2');
		const items = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.classroom_items where title = $1',
			['Bridge sketch']
		);
		expect(items.rows[0].n).toBe('1');
	});

	test('an edit is visible in EVERY class at once -- the whole point', async () => {
		const made = await createItem(teacher.id, 'post', [p1, p2], { body: 'Origianl typo.' });

		expect((await studentSees(studentA.id, p1)).find((i) => i.id === made.item_id)?.body).toBe(
			'Origianl typo.'
		);
		expect((await studentSees(studentB.id, p2)).find((i) => i.id === made.item_id)?.body).toBe(
			'Origianl typo.'
		);

		await updateItem(teacher.id, made.item_id, { body: 'Original, spelled correctly.' });

		// The decisive assertion: the SECOND class's student, who was never
		// touched by the edit call, reads the new text.
		expect((await studentSees(studentB.id, p2)).find((i) => i.id === made.item_id)?.body).toBe(
			'Original, spelled correctly.'
		);
		expect((await studentSees(studentA.id, p1)).find((i) => i.id === made.item_id)?.body).toBe(
			'Original, spelled correctly.'
		);
	});

	test('publishing a draft publishes it in every class it is posted to', async () => {
		const draft = await createItem(teacher.id, 'assignment', [p1, p2], {
			title: 'Held back',
			published: false
		});
		expect(await studentSees(studentA.id, p1)).not.toContainEqual(
			expect.objectContaining({ id: draft.item_id })
		);
		expect(await studentSees(studentB.id, p2)).not.toContainEqual(
			expect.objectContaining({ id: draft.item_id })
		);

		await updateItem(teacher.id, draft.item_id, { title: 'Held back', published: true });

		expect((await studentSees(studentA.id, p1)).map((i) => i.id)).toContain(draft.item_id);
		expect((await studentSees(studentB.id, p2)).map((i) => i.id)).toContain(draft.item_id);
	});

	test('edited_at is stamped only by a CONTENT change to something already published', async () => {
		const draft = await createItem(teacher.id, 'assignment', [p1], {
			title: 'Edit tracking',
			body: 'v1',
			published: false
		});

		// Editing a draft is not an edit anyone missed.
		await updateItem(teacher.id, draft.item_id, { title: 'Edit tracking', body: 'v2' });
		let row = await db.sql<{ edited_at: string | null; first_published_at: string | null }>(
			'select edited_at, first_published_at from public.classroom_items where id = $1',
			[draft.item_id]
		);
		expect(row.rows[0].edited_at).toBeNull();
		expect(row.rows[0].first_published_at).toBeNull();

		// Publishing is not an edit either.
		await updateItem(teacher.id, draft.item_id, {
			title: 'Edit tracking',
			body: 'v2',
			published: true
		});
		row = await db.sql('select edited_at, first_published_at from public.classroom_items where id = $1', [
			draft.item_id
		]);
		expect(row.rows[0].edited_at).toBeNull();
		expect(row.rows[0].first_published_at).not.toBeNull();

		// Changing the text afterwards IS.
		await updateItem(teacher.id, draft.item_id, { title: 'Edit tracking', body: 'v3' });
		row = await db.sql('select edited_at, first_published_at from public.classroom_items where id = $1', [
			draft.item_id
		]);
		expect(row.rows[0].edited_at).not.toBeNull();
	});

	test('a pin and a reorder are NOT edits -- neither raises an Updated badge', async () => {
		const made = await createItem(teacher.id, 'assignment', [p1], {
			title: 'Not an edit',
			body: 'stable'
		});
		await rpc(teacher.id, 'public.classroom_set_item_pinned($1::uuid, true)', [made.item_id]);
		await rpc(teacher.id, 'public.classroom_set_item_order($1::uuid[])', [[made.item_id]]);

		const { rows } = await db.sql<{ edited_at: string | null; pinned: boolean; sort_order: number }>(
			'select edited_at, pinned, sort_order from public.classroom_items where id = $1',
			[made.item_id]
		);
		expect(rows[0].pinned).toBe(true);
		expect(rows[0].sort_order).toBe(1);
		expect(rows[0].edited_at).toBeNull();
	});
});

describe('linkage', () => {
	test('a class can be added later, and the item arrives with its links intact', async () => {
		const made = await createItem(teacher.id, 'material', [p1], {
			title: 'Syllabus',
			body: 'Read this.',
			links: [{ label: 'PDF', url: 'https://example.com/syllabus' }]
		});
		expect((await studentSees(studentB.id, p2)).map((i) => i.id)).not.toContain(made.item_id);

		const added = await rpc<{ added: number }>(
			teacher.id,
			'public.classroom_add_postings($1::uuid, $2::uuid[])',
			[made.item_id, [p2]]
		);
		expect(added.added).toBe(1);
		expect((await studentSees(studentB.id, p2)).map((i) => i.id)).toContain(made.item_id);

		const links = await db.asUser(studentB.id, (q) =>
			q<{ label: string }>('select label from public.classroom_item_resources where item_id = $1', [
				made.item_id
			])
		);
		expect(links.rows.map((r) => r.label)).toEqual(['PDF']);

		// Re-adding the same class is a no-op, not a duplicate posting.
		const again = await rpc<{ added: number }>(
			teacher.id,
			'public.classroom_add_postings($1::uuid, $2::uuid[])',
			[made.item_id, [p2]]
		);
		expect(again.added).toBe(0);
		const count = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.classroom_postings where item_id = $1',
			[made.item_id]
		);
		expect(count.rows[0].n).toBe('2');
	});

	test('UNLINK removes that posting only -- the content survives for the others', async () => {
		const made = await createItem(teacher.id, 'post', [p1, p2], { body: 'Shared notice.' });
		expect((await studentSees(studentB.id, p2)).map((i) => i.id)).toContain(made.item_id);

		const res = await rpc<{ ok: boolean; remaining: number }>(
			teacher.id,
			'public.classroom_remove_posting($1::uuid, $2::uuid)',
			[made.item_id, p2]
		);
		expect(res.ok).toBe(true);
		expect(res.remaining).toBe(1);

		// Gone from the unlinked class...
		expect((await studentSees(studentB.id, p2)).map((i) => i.id)).not.toContain(made.item_id);
		// ...and completely untouched in the one that still holds it.
		const survivor = (await studentSees(studentA.id, p1)).find((i) => i.id === made.item_id);
		expect(survivor?.body).toBe('Shared notice.');
		const stillThere = await db.sql('select id from public.classroom_items where id = $1', [
			made.item_id
		]);
		expect(stillThere.rows).toHaveLength(1);
	});

	test('unlinking the LAST class is refused rather than orphaning the item', async () => {
		const made = await createItem(teacher.id, 'post', [p1], { body: 'Only here.' });
		const res = await rpc<{ ok: boolean; reason: string }>(
			teacher.id,
			'public.classroom_remove_posting($1::uuid, $2::uuid)',
			[made.item_id, p1]
		);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('last_posting');

		const alive = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.classroom_postings where item_id = $1',
			[made.item_id]
		);
		expect(alive.rows[0].n).toBe('1');
	});
});

describe('duplication', () => {
	test('a copy is an INDEPENDENT draft that shares nothing with its source', async () => {
		const source = await createItem(teacher.id, 'assignment', [p1, p2], {
			title: 'Unit 3 lab',
			body: 'Do the lab.',
			points: 30,
			links: [{ label: 'Rubric', url: 'https://example.com/rubric' }]
		});
		await rpc(teacher.id, 'public.classroom_add_attachment($1::uuid, $2, $3, $4, $5::bigint)', [
			source.item_id,
			'drive-lab-1',
			'lab.pdf',
			'application/pdf',
			2048
		]);

		const copy = await rpc<{ ok: boolean; item_id: string }>(
			teacher.id,
			'public.classroom_duplicate_item($1::uuid)',
			[source.item_id]
		);
		expect(copy.item_id).not.toBe(source.item_id);

		const copied = await db.sql<{
			title: string;
			body: string;
			points: number;
			published: boolean;
			pinned: boolean;
		}>('select title, body, points, published, pinned from public.classroom_items where id = $1', [
			copy.item_id
		]);
		expect(copied.rows[0].title).toBe('Unit 3 lab (copy)');
		expect(copied.rows[0].body).toBe('Do the lab.');
		expect(copied.rows[0].points).toBe(30);
		// ALWAYS a draft: a copy is a starting point, not something to put in
		// front of a class the instant it is made.
		expect(copied.rows[0].published).toBe(false);
		expect(copied.rows[0].pinned).toBe(false);

		// Its own postings, its own links, its own attachment ROW...
		const postings = await db.sql<{ section_id: string }>(
			'select section_id from public.classroom_postings where item_id = $1 order by section_id',
			[copy.item_id]
		);
		expect(postings.rows).toHaveLength(2);

		const attachments = await db.sql<{ id: string; drive_file_id: string }>(
			'select id, drive_file_id from public.classroom_attachments where item_id = $1',
			[copy.item_id]
		);
		const sourceAttachments = await db.sql<{ id: string; drive_file_id: string }>(
			'select id, drive_file_id from public.classroom_attachments where item_id = $1',
			[source.item_id]
		);
		expect(attachments.rows).toHaveLength(1);
		expect(attachments.rows[0].id).not.toBe(sourceAttachments.rows[0].id);
		// ...pointing at the SAME bytes: carried over without a re-upload.
		expect(attachments.rows[0].drive_file_id).toBe('drive-lab-1');

		// Editing the copy leaves the source alone.
		await updateItem(teacher.id, copy.item_id, { title: 'Unit 4 lab', body: 'Different lab.' });
		const untouched = await db.sql<{ title: string; body: string }>(
			'select title, body from public.classroom_items where id = $1',
			[source.item_id]
		);
		expect(untouched.rows[0]).toEqual({ title: 'Unit 3 lab', body: 'Do the lab.' });

		// And deleting the copy does NOT report the shared blob as orphaned.
		const deleted = await rpc<{ orphaned_drive_file_ids: string[] }>(
			teacher.id,
			'public.classroom_delete_item($1::uuid)',
			[copy.item_id]
		);
		expect(deleted.orphaned_drive_file_ids).toEqual([]);
	});
});

describe('student view tracking', () => {
	let seen: string;

	test('a student can mark an item they can read as viewed', async () => {
		const made = await createItem(teacher.id, 'post', [p1], { body: 'Read me.' });
		seen = made.item_id;
		const res = await rpc<{ ok: boolean }>(
			studentA.id,
			'public.classroom_mark_item_viewed($1::uuid)',
			[seen]
		);
		expect(res.ok).toBe(true);

		const { rows } = await db.sql<{ student_email: string }>(
			'select student_email from public.classroom_item_views where item_id = $1',
			[seen]
		);
		expect(rows.map((r) => r.student_email)).toEqual([studentA.email]);
	});

	test('re-marking updates the SAME row rather than making a second one', async () => {
		const before = await db.sql<{ viewed_at: string }>(
			'select viewed_at from public.classroom_item_views where item_id = $1 and student_email = $2',
			[seen, studentA.email]
		);
		await rpc(studentA.id, 'public.classroom_mark_item_viewed($1::uuid)', [seen]);
		const after = await db.sql<{ viewed_at: string; n: string }>(
			`select viewed_at, count(*) over ()::text as n
			 from public.classroom_item_views where item_id = $1 and student_email = $2`,
			[seen, studentA.email]
		);
		expect(after.rows[0].n).toBe('1');
		expect(Date.parse(after.rows[0].viewed_at)).toBeGreaterThanOrEqual(
			Date.parse(before.rows[0].viewed_at)
		);
	});

	test('THE RPC CANNOT NAME ANOTHER STUDENT -- there is no parameter for it', async () => {
		// The guarantee is structural, not a check that could be got wrong: the
		// only argument is an item id, and the row is keyed on
		// current_user_email(). This asserts the signature IS that, so an added
		// email parameter would fail here rather than in production.
		const { rows } = await db.sql<{ args: string }>(
			`select pg_get_function_identity_arguments(p.oid) as args
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_mark_item_viewed'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].args).toBe('p_item_id uuid');
	});

	test('one student marking an item leaves another student row untouched', async () => {
		// Both students can read this one, so the only thing separating their
		// rows is who called.
		const shared = await createItem(teacher.id, 'post', [p1, p2], { body: 'Both classes.' });
		await rpc(studentA.id, 'public.classroom_mark_item_viewed($1::uuid)', [shared.item_id]);

		const { rows } = await db.sql<{ student_email: string }>(
			'select student_email from public.classroom_item_views where item_id = $1',
			[shared.item_id]
		);
		expect(rows.map((r) => r.student_email)).toEqual([studentA.email]);

		// And B genuinely cannot READ A's row either.
		const bSees = await db.asUser(studentB.id, (q) =>
			q('select student_email from public.classroom_item_views where item_id = $1', [shared.item_id])
		);
		expect(bSees.rows).toHaveLength(0);
	});

	test('a student cannot mark an item they cannot read', async () => {
		const hidden = await createItem(teacher.id, 'post', [p2], { body: 'Period 2 only.' });
		const err = await captureError(() =>
			rpc(studentA.id, 'public.classroom_mark_item_viewed($1::uuid)', [hidden.item_id])
		);
		expect(err.message).toMatch(/does not exist/i);

		const draft = await createItem(teacher.id, 'post', [p1], {
			body: 'Draft.',
			published: false
		});
		const draftErr = await captureError(() =>
			rpc(studentA.id, 'public.classroom_mark_item_viewed($1::uuid)', [draft.item_id])
		);
		expect(draftErr.message).toMatch(/does not exist/i);
	});
});

describe('feedback', () => {
	test('any signed-in user inserts their OWN row, and cannot insert as someone else', async () => {
		await db.asUser(studentA.id, (q) =>
			q(
				`insert into public.app_feedback (user_id, app, context, kind, message)
				 values ($1, 'classroom', 'class', 'bug', 'The due date looks wrong.')`,
				[studentA.id]
			)
		);
		const mine = await db.asUser(studentA.id, (q) =>
			q<{ message: string; status: string }>('select message, status from public.app_feedback')
		);
		expect(mine.rows).toHaveLength(1);
		// 0085's default: everything arrives in the queue as new.
		expect(mine.rows[0].status).toBe('new');

		const forged = await captureError(() =>
			db.asUser(studentA.id, (q) =>
				q(
					`insert into public.app_feedback (user_id, app, kind, message)
					 values ($1, 'classroom', 'bug', 'not mine')`,
					[studentB.id]
				)
			)
		);
		expect(forged.code).toBe('42501');
	});

	test('a student reads only their own feedback, never a classmate note', async () => {
		await db.asUser(studentB.id, (q) =>
			q(
				`insert into public.app_feedback (user_id, app, kind, message)
				 values ($1, 'classroom', 'idea', 'Sort materials alphabetically.')`,
				[studentB.id]
			)
		);
		const aSees = await db.asUser(studentA.id, (q) =>
			q<{ message: string }>('select message from public.app_feedback')
		);
		expect(aSees.rows.map((r) => r.message)).toEqual(['The due date looks wrong.']);
	});

	test('nobody can UPDATE or DELETE a feedback row directly -- append-only stands', async () => {
		for (const actor of [studentA, teacher, owner]) {
			const upd = await captureError(() =>
				db.asUser(actor.id, (q) => q(`update public.app_feedback set status = 'resolved'`))
			);
			expect(upd.code).toBe('42501');
			const del = await captureError(() =>
				db.asUser(actor.id, (q) => q(`delete from public.app_feedback`))
			);
			expect(del.code).toBe('42501');
		}
	});

	test('the console read and the status move are ADMIN only', async () => {
		for (const actor of [studentA, teacher]) {
			const list = await captureError(() =>
				rpc(actor.id, 'public.app_feedback_admin_list($1)', ['classroom'])
			);
			expect(list.message).toMatch(/site admin/i);
		}

		const rows = await rpc<{ id: string; message: string; submitter_email: string }[]>(
			owner.id,
			'public.app_feedback_admin_list($1)',
			['classroom']
		);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.submitter_email).sort()).toEqual(
			[studentA.email, studentB.email].sort()
		);

		const target = rows[0].id;
		for (const actor of [studentA, teacher]) {
			const err = await captureError(() =>
				rpc(actor.id, 'public.app_feedback_set_status($1::uuid, $2)', [target, 'resolved'])
			);
			expect(err.message).toMatch(/site admin/i);
		}

		const moved = await rpc<{ ok: boolean; status: string }>(
			owner.id,
			'public.app_feedback_set_status($1::uuid, $2)',
			[target, 'seen']
		);
		expect(moved).toEqual({ ok: true, id: target, status: 'seen' });

		const bad = await captureError(() =>
			rpc(owner.id, 'public.app_feedback_set_status($1::uuid, $2)', [target, 'archived'])
		);
		expect(bad.message).toMatch(/new, seen or resolved/i);
	});
});
