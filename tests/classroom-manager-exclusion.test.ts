// tests/classroom-manager-exclusion.test.ts
//
// Migration 0136 against a real Postgres: the MANAGER EXCLUSION and the
// BOUNDED ENROLLMENT REMOVAL.
//
// WHY THIS IS A TEST AND NOT A HARNESS DRIVE. Both guarantees fail SILENTLY.
// An instructor rendering as a student looks exactly like a student -- a name
// on the check-in grid, a row in the grading roster, a line in the FACTS CSV,
// one more head in the Grades denominator -- and nothing anywhere raises. A
// removal that deletes an enrollment with work behind it looks like a removal
// that worked, right up until somebody goes looking for the work.
//
// THE MIGRATION IS TESTED OVER SEEDED PRE-MIGRATION DATA (the 0128 pattern):
// the suite boots the chain SHORT of 0136, seeds a full class -- students,
// assignments, real hand-ins, notebook entries -- through the REAL RPCs,
// captures every payload the bundle claims to change, then applies 0136 over
// the top and compares. A migration that only works against an empty schema
// fails exactly where it matters.
//
// EVERY EXCLUSION CARRIES A POSITIVE CONTROL, and every verification query
// returns the IDENTITY of what it examined rather than a bare count: "3 rows"
// cannot tell a correct roster from a roster that dropped the wrong person.
//
// Cast. teacherA (tvargas) runs P1 and IS ENROLLED IN IT -- that is the
// reported defect, and she has real work attached, so she is also the refused
// removal. The pinned owner is enrolled in P1 too: an ADMIN who is not the
// teacher of record, which is the half a `teacher_email` comparison alone
// would miss. alice has work; dara has none (the removable case); evan has
// nothing but a SOFT-DELETED notebook entry (0116/0117 make it restorable, so
// it must still refuse); teacherB runs P9 and manages nothing in P1.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import {
	gradesCsv,
	studentWorkRows,
	type GradingData,
	type ModuleApprovalRow,
	type ResponseRow,
	type SubmissionFileRow,
	type SubmissionRow
} from '../src/lib/classroom/assignment-spec';
import {
	assignmentStandings,
	enrollmentWorkSummary,
	normalizeItemRow,
	normalizeSectionRow,
	splitRoster,
	type ClassroomEnrollment,
	type ClassroomItem,
	type ClassroomSection,
	type SubmissionSummary
} from '../src/lib/classroom/classroom';
import { buildFeed, type FeedSubmission } from '../src/lib/classroom/feed';

