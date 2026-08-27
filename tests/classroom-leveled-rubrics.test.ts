// tests/classroom-leveled-rubrics.test.ts
//
// LEVELED RUBRIC CRITERIA (migration 0095), against a real Postgres with the
// real migration files. Everything here fails SILENTLY if it regresses: a
// rubric whose levels do not descend still renders and still grades, an
// unexplained override still stores a number, and a migration that dropped a
// score looks exactly like a student who was never graded.
//
// THE CHAIN IS DELIBERATELY SHORT OF 0095 AT BOOT. The migration's own job is
// turning flat criteria into leveled ones, so the fixture seeds REAL flat data
// through 0086's own classroom_set_rubric and grades a student against it,
// THEN applies the real 0095 file over the top -- the same shape as the 0085
// canonical-items migration suite. Everything after that runs on the migrated
// database, which is what production will be.
//
// Cast: teacherA runs P1 with alice and bruno enrolled.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
	'0086_classroom_assignment_engine.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const MIGRATION_0137 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0137_anon_execute_sweep.sql'),
	'utf8'
);

const MIGRATION_0095 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0095_classroom_leveled_rubrics.sql'),
	'utf8'
);

let db: TestDb;
let teacherA: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
let p1: string;
let migrated: string; // the assignment carrying the pre-0095 flat rubric
let fresh: string; // a second assignment, authored after the migration

interface Level {
	points: number;
	label: string;
	descriptor?: string;
}
interface Criterion {
	id: string;
	criterion: string;
	points?: number;
	levels?: Level[];
	incomplete?: boolean;
}

async function captureError(run: () => Promise<unknown>): Promise<{ message: string }> {
	try {
		await run();
	} catch (error) {
		return { message: (error as { message?: string }).message ?? String(error) };
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

function setRubric(userId: string, itemId: string, criteria: unknown) {
	return rpc(userId, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
		itemId,
		JSON.stringify(criteria)
	]);
}

function grade(
	userId: string,
	itemId: string,
	email: string,
	scores: Record<string, number>,
	release = false,
	comments: Record<string, string> | null = null
) {
	return rpc<{ ok: boolean; reason?: string; score?: number; missing?: string[] }>(
		userId,
		'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb)',
		[itemId, email, JSON.stringify(scores), null, release, comments ? JSON.stringify(comments) : null]
	);
}

async function readCriteria(itemId: string): Promise<Criterion[]> {
	const { rows } = await db.sql<{ criteria: Criterion[] }>(
		`select criteria from public.classroom_rubrics where item_id = $1`,
		[itemId]
	);
	return rows[0]?.criteria ?? [];
}

async function readScores(itemId: string, email: string) {
	const { rows } = await db.sql<{
		rubric_scores: Record<string, number>;
		score: string;
		state: string;
	}>(
		`select rubric_scores, score, state from public.classroom_submissions
		 where item_id = $1 and student_email = $2`,
		[itemId, email]
	);
	return rows[0];
}

/** Three descending levels ending at 0: the shape the constraints require. */
function levels(max: number): Level[] {
	return [
		{ points: max, label: 'Complete', descriptor: 'Everything asked for, correct.' },
		{ points: Math.round(max / 2), label: 'Developing', descriptor: 'Some of it, or present but wrong.' },
		{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
	];
}

function specWith(rubric: unknown[]) {
	return {
		schemaVersion: 1,
		meta: { assignmentId: 'idea100-u2-01', title: 'Leveled', totalPoints: 10 },
		modules: [
			{
				id: 'm1',
				title: 'Only module',
				points: 10,
				blocks: [{ type: 'textField', id: 'f1', prompt: 'Say something.', minSentences: 1 }],
				rubric
			}
		]
	};
}

// ---------------------------------------------------------------------------
// Seed: a PRE-0095 world, with real flat rubrics and real grades on them.
// ---------------------------------------------------------------------------

/** Exactly what a 0086-era rubric looked like: points, no levels. */
const FLAT_RUBRIC = [
	{ id: 'c1', criterion: 'Sketch is complete', points: 6 },
	// The 0086 optional-levels shape: a label + `description`, no points. Its
	// text is grading policy somebody wrote, so the migration must keep it.
	{
		id: 'c2',
		criterion: 'Members are labeled',
		points: 4,
		levels: [{ label: 'Full credit', description: 'Every member labeled and legible.' }]
	},
	// A criterion that already named a real lower value: it must be carried DOWN
	// as a level rather than thrown away.
	{
		id: 'c3',
		criterion: 'Reflection',
		points: 10,
		levels: [
			{ label: 'Full credit', points: 10, description: 'Specific and reasoned.' },
			{ label: 'Partial', points: 4, description: 'General.' }
		]
	}
];

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	teacherA = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Baptiste');

	const course = await rpc<{ course_id: string }>(
		teacherA.id,
		'public.classroom_upsert_course($1, $2)',
		['IDEA100', 'Intro to Engineering Design']
	);
	p1 = (
		await rpc<{ section_id: string }>(
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[course.course_id, 'Period 1', null]
		)
	).section_id;
	for (const s of [alice, bruno]) {
		await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			p1,
			s.email,
			s.email,
			true
		]);
	}

	const mk = async (title: string) =>
		(
			await rpc<{ item_id: string }>(
				teacherA.id,
				`public.classroom_create_item('assignment', $1::uuid[], $2, 'Do the thing.', 20, null, null, true, '[]'::jsonb, false)`,
				[[p1], title]
			)
		).item_id;
	migrated = await mk('Bridge Sketch');
	fresh = await mk('Second Assignment');

	// Real flat rubric, through the RPC that existed at the time.
	await setRubric(teacherA.id, migrated, FLAT_RUBRIC);

	// Real grades against it, one released and one still a draft -- so the
	// migration is proved against work at both stages.
	await rpc(teacherA.id, 'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5)', [
		migrated,
		alice.email,
		JSON.stringify({ c1: 5, c2: 4, c3: 7 }),
		'Good, tighten the reflection.',
		true
	]);
	await rpc(teacherA.id, 'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5)', [
		migrated,
		bruno.email,
		JSON.stringify({ c1: 6, c2: 2, c3: 10 }),
		null,
		false
	]);
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. The data migration.
// ---------------------------------------------------------------------------

