// tests/classroom-canonical-migration.test.ts
//
// The 0082-era -> canonical data migration (0085), against REAL seeded data on
// a real Postgres. This is the one test in the classroom set that cannot be
// written any other way: the migration runs once, in production, over content
// teachers have already written, and getting it wrong is silent -- a lost edit
// or a duplicated handout looks exactly like a normal classroom until somebody
// goes looking for the post they wrote.
//
// The harness applies migrations at boot, so 0085 is deliberately NOT in that
// list here: the database is brought up at 0083, seeded through the REAL 0082
// RPCs (never hand-written rows -- the point is to migrate what the shipped
// code actually produced), and only then is the migration file executed.
//
// What is pinned:
//   1. A clean multi-section publish REUNIFIES: 3 sibling rows -> 1 canonical
//      item with 3 postings, its resources and attachments de-duplicated.
//   2. A DIVERGED group does NOT reunify: siblings edited apart survive as
//      separate items, so no teacher's edit is discarded.
//   3. Nothing is lost and nothing is duplicated overall: the item count, the
//      posting count, the resource count and the attachment count are all
//      exactly what the seeded data implies.
//   4. Published/draft state, authorship and timestamps survive.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql'
] as const;

const MIGRATION_0085 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0085_classroom_canonical_items.sql'),
	'utf8'
);

let db: TestDb;
let teacher: SeededUser;
let sections: string[];

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

async function count(table: string, where = 'true', params: unknown[] = []): Promise<number> {
	const { rows } = await db.sql<{ c: string }>(
		`select count(*)::text as c from public.${table} where ${where}`,
		params
	);
	return Number(rows[0].c);
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);
	teacher = await createUser(db, 'tmig@boscotech.edu', 'T Mig');

	const course = await rpc<{ course_id: string }>(
		teacher.id,
		'public.classroom_upsert_course($1, $2)',
		['MIG100', 'Migration Test']
	);
	sections = [];
	for (const label of ['Period 1', 'Period 2', 'Period 3']) {
		const s = await rpc<{ section_id: string }>(
			teacher.id,
			'public.classroom_upsert_section($1::uuid, $2)',
			[course.course_id, label]
		);
		sections.push(s.section_id);
	}

	// 1. A clean 3-section announcement with one attachment per section row
	//    (0083 stored one row per section against ONE Drive file).
	const cleanPost = await rpc<{ post_ids: string[] }>(
		teacher.id,
		'public.classroom_create_post($1::uuid[], $2, $3, $4)',
		[sections, 'Same body everywhere.', 'Shared announcement', true]
	);
	await rpc(teacher.id, 'public.classroom_add_attachment($1, $2::uuid[], $3, $4, $5, $6::bigint)', [
		'post',
		cleanPost.post_ids,
		'drive-shared-1',
		'handout.pdf',
		'application/pdf',
		1234
	]);

	// 2. A 2-section assignment whose copies are then EDITED APART.
	const diverged = await rpc<{ assignment_ids: string[] }>(
		teacher.id,
		'public.classroom_create_assignment($1::uuid[], $2, $3, $4, $5::timestamptz, $6, $7, $8::jsonb)',
		[
			[sections[0], sections[1]],
			'Bridge sketch',
			'Original instructions.',
			20,
			null,
			'Unit Labs',
			true,
			JSON.stringify([{ label: 'Rubric', url: 'https://example.com/rubric' }])
		]
	);
	await rpc(
		teacher.id,
		'public.classroom_update_assignment($1::uuid, $2, $3, $4, $5::timestamptz, $6, $7, $8::jsonb)',
		[
			diverged.assignment_ids[1],
			'Bridge sketch',
			'Period 2 gets different instructions.',
			20,
			null,
			'Unit Labs',
			true,
			null
		]
	);

	// 3. A single-section DRAFT assignment: the plainest case, plus proof that
	//    draft state survives.
	await rpc(
		teacher.id,
		'public.classroom_create_assignment($1::uuid[], $2, $3, $4, $5::timestamptz, $6, $7, $8::jsonb)',
		[
			[sections[2]],
			'Draft only',
			'Not published.',
			null,
			null,
			null,
			false,
			JSON.stringify([])
		]
	);

	await db.sql(MIGRATION_0085);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

