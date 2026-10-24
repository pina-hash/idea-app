// tests/db/classroom-duplicate-html-assignment.test.ts
//
// MIGRATION 0298 (ledger 0431): a duplicated HTML assignment carries its
// document, and the item page's heartbeat answers the caller's own lock.
//
// The chain is every migration before 0298, read off disk behind the fixture
// completion (what production holds before the apply). Everything is seeded
// through the REAL pre-0298 RPCs, the deployed duplicate is measured FIRST
// (it drops the document), then 0298 goes on top and the same calls run again.
//
// What a wrong answer here would look like, and why each is silent:
//   - THE COPY HAS NO DOCUMENT. It reads as a plain assignment with a rubric;
//     nothing anywhere errors.
//   - THE COPY HAS ANOTHER ITEM'S DOCUMENT. Two HTML assignments live in two
//     classes here, and each copy is compared byte for byte against the
//     literal this file wrote for ITS source, never against what the database
//     returned for the source.
//   - THE COPY SHARES THE SOURCE'S SERVING HANDLE. Both would answer at one
//     /hx address and a re-upload of either would be served for both.
//   - THE LOCK KEY NAMES SOMEBODY ELSE'S ROW, or never moves on a close.
//
// The read-only SELECT Mr. Pina pastes to list the duplicates already left
// empty is read out of docs/feedback/2026-10-23/RESULTS-0431.md, so the query
// tested is the query he runs.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { canExecute, catalogFingerprint, pasteTrap } from './chain-0230';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations');
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';
const ALL = readdirSync(MIGRATIONS_DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();
const FILES = ALL.filter((f) => f.endsWith('_html_assignment_duplicate_and_live_lock.sql'));
if (FILES.length !== 1) throw new Error(`expected exactly one duplicate-and-lock migration, found ${FILES.length}`);
const FILE = FILES[0];
const NUMBER = FILE.slice(0, 4);
const PRE = [FIXTURE_COMPLETION, ...ALL.filter((f) => f < FILE)];
/** Read once when the suite loads, so a mutation run reads the mutant. */
const SQL = readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8');

const RESULTS = readFileSync(join(ROOT, 'docs/feedback/2026-10-23/RESULTS-0431.md'), 'utf8');
const EMPTY_DUPLICATES_SQL = (() => {
	const m = /<!-- empty-duplicates-sql:start -->\s*```sql\n([\s\S]*?)```\s*<!-- empty-duplicates-sql:end -->/.exec(RESULTS);
	if (!m) throw new Error('RESULTS-0431.md carries no empty-duplicates SELECT');
	return m[1];
})();

function manifest(title: string, course: string, blockId: string) {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title,
		course,
		points: 4,
		header: [{ id: `${blockId}-who`, field: 'studentName', type: 'text' }],
		modules: [
			{
				id: 'm1',
				title: 'Only module',
				points: 4,
				audience: 'individual',
				blocks: [{ id: blockId, field: 'answer', type: 'longText', minSentences: 1 }],
				criteria: [
					{
						id: 'm1-c',
						text: 'Answered',
						points: 4,
						levels: [
							{ points: 4, label: 'Complete', short: 'Done', descriptor: 'Answered.' },
							{ points: 2, label: 'Developing', short: 'Partial', descriptor: 'Partly answered.' },
							{ points: 0, label: 'Absent', short: 'None', descriptor: 'Not answered.' }
						]
					}
				]
			}
		]
	};
}

function documentFor(title: string, m: unknown): string {
	return [
		'<!doctype html>',
		`<html><head><title>${title}</title></head><body>`,
		'  <input data-field="studentName"><textarea data-field="answer"></textarea>',
		`  <script type="application/json" id="idea-manifest">${JSON.stringify(m)}<\/script>`,
		'</body></html>'
	].join('\n');
}

const RUBRIC = [
	{
		id: 'm1-c',
		criterion: 'Answered',
		points: 4,
		levels: [
			{ points: 4, label: 'Complete', descriptor: 'Answered.' },
			{ points: 2, label: 'Developing', descriptor: 'Partly answered.' },
			{ points: 0, label: 'Absent', descriptor: 'Not answered.' }
		]
	}
];