describe('flat criteria become leveled without losing a score', () => {
	let before: { alice: Awaited<ReturnType<typeof readScores>>; bruno: Awaited<ReturnType<typeof readScores>> };

	test('the pre-0095 world is genuinely flat and genuinely graded', async () => {
		const criteria = await readCriteria(migrated);
		expect(criteria.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
		expect(criteria[0].levels).toBeUndefined();

		before = {
			alice: await readScores(migrated, alice.email),
			bruno: await readScores(migrated, bruno.email)
		};
		expect(before.alice.rubric_scores).toEqual({ c1: 5, c2: 4, c3: 7 });
		expect(Number(before.alice.score)).toBe(16);
		expect(before.alice.state).toBe('returned');
		expect(before.bruno.rubric_scores).toEqual({ c1: 6, c2: 2, c3: 10 });
	});

	test('0095 applies, and NO SCORE MOVES', async () => {
		await db.sql(MIGRATION_0095);
		// 0095 RE-CREATES two functions, and a `create or replace` under the
		// project's default privileges hands the new one a fresh `anon` grant.
		// The chain already swept once; a migration applied by hand after it has
		// to be swept again, exactly as it would be in the real apply order.
		await db.sql(MIGRATION_0137);

		const after = {
			alice: await readScores(migrated, alice.email),
			bruno: await readScores(migrated, bruno.email)
		};
		// Byte-for-byte the same map, the same total, the same state: the
		// migration rewrites the RUBRIC's shape and nothing about the grades.
		expect(after.alice.rubric_scores).toEqual(before.alice.rubric_scores);
		expect(after.alice.score).toBe(before.alice.score);
		expect(after.alice.state).toBe(before.alice.state);
		expect(after.bruno.rubric_scores).toEqual(before.bruno.rubric_scores);
		expect(after.bruno.score).toBe(before.bruno.score);
	});

	test('each criterion keeps its id and its maximum, and gains a top level', async () => {
		const criteria = await readCriteria(migrated);
		expect(criteria.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
		expect(criteria.map((c) => c.points)).toEqual([6, 4, 10]);
		for (const c of criteria) {
			expect(c.levels?.[0].points).toBe(c.points);
		}
		// A flat criterion's own text becomes its top level's descriptor.
		expect(criteria[1].levels?.[0]).toMatchObject({
			points: 4,
			label: 'Full credit',
			descriptor: 'Every member labeled and legible.'
		});
	});

	test('a level somebody had already written is carried down, not dropped', async () => {
		const criteria = await readCriteria(migrated);
		expect(criteria[2].levels).toHaveLength(2);
		expect(criteria[2].levels?.[1]).toMatchObject({ points: 4, label: 'Partial' });
	});

	test('every half-migrated criterion is FLAGGED, not silently half-migrated', async () => {
		const criteria = await readCriteria(migrated);
		// None of the three can satisfy the constraints (no descriptors written
		// for the lower levels, no zero level), so all three say so.
		expect(criteria.map((c) => c.incomplete)).toEqual([true, true, true]);
	});

	test('re-applying 0095 is a no-op, not a second rewrite', async () => {
		const first = await readCriteria(migrated);
		const scoresFirst = await readScores(migrated, alice.email);
		await db.sql(MIGRATION_0095);
		await db.sql(MIGRATION_0137);
		expect(await readCriteria(migrated)).toEqual(first);
		expect(await readScores(migrated, alice.email)).toEqual(scoresFirst);
	});

	test('the old 5-argument grade signature is GONE, not left as an overload', async () => {
		const { rows } = await db.sql<{ args: string }>(
			`select pg_get_function_identity_arguments(p.oid) as args
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_grade_submission'`
		);
		// A defaulted 6th parameter would leave the 5-arg form callable as a
		// second, comment-blind overload -- and PostgREST could not resolve it.
		expect(rows).toHaveLength(1);
		expect(rows[0].args).toBe('p_item_id uuid, p_student_email text, p_scores jsonb, p_comment text, p_return boolean, p_criterion_comments jsonb');
	});
});

// ---------------------------------------------------------------------------
// 2. The level constraints, at the rubric door.
// ---------------------------------------------------------------------------

describe('level constraints (rubric)', () => {
	const ok = [{ id: 'c1', criterion: 'Fine', levels: levels(10) }];

	test('a well-formed leveled rubric lands and is stamped complete', async () => {
		const res = await setRubric(teacherA.id, fresh, ok);
		expect(res).toMatchObject({ ok: true, unfinished: 0 });
		const criteria = await readCriteria(fresh);
		expect(criteria[0].incomplete).toBe(false);
		// The maximum is re-derived from the top level, never taken from input.
		expect(criteria[0].points).toBe(10);
	});

	test('the criterion maximum is the TOP LEVEL, whatever the client claims', async () => {
		await setRubric(teacherA.id, fresh, [
			{ id: 'c1', criterion: 'Lying points', points: 999, levels: levels(10) }
		]);
		expect((await readCriteria(fresh))[0].points).toBe(10);
		await setRubric(teacherA.id, fresh, ok);
	});

	test('MORE than four levels is refused', async () => {
		const err = await captureError(() =>
			setRubric(teacherA.id, fresh, [
				{
					id: 'c1',
					criterion: 'Five levels',
					levels: [
						{ points: 10, label: 'A', descriptor: 'a' },
						{ points: 8, label: 'B', descriptor: 'b' },
						{ points: 6, label: 'C', descriptor: 'c' },
						{ points: 3, label: 'D', descriptor: 'd' },
						{ points: 0, label: 'E', descriptor: 'e' }
					]
				}
			])
		);
		expect(err.message).toMatch(/at most four/i);
	});

	test('points that do not strictly descend are refused', async () => {
		const err = await captureError(() =>
			setRubric(teacherA.id, fresh, [
				{
					id: 'c1',
					criterion: 'Flat middle',
					levels: [
						{ points: 10, label: 'A', descriptor: 'a' },
						{ points: 5, label: 'B', descriptor: 'b' },
						{ points: 5, label: 'C', descriptor: 'c' },
						{ points: 0, label: 'D', descriptor: 'd' }
					]
				}
			])
		);
		expect(err.message).toMatch(/strictly less/i);
	});

	test('a level worth more than the maximum is refused', async () => {
		const err = await captureError(() =>
			setRubric(teacherA.id, fresh, [
				{
					id: 'c1',
					criterion: 'Over',
					levels: [
						{ points: 10, label: 'A', descriptor: 'a' },
						{ points: 12, label: 'B', descriptor: 'b' },
						{ points: 0, label: 'C', descriptor: 'c' }
					]
				}
			])
		);
		expect(err.message).toMatch(/between 0 and 10/);
	});

	test('too few levels, a nonzero bottom, or a missing descriptor is FLAGGED', async () => {
		// The unfinished states the migration produces, so the builder can save
		// work in progress -- and every one of them comes back stamped.
		const cases: { name: string; levels: Level[] }[] = [
			{ name: 'two levels', levels: [{ points: 10, label: 'A', descriptor: 'a' }, { points: 0, label: 'B', descriptor: 'b' }] },
			{
				name: 'bottom is not zero',
				levels: [
					{ points: 10, label: 'A', descriptor: 'a' },
					{ points: 5, label: 'B', descriptor: 'b' },
					{ points: 2, label: 'C', descriptor: 'c' }
				]
			},
			{
				name: 'no descriptor',
				levels: [
					{ points: 10, label: 'A', descriptor: 'a' },
					{ points: 5, label: 'B' },
					{ points: 0, label: 'C', descriptor: 'c' }
				]
			}
		];
		for (const c of cases) {
			const res = await setRubric(teacherA.id, fresh, [
				{ id: 'c1', criterion: c.name, levels: c.levels }
			]);
			expect(res, c.name).toMatchObject({ ok: true, unfinished: 1 });
			expect((await readCriteria(fresh))[0].incomplete, c.name).toBe(true);
		}
	});

	test('a client cannot flag its way past the constraints', async () => {
		// `incomplete` is server-derived: sending false on an unfinished
		// criterion, or true on a finished one, changes nothing.
		await setRubric(teacherA.id, fresh, [
			{ id: 'c1', criterion: 'Claims to be fine', incomplete: false, levels: [{ points: 10, label: 'A', descriptor: 'a' }] }
		]);
		expect((await readCriteria(fresh))[0].incomplete).toBe(true);
		await setRubric(teacherA.id, fresh, [
			{ id: 'c1', criterion: 'Claims to be broken', incomplete: true, levels: levels(10) }
		]);
		expect((await readCriteria(fresh))[0].incomplete).toBe(false);
	});

	test('a level with no points at all is refused, not read as zero', async () => {
		const err = await captureError(() =>
			setRubric(teacherA.id, fresh, [
				{
					id: 'c1',
					criterion: 'No points',
					levels: [{ points: 10, label: 'A', descriptor: 'a' }, { label: 'B', descriptor: 'b' } as Level]
				}
			])
		);
		expect(err.message).toMatch(/numeric points/i);
	});

	test('a flat criterion is refused outright', async () => {
		const err = await captureError(() =>
			setRubric(teacherA.id, fresh, [{ id: 'c1', criterion: 'Flat', points: 10 }])
		);
		expect(err.message).toMatch(/needs levels/i);
	});
});

// ---------------------------------------------------------------------------
// 3. The level constraints, at the SPEC door -- strict, with no unfinished
//    allowance, because a spec is authored content.
// ---------------------------------------------------------------------------

describe('level constraints (spec import)', () => {
	function setSpec(rubric: unknown[]) {
		return rpc(teacherA.id, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
			fresh,
			JSON.stringify(specWith(rubric))
		]);
	}

	test('a leveled spec imports', async () => {
		const res = await setSpec([{ id: 'c1', criterion: 'Reasoning', levels: levels(10) }]);
		expect(res).toMatchObject({ ok: true });
	});

	test('a FLAT criterion is refused, and the message names it', async () => {
		const err = await captureError(() =>
			setSpec([{ id: 'c1', criterion: 'Material identification', points: 10 }])
		);
		expect(err.message).toMatch(/"Material identification"/);
		expect(err.message).toMatch(/has no levels/);
		expect(err.message).toMatch(/no longer valid/);
	});

	test('a leftover flat `points` disagreeing with the top level is refused', async () => {
		// v1.1 dropped the flat maximum; a leftover one is accepted only when the
		// two agree, so a spec can never state a maximum its levels contradict.
		const err = await captureError(() =>
			setSpec([{ id: 'c1', criterion: 'Mismatched', points: 10, levels: levels(8) }])
		);
		expect(err.message).toMatch(/has points 10 but its top level is worth 8/);
	});

	test('two levels is refused here, where the rubric door only flags it', async () => {
		const err = await captureError(() =>
			setSpec([
				{
					id: 'c1',
					criterion: 'Too few',
					levels: [
						{ points: 10, label: 'A', descriptor: 'a' },
						{ points: 0, label: 'B', descriptor: 'b' }
					]
				}
			])
		);
		expect(err.message).toMatch(/needs three or four/i);
	});

	test('a nonzero bottom level is refused', async () => {
		const err = await captureError(() =>
			setSpec([
				{
					id: 'c1',
					criterion: 'No zero',
					levels: [
						{ points: 10, label: 'A', descriptor: 'a' },
						{ points: 6, label: 'B', descriptor: 'b' },
						{ points: 2, label: 'C', descriptor: 'c' }
					]
				}
			])
		);
		expect(err.message).toMatch(/bottom level is 2 but must be 0/);
	});

	test('points that do not strictly descend are refused', async () => {
		const err = await captureError(() =>
			setSpec([
				{
					id: 'c1',
					criterion: 'Ascending',
					levels: [
						{ points: 10, label: 'A', descriptor: 'a' },
						{ points: 4, label: 'B', descriptor: 'b' },
						{ points: 6, label: 'C', descriptor: 'c' },
						{ points: 0, label: 'D', descriptor: 'd' }
					]
				}
			])
		);
		expect(err.message).toMatch(/strictly less/i);
	});

	test('a level with no descriptor is refused', async () => {
		const err = await captureError(() =>
			setSpec([
				{
					id: 'c1',
					criterion: 'Undescribed',
					levels: [
						{ points: 10, label: 'A', descriptor: 'a' },
						{ points: 5, label: 'B' },
						{ points: 0, label: 'C', descriptor: 'c' }
					]
				}
			])
		);
		expect(err.message).toMatch(/needs a descriptor/i);
	});

	test('criterion maximums must still sum to the module points', async () => {
		const err = await captureError(() =>
			setSpec([{ id: 'c1', criterion: 'Half', levels: levels(5) }])
		);
		expect(err.message).toMatch(/rubric sums to 5 but the module is worth 10/);
	});
});

// ---------------------------------------------------------------------------
// 4. Grading: level selection, and the override's required comment.
// ---------------------------------------------------------------------------

describe('grading by level, and overrides', () => {
	beforeAll(async () => {
		await setRubric(teacherA.id, fresh, [
			{ id: 'a', criterion: 'First', levels: levels(10) },
			{ id: 'b', criterion: 'Second', levels: levels(10) }
		]);
	});

	test('a score ON a level needs no comment', async () => {
		const res = await grade(teacherA.id, fresh, alice.email, { a: 5, b: 0 });
		expect(res).toMatchObject({ ok: true });
		expect(Number(res.score)).toBe(5);
	});

	test('a score BETWEEN levels with no comment is refused, and stores nothing', async () => {
		const before = await readScores(fresh, alice.email);
		const res = await grade(teacherA.id, fresh, alice.email, { a: 7, b: 0 });
		expect(res).toMatchObject({ ok: false, reason: 'override_needs_comment' });
		expect(res.missing).toEqual(['a']);
		// The refusal is total: the OTHER criterion's score is not written either.
		expect(await readScores(fresh, alice.email)).toEqual(before);
	});

	test('the same override WITH a comment lands, and the comment is stored', async () => {
		const res = await grade(teacherA.id, fresh, alice.email, { a: 7, b: 0 }, false, {
			a: 'Between Complete and Developing: one step missing.'
		});
		expect(res).toMatchObject({ ok: true });
		expect(Number(res.score)).toBe(7);
		const { rows } = await db.sql<{ criterion_comments: Record<string, string> }>(
			`select criterion_comments from public.classroom_submissions
			 where item_id = $1 and student_email = $2`,
			[fresh, alice.email]
		);
		expect(rows[0].criterion_comments).toEqual({
			a: 'Between Complete and Developing: one step missing.'
		});
	});

	test('the comment is required on a DRAFT too, not only on release', async () => {
		// An unexplained off-level score must never be storable at all, so the
		// override check runs before the release check and independently of it.
		const res = await grade(teacherA.id, fresh, alice.email, { a: 3, b: 3 }, false);
		expect(res).toMatchObject({ ok: false, reason: 'override_needs_comment' });
		expect(res.missing).toEqual(['a', 'b']);
	});

	test('an override refusal beats an incomplete-scores refusal', async () => {
		const res = await grade(teacherA.id, fresh, alice.email, { a: 3 }, true);
		expect(res).toMatchObject({ ok: false, reason: 'override_needs_comment' });
	});

	test('returning is blocked while ANY criterion is unscored', async () => {
		const res = await grade(teacherA.id, fresh, alice.email, { a: 10 }, true);
		expect(res).toMatchObject({ ok: false, reason: 'incomplete_scores' });
		expect(res.missing).toEqual(['b']);
		const row = await readScores(fresh, alice.email);
		expect(row.state).not.toBe('returned');
	});

	test('every criterion scored releases the grade', async () => {
		const res = await grade(teacherA.id, fresh, alice.email, { a: 10, b: 5 }, true);
		expect(res).toMatchObject({ ok: true });
		expect(Number(res.score)).toBe(15);
		expect((await readScores(fresh, alice.email)).state).toBe('returned');
	});

	test('an out-of-range score is still refused outright', async () => {
		const err = await captureError(() => grade(teacherA.id, fresh, alice.email, { a: 11 }));
		expect(err.message).toMatch(/between 0 and 10/);
	});

	test('a comment on a criterion that does not exist is refused', async () => {
		const err = await captureError(() =>
			grade(teacherA.id, fresh, alice.email, { a: 10, b: 10 }, false, { ghost: 'hello' })
		);
		expect(err.message).toMatch(/Comment key "ghost" is not a rubric criterion/);
	});

	test('a student cannot grade, comment, or reach the rubric write path', async () => {
		const gradeErr = await captureError(() =>
			grade(alice.id, fresh, alice.email, { a: 10, b: 10 }, false, { a: 'give me marks' })
		);
		expect(gradeErr.message).toMatch(/teacher of record/i);
		const rubricErr = await captureError(() =>
			setRubric(alice.id, fresh, [{ id: 'a', criterion: 'Mine now', levels: levels(10) }])
		);
		expect(rubricErr.message).toMatch(/teacher of record/i);
	});

	test('no direct write path to criterion_comments for anyone', async () => {
		for (const user of [alice, teacherA]) {
			const err = await captureError(() =>
				db.asUser(user.id, (q) =>
					q(`update public.classroom_submissions set criterion_comments = '{"a":"x"}'::jsonb`)
				)
			);
			expect(err.message).toMatch(/permission denied|violates row-level security/i);
		}
	});

	test('anon holds no grant on either changed function', async () => {
		for (const fn of [
			'classroom_set_rubric(uuid, jsonb)',
			'classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb)',
			'_classroom_check_levels(jsonb, numeric, text, boolean)',
			'_classroom_normalize_rubric(jsonb)'
		]) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', $1, 'EXECUTE') as ok`,
				[`public.${fn}`]
			);
			expect(rows[0].ok, fn).toBe(false);
		}
	});
});

