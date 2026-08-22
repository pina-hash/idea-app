// tests/classroom-instructor-copy.test.ts
//
// The instructor working copy (migration 0128) against a real Postgres, and
// the roster leak in studentWorkRows that shipped independently of it.
//
// WHY THESE ARE ONE FILE. Both guarantees fail SILENTLY. An instructor's own
// answers appearing in a student's payload looks like nothing at all from the
// student's chair; an off-roster email appended to the grading roster looks
// exactly like a student, in the roster, in the status chips, in the returned
// count, in the FACTS CSV. Neither raises anything anywhere.
//
// THE MIGRATION IS TESTED OVER SEEDED PRE-MIGRATION DATA, not over a reset
// chain: the suite boots the chain SHORT of 0128, seeds a full assignment with
// real student work through the REAL pre-0128 RPCs, captures every downstream
// payload, applies 0128 over the top, and compares. A migration that only
// works against an empty schema fails exactly where it matters.
//
// EVERY EXCLUSION HERE CARRIES A POSITIVE CONTROL. The off-roster scan is run
// against a deliberately planted off-roster row and must detect it; the
// student-read denials are run beside reads the same student CAN make. A scan
// that comes back clean because it is looking at the wrong thing is worse than
// no scan.
//
// Cast (classroom-engine's, extended): teacherA runs P1 (alice + bruno),
// teacherB runs P9 (carla), the pinned owner is the admin tier. `worksheet` is
// posted to P1 only; `shared` is posted to P1 AND P9, which is what makes an
// off-roster row reachable at all -- the owner manages both, so a P1 grading
// load legitimately returns carla's P9 rows.

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
	normalizeItemRow,
	normalizeSectionRow,
	type ClassroomEnrollment,
	type ClassroomItem,
	type ClassroomSection,
	type SubmissionSummary
} from '../src/lib/classroom/classroom';
import { buildFeed, type FeedSubmission } from '../src/lib/classroom/feed';

const MIGRATIONS = [
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
	'0095_classroom_leveled_rubrics.sql'
] as const;

const MIGRATION_0128 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0128_classroom_instructor_copy.sql'),
	'utf8'
);

let db: TestDb;
let owner: SeededUser;
let teacherA: SeededUser;
let teacherB: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
let carla: SeededUser;
let p1: string;
let p9: string;
let worksheet: string; // spec-driven, posted to P1 only
let shared: string; // posted to P1 + P9 -- the cross-section roster leak

