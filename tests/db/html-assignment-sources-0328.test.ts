// tests/db/html-assignment-sources-0328.test.ts
//
// LEDGER 0458, MIGRATION 0328: A POST KEEPS ITS KIT SOURCE, READ ONLY BY WHO
// MANAGES IT, AND STAFF READ THE HEALTH LIST.
//
// The chain is the whole tree short of 0328, seeded through the real
// pre-0328 RPCs (two classes, a live post and a draft, a kit page and a
// hand-built one), then 0328 applied over the top. A source is the author's
// file: a student in the class must never read it, and that is invisible in
// normal use, so it is counted both ways and mutation-proven (the policy made
// `using (true)`; see the history entry).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { migrationSql, treeShortOf } from './chain-0436';

const NUMBER = '0328';
const LEVELS = [
	{ points: 4, label: 'Complete', short: 'Done', descriptor: 'Answered.' },
	{ points: 2, label: 'Developing', short: 'Partial', descriptor: 'Partly answered.' },
	{ points: 0, label: 'Absent', short: 'None', descriptor: 'Not answered.' }
];
const manifest = (title: string) => ({
	schemaVersion: 3,
	kind: 'html-assignment',
	title,
	course: 'IDEA100',
	points: 4,
	modules: [{ id: 'm1', title: 'One', points: 4, blocks: [{ id: 'b1', field: 'answer', type: 'longText' }], criteria: [{ id: 'c', text: 'Answered', points: 4, levels: LEVELS }] }]
});
const kitPage = (title: string) =>
	`<!doctype html><html><head><meta name="hx-kit" content="1a2b3c4 2026-10-28">\n<meta name="hx-standard" content="2.16">\n</head><body><main id="hx-page"><textarea data-field="answer"></textarea></main><script type="application/json" id="idea-manifest">${JSON.stringify(manifest(title))}</script></body></html>`;
const handPage = (title: string) =>
	`<!doctype html><html><body><textarea data-field="answer"></textarea><script type="application/json" id="idea-manifest">${JSON.stringify(manifest(title))}</script></body></html>`;
const SOURCE = '<!doctype html><html><head><!-- hx:head --></head><body><main id="hx-page"></main><!-- hx:script --></body></html>';

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let ana: SeededUser;
let kit: string;
let hand: string;

async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => (await q<{ result: T }>(`select ${call} as result`, params)).rows[0].result);
}
async function refused(user: SeededUser, call: string, params: unknown[] = []): Promise<string> {
	try {
		await rpc(user, call, params);
		return 'accepted';
	} catch (e) {
		return (e as Error).message;
	}
}
async function sources(user: SeededUser, itemId: string): Promise<number> {
	return db.asUser(user.id, async (q) => (await q('select source from public.classroom_html_sources where item_id = $1', [itemId])).rows.length);
}

beforeAll(async () => {
	db = await startTestDb(treeShortOf(NUMBER));
	admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
	teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
	ana = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
	const section = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', label: 'Block 1', teacherEmail: teacher.email });
	await enrollStudent(db, { as: teacher, sectionId: section, email: ana.email, displayName: ana.email });
	const create = async (title: string) =>
		(
			await rpc<{ item_id: string }>(
				teacher,
				`public.classroom_create_item(p_kind => 'assignment'::text, p_section_ids => $1::uuid[], p_title => $2::text, p_body => ''::text, p_points => 4, p_published => true)`,
				[[section], title]
			)
		).item_id;
	kit = await create('Blade 02');
	hand = await create('Dogtag');
	await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [kit, kitPage('Blade 02'), JSON.stringify(manifest('Blade 02')), 'blade.html']);
	await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [hand, handPage('Dogtag'), JSON.stringify(manifest('Dogtag')), 'dogtag.html']);
	await db.sql(migrationSql(NUMBER));
	// It re-applies.
	await db.sql(migrationSql(NUMBER));
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('a post keeps its kit source', () => {
	it('the admin stores one; a teacher who is not an admin is refused by the season gate; a page with no markers is refused', async () => {
		expect(await rpc<{ ok: boolean }>(admin, 'public.classroom_html_set_source($1::uuid, $2, $3)', [kit, SOURCE, 'idea-blade-02.src.html'])).toMatchObject({ ok: true });
		expect(await refused(teacher, 'public.classroom_html_set_source($1::uuid, $2, $3)', [kit, SOURCE, 'x.src.html'])).toMatch(/limited to site admins/);
		expect(await refused(admin, 'public.classroom_html_set_source($1::uuid, $2, $3)', [kit, '<html></html>', 'x.src.html'])).toMatch(/not a kit source/);
		expect(await refused(ana, 'public.classroom_html_set_source($1::uuid, $2, $3)', [kit, SOURCE, 'x.src.html'])).toMatch(/teacher of record/);
	});

	it('read by who manages the post, both of them, and never by a student in the class', async () => {
		expect(await sources(admin, kit)).toBe(1);
		expect(await sources(teacher, kit)).toBe(1);
		expect(await sources(ana, kit)).toBe(0);
		// The control: the student CAN read the post's page itself.
		const doc = await db.asUser(ana.id, async (q) => (await q('select 1 from public.classroom_html_assignments where item_id = $1', [kit])).rows.length);
		expect(doc).toBe(1);
	});

	it('the health list names the kit off the page, and only an admin reads it', async () => {
		const rows = await rpc<Array<{ item_id: string; kit: string | null; standard: string | null; kit_page: boolean; source_filename: string | null; classes: Array<{ course: string }> }>>(admin, 'public.classroom_html_health()');
		const byId = new Map(rows.map((r) => [r.item_id, r]));
		expect(byId.get(kit)).toMatchObject({ kit: '1a2b3c4 2026-10-28', standard: '2.16', kit_page: true, source_filename: 'idea-blade-02.src.html' });
		expect(byId.get(hand)).toMatchObject({ kit: null, standard: null, kit_page: false, source_filename: null });
		expect(byId.get(kit)?.classes.map((c) => c.course)).toEqual(['IDEA100']);
		expect(await refused(teacher, 'public.classroom_html_health()')).toMatch(/Only a site admin/);
		expect(await refused(ana, 'public.classroom_html_health()')).toMatch(/Only a site admin/);
	});

	it('a null source removes it', async () => {
		await rpc(admin, 'public.classroom_html_set_source($1::uuid, null, null)', [kit]);
		expect(await sources(admin, kit)).toBe(0);
	});
});
