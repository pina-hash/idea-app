// tests/db/classroom-grade-protection.test.ts
//
// GRADE PROTECTION AND THE NEEDS-GRADING READ (ledger 0457, migration 0315,
// reports 2044c229 and ba704a08). The chain is booted SHORT of 0315 and the
// world is graded through the REAL grading RPCs first: Mr. Cosso's grade in
// the Block 4 class, held and returned grades, an HTML post with answers and
// no grade, and one with a grade. Then 0315 is applied over the top, so every
// assertion is about grades that existed before it.
//
// Silent-regression guarantees, each with a planted control:
//   - in a protected class, no door (one grade, typed score, the bulk batch,
//     revoke, unreturn) changes a grade somebody else gave, and each refusal is
//     recorded; an empty grade is filled; the same doors work in an
//     unprotected class (the control);
//   - the needs-grading read lists exactly the past-due work that is saved and
//     ungraded, and leaves out an excluded class (mutation-proved).

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';

type Json = Record<string, unknown>;

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILE = '0315_classroom_grade_protection_and_queue.sql';
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < FILE.slice(0, 4))];

let db: TestDb;
let pina: SeededUser;
let cosso: SeededUser;
let b2: string;
let b4: string;
let shared: string;
let html: string;
let fresh: string;
const ana = 'ana@boscotech.net'; // Block 2
const ben = 'ben@boscotech.net'; // Block 2
const cy = 'cy@boscotech.net'; // Block 4, graded by Mr. Cosso
const dee = 'dee@boscotech.net'; // Block 4, no grade yet
const eli = 'eli@boscotech.net'; // Block 4, graded by Mr. Pina himself

const rpc = <T = Json>(u: SeededUser, call: string, params: unknown[] = []) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);

async function row(item: string, email: string) {
	const { rows } = await db.sql<{ score: string | null; graded_by: string | null; state: string; returned: boolean }>(
		`select score::text, graded_by, state, returned_at is not null as returned
		 from public.classroom_submissions where item_id = $1 and student_email = $2`,
		[item, email]
	);
	return rows[0] ?? null;
}
const direct = (u: SeededUser, item: string, email: string, score: number, ret = true) =>
	rpc<Json>(u, `public.classroom_grade_direct($1::uuid, $2, $3::numeric, 'ok', $4, null)`, [item, email, score, ret]);
const rubric = (u: SeededUser, item: string, email: string, score: number, ret = true) =>
	rpc<Json>(u, `public.classroom_grade_submission($1::uuid, $2, $3::jsonb, null, $4, '{}'::jsonb, null)`, [item, email, JSON.stringify({ c1: score }), ret]);
const LEVELS = [
	{ label: 'Full', short: 'Full', points: 10, descriptor: 'All of it.' },
	{ label: 'Half', short: 'Half', points: 5, descriptor: 'Half.' },
	{ label: 'None', short: 'None', points: 0, descriptor: 'None.' }
];

