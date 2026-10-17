// tests/db/classroom-item-thumbnails.test.ts
//
// POST THUMBNAILS (ledger 0396, report a6a037f3, migration 0268). The chain is
// booted SHORT of 0268 with 0137 last, the world is written through the REAL
// pre-0268 RPCs (posts, an image attachment, and HTML documents whose manifests
// already carry a `thumbnail` key), and 0268 is applied over the top -- so the
// backfill and every assertion are about data that existed before it.
//
// Silent-regression guarantees, each with a positive control:
//   - THE MANIFEST GATE IS NOT WIDENED: the deployed 0195 setter accepts and
//     stores a manifest carrying `thumbnail` verbatim BEFORE 0268 exists;
//   - the SQL reader and the client's reader agree on one corpus;
//   - a thumbnail is read by exactly who can read the post: a student in the
//     class sees a published post's row, a student of another class and anon
//     see nothing, and a draft's row reaches only its teacher;
//   - only the teacher of record writes, a key must name its own post, an SVG
//     or a foreign attachment is refused, and nothing is client-writable;
//   - A HAND-SET THUMBNAIL SURVIVES A RE-UPLOAD, and "Automatic" hands the post
//     back to whatever the current manifest says;
//   - A MANIFEST NAMING A TEMPLATE THE DOCUMENT DOES NOT CARRY records no live
//     thumbnail (the generated look, with nothing for the class page to ask
//     for), and the database's wide test never refuses a document the serving
//     route's exact one serves;
//   - every new function is closed to anon, read from the catalog.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { createPostgrestShim, loadForeignKeys } from './postgrest-shim';
import { manifestThumbnail, servedThumbnailTemplate } from '../../src/lib/classroom/html-assignment/thumbnail';
import { liveTemplateMissing, readItemThumbnail, thumbnailPlan, withItemThumbnail } from '../../src/lib/classroom/thumbnail';
import { normalizeItemRow } from '../../src/lib/classroom/classroom';
import { selectItemsWithDoc } from '../../src/lib/classroom/transports';
import { loadClassroomWork } from '../../src/lib/classroom/student-work';

type Json = Record<string, unknown>;

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FILE = '0268_classroom_item_thumbnails.sql';
const ALL = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
// Everything short of 0268, with the anon sweep LAST, as every chain takes it:
// what 0268 then creates under the stub's default privileges is exactly what
// production's would be, so an anon grant it forgot to revoke shows.
const PRE = [
	'../../tests/db/full-chain-fixture-completion.sql',
	...ALL.filter((f) => f < FILE && f !== '0137_anon_execute_sweep.sql'),
	'0137_anon_execute_sweep.sql'
];

const sql = () => readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8');

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let other: SeededUser;
let ana: SeededUser;
let zed: SeededUser;
let s1: string;
let s2: string;
let plain: string; // a published post with an image attachment
let html: string; // a published HTML assignment whose manifest names an html thumbnail
let pic: string; // a published HTML assignment whose manifest names a data picture
let draft: string; // a draft HTML assignment with an html thumbnail
let typo: string; // a published HTML assignment whose manifest names a template its document lacks
let elsewhere: string; // a post in the other class
let attachment: string;
let storedBeforeApply: Json | null = null;
let ladderBefore: Awaited<ReturnType<typeof ladderRead>> | null = null;
let homeBefore: { ready: boolean; keys: boolean[] } | null = null;

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function manifest(thumbnail: unknown, title = 'Hook 04'): Json {
	const m: Json = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title,
		course: 'IDEA100',
		points: 2,
		modules: [
			{
				id: 'm1',
				title: 'Build',
				points: 2,
				blocks: [{ id: 'm1-a', field: 'notes', type: 'longText' }],
				criteria: [
					{
						id: 'c1',
						text: 'It works',
						points: 2,
						levels: [
							{ points: 2, label: 'Complete', short: 'Works', descriptor: 'It works every time.' },
							{ points: 1, label: 'Developing', short: 'Sometimes', descriptor: 'It works sometimes.' },
							{ points: 0, label: 'Absent', short: 'Not yet', descriptor: 'It does not work yet.' }
						]
					}
				]
			}
		]
	};
	if (thumbnail !== undefined) m.thumbnail = thumbnail;
	return m;
}
function doc(m: Json, template = '<div class="t">spin</div>', templateId = 'idea-thumbnail'): string {
	return [
		'<!doctype html><html><head><title>Hook</title></head><body>',
		'<textarea data-field="notes"></textarea>',
		`<template id="${templateId}">${template}</template>`,
		`<script type="application/json" id="idea-manifest">${JSON.stringify(m)}<\/script>`,
		`<script>parent.postMessage({ type: 'idea:ready', schemaVersion: 3 }, '*');<\/script>`,
		'</body></html>'
	].join('\n');
}