async function captureError(run: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
	try {
		await run();
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return { code: e.code, message: e.message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

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
// The five downstream payloads, each read the way the shipping code reads it.
// ---------------------------------------------------------------------------

/** loadGrading's exact shape (transports.ts), as the given caller sees it. */
async function loadGrading(userId: string, itemId: string, sectionId: string): Promise<GradingData> {
	return db.asUser(userId, async (q) => {
		const roster = await q<ClassroomEnrollment>(
			`select section_id, student_email, display_name, active, updated_at
			 from public.classroom_enrollments where section_id = $1 order by display_name`,
			[sectionId]
		);
		const submissions = await q(
			`select id, item_id, student_email, state, submitted_at, returned_at, rubric_scores,
			        criterion_comments, score, teacher_comment, graded_by, graded_at, updated_at
			 from public.classroom_submissions where item_id = $1`,
			[itemId]
		);
		const responses = await q<ResponseRow>(
			`select item_id, student_email, block_id, value, updated_at
			 from public.classroom_responses where item_id = $1`,
			[itemId]
		);
		const files = await q<SubmissionFileRow>(
			`select f.id, f.submission_id, f.block_id, f.caption, f.drive_file_id, f.filename,
			        f.mime_type, f.size_bytes, f.sort_order, f.created_at
			 from public.classroom_submission_files f
			 join public.classroom_submissions s on s.id = f.submission_id
			 where s.item_id = $1 order by f.sort_order`,
			[itemId]
		);
		const approvals = await q<ModuleApprovalRow>(
			`select item_id, student_email, module_id, approved_by, approved_at
			 from public.classroom_module_approvals where item_id = $1`,
			[itemId]
		);
		return {
			roster: roster.rows,
			submissions: submissions.rows as unknown as SubmissionRow[],
			responses: responses.rows,
			files: files.rows,
			approvals: approvals.rows
		};
	});
}

/** The Grades tab's read (routes/classroom/[sectionId]/grades/+page.server.ts). */
async function gradesTab(userId: string, sectionId: string) {
	return db.asUser(userId, async (q) => {
		const items = await q(
			`select i.*, coalesce(json_agg(json_build_object('section_id', pg.section_id)), '[]') as postings
			 from public.classroom_items i
			 join public.classroom_postings pg on pg.item_id = i.id
			 where pg.section_id = $1
			 group by i.id`,
			[sectionId]
		);
		const roster = await q(
			`select student_email from public.classroom_enrollments
			 where section_id = $1 and active`,
			[sectionId]
		);
		const ids = items.rows.map((r) => (r as { id: string }).id);
		const subs = await q<SubmissionSummary>(
			`select item_id, state, score from public.classroom_submissions where item_id = any($1::uuid[])`,
			[ids]
		);
		const normalized = items.rows.map((r) =>
			normalizeItemRow(r as unknown as Record<string, unknown>)
		);
		return assignmentStandings(normalized, subs.rows, roster.rows.length);
	});
}

/** The home feed's to-grade tally (buildFeed), for a manager of P1. */
async function feedToGrade(userId: string, sectionId: string): Promise<number> {
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
			 where pg.section_id = $1
			 group by i.id`,
			[sectionId]
		);
		const subs = await q<FeedSubmission>(
			`select s.item_id, s.student_email, s.state, s.score, s.returned_at
			 from public.classroom_submissions s
			 join public.classroom_postings pg on pg.item_id = s.item_id
			 where pg.section_id = $1`,
			[sectionId]
		);
		const section = normalizeSectionRow(
			sectionRow.rows[0] as unknown as Record<string, unknown>
		) as ClassroomSection;
		const normalized = items.rows.map((r) =>
			normalizeItemRow(r as unknown as Record<string, unknown>)
		) as ClassroomItem[];
		const feed = buildFeed({
			sections: [section],
			items: normalized,
			submissions: subs.rows,
			myEmail: 'tvargas@boscotech.edu',
			isAdmin: false
		});
		return feed[0].urgent
			.concat(feed[0].standing)
			.reduce((total, entry) => total + (entry.reason === 'ungraded' ? (entry.count ?? 0) : 0), 0);
	});
}

/** Everything the console renders, in one comparable object. */
async function consoleSnapshot(userId: string, itemId: string, sectionId: string) {
	const data = await loadGrading(userId, itemId, sectionId);
	const { rows, offRoster } = studentWorkRows(data);
	const outOf = 20;
	return {
		roster: data.roster.map((e) => e.student_email),
		rosterRows: rows.map((r) => ({
			email: r.email,
			displayName: r.displayName,
			active: r.active,
			state: r.submission?.state ?? null,
			responses: r.responses.length,
			files: r.files.length,
			approvals: r.approvals.length
		})),
		offRoster,
		returnedCount: rows.filter((r) => r.submission?.state === 'returned').length,
		csv: gradesCsv(
			rows.map((r) => ({
				displayName: r.displayName,
				email: r.email,
				score: r.submission?.state === 'returned' ? (r.submission.score ?? null) : null,
				outOf
			}))
		)
	};
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	teacherA = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	teacherB = await createUser(db, 'mreed@boscotech.edu', 'M. Reed');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Baptiste');
	carla = await createUser(db, 'carla@boscotech.net', 'Carla Cardenas');

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

	for (const [t, section, student, name] of [
		[teacherA, p1, alice, 'Alice Alvarez'],
		[teacherA, p1, bruno, 'Bruno Baptiste'],
		[teacherB, p9, carla, 'Carla Cardenas']
	] as const) {
		await rpc(t.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			section,
			student.email,
			name,
			true
		]);
	}

	const mk = (userId: string, sections: string[], title: string) =>
		rpc<{ item_id: string }>(
			userId,
			`public.classroom_create_item('assignment', $1::uuid[], $2, $3, $4, null, null, true, '[]'::jsonb, false)`,
			[sections, title, 'Do the work.', 20]
		);
	worksheet = (await mk(teacherA.id, [p1], 'Material worksheet')).item_id;
	shared = (await mk(owner.id, [p1, p9], 'Shared checkpoint')).item_id;

	for (const item of [worksheet, shared]) {
		await rpc(owner.id, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
			item,
			JSON.stringify(SPEC)
		]);
		await rpc(owner.id, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
			item,
			JSON.stringify(RUBRIC)
		]);
	}

	// PRE-MIGRATION STUDENT WORK, written through the real 0086 RPCs.
	const save = (u: SeededUser, item: string, block: string, value: unknown) =>
		rpc(u.id, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
			item,
			block,
			JSON.stringify(value)
		]);
	await save(alice, worksheet, 'f1', { text: 'I compared the samples by mass.' });
	await save(alice, worksheet, 't1', { rows: [{ material: 'Steel', obs: 'Heavy' }] });
	await save(bruno, worksheet, 'f1', { text: 'I used the scale.' });
	await save(alice, shared, 'f1', { text: 'Alice on the shared item.' });
	// Carla is in P9, which `shared` is also posted to -- her rows are what a P1
	// grading load legitimately returns to an admin, and what the roster fix has
	// to keep out of the P1 roster.
	await save(carla, shared, 'f1', { text: 'Carla on the shared item.' });

	await rpc(alice.id, 'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5, $6, $7)', [
		worksheet,
		'drive-alice-1',
		'alice.jpg',
		'image/jpeg',
		1234,
		'z1',
		'Bench shot'
	]);
	await save(alice, worksheet, 'k1', { checked: [true, true] });
	const aliceSubmit = await rpc<{ ok: boolean; unmet?: unknown[] }>(
		alice.id,
		'public.classroom_submit_assignment($1::uuid)',
		[worksheet]
	);
	if (!aliceSubmit.ok) throw new Error(`fixture: alice could not submit: ${JSON.stringify(aliceSubmit)}`);
	await rpc(
		teacherA.id,
		'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb)',
		[worksheet, alice.email, JSON.stringify({ r1: 10, r2: 5 }), 'Solid work.', true, null]
	);
	// Bruno submits and is left AWAITING grading, so the to-grade tally is not 0
	// -- a count that is zero before and zero after proves nothing.
	await rpc(bruno.id, 'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5, $6, $7)', [
		worksheet,
		'drive-bruno-1',
		'bruno.jpg',
		'image/jpeg',
		999,
		'z1',
		null
	]);
	await save(bruno, worksheet, 't1', { rows: [{ material: 'Ash', obs: 'Light' }] });
	await save(bruno, worksheet, 'k1', { checked: [true, true] });
	const brunoSubmit = await rpc<{ ok: boolean; unmet?: unknown[] }>(
		bruno.id,
		'public.classroom_submit_assignment($1::uuid)',
		[worksheet]
	);
	if (!brunoSubmit.ok) throw new Error(`fixture: bruno could not submit: ${JSON.stringify(brunoSubmit)}`);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. The migration, over the seeded pre-migration data.
// ---------------------------------------------------------------------------

describe('0128 over seeded pre-migration data', () => {
	let before: {
		worksheet: Awaited<ReturnType<typeof consoleSnapshot>>;
		shared: Awaited<ReturnType<typeof consoleSnapshot>>;
		standings: Awaited<ReturnType<typeof gradesTab>>;
		toGrade: number;
	};

	test('the pre-migration payloads are captured, and are not empty', async () => {
		before = {
			worksheet: await consoleSnapshot(teacherA.id, worksheet, p1),
			shared: await consoleSnapshot(owner.id, shared, p1),
			standings: await gradesTab(teacherA.id, p1),
			toGrade: await feedToGrade(teacherA.id, p1)
		};
		// POSITIVE CONTROLS on the fixture itself: a snapshot of nothing would
		// compare equal to a snapshot of nothing after the migration too.
		expect(before.worksheet.rosterRows.length).toBe(2);
		expect(before.worksheet.rosterRows.filter((r) => r.responses > 0).length).toBe(2);
		expect(before.worksheet.returnedCount).toBe(1);
		expect(before.worksheet.csv).toContain('Alvarez');
		expect(before.standings.length).toBe(2);
		expect(before.worksheet.rosterRows.map((r) => r.state)).toEqual(['returned', 'submitted']);
		expect(before.toGrade).toBe(1);
		// The tables do not exist yet -- this is genuinely a PRE-migration state.
		const { rows } = await db.sql(
			`select to_regclass('public.classroom_instructor_responses') as t`
		);
		expect(rows[0].t).toBeNull();
	});

	test('the migration applies over that data, and re-applies', async () => {
		await db.sql(MIGRATION_0128);
		// Re-pasting a migration is ordinary here (a first attempt that failed
		// partway gets retried), so it has to survive a second pass.
		await db.sql(MIGRATION_0128);

		const { rows } = await db.sql(
			`select to_regclass('public.classroom_instructor_responses') as r,
			        to_regclass('public.classroom_instructor_keys') as k`
		);
		expect(rows[0].r).not.toBeNull();
		expect(rows[0].k).not.toBeNull();
	});

	test('no function gained a second overload (the signature trap)', async () => {
		for (const name of [
			'classroom_save_instructor_response',
			'classroom_designate_instructor_key',
			'classroom_undesignate_instructor_key',
			'classroom_instructor_key_email',
			'_classroom_instructor_copy_author'
		]) {
			const { rows } = await db.sql(
				`select count(*)::int as n from pg_proc p
				 join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public' and p.proname = $1`,
				[name]
			);
			expect({ name, n: rows[0].n }).toEqual({ name, n: 1 });
		}
	});

	test('every student payload is byte-identical across the migration', async () => {
		expect(await consoleSnapshot(teacherA.id, worksheet, p1)).toEqual(before.worksheet);
		expect(await consoleSnapshot(owner.id, shared, p1)).toEqual(before.shared);
		expect(await gradesTab(teacherA.id, p1)).toEqual(before.standings);
		expect(await feedToGrade(teacherA.id, p1)).toBe(before.toGrade);
	});

	test('zero client write grants on both new tables', async () => {
		const { rows } = await db.sql(
			`select table_name, grantee, privilege_type
			 from information_schema.role_table_grants
			 where table_schema = 'public'
			   and table_name in ('classroom_instructor_responses', 'classroom_instructor_keys')
			   and grantee in ('anon', 'authenticated')
			 order by table_name, grantee, privilege_type`
		);
		expect(rows.map((r) => `${r.table_name}:${r.grantee}:${r.privilege_type}`)).toEqual([
			'classroom_instructor_keys:authenticated:SELECT',
			'classroom_instructor_responses:authenticated:SELECT'
		]);
	});
});