let db: TestDb;
let preFingerprint: string;
let admin: SeededUser;
let teacher: SeededUser;
let ana: SeededUser;
let sectionA: string;
let sectionB: string;
let itemA: string;
let itemB: string;
let specItem: string;
const MANIFEST_A = manifest('Shop Fix Design', 'IDEA209H', 'a1-answer');
const MANIFEST_B = manifest('Fit Lab', 'IDEA100', 'b1-answer');
const DOC_A = documentFor('Shop Fix Design', MANIFEST_A);
const DOC_B = documentFor('Fit Lab', MANIFEST_B);
let copiedBefore: string;

async function rpc<T = Record<string, unknown>>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

async function createAssignment(title: string, into: string): Promise<string> {
	const r = await rpc<{ item_id: string }>(
		teacher,
		`public.classroom_create_item(p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
			p_body => $3, p_points => 4, p_published => true)`,
		[[into], title, `${title} body.`]
	);
	return r.item_id;
}

async function htmlRow(itemId: string) {
	const { rows } = await db.sql<{
		document: string;
		manifest: unknown;
		filename: string;
		show_title: boolean;
		document_id: string;
		imported_by: string;
	}>('select document, manifest, filename, show_title, document_id, imported_by from public.classroom_html_assignments where item_id = $1', [
		itemId
	]);
	return rows[0] ?? null;
}

async function version(itemId: string): Promise<number | null> {
	const { rows } = await db.sql<{ v: number | null }>(
		'select assignment_schema_version as v from public.classroom_items where id = $1',
		[itemId]
	);
	return rows[0].v;
}

async function duplicate(itemId: string, sections: string[] | null = null): Promise<string> {
	const r = await rpc<{ item_id: string }>(teacher, 'public.classroom_duplicate_item($1::uuid, $2::uuid[])', [itemId, sections]);
	return r.item_id;
}

async function emptyDuplicates(): Promise<{ course: string; class: string; post_title: string; post_id: string; copied_from: string }[]> {
	const { rows } = await db.sql<{ course: string; class: string; post_title: string; post_id: string; copied_from: string }>(
		EMPTY_DUPLICATES_SQL
	);
	return rows;
}

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
	teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
	ana = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
	sectionA = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', label: 'Block 2', teacherEmail: teacher.email });
	sectionB = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', label: 'Block 1', teacherEmail: teacher.email });
	await enrollStudent(db, { as: teacher, sectionId: sectionA, email: ana.email, displayName: ana.email });

	itemA = await createAssignment('Shop Fix Design', sectionA);
	itemB = await createAssignment('Fit Lab', sectionB);
	specItem = await createAssignment('Plain assignment', sectionA);
	await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [itemA, DOC_A, JSON.stringify(MANIFEST_A), 'shop-fix.html']);
	await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [itemB, DOC_B, JSON.stringify(MANIFEST_B), 'fit-lab.html']);
	// A and B share a rubric on purpose, so the pre-fix copy of A matches B on
	// the rubric too and the SELECT must still name A (the title match wins).
	for (const id of [itemA, itemB]) {
		await rpc(teacher, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [id, JSON.stringify(RUBRIC)]);
	}
	await rpc(teacher, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
		specItem,
		JSON.stringify([{ ...RUBRIC[0], criterion: 'Plain work' }])
	]);
	await rpc(admin, 'public.classroom_html_set_show_title($1::uuid, true)', [itemA]);
	// A student answer on the source: a duplicate must never carry it.
	await rpc(ana, `public.classroom_save_response($1::uuid, 'a1-answer', $2::jsonb)`, [itemA, JSON.stringify({ text: 'It fits now.' })]);

	// THE DEPLOYED DUPLICATE, measured before the file goes on.
	copiedBefore = await duplicate(itemA);

	preFingerprint = await catalogFingerprint(db);
	await db.sql(SQL);
}, 900_000);

afterAll(async () => {
	await db?.stop();
});

