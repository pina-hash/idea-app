// tests/classroom-edit-visibility.test.ts
//
// What an "Updated" badge means (0085's `edited_at`, corrected by 0104).
//
// THE GUARANTEE, and it is one that fails SILENTLY IN THE WRONG DIRECTION.
// Every other classroom test asks whether a student can see something they must
// not. This one asks whether a student is TOLD something changed when nothing
// they can see did -- which breaks nothing, throws nothing, and is invisible to
// the teacher who caused it. Left alone it is worse than noise: the badge is
// pointed at instructor-only material (an answer key, a facilitation guide),
// so it advertises the existence of content the student cannot open and is not
// meant to know about, and teaches them the badge is not worth opening.
//
// THE BUG THIS PINS. 0085 decided an item was edited with
// `p_resources is not null` -- "the caller sent a links array" rather than
// "the links changed" -- and the composer always sends one. So attaching an
// instructor-only file, which goes through its OWN RPCs and touches nothing on
// classroom_items, still stamped edited_at because the composer saves the item
// first and the instructor materials second.
//
// THE HEADLINE ASSERTION is not a field check. It reads the student's ENTIRE
// view through the REAL ITEM_SELECT, over the REAL RLS policies, via the
// PostgREST shim -- the same select the class page ships -- serializes it, and
// requires it byte-identical across an instructor-only change, badge included.
// A field check would have passed happily while the resource rows underneath it
// were deleted and re-inserted with new ids, which is a change to that exact
// payload.
//
// MUTATION-CHECKED BOTH WAYS (manually, during this session -- not left as
// runnable code, the classroom-attachment-route.test.ts convention). Against
// this exact file: restoring 0085's `or p_resources is not null` reddened the
// byte-identical assertion, the no-op-save assertion and the two
// isUpdatedForViewer assertions (4 tests); making it never stamp at all
// (`v_changed := false`) reddened the four tests that require a REAL edit to
// raise the badge. 0104 was restored byte-identical afterwards and this file
// re-run fully green.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { ITEM_SELECT } from '../src/lib/classroom/transports';
import { normalizeItemRow, isUpdatedForViewer } from '../src/lib/classroom/classroom';
import { buildFeed } from '../src/lib/classroom/feed';

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0053_app_feedback.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0090_classroom_instructor_materials.sql',
	'0104_classroom_edit_visibility.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let owner: SeededUser; // pinned admin
let teacher: SeededUser; // teacher of record
let student: SeededUser; // enrolled
let section: string;

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

/** A published item with real student-facing links, so there is something to leave alone. */
async function makeItem(links: { label: string; url: string }[] = []): Promise<string> {
	const res = await rpc<{ item_id: string }>(
		teacher.id,
		"public.classroom_create_item('post', $1::uuid[], $2, $3, null, null, null, true, $4::jsonb, false)",
		[[section], 'Announcement', 'The body.', JSON.stringify(links)]
	);
	return res.item_id;
}

/** The exact update the composer performs: full state, links always sent. */
function updateItem(
	itemId: string,
	fields: {
		title?: string;
		body?: string;
		points?: number | null;
		dueAt?: string | null;
		category?: string | null;
		published?: boolean;
		links?: { label: string; url: string }[];
	}
): Promise<Record<string, unknown>> {
	return rpc(
		teacher.id,
		'public.classroom_update_item($1::uuid, $2, $3, $4::integer, $5::timestamptz, $6, $7::boolean, $8::jsonb)',
		[
			itemId,
			fields.title ?? 'Announcement',
			fields.body ?? 'The body.',
			fields.points ?? null,
			fields.dueAt ?? null,
			fields.category ?? null,
			fields.published ?? true,
			JSON.stringify(fields.links ?? [])
		]
	);
}

/**
 * The student's WHOLE view of one item, through the shipping select and the
 * real policies. Serialized in a stable key order so equality is a genuine
 * byte comparison, not an object diff that might overlook a reordered embed.
 */
async function studentView(itemId: string): Promise<string> {
	const shim = createPostgrestShim(db, fks, student.id);
	const { data, error } = await shim.from('classroom_items').select(ITEM_SELECT).eq('id', itemId);
	if (error) throw new Error(`student read failed: ${error.message}`);
	const rows = (data ?? []) as Record<string, unknown>[];
	return JSON.stringify(rows, (_key, value) =>
		value && typeof value === 'object' && !Array.isArray(value)
			? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
			: value
	);
}

/** Does the class page / item page show this student an "Updated" badge? */
async function badgeShowing(itemId: string): Promise<boolean> {
	const shim = createPostgrestShim(db, fks, student.id);
	const { data } = await shim.from('classroom_items').select(ITEM_SELECT).eq('id', itemId);
	const row = ((data ?? []) as Record<string, unknown>[])[0];
	if (!row) throw new Error('the student cannot read that item at all');
	return isUpdatedForViewer(normalizeItemRow(row));
}

