// tests/db/rotation-copy-forward-0318.test.ts
//
// LEDGER 0455, MIGRATION 0318: a class's posts copy forward to a new class in
// one step, dates moved by SCHOOL DAYS, and a duplicate carries its pacing and
// sign-off checkpoints.
//
// The chain is every migration short of 0318, read off disk. The old class is
// built through the REAL RPCs, the deployed duplicate is measured FIRST (it
// drops pacing and checkpoints), then 0318 goes on top.
//
// WHERE THE EXPECTED DATES COME FROM: written out by hand from a calendar, not
// from the shift function. The old class starts Mon 2026-09-28; the new one
// Thu 2026-10-29. 2026-10-02 (Fri) is no school. So:
//   old Wed 2026-09-30 = school day 3  -> new school day 3 = Mon 2026-11-02
//   old Mon 2026-10-05 = school day 5 (Fri the 2nd skipped) -> Wed 2026-11-04
//   old Sat 2026-10-03 = not a school day, 2 calendar days after school day 4
//                        (Thu 10-01; Fri 10-02 is no school)
//                        -> 2 days after new school day 4 (Tue 11-03) = Thu 11-05
// (Daylight time ends Sun 2026-11-01, so 11:59 PM school time is 07:59 UTC
// on the next calendar day after that date, and 06:59 UTC before it.)
//
// The silent guarantees, each with its control:
//   - NOTHING A STUDENT MADE IS COPIED: the source holds an answer, a hand-in
//     and a grade; the copy holds none, and the source still holds all three.
//   - COPIES ARE DRAFTS, and a source draft stays a draft even when publishing
//     is asked for.
//   - A STRANGER, AND A TEACHER OF ONLY ONE OF THE TWO CLASSES, IS REFUSED,
//     and nothing is written.
//   - A SECOND RUN COPIES NOTHING TWICE.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClassroomSection, createUser, enrollStudent, startTestDb, type SeededUser, type TestDb } from './harness';

type Json = Record<string, unknown>;
const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILES = ALL.filter((f) => f.endsWith('_classroom_copy_forward.sql'));
if (FILES.length !== 1) throw new Error(`expected one copy-forward migration, found ${FILES.length}`);
const FILE = FILES[0];
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < FILE)];
const SQL = readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8');

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let other: SeededUser;
let ana: SeededUser;
let r2: string;
let r3: string;
let elsewhere: string;
let blade: string;
let survey: string;
let note: string;
let draft: string;
let syllabus: string;
let preDup: string;

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
const la = (iso: string) => `${iso}T23:59:00-07:00`;