describe(`${NUMBER} as a file`, () => {
	test('it passes the apply tool scan and the paste trap; the planted controls do not', () => {
		const scan = scanFile(SQL);
		expect(scan.findings).toEqual([]);
		expect(scan.selfManagedTransaction).toBe(false);
		expect(scanFile("insert into public.classroom_items (kind) values ('post');").findings).toHaveLength(1);
		expect(pasteTrap(SQL)).toEqual([]);
		expect(pasteTrap('select 1; -- a $ here')).toHaveLength(1);
		// The SELECT Mr. Pina pastes goes through the same splitter.
		expect(pasteTrap(EMPTY_DUPLICATES_SQL)).toEqual([]);
		expect(/\b(insert|update|delete|alter|drop|create|grant|truncate)\b/i.test(EMPTY_DUPLICATES_SQL)).toBe(false);
	});

	test('the first object it creates is new in this file, so the deploy probe can see it applied', () => {
		const first = /\bcreate\s+(?:or\s+replace\s+)?(?:function|table|policy|index)\s+([\w.]+)/i.exec(SQL);
		expect(first?.[1]).toBe('public._classroom_duplicate_work_surface');
		const earlier = ALL.filter((x) => x < FILE).map((x) => readFileSync(join(MIGRATIONS_DIR, x), 'utf8'));
		expect(earlier.some((t) => t.includes('_classroom_duplicate_work_surface'))).toBe(false);
		expect(earlier.some((t) => t.includes('classroom_duplicate_item'))).toBe(true);
	});

	test('a second paste changes no catalog object, and the first changed something', async () => {
		const after = await catalogFingerprint(db);
		expect(after).not.toEqual(preFingerprint);
		await db.sql(SQL);
		expect(await catalogFingerprint(db)).toEqual(after);
	});

	test('grants: the duplicate and the beat for signed-in callers only, the helper for nobody', async () => {
		for (const sig of ['classroom_duplicate_item(uuid, uuid[])', 'classroom_presence_ping(uuid, boolean, boolean)']) {
			expect(await canExecute(db, 'anon', sig)).toBe(false);
			expect(await canExecute(db, 'authenticated', sig)).toBe(true);
		}
		expect(await canExecute(db, 'anon', '_classroom_duplicate_work_surface(uuid, uuid)')).toBe(false);
		expect(await canExecute(db, 'authenticated', '_classroom_duplicate_work_surface(uuid, uuid)')).toBe(false);
	});
});

describe('before the file: the deployed duplicate drops the document', () => {
	test('the pre-fix copy has a rubric and no worksheet', async () => {
		expect(await htmlRow(copiedBefore)).toBeNull();
		expect(await version(copiedBefore)).toBeNull();
		const { rows } = await db.sql<{ n: number }>('select count(*)::int as n from public.classroom_rubrics where item_id = $1', [copiedBefore]);
		expect(rows[0].n).toBe(1);
	});

	test("Mr. Pina's read-only SELECT lists that copy, and nothing else", async () => {
		const rows = await emptyDuplicates();
		expect(rows.map((r) => r.post_id)).toEqual([copiedBefore]);
		expect(rows[0]).toMatchObject({ course: 'IDEA209H', class: 'Block 2', post_title: 'Shop Fix Design (copy)', copied_from: 'Shop Fix Design' });
	});
});