/**
 * The live chain, up to and including the notebook draft state -- 0118 is
 * where `_notebook_section_roster` currently lives, which is the function the
 * check-in grid's roster comes out of, and 0121 is the live
 * `notebook_get_section_grid` that reads it. Without both, "the manager is off
 * the grid" would be a claim about a function the project does not run.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql',
	'0098_notebook_session_postings.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0120_notebook_session_item_link.sql',
	'0121_notebook_review_acknowledged.sql'
] as const;

const MIGRATION_0136 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0136_classroom_manager_exclusion_and_enrollment_removal.sql'),
	'utf8'
);

let db: TestDb;
let owner: SeededUser; // apina@boscotech.edu -- pinned admin, ENROLLED in P1
let teacherA: SeededUser; // teacher of record for P1, ENROLLED in P1
let teacherB: SeededUser; // teacher of record for P9, manages nothing in P1
let alice: SeededUser; // work everywhere -- the refused removal
let bruno: SeededUser; // a hand-in awaiting grade -- the to-grade control
let dara: SeededUser; // nothing attached -- the removable case
let evan: SeededUser; // ONLY a soft-deleted notebook entry
let p1: string;
let p9: string;
let worksheet: string;

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[]
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

async function captureError(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		return (error as { message?: string }).message ?? String(error);
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

function levels(max: number) {
	return [
		{ points: max, label: 'Complete', descriptor: 'Everything asked for is present and correct.' },
		{ points: Math.round(max / 2), label: 'Developing', descriptor: 'Some of it is present.' },
		{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
	];
}

const SPEC = {
	schemaVersion: 1,
	meta: { assignmentId: 'idea100-u1-01', title: 'Material ID Checkpoint', totalPoints: 20 },
	modules: [
		{
			id: 'm1',
			title: 'Observe',
			points: 10,
			blocks: [
				{ type: 'instructions', content: 'Look closely at the six materials.' },
				{ type: 'textField', id: 'f1', prompt: 'Explain your method.', minSentences: 1 },
				{
					type: 'table',
					id: 't1',
					columns: [
						{ key: 'material', label: 'Material' },
						{ key: 'obs', label: 'Observation' }
					],
					minRows: 1
				}
			],
			rubric: [{ id: 'c1', criterion: 'Method explained', levels: levels(10) }]
		},
		{
			id: 'm2',
			title: 'Evidence',
			points: 10,
			blocks: [
				{ type: 'imageZone', id: 'z1', minImages: 1, captions: true },
				{ type: 'checklist', id: 'k1', items: ['Tool zeroed', 'Bench cleared'] }
			],
			rubric: [{ id: 'c1', criterion: 'Evidence complete', levels: levels(10) }]
		}
	]
};

const RUBRIC = [
	{ id: 'r1', criterion: 'Observe: method explained', levels: levels(10) },
	{ id: 'r2', criterion: 'Evidence: complete', levels: levels(10) }
];

// ---------------------------------------------------------------------------
// The four surfaces, driven through the REAL modules the routes drive.
// ---------------------------------------------------------------------------

/** transports.loadGrading's read, since 0136 through classroom_section_roster. */
async function loadGrading(
	userId: string,
	itemId: string,
	sectionId: string,
	viaRpc: boolean
): Promise<GradingData> {
	return db.asUser(userId, async (q) => {
		const roster = viaRpc
			? await q<ClassroomEnrollment>(
					`select section_id, student_email, display_name, active, updated_at, manages
					 from public.classroom_section_roster($1::uuid)`,
					[sectionId]
				)
			: await q<ClassroomEnrollment>(
					`select section_id, student_email, display_name, active, updated_at
					 from public.classroom_enrollments where section_id = $1 order by display_name`,
					[sectionId]
				);
		const submissions = await q<SubmissionRow>(
			`select * from public.classroom_submissions where item_id = $1`,
			[itemId]
		);
		const responses = await q<ResponseRow>(
			`select item_id, student_email, block_id, value, updated_at
			 from public.classroom_responses where item_id = $1`,
			[itemId]
		);
		const files = await q<SubmissionFileRow>(
			`select f.* from public.classroom_submission_files f
			 join public.classroom_submissions s on s.id = f.submission_id where s.item_id = $1`,
			[itemId]
		);
		const approvals = await q<ModuleApprovalRow>(
			`select item_id, student_email, module_id, approved_by, approved_at
			 from public.classroom_module_approvals where item_id = $1`,
			[itemId]
		);
		return {
			roster: roster.rows,
			submissions: submissions.rows,
			responses: responses.rows,
			files: files.rows,
			approvals: approvals.rows
		} as GradingData;
	});
}

/** The grading console + the FACTS export, from ONE payload. */
async function consoleSnapshot(userId: string, itemId: string, sectionId: string, viaRpc: boolean) {
	const data = await loadGrading(userId, itemId, sectionId, viaRpc);
	const { rows, offRoster, managers } = studentWorkRows(data);
	return {
		rosterEmails: rows.map((r) => r.email),
		offRoster,
		managers,
		csv: gradesCsv(
			rows.map((r) => ({
				displayName: r.displayName,
				email: r.email,
				score: r.submission?.state === 'returned' ? (r.submission.score ?? null) : null,
				outOf: 20
			}))
		)
	};
}

/** The Grades tab denominator (routes/classroom/[sectionId]/grades). */
async function gradesDenominator(userId: string, sectionId: string, viaRpc: boolean) {
	return db.asUser(userId, async (q) => {
		const items = await q(
			`select i.*, coalesce(json_agg(json_build_object('section_id', pg.section_id)), '[]') as postings
			 from public.classroom_items i
			 join public.classroom_postings pg on pg.item_id = i.id
			 where pg.section_id = $1 group by i.id`,
			[sectionId]
		);
		const roster = viaRpc
			? await q<ClassroomEnrollment>(
					`select section_id, student_email, display_name, active, updated_at, manages
					 from public.classroom_section_roster($1::uuid)`,
					[sectionId]
				)
			: await q<ClassroomEnrollment>(
					`select section_id, student_email, display_name, active, updated_at
					 from public.classroom_enrollments where section_id = $1`,
					[sectionId]
				);
		const { students } = splitRoster(roster.rows.filter((e) => e.active));
		const ids = items.rows.map((r) => (r as { id: string }).id);
		const subs = await q<SubmissionSummary>(
			`select item_id, state, score from public.classroom_submissions where item_id = any($1::uuid[])`,
			[ids]
		);
		const standings = assignmentStandings(
			items.rows.map((r) => normalizeItemRow(r as unknown as Record<string, unknown>)),
			subs.rows,
			students.length
		);
		return { denominator: standings[0]?.roster ?? 0, counted: students.map((s) => s.student_email) };
	});
}

