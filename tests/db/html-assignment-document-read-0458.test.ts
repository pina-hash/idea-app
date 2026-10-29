// tests/db/html-assignment-document-read-0458.test.ts
//
// LEDGER 0458, REPORTS 0a569932 AND aa9ce822: THE STORED DOCUMENT IS READ BACK
// AS THE CALLER, DRAFTS INCLUDED, AND ONLY BY WHOEVER MAY READ THE ITEM.
//
// The connector's `get_post` and the replace screen's "has it changed" check
// both read `classroom_html_assignments` as the signed-in person, so 0195's
// policy ("the document follows its item") is the whole boundary. A wrong
// answer here is invisible in normal use: a student in another class, or any
// student on a draft, reading a worksheet nobody meant them to see yet. Both
// directions are counted on one fixture, and the suite is mutation-proven by
// making the policy `using (true)` (see the history entry).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { treeShortOf } from './chain-0436';

const LEVELS = [
	{ points: 4, label: 'Complete', short: 'Done', descriptor: 'Answered.' },
	{ points: 2, label: 'Developing', short: 'Partial', descriptor: 'Partly answered.' },
	{ points: 0, label: 'Absent', short: 'None', descriptor: 'Not answered.' }
];
const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Blade 01',
	course: 'IDEA100',
	points: 4,
	modules: [{ id: 'm1', title: 'One', points: 4, blocks: [{ id: 'b1', field: 'answer', type: 'longText' }], criteria: [{ id: 'c', text: 'Answered', points: 4, levels: LEVELS }] }]
};
const DOC = `<!doctype html><html><body><textarea data-field="answer"></textarea><script type="application/json" id="idea-manifest">${JSON.stringify(MANIFEST)}</script></body></html>`;

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let ana: SeededUser;
let bo: SeededUser;
let live: string;
let draft: string;

async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => (await q<{ result: T }>(`select ${call} as result`, params)).rows[0].result);
}

async function readable(user: SeededUser, itemId: string): Promise<number> {
	return db.asUser(user.id, async (q) => (await q('select document from public.classroom_html_assignments where item_id = $1', [itemId])).rows.length);
}

beforeAll(async () => {
	db = await startTestDb(treeShortOf('9999'));
	admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
	teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
	ana = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
	bo = await createUser(db, 'bo.chen@boscotech.net', 'Bo Chen');
	const mine = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', label: 'Block 1', teacherEmail: teacher.email });
	const other = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', label: 'Block 2', teacherEmail: teacher.email });
	await enrollStudent(db, { as: teacher, sectionId: mine, email: ana.email, displayName: ana.email });
	await enrollStudent(db, { as: teacher, sectionId: other, email: bo.email, displayName: bo.email });
	const create = async (title: string, published: boolean) =>
		(
			await rpc<{ item_id: string }>(
				teacher,
				`public.classroom_create_item(p_kind => 'assignment'::text, p_section_ids => $1::uuid[], p_title => $2::text, p_body => ''::text, p_points => 4, p_published => $3::boolean)`,
				[[mine], title, published]
			)
		).item_id;
	live = await create('Blade 01', true);
	draft = await create('Blade 02', false);
	for (const id of [live, draft]) {
		await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [id, DOC, JSON.stringify(MANIFEST), 'blade.html']);
	}
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('who reads a stored document back', () => {
	it('the admin and the teacher read both, the draft included', async () => {
		expect([await readable(admin, live), await readable(admin, draft)]).toEqual([1, 1]);
		expect([await readable(teacher, live), await readable(teacher, draft)]).toEqual([1, 1]);
	});

	it('a student in the class reads the live one and not the draft', async () => {
		expect(await readable(ana, live)).toBe(1);
		expect(await readable(ana, draft)).toBe(0);
	});

	it('a student in another class reads neither', async () => {
		expect([await readable(bo, live), await readable(bo, draft)]).toEqual([0, 0]);
	});

	it('the saved time the replace check compares moves on every replace', async () => {
		const at = async () => (await db.sql<{ t: string }>('select updated_at::text t from public.classroom_html_assignments where item_id = $1', [live])).rows[0].t;
		const before = await at();
		await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [live, DOC.replace('<body>', '<body><p>v2</p>'), JSON.stringify(MANIFEST), 'blade.html']);
		expect(await at()).not.toBe(before);
	});
});