/**
 * THE SHIPPED ITEM READ, rung by rung, through the PostgREST stand-in that
 * resolves an embed against the real catalog (and answers PGRST200 when no key
 * relates two tables). `tried` is how many select strings it spent.
 */
/** The home page's owed-work read, as a student, asking for the class defaults. */
async function homeWork(u: SeededUser, thumbShapes = true) {
	const shim = createPostgrestShim(db, await loadForeignKeys(db), u.id);
	return loadClassroomWork(shim as never, { userId: u.id, email: u.email, isAdmin: false, thumbShapes });
}

async function ladderRead(userId: string, itemId: string) {
	const shim = createPostgrestShim(db, await loadForeignKeys(db), userId);
	const tried: string[] = [];
	const res = await selectItemsWithDoc((select) => {
		tried.push(select);
		return shim.from('classroom_items').select(select).eq('id', itemId);
	});
	const raw = ((res.data as Json[] | null) ?? [])[0] ?? null;
	const item = raw ? withItemThumbnail(normalizeItemRow(raw), raw) : null;
	return { tried: tried.length, error: res.error, item };
}

const rpc = <T = Json>(u: SeededUser, call: string, params: unknown[] = []) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);

async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

async function row(item: string): Promise<Json | null> {
	const { rows } = await db.sql<Json>(
		`select source, manual, image_key, attachment_id, image_width, image_height, focal_x, focal_y,
		        html_document_id, interactive, updated_at::text as updated_at
		   from public.classroom_item_thumbnails where item_id = $1`,
		[item]
	);
	return rows[0] ?? null;
}
async function documentId(item: string): Promise<string> {
	const { rows } = await db.sql<{ document_id: string }>(
		'select document_id from public.classroom_html_assignments where item_id = $1',
		[item]
	);
	return rows[0].document_id;
}
const upload = (item: string, m: Json, template?: string, templateId?: string) =>
	rpc<Json>(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [
		item,
		doc(m, template, templateId),
		JSON.stringify(m),
		'hook.html'
	]);
const setThumb = (
	u: SeededUser,
	item: string,
	source: string,
	key: string | null = null,
	att: string | null = null,
	w: number | null = null,
	h: number | null = null,
	fx: number | null = null,
	fy: number | null = null
) =>
	rpc<Json>(u, 'public.classroom_set_item_thumbnail($1::uuid, $2, $3, $4::uuid, $5, $6, $7::real, $8::real)', [
		item,
		source,
		key,
		att,
		w,
		h,
		fx,
		fy
	]);

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tee Cher');
	other = await createUser(db, 'other@boscotech.edu', 'Oth Er');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	zed = await createUser(db, 'zed@boscotech.net', 'Zed Ortiz');
	s1 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	s2 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', courseTitle: 'Engineering II', label: 'Block 4', teacherEmail: other.email });
	await enrollStudent(db, { as: admin, sectionId: s1, email: ana.email, displayName: 'Ana' });
	await enrollStudent(db, { as: admin, sectionId: s2, email: zed.email, displayName: 'Zed' });

	const create = async (u: SeededUser, section: string, kind: string, title: string, published: boolean) =>
		(
			await rpc<{ item_id: string }>(
				u,
				`public.classroom_create_item(p_kind => $1, p_section_ids => $2::uuid[], p_title => $3, p_body => 'Do it.', p_points => $5::integer, p_published => $4)`,
				[kind, [section], title, published, kind === 'assignment' ? 2 : null]
			)
		).item_id;
	plain = await create(teacher, s1, 'post', 'Shop safety', true);
	html = await create(teacher, s1, 'assignment', 'Hook 04', true);
	pic = await create(teacher, s1, 'assignment', 'Hook 05', true);
	draft = await create(teacher, s1, 'assignment', 'Hook 06', false);
	typo = await create(teacher, s1, 'assignment', 'Hook 07', true);
	elsewhere = await create(other, s2, 'post', 'Gears', true);

	const added = await rpc<Json>(teacher, 'public.classroom_add_attachment($1::uuid, null, $2, $3, $4::bigint, $5)', [
		plain,
		'bench.jpg',
		'application/octet-stream',
		1200,
		`${plain}/1f3e5f0a-0000-4000-8000-000000000001.jpg`
	]);
	attachment = String((added.attachment as Json | undefined)?.id ?? added.id ?? added.attachment_id);

	// THE WORLD BEFORE 0268: the deployed 0195 setter takes manifests that
	// already name a thumbnail, and stores them as sent.
	const m = manifest({ kind: 'html', template: 'idea-thumbnail', interactive: true });
	expect((await upload(html, m)).ok).toBe(true);
	const { rows } = await db.sql<{ manifest: Json }>('select manifest from public.classroom_html_assignments where item_id = $1', [html]);
	storedBeforeApply = rows[0].manifest;
	expect((await upload(pic, manifest({ kind: 'image', src: PNG }))).ok).toBe(true);
	expect((await upload(draft, manifest({ kind: 'html', template: 'idea-thumbnail' }))).ok).toBe(true);
	// The author's typo, stored before 0268: the manifest names `cam-thumbnail`
	// and the document carries only `idea-thumbnail`.
	expect((await upload(typo, manifest({ kind: 'html', template: 'cam-thumbnail' }))).ok).toBe(true);
	// The table does not exist yet: nothing has been written about thumbnails.
	const { rows: exists } = await db.sql<{ t: string | null }>("select to_regclass('public.classroom_item_thumbnails')::text as t");
	expect(exists[0].t).toBeNull();
	// And the item read on that world, for the ladder's other direction.
	ladderBefore = await ladderRead(ana.id, html);
	const before = await homeWork(ana);
	homeBefore = { ready: before.ready, keys: before.sections.map((x) => 'thumbnail_shape' in x) };

	await db.sql(sql());
}, 600_000);