// ---------------------------------------------------------------------------
// 2. The working copy itself.
// ---------------------------------------------------------------------------

describe('the instructor working copy', () => {
	test('an instructor writes and reads their own copy', async () => {
		const res = await rpc<{ ok: boolean }>(
			teacherA.id,
			'public.classroom_save_instructor_response($1::uuid, $2, $3::jsonb)',
			[worksheet, 'f1', JSON.stringify({ text: 'The model answer.' })]
		);
		expect(res.ok).toBe(true);

		const mine = await db.asUser(teacherA.id, (q) =>
			q(
				`select block_id, value from public.classroom_instructor_responses
				 where item_id = $1 and instructor_email = $2`,
				[worksheet, teacherA.email]
			)
		);
		expect(mine.rows).toEqual([{ block_id: 'f1', value: { text: 'The model answer.' } }]);
	});

	test('an upsert replaces rather than duplicating', async () => {
		await rpc(teacherA.id, 'public.classroom_save_instructor_response($1::uuid, $2, $3::jsonb)', [
			worksheet,
			'f1',
			JSON.stringify({ text: 'The model answer, revised.' })
		]);
		const { rows } = await db.sql(
			`select count(*)::int as n from public.classroom_instructor_responses
			 where item_id = $1 and instructor_email = $2 and block_id = 'f1'`,
			[worksheet, teacherA.email]
		);
		expect(rows[0].n).toBe(1);
	});

	test('a file-upload block takes no typed response', async () => {
		const err = await captureError(() =>
			rpc(teacherA.id, 'public.classroom_save_instructor_response($1::uuid, $2, $3::jsonb)', [
				worksheet,
				'z1',
				JSON.stringify({ text: 'nope' })
			])
		);
		expect(err.message).toMatch(/does not take a typed response/i);
	});

	test('there is no declaration on an instructor copy', async () => {
		const err = await captureError(() =>
			rpc(teacherA.id, 'public.classroom_save_instructor_response($1::uuid, $2, $3::jsonb)', [
				worksheet,
				'@declaration',
				JSON.stringify({ checked: [true] })
			])
		);
		expect(err.message).toMatch(/no declaration/i);
	});

	test('an instructor of another class cannot write a copy here', async () => {
		// teacherB manages P9 only; `worksheet` is posted to P1 only.
		const err = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_save_instructor_response($1::uuid, $2, $3::jsonb)', [
				worksheet,
				'f1',
				JSON.stringify({ text: 'not mine' })
			])
		);
		expect(err.message).toMatch(/working copy/i);
		// POSITIVE CONTROL: on the item posted to BOTH, the same call succeeds.
		const ok = await rpc<{ ok: boolean }>(
			teacherB.id,
			'public.classroom_save_instructor_response($1::uuid, $2, $3::jsonb)',
			[shared, 'f1', JSON.stringify({ text: "B's copy on the shared item." })]
		);
		expect(ok.ok).toBe(true);
	});

	test('an undesignated copy is private to its author', async () => {
		// teacherA also keeps a copy on `shared`.
		await rpc(teacherA.id, 'public.classroom_save_instructor_response($1::uuid, $2, $3::jsonb)', [
			shared,
			'f1',
			JSON.stringify({ text: "A's copy on the shared item." })
		]);
		const seenByA = await db.asUser(teacherA.id, (q) =>
			q(
				`select instructor_email from public.classroom_instructor_responses where item_id = $1`,
				[shared]
			)
		);
		expect(seenByA.rows.map((r) => r.instructor_email)).toEqual([teacherA.email]);
		// POSITIVE CONTROL: the rows ARE there, under the owner connection.
		const raw = await db.sql(
			`select instructor_email from public.classroom_instructor_responses
			 where item_id = $1 order by instructor_email`,
			[shared]
		);
		expect(raw.rows.map((r) => r.instructor_email).sort()).toEqual(
			[teacherA.email, teacherB.email].sort()
		);
	});
});

