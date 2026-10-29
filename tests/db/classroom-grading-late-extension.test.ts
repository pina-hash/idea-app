// tests/db/classroom-grading-late-extension.test.ts
//
// PER-STUDENT DUE DATES, THE ABSENT MARK, ON-TIME ANSWER VERSIONS, PARTIAL
// LATE CREDIT, RUBRIC SCALING, TEAM DRAWS AND SYLLABUS TARGETS (ledger 0457,
// migration 0321, queue items 15 to 18 and 20). The chain is booted short of
// 0321 with graded and ungraded HTML work seeded through the real writes
// (`classroom_save_response`, the grading RPCs), then 0321 applies over it.
//
// Silent-regression guarantees, each with a control:
//   - an edit after a student's own due date keeps the on-time version; an
//     edit before it keeps nothing; an extension moves which side a save is on;
//   - a student marked absent who still has time is not waiting for a grade,
//     and the same student without the mark is (control);
//   - late credit is on time + rate x the late improvement per rubric line,
//     and a line with an answer saved after the student's own due date is
//     refused without its on-time score, so a late-only change is never
//     scored as on time (an on-time student's line is the control);
//   - only a reviewer sets a due date; anon reaches nothing.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';
import { stageHtmlDocument } from '../../src/lib/classroom/html-assignment/store';

type Json = Record<string, unknown>;

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILE = ALL.find((f) => f.includes('classroom_grading_due_late_teams_targets'))!;
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < FILE)];
const HTML = readFileSync(fileURLToPath(new URL('../fixtures/hx-smoke-test.html', import.meta.url)), 'utf8');

let db: TestDb;
let pina: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let cy: SeededUser;
let other: SeededUser;
let b2: string;
let item: string;
let rubricItem: string;
const LEVELS = (max: number) => [
	{ label: 'Full', short: 'Full', points: max, descriptor: 'All.' },
	{ label: 'Half', short: 'Half', points: max / 2, descriptor: 'Half.' },
	{ label: 'None', short: 'None', points: 0, descriptor: 'None.' }
];

