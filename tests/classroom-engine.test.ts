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

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql'
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
	release: boolean
) {
	return rpc<{ ok: boolean; reason?: string; score?: number; state?: string; missing?: string[] }>(
		userId,
		'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5)',
		[itemId, email, JSON.stringify(scores), comment, release]
	);
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
			rubric: [{ criterion: 'Method explained with evidence', points: 10 }]
		},
		{
			id: 'm2',
			title: 'Evidence',
			points: 10,
			blocks: [
				{ type: 'imageZone', id: 'z1', minImages: 1, captions: true },
				{ type: 'checklist', id: 'c1', items: ['Tool zeroed', 'Bench cleared'] }
			],
			rubric: [{ criterion: 'Evidence complete', points: 10 }]
		},
		{
			id: 'm3',
			title: 'Reflect',
			points: 10,
			blocks: [{ type: 'textField', id: 'f2', prompt: 'Reflect on the process.', minSentences: 1 }],
			rubric: [{ criterion: 'Reflection', points: 10 }]
		}
	],
	declarations: { academicIntegrity: true },
	approvalGate: { afterModule: 'm2', label: 'Instructor Approval Required' }
};

const RUBRIC = [
	{ id: 'm1-r1', criterion: 'Observe: Method explained with evidence', points: 10 },
	{ id: 'm2-r1', criterion: 'Evidence: Evidence complete', points: 10 },
	{ id: 'm3-r1', criterion: 'Reflect: Reflection', points: 10 }
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
		bad.modules[0].rubric = [{ criterion: 'Half only', points: 5 }];
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
				JSON.stringify([{ id: 'c1', criterion: 'No points row' }])
			])
		);
		expect(bad.message).toMatch(/points between 0 and 1000/);

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
		const draft = await grade(teacherA.id, worksheet, alice.email, { 'm1-r1': 8 }, null, false);
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
			true
		);
		expect(incomplete).toMatchObject({ ok: false, reason: 'incomplete_scores' });
		expect(incomplete.missing).toEqual(['m2-r1', 'm3-r1']);

		const released = await grade(
			teacherA.id,
			worksheet,
			alice.email,
			{ 'm1-r1': 8, 'm2-r1': 10, 'm3-r1': 7.5 },
			'Solid work. Tighten the reflection.',
			true
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
			{ 'm1-r1': 9, 'm2-r1': 9, 'm3-r1': 9 },
			null,
			false
		);
		expect(res.ok).toBe(true);
		expect(Number(res.score)).toBe(27);
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
			'classroom_grade_submission(uuid, text, jsonb, text, boolean)',
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
