// tests/db/classroom-import-roster-class.test.ts
//
// MIGRATION 0314 (ledger 0463): a roster row may name its class by id or by
// name. On 2026-10-28 the IDEA 100 Section 3 import refused all 21 rows with
// course_not_found because each row named the class by its id.
//
// The chain is every migration before the file, read off disk behind the
// fixture completion (the database production holds before the apply); the
// classes and a first roster go in through the REAL deployed RPCs; a corpus of
// rows the deployed site sends is put to the DEPLOYED body; then the file goes
// on top and the same corpus runs again, case for case.
//
// What a wrong answer here would look like, and why each is silent:
//   - A ROW LANDS IN A CLASS THE CALLER DOES NOT MANAGE. The summary still
//     says "created"; nothing on the importing page shows another teacher's
//     roster.
//   - A NAME FITTING TWO CLASSES IS GUESSED, and 21 students land in the
//     wrong section with every row reading ok.
//   - A ROW THE DEPLOYED SITE SENDS IS PLACED DIFFERENTLY after the apply.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { scanFile } from '../../tools/apply-migration.mjs';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { canExecute, catalogFingerprint, pasteTrap } from './chain-0230';
import { migrationFile, migrationSql, treeShortOf } from './chain-0436';

/** This file's number. Renamed in one place if somebody lands a migration first. */
const N = '0314';
const SQL = migrationSql(N);

type Result = { row: number; email: string; ok: boolean; reason?: string; action?: string; section_id?: string; candidates?: string[] };
type Summary = { total: number; succeeded: number; refused: number; results: Result[] };
type Row = Record<string, string>;

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let other: SeededUser;
let student: SeededUser;

let s3: string; // IDEA100 label "3", the teacher's: "IDEA100 · Section 3"
let s4: string; // IDEA100 label "4", the teacher's
let b2: string; // IDEA209H label "Block 2", the other teacher's
let twinMine: string; // IDEA210 label "1", the teacher's
let twinTheirs: string; // IDEA21 label "01", the other teacher's: also "IDEA210 1" when said
let preFingerprint: string;
let corpusBefore: unknown[];

async function importRoster(u: SeededUser, rows: Row[]): Promise<Summary> {
	return db.asUser(u.id, async (q) => (await q<{ r: Summary }>('select public.classroom_import_roster($1::jsonb) as r', [JSON.stringify(rows)])).rows[0].r);
}
async function attempt(u: SeededUser, rows: Row[]): Promise<unknown> {
	try {
		const r = await importRoster(u, rows);
		// Only what a caller reads, never ids that differ run to run.
		return { ...r, results: r.results.map(({ section_id: _s, ...x }) => x) };
	} catch (e) {
		return { error: (e as Error).message };
	}
}
async function sectionOf(email: string): Promise<string[]> {
	return (await db.sql<{ s: string }>('select section_id::text as s from public.classroom_enrollments where student_email = $1 order by 1', [email])).rows.map((r) => r.s);
}

/** Rows the deployed site sends (the console and the People tab), and refusals. */
function corpus(): Array<[() => SeededUser, Row[]]> {
	return [
		[() => teacher, [{ email: 'c1@boscotech.net', name: 'One, C', course_code: 'IDEA100', section_label: '3' }]],
		[() => teacher, [{ email: 'c2@boscotech.net', name: 'Two, C', course_code: 'idea100', section_label: '4' }]],
		[() => teacher, [{ email: 'c3@boscotech.net', course_code: 'NOPE', section_label: '3' }]],
		[() => teacher, [{ email: 'c4@boscotech.net', course_code: 'IDEA100', section_label: '9' }]],
		[() => teacher, [{ email: 'c5@boscotech.net', course_code: 'IDEA209H', section_label: 'Block 2' }]],
		[() => teacher, [{ email: 'not-an-address', course_code: 'IDEA100', section_label: '3' }]],
		[() => teacher, [{ email: 'c6@boscotech.net', course_code: '', section_label: '' }]],
		[() => student, [{ email: 'c7@boscotech.net', course_code: 'IDEA100', section_label: '3' }]]
	];
}
async function runCorpus(): Promise<unknown[]> {
	const out: unknown[] = [];
	for (const [u, rows] of corpus()) out.push(await attempt(u(), rows));
	return out;
}