// ---------------------------------------------------------------------------
// 3. Designating the key.
// ---------------------------------------------------------------------------

describe('the designated answer key', () => {
	test('an empty copy is refused, structurally', async () => {
		const res = await rpc<{ ok: boolean; reason?: string }>(
			owner.id,
			'public.classroom_designate_instructor_key($1::uuid)',
			[shared]
		);
		expect(res).toEqual({ ok: false, reason: 'empty_copy' });
	});

	test("designating exposes the author's copy to the item's other instructors", async () => {
		const res = await rpc<{ ok: boolean; instructor_email?: string }>(
			teacherB.id,
			'public.classroom_designate_instructor_key($1::uuid)',
			[shared]
		);
		expect(res.ok).toBe(true);
		expect(res.instructor_email).toBe(teacherB.email);

		const seenByA = await db.asUser(teacherA.id, (q) =>
			q(
				`select instructor_email, block_id from public.classroom_instructor_responses
				 where item_id = $1 order by instructor_email`,
				[shared]
			)
		);
		expect(seenByA.rows.map((r) => r.instructor_email).sort()).toEqual(
			[teacherA.email, teacherB.email].sort()
		);
		// And A can name whose it is, which is what the surface labels it with.
		const who = await rpc<string>(teacherA.id, 'public.classroom_instructor_key_email($1::uuid)', [
			shared
		]);
		expect(who).toBe(teacherB.email);
	});

	test('designating replaces: one key per item', async () => {
		await rpc(teacherA.id, 'public.classroom_designate_instructor_key($1::uuid)', [shared]);
		const { rows } = await db.sql(
			`select instructor_email, designated_by from public.classroom_instructor_keys where item_id = $1`,
			[shared]
		);
		expect(rows).toEqual([{ instructor_email: teacherA.email, designated_by: teacherA.email }]);
		// B's copy is undesignated again, so it is private to B again.
		const seenByA = await db.asUser(teacherA.id, (q) =>
			q(
				`select instructor_email from public.classroom_instructor_responses where item_id = $1`,
				[shared]
			)
		);
		expect(seenByA.rows.map((r) => r.instructor_email)).toEqual([teacherA.email]);
	});

	test("another instructor cannot undesignate somebody else's key", async () => {
		const res = await rpc<{ ok: boolean; reason?: string }>(
			teacherB.id,
			'public.classroom_undesignate_instructor_key($1::uuid)',
			[shared]
		);
		expect(res).toEqual({ ok: false, reason: 'not_yours' });
		// POSITIVE CONTROL: the author's own call succeeds.
		const mine = await rpc<{ ok: boolean }>(
			teacherA.id,
			'public.classroom_undesignate_instructor_key($1::uuid)',
			[shared]
		);
		expect(mine.ok).toBe(true);
		const after = await rpc<{ ok: boolean; reason?: string }>(
			teacherA.id,
			'public.classroom_undesignate_instructor_key($1::uuid)',
			[shared]
		);
		expect(after).toEqual({ ok: false, reason: 'no_key' });
	});
});