beforeAll(async () => {
	db = await startTestDb(PRE);
	pina = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	// Not the seeded admin address (0067 seeds wcosso as an admin): a plain teacher.
	cosso = await createUser(db, 'colleague@boscotech.edu', 'Colleague Teacher');
	for (const e of [ana, ben, cy, dee, eli]) await createUser(db, e, e.split('@')[0]);
	b2 = await createClassroomSection(db, { as: pina, courseCode: 'IDEA209H', courseTitle: 'Engineering I Honors', label: 'Section 1', teacherEmail: pina.email });
	await db.sql(`update public.classroom_sections set block = '2' where id = $1`, [b2]);
	b4 = await createClassroomSection(db, { as: pina, courseCode: 'IDEA209H', courseTitle: 'Engineering I Honors', label: 'Section 3', teacherEmail: cosso.email });
	await db.sql(`update public.classroom_sections set block = '4' where id = $1`, [b4]);
	const old = new Date(Date.now() - 90 * 86400000).toISOString();
	for (const e of [ana, ben]) await enrollStudent(db, { as: pina, sectionId: b2, email: e, displayName: e.split('@')[0], createdAt: old });
	for (const e of [cy, dee, eli]) await enrollStudent(db, { as: pina, sectionId: b4, email: e, displayName: e.split('@')[0], createdAt: old });

	const past = new Date(Date.now() - 3 * 86400000).toISOString();
	const mk = async (title: string, sections: string[], due: string | null) =>
		(await rpc<{ item_id: string }>(pina, `public.classroom_create_item('assignment', $1::uuid[], $2, 'Do it.', 10, $3::timestamptz, null, true, '[]'::jsonb, false)`, [sections, title, due])).item_id;
	shared = await mk('Shop Fix: Design', [b2, b4], past);
	await rpc(pina, `public.classroom_set_rubric($1::uuid, $2::jsonb)`, [shared, JSON.stringify([{ id: 'c1', criterion: 'Design', points: 10, levels: LEVELS }])]);
	html = await mk('Hook 03', [b2, b4], past);
	fresh = await mk('Not due yet', [b2], new Date(Date.now() + 5 * 86400000).toISOString());

	// THE WORLD BEFORE 0315, through the real grading writes.
	expect((await direct(cosso, shared, cy, 7)).ok).toBe(true); // Mr. Cosso's grade
	expect((await direct(pina, shared, eli, 8, false)).ok).toBe(true); // his own, held
	expect((await direct(pina, shared, ana, 6)).ok).toBe(true); // Block 2
	// Saved work, no grade: answers on the HTML post, and on the not-due one.
	await db.sql(
		`insert into public.classroom_responses (item_id, student_email, block_id, value, updated_at) values
		 ($1, $2, 'q1', '"a"'::jsonb, now() - interval '4 days'),
		 ($1, $3, 'q1', '"b"'::jsonb, now()),
		 ($1, $4, 'q1', '"c"'::jsonb, now()),
		 ($5, $2, 'q1', '"d"'::jsonb, now())`,
		[html, ana, ben, dee, fresh]
	);
	expect((await direct(pina, html, ben, 9)).ok).toBe(true); // graded: not waiting

	await db.sql(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
}, 600_000);

afterAll(async () => db?.stop());

describe('0315 applies over graded work', () => {
	test('re-applies cleanly and seeds the switch once', async () => {
		// He turned it off for a moment; a re-paste must not turn it back on.
		await db.sql(`update public.classroom_sections set grades_fill_empty_only = false where id = $1`, [b4]);
		await db.sql(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
		const { rows } = await db.sql<{ on: boolean }>(`select grades_fill_empty_only as on from public.classroom_sections where id = $1`, [b4]);
		expect(rows[0].on).toBe(false);
		await db.sql(`update public.classroom_sections set grades_fill_empty_only = true where id = $1`, [b4]);
	});

	test('the seed matched IDEA209H Block 4 and nothing else', async () => {
		// Applied once more on a fresh copy of the question: the seed's own
		// match, run as a select over the same rows.
		const { rows } = await db.sql<{ id: string }>(
			`select s.id from public.classroom_sections s join public.classroom_courses c on c.id = s.course_id
			 where replace(c.code, ' ', '') = 'IDEA209H' and (btrim(coalesce(s.block, '')) ~* '^(block\\s*)?4$' or (s.block is null and btrim(s.label) ~* '^block\\s*4$'))`
		);
		expect(rows.map((r) => r.id)).toEqual([b4]);
	});

	test('pre-existing grades are untouched by the apply', async () => {
		expect(await row(shared, cy)).toMatchObject({ score: '7', graded_by: cosso.email, returned: true });
		expect(await row(shared, eli)).toMatchObject({ score: '8', returned: false });
	});
});

describe('a protected class only fills empty grades', () => {
	test('every door refuses to change a grade somebody else gave, and records it', async () => {
		const before = await row(shared, cy);
		const one = await direct(pina, shared, cy, 10);
		expect(one).toMatchObject({ ok: false, reason: 'protected' });
		const byRubric = await rubric(pina, shared, cy, 10);
		expect(byRubric).toMatchObject({ ok: false, reason: 'protected' });
		const batch = await rpc<{ results: Json[]; refused: number }>(pina, `public.classroom_grade_submissions($1::uuid, $2::jsonb, true)`, [
			shared,
			JSON.stringify([{ student_email: cy, scores: { c1: 10 } }, { student_email: dee, scores: { c1: 5 } }])
		]);
		expect(batch.refused).toBe(1);
		expect(batch.results.find((r) => r.email === cy)).toMatchObject({ ok: false, reason: 'protected' });
		const revoke = await rpc<Json>(pina, `public.classroom_revoke_grade($1::uuid, $2)`, [shared, cy]);
		expect(revoke).toMatchObject({ ok: false, reason: 'protected' });
		const unreturn = await rpc<Json>(pina, `public.classroom_unreturn_grade($1::uuid, $2)`, [shared, cy]);
		expect(unreturn).toMatchObject({ ok: false, reason: 'protected' });
		expect(await row(shared, cy)).toEqual(before);
		const kept = await rpc<Json[]>(pina, `(select jsonb_agg(to_jsonb(r)) from public.classroom_grade_protection_refusals($1::uuid, 50) r)`, [b4]);
		expect(kept.filter((k) => k.student_email === cy).map((k) => k.action).sort()).toEqual(['grade', 'grade', 'revoke', 'typed score', 'unreturn']);
		expect(kept.every((k) => Number(k.kept_score) === 7)).toBe(true);
	});

	test('an empty grade is filled (the same batch), and his own held fill can be returned', async () => {
		expect(await row(shared, dee)).toMatchObject({ score: '5', graded_by: pina.email });
		expect((await direct(pina, shared, eli, 9)).ok).toBe(true);
		expect(await row(shared, eli)).toMatchObject({ score: '9', returned: true });
	});

	test('control: the same doors work in an unprotected class', async () => {
		expect((await direct(pina, shared, ana, 10)).ok).toBe(true);
		expect(await row(shared, ana)).toMatchObject({ score: '10' });
		// And in Block 4 once the switch is off.
		expect((await rpc<Json>(cosso, `public.classroom_set_grade_protection($1::uuid, false)`, [b4])).ok).toBe(true);
		expect((await direct(pina, shared, cy, 7)).ok).toBe(true);
		expect((await rpc<Json>(cosso, `public.classroom_set_grade_protection($1::uuid, true)`, [b4])).ok).toBe(true);
	});

	test('only a manager of the class sets the switch or reads the refusals; anon cannot call', async () => {
		const stu = (await db.sql<{ id: string }>(`select id from auth.users where email = $1`, [ana])).rows[0].id;
		const asStudent = { id: stu } as SeededUser;
		await expect(rpc(asStudent, `public.classroom_set_grade_protection($1::uuid, false)`, [b4])).rejects.toThrow(/teacher of record/);
		expect(await rpc(asStudent, `(select count(*) from public.classroom_grade_protection_refusals($1::uuid, 50))`, [b4])).toBe('0');
		await expect(db.asAnon((q) => q(`select public.classroom_set_grade_protection($1::uuid, false)`, [b4]))).rejects.toThrow(/permission denied/);
		await expect(db.asUser(pina.id, (q) => q(`select public._classroom_grade_protection_check($1::uuid, $2, 'x', null)`, [shared, cy]))).rejects.toThrow(/permission denied/);
	});
});

type Queue = { classes: Array<{ section_id: string; items: Array<{ item_id: string; title: string; students: Array<{ email: string; saved_after_due: boolean }> }> }>; excluded: Json[] };

describe('one needs-grading read', () => {
	test('every past-due post with saved, ungraded work, by class; the excluded class is absent', async () => {
		// Mr. Pina teaches only Block 2 by record; name Block 4 to read it too.
		const all = await rpc<Queue>(pina, `public.classroom_needs_grading($1::uuid[], null)`, [[b2, b4]]);
		const waiting = all.classes.flatMap((c) => c.items.flatMap((i) => i.students.map((s) => `${c.section_id === b2 ? 'B2' : 'B4'} ${i.title} ${s.email.split('@')[0]}`))).sort();
		// Present: Ana's and Dee's saved answers on Hook 03. Absent: Ben (graded),
		// the post not due yet, and Shop Fix (every saved row there is graded).
		expect(waiting).toEqual(['B2 Hook 03 ana', 'B4 Hook 03 dee']);
		const anaRow = all.classes.find((c) => c.section_id === b2)!.items[0].students[0];
		expect(anaRow.saved_after_due).toBe(false);
		const deeRow = all.classes.find((c) => c.section_id === b4)!.items[0].students[0];
		expect(deeRow.saved_after_due).toBe(true);

		const without = await rpc<Queue>(pina, `public.classroom_needs_grading($1::uuid[], $2::uuid[])`, [[b2, b4], [b4]]);
		expect(without.classes.map((c) => c.section_id)).toEqual([b2]);
		expect(JSON.stringify(without.classes)).not.toContain(dee);
		expect(without.excluded.map((e) => e.section_id)).toEqual([b4]);
	});

	test('the default is the classes he is teacher of record for', async () => {
		const mine = await rpc<Queue>(pina, `public.classroom_needs_grading(null, null)`);
		expect(mine.classes.map((c) => c.section_id)).toEqual([b2]);
	});

	test('a class the caller does not manage is refused', async () => {
		await expect(rpc(cosso, `public.classroom_needs_grading($1::uuid[], null)`, [[b2]])).rejects.toThrow(/teacher of record/);
	});
});