beforeAll(async () => {
	db = await startTestDb(treeShortOf(N));
	admin = await createUser(db, 'apina@boscotech.edu', 'Mr. Pina');
	teacher = await createUser(db, 'teach@boscotech.edu', 'A Teacher');
	other = await createUser(db, 'other@boscotech.edu', 'Other Teacher');
	student = await createUser(db, 'kid@boscotech.net', 'A Student');
	s3 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering Foundations', label: '3', teacherEmail: teacher.email });
	s4 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', label: '4', teacherEmail: teacher.email });
	b2 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', label: 'Block 2', teacherEmail: other.email });
	// Two classes one spoken name fits: "IDEA210 1" is both IDEA210 label "1"
	// and IDEA21 label "01". The teacher teaches one of them.
	twinMine = await createClassroomSection(db, { as: admin, courseCode: 'IDEA210', label: '1', teacherEmail: teacher.email });
	twinTheirs = await createClassroomSection(db, { as: admin, courseCode: 'IDEA21', label: '01', teacherEmail: other.email });
	await enrollStudent(db, { as: admin, sectionId: s3, email: 'existing@boscotech.net', displayName: 'Existing, Ann' });

	corpusBefore = await runCorpus();
	// The corpus's own rows go, so the second run meets the same roster.
	await db.sql(`delete from public.classroom_enrollments where student_email like 'c_@boscotech.net'`);
	preFingerprint = await catalogFingerprint(db);
	await db.sql(SQL);
}, 900_000);

afterAll(async () => {
	await db?.stop();
});

describe(`${N} as a file`, () => {
	test('it passes the apply tool scan and the paste trap; the planted controls do not', () => {
		expect(scanFile(SQL).findings).toEqual([]);
		expect(scanFile('insert into public.classroom_enrollments (section_id) values (null);').findings).toHaveLength(1);
		expect(pasteTrap(SQL)).toEqual([]);
		expect(pasteTrap('select 1; -- a $ here')).toHaveLength(1);
	});

	test('its first object is new in this file, so the deploy probe can see it applied', () => {
		const first = /\bcreate\s+(?:or\s+replace\s+)?(?:function|table|policy|index)\s+([\w.]+)/i.exec(SQL);
		expect(first?.[1]).toBe('public._classroom_roster_section');
		expect(migrationFile(N)).toBe(`${N}_classroom_import_roster_class.sql`);
		const earlier = treeShortOf(N).slice(1).map((f) => migrationSql(f.slice(0, 4)));
		expect(earlier.some((t) => t.includes('_classroom_roster_section'))).toBe(false);
		expect(earlier.some((t) => t.includes('classroom_import_roster'))).toBe(true);
	});

	test('a second paste changes nothing in the catalog, and the first changed something', async () => {
		const after = await catalogFingerprint(db);
		expect(after).not.toEqual(preFingerprint);
		await db.sql(SQL);
		expect(await catalogFingerprint(db)).toEqual(after);
	});

	test('one form of the import, authenticated only; nobody calls the class lookup', async () => {
		const n = (await db.sql<{ n: number }>(`select count(*)::int as n from pg_proc where proname = 'classroom_import_roster'`)).rows[0].n;
		expect(n).toBe(1);
		expect(await canExecute(db, 'authenticated', 'classroom_import_roster(jsonb)')).toBe(true);
		expect(await canExecute(db, 'anon', 'classroom_import_roster(jsonb)')).toBe(false);
		expect(await canExecute(db, 'authenticated', '_classroom_roster_section(text)')).toBe(false);
		expect(await canExecute(db, 'anon', '_classroom_roster_section(text)')).toBe(false);
	});
});

describe('every row the deployed site sends answers as before', () => {
	test('the corpus is identical, case for case, and it is not all one answer', async () => {
		const after = await runCorpus();
		expect(after).toEqual(corpusBefore);
		expect(after).toHaveLength(8);
		const reasons = (after as Array<{ results?: Result[]; error?: string }>).map((o) => o.error ?? o.results?.[0]?.reason ?? 'ok');
		expect(reasons).toEqual(['ok', 'ok', 'course_not_found', 'section_not_found', 'not_your_section', 'bad_email', 'course_not_found', 'Only staff can import a classroom roster.']);
	});
});