async function editedAt(itemId: string): Promise<string | null> {
	const { rows } = await db.sql<{ edited_at: string | null }>(
		'select edited_at from public.classroom_items where id = $1',
		[itemId]
	);
	return rows[0].edited_at;
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);
	fks = await loadForeignKeys(db);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Teacher');
	student = await createUser(db, 'stud@boscotech.net', 'Student');

	const course = await rpc<{ course_id: string }>(owner.id, 'public.classroom_upsert_course($1, $2)', [
		'EDIT1',
		'Edit Course'
	]);
	section = (
		await rpc<{ section_id: string }>(
			owner.id,
			'public.classroom_upsert_section($1::uuid, $2, null, $3)',
			[course.course_id, 'A', teacher.email]
		)
	).section_id;
	await rpc(owner.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
		section,
		student.email,
		'Student'
	]);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. THE HEADLINE: instructor-only work changes nothing a student sees.
// ---------------------------------------------------------------------------

describe('an instructor-only change is invisible to a student', () => {
	it('leaves the whole student view BYTE-IDENTICAL, badge included', async () => {
		const item = await makeItem([{ label: 'Slides', url: 'https://example.org/slides' }]);
		// Opened, so a badge would genuinely be a NEW thing to see rather than
		// the never-viewed default.
		await rpc(student.id, 'public.classroom_mark_item_viewed($1::uuid)', [item]);

		const before = await studentView(item);
		expect(await badgeShowing(item)).toBe(false);

		// Everything a teacher does when they add instructor-only material,
		// in the order the composer does it: the item save FIRST -- unchanged
		// content, links resent verbatim, which is what used to stamp it --
		// then the instructor-only writes.
		await updateItem(item, { links: [{ label: 'Slides', url: 'https://example.org/slides' }] });
		await rpc(
			teacher.id,
			'public.classroom_add_instructor_attachment($1::uuid, $2, $3, $4, null)',
			[item, `drive-${randomUUID()}`, 'answer-key.pdf', 'application/pdf']
		);
		await rpc(teacher.id, 'public.classroom_set_instructor_resources($1::uuid, $2::jsonb)', [
			item,
			JSON.stringify([{ label: 'Facilitation guide', url: 'https://example.org/guide' }])
		]);

		expect(await studentView(item)).toBe(before);
		expect(await badgeShowing(item)).toBe(false);
		expect(await editedAt(item)).toBeNull();
	});

	it('does not rank the item as "updated" on the home feed either', async () => {
		const item = await makeItem();
		await rpc(student.id, 'public.classroom_mark_item_viewed($1::uuid)', [item]);
		await updateItem(item, {});
		await rpc(
			teacher.id,
			'public.classroom_add_instructor_attachment($1::uuid, $2, $3, $4, null)',
			[item, `drive-${randomUUID()}`, 'key.pdf', 'application/pdf']
		);

		const shim = createPostgrestShim(db, fks, student.id);
		const { data } = await shim.from('classroom_items').select(ITEM_SELECT).eq('id', item);
		const feed = buildFeed({
			sections: [
				{
					id: section,
					course_id: 'c',
					label: 'A',
					block: null,
					teacher_email: teacher.email,
					active: true,
					course: null
				}
			],
			items: ((data ?? []) as Record<string, unknown>[]).map(normalizeItemRow),
			submissions: [],
			myEmail: student.email
		});
		expect(feed[0].urgent.map((e) => e.reason)).not.toContain('updated');
	});

	it('touches no timestamp at all on a save that changes nothing', async () => {
		const item = await makeItem([{ label: 'Slides', url: 'https://example.org/slides' }]);
		const { rows: before } = await db.sql<{ updated_at: string; edited_at: string | null }>(
			'select updated_at, edited_at from public.classroom_items where id = $1',
			[item]
		);
		await updateItem(item, { links: [{ label: 'Slides', url: 'https://example.org/slides' }] });
		const { rows: after } = await db.sql<{ updated_at: string; edited_at: string | null }>(
			'select updated_at, edited_at from public.classroom_items where id = $1',
			[item]
		);
		expect(after[0].updated_at).toEqual(before[0].updated_at);
		expect(after[0].edited_at).toBeNull();
	});

	it('leaves the student-facing link ROWS in place, ids and all', async () => {
		// The subtle half: rewriting identical links would delete and re-insert
		// them, minting new ids -- which ride in the student's own read.
		const item = await makeItem([{ label: 'Slides', url: 'https://example.org/slides' }]);
		const idsOf = async () =>
			(
				await db.sql<{ id: string }>(
					'select id from public.classroom_item_resources where item_id = $1 order by sort_order',
					[item]
				)
			).rows.map((r) => r.id);

		const before = await idsOf();
		expect(before).toHaveLength(1);
		await updateItem(item, { links: [{ label: 'Slides', url: 'https://example.org/slides' }] });
		expect(await idsOf()).toEqual(before);
	});
});