/** The home feed's to-grade chip (buildFeed), for a manager of the section. */
async function toGradeChip(userId: string, email: string, sectionId: string, viaRpc: boolean) {
	return db.asUser(userId, async (q) => {
		const sectionRow = await q(
			`select s.*, c.code as course_code, c.title as course_title
			 from public.classroom_sections s join public.classroom_courses c on c.id = s.course_id
			 where s.id = $1`,
			[sectionId]
		);
		const items = await q(
			`select i.*, coalesce(json_agg(json_build_object('section_id', pg.section_id)), '[]') as postings
			 from public.classroom_items i
			 join public.classroom_postings pg on pg.item_id = i.id
			 where pg.section_id = $1 group by i.id`,
			[sectionId]
		);
		const subs = await q<FeedSubmission>(
			`select s.item_id, s.student_email, s.state, s.submitted_at, s.returned_at, s.graded_at
			 from public.classroom_submissions s
			 join public.classroom_postings pg on pg.item_id = s.item_id
			 where pg.section_id = $1`,
			[sectionId]
		);
		const managerEmails: Record<string, string[]> = {};
		if (viaRpc) {
			const managed = await q<{ section_id: string; student_email: string; manages: boolean }>(
				`select section_id, student_email, manages from public.classroom_section_roster(null)`
			);
			for (const row of managed.rows) {
				if (!row.manages) continue;
				(managerEmails[row.section_id] ??= []).push(row.student_email);
			}
		}
		const feed = buildFeed({
			sections: [
				normalizeSectionRow(sectionRow.rows[0] as unknown as Record<string, unknown>) as ClassroomSection
			],
			items: items.rows.map((r) =>
				normalizeItemRow(r as unknown as Record<string, unknown>)
			) as ClassroomItem[],
			submissions: subs.rows,
			myEmail: email,
			isAdmin: false,
			managerEmails
		});
		return feed[0].urgent
			.concat(feed[0].standing)
			.reduce((n, e) => n + (e.reason === 'ungraded' ? (e.count ?? 0) : 0), 0);
	});
}

