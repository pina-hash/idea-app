// tests/db/classroom-worksheet-complete-load.test.ts
//
// A FINISHED PORTED WORKSHEET READS DONE, THROUGH THE REAL LOADS, AGAINST THE
// REAL SCHEMA (decision 37, ledger 0298).
//
// WHY A DATABASE TEST FOR SOMETHING THE PURE TESTS ALREADY COVER: the
// completeness read FAILS SOFT. A select string naming a column that does not
// exist, an embed PostgREST cannot resolve, or a policy that hides the rows all
// come back as "cannot tell", which is today's behaviour -- so a wrong read
// would ship, render perfectly, and leave every finished worksheet reading
// Missing, which is the defect this bundle exists to fix. Only the real catalog
// can say the reads are right. So this drives, through the PostgREST shim (which
// resolves every column and embed against the live catalog and answers PGRST200
// where PostgREST would):
//
//   * the REAL class layout load, `src/routes/classroom/[sectionId]/+layout.server.ts`,
//     as each student;
//   * the REAL `loadClassroomWork`, which the home page, My Classes and the
//     to-do share, as the student and as the teacher.
//
// THE SEEDING IS THE REAL WRITE PATH: an admin imports the document through
// `classroom_set_html_assignment` (0195) and each student types through
// `classroom_save_response` (0197's manifest arm) -- which creates NO submission
// row, so both students here have none, and the loaders have to say what the
// answers say without one.
//
// BOTH DIRECTIONS, EVERY TIME: Ana answered every block (complete); Bruno
// answered one (not complete). And the teacher, who can read both students'
// answers, sees one finished worksheet to grade, not two.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';
import { createPostgrestShim, loadForeignKeys } from './postgrest-shim';
import { load as classLayoutLoad } from '../../src/routes/classroom/[sectionId]/+layout.server';
import { loadClassroomWork } from '../../src/lib/classroom/student-work';
import { assignmentStanding, studentWorkChip } from '../../src/lib/classroom/classroom';
import { buildFeed } from '../../src/lib/classroom/feed';
import { buildTodo } from '../../src/lib/classroom/todo';
import type { SupabaseClient } from '@supabase/supabase-js';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0090_classroom_instructor_materials.sql',
	'0092_classroom_reference_specs.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0122_rich_text_nested_lists.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql',
	'0137_anon_execute_sweep.sql',
	'0176_classroom_item_images.sql',
	'0195_classroom_html_assignments.sql',
	'0197_classroom_html_assignment_write_gate.sql'
] as const;

function criterion(id: string, points: number) {
	return {
		id,
		text: `${id} is recorded`,
		points,
		levels: [
			{ points, label: 'Complete', short: 'Fully done', descriptor: 'Done in full, with the value recorded.' },
			{ points: 1, label: 'Developing', short: 'Partly done', descriptor: 'Partly done, or recorded without a value.' },
			{ points: 0, label: 'Absent', short: 'Not done', descriptor: 'Not attempted.' }
		]
	};
}

const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Gear train',
	course: 'IDEA100',
	points: 4,
	header: [{ id: 'hd-name', field: 'studentName', type: 'text' }],
	modules: [
		{
			id: 'm1',
			title: 'Ratio',
			points: 2,
			audience: 'individual',
			blocks: [{ id: 'm1-ratio', field: 'ratio', type: 'text' }],
			criteria: [criterion('c1', 2)]
		},
		{
			id: 'm2',
			title: 'Why',
			points: 2,
			audience: 'individual',
			blocks: [{ id: 'm2-why', field: 'why', type: 'longText', minSentences: 2 }],
			criteria: [criterion('c2', 2)]
		}
	]
};

const DOCUMENT = [
	'<html><head><title>Gear train</title></head><body>',
	'  <form><input data-field="studentName"><input data-field="ratio"><textarea data-field="why"></textarea></form>',
	`  <script type="application/json" id="idea-manifest">${JSON.stringify(MANIFEST)}<\/script>`,
	`  <script>parent.postMessage({ type: 'idea:ready', schemaVersion: 3 }, '*');<\/script>`,
	'</body></html>'
].join('\n');

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
let admin: SeededUser;
let teacher: SeededUser;
let ana: SeededUser;
let bruno: SeededUser;
let section: string;
let worksheet: string;
let spec: string;

async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => {
		const r = await q<{ result: T }>(`select ${call} as result`, params);
		return r.rows[0].result;
	});
}

const save = (who: SeededUser, blockId: string, text: string) =>
	rpc<{ ok: boolean }>(who, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
		worksheet,
		blockId,
		JSON.stringify({ text })
	]);

const client = (user: SeededUser) => createPostgrestShim(db, fks, user.id) as unknown as SupabaseClient;