afterAll(async () => db?.stop());

describe('0268 over a world with HTML documents already stored', () => {
	test('re-applies cleanly', async () => {
		await db.sql(sql());
	});

	test('the manifest gate was never widened: 0195 stored the thumbnail key verbatim before 0268 existed', () => {
		expect(storedBeforeApply?.thumbnail).toEqual({ kind: 'html', template: 'idea-thumbnail', interactive: true });
	});

	test('the backfill read each stored document that named a thumbnail, once', async () => {
		const h = await row(html);
		expect(h).toMatchObject({ source: 'html', manual: false, interactive: true, html_document_id: await documentId(html) });
		expect(await row(pic)).toMatchObject({ source: 'image', manual: false, html_document_id: null });
		// A post with no HTML document has no row: the generated identity.
		expect(await row(plain)).toBeNull();
		// A manifest naming a template its document does not carry: no row
		// either, so nothing promises a live thumbnail the route would refuse.
		expect(await row(typo)).toBeNull();
	});
});

describe('a live thumbnail is recorded only for a document that can serve one', () => {
	// [label, document body, id]. The exact reader is the serving route's own
	// (`servedThumbnailTemplate`); the database asks a wider question.
	const corpus: [string, string, string][] = [
		['double quotes', '<template id="t"><b>x</b></template>', 't'],
		['single quotes', "<template id='t'><b>x</b></template>", 't'],
		['unquoted', '<template id=t><b>x</b></template>', 't'],
		['upper case tag and attribute', '<TEMPLATE ID="t"><b>x</b></TEMPLATE>', 't'],
		['another attribute first', '<template class="a" id="t"><b>x</b></template>', 't'],
		['a newline and a tab', '<template\n\tid = "t"\n><b>x</b></template>', 't'],
		['spaces inside the quotes', '<template id="  t "><b>x</b></template>', 't'],
		['a quoted angle bracket first', '<template data-x=">" id="t"><b>x</b></template>', 't'],
		['a no-break space before the id', '<template\u00a0id="t"><b>x</b></template>', 't'],
		['nested templates', '<template id="t"><template>inner</template>after</template>', 't'],
		['the id in an earlier attribute value', '<template title=" id=t" id="u"><b>x</b></template>', 't'],
		['an id with every allowed character', '<template id="Cam_2-thumb"><b>x</b></template>', 'Cam_2-thumb'],
		['after other markup', '<p>Intro</p><script>var a = 1;</script><template id="t"><b>x</b></template>', 't'],
		// What the exact reader refuses and the wide one lets through: the
		// route's own 404 answers these, then the generated look.
		['empty', '<template id="t"></template>', 't'],
		['whitespace only', '<template id="t">  \n </template>', 't'],
		['inside a comment only', '<!-- <template id="t"><b>x</b></template> -->', 't'],
		['inside a script string only', '<script>var s = \'<template id="t">x</template>\';</script>', 't'],
		['an id on an element inside an id-less template', '<template><p id="t">x</p></template>', 't'],
		// What both refuse: the generated look at once.
		['the typo: another template id', '<template id="idea-thumbnail"><b>x</b></template>', 'cam-thumbnail'],
		['no template at all', '<div id="t">x</div>', 't'],
		['a longer id', '<template id="t2"><b>x</b></template>', 't'],
		['a hyphenated id', '<template id="t-x"><b>x</b></template>', 't'],
		['a longer tag name', '<templates id="t"><b>x</b></templates>', 't'],
		['an id the manifest could not name', '<template id="9t"><b>x</b></template>', '9t']
	];
	const html = (body: string) => `<!doctype html><html><body>${body}</body></html>`;

	test('the wide test never refuses a document the exact one serves, and still refuses the typo', async () => {
		let served = 0;
		let bothRefuse = 0;
		let wideOnly = 0;
		const lines: string[] = [];
		for (const [label, body, id] of corpus) {
			const h = html(body);
			const exact = servedThumbnailTemplate(h, id) !== null;
			const { rows } = await db.sql<{ r: boolean }>('select public._classroom_html_may_carry_template($1, $2) as r', [h, id]);
			const wide = rows[0].r;
			lines.push(`${label}: exact ${exact} wide ${wide}`);
			if (exact) {
				expect(wide, label).toBe(true);
				served += 1;
			} else if (wide) wideOnly += 1;
			else bothRefuse += 1;
		}
		// Every case was put to both, and each direction has members.
		expect(served + wideOnly + bothRefuse).toBe(corpus.length);
		expect(served).toBe(13);
		expect(wideOnly).toBe(5);
		expect(bothRefuse).toBe(6);
		expect(lines).toContain('the typo: another template id: exact false wide false');
	});

	test('null and a malformed id are refused, never an error', async () => {
		const { rows } = await db.sql<{ a: boolean; b: boolean; c: boolean }>(
			`select public._classroom_html_may_carry_template(null, 't') as a,
			        public._classroom_html_may_carry_template('<template id="t">x</template>', null) as b,
			        public._classroom_html_may_carry_template('<template id="a.b">x</template>', 'a.b') as c`
		);
		expect(rows[0]).toEqual({ a: false, b: false, c: false });
	});

	test('a two megabyte document is answered quickly', async () => {
		const filler = '<p class="step">Measure twice, cut once. </p>\n'.repeat(45_000);
		const big = `<!doctype html><html><body>${filler}<template id="idea-thumbnail"><b>x</b></template></body></html>`;
		expect(big.length).toBeGreaterThan(2_000_000);
		const t0 = performance.now();
		const { rows } = await db.sql<{ yes: boolean; no: boolean }>(
			`select public._classroom_html_may_carry_template($1, 'idea-thumbnail') as yes,
			        public._classroom_html_may_carry_template($1, 'cam-thumbnail') as no`,
			[big]
		);
		const ms = performance.now() - t0;
		console.info(`[0268] _classroom_html_may_carry_template over ${big.length} characters, twice: ${ms.toFixed(1)}ms`);
		expect(rows[0]).toEqual({ yes: true, no: false });
		expect(ms).toBeLessThan(5000);
	});

	test('the typo reads as no thumbnail through the shipped item read, so every list draws the generated look', async () => {
		const got = await ladderRead(ana.id, typo);
		expect(got.error).toBeNull();
		expect(got.item?.thumbnail).toBeNull();
		expect(thumbnailPlan(got.item!).kind).toBe('generated');
		// And the editor's reading of the same row says the template is missing,
		// against the positive control of a post whose document carries it.
		const declared = manifestThumbnail(manifest({ kind: 'html', template: 'cam-thumbnail' }));
		expect(liveTemplateMissing(declared, null, got.item?.thumbnail)).toBe(true);
		const fine = await ladderRead(teacher.id, draft);
		expect(fine.item?.thumbnail).toMatchObject({ source: 'html' });
		expect(liveTemplateMissing(manifestThumbnail(manifest({ kind: 'html', template: 'idea-thumbnail' })), null, fine.item?.thumbnail)).toBe(false);
	});

	test('fixing the document records the live thumbnail; breaking it again takes it away', async () => {
		expect((await upload(typo, manifest({ kind: 'html', template: 'cam-thumbnail' }, 'Hook 07 v2'), '<b>cam</b>', 'cam-thumbnail')).ok).toBe(true);
		expect(await row(typo)).toMatchObject({ source: 'html', manual: false, html_document_id: await documentId(typo) });
		expect((await upload(typo, manifest({ kind: 'html', template: 'cam-thumbnail' }, 'Hook 07 v3'))).ok).toBe(true);
		expect(await row(typo)).toBeNull();
		// "Automatic" asks the same question.
		expect((await setThumb(teacher, typo, 'none')).ok).toBe(true);
		expect(await row(typo)).toMatchObject({ source: 'none', manual: true });
		expect((await setThumb(teacher, typo, 'auto')).ok).toBe(true);
		expect(await row(typo)).toBeNull();
	});
});