/** The check-in grid's roster: names, not a count. */
async function checkInGridNames(sectionId: string): Promise<string[]> {
	const { rows } = await db.sql<{ email: string | null; name: string; enrolled: boolean }>(
		`select email, name, enrolled from public._notebook_section_roster($1::uuid) order by name`,
		[sectionId]
	);
	return rows.map((r) => `${r.name} <${r.email ?? 'no-email'}> ${r.enrolled ? 'enrolled' : 'LEFT'}`);
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	teacherA = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	teacherB = await createUser(db, 'mreed@boscotech.edu', 'M. Reed');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Baptiste');
	dara = await createUser(db, 'dara@boscotech.net', 'Dara Nwosu');
	evan = await createUser(db, 'evan@boscotech.net', 'Evan Ostrowski');

	const courseId = (
		await rpc<{ course_id: string }>(teacherA.id, 'public.classroom_upsert_course($1, $2)', [
			'IDEA100',
			'Intro to Engineering Design'
		])
	).course_id;
	p1 = (
		await rpc<{ section_id: string }>(
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 1', 'Block A']
		)
	).section_id;
	p9 = (
		await rpc<{ section_id: string }>(
			teacherB.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 9', null]
		)
	).section_id;

	// The roster, INCLUDING the two rows this bundle is about: the teacher of
	// record and a site admin, both enrolled in P1 as if they were students.
	for (const [section, email, name] of [
		[p1, alice.email, 'Alice Alvarez'],
		[p1, bruno.email, 'Bruno Baptiste'],
		[p1, dara.email, 'Dara Nwosu'],
		[p1, evan.email, 'Evan Ostrowski'],
		[p1, teacherA.email, 'T. Vargas'],
		[p1, owner.email, 'Site Owner']
	] as const) {
		await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			section,
			email,
			name,
			true
		]);
	}

	worksheet = (
		await rpc<{ item_id: string }>(
			teacherA.id,
			`public.classroom_create_item('assignment', $1::uuid[], $2, $3, $4, null, null, true, '[]'::jsonb, false)`,
			[[p1], 'Material worksheet', 'Do the work.', 20]
		)
	).item_id;
	await rpc(teacherA.id, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
		worksheet,
		JSON.stringify(SPEC)
	]);
	await rpc(teacherA.id, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
		worksheet,
		JSON.stringify(RUBRIC)
	]);

	const save = (u: SeededUser, block: string, value: unknown) =>
		rpc(u.id, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
			worksheet,
			block,
			JSON.stringify(value)
		]);

	// Alice: responses + a graded, returned hand-in.
	await save(alice, 'f1', { text: 'I compared the samples by mass.' });
	await save(alice, 't1', { rows: [{ material: 'Steel', obs: 'Heavy' }] });
	await save(alice, 'k1', { checked: [true, true] });
	await rpc(alice.id, 'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5, $6, $7)', [
		worksheet, 'drive-alice-1', 'alice.jpg', 'image/jpeg', 1234, 'z1', 'Bench shot'
	]);
	const aliceSubmit = await rpc<{ ok: boolean }>(
		alice.id,
		'public.classroom_submit_assignment($1::uuid)',
		[worksheet]
	);
	if (!aliceSubmit.ok) throw new Error('fixture: alice could not submit');
	const graded = await rpc<{ ok: boolean }>(
		teacherA.id,
		'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb)',
		[worksheet, alice.email, JSON.stringify({ r1: 10, r2: 5 }), 'Solid work.', true, null]
	);
	if (!graded.ok) throw new Error(`fixture: grading alice failed: ${JSON.stringify(graded)}`);

	// Bruno: handed in and AWAITING grade, so the to-grade tally is not zero --
	// a count that is zero before and after would prove nothing about it.
	await save(bruno, 'f1', { text: 'I used the scale.' });
	await save(bruno, 't1', { rows: [{ material: 'Ash', obs: 'Light' }] });
	await save(bruno, 'k1', { checked: [true, true] });
	await rpc(bruno.id, 'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5, $6, $7)', [
		worksheet, 'drive-bruno-1', 'bruno.jpg', 'image/jpeg', 999, 'z1', null
	]);
	const brunoSubmit = await rpc<{ ok: boolean }>(
		bruno.id,
		'public.classroom_submit_assignment($1::uuid)',
		[worksheet]
	);
	if (!brunoSubmit.ok) throw new Error('fixture: bruno could not submit');

	// THE DEFECT ITSELF: the teacher of record works the assignment from her own
	// enrollment and hands it in, so she reaches the roster, the CSV, the Grades
	// denominator AND her own to-grade chip.
	await save(teacherA, 'f1', { text: 'Checking what the students see.' });
	await save(teacherA, 't1', { rows: [{ material: 'Brass', obs: 'Dense' }] });
	await save(teacherA, 'k1', { checked: [true, true] });
	await rpc(teacherA.id, 'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5, $6, $7)', [
		worksheet, 'drive-tv-1', 'tv.jpg', 'image/jpeg', 500, 'z1', null
	]);
	const teacherSubmit = await rpc<{ ok: boolean }>(
		teacherA.id,
		'public.classroom_submit_assignment($1::uuid)',
		[worksheet]
	);
	if (!teacherSubmit.ok) throw new Error('fixture: teacherA could not submit');

	// A notebook check-in in P1, so the grid has real columns, and entries so
	// the `holders` branch has somebody to put back.
	const session = (
		await rpc<{ session_id: string }>(
			teacherA.id,
			'public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4)',
			[[p1], 1, '2026-09-02', 'Bench day 1']
		)
	).session_id;
	for (const student of [alice, teacherA]) {
		await rpc(student.id, 'public.notebook_create_entry($1, $2, $3, $4, $5, $6)', [
			student.id,
			`drive-${student.email}`,
			session,
			p1,
			null,
			'page.jpg'
		]);
	}
	// Evan files one and then DELETES it. 0116/0117 make that restorable, which
	// is the whole reason the removal has to count it.
	const evanEntry = (
		await rpc<{ entry_id: string }>(
			evan.id,
			'public.notebook_create_entry($1, $2, $3, $4, $5, $6)',
			[evan.id, 'drive-evan', session, p1, null, 'page.jpg']
		)
	).entry_id;
	await rpc(evan.id, 'public.notebook_delete_entry($1::uuid)', [evanEntry]);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. The defect, before the migration. Everything below is a comparison, so
//    the pre-state has to be non-empty and has to contain the manager.
// ---------------------------------------------------------------------------