const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Blade 02',
	course: 'IDEA100',
	points: 4,
	header: [{ id: 'who', field: 'studentName', type: 'text' }],
	pacing: [
		{ id: 'build', title: 'Build', day: 1 },
		{ id: 'fight', title: 'Fight', date: '2026-10-05' }
	],
	modules: [
		{
			id: 'm1',
			title: 'Only module',
			points: 4,
			audience: 'individual',
			blocks: [{ id: 'b1', field: 'answer', type: 'longText', minSentences: 1 }],
			criteria: [
				{
					id: 'c1',
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
const DOC = `<!doctype html><html><head><title>Blade 02</title></head><body><input data-field="studentName"><textarea data-field="answer"></textarea><script type="application/json" id="idea-manifest">${JSON.stringify(MANIFEST)}<\/script></body></html>`;

async function item(id: string) {
	return (
		await db.sql<{ title: string; published: boolean; publish_at: string | null; due_at: string | null; unit_id: string | null; pinned: boolean }>(
			`select title, published, publish_at::text, (due_at at time zone 'America/Los_Angeles')::text as due_at, unit_id, pinned
			 from public.classroom_items where id = $1`,
			[id]
		)
	).rows[0];
}
const count = async (sql: string, params: unknown[]) => Number((await db.sql<{ n: string }>(sql, params)).rows[0].n);

beforeAll(async () => {
	db = await startTestDb(PRE);
	admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
	teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
	other = await createUser(db, 'cosso@boscotech.edu', 'W. Cosso');
	ana = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
	r2 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', label: 'Section 2', teacherEmail: teacher.email });
	r3 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', label: 'Section 3', teacherEmail: teacher.email });
	elsewhere = await createClassroomSection(db, { as: admin, courseCode: 'IDEA209H', label: 'Block 4', teacherEmail: other.email });
	await enrollStudent(db, { as: teacher, sectionId: r2, email: ana.email, displayName: 'Ana Perez' });
	await db.sql(`insert into public.classroom_no_school_days (day, label, set_by) values ('2026-10-02', 'Staff day', 'test')`);

	const course = (await db.sql<{ id: string }>(`select course_id as id from public.classroom_sections where id = $1`, [r2])).rows[0].id;
	const unit = (await rpc<{ unit_id: string }>(teacher, `public.classroom_upsert_unit($1, 'IDEA-Blade', null)`, [course])).unit_id;

	const create = async (kind: string, title: string | null, body: string, due: string | null, published = true, sections = [r2]) =>
		(
			await rpc<{ item_id: string }>(
				teacher,
				`public.classroom_create_item(p_kind => $1, p_section_ids => $2::uuid[], p_title => $3, p_body => $4,
					p_points => $5, p_due_at => $6::timestamptz, p_published => $7, p_unit_id => $8)`,
				[kind, sections, title, body, kind === 'assignment' ? 4 : null, due, published, kind === 'post' ? null : unit]
			)
		).item_id;
	blade = await create('assignment', 'IDEA-Blade 02', 'Build and fight.', la('2026-10-05'));
	survey = await create('assignment', 'Rotation Survey', 'Tell us.', la('2026-10-03'));
	note = await create('post', null, 'Bring safety glasses.', null);
	draft = await create('assignment', 'Unfinished', 'Not ready.', la('2026-09-30'), false);
	syllabus = await create('material', 'IDEA 100 Syllabus', 'Read me.', null, true, [r2, r3]);
	// The old class's posts open on its first day.
	await db.sql(
		`update public.classroom_items set first_published_at = '2026-09-28T08:00:00-07:00', created_at = '2026-09-28T08:00:00-07:00'
		 where id = any ($1::uuid[])`,
		[[blade, survey, note, draft]]
	);
	await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [blade, DOC, JSON.stringify(MANIFEST), 'blade-02.html']);
	// The admin moves a pacing day and edits a checklist, the two per-post records.
	await rpc(admin, `public.classroom_item_pacing_set($1, 'build', null, '2026-09-29'::date, null, false)`, [blade]);
	await db.sql(
		`insert into public.classroom_signoff_checkpoints (item_id, checkpoint_key, title, due_on, items, edited_by, edited_at)
		 values ($1, 'cp1', 'Plan check, edited', '2026-09-30', '[{"id":"i1","kind":"tap","text":"Roles set and dated"}]', 'apina@boscotech.edu', now())`,
		[blade]
	);
	// A student's work on the source: an answer.
	await rpc(ana, `public.classroom_save_response($1::uuid, 'b1', $2::jsonb)`, [blade, JSON.stringify({ text: 'It spins.' })]);

	// THE DEPLOYED DUPLICATE, measured first: it drops both records.
	preDup = (await rpc<{ item_id: string }>(teacher, 'public.classroom_duplicate_item($1::uuid, $2::uuid[])', [blade, [r2]])).item_id;

	await db.sql(SQL);
}, 600_000);

afterAll(async () => db?.stop());

describe('0318: a duplicate carries pacing and checkpoints', () => {
	test('CONTROL: before 0318 the duplicate had neither', async () => {
		expect(await count(`select count(*) n from public.classroom_item_pacing where item_id = $1`, [preDup])).toBe(0);
		expect(await count(`select count(*) n from public.classroom_signoff_checkpoints where item_id = $1`, [preDup])).toBe(0);
		// Out of the old class, so the rotation copy below copies the class's own posts.
		await rpc(teacher, 'public.classroom_delete_item($1)', [preDup]);
	});

	test('after 0318 a duplicate carries the moved day and the edited checklist, unshifted', async () => {
		const dup = (await rpc<{ item_id: string }>(teacher, 'public.classroom_duplicate_item($1::uuid, $2::uuid[])', [blade, [r2]])).item_id;
		const pacing = (await db.sql<{ step_id: string; day: string }>(`select step_id, day::text from public.classroom_item_pacing where item_id = $1`, [dup])).rows;
		expect(pacing).toEqual([{ step_id: 'build', day: '2026-09-29' }]);
		const cp = (await db.sql<{ title: string; items: unknown }>(`select title, items from public.classroom_signoff_checkpoints where item_id = $1`, [dup])).rows;
		expect(cp).toEqual([{ title: 'Plan check, edited', items: [{ id: 'i1', kind: 'tap', text: 'Roles set and dated' }] }]);
		await rpc(teacher, 'public.classroom_delete_item($1)', [dup]);
	});

	test('the file re-applies over itself', async () => {
		await db.sql(SQL);
	});
});

describe('0318: who may copy', () => {
	test('a teacher of only one of the classes, and a student, are refused and nothing is written', async () => {
		const before = await count(`select count(*) n from public.classroom_items`, []);
		expect(await refusal(rpc(other, `public.classroom_copy_forward_preview($1, $2, '2026-10-29')`, [r2, elsewhere]))).toMatch(/teacher of record for both/);
		expect(await refusal(rpc(teacher, `public.classroom_copy_forward($1, $2, '2026-10-29')`, [r2, elsewhere]))).toMatch(/teacher of record for both/);
		expect(await refusal(rpc(ana, `public.classroom_copy_forward($1, $2, '2026-10-29')`, [r2, r3]))).toMatch(/teacher of record for both/);
		expect(await count(`select count(*) n from public.classroom_items`, [])).toBe(before);
		const anon = await db.sql<{ x: boolean }>(
			`select has_function_privilege('anon', 'public.classroom_copy_forward(uuid, uuid, date, date, uuid[], boolean)', 'execute') as x`
		);
		expect(anon.rows[0].x).toBe(false);
	});
});

describe('0318: copy a rotation forward', () => {
	let plan: Json;
	test('the preview lists every post with its old and new due date, in school days', async () => {
		plan = await rpc<Json>(teacher, `public.classroom_copy_forward_preview($1, $2, '2026-10-29')`, [r2, r3]);
		expect(plan).toMatchObject({ ok: true, from: { first_day: '2026-09-28' }, to: { first_day: '2026-10-29' } });
		const posts = plan.posts as Json[];
		const by = (id: string) => posts.find((p) => p.id === id)!;
		expect(by(blade)).toMatchObject({ action: 'copy' });
		expect(by(syllabus)).toMatchObject({ action: 'already_there' });
		expect(by(note)).toMatchObject({ action: 'copy' });
		expect(by(draft)).toMatchObject({ action: 'copy', draft: true });
		// Hand-derived dates (header).
		// 11:59 PM school time on Wed 11-04 is 07:59 UTC on 11-05.
		expect(new Date(String(by(blade).new_due)).toISOString()).toBe('2026-11-05T07:59:00.000Z');
		expect(new Date(String(by(survey).new_due)).toISOString()).toBe('2026-11-06T07:59:00.000Z');
		expect(new Date(String(by(blade).old_due)).toISOString()).toBe('2026-10-06T06:59:00.000Z');
	});

	test('the copy: drafts, shifted dates, unit and title kept, pacing and checkpoints moved', async () => {
		const out = await rpc<Json>(teacher, `public.classroom_copy_forward($1, $2, '2026-10-29')`, [r2, r3]);
		expect(out).toMatchObject({ ok: true, copied: 4, shared: 0 });
		const made = (out.posts as Json[]).filter((p) => p.action === 'copy');
		const copyOf = (src: string) => String(made.find((p) => p.source_id === src)!.item_id);

		const b = await item(copyOf(blade));
		expect(b).toMatchObject({ title: 'IDEA-Blade 02', published: false });
		// Due Mon 10-05 = old school day 5 -> new school day 5 = Wed 11-04.
		expect(b.due_at).toBe('2026-11-04 23:59:00');
		expect(b.unit_id).toBe((await item(blade)).unit_id);
		// Due Sat 10-03 = 2 days after school day 4 -> 2 days after Tue 11-03.
		expect((await item(copyOf(survey))).due_at).toBe('2026-11-05 23:59:00');
		expect((await item(copyOf(draft))).published).toBe(false);

		// Pacing: the moved day (Tue 09-29, school day 2 -> Fri 10-30) and the
		// manifest's fixed date (Mon 10-05, day 5 -> Wed 11-04) both shifted.
		const pacing = (await db.sql<{ step_id: string; day: string }>(
			`select step_id, day::text from public.classroom_item_pacing where item_id = $1 order by step_id`,
			[copyOf(blade)]
		)).rows;
		expect(pacing).toEqual([
			{ step_id: 'build', day: '2026-10-30' },
			{ step_id: 'fight', day: '2026-11-04' }
		]);
		// Checkpoint Wed 09-30 = day 3 -> Mon 11-02, edits kept.
		const cp = (await db.sql<{ title: string; due_on: string }>(
			`select title, due_on::text from public.classroom_signoff_checkpoints where item_id = $1`,
			[copyOf(blade)]
		)).rows;
		expect(cp).toEqual([{ title: 'Plan check, edited', due_on: '2026-11-02' }]);
		// The HTML document came with it.
		expect(await count(`select count(*) n from public.classroom_html_assignments where item_id = $1`, [copyOf(blade)])).toBe(1);
	});

	test('NOTHING A STUDENT MADE IS COPIED, and the source keeps it (both directions)', async () => {
		const copy = (await db.sql<{ new_item_id: string }>(
			`select new_item_id from public.classroom_copy_forward_log where source_item_id = $1 and target_section_id = $2`,
			[blade, r3]
		)).rows[0].new_item_id;
		expect(await count(`select count(*) n from public.classroom_responses where item_id = $1`, [copy])).toBe(0);
		expect(await count(`select count(*) n from public.classroom_submissions where item_id = $1`, [copy])).toBe(0);
		expect(await count(`select count(*) n from public.classroom_responses where item_id = $1`, [blade])).toBeGreaterThan(0);
	});

	test('a second run copies nothing twice', async () => {
		const before = await count(`select count(*) n from public.classroom_items`, []);
		const again = await rpc<Json>(teacher, `public.classroom_copy_forward($1, $2, '2026-10-29')`, [r2, r3]);
		expect(again).toMatchObject({ ok: true, copied: 0, shared: 0 });
		expect(await count(`select count(*) n from public.classroom_items`, [])).toBe(before);
	});

	test('publishing on request schedules a published source on its new day; a draft stays a draft', async () => {
		const r4 = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', label: 'Section 4', teacherEmail: teacher.email });
		const out = await rpc<Json>(teacher, `public.classroom_copy_forward($1, $2, '2099-01-05', null, null, true)`, [r2, r4]);
		const made = (out.posts as Json[]).filter((p) => p.action === 'copy');
		const b = await item(String(made.find((p) => p.source_id === blade)!.item_id));
		expect(b.published).toBe(true);
		expect(b.publish_at).not.toBeNull();
		expect((await item(String(made.find((p) => p.source_id === draft)!.item_id))).published).toBe(false);
		// The shared syllabus is posted to the new class, one record.
		expect((out.posts as Json[]).find((p) => p.source_id === syllabus)).toMatchObject({ action: 'share', item_id: syllabus });
		expect(await count(`select count(*) n from public.classroom_postings where item_id = $1 and section_id = $2`, [syllabus, r4])).toBe(1);
	});
});
