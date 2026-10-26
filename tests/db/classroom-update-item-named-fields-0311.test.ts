// tests/db/classroom-update-item-named-fields-0311.test.ts
//
// AN EDIT CHANGES ONLY THE FIELDS IT NAMES (ledger 0438 item 6, site gap
// 4353a482). Applied OVER SEEDED PRE-MIGRATION DATA: the tree is booted short
// of 0311, two posts are made through the real classroom_create_item, the bug
// is reproduced on one of them through the real pre-0311 function, then the
// file is applied (twice: a re-paste is ordinary) and:
//   * an edit naming one field changes that field and reads back every other
//     column unchanged;
//   * a named field sent as null clears it (how a due date comes off);
//   * a full edit (no names), which is what the item editor sends, still
//     replaces every field, a cleared due date included;
//   * a revision restore still puts a whole stored copy back.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL } from './connector-fixture';
import { createClassroomSection, createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const FILE = '0311_classroom_update_item_named_fields.sql';
const BEFORE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < FILE)];
const SQL = readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${FILE}`, import.meta.url)), 'utf8');

let db: TestDb;
let admin: SeededUser;
let section: string;
let launcher: string;
let victim: string;

const COLS = 'title, body, body_doc, points, due_at, category, published, publish_at, kind';
const row = async (id: string) => (await db.sql(`select ${COLS} from public.classroom_items where id = $1`, [id])).rows[0];
const as = <T>(fn: (q: TestDb['sql']) => Promise<T>) => db.asUser(admin.id, fn);

async function makePost(title: string): Promise<string> {
	return as(async (q) => {
		const r = await q<{ r: { item_id: string } }>(
			`select public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => array[$1::uuid], p_title => $2,
				p_body => 'Design the launcher. Show your sketch.', p_points => 20,
				p_due_at => '2026-10-30T06:59:00Z'::timestamptz, p_category => 'Design', p_published => true) as r`,
			[section, title]
		);
		return r.rows[0].r.item_id;
	});
}

beforeAll(async () => {
	db = await startTestDb(BEFORE);
	admin = await createUser(db, 'chair@boscotech.edu', 'Chair Person');
	await db.sql(`insert into public.app_admins (email, granted_by) values ('chair@boscotech.edu', 'test') on conflict do nothing`);
	section = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering I Honors', label: 'Block 2', teacherEmail: admin.email });
	launcher = await makePost('Launcher: Design');
	victim = await makePost('Launcher: Build');
	// THE BUG, through the real pre-0311 function: a title and a category only.
	await as((q) => q(`select public.classroom_update_item(p_id => $1::uuid, p_title => 'Launcher: Build', p_category => 'Build')`, [victim]));
	await db.sql(SQL);
	await db.sql(SQL);
}, 300_000);
afterAll(async () => db?.stop());

describe('before 0311: a partial edit emptied the post', () => {
	it('the reproduction lost its text, points and due date', async () => {
		const r = await row(victim);
		expect(r.category).toBe('Build');
		expect(r.body).toBe('');
		expect(r.points).toBeNull();
		expect(r.due_at).toBeNull();
	});
});

describe('after 0311', () => {
	it('naming one field changes only it: every other column reads back unchanged', async () => {
		const before = await row(launcher);
		await as((q) => q(`select public.classroom_update_item(p_id => $1::uuid, p_category => 'Prototype', p_fields => array['p_category'])`, [launcher]));
		const after = await row(launcher);
		expect(after.category).toBe('Prototype');
		expect({ ...after, category: before.category }).toEqual(before);
	});

	it('the connector\'s old shape, a title and a category named, keeps text, points and due date', async () => {
		const before = await row(launcher);
		await as((q) =>
			q(`select public.classroom_update_item(p_id => $1::uuid, p_title => 'Launcher: Design', p_category => 'Design', p_fields => array['p_title', 'p_category'])`, [launcher])
		);
		const after = await row(launcher);
		expect(after.category).toBe('Design');
		expect({ ...after, category: before.category }).toEqual(before);
	});

	it('a named field sent as null clears it, and only it', async () => {
		const before = await row(launcher);
		await as((q) => q(`select public.classroom_update_item(p_id => $1::uuid, p_due_at => null, p_fields => array['p_due_at'])`, [launcher]));
		const after = await row(launcher);
		expect(after.due_at).toBeNull();
		expect({ ...after, due_at: before.due_at }).toEqual(before);
	});

	it('a full edit with no names is the item editor\'s save, unchanged: every field replaced', async () => {
		await as((q) =>
			q(
				`select public.classroom_update_item(p_id => $1::uuid, p_title => 'Full', p_body => 'New text.', p_points => 15,
				 p_due_at => null, p_category => null, p_published => true, p_resources => '[]'::jsonb, p_body_doc => null, p_publish_at => null)`,
				[launcher]
			)
		);
		const r = await row(launcher);
		expect([r.title, r.body, r.points, r.due_at, r.category]).toEqual(['Full', 'New text.', 15, null, null]);
	});

	it('a field that is not a post\'s is refused and writes nothing', async () => {
		const before = await row(launcher);
		await expect(as((q) => q(`select public.classroom_update_item(p_id => $1::uuid, p_fields => array['p_owner'])`, [launcher]))).rejects.toThrow(/name only those/);
		expect(await row(launcher)).toEqual(before);
	});

	it('a revision restore still puts a whole stored copy back', async () => {
		const rev = (await db.sql<{ id: string }>(`select id from public.classroom_content_revisions where item_id = $1 and target = 'item' order by revision limit 1`, [launcher])).rows[0];
		expect(rev).toBeTruthy();
		await as((q) => q(`select public.classroom_restore_revision($1::uuid)`, [rev.id]));
		const r = await row(launcher);
		expect([r.title, r.body, r.points, r.category]).toEqual(['Launcher: Design', 'Design the launcher. Show your sketch.', 20, 'Design']);
	});
});
