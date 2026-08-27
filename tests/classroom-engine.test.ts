// tests/classroom-engine.test.ts
//
// The assignment engine (migration 0086) against a real Postgres: spec
// validation at the boundary, response/submission/file RLS, the
// server-authoritative submit preflight, the state machine, grading gates, and
// the approval gate -- every guarantee here fails SILENTLY if it regresses (a
// student who can read a classmate's answers sees no error; a submit that
// skips the preflight looks exactly like a working submit).
//
// Cast of characters: teacherA runs P1 (alice + bruno enrolled), teacherB runs
// their own P9 (carla enrolled) in the same course, the pinned owner is the
// admin tier. The worksheet item lives in P1 only; a second item is posted to
// BOTH P1 and P9 to pin the cross-section boundary: teacherB manages a section
// that item is posted to, but alice is not enrolled THERE, so teacherB must
// see none of her work on it.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { normalizeItemRow, normalizeSectionRow } from '../src/lib/classroom/classroom';
import {
	buildFeed,
	emptyMessage,
	isActionable,
	isAwaitingGrade,
	URGENT_LIMIT,
	type FeedSubmission,
	type SectionFeed
} from '../src/lib/classroom/feed';

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
	'0095_classroom_leveled_rubrics.sql',
	'0137_anon_execute_sweep.sql'
] as const;

let db: TestDb;
let owner: SeededUser;
let teacherA: SeededUser;
let teacherB: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
let carla: SeededUser;
let courseId: string;
let p1: string;
let p9: string;
let worksheet: string; // spec-driven assignment, posted to P1 only
let shared: string; // assignment posted to P1 + P9 (the cross-section pin)
let plain: string; // no-spec assignment in P1

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

function saveResponse(userId: string, itemId: string, blockId: string, value: unknown) {
	return rpc(userId, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
		itemId,
		blockId,
		JSON.stringify(value)
	]);
}

function addFile(
	userId: string,
	itemId: string,
	driveId: string,
	blockId: string | null = null,
	caption: string | null = null
) {
	return rpc(
		userId,
		'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5, $6, $7)',
		[itemId, driveId, `${driveId}.jpg`, 'image/jpeg', 1234, blockId, caption]
	);
}

function submit(userId: string, itemId: string) {
	return rpc<{ ok: boolean; reason?: string; unmet?: { block_id: string | null; kind: string }[] }>(
		userId,
		'public.classroom_submit_assignment($1::uuid)',
		[itemId]
	);
}

function grade(
	userId: string,
	itemId: string,
	email: string,
	scores: Record<string, number>,
	comment: string | null,
	release: boolean,
	criterionComments: Record<string, string> | null = null
) {
	return rpc<{ ok: boolean; reason?: string; score?: number; state?: string; missing?: string[] }>(
		userId,
		'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb)',
		[
			itemId,
			email,
			JSON.stringify(scores),
			comment,
			release,
			criterionComments ? JSON.stringify(criterionComments) : null
		]
	);
}