// ---------------------------------------------------------------------------
// 4. NO STUDENT READ PATH -- the assertion this whole file exists for.
// ---------------------------------------------------------------------------

describe('no student read path', () => {
	beforeAll(async () => {
		// Put a key back, so the "student sees nothing" scan is run against the
		// MOST exposed state this feature can be in, not against an empty table.
		await rpc(teacherA.id, 'public.classroom_save_instructor_response($1::uuid, $2, $3::jsonb)', [
			worksheet,
			't1',
			JSON.stringify({ rows: [{ material: 'Steel', obs: 'The expected answer.' }] })
		]);
		await rpc(teacherA.id, 'public.classroom_designate_instructor_key($1::uuid)', [worksheet]);
	});

	test('a student reads zero instructor rows, beside rows they CAN read', async () => {
		const seen = await db.asUser(alice.id, async (q) => {
			const copies = await q(`select * from public.classroom_instructor_responses`);
			const keys = await q(`select * from public.classroom_instructor_keys`);
			// POSITIVE CONTROLS on the same connection: if this student's session
			// could read nothing at all, three zeroes would be meaningless.
			const own = await q(
				`select block_id from public.classroom_responses where item_id = $1`,
				[worksheet]
			);
			const spec = await q(`select item_id from public.classroom_assignment_specs where item_id = $1`, [
				worksheet
			]);
			return {
				copies: copies.rowCount,
				keys: keys.rowCount,
				ownResponses: own.rowCount,
				specs: spec.rowCount
			};
		});
		expect(seen).toEqual({ copies: 0, keys: 0, ownResponses: 3, specs: 1 });
		// And the rows genuinely exist, under the owner connection.
		const raw = await db.sql(
			`select (select count(*) from public.classroom_instructor_responses)::int as copies,
			        (select count(*) from public.classroom_instructor_keys)::int as keys`
		);
		expect(raw.rows[0].copies).toBeGreaterThan(0);
		expect(raw.rows[0].keys).toBeGreaterThan(0);
	});

	test('a student cannot name the key author, and cannot write a copy', async () => {
		const who = await rpc<string | null>(
			alice.id,
			'public.classroom_instructor_key_email($1::uuid)',
			[worksheet]
		);
		expect(who).toBeNull();
		const err = await captureError(() =>
			rpc(alice.id, 'public.classroom_save_instructor_response($1::uuid, $2, $3::jsonb)', [
				worksheet,
				'f1',
				JSON.stringify({ text: 'let me in' })
			])
		);
		expect(err.message).toMatch(/working copy/i);
	});

	test('a signed-out caller reads nothing and has no grant', async () => {
		const anon = await db.asAnon(async (q) => {
			const err = await q(`select 1`).then(() => null).catch((e) => e);
			return err;
		});
		expect(anon).toBeNull();
		const denied = await db.asAnon(async (q) => {
			try {
				await q(`select * from public.classroom_instructor_responses`);
				return 'allowed';
			} catch (e) {
				return (e as { code?: string }).code ?? 'error';
			}
		});
		expect(denied).toBe('42501'); // insufficient_privilege: no grant at all.
	});
});