async function classWork(user: SeededUser) {
	const data = (await (classLayoutLoad as unknown as (e: unknown) => Promise<Record<string, unknown>>)({
		params: { sectionId: section },
		locals: { supabase: client(user), claims: { sub: user.id, email: user.email, role: 'authenticated' } }
	})) as { work: Record<string, { state: string; completedAt?: string }>; classClock: { now: string } };
	return data;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	fks = await loadForeignKeys(db);
	admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
	teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
	ana = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
	bruno = await createUser(db, 'bruno.okafor@boscotech.net', 'Bruno Okafor');
	await db.sql('insert into public.app_admins (email, granted_by) values ($1, $1) on conflict do nothing', [
		admin.email
	]);
	section = await createClassroomSection(db, {
		as: admin,
		courseCode: 'IDEA100',
		courseTitle: 'Introduction to Engineering',
		label: 'Period 3',
		teacherEmail: teacher.email
	});
	for (const s of [ana, bruno]) {
		await enrollStudent(db, { as: teacher, sectionId: section, email: s.email, displayName: s.email });
	}
	const create = async (title: string) =>
		(
			await rpc<{ item_id: string }>(
				teacher,
				`public.classroom_create_item(
					p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
					p_body => 'Body.', p_points => 4, p_due_at => $3::timestamptz, p_published => true)`,
				[[section], title, new Date(Date.now() + 3 * 86_400_000).toISOString()]
			)
		).item_id;
	worksheet = await create('Gear train worksheet');
	spec = await create('A spec assignment beside it');
	await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [
		worksheet,
		DOCUMENT,
		JSON.stringify(MANIFEST),
		'gear-train.html'
	]);

	// Ana answers every counted block; Bruno only the ratio.
	expect((await save(ana, 'm1-ratio', '3:1')).ok).toBe(true);
	expect((await save(ana, 'm2-why', 'The driver has 12 teeth. The driven gear has 36.')).ok).toBe(true);
	expect((await save(bruno, 'm1-ratio', '2:1')).ok).toBe(true);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

describe('the seeding is what the feature has to work with', () => {
	it('saving answers created NO submission row for either student (the loaders must not need one)', async () => {
		const rows = await db.sql<{ n: string }>('select count(*)::text as n from public.classroom_submissions');
		expect(rows.rows[0].n).toBe('0');
	});
});

describe('the class page load, as each student', () => {
	it('Ana: the worksheet is complete, so Done and "Complete"; the spec assignment beside it is untouched', async () => {
		const data = await classWork(ana);
		const w = data.work[worksheet];
		expect(typeof w?.completedAt).toBe('string');
		expect(assignmentStanding({ kind: 'assignment', due_at: null }, w as never, data.classClock.now)).toBe('done');
		expect(studentWorkChip({ kind: 'assignment', due_at: null, points: 4 }, w as never, data.classClock.now).label).toBe(
			'Complete'
		);
		expect(data.work[spec]).toBeUndefined();
	});

	it("Bruno: half answered, so no completion -- and Ana's answers never finish his", async () => {
		const data = await classWork(bruno);
		expect(data.work[worksheet]).toBeUndefined();
	});
});

describe('the shared owed-work load (home page, My Classes, the to-do)', () => {
	it("Ana's own rows carry the completion, and her to-do lists it under Done", async () => {
		const work = await loadClassroomWork(client(ana), { userId: ana.id, email: ana.email, isAdmin: false });
		const mine = work.submissions.filter((s) => s.item_id === worksheet);
		expect(mine).toHaveLength(1);
		expect(typeof mine[0].completed_at).toBe('string');
		const rows = buildTodo({
			sections: work.sections,
			items: work.items,
			submissions: work.submissions,
			checkIns: [],
			myEmail: ana.email,
			isAdmin: false,
			clock: work.clock
		});
		expect(rows.find((r) => r.key === `item:${worksheet}`)).toMatchObject({ view: 'done', state: 'Complete' });
		expect(rows.find((r) => r.key === `item:${spec}`)).toMatchObject({ view: 'assigned' });
	});

	it('Bruno reads no completion at all, for himself or anybody else', async () => {
		const work = await loadClassroomWork(client(bruno), { userId: bruno.id, email: bruno.email, isAdmin: false });
		expect(work.submissions.filter((s) => s.completed_at !== undefined)).toEqual([]);
	});

	it("the teacher's tally reads ONE worksheet to grade: Ana's, not Bruno's", async () => {
		const work = await loadClassroomWork(client(teacher), { userId: teacher.id, email: teacher.email, isAdmin: false });
		const done = work.submissions.filter((s) => s.item_id === worksheet && typeof s.completed_at === 'string');
		expect(done.map((s) => s.student_email)).toEqual([ana.email]);
		const feeds = buildFeed({
			sections: work.sections,
			items: work.items,
			submissions: work.submissions,
			myEmail: teacher.email,
			now: new Date(work.clock.now)
		});
		const entry = feeds[0].urgent.find((e) => e.item.id === worksheet);
		expect(entry).toMatchObject({ reason: 'ungraded', count: 1 });
	});
});