describe('one reader, two copies', () => {
	const corpus: unknown[] = [
		null,
		{},
		{ thumbnail: null },
		{ thumbnail: 'html' },
		{ thumbnail: [] },
		{ thumbnail: { kind: 'html' } },
		{ thumbnail: { kind: 'html', template: 'idea-thumbnail' } },
		{ thumbnail: { kind: 'html', template: 'idea-thumbnail', interactive: true } },
		{ thumbnail: { kind: 'html', template: 'idea-thumbnail', interactive: 'yes' } },
		{ thumbnail: { kind: 'html', template: '9starts-with-digit' } },
		{ thumbnail: { kind: 'html', template: 'has space' } },
		{ thumbnail: { kind: 'html', template: 'a'.repeat(64) } },
		{ thumbnail: { kind: 'html', template: 'a'.repeat(65) } },
		{ thumbnail: { kind: 'HTML', template: 'idea-thumbnail' } },
		{ thumbnail: { kind: 'image' } },
		{ thumbnail: { kind: 'image', src: 'attachment:cover.png' } },
		{ thumbnail: { kind: 'image', src: 'attachment:cover.svg' } },
		{ thumbnail: { kind: 'image', src: 'attachment:COVER.SVGZ' } },
		{ thumbnail: { kind: 'image', src: 'attachment:' } },
		{ thumbnail: { kind: 'image', src: 'attachment:' + 'a'.repeat(296) + '.png' } },
		{ thumbnail: { kind: 'image', src: 'attachment:' + 'a'.repeat(297) + '.png' } },
		{ thumbnail: { kind: 'image', src: 'Attachment:cover.png' } },
		{ thumbnail: { kind: 'image', src: PNG } },
		{ thumbnail: { kind: 'image', src: 'data:image/svg+xml;base64,PHN2Zz4=' } },
		{ thumbnail: { kind: 'image', src: 'data:image/jpeg;base64,/9j/4AAQ' } },
		{ thumbnail: { kind: 'image', src: 'data:image/png;base64,abc def' } },
		{ thumbnail: { kind: 'image', src: 'https://example.com/a.png' } },
		{ thumbnail: { kind: 'image', src: 'data:image/png;base64,' + 'A'.repeat(399_978) } },
		{ thumbnail: { kind: 'image', src: 'data:image/png;base64,' + 'A'.repeat(399_979) } },
		{ thumbnail: { kind: 'image', src: 42 } }
	];

	test('the SQL reader and manifestThumbnail agree case for case', async () => {
		let agreed = 0;
		let some = 0;
		for (const m of corpus) {
			const { rows } = await db.sql<{ r: Json | null }>('select public._classroom_manifest_thumbnail($1::jsonb) as r', [
				m === null ? null : JSON.stringify(m)
			]);
			const fromSql = rows[0].r;
			const fromTs = manifestThumbnail(m);
			const tsShape = fromTs === null ? null : fromTs.source === 'html' ? fromTs : { source: 'image' };
			expect(fromSql, JSON.stringify(m).slice(0, 120)).toEqual(tsShape);
			agreed += 1;
			if (fromSql) some += 1;
		}
		expect(agreed).toBe(corpus.length);
		// Positive control: the corpus is not all refusals.
		expect(some).toBe(9);
	});
});