// ---------------------------------------------------------------------------
// 5. The roster leak, which is not about instructors at all.
// ---------------------------------------------------------------------------

describe('off-roster response sets come out of the students list', () => {
	test('the P1 grading load for the shared item leaves carla off the roster', async () => {
		// The owner manages P1 AND P9, and `shared` is posted to both, so RLS
		// legitimately returns carla's rows to a P1 grading load. Before the fix
		// ensure() appended her as an active roster row.
		const data = await loadGrading(owner.id, shared, p1);
		// POSITIVE CONTROL FIRST: the payload really does contain her.
		expect(data.responses.map((r) => r.student_email)).toContain(carla.email);

		const { rows, offRoster } = studentWorkRows(data);
		expect(rows.map((r) => r.email)).toEqual([alice.email, bruno.email]);
		expect(offRoster).toEqual([carla.email]);
	});

	test('the same scan is clean where there is nothing off-roster', async () => {
		const { rows, offRoster } = studentWorkRows(await loadGrading(teacherA.id, worksheet, p1));
		expect(rows.map((r) => r.email)).toEqual([alice.email, bruno.email]);
		expect(offRoster).toEqual([]);
	});

	test('an instructor working copy never reaches the roster at all', async () => {
		// The whole point of the separate table: the grading load selects
		// classroom_responses, so an instructor copy is not merely filtered out,
		// it is not in the payload.
		const data = await loadGrading(teacherA.id, worksheet, p1);
		const emails = new Set(data.responses.map((r) => r.student_email));
		expect(emails.has(teacherA.email)).toBe(false);
		const { rows, offRoster } = studentWorkRows(data);
		expect(rows.some((r) => r.email === teacherA.email)).toBe(false);
		expect(offRoster).not.toContain(teacherA.email);
		// POSITIVE CONTROL: teacherA's copy exists and teacherA can read it.
		const mine = await db.asUser(teacherA.id, (q) =>
			q(
				`select block_id from public.classroom_instructor_responses
				 where item_id = $1 and instructor_email = $2`,
				[worksheet, teacherA.email]
			)
		);
		expect(mine.rowCount).toBeGreaterThan(0);
	});

	test('the CSV, the returned count and the standings exclude the off-roster set', async () => {
		const snap = await consoleSnapshot(owner.id, shared, p1);
		expect(snap.csv).not.toContain('Cardenas');
		expect(snap.csv).not.toContain(carla.email);
		// POSITIVE CONTROL: the two real students ARE in it.
		expect(snap.csv).toContain('Alvarez');
		expect(snap.csv).toContain('Baptiste');
		expect(snap.rosterRows.length).toBe(2);
		expect(snap.offRoster).toEqual([carla.email]);
	});
});