describe('before 0136: a manager renders as a student', () => {
	test('the fixture really is pre-migration', async () => {
		const { rows } = await db.sql<{ roster: string | null; remove: string | null }>(
			`select to_regprocedure('public.classroom_section_roster(uuid)')::text as roster,
			        to_regprocedure('public.classroom_remove_enrollment(uuid, text)')::text as remove`
		);
		expect(rows[0].roster).toBeNull();
		expect(rows[0].remove).toBeNull();
	});

	test('the grading roster, the FACTS CSV and the Grades denominator all carry her', async () => {
		const snap = await consoleSnapshot(teacherA.id, worksheet, p1, false);
		expect(snap.rosterEmails).toEqual([
			alice.email,
			bruno.email,
			dara.email,
			evan.email,
			owner.email,
			teacherA.email
		]);
		// The CSV is Last,First,Score,Out of -- it carries no addresses at all,
		// so the identity to look for in it is the SURNAME.
		expect(snap.csv).toContain('Vargas');
		expect(snap.csv).toContain('Owner');
		expect(snap.offRoster).toEqual([]);
		expect(snap.managers).toEqual([]);

		const grades = await gradesDenominator(teacherA.id, p1, false);
		expect(grades.denominator).toBe(6);
		expect(grades.counted).toContain(teacherA.email);
	});

	test('the check-in grid carries her, and the to-grade chip counts her own hand-in', async () => {
		const names = await checkInGridNames(p1);
		expect(names).toContain('T. Vargas <tvargas@boscotech.edu> enrolled');
		expect(names).toContain('Alice Alvarez <alice@boscotech.net> enrolled');
		// WHO is awaiting, read straight off the table, so the tally below is
		// compared against an identity list and not against itself.
		const awaiting = await db.sql<{ student_email: string }>(
			`select student_email from public.classroom_submissions
			 where item_id = $1 and state = 'submitted' order by student_email`,
			[worksheet]
		);
		expect(awaiting.rows.map((r) => r.student_email)).toEqual([bruno.email, teacherA.email]);
		expect(await toGradeChip(teacherA.id, teacherA.email, p1, false)).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// 2. The migration.
// ---------------------------------------------------------------------------

describe('0136 applies over that data, and re-applies', () => {
	test('it applies twice', async () => {
		await db.sql(MIGRATION_0136);
		// Re-pasting a migration is ordinary here (a first attempt that failed
		// partway gets retried), so it has to survive a second pass.
		await db.sql(MIGRATION_0136);
		const { rows } = await db.sql<{ roster: string | null; remove: string | null }>(
			`select to_regprocedure('public.classroom_section_roster(uuid)')::text as roster,
			        to_regprocedure('public.classroom_remove_enrollment(uuid, text)')::text as remove`
		);
		expect(rows[0].roster).toBe('classroom_section_roster(uuid)');
		expect(rows[0].remove).toBe('classroom_remove_enrollment(uuid,text)');
	});

	test('exactly one row per function: no surviving overload (the signature trap)', async () => {
		const { rows } = await db.sql<{ name: string; n: string }>(
			`select p.proname as name, count(*)::text as n
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
			   and p.proname in ('classroom_section_roster', 'classroom_remove_enrollment',
			                     'classroom_manages_section', 'is_admin',
			                     '_classroom_manages_section_email', '_admin_is_email')
			 group by p.proname order by p.proname`
		);
		expect(rows.map((r) => `${r.name}=${r.n}`)).toEqual([
			'_admin_is_email=1',
			'_classroom_manages_section_email=1',
			'classroom_manages_section=1',
			'classroom_remove_enrollment=1',
			'classroom_section_roster=1',
			'is_admin=1'
		]);
	});

	test('is_admin and classroom_manages_section still answer exactly as they did', async () => {
		// The two wrappers are the highest-blast-radius edit in the bundle, so
		// they are asserted by IDENTITY across every caller that matters.
		const answers: Record<string, { admin: boolean; p1: boolean; p9: boolean }> = {};
		for (const u of [owner, teacherA, teacherB, alice]) {
			answers[u.email] = await db.asUser(u.id, async (q) => {
				const { rows } = await q<{ a: boolean; m1: boolean; m9: boolean }>(
					`select public.is_admin() as a,
					        public.classroom_manages_section($1::uuid) as m1,
					        public.classroom_manages_section($2::uuid) as m9`,
					[p1, p9]
				);
				return { admin: rows[0].a, p1: rows[0].m1, p9: rows[0].m9 };
			});
		}
		expect(answers).toEqual({
			'apina@boscotech.edu': { admin: true, p1: true, p9: true },
			'tvargas@boscotech.edu': { admin: false, p1: true, p9: false },
			'mreed@boscotech.edu': { admin: false, p1: false, p9: true },
			'alice@boscotech.net': { admin: false, p1: false, p9: false }
		});
		// Signed out: both must still answer false. Run as the OWNER connection
		// with no jwt claims set, because `anon` holds no EXECUTE grant on
		// either function and would be refused before reaching the body -- the
		// question here is what the BODY answers with no session, which is the
		// case the two wrappers had to preserve (current_user_email() is '' and
		// not null there, so '' has to be refused explicitly).
		const signedOut = await db.sql<{ a: boolean; m: boolean; e: string }>(
			`select public.is_admin() as a,
			        public.classroom_manages_section($1::uuid) as m,
			        public.current_user_email() as e`,
			[p1]
		);
		expect(signedOut.rows[0]).toEqual({ a: false, m: false, e: '' });
	});
});

// ---------------------------------------------------------------------------
// 3. The exclusion, on all five surfaces. Identities, and positive controls.
// ---------------------------------------------------------------------------

describe('after 0136: a manager is never a student row', () => {
	test('classroom_section_roster names exactly who manages, and it is not only the teacher', async () => {
		const rows = await db.asUser(teacherA.id, async (q) => {
			const { rows } = await q<{ student_email: string; manages: boolean }>(
				`select student_email, manages from public.classroom_section_roster($1::uuid)`,
				[p1]
			);
			return rows;
		});
		expect(rows.filter((r) => r.manages).map((r) => r.student_email).sort()).toEqual([
			owner.email, // an ADMIN who is NOT the teacher of record
			teacherA.email // the teacher of record
		]);
		expect(rows.filter((r) => !r.manages).map((r) => r.student_email).sort()).toEqual([
			alice.email,
			bruno.email,
			dara.email,
			evan.email
		]);
	});

	test('a student gets nothing from it at all: this is a management read', async () => {
		const rows = await db.asUser(alice.id, async (q) =>
			(await q(`select student_email from public.classroom_section_roster($1::uuid)`, [p1])).rows
		);
		expect(rows).toEqual([]);
		// POSITIVE CONTROL: she can still read her OWN enrollment off the table,
		// so the empty answer above is the function's gate and not a broken read.
		const own = await db.asUser(alice.id, async (q) =>
			(
				await q<{ student_email: string }>(
					`select student_email from public.classroom_enrollments where section_id = $1`,
					[p1]
				)
			).rows.map((r) => r.student_email)
		);
		expect(own).toEqual([alice.email]);
	});

	test('the grading roster and the FACTS CSV drop them, and say so on their own line', async () => {
		const snap = await consoleSnapshot(teacherA.id, worksheet, p1, true);
		expect(snap.rosterEmails).toEqual([alice.email, bruno.email, dara.email, evan.email]);
		expect(snap.managers).toEqual([owner.email, teacherA.email]);
		// The two findings stay APART: a manager exclusion is not an off-roster
		// report, and this fixture has no genuine off-roster row.
		expect(snap.offRoster).toEqual([]);
		expect(snap.csv).not.toContain('Vargas');
		expect(snap.csv).not.toContain('Owner');
		// POSITIVE CONTROL: the export is not simply empty, and still carries
		// every student who was in it before.
		expect(snap.csv.trim().split('\r\n').slice(1).map((l) => l.split(',')[0])).toEqual([
			'Alvarez',
			'Baptiste',
			'Nwosu',
			'Ostrowski'
		]);
	});

	test('the Grades denominator counts the four students and neither manager', async () => {
		const grades = await gradesDenominator(teacherA.id, p1, true);
		expect(grades.counted.sort()).toEqual([alice.email, bruno.email, dara.email, evan.email]);
		expect(grades.denominator).toBe(4);
	});

	test('the check-in grid drops them, in BOTH branches', async () => {
		const names = await checkInGridNames(p1);
		expect(names).not.toContain('T. Vargas <tvargas@boscotech.edu> enrolled');
		expect(names.filter((n) => n.includes('tvargas@boscotech.edu'))).toEqual([]);
		expect(names.filter((n) => n.includes('apina@boscotech.edu'))).toEqual([]);
		// POSITIVE CONTROL: the students are all still there, so the grid did
		// not simply go empty. Evan's entry is soft-deleted and he has no
		// submitted entry, so he is on it through his ACTIVE enrollment.
		expect(names.sort()).toEqual([
			'Alice Alvarez <alice@boscotech.net> enrolled',
			'Bruno Baptiste <bruno@boscotech.net> enrolled',
			'Dara Nwosu <dara@boscotech.net> enrolled',
			'Evan Ostrowski <evan@boscotech.net> enrolled'
		]);
	});

	test('the holders branch cannot put a manager back after a deactivation', async () => {
		// This is the exact shape of the reported row: LEFT badge, dashed cells,
		// a work count beneath it. Deactivating never removed it, because the
		// teacher HAS a submitted notebook entry in this section.
		await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			p1,
			teacherA.email,
			'T. Vargas',
			false
		]);
		// Both entries were filed by the 6-argument notebook_create_entry, which
		// turns them in on creation -- so both are `holders` already. POSITIVE
		// CONTROL: alice is deactivated the same way and MUST come back as LEFT,
		// which is what proves the branch is live rather than simply empty.
		await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			p1,
			alice.email,
			'Alice Alvarez',
			false
		]);

		const names = await checkInGridNames(p1);
		expect(names.filter((n) => n.includes('tvargas@boscotech.edu'))).toEqual([]);
		expect(names).toContain('Alice Alvarez <alice@boscotech.net> LEFT');

		// Put the fixture back the way the rest of the file expects it.
		for (const [email, name] of [
			[teacherA.email, 'T. Vargas'],
			[alice.email, 'Alice Alvarez']
		] as const) {
			await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
				p1,
				email,
				name,
				true
			]);
		}
	});

	test('the to-grade chip stops counting the manager own hand-in', async () => {
		// Bruno alone, now. Alice is returned; the teacher's own hand-in is not
		// somebody's work to grade.
		expect(await toGradeChip(teacherA.id, teacherA.email, p1, true)).toBe(1);
		// POSITIVE CONTROL: the same read with no manager list is still 2, so
		// the drop is the exclusion and not the fixture changing underneath.
		expect(await toGradeChip(teacherA.id, teacherA.email, p1, false)).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// 4. The removal: both branches, and the boundary.
// ---------------------------------------------------------------------------

type Removal = {
	ok: boolean;
	reason?: string;
	student_email?: string;
	total?: number;
	counts?: Record<string, number>;
};

describe('classroom_remove_enrollment', () => {
	test('an enrollment with nothing attached is deleted', async () => {
		const before = await db.sql<{ student_email: string }>(
			`select student_email from public.classroom_enrollments
			 where section_id = $1 order by student_email`,
			[p1]
		);
		expect(before.rows.map((r) => r.student_email)).toContain(dara.email);

		const res = await rpc<Removal>(
			teacherA.id,
			'public.classroom_remove_enrollment($1::uuid, $2)',
			[p1, dara.email]
		);
		expect(res).toEqual({ ok: true, section_id: p1, student_email: dara.email });

		const after = await db.sql<{ student_email: string }>(
			`select student_email from public.classroom_enrollments
			 where section_id = $1 order by student_email`,
			[p1]
		);
		// The IDENTITIES that remain, not a count: a delete that took the wrong
		// row would leave the same number behind.
		expect(after.rows.map((r) => r.student_email)).toEqual([
			alice.email,
			owner.email,
			bruno.email,
			evan.email,
			teacherA.email
		].sort());
	});

	test('removing somebody already gone is a refusal, not a raise', async () => {
		const res = await rpc<Removal>(
			teacherA.id,
			'public.classroom_remove_enrollment($1::uuid, $2)',
			[p1, dara.email]
		);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not_enrolled');
		expect(res.student_email).toBe(dara.email);
	});

	test('an enrollment with work attached is refused, with the counts, and nothing is deleted', async () => {
		// The counts this test compares against are taken INDEPENDENTLY, off the
		// tables, rather than from the function being tested.
		const expected = await db.sql<{
			responses: string;
			submissions: string;
			approvals: string;
			entries: string;
		}>(
			`select
			   (select count(*) from public.classroom_responses r
			      join public.classroom_postings pg on pg.item_id = r.item_id
			      where r.student_email = $2 and pg.section_id = $1)::text as responses,
			   (select count(*) from public.classroom_submissions s
			      join public.classroom_postings pg on pg.item_id = s.item_id
			      where s.student_email = $2 and pg.section_id = $1)::text as submissions,
			   (select count(*) from public.classroom_module_approvals a
			      join public.classroom_postings pg on pg.item_id = a.item_id
			      where a.student_email = $2 and pg.section_id = $1)::text as approvals,
			   (select count(*) from public.notebook_entries ne
			      where ne.student_id = $3 and ne.section_id = $1)::text as entries`,
			[p1, alice.email, alice.id]
		);
		const e = expected.rows[0];
		expect(Number(e.responses)).toBeGreaterThan(0);
		expect(Number(e.submissions)).toBeGreaterThan(0);
		expect(Number(e.entries)).toBeGreaterThan(0);

		const res = await rpc<Removal>(
			teacherA.id,
			'public.classroom_remove_enrollment($1::uuid, $2)',
			[p1, alice.email]
		);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('work_attached');
		expect(res.counts).toEqual({
			responses: Number(e.responses),
			submissions: Number(e.submissions),
			approvals: Number(e.approvals),
			notebook_entries: Number(e.entries)
		});
		expect(res.total).toBe(
			Number(e.responses) + Number(e.submissions) + Number(e.approvals) + Number(e.entries)
		);

		// NOTHING was deleted, and nothing was PARTIALLY deleted: the enrollment
		// is still there and every one of the four counts is unchanged.
		const still = await db.sql<{ student_email: string }>(
			`select student_email from public.classroom_enrollments
			 where section_id = $1 and student_email = $2`,
			[p1, alice.email]
		);
		expect(still.rows.map((r) => r.student_email)).toEqual([alice.email]);
		const recheck = await db.sql<{ responses: string; submissions: string; entries: string }>(
			`select
			   (select count(*) from public.classroom_responses r
			      join public.classroom_postings pg on pg.item_id = r.item_id
			      where r.student_email = $2 and pg.section_id = $1)::text as responses,
			   (select count(*) from public.classroom_submissions s
			      join public.classroom_postings pg on pg.item_id = s.item_id
			      where s.student_email = $2 and pg.section_id = $1)::text as submissions,
			   (select count(*) from public.notebook_entries ne
			      where ne.student_id = $3 and ne.section_id = $1)::text as entries`,
			[p1, alice.email, alice.id]
		);
		expect(recheck.rows[0].responses).toBe(e.responses);
		expect(recheck.rows[0].submissions).toBe(e.submissions);
		expect(recheck.rows[0].entries).toBe(e.entries);
	});

	test('a SOFT-DELETED notebook entry alone is enough to refuse (decision 13)', async () => {
		// Evan has nothing but one entry he deleted. It is restorable, so
		// deleting his enrollment would strand it.
		const state = await db.sql<{ id: string; deleted_at: string | null }>(
			`select id, deleted_at::text from public.notebook_entries
			 where student_id = $1 and section_id = $2`,
			[evan.id, p1]
		);
		expect(state.rows.length).toBe(1);
		expect(state.rows[0].deleted_at).not.toBeNull();

		const res = await rpc<Removal>(
			teacherA.id,
			'public.classroom_remove_enrollment($1::uuid, $2)',
			[p1, evan.email]
		);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('work_attached');
		expect(res.counts).toEqual({
			responses: 0,
			submissions: 0,
			approvals: 0,
			notebook_entries: 1
		});
		// The sentence a caller renders from it names the one nonzero count only.
		expect(enrollmentWorkSummary(res.counts as never)).toBe('1 notebook entry');

		const still = await db.sql<{ student_email: string }>(
			`select student_email from public.classroom_enrollments
			 where section_id = $1 and student_email = $2`,
			[p1, evan.email]
		);
		expect(still.rows.map((r) => r.student_email)).toEqual([evan.email]);
	});

	test('a manager row with no work behind it can be removed outright', async () => {
		// The owner is enrolled in P1 as an admin and has done nothing in it.
		const res = await rpc<Removal>(
			owner.id,
			'public.classroom_remove_enrollment($1::uuid, $2)',
			[p1, owner.email]
		);
		expect(res).toEqual({ ok: true, section_id: p1, student_email: owner.email });
		const left = await db.sql<{ student_email: string }>(
			`select student_email from public.classroom_enrollments where section_id = $1
			 order by student_email`,
			[p1]
		);
		expect(left.rows.map((r) => r.student_email)).toEqual(
			[alice.email, bruno.email, evan.email, teacherA.email].sort()
		);
	});
});

// ---------------------------------------------------------------------------
// 5. The boundary. No new gate, no new grant, no second path.
// ---------------------------------------------------------------------------

describe('the removal boundary', () => {
	test('a manager of ANOTHER section is refused, by the existing gate', async () => {
		const message = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_remove_enrollment($1::uuid, $2)', [p1, bruno.email])
		);
		expect(message).toContain("teacher of record or a site admin");
		const still = await db.sql<{ student_email: string }>(
			`select student_email from public.classroom_enrollments
			 where section_id = $1 and student_email = $2`,
			[p1, bruno.email]
		);
		expect(still.rows.map((r) => r.student_email)).toEqual([bruno.email]);
	});

	test('a student cannot remove anyone, including themselves', async () => {
		for (const target of [bruno.email, alice.email]) {
			const message = await captureError(() =>
				rpc(alice.id, 'public.classroom_remove_enrollment($1::uuid, $2)', [p1, target])
			);
			expect(message).toContain("teacher of record or a site admin");
		}
		const still = await db.sql<{ student_email: string }>(
			`select student_email from public.classroom_enrollments where section_id = $1
			 order by student_email`,
			[p1]
		);
		expect(still.rows.map((r) => r.student_email)).toEqual(
			[alice.email, bruno.email, evan.email, teacherA.email].sort()
		);
	});

	test('signed out, it refuses before it reads anything', async () => {
		const message = await db.asAnon(async (q) => {
			try {
				await q(`select public.classroom_remove_enrollment($1::uuid, $2)`, [p1, bruno.email]);
			} catch (error) {
				return (error as { message?: string }).message ?? String(error);
			}
			throw new Error('anon reached the removal RPC');
		});
		// `anon` has no EXECUTE grant at all, so it never enters the body.
		expect(message).toMatch(/permission denied|must be signed in/i);
	});

	test('the enrollment table still has NO write grant and NO write policy', async () => {
		const grants = await db.sql<{ grantee: string; privilege_type: string }>(
			`select grantee, privilege_type from information_schema.role_table_grants
			 where table_schema = 'public' and table_name = 'classroom_enrollments'
			   and grantee in ('anon', 'authenticated')
			 order by grantee, privilege_type`
		);
		expect(grants.rows.map((r) => `${r.grantee}:${r.privilege_type}`)).toEqual([
			'authenticated:SELECT'
		]);

		const policies = await db.sql<{ policyname: string; cmd: string; roles: string }>(
			`select policyname, cmd, roles::text from pg_policies
			 where schemaname = 'public' and tablename = 'classroom_enrollments'
			 order by policyname`
		);
		expect(policies.rows.map((r) => `${r.policyname} [${r.cmd}]`)).toEqual([
			'classroom enrollments own or managed [SELECT]'
		]);
	});
});