// ---------------------------------------------------------------------------
// 5. What the student can see of their own leveled grade.
// ---------------------------------------------------------------------------

describe('the student reads their own levels and comments', () => {
	test('the released grade, its per-criterion scores and its comments are readable', async () => {
		await setRubric(teacherA.id, fresh, [
			{ id: 'a', criterion: 'First', levels: levels(10) },
			{ id: 'b', criterion: 'Second', levels: levels(10) }
		]);
		await grade(teacherA.id, fresh, bruno.email, { a: 5, b: 8 }, true, {
			b: 'Between levels: nearly complete.'
		});

		const mine = await db.asUser(bruno.id, (q) =>
			q<{ rubric_scores: Record<string, number>; criterion_comments: Record<string, string> }>(
				`select rubric_scores, criterion_comments from public.classroom_submissions
				 where item_id = $1`,
				[fresh]
			)
		);
		expect(mine.rows).toHaveLength(1);
		expect(mine.rows[0].rubric_scores).toEqual({ a: 5, b: 8 });
		expect(mine.rows[0].criterion_comments).toEqual({ b: 'Between levels: nearly complete.' });

		// And the rubric itself -- the promise a student reads BEFORE submitting.
		const rubric = await db.asUser(bruno.id, (q) =>
			q<{ criteria: Criterion[] }>(`select criteria from public.classroom_rubrics where item_id = $1`, [
				fresh
			])
		);
		expect(rubric.rows[0].criteria[0].levels).toHaveLength(3);
	});

	test('a classmate reads neither the score nor the comment', async () => {
		const theirs = await db.asUser(alice.id, (q) =>
			q(
				`select criterion_comments from public.classroom_submissions
				 where item_id = $1 and student_email = $2`,
				[fresh, bruno.email]
			)
		);
		expect(theirs.rowCount).toBe(0);
	});
});