describe("the item read's widest rung", () => {
	test('with 0268 the thumbnail rides beside the item, and the read costs no retry', async () => {
		const got = await ladderRead(ana.id, html);
		expect(got.error).toBeNull();
		expect(got.tried).toBe(1);
		expect(got.item?.thumbnail).toMatchObject({ source: 'html', manual: false, interactive: true });
		// A post with nothing set reads NULL, a filed answer, never undefined.
		const bare = await ladderRead(ana.id, plain);
		expect(bare.tried).toBe(1);
		expect(bare.item?.thumbnail).toBeNull();
	});

	test('without it the rung is refused once, and the thumbnail is UNDEFINED ("could not tell")', () => {
		expect(ladderBefore?.error).toBeNull();
		expect(ladderBefore?.tried).toBe(2);
		expect(ladderBefore?.item).not.toBeNull();
		expect(ladderBefore?.item && 'thumbnail' in ladderBefore.item).toBe(false);
	});
});

describe('who reads a thumbnail', () => {
	const visible = async (u: SeededUser, item: string) =>
		db.asUser(u.id, async (q) => (await q('select item_id from public.classroom_item_thumbnails where item_id = $1', [item])).rows.length);

	test('a student in the class reads a published post, and the client reads the row', async () => {
		expect(await visible(ana, html)).toBe(1);
		const rows = await db.asUser(ana.id, async (q) => (await q('select * from public.classroom_item_thumbnails where item_id = $1', [html])).rows);
		expect(readItemThumbnail(rows[0])).toMatchObject({ source: 'html', interactive: true });
	});

	test('a student of another class reads nothing; their teacher neither', async () => {
		expect(await visible(zed, html)).toBe(0);
		expect(await visible(other, html)).toBe(0);
	});

	test('a draft reaches its teacher and not the class', async () => {
		expect(await visible(teacher, draft)).toBe(1);
		expect(await visible(ana, draft)).toBe(0);
	});

	test('anon reads nothing at all', async () => {
		const msg = await refusal(db.asAnon(async (q) => q('select * from public.classroom_item_thumbnails')));
		expect(msg).toMatch(/permission denied/);
	});

	test('nobody writes the table directly, the teacher included', async () => {
		const msg = await refusal(
			db.asUser(teacher.id, async (q) =>
				q(`insert into public.classroom_item_thumbnails (item_id, source, manual) values ($1, 'none', true)`, [plain])
			)
		);
		expect(msg).toMatch(/permission denied/);
		const upd = await refusal(
			db.asUser(teacher.id, async (q) => q(`update public.classroom_item_thumbnails set interactive = false where item_id = $1`, [html]))
		);
		expect(upd).toMatch(/permission denied/);
	});
});