/** Three levels: full credit, half, nothing -- the shape v1.1 requires. */
function levels(max: number) {
	return [
		{ points: max, label: 'Complete', descriptor: 'Everything asked for is present and correct.' },
		{ points: Math.round(max / 2), label: 'Developing', descriptor: 'Some of it is present, or present but wrong.' },
		{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
	];
}

const SPEC = {
	schemaVersion: 1,
	meta: { assignmentId: 'idea100-u1-01', title: 'Material ID Checkpoint', totalPoints: 30 },
	modules: [
		{
			id: 'm1',
			title: 'Observe',
			points: 10,
			aiLevel: 1,
			blocks: [
				{ type: 'instructions', content: 'Look closely at the six materials.' },
				{ type: 'textField', id: 'f1', prompt: 'Explain your method.', minSentences: 3, maxSentences: 5 },
				{
					type: 'table',
					id: 't1',
					columns: [
						{ key: 'material', label: 'Material' },
						{ key: 'obs', label: 'Observation', tip: 'What you see.' }
					],
					minRows: 2
				}
			],
			rubric: [{ id: 'c1', criterion: 'Method explained with evidence', levels: levels(10) }]
		},
		{
			id: 'm2',
			title: 'Evidence',
			points: 10,
			blocks: [
				{ type: 'imageZone', id: 'z1', minImages: 1, captions: true },
				{ type: 'checklist', id: 'c1', items: ['Tool zeroed', 'Bench cleared'] }
			],
			rubric: [{ id: 'c1', criterion: 'Evidence complete', levels: levels(10) }]
		},
		{
			id: 'm3',
			title: 'Reflect',
			points: 10,
			blocks: [{ type: 'textField', id: 'f2', prompt: 'Reflect on the process.', minSentences: 1 }],
			rubric: [{ id: 'c1', criterion: 'Reflection', levels: levels(10) }]
		}
	],
	declarations: { academicIntegrity: true },
	approvalGate: { afterModule: 'm2', label: 'Instructor Approval Required' }
};

const RUBRIC = [
	{ id: 'm1-r1', criterion: 'Observe: Method explained with evidence', levels: levels(10) },
	{ id: 'm2-r1', criterion: 'Evidence: Evidence complete', levels: levels(10) },
	{ id: 'm3-r1', criterion: 'Reflect: Reflection', levels: levels(10) }
];

function setSpec(userId: string, itemId: string, spec: unknown) {
	return rpc(userId, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
		itemId,
		JSON.stringify(spec)
	]);
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	teacherA = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	teacherB = await createUser(db, 'mreed@boscotech.edu', 'M. Reed');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Baptiste');
	carla = await createUser(db, 'carla@boscotech.net', 'Carla Cardenas');

	courseId = (
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
			[sections, title, 'Do the work.', 30]
		);
	worksheet = (await mk(teacherA.id, [p1], 'Material worksheet')).item_id;
	shared = (await mk(owner.id, [p1, p9], 'Shared checkpoint')).item_id;
	plain = (await mk(teacherA.id, [p1], 'Plain hand-in')).item_id;
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// Spec validation at the boundary
// ---------------------------------------------------------------------------

describe('spec validation (the RPC is the boundary)', () => {
	test('a student cannot set a spec', async () => {
		const err = await captureError(() => setSpec(alice.id, worksheet, SPEC));
		expect(err.message).toMatch(/teacher of record/i);
	});

	test('a non-managing teacher cannot set a spec', async () => {
		const err = await captureError(() => setSpec(teacherB.id, worksheet, SPEC));
		expect(err.message).toMatch(/teacher of record/i);
	});

	test('module points that do not sum to totalPoints are rejected', async () => {
		const bad = structuredClone(SPEC) as typeof SPEC & { meta: { totalPoints: number } };
		bad.meta.totalPoints = 99;
		const err = await captureError(() => setSpec(teacherA.id, worksheet, bad));
		expect(err.message).toMatch(/sum to 30 but meta\.totalPoints is 99/);
	});

	test('a rubric that does not sum to its module points is rejected', async () => {
		const bad = structuredClone(SPEC);
		bad.modules[0].rubric = [{ id: 'c1', criterion: 'Half only', levels: levels(5) }];
		const err = await captureError(() => setSpec(teacherA.id, worksheet, bad));
		expect(err.message).toMatch(/rubric sums to 5 but the module is worth 10/);
	});

	test('duplicate block ids are rejected', async () => {
		const bad = structuredClone(SPEC);
		(bad.modules[2].blocks[0] as { id: string }).id = 'f1';
		const err = await captureError(() => setSpec(teacherA.id, worksheet, bad));
		expect(err.message).toMatch(/Duplicate block id "f1"/);
	});

	test('calc blocks are rejected by name', async () => {
		const bad = structuredClone(SPEC);
		(bad.modules[0].blocks as unknown[]).push({ type: 'calc', id: 'k1', tool: 'dualUnit' });
		const err = await captureError(() => setSpec(teacherA.id, worksheet, bad));
		expect(err.message).toMatch(/calc blocks are not supported yet \(k1\)/);
	});

	test('a missing totalPoints cannot slip through as null arithmetic', async () => {
		const bad = structuredClone(SPEC) as Record<string, unknown>;
		delete (bad.meta as Record<string, unknown>).totalPoints;
		const err = await captureError(() => setSpec(teacherA.id, worksheet, bad));
		expect(err.message).toMatch(/totalPoints must be a number/);
	});

	test('only an assignment can carry a spec', async () => {
		const post = await rpc<{ item_id: string }>(
			teacherA.id,
			`public.classroom_create_item('post', $1::uuid[], null, 'An announcement.', null, null, null, true, '[]'::jsonb, false)`,
			[[p1]]
		);
		const err = await captureError(() => setSpec(teacherA.id, post.item_id, SPEC));
		expect(err.message).toMatch(/Only an assignment/i);
	});

	test('a valid spec lands, is readable by the enrolled student, and invisible outside the class', async () => {
		const res = await setSpec(teacherA.id, worksheet, SPEC);
		expect((res as { ok: boolean }).ok).toBe(true);

		const mine = await db.asUser(alice.id, (q) =>
			q(`select item_id from public.classroom_assignment_specs where item_id = $1`, [worksheet])
		);
		expect(mine.rowCount).toBe(1);

		// carla is in P9; the worksheet is only in P1, so the spec row does not
		// exist as far as she can tell.
		const theirs = await db.asUser(carla.id, (q) =>
			q(`select item_id from public.classroom_assignment_specs where item_id = $1`, [worksheet])
		);
		expect(theirs.rowCount).toBe(0);
	});

	test('the rubric RPC validates and lands; grading without one is refused', async () => {
		const err = await captureError(() =>
			grade(teacherA.id, worksheet, alice.email, {}, null, false)
		);
		expect(err.message).toMatch(/Create a rubric/i);

		const bad = await captureError(() =>
			rpc(teacherA.id, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
				worksheet,
				JSON.stringify([{ id: 'c1', criterion: 'No levels row' }])
			])
		);
		expect(bad.message).toMatch(/needs levels/);

		const res = await rpc(teacherA.id, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
			worksheet,
			JSON.stringify(RUBRIC)
		]);
		expect((res as { ok: boolean }).ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Responses: own-student writes, scoped reads
// ---------------------------------------------------------------------------

describe('responses', () => {
	test('a student saves their own response through the RPC', async () => {
		const res = await saveResponse(alice.id, worksheet, 'f1', { text: 'One. Two.' });
		expect((res as { ok: boolean }).ok).toBe(true);
	});

	test('a CLASSMATE reads none of it; the section teacher reads it; a foreign teacher reads none', async () => {
		const asBruno = await db.asUser(bruno.id, (q) =>
			q(`select block_id from public.classroom_responses where item_id = $1`, [worksheet])
		);
		expect(asBruno.rowCount).toBe(0);

		const asTeacherA = await db.asUser(teacherA.id, (q) =>
			q(`select block_id from public.classroom_responses where item_id = $1`, [worksheet])
		);
		expect(asTeacherA.rowCount).toBe(1);

		const asTeacherB = await db.asUser(teacherB.id, (q) =>
			q(`select block_id from public.classroom_responses where item_id = $1`, [worksheet])
		);
		expect(asTeacherB.rowCount).toBe(0);
	});

	test('cross-section: a co-posted section teacher never reaches a student not in THEIR class', async () => {
		await saveResponse(owner.id, shared, 'x', {}).catch(() => {
			// The owner is not enrolled; expected. The real write comes from alice.
		});
		// The shared item has no spec, so responses cannot be saved on it -- pin
		// the boundary on SUBMISSIONS instead: alice attaches a file.
		const res = await addFile(alice.id, shared, 'drive-shared-1');
		expect((res as { ok: boolean }).ok).toBe(true);

		const asTeacherB = await db.asUser(teacherB.id, (q) =>
			q(`select id from public.classroom_submissions where item_id = $1`, [shared])
		);
		expect(asTeacherB.rowCount).toBe(0);

		const asOwner = await db.asUser(owner.id, (q) =>
			q(`select id from public.classroom_submissions where item_id = $1`, [shared])
		);
		expect(asOwner.rowCount).toBe(1);

		const refusal = await captureError(() =>
			grade(teacherB.id, shared, alice.email, {}, null, false)
		);
		expect(refusal.message).toMatch(/teacher of record for this student/i);
	});

	test('no direct writes for anyone: student and teacher inserts/updates/deletes are 42501', async () => {
		for (const user of [alice, teacherA]) {
			const ins = await captureError(() =>
				db.asUser(user.id, (q) =>
					q(
						`insert into public.classroom_responses (item_id, student_email, block_id, value)
						 values ($1, $2, 'f1', '{}'::jsonb)`,
						[worksheet, alice.email]
					)
				)
			);
			expect(ins.code).toBe('42501');
			const upd = await captureError(() =>
				db.asUser(user.id, (q) =>
					q(`update public.classroom_responses set value = '{}'::jsonb where item_id = $1`, [
						worksheet
					])
				)
			);
			expect(upd.code).toBe('42501');
			const del = await captureError(() =>
				db.asUser(user.id, (q) =>
					q(`delete from public.classroom_responses where item_id = $1`, [worksheet])
				)
			);
			expect(del.code).toBe('42501');
		}
	});

	test('an unknown block, a non-response block, and a teacher caller are all refused', async () => {
		const unknown = await captureError(() =>
			saveResponse(alice.id, worksheet, 'nope', { text: 'x' })
		);
		expect(unknown.message).toMatch(/Unknown block "nope"/);

		const zone = await captureError(() => saveResponse(alice.id, worksheet, 'z1', { text: 'x' }));
		expect(zone.message).toMatch(/does not take a typed response/);

		const teacher = await captureError(() =>
			saveResponse(teacherA.id, worksheet, 'f1', { text: 'x' })
		);
		expect(teacher.message).toMatch(/enrolled in this class/i);
	});

	test('the approval gate blocks writes to gated modules server-side', async () => {
		const res = await saveResponse(alice.id, worksheet, 'f2', { text: 'Early reflection.' });
		expect(res).toMatchObject({ ok: false, reason: 'approval_pending', module_id: 'm3' });
	});
});

// ---------------------------------------------------------------------------
// Preflight + the state machine
// ---------------------------------------------------------------------------

describe('submit preflight and states', () => {
	test('an incomplete submission is refused with the full structured list', async () => {
		const res = await submit(alice.id, worksheet);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('incomplete');
		const kinds = new Map((res.unmet ?? []).map((u) => [u.block_id ?? u.kind, u]));
		// f1 has 2 sentences against min 3; t1 empty; z1 no photo; c1 unchecked;
		// declaration unchecked; the gate unapproved.
		expect(kinds.has('f1')).toBe(true);
		expect(kinds.has('t1')).toBe(true);
		expect(kinds.has('z1')).toBe(true);
		expect(kinds.has('c1')).toBe(true);
		expect(kinds.has('@declaration')).toBe(true);
		expect((res.unmet ?? []).some((u) => u.kind === 'approval')).toBe(true);
	});

	test('completing the blocks (an all-blank table row counts for nothing) clears all but the gate', async () => {
		await saveResponse(alice.id, worksheet, 'f1', {
			text: 'First I looked. Then I compared! Was I right?'
		});
		await saveResponse(alice.id, worksheet, 't1', {
			rows: [
				{ material: 'Steel', obs: 'Heavy, gray' },
				{ material: '', obs: '' }, // blank: must NOT count
				{ material: 'Aluminum', obs: 'Light' }
			]
		});
		await saveResponse(alice.id, worksheet, 'c1', { checked: [true, true] });
		await addFile(alice.id, worksheet, 'drive-z1-1', 'z1', 'The samples');
		await saveResponse(alice.id, worksheet, '@declaration', { checked: [true] });

		const res = await submit(alice.id, worksheet);
		expect(res.ok).toBe(false);
		expect((res.unmet ?? []).map((u) => u.kind)).toEqual(['approval']);
	});

	test('approval unlocks the gated module and the submit', async () => {
		const approve = await rpc(
			teacherA.id,
			'public.classroom_approve_module($1::uuid, $2, $3, true)',
			[worksheet, alice.email, 'm2']
		);
		expect((approve as { ok: boolean }).ok).toBe(true);

		const gatedWrite = await saveResponse(alice.id, worksheet, 'f2', { text: 'Now I reflect.' });
		expect((gatedWrite as { ok: boolean }).ok).toBe(true);

		const res = await submit(alice.id, worksheet);
		expect(res.ok).toBe(true);
	});

	test('submitted work is locked: responses and files both refuse', async () => {
		const write = await saveResponse(alice.id, worksheet, 'f1', { text: 'Changed my mind.' });
		expect(write).toMatchObject({ ok: false, reason: 'locked' });
		const file = await addFile(alice.id, worksheet, 'drive-late');
		expect(file).toMatchObject({ ok: false, reason: 'locked' });
	});

	test('unsubmit before grading reopens editing; a saved grade closes that door', async () => {
		const un = await rpc<{ ok: boolean }>(
			alice.id,
			'public.classroom_unsubmit_assignment($1::uuid)',
			[worksheet]
		);
		expect(un.ok).toBe(true);

		const write = await saveResponse(alice.id, worksheet, 'f1', {
			text: 'Better method. With detail! And a check.'
		});
		expect((write as { ok: boolean }).ok).toBe(true);

		const resubmit = await submit(alice.id, worksheet);
		expect(resubmit.ok).toBe(true);

		// Draft grade lands (not released) -> unsubmit is no longer the student's call.
		const draft = await grade(teacherA.id, worksheet, alice.email, { 'm1-r1': 8 }, null, false, {
			'm1-r1': 'Between levels: method is sound but one step is unevidenced.'
		});
		expect(draft.ok).toBe(true);
		const refused = await rpc<{ ok: boolean; reason?: string }>(
			alice.id,
			'public.classroom_unsubmit_assignment($1::uuid)',
			[worksheet]
		);
		expect(refused).toMatchObject({ ok: false, reason: 'graded' });
	});

	test('returning requires every criterion scored, releases the grade, and reopens editing', async () => {
		const incomplete = await grade(
			teacherA.id,
			worksheet,
			alice.email,
			{ 'm1-r1': 8 },
			'Half graded',
			true,
			{ 'm1-r1': 'Between levels: one step unevidenced.' }
		);
		expect(incomplete).toMatchObject({ ok: false, reason: 'incomplete_scores' });
		expect(incomplete.missing).toEqual(['m2-r1', 'm3-r1']);

		const released = await grade(
			teacherA.id,
			worksheet,
			alice.email,
			{ 'm1-r1': 8, 'm2-r1': 10, 'm3-r1': 7.5 },
			'Solid work. Tighten the reflection.',
			true,
			{
				'm1-r1': 'Between levels: one step unevidenced.',
				'm3-r1': 'Between levels: reflection is specific but short.'
			}
		);
		expect(released.ok).toBe(true);
		expect(Number(released.score)).toBe(25.5);
		expect(released.state).toBe('returned');

		// The student reads their own released grade.
		const mine = await db.asUser(alice.id, (q) =>
			q<{ state: string; score: string; teacher_comment: string }>(
				`select state, score, teacher_comment from public.classroom_submissions where item_id = $1`,
				[worksheet]
			)
		);
		expect(mine.rows[0].state).toBe('returned');
		expect(Number(mine.rows[0].score)).toBe(25.5);
		expect(mine.rows[0].teacher_comment).toMatch(/Tighten the reflection/);

		// Returned = editable again; resubmission goes back to submitted.
		const write = await saveResponse(alice.id, worksheet, 'f2', { text: 'Revised reflection.' });
		expect((write as { ok: boolean }).ok).toBe(true);
		const again = await submit(alice.id, worksheet);
		expect(again.ok).toBe(true);
	});

	test('a no-spec assignment requires at least one file, then submits', async () => {
		const empty = await submit(bruno.id, plain);
		expect(empty).toMatchObject({ ok: false, reason: 'nothing_attached' });
		await addFile(bruno.id, plain, 'drive-plain-1');
		const res = await submit(bruno.id, plain);
		expect(res.ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Grading gates + files
// ---------------------------------------------------------------------------

describe('grading gates and files', () => {
	test('students cannot grade or approve', async () => {
		const g = await captureError(() =>
			grade(alice.id, worksheet, alice.email, { 'm1-r1': 10 }, null, false)
		);
		expect(g.message).toMatch(/teacher of record/i);
		const a = await captureError(() =>
			rpc(alice.id, 'public.classroom_approve_module($1::uuid, $2, $3, true)', [
				worksheet,
				alice.email,
				'm2'
			])
		);
		expect(a.message).toMatch(/teacher of record/i);
	});

	test('scores are validated against the rubric: unknown keys and over-points refused', async () => {
		const unknown = await captureError(() =>
			grade(teacherA.id, worksheet, alice.email, { ghost: 5 }, null, false)
		);
		expect(unknown.message).toMatch(/"ghost" is not a rubric criterion/);

		const over = await captureError(() =>
			grade(teacherA.id, worksheet, alice.email, { 'm1-r1': 11 }, null, false)
		);
		expect(over.message).toMatch(/between 0 and 10/);
	});

	test('the admin tier grades across sections', async () => {
		const res = await grade(
			owner.id,
			worksheet,
			alice.email,
			{ 'm1-r1': 10, 'm2-r1': 5, 'm3-r1': 10 },
			null,
			false
		);
		expect(res.ok).toBe(true);
		expect(Number(res.score)).toBe(25);
	});

	test('file rows are scoped exactly like the work they evidence', async () => {
		const asBruno = await db.asUser(bruno.id, (q) =>
			q(
				`select f.id from public.classroom_submission_files f
				 join public.classroom_submissions s on s.id = f.submission_id
				 where s.item_id = $1`,
				[worksheet]
			)
		);
		expect(asBruno.rowCount).toBe(0);

		const asTeacherA = await db.asUser(teacherA.id, (q) =>
			q(
				`select f.id from public.classroom_submission_files f
				 join public.classroom_submissions s on s.id = f.submission_id
				 where s.item_id = $1`,
				[worksheet]
			)
		);
		expect(asTeacherA.rowCount).toBeGreaterThan(0);

		const asTeacherB = await db.asUser(teacherB.id, (q) =>
			q(
				`select f.id from public.classroom_submission_files f
				 join public.classroom_submissions s on s.id = f.submission_id
				 where s.item_id = $1`,
				[worksheet]
			)
		);
		expect(asTeacherB.rowCount).toBe(0);

		const ins = await captureError(() =>
			db.asUser(alice.id, (q) =>
				q(
					`insert into public.classroom_submission_files (submission_id, drive_file_id, filename, mime_type)
					 select id, 'forged', 'forged.jpg', 'image/jpeg' from public.classroom_submissions limit 1`
				)
			)
		);
		expect(ins.code).toBe('42501');
	});

	test('deleting someone else’s file reads as nonexistent', async () => {
		const fileId = (
			await db.asUser(alice.id, (q) =>
				q<{ id: string }>(
					`select f.id from public.classroom_submission_files f
					 join public.classroom_submissions s on s.id = f.submission_id
					 where s.item_id = $1 limit 1`,
					[worksheet]
				)
			)
		).rows[0].id;
		const err = await captureError(() =>
			rpc(bruno.id, 'public.classroom_delete_submission_file($1::uuid)', [fileId])
		);
		expect(err.message).toMatch(/does not exist/i);
	});

	test('anon holds no execute grant on any engine RPC and no privileges on any engine table', async () => {
		const fns = [
			'classroom_set_assignment_spec(uuid, jsonb)',
			'classroom_set_rubric(uuid, jsonb)',
			'classroom_save_response(uuid, text, jsonb)',
			'classroom_add_submission_file(uuid, text, text, text, bigint, text, text)',
			'classroom_set_submission_file_caption(uuid, text)',
			'classroom_delete_submission_file(uuid)',
			'classroom_submit_assignment(uuid)',
			'classroom_unsubmit_assignment(uuid)',
			'classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb)',
			'classroom_approve_module(uuid, text, text, boolean)'
		];
		for (const fn of fns) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', 'public.${fn}', 'execute') as ok`
			);
			expect(rows[0].ok, fn).toBe(false);
		}
		const tables = [
			'classroom_assignment_specs',
			'classroom_rubrics',
			'classroom_submissions',
			'classroom_responses',
			'classroom_submission_files',
			'classroom_module_approvals'
		];
		for (const table of tables) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_table_privilege('anon', 'public.${table}', 'select, insert, update, delete') as ok`
			);
			expect(rows[0].ok, table).toBe(false);
		}
	});

	test('the sentence rule agrees with the client mirror on its edges', async () => {
		const count = async (text: string) =>
			(
				await db.sql<{ n: number }>(`select public._classroom_sentence_count($1) as n`, [text])
			).rows[0].n;
		expect(await count('Hello world')).toBe(1);
		expect(await count('One. Two! Three?')).toBe(3);
		expect(await count('...')).toBe(0);
		expect(await count('')).toBe(0);
		expect(await count('Ends mid')).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// The home-page classroom feed (src/lib/classroom/feed.ts)
//
// The feed replaced the retired legacy class cards on the home page. It runs
// the SAME three RLS-scoped reads for everybody -- sections, items,
// submissions -- with no role branch and no student_email filter anywhere, so
// what a card can possibly show is decided entirely by the policies. That is
// the property worth pinning: a ranking bug shows the wrong item, but a
// SCOPING bug puts another student's grade on somebody else's home page and
// looks completely normal to the person it happens to.
//
// So these tests do not hand buildFeed a fixture. They read through the real
// policies AS each user, exactly the way the page load does, and rank whatever
// came back.
// ---------------------------------------------------------------------------

describe('home-page classroom feed', () => {
	// A fixed clock, so "due in 3 days" is a fact about the data rather than
	// about when the suite happens to run.
	const NOW = new Date('2026-10-15T12:00:00Z');
	const OVERDUE_AT = '2026-10-10T07:00:00Z';
	const SOON_AT = '2026-10-18T07:00:00Z';
	const LATER_AT = '2026-12-01T07:00:00Z';

	let feedOverdue: string; // P1 assignment, past due, alice never handed in
	let feedSoon: string; // P1 assignment, due in 3 days, not handed in
	let feedLater: string; // P1 assignment, due in 7 weeks -- must NOT rank
	let feedReturned: string; // P1 assignment, graded and released, unseen
	let feedSeen: string; // P1 assignment, released AND opened afterwards
	let feedMaterial: string; // P1 material, pinned -- the standing shelf
	let feedDraft: string; // P1 draft -- teacher-only
	let feedPinnedPost: string; // P1 pinned announcement -- ranks, but is not a task
	let feedP9: string; // P9 assignment, nothing to do with alice
	let emptySection: string; // enrolled, nothing posted

	const mkItem = (
		userId: string,
		kind: 'post' | 'assignment' | 'material',
		sections: string[],
		title: string,
		opts: { dueAt?: string | null; published?: boolean; pinned?: boolean; points?: number } = {}
	) =>
		rpc<{ item_id: string }>(
			userId,
			"public.classroom_create_item($1, $2::uuid[], $3, $4, $5, $6::timestamptz, null, $7, '[]'::jsonb, $8)",
			[
				kind,
				sections,
				title,
				'Body.',
				opts.points ?? (kind === 'assignment' ? 10 : null),
				opts.dueAt ?? null,
				opts.published ?? true,
				opts.pinned ?? false
			]
		);

	/**
	 * The three reads the home page load performs, run as `user` against the
	 * real policies and assembled into exactly the shape buildFeed consumes.
	 * Nothing here filters by owner: every restriction below comes from RLS.
	 */
	async function feedInputs(user: SeededUser) {
		return db.asUser(user.id, async (q) => {
			const sections = (
				await q<Record<string, unknown>>(
					`select s.id, s.course_id, s.label, s.block, s.teacher_email, s.active,
					        jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'active', c.active) as course
					   from public.classroom_sections s
					   join public.classroom_courses c on c.id = s.course_id`
				)
			).rows;
			const itemRows = (
				await q<Record<string, unknown>>(
					`select id, kind, title, body, points, due_at, category, author_email, author_name,
					        published, pinned, sort_order, first_published_at, edited_at, created_at, updated_at
					   from public.classroom_items`
				)
			).rows;
			const postings = (
				await q<{ item_id: string; section_id: string }>(
					'select item_id, section_id from public.classroom_postings'
				)
			).rows;
			const views = (
				await q<{ item_id: string; viewed_at: string }>(
					'select item_id, viewed_at from public.classroom_item_views'
				)
			).rows;
			const submissions = (
				await q<FeedSubmission>(
					`select item_id, student_email, state, submitted_at, returned_at, graded_at
					   from public.classroom_submissions`
				)
			).rows;
			const items = itemRows.map((row) =>
				normalizeItemRow({
					...row,
					classroom_postings: postings
						.filter((p) => p.item_id === row.id)
						.map((p) => ({ section_id: p.section_id })),
					classroom_item_views: views
						.filter((v) => v.item_id === row.id)
						.map((v) => ({ viewed_at: v.viewed_at }))
				})
			);
			return { sections: sections.map(normalizeSectionRow), items, submissions };
		});
	}

	async function feedFor(user: SeededUser, isAdmin = false) {
		const input = await feedInputs(user);
		return { input, feeds: buildFeed({ ...input, myEmail: user.email, isAdmin, now: NOW }) };
	}

	const titlesFor = (feeds: SectionFeed[], sectionId: string) =>
		feeds.find((f) => f.section.id === sectionId)?.urgent.map((e) => e.item.title) ?? [];
	const reasonsFor = (feeds: SectionFeed[], sectionId: string) =>
		feeds.find((f) => f.section.id === sectionId)?.urgent.map((e) => e.reason) ?? [];

	beforeAll(async () => {
		feedOverdue = (
			await mkItem(teacherA.id, 'assignment', [p1], 'Feed overdue', { dueAt: OVERDUE_AT })
		).item_id;
		feedSoon = (await mkItem(teacherA.id, 'assignment', [p1], 'Feed soon', { dueAt: SOON_AT }))
			.item_id;
		feedLater = (await mkItem(teacherA.id, 'assignment', [p1], 'Feed later', { dueAt: LATER_AT }))
			.item_id;
		feedReturned = (await mkItem(teacherA.id, 'assignment', [p1], 'Feed returned')).item_id;
		feedSeen = (await mkItem(teacherA.id, 'assignment', [p1], 'Feed seen')).item_id;
		feedMaterial = (await mkItem(teacherA.id, 'material', [p1], 'Feed syllabus', { pinned: true }))
			.item_id;
		feedDraft = (
			await mkItem(teacherA.id, 'assignment', [p1], 'Feed draft', { published: false })
		).item_id;
		feedPinnedPost = (
			await mkItem(teacherA.id, 'post', [p1], 'Feed pinned notice', { pinned: true })
		).item_id;
		feedP9 = (await mkItem(teacherB.id, 'assignment', [p9], 'Feed P9 only')).item_id;

		emptySection = (
			await rpc<{ section_id: string }>(
				teacherA.id,
				'public.classroom_upsert_section($1::uuid, $2, $3)',
				[courseId, 'Period 4', null]
			)
		).section_id;
		await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			emptySection,
			alice.email,
			'Alice Alvarez',
			true
		]);

		const rubric = [{ id: 'r1', criterion: 'Done', levels: levels(10) }];
		for (const item of [feedReturned, feedSeen]) {
			await rpc(teacherA.id, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
				item,
				JSON.stringify(rubric)
			]);
			await addFile(alice.id, item, `drive-${item.slice(0, 8)}`);
			await submit(alice.id, item);
			await grade(teacherA.id, item, alice.email, { r1: 10 }, 'Nice work.', true);
		}
		// One of the two is then OPENED, so "returned" can be told apart from
		// "returned and already read" -- the only thing stopping the badge
		// sticking to a grade the student has already looked at.
		await rpc(alice.id, 'public.classroom_mark_item_viewed($1::uuid)', [feedSeen]);

		// Bruno hands the overdue one in, so the teacher has a real grading queue
		// and alice's own card must not change because of it.
		await addFile(bruno.id, feedOverdue, 'drive-bruno-feed');
		await submit(bruno.id, feedOverdue);
	}, 120_000);

	test('a student sees only their own classes, and no draft', async () => {
		const { input, feeds } = await feedFor(alice);
		expect(feeds.map((f) => f.section.id).sort()).toEqual([p1, emptySection].sort());
		expect(feeds.some((f) => f.manages)).toBe(false);

		const ids = input.items.map((i) => i.id);
		expect(ids).not.toContain(feedDraft);
		expect(ids).not.toContain(feedP9);
		expect(feeds.flatMap((f) => f.urgent.map((e) => e.item.id))).not.toContain(feedP9);
	});

	test("a student's feed never carries a classmate's submission state", async () => {
		const { input } = await feedFor(alice);
		expect(input.submissions.length).toBeGreaterThan(0);
		expect(input.submissions.every((s) => s.student_email === alice.email)).toBe(true);
		expect(input.submissions.some((s) => s.student_email === bruno.email)).toBe(false);

		// The decisive direction: bruno really did hand something in, so the row
		// exists and alice's read is genuinely scoped rather than merely empty.
		const teacherView = await feedInputs(teacherA);
		expect(
			teacherView.submissions.some(
				(s) => s.student_email === bruno.email && s.item_id === feedOverdue
			)
		).toBe(true);
	});

	test('a teacher never reaches a student who is not in their class', async () => {
		const { input } = await feedFor(teacherB);
		expect(input.sections.map((s) => s.id)).toEqual([p9]);
		expect(input.submissions.some((s) => s.student_email === alice.email)).toBe(false);
	});

	test('the student ranking is urgency, not recency', async () => {
		const { feeds } = await feedFor(alice);
		const titles = titlesFor(feeds, p1);

		// These were created NEWEST-LAST, so a recency sort would put "Feed seen"
		// near the top and the overdue one near the bottom.
		expect(titles.slice(0, 3)).toEqual(['Feed overdue', 'Feed returned', 'Feed soon']);
		expect(reasonsFor(feeds, p1).slice(0, 3)).toEqual(['overdue', 'returned', 'due-soon']);

		// A grade already opened is finished business, and a deadline seven weeks
		// out is not this week's problem.
		expect(titles).not.toContain('Feed seen');
		expect(titles).not.toContain('Feed later');
	});

	test('a pinned syllabus stays reachable without competing with the work', async () => {
		const { input, feeds } = await feedFor(alice);
		const p1Feed = feeds.find((f) => f.section.id === p1)!;
		expect(p1Feed.standing.map((e) => e.item.id)).toContain(feedMaterial);
		expect(p1Feed.urgent.map((e) => e.item.id)).not.toContain(feedMaterial);

		// Uncapped, so the lowest-ranked entries are visible for the comparison.
		// A pinned ANNOUNCEMENT does rank -- it is worth seeing -- but it is not
		// a task, so it must never inflate the "N to do" chip.
		const full = buildFeed({
			...input,
			myEmail: alice.email,
			now: NOW,
			urgentLimit: 50
		}).find((f) => f.section.id === p1)!;
		expect(full.urgent.find((e) => e.item.id === feedPinnedPost)?.reason).toBe('pinned');
		expect(isActionable('pinned')).toBe(false);
		expect(full.actionCount).toBe(full.urgent.filter((e) => isActionable(e.reason)).length);
		expect(full.actionCount).toBeLessThan(full.urgent.length);
	});

	test('the card is a summary: the cap hides rows, never the count', async () => {
		const { input } = await feedFor(alice);
		const at = (limit: number) =>
			buildFeed({ ...input, myEmail: alice.email, now: NOW, urgentLimit: limit }).find(
				(f) => f.section.id === p1
			)!;
		const full = at(50);
		const capped = at(2);

		expect(full.urgent.length).toBeGreaterThan(2);
		expect(capped.urgent.length).toBe(2);
		expect(capped.hiddenCount).toBe(full.urgent.length - 2);
		// The chip counts everything the class is asking for, including what the
		// cap left out -- otherwise folding a card would understate the work.
		expect(capped.actionCount).toBe(full.actionCount);
		expect(capped.actionCount).toBeGreaterThan(capped.urgent.length);
		// And the shipped default is the one the page actually uses.
		expect(at(URGENT_LIMIT).urgent.length).toBeLessThanOrEqual(URGENT_LIMIT);
	});

	test('the teacher feed answers a different question: grading first, then drafts', async () => {
		const { feeds } = await feedFor(teacherA);
		const p1Feed = feeds.find((f) => f.section.id === p1)!;
		expect(p1Feed.manages).toBe(true);

		const top = p1Feed.urgent[0];
		expect(top.reason).toBe('ungraded');
		expect(top.item.id).toBe(feedOverdue);
		expect(top.count).toBe(1);

		// A teacher's own draft is a task, and only they can see it at all.
		expect(p1Feed.urgent.find((e) => e.item.id === feedDraft)?.reason).toBe('draft');

		// "Returned" and "overdue" are the student's framing, never the teacher's.
		expect(p1Feed.urgent.map((e) => e.reason)).not.toContain('returned');
		expect(p1Feed.urgent.map((e) => e.reason)).not.toContain('overdue');
	});

	test('a resubmission after a grade goes back into the queue', () => {
		const graded: FeedSubmission = {
			item_id: 'x',
			student_email: alice.email,
			state: 'submitted',
			submitted_at: '2026-10-14T00:00:00Z',
			graded_at: '2026-10-13T00:00:00Z',
			returned_at: '2026-10-13T00:00:00Z'
		};
		// Handed in AFTER it was graded: a bare "graded_at is null" check would
		// drop this student out of the queue with no visible symptom.
		expect(isAwaitingGrade(graded)).toBe(true);
		expect(isAwaitingGrade({ ...graded, submitted_at: '2026-10-12T00:00:00Z' })).toBe(false);
		expect(isAwaitingGrade({ ...graded, state: 'returned' })).toBe(false);
	});

	test('enrolled with nothing posted reads as empty, not as broken', async () => {
		const { feeds } = await feedFor(alice);
		const empty = feeds.find((f) => f.section.id === emptySection)!;
		expect(empty.totalItems).toBe(0);
		expect(empty.urgent).toEqual([]);
		expect(empty.standing).toEqual([]);
		expect(emptyMessage(empty)).toContain('Nothing posted');

		const teacherEmpty = (await feedFor(teacherA)).feeds.find(
			(f) => f.section.id === emptySection
		)!;
		expect(teacherEmpty.manages).toBe(true);
		expect(emptyMessage(teacherEmpty)).toContain('Nothing posted');
	});

	test('the admin tier gets the teacher framing everywhere, with no role branch', async () => {
		const { feeds } = await feedFor(owner, true);
		expect(feeds.length).toBeGreaterThanOrEqual(3);
		expect(feeds.every((f) => f.manages)).toBe(true);
	});

	test('signed out, every read the feed makes is refused outright', async () => {
		for (const table of [
			'classroom_sections',
			'classroom_items',
			'classroom_postings',
			'classroom_submissions',
			'classroom_item_views'
		]) {
			const err = await captureError(() =>
				db.asAnon((q) => q(`select * from public.${table}`))
			);
			expect(err.code, table).toBe('42501');
		}
		expect(buildFeed({ sections: [], items: [], submissions: [], myEmail: '', now: NOW })).toEqual(
			[]
		);
	});
});