const rpc = <T = Json>(u: SeededUser, call: string, params: unknown[] = []) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${call} as r`, params)).rows[0].r);
const save = (u: SeededUser, block: string, text: string) =>
	rpc<Json>(u, `public.classroom_save_response($1::uuid, $2, $3::jsonb)`, [item, block, JSON.stringify({ text })]);
/** Saves stamp now(); a test moves a row's save time to place it before or after a due date. */
const backdate = (email: string, block: string, iso: string) =>
	db.sql(`update public.classroom_responses set updated_at = $4 where item_id = $1 and student_email = $2 and block_id = $3`, [item, email, block, iso]);
const versions = async (email: string) =>
	(await db.sql<{ block_id: string; value: { text: string } }>(`select block_id, value from public.classroom_response_versions where item_id = $1 and student_email = $2 order by block_id`, [item, email])).rows;

const DAY = 86_400_000;
let due: string;

beforeAll(async () => {
	db = await startTestDb(PRE);
	pina = await createUser(db, 'apina@boscotech.edu', 'Mr Pina');
	other = await createUser(db, 'colleague@boscotech.edu', 'Colleague');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Ortiz');
	cy = await createUser(db, 'cy@boscotech.net', 'Cy Ng');
	b2 = await createClassroomSection(db, { as: pina, courseCode: 'IDEA209H', courseTitle: 'Engineering I Honors', label: 'Section 1', teacherEmail: pina.email });
	const old = new Date(Date.now() - 90 * DAY).toISOString();
	for (const s of [ana, ben, cy]) await enrollStudent(db, { as: pina, sectionId: b2, email: s.email, displayName: s.email.split('@')[0], createdAt: old });

	due = new Date(Date.now() - 2 * DAY).toISOString();
	item = (await rpc<{ item_id: string }>(pina, `public.classroom_create_item('assignment', $1::uuid[], 'Hook 03', 'Do it.', 20, $2::timestamptz, null, true, '[]'::jsonb, false)`, [[b2], due])).item_id;
	const staged = stageHtmlDocument('hook.html', HTML).staged!;
	await rpc(pina, `public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, 'hook.html')`, [item, HTML, JSON.stringify(staged.manifest)]);
	rubricItem = (await rpc<{ item_id: string }>(pina, `public.classroom_create_item('assignment', $1::uuid[], 'Hook 02', 'Do it.', 20, $2::timestamptz, null, true, '[]'::jsonb, false)`, [[b2], due])).item_id;
	await rpc(pina, `public.classroom_set_rubric($1::uuid, $2::jsonb)`, [rubricItem, JSON.stringify([
		{ id: 'a', criterion: 'Accuracy', points: 40, levels: LEVELS(40) },
		{ id: 'b', criterion: 'Drawing', points: 30, levels: LEVELS(30) }
	])]);

	// THE WORLD BEFORE 0321: answers saved before the due date through the real
	// save, one graded post. Every answer is placed before the due date.
	await save(ana, 'smoke-writing-line', 'Ana on time');
	await backdate(ana.email, 'smoke-writing-line', new Date(Date.now() - 3 * DAY).toISOString());
	await save(ben, 'smoke-writing-line', 'Ben on time');
	await backdate(ben.email, 'smoke-writing-line', new Date(Date.now() - 3 * DAY).toISOString());
	await save(cy, 'smoke-writing-line', 'Cy on time');
	await backdate(cy.email, 'smoke-writing-line', new Date(Date.now() - 3 * DAY).toISOString());
	expect((await rpc<Json>(pina, `public.classroom_grade_direct($1::uuid, $2, 15, null, true, null)`, [rubricItem, cy.email])).ok).toBe(true);

	await db.sql(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
}, 600_000);

afterAll(async () => db?.stop());

describe('0321 applies over saved and graded work', () => {
	test('re-applies cleanly, keeps every answer and grade, seeds the syllabus once', async () => {
		await rpc(pina, `public.classroom_set_grade_targets((select course_id from public.classroom_sections where id = $1), $2::jsonb)`, [
			b2,
			JSON.stringify([{ category: 'Unit Labs', target_points: 200 }, { category: 'Unit Assignments', target_points: null }])
		]);
		await db.sql(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
		const t = (await db.sql<{ category: string; target_points: string | null }>(`select category, target_points::text from public.classroom_course_grade_targets order by sort`)).rows;
		// His edit stands: the re-paste did not re-seed a course that has categories.
		expect(t).toEqual([{ category: 'Unit Labs', target_points: '200' }, { category: 'Unit Assignments', target_points: null }]);
		expect((await db.sql(`select 1 from public.classroom_responses where item_id = $1`, [item])).rows).toHaveLength(3);
		expect((await db.sql<{ score: string }>(`select score::text from public.classroom_submissions where item_id = $1`, [rubricItem])).rows[0].score).toBe('15');
	});

	test('the first apply seeded the 209H syllabus categories with its own numbers', async () => {
		const fresh = await startTestDb(PRE);
		try {
			const u = await createUser(fresh, 'apina@boscotech.edu', 'Mr Pina');
			await createClassroomSection(fresh, { as: u, courseCode: 'IDEA209H', courseTitle: 'Engineering I Honors', label: '1', teacherEmail: u.email });
			await createClassroomSection(fresh, { as: u, courseCode: 'IDEA 100', courseTitle: 'Rotation', label: '1', teacherEmail: u.email });
			await fresh.sql(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
			const rows = (await fresh.sql<{ code: string; category: string; target_points: string }>(
				`select c.code, t.category, t.target_points::text from public.classroom_course_grade_targets t
				 join public.classroom_courses c on c.id = t.course_id order by c.code, t.sort`
			)).rows.map((r) => `${r.code}|${r.category}|${r.target_points}`);
			expect(rows).toEqual([
				'IDEA 100|Manufacturing and Assembly|60', 'IDEA 100|Dogtag|40', 'IDEA 100|Hook Competition|130', 'IDEA 100|IDEA-Blade|190', 'IDEA 100|Engineering Documentation|80',
				'IDEA209H|Unit Labs|200', 'IDEA209H|Unit Assignments|400', 'IDEA209H|Engineering Documentation|100', 'IDEA209H|Integrated Design Challenge|250', 'IDEA209H|Final Exam|100'
			]);
		} finally {
			await fresh.stop();
		}
	}, 600_000);
});

describe('the on-time version of an answer', () => {
	test('an edit after the due date keeps the on-time version; the latest save is the new one', async () => {
		await save(ana, 'smoke-writing-line', 'Ana late rewrite');
		expect(await versions(ana.email)).toEqual([{ block_id: 'smoke-writing-line', value: { text: 'Ana on time' } }]);
		const cur = (await db.sql<{ value: { text: string } }>(`select value from public.classroom_responses where item_id = $1 and student_email = $2`, [item, ana.email])).rows[0];
		expect(cur.value.text).toBe('Ana late rewrite');
		// A second late edit keeps the SAME on-time version, never the first late one.
		await save(ana, 'smoke-writing-line', 'Ana later still');
		expect(await versions(ana.email)).toEqual([{ block_id: 'smoke-writing-line', value: { text: 'Ana on time' } }]);
	});

	test('control: with an extension past now, the same edit is on time and keeps nothing', async () => {
		const r = await rpc<Json>(pina, `public.classroom_set_student_due($1::uuid, $2::jsonb)`, [item, JSON.stringify([{ student_email: ben.email, due_at: new Date(Date.now() + 3 * DAY).toISOString() }])]);
		expect(r).toMatchObject({ succeeded: 1, refused: 0 });
		await save(ben, 'smoke-writing-line', 'Ben edited in his extension');
		expect(await versions(ben.email)).toEqual([]);
	});

	test('a student cannot read another student\'s versions', async () => {
		const seen = await rpc<string>(ben, `(select count(*)::text from public.classroom_response_versions where item_id = $1::uuid)`, [item]);
		expect(seen).toBe('0');
		const own = await rpc<string>(ana, `(select count(*)::text from public.classroom_response_versions where item_id = $1::uuid)`, [item]);
		expect(own).toBe('1');
	});
});

describe('per-student due dates and the absent mark', () => {
	test('days out moves the due date by school days, skipping weekends', async () => {
		// A fixed post due on a Friday at 23:59 in Los Angeles; 2 school days out is the Tuesday.
		const fri = (await rpc<{ item_id: string }>(pina, `public.classroom_create_item('assignment', $1::uuid[], 'Friday post', 'x', 5, '2026-10-24T06:59:00Z', null, true, '[]'::jsonb, false)`, [[b2]])).item_id;
		const r = await rpc<{ results: Array<{ due_at: string }> }>(pina, `public.classroom_set_student_due($1::uuid, $2::jsonb)`, [fri, JSON.stringify([{ student_email: ana.email, days_out: 2 }])]);
		expect(Date.parse(r.results[0].due_at)).toBe(Date.parse('2026-10-28T06:59:00Z'));
	});

	test('absent and still in time is not waiting for a grade; the same work without the mark is', async () => {
		const q = async () => {
			const out = await rpc<{ classes: Array<{ items: Array<{ title: string; students: Array<{ email: string }> }> }> }>(pina, `public.classroom_needs_grading(null, null)`);
			return out.classes.flatMap((c) => c.items.filter((i) => i.title === 'Hook 03').flatMap((i) => i.students.map((s) => s.email))).sort();
		};
		// Ben's extension runs into the future: he is not waiting. Ana and Cy are.
		expect(await q()).toEqual([ana.email, cy.email]);
		await rpc(pina, `public.classroom_set_student_due($1::uuid, $2::jsonb)`, [item, JSON.stringify([{ student_email: cy.email, absent: true, days_out: 10 }])]);
		expect(await q()).toEqual([ana.email]);
		const marks = await rpc<Array<{ email: string; absent: boolean }>>(pina, `public.classroom_student_due_dates($1::uuid)`, [item]);
		expect(marks.find((m) => m.email === cy.email)?.absent).toBe(true);
		// Clear puts Cy back where the post's date says.
		await rpc(pina, `public.classroom_set_student_due($1::uuid, $2::jsonb)`, [item, JSON.stringify([{ student_email: cy.email, clear: true }])]);
		expect(await q()).toEqual([ana.email, cy.email]);
	});

	test('a teacher of another class is refused per student; a student and anon reach nothing', async () => {
		const r = await rpc<{ refused: number; results: Json[] }>(other, `public.classroom_set_student_due($1::uuid, $2::jsonb)`, [item, JSON.stringify([{ student_email: ana.email, days_out: 3 }])]);
		expect(r.refused).toBe(1);
		expect(String(r.results[0].message)).toMatch(/teacher of record/);
		expect((await rpc<Json[]>(other, `public.classroom_student_due_dates($1::uuid)`, [item])).length).toBe(0);
		await expect(db.asAnon((q) => q(`select public.classroom_set_student_due($1::uuid, '[]'::jsonb)`, [item]))).rejects.toThrow(/permission denied/);
		// Ben's own date (his extension, set above) reaches Ben and nobody else.
		const studentSees = await rpc<string>(ana, `(select count(*)::text from public.classroom_student_due where item_id = $1::uuid)`, [item]);
		expect(studentSees).toBe('0');
		const benSees = await rpc<string>(ben, `(select count(*)::text from public.classroom_student_due where item_id = $1::uuid)`, [item]);
		expect(benSees).toBe('1');
		// And it moves only Ben's due date: Ana's is still the post's.
		const dues = (await db.sql<{ e: string; d: string }>(
			`select e, public._classroom_student_due_at($1::uuid, e)::text as d from unnest($2::text[]) e order by e`,
			[item, [ana.email, ben.email]]
		)).rows;
		expect(Date.parse(dues[0].d)).toBe(Date.parse(due));
		expect(Date.parse(dues[1].d)).toBeGreaterThan(Date.now());
	});
});

describe('partial late credit', () => {
	test('on time + 50% of the late improvement, per rubric line, with a note on a between-level score', async () => {
		const out = await rpc<Json>(pina, `public.classroom_grade_late_credit($1::uuid, $2, $3::jsonb, $4::jsonb, null, 'Late work half credit.', false)`, [
			rubricItem,
			ana.email,
			JSON.stringify({ a: 20, b: 30 }),
			JSON.stringify({ a: 40, b: 30 })
		]);
		expect(out.ok, JSON.stringify(out)).toBe(true);
		expect(out.credited).toEqual({ a: 30, b: 30 });
		const row = (await db.sql<{ score: string; criterion_comments: Record<string, string> }>(`select score::text, criterion_comments from public.classroom_submissions where item_id = $1 and student_email = $2`, [rubricItem, ana.email])).rows[0];
		expect(Number(row.score)).toBe(60);
		expect(row.criterion_comments.a).toMatch(/Late credit: 20 on time, plus 50% of the 20 earned after the due date/);
	});

	test('the rate is editable per post', async () => {
		await rpc(pina, `public.classroom_set_item_grading($1::uuid, 0.25, null, null)`, [rubricItem]);
		const out = await rpc<Json>(pina, `public.classroom_grade_late_credit($1::uuid, $2, $3::jsonb, $4::jsonb, null, null, false)`, [rubricItem, ben.email, JSON.stringify({ a: 0 }), JSON.stringify({ a: 40, b: 0 })]);
		expect(out.credited).toEqual({ a: 10, b: 0 });
	});

	test('a late line must carry its on-time score: left out, nothing is saved; an on-time student needs none (control)', async () => {
		// The worksheet's own rubric, in the stored spelling <module>-<criterion>.
		await rpc(pina, `public.classroom_set_rubric($1::uuid, $2::jsonb)`, [item, JSON.stringify([
			{ id: 'smoke-writing-writing', criterion: 'Writing', points: 5, levels: LEVELS(5) },
			{ id: 'smoke-evidence-evidence', criterion: 'Evidence', points: 5, levels: LEVELS(5) }
		])]);
		const late = await rpc<string[]>(pina, `public._classroom_late_criteria($1::uuid, $2)`, [item, ana.email]).catch(() => null);
		// The helper is private (no grant); read it as the owner instead.
		const lateOwner = (await db.sql<{ r: string[] }>(`select public._classroom_late_criteria($1::uuid, $2) as r`, [item, ana.email])).rows[0].r;
		expect(late).toBeNull();
		expect(lateOwner).toEqual(['smoke-writing-writing']);
		const lateCy = (await db.sql<{ r: string[] }>(`select public._classroom_late_criteria($1::uuid, $2) as r`, [item, cy.email])).rows[0].r;
		expect(lateCy).toEqual([]);

		// Ana rewrote her line after the due date: leaving its on-time score out is refused.
		const refused = await rpc<Json>(pina, `public.classroom_grade_late_credit($1::uuid, $2, '{}'::jsonb, $3::jsonb, null, null, false)`, [item, ana.email, JSON.stringify({ 'smoke-writing-writing': 5 })]);
		expect(refused).toMatchObject({ ok: false, reason: 'on_time_needed', missing: ['smoke-writing-writing'] });
		const none = await db.sql(`select 1 from public.classroom_submissions where item_id = $1 and student_email = $2 and graded_at is not null`, [item, ana.email]);
		expect(none.rows).toHaveLength(0);
		// With it, the late half earns the rate: 0 + 50% x 5 = 2.5.
		const ok = await rpc<Json>(pina, `public.classroom_grade_late_credit($1::uuid, $2, $3::jsonb, $4::jsonb, null, 'Late.', false)`, [item, ana.email, JSON.stringify({ 'smoke-writing-writing': 0 }), JSON.stringify({ 'smoke-writing-writing': 5 })]);
		expect(ok.ok, JSON.stringify(ok)).toBe(true);
		expect(ok.credited).toEqual({ 'smoke-writing-writing': 2.5 });
		// Cy saved on time and never after: no on-time score is needed, the line is full.
		const cyOut = await rpc<Json>(pina, `public.classroom_grade_late_credit($1::uuid, $2, '{}'::jsonb, $3::jsonb, null, null, false)`, [item, cy.email, JSON.stringify({ 'smoke-writing-writing': 5 })]);
		expect(cyOut.ok, JSON.stringify(cyOut)).toBe(true);
		expect(cyOut.credited).toEqual({ 'smoke-writing-writing': 5 });
	});

	test('late work never lowers a grade', async () => {
		await expect(rpc(pina, `public.classroom_grade_late_credit($1::uuid, $2, $3::jsonb, $4::jsonb, null, null, false)`, [rubricItem, ben.email, JSON.stringify({ a: 40 }), JSON.stringify({ a: 20 })])).rejects.toThrow(/never lowers/);
	});
});

describe('a rubric scaled to the post\'s points', () => {
	test('a 70 point rubric on a 20 point post saves out of 20 once scaling is on; off, the raw sum (control)', async () => {
		const sum = { a: 40, b: 15 };
		const grade = () => rpc<Json>(pina, `public.classroom_grade_submission($1::uuid, $2, $3::jsonb, null, false, $4::jsonb, null)`, [rubricItem, cy.email, JSON.stringify(sum), JSON.stringify({})]);
		// Cy has a typed score of 15; clear it so the rubric decides.
		await rpc(pina, `public.classroom_grade_direct($1::uuid, $2, null, null, false, null)`, [rubricItem, cy.email]);
		expect(Number((await grade()).score)).toBe(55);
		await rpc(pina, `public.classroom_set_item_grading($1::uuid, null, null, true)`, [rubricItem]);
		expect(Number((await grade()).score)).toBe(15.71);
		const s = await rpc<Json>(pina, `public.classroom_item_grading_settings($1::uuid)`, [rubricItem]);
		expect(s).toMatchObject({ scale_to_points: true, rubric_total: 70, points: 20 });
		// A typed score is out of the post's points while scaling is on.
		const typed = await rpc<Json>(pina, `public.classroom_grade_direct($1::uuid, $2, 25, null, false, null)`, [rubricItem, cy.email]);
		expect(typed).toMatchObject({ ok: false, reason: 'out_of_range', out_of: 20 });
	});
});

describe('the posted team draw', () => {
	test('each class of the post with its posted teams and members; nothing for a non-manager', async () => {
		const set = (await rpc<{ id: string } | string>(pina, `public.classroom_save_team_set($1::uuid, 'Blade teams', 7, 'count', 1, $2::jsonb)`, [
			b2,
			JSON.stringify([{ team_number: 1, members: [ana.email, ben.email, cy.email] }])
		])) as unknown;
		const setId = typeof set === 'string' ? set : (set as { id: string }).id;
		await db.sql(`update public.classroom_team_sets set posted_at = now() - interval '1 minute' where id = $1`, [setId]);
		const draw = await rpc<{ sections: Array<{ teams: Array<{ members: string[] }> }> }>(pina, `public.classroom_item_team_draw($1::uuid)`, [item]);
		expect(draw.sections[0].teams[0].members).toEqual([ana.email, ben.email, cy.email]);
		const none = await rpc<{ sections: unknown[] }>(other, `public.classroom_item_team_draw($1::uuid)`, [item]);
		expect(none.sections).toEqual([]);
	});
});