describe('0085 data migration', () => {
	test('a clean multi-section publish reunifies into ONE canonical item', async () => {
		const { rows } = await db.sql<{ id: string; body: string; published: boolean }>(
			`select id, body, published from public.classroom_items
			 where kind = 'post' and title = 'Shared announcement'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].body).toBe('Same body everywhere.');
		expect(rows[0].published).toBe(true);

		expect(await count('classroom_postings', 'item_id = $1', [rows[0].id])).toBe(3);
	});

	test('its attachment de-duplicates to one row per Drive file', async () => {
		const { rows } = await db.sql<{ c: string; f: string }>(
			`select count(*)::text as c, min(t.drive_file_id) as f
			 from public.classroom_attachments t
			 join public.classroom_items i on i.id = t.item_id
			 where i.title = 'Shared announcement'`
		);
		// Three rows went in (one per section), one file: exactly one row out.
		expect(Number(rows[0].c)).toBe(1);
		expect(rows[0].f).toBe('drive-shared-1');
	});

	test('a diverged group does NOT reunify -- both edits survive', async () => {
		const { rows } = await db.sql<{ id: string; body: string }>(
			`select id, body from public.classroom_items
			 where kind = 'assignment' and title = 'Bridge sketch' order by body`
		);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.body)).toEqual([
			'Original instructions.',
			'Period 2 gets different instructions.'
		]);
		// One section each -- they were never the same thing after the edit.
		for (const r of rows) {
			expect(await count('classroom_postings', 'item_id = $1', [r.id])).toBe(1);
		}
	});

	test('resources carry over de-duplicated, links intact', async () => {
		const { rows } = await db.sql<{ label: string; url: string; title: string }>(
			`select r.label, r.url, i.title
			 from public.classroom_item_resources r
			 join public.classroom_items i on i.id = r.item_id
			 order by i.body`
		);
		// The rubric was on both siblings; each surviving item keeps its own copy
		// and neither has it twice.
		expect(rows).toHaveLength(2);
		expect(new Set(rows.map((r) => r.url))).toEqual(new Set(['https://example.com/rubric']));
	});

	test('draft state, authorship and kind survive', async () => {
		const { rows } = await db.sql<{
			published: boolean;
			author_email: string;
			kind: string;
			first_published_at: string | null;
		}>(
			`select published, author_email, kind, first_published_at
			 from public.classroom_items where title = 'Draft only'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].published).toBe(false);
		expect(rows[0].author_email).toBe('tmig@boscotech.edu');
		expect(rows[0].kind).toBe('assignment');
		// Never published, so there is nothing an "edited after publish" badge
		// could ever have been measured against.
		expect(rows[0].first_published_at).toBeNull();
	});

	test('nothing is lost and nothing is duplicated overall', async () => {
		// 1 reunified post + 2 diverged assignments + 1 draft = 4 items.
		expect(await count('classroom_items')).toBe(4);
		// 3 (post) + 1 + 1 (diverged) + 1 (draft) = 6 postings, exactly the six
		// section-rows the 0082 schema held.
		expect(await count('classroom_postings')).toBe(6);
		expect(await count('classroom_attachments')).toBe(1);
	});

	test('the retired per-section tables are gone', async () => {
		const { rows } = await db.sql<{ t: string }>(
			`select table_name as t from information_schema.tables
			 where table_schema = 'public'
			   and table_name in ('classroom_posts', 'classroom_assignments', 'classroom_assignment_resources')`
		);
		expect(rows).toHaveLength(0);
	});

	test('re-applying 0085 is a no-op, not a second copy of everything', async () => {
		await db.sql(MIGRATION_0085);
		expect(await count('classroom_items')).toBe(4);
		expect(await count('classroom_postings')).toBe(6);
		expect(await count('classroom_attachments')).toBe(1);
	});
});