describe('setting a thumbnail by hand', () => {
	test('the teacher uploads a picture under the post\'s own prefix', async () => {
		const key = `${plain}/2a3b4c5d-0000-4000-8000-000000000002.png`;
		const res = await setThumb(teacher, plain, 'image', key, null, 1600, 900, 0.25, 0.75);
		expect(res.ok).toBe(true);
		expect(await row(plain)).toMatchObject({ source: 'image', manual: true, image_key: key, image_width: 1600, image_height: 900 });
		const r = await row(plain);
		expect(Number(r?.focal_x)).toBeCloseTo(0.25, 5);
		expect(Number(r?.focal_y)).toBeCloseTo(0.75, 5);
	});

	test('or picks one of the post\'s own pictures', async () => {
		const res = await setThumb(teacher, plain, 'image', null, attachment, 800, 800, 0.5, 0.5);
		expect(res.ok).toBe(true);
		expect(await row(plain)).toMatchObject({ attachment_id: attachment, image_key: null });
	});

	test('refusals, each in words', async () => {
		expect(await refusal(setThumb(teacher, plain, 'image', `${html}/x.png`))).toMatch(/different post/);
		expect(await refusal(setThumb(teacher, plain, 'image', `${plain}/x.svg`))).toMatch(/PNG, JPEG/);
		expect(await refusal(setThumb(teacher, plain, 'image', `${plain}/x.png`, attachment))).toMatch(/Choose one picture/);
		expect(await refusal(setThumb(teacher, html, 'image', null, attachment))).toMatch(/not one of this post's files/);
		expect(await refusal(setThumb(teacher, plain, 'image', `${plain}/x.png`, null, 0, 10))).toMatch(/size could not be read/);
		expect(await refusal(setThumb(teacher, plain, 'image', `${plain}/x.png`, null, 10, 10, 2, 0))).toMatch(/inside the picture/);
		expect(await refusal(setThumb(teacher, plain, 'html'))).toMatch(/picture, the generated look, or automatic/);
	});

	test('only the teacher of record: a student and another teacher are refused alike', async () => {
		const a = await refusal(setThumb(ana, plain, 'none'));
		const b = await refusal(setThumb(other, plain, 'none'));
		const c = await refusal(setThumb(teacher, elsewhere, 'none'));
		expect(a).toMatch(/Only the teacher of record/);
		expect(b).toBe(a);
		expect(c).toBe(a);
		// Not found answers exactly as not yours.
		expect(await refusal(setThumb(teacher, '00000000-0000-4000-8000-0000000000aa', 'none'))).toBe(a);
	});
});

describe('a hand-set thumbnail survives a re-upload', () => {
	test('a re-upload with a different manifest thumbnail leaves the hand-set picture alone', async () => {
		const key = `${html}/3c4d5e6f-0000-4000-8000-000000000003.webp`;
		expect((await setThumb(teacher, html, 'image', key, null, 1200, 1200, 0.5, 0.4)).ok).toBe(true);
		const before = await row(html);
		expect((await upload(html, manifest({ kind: 'image', src: PNG }, 'Hook 04 v2'))).ok).toBe(true);
		const after = await row(html);
		expect(after).toMatchObject({ source: 'image', manual: true, image_key: key });
		expect(after?.updated_at).toBe(before?.updated_at);
	});

	test('Automatic hands the post back to its current manifest', async () => {
		const res = await setThumb(teacher, html, 'auto');
		expect(res.ok).toBe(true);
		expect(await row(html)).toMatchObject({ source: 'image', manual: false, image_key: null });
	});

	test('a re-upload with an html thumbnail follows it, and moves the version', async () => {
		const before = await row(html);
		await new Promise((r) => setTimeout(r, 15));
		expect((await upload(html, manifest({ kind: 'html', template: 'idea-thumbnail' }, 'Hook 04 v3'), '<p>v3</p>')).ok).toBe(true);
		const after = await row(html);
		expect(after).toMatchObject({ source: 'html', manual: false, interactive: false, html_document_id: await documentId(html) });
		expect(after?.updated_at).not.toBe(before?.updated_at);
	});

	test('the generated look chosen by hand beats the manifest too', async () => {
		expect((await setThumb(teacher, html, 'none')).ok).toBe(true);
		await upload(html, manifest({ kind: 'html', template: 'idea-thumbnail', interactive: true }, 'Hook 04 v4'));
		expect(await row(html)).toMatchObject({ source: 'none', manual: true });
		expect((await setThumb(teacher, html, 'auto')).ok).toBe(true);
		expect(await row(html)).toMatchObject({ source: 'html', interactive: true });
	});

	test('a manifest with no thumbnail leaves no automatic row; removing the document too', async () => {
		await upload(html, manifest(undefined, 'Hook 04 v5'));
		expect(await row(html)).toBeNull();
		await upload(html, manifest({ kind: 'html', template: 'idea-thumbnail' }, 'Hook 04 v6'));
		expect(await row(html)).not.toBeNull();
		expect((await rpc<Json>(admin, 'public.classroom_set_html_assignment($1::uuid, null, null, null)', [html])).ok).toBe(true);
		expect(await row(html)).toBeNull();
	});

	test('removing the document keeps a hand-set thumbnail', async () => {
		await upload(pic, manifest({ kind: 'image', src: PNG }, 'Hook 05 v2'));
		expect((await setThumb(teacher, pic, 'none')).ok).toBe(true);
		await rpc<Json>(admin, 'public.classroom_set_html_assignment($1::uuid, null, null, null)', [pic]);
		expect(await row(pic)).toMatchObject({ source: 'none', manual: true });
	});
});

describe('framing and the class default', () => {
	test('a focus nudge moves the point and never the manual flag', async () => {
		await upload(pic, manifest({ kind: 'image', src: PNG }, 'Hook 05 v3'));
		await setThumb(teacher, pic, 'auto');
		const res = await rpc<Json>(teacher, 'public.classroom_set_item_thumbnail_focus($1::uuid, 0.1::real, 0.9::real)', [pic]);
		expect(res.ok).toBe(true);
		const r = await row(pic);
		expect(r).toMatchObject({ source: 'image', manual: false });
		expect(Number(r?.focal_x)).toBeCloseTo(0.1, 5);
		expect(await refusal(rpc(teacher, 'public.classroom_set_item_thumbnail_focus($1::uuid, 0.5::real, 0.5::real)', [draft]))).toMatch(
			/not a picture/
		);
		expect(await refusal(rpc(ana, 'public.classroom_set_item_thumbnail_focus($1::uuid, 0.5::real, 0.5::real)', [pic]))).toMatch(
			/Only the teacher of record/
		);
	});

	test('the class default is the teacher\'s, from four shapes or none', async () => {
		const set = (u: SeededUser, shape: string | null) =>
			rpc<Json>(u, 'public.classroom_set_section_thumbnail_shape($1::uuid, $2)', [s1, shape]);
		expect((await set(teacher, 'banner')).shape).toBe('banner');
		const read = async () => (await db.sql<{ s: string | null }>('select thumbnail_shape as s from public.classroom_sections where id = $1', [s1])).rows[0].s;
		expect(await read()).toBe('banner');
		expect(await refusal(set(ana, 'tile'))).toMatch(/Only the teacher of record/);
		expect(await refusal(set(other, 'tile'))).toMatch(/Only the teacher of record/);
		expect(await refusal(set(teacher, 'square'))).toMatch(/Off, Tile, Wide or Banner/);
		expect(await read()).toBe('banner');
		await set(teacher, null);
		expect(await read()).toBeNull();
		// A student reads the column through the sections policy they already have.
		const seen = await db.asUser(ana.id, async (q) => (await q('select thumbnail_shape from public.classroom_sections where id = $1', [s1])).rows);
		expect(seen).toHaveLength(1);
	});

	test("the home page's read carries the class default, and degrades past a database without it", async () => {
		await rpc(teacher, 'public.classroom_set_section_thumbnail_shape($1::uuid, $2)', [s1, 'banner']);
		const asked = await homeWork(ana);
		expect(asked.ready).toBe(true);
		expect(asked.sections.map((x) => [x.id, x.thumbnail_shape])).toEqual([[s1, 'banner']]);
		// Not asked: the key is absent ("not read"), never a claimed default.
		const plain = await homeWork(ana, false);
		expect(plain.sections.map((x) => 'thumbnail_shape' in x)).toEqual([false]);
		await rpc(teacher, 'public.classroom_set_section_thumbnail_shape($1::uuid, $2)', [s1, null]);
		expect((await homeWork(ana)).sections.map((x) => x.thumbnail_shape)).toEqual([null]);
		// Before 0268 the widest rung was refused and the read still answered.
		expect(homeBefore).toEqual({ ready: true, keys: [false] });
	});

	test('deleting a picked attachment clears the reference instead of being refused', async () => {
		await setThumb(teacher, plain, 'image', null, attachment, 800, 800, 0.5, 0.5);
		await rpc(teacher, 'public.classroom_delete_attachment($1::uuid)', [attachment]);
		expect(await row(plain)).toMatchObject({ source: 'image', manual: true, attachment_id: null });
		// Which the client draws as the generated identity.
		const r = await row(plain);
		expect(readItemThumbnail(r)).toMatchObject({ source: 'image', attachment_id: null, image_key: null });
	});
});

describe('the grants, read from the catalog', () => {
	test('the three writes are authenticated-only; the helpers are nobody\'s', async () => {
		const { rows } = await db.sql<{ fn: string; anon: boolean; auth: boolean }>(`
			select p.oid::regprocedure::text as fn,
			       has_function_privilege('anon', p.oid, 'execute') as anon,
			       has_function_privilege('authenticated', p.oid, 'execute') as auth
			  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and p.proname in ('classroom_set_item_thumbnail', 'classroom_set_item_thumbnail_focus',
			                     'classroom_set_section_thumbnail_shape', '_classroom_manifest_thumbnail',
			                     '_classroom_html_may_carry_template',
			                     '_classroom_thumbnail_sync', '_classroom_thumbnail_follow_document')
			 order by 1`);
		expect(rows).toHaveLength(7);
		for (const r of rows) {
			expect(r.anon, r.fn).toBe(false);
			expect(r.auth, r.fn).toBe(!r.fn.startsWith('_'));
		}
		// Exactly one overload of each write.
		const writes = rows.filter((r) => !r.fn.startsWith('_'));
		expect(writes.map((r) => r.fn.split('(')[0]).sort()).toEqual([
			'classroom_set_item_thumbnail',
			'classroom_set_item_thumbnail_focus',
			'classroom_set_section_thumbnail_shape'
		]);
	});

	test('the table: select for authenticated, nothing else for anyone', async () => {
		const { rows } = await db.sql<{ role: string; priv: string; has: boolean }>(`
			select r.role, p.priv, has_table_privilege(r.role, 'public.classroom_item_thumbnails', p.priv) as has
			  from (values ('anon'), ('authenticated')) r(role),
			       (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p(priv)`);
		const granted = rows.filter((r) => r.has).map((r) => `${r.role}:${r.priv}`);
		expect(granted).toEqual(['authenticated:select']);
	});
});