describe('after the file: the copy carries its own document', () => {
	let copyA: string;
	let copyB: string;
	let copySpec: string;
	let copyAIntoB: string;

	beforeAll(async () => {
		copyA = await duplicate(itemA);
		copyB = await duplicate(itemB);
		copySpec = await duplicate(specItem);
		copyAIntoB = await duplicate(itemA, [sectionB]);
	});

	test("each copy's document matches its OWN source byte for byte, never the other class's", async () => {
		for (const [copy, doc, m, filename] of [
			[copyA, DOC_A, MANIFEST_A, 'shop-fix.html'],
			[copyAIntoB, DOC_A, MANIFEST_A, 'shop-fix.html'],
			[copyB, DOC_B, MANIFEST_B, 'fit-lab.html']
		] as const) {
			const row = await htmlRow(copy);
			expect(row).not.toBeNull();
			expect(row!.document).toBe(doc);
			expect(Buffer.from(row!.document).equals(Buffer.from(doc))).toBe(true);
			expect(row!.manifest).toEqual(m);
			expect(row!.filename).toBe(filename);
			expect(row!.imported_by).toBe(teacher.email);
			expect(await version(copy)).toBe(3);
		}
		expect((await htmlRow(copyB))!.document).not.toBe(DOC_A);
	});

	test('the show-title switch comes along; the serving handle is new', async () => {
		expect((await htmlRow(copyA))!.show_title).toBe(true);
		expect((await htmlRow(copyB))!.show_title).toBe(false);
		const handles = new Set([
			(await htmlRow(itemA))!.document_id,
			(await htmlRow(copyA))!.document_id,
			(await htmlRow(copyAIntoB))!.document_id
		]);
		expect(handles.size).toBe(3);
	});

	test('the rubric comes along; the student answer and the hand-in do not', async () => {
		const { rows } = await db.sql<{ criteria: unknown }>('select criteria from public.classroom_rubrics where item_id = $1', [copyA]);
		expect(rows[0].criteria).toMatchObject(RUBRIC);
		const answers = await db.sql<{ n: number }>('select count(*)::int as n from public.classroom_responses where item_id = $1', [copyA]);
		const source = await db.sql<{ n: number }>('select count(*)::int as n from public.classroom_responses where item_id = $1', [itemA]);
		expect(source.rows[0].n).toBe(1);
		expect(answers.rows[0].n).toBe(0);
	});

	test('a plain assignment copies with no document and no version (the control)', async () => {
		expect(await htmlRow(copySpec)).toBeNull();
		expect(await version(copySpec)).toBeNull();
	});

	test('a student cannot reach the private copy helper', async () => {
		await expect(rpc(ana, 'public._classroom_duplicate_work_surface($1::uuid, $2::uuid)', [itemA, specItem])).rejects.toThrow(
			/permission denied/
		);
		expect(await htmlRow(specItem)).toBeNull();
	});

	test('the SELECT still lists only the pre-fix copy: the fixed copies are not empty', async () => {
		const rows = await emptyDuplicates();
		expect(rows.map((r) => r.post_id)).toEqual([copiedBefore]);
	});

	test("the connector's duplicate_post calls this same function, so it gets the fix", () => {
		const yaml = readFileSync(join(ROOT, 'src/lib/server/connector/registry/classroom.yaml'), 'utf8');
		expect(/classroom_duplicate_item:\n\s+surface: tool\n\s+tool: duplicate_post/.test(yaml)).toBe(true);
	});
});

describe('the heartbeat answers the caller its own lock', () => {
	type Beat = { ok: boolean; lock: { state: string; submitted_at: string | null } | null };
	const beat = async (who: SeededUser = ana) => rpc<Beat>(who, 'public.classroom_presence_ping($1::uuid, true, true)', [itemA]);

	test('an open worksheet reads draft; a close reads submitted with no hand-in time; a reopen reads draft again', async () => {
		const open = await beat();
		expect(open.ok).toBe(true);
		expect('lock' in open).toBe(true);
		// An answer alone may open no hand-in row: null and draft both read open.
		expect(open.lock === null || open.lock.state === 'draft').toBe(true);

		await rpc(teacher, 'public.classroom_close_assignment($1::uuid, null, true)', [itemA]);
		// The second beat inside 20 seconds is the THROTTLED return, which must
		// carry the key too, or a close would wait for the next unthrottled beat.
		const closed = await beat();
		expect(closed.lock).toEqual({ state: 'submitted', submitted_at: null });

		await rpc(teacher, 'public.classroom_close_assignment($1::uuid, null, false)', [itemA]);
		expect((await beat()).lock?.state).toBe('draft');
	});

	test('a student with no row on the item reads null, not a classmate\'s row', async () => {
		const ben = await createUser(db, 'ben.ortiz@boscotech.net', 'Ben Ortiz');
		await enrollStudent(db, { as: teacher, sectionId: sectionA, email: ben.email, displayName: ben.email });
		const r = await beat(ben);
		expect(r.ok).toBe(true);
		expect(r.lock).toBeNull();
	});
});