describe('the class by id or by name', () => {
	test('the 2026-10-28 file: 21 rows naming the class by its id all land in that class', async () => {
		const rows = Array.from({ length: 21 }, (_, i) => ({ email: `s${i}@boscotech.net`, name: `Student, ${i}`, section_id: s3 }));
		const r = await importRoster(teacher, rows);
		expect(r).toMatchObject({ total: 21, succeeded: 21, refused: 0 });
		expect(r.results.every((x) => x.ok && x.section_id === s3)).toBe(true);
		for (const i of [0, 20]) expect(await sectionOf(`s${i}@boscotech.net`)).toEqual([s3]);
	});

	test('the id in the course column, the label column, or under class or class_id, lands the same', async () => {
		const shapes: Row[] = [
			{ email: 'k1@boscotech.net', course_code: s3, section_label: '' },
			{ email: 'k2@boscotech.net', course_code: s3.toUpperCase() },
			{ email: 'k3@boscotech.net', course_code: '', section_label: s3 },
			{ email: 'k4@boscotech.net', class: s3 },
			{ email: 'k5@boscotech.net', class_id: s3 }
		];
		const r = await importRoster(teacher, shapes);
		expect(r.succeeded).toBe(5);
		for (const x of shapes) expect(await sectionOf(x.email)).toEqual([s3]);
	});

	test('the class by name, every way it is said, lands in it; another class by name lands in that one', async () => {
		const said = ['IDEA100 Section 3', 'IDEA 100 Section 3', 'idea100 section 3', 'IDEA100 · Section 3', '100 Section 3', 'IDEA100 3'];
		const r = await importRoster(teacher, said.map((c, i) => ({ email: `n${i}@boscotech.net`, class: c })));
		expect(r.results.map((x) => x.reason ?? 'ok')).toEqual(said.map(() => 'ok'));
		for (let i = 0; i < said.length; i++) expect(await sectionOf(`n${i}@boscotech.net`)).toEqual([s3]);
		const four = await importRoster(teacher, [{ email: 'n9@boscotech.net', class: 'IDEA100 Section 4' }]);
		expect(four.succeeded).toBe(1);
		expect(await sectionOf('n9@boscotech.net')).toEqual([s4]);
	});

	test('a class the caller does not manage is refused by id and by name, and nothing lands', async () => {
		const r = await importRoster(teacher, [
			{ email: 'x1@boscotech.net', section_id: b2 },
			{ email: 'x2@boscotech.net', class: 'IDEA209H Block 2' }
		]);
		expect(r.results.map((x) => x.reason)).toEqual(['not_your_section', 'not_your_section']);
		expect(await sectionOf('x1@boscotech.net')).toEqual([]);
		expect(await sectionOf('x2@boscotech.net')).toEqual([]);
		// Positive control: the class's own teacher lands the same rows.
		const ok = await importRoster(other, [{ email: 'x1@boscotech.net', section_id: b2 }]);
		expect(ok.succeeded).toBe(1);
		expect(await sectionOf('x1@boscotech.net')).toEqual([b2]);
	});

	test('a name nobody has, an unknown id, and a name two classes share are refused, never guessed', async () => {
		const r = await importRoster(admin, [
			{ email: 'u1@boscotech.net', class: 'IDEA999 Section 3' },
			{ email: 'u2@boscotech.net', section_id: '00000000-0000-4000-8000-000000000000' },
			{ email: 'u3@boscotech.net', class: 'IDEA210 1' }
		]);
		expect(r.results.map((x) => x.reason)).toEqual(['class_not_found', 'class_not_found', 'class_ambiguous']);
		expect(r.results[2].candidates?.length).toBe(2);
		for (const e of ['u1', 'u2', 'u3']) expect(await sectionOf(`${e}@boscotech.net`)).toEqual([]);
		// The teacher of one of the two is answered with theirs: it is the only one they could mean.
		const mine = await importRoster(teacher, [{ email: 'u3@boscotech.net', class: 'IDEA210 1' }]);
		expect(mine.succeeded).toBe(1);
		expect(await sectionOf('u3@boscotech.net')).toEqual([twinMine]);
		expect(twinTheirs).not.toBe(twinMine);
	});

	test('re-importing by id updates in place and never duplicates', async () => {
		const r = await importRoster(teacher, [{ email: 'existing@boscotech.net', name: 'Existing, Ann B', section_id: s3 }]);
		expect(r.results[0].action).toBe('updated');
		const n = (await db.sql<{ n: number }>(`select count(*)::int as n from public.classroom_enrollments where student_email = 'existing@boscotech.net'`)).rows[0].n;
		expect(n).toBe(1);
	});
});