// ---------------------------------------------------------------------------
// 2. KEPT HONEST: a real edit still raises the badge.
//
// Without this block every assertion above would also pass if edited_at were
// simply never written, which is the opposite failure and just as silent.
// ---------------------------------------------------------------------------

describe('a real change to student-facing content still shows as updated', () => {
	it('stamps edited_at when the body changes, and the student sees the badge', async () => {
		const item = await makeItem();
		await rpc(student.id, 'public.classroom_mark_item_viewed($1::uuid)', [item]);
		expect(await badgeShowing(item)).toBe(false);

		await updateItem(item, { body: 'A genuinely different body.' });

		expect(await editedAt(item)).not.toBeNull();
		expect(await badgeShowing(item)).toBe(true);
	});

	it('stamps it when a link is ADDED, REMOVED, RELABELLED or REORDERED', async () => {
		const a = { label: 'Slides', url: 'https://example.org/slides' };
		const b = { label: 'Notes', url: 'https://example.org/notes' };

		type Link = { label: string; url: string };
		const cases: [string, Link[], Link[]][] = [
			['added', [a], [a, b]],
			['removed', [a, b], [a]],
			['relabelled', [a], [{ label: 'Deck', url: a.url }]],
			['retargeted', [a], [{ label: a.label, url: 'https://example.org/other' }]],
			['reordered', [a, b], [b, a]]
		];
		for (const [name, from, to] of cases) {
			const item = await makeItem(from);
			expect(await editedAt(item), name).toBeNull();
			await updateItem(item, { links: to });
			expect(await editedAt(item), name).not.toBeNull();
		}
	});

	it('publishing a draft is still not an edit, and a pin is still not an edit', async () => {
		const res = await rpc<{ item_id: string }>(
			teacher.id,
			"public.classroom_create_item('post', $1::uuid[], $2, $3, null, null, null, false, '[]'::jsonb, false)",
			[[section], 'Draft', 'Body.']
		);
		const item = res.item_id;
		await updateItem(item, { title: 'Draft', body: 'Body.', published: true });
		expect(await editedAt(item)).toBeNull();

		await rpc(teacher.id, 'public.classroom_set_item_pinned($1::uuid, true)', [item]);
		expect(await editedAt(item)).toBeNull();
	});

	it('an unpublished item never stamps, however much its content changes', async () => {
		const res = await rpc<{ item_id: string }>(
			teacher.id,
			"public.classroom_create_item('post', $1::uuid[], $2, $3, null, null, null, false, '[]'::jsonb, false)",
			[[section], 'Draft two', 'Body.']
		);
		await updateItem(res.item_id, { title: 'Draft two', body: 'Rewritten.', published: false });
		expect(await editedAt(res.item_id)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 3. THE OTHER INSTRUCTOR-ONLY WRITE PATHS, audited.
//
// classroom_update_item is where the leak was, but it is not the only way
// instructor material changes. Each of the others is asserted to touch nothing
// on classroom_items at all -- which is a claim about the whole row, so it is
// made against the whole row.
// ---------------------------------------------------------------------------

describe('every instructor-only write path leaves classroom_items alone', () => {
	it('add, replace-links and delete all leave the item row byte-identical', async () => {
		const item = await makeItem([{ label: 'Slides', url: 'https://example.org/slides' }]);
		const rowOf = async () =>
			(
				await db.sql<{ row: string }>(
					'select to_jsonb(i.*)::text as row from public.classroom_items i where i.id = $1',
					[item]
				)
			).rows[0].row;

		const before = await rowOf();

		const added = await rpc<{ attachment_id: string }>(
			teacher.id,
			'public.classroom_add_instructor_attachment($1::uuid, $2, $3, $4, null)',
			[item, `drive-${randomUUID()}`, 'key.pdf', 'application/pdf']
		);
		expect(await rowOf(), 'add').toBe(before);

		await rpc(teacher.id, 'public.classroom_set_instructor_resources($1::uuid, $2::jsonb)', [
			item,
			JSON.stringify([{ label: 'Guide', url: 'https://example.org/guide' }])
		]);
		expect(await rowOf(), 'set links').toBe(before);

		await rpc(teacher.id, 'public.classroom_delete_instructor_attachment($1::uuid)', [
			added.attachment_id
		]);
		expect(await rowOf(), 'delete').toBe(before);

		// And the student's own view never moved through any of it.
		expect(await badgeShowing(item)).toBe(false);
	});
});
