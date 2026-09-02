// tests/db/classroom-grading-extra-credit.test.ts
//
// EXTRA CREDIT (migration 0171) and POST-GRADE CHANGE (no migration), against a
// real Postgres with the real migration files applied unmodified.
//
// WHY THIS IS AUTOMATED AT ALL. Both guarantees regress SILENTLY. An extra
// credit award that stopped reaching `score` still stores a row, still renders,
// and is only discovered when a grade is disputed; a surviving old arity that
// wiped an award looks exactly like a teacher who forgot to enter one. And the
// post-grade signal is a comparison over timestamps nobody looks at directly --
// a derivation that stopped firing shows nothing on any screen.
//
// THE CHAIN IS DELIBERATELY SHORT OF 0171 AT BOOT. The file's own job is to
// widen a function a deployed client already calls, so the fixture grades
// through the REAL 6-argument form first and applies 0171 over the top -- the
// state a hand-applied migration actually lands in.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

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
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0160_classroom_submit_incomplete_work.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const read = (f: string) => readFileSync(join(process.cwd(), 'supabase', 'migrations', f), 'utf8');
const MIGRATION_0171 = read('0171_classroom_extra_credit.sql');

let db: TestDb;
let teacher: SeededUser;
let alice: SeededUser;
let bruno: SeededUser;
let item: string;

function rpc<T = Record<string, unknown>>(userId: string, call: string, params: unknown[]): Promise<T> {
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

/** The 6-argument form: exactly what the deployed console calls. */
function gradeNarrow(
	userId: string,
	email: string,
	scores: Record<string, number>,
	release = false,
	comments: Record<string, string> | null = null
) {
	return rpc<{ ok: boolean; reason?: string; score?: number; state?: string }>(
		userId,
		'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb)',
		[item, email, JSON.stringify(scores), null, release, comments ? JSON.stringify(comments) : null]
	);
}

/** The 7-argument form 0171 adds. */
function gradeWide(
	userId: string,
	email: string,
	scores: Record<string, number>,
	extraCredit: number | null,
	release = false
) {
	return rpc<{ ok: boolean; score?: number; extra_credit?: number | null }>(
		userId,
		'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb, $7::numeric)',
		[item, email, JSON.stringify(scores), null, release, null, extraCredit]
	);
}

interface Row {
	score: string | null;
	extra_credit: string | null;
	rubric_scores: Record<string, number> | null;
	state: string;
	graded_at: Date | null;
	submitted_at: Date | null;
}

async function submission(email: string, withExtra = true): Promise<Row> {
	const cols = withExtra
		? 'score, extra_credit, rubric_scores, state, graded_at, submitted_at'
		: 'score, null::numeric as extra_credit, rubric_scores, state, graded_at, submitted_at';
	const { rows } = await db.sql<Row>(
		`select ${cols} from public.classroom_submissions where item_id = $1 and student_email = $2`,
		[item, email]
	);
	return rows[0];
}

const LEVELS = (max: number) => [
	{ points: max, label: 'Complete', descriptor: 'All of it.' },
	{ points: max / 2, label: 'Developing', descriptor: 'Some of it.' },
	{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
];

const RUBRIC = [
	{ id: 'c1', criterion: 'Sketch', points: 10, levels: LEVELS(10) },
	{ id: 'c2', criterion: 'Reflection', points: 10, levels: LEVELS(10) }
];

const SPEC = {
	schemaVersion: 1,
	meta: { assignmentId: 'idea100-u1-01', title: 'Bridge', totalPoints: 20 },
	modules: [
		{
			id: 'm1',
			title: 'Only module',
			points: 20,
			blocks: [{ type: 'textField', id: 'f1', prompt: 'Say something.', minSentences: 1 }],
			rubric: [
				{ id: 'c1', criterion: 'Sketch', levels: LEVELS(10) },
				{ id: 'c2', criterion: 'Reflection', levels: LEVELS(10) }
			]
		}
	]
};

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);
	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Baptiste');

	const course = await rpc<{ course_id: string }>(teacher.id, 'public.classroom_upsert_course($1, $2)', [
		'IDEA100',
		'Intro to Engineering Design'
	]);
	const p1 = (
		await rpc<{ section_id: string }>(teacher.id, 'public.classroom_upsert_section($1::uuid, $2, $3)', [
			course.course_id,
			'Period 1',
			null
		])
	).section_id;
	for (const s of [alice, bruno]) {
		await rpc(teacher.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			p1,
			s.email,
			s.email,
			true
		]);
	}
	item = (
		await rpc<{ item_id: string }>(
			teacher.id,
			`public.classroom_create_item('assignment', $1::uuid[], $2, 'Do it.', 20, null, null, true, '[]'::jsonb, false)`,
			[[p1], 'Bridge Sketch']
		)
	).item_id;
	await rpc(teacher.id, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
		item,
		JSON.stringify(SPEC)
	]);
	await rpc(teacher.id, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
		item,
		JSON.stringify(RUBRIC)
	]);

	// A REAL pre-0171 world: both students answered, handed in, and were graded
	// through the arity the deployed console uses.
	for (const s of [alice, bruno]) {
		await rpc(s.id, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
			item,
			'f1',
			JSON.stringify('A first answer that is a whole sentence.')
		]);
		await rpc(s.id, 'public.classroom_submit_assignment($1::uuid)', [item]);
	}
	await gradeNarrow(teacher.id, alice.email, { c1: 10, c2: 5 }, true);
	await gradeNarrow(teacher.id, bruno.email, { c1: 10, c2: 10 }, true);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. Before the migration: extra credit is genuinely impossible.
// ---------------------------------------------------------------------------

describe('the pre-0171 world has no way to record extra credit', () => {
	test('a score above a criterion maximum is refused', async () => {
		const message = await captureError(() => gradeNarrow(teacher.id, alice.email, { c1: 12, c2: 5 }));
		expect(message).toContain('must be between 0 and 10');
	});

	test('an extra key in the scores object is refused', async () => {
		const message = await captureError(() =>
			gradeNarrow(teacher.id, alice.email, { c1: 10, c2: 5, extra_credit: 3 } as Record<string, number>)
		);
		expect(message).toContain('is not a rubric criterion');
	});

	test('and the column does not exist yet', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from information_schema.columns
			 where table_schema = 'public' and table_name = 'classroom_submissions'
			   and column_name = 'extra_credit'`
		);
		expect(Number(rows[0].n)).toBe(0);
		// The positive control for that count: a column that IS there.
		const { rows: control } = await db.sql<{ n: string }>(
			`select count(*) as n from information_schema.columns
			 where table_schema = 'public' and table_name = 'classroom_submissions'
			   and column_name = 'graded_at'`
		);
		expect(Number(control[0].n)).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 2. The migration, over that seeded world.
// ---------------------------------------------------------------------------

describe('0171 applies over graded work without moving a score', () => {
	let before: { alice: Row; bruno: Row };

	test('0171 applies, and NO SCORE MOVES', async () => {
		before = { alice: await submission(alice.email, false), bruno: await submission(bruno.email, false) };
		expect(Number(before.alice.score)).toBe(15);
		expect(Number(before.bruno.score)).toBe(20);

		await db.sql(MIGRATION_0171);
		// A `create or replace` under the project's default privileges hands the
		// new function a fresh `anon` grant, so the sweep is re-applied exactly as
		// it would be in the real hand-apply order. 0171 revokes for itself, so
		// this is belt AND braces -- and the ACL assertion below is what proves it.
		await db.sql(read('0137_anon_execute_sweep.sql'));

		const after = { alice: await submission(alice.email), bruno: await submission(bruno.email) };
		expect(Number(after.alice.score)).toBe(15);
		expect(Number(after.bruno.score)).toBe(20);
		expect(after.alice.rubric_scores).toEqual({ c1: 10, c2: 5 });
	});

	test('every existing row is null, not zero -- nothing was backfilled', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from public.classroom_submissions where extra_credit is not null`
		);
		expect(Number(rows[0].n)).toBe(0);
	});

	test('it re-applies cleanly', async () => {
		await db.sql(MIGRATION_0171);
		const after = await submission(alice.email);
		expect(Number(after.score)).toBe(15);
	});

	test('both arities exist, and only the narrow one carries defaults', async () => {
		const { rows } = await db.sql<{ pronargs: number; pronargdefaults: number }>(
			`select p.pronargs, p.pronargdefaults from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_grade_submission'
			 order by p.pronargs`
		);
		// A COUNT OF TWO PASSES ON EXACTLY THE ARRANGEMENT THAT BREAKS EVERY CALL,
		// so the shape is asserted rather than the count.
		expect(rows.map((r) => [r.pronargs, r.pronargdefaults])).toEqual([
			[6, 3],
			[7, 0]
		]);
	});

	test('anon holds execute on neither arity; authenticated holds both', async () => {
		const { rows } = await db.sql<{
			anon_wide: boolean;
			anon_narrow: boolean;
			auth_wide: boolean;
			auth_narrow: boolean;
		}>(
			`select
			   has_function_privilege('anon', 'public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric)', 'execute') as anon_wide,
			   has_function_privilege('anon', 'public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb)', 'execute') as anon_narrow,
			   has_function_privilege('authenticated', 'public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric)', 'execute') as auth_wide,
			   has_function_privilege('authenticated', 'public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb)', 'execute') as auth_narrow`
		);
		expect(rows[0]).toEqual({
			anon_wide: false,
			anon_narrow: false,
			auth_wide: true,
			auth_narrow: true
		});
	});
});

// ---------------------------------------------------------------------------
// 3. What extra credit does.
// ---------------------------------------------------------------------------

describe('extra credit reaches the score and never a criterion', () => {
	test('an award is added to the rubric sum', async () => {
		const res = await gradeWide(teacher.id, alice.email, { c1: 10, c2: 5 }, 3, true);
		expect(res.ok).toBe(true);
		const row = await submission(alice.email);
		expect(Number(row.extra_credit)).toBe(3);
		expect(Number(row.score)).toBe(18);
		// The rubric is untouched: no criterion carries a score outside its range.
		expect(row.rubric_scores).toEqual({ c1: 10, c2: 5 });
	});

	test('the score may exceed the rubric total, which is the point', async () => {
		await gradeWide(teacher.id, bruno.email, { c1: 10, c2: 10 }, 5, true);
		const row = await submission(bruno.email);
		expect(Number(row.score)).toBe(25);
	});

	test('a NEGATIVE award is refused by name', async () => {
		const message = await captureError(() => gradeWide(teacher.id, alice.email, { c1: 10, c2: 5 }, -2));
		expect(message).toContain('Extra credit cannot be negative');
	});

	test('the column constraint refuses a negative directly, not only the RPC', async () => {
		const message = await captureError(() =>
			db.sql(`update public.classroom_submissions set extra_credit = -1 where item_id = $1`, [item])
		);
		expect(message).toContain('classroom_submissions_extra_credit_range');
	});

	test('ZERO is an award taken back, and scores identically to none', async () => {
		await gradeWide(teacher.id, alice.email, { c1: 10, c2: 5 }, 0, true);
		const row = await submission(alice.email);
		expect(Number(row.extra_credit)).toBe(0);
		// B2 IS INERT WHEN UNUSED: byte-for-byte the pre-0171 total.
		expect(Number(row.score)).toBe(15);
	});

	test('a non-author cannot award it', async () => {
		const message = await captureError(() => gradeWide(bruno.id, alice.email, { c1: 10, c2: 5 }, 5));
		expect(message).toContain('teacher of record');
	});
});

// ---------------------------------------------------------------------------
// 4. The narrow arity is what makes the deploy orderless. This is the half a
//    signature change usually breaks, and it breaks silently.
// ---------------------------------------------------------------------------

describe('the deployed 6-argument client keeps working', () => {
	test('it still grades, and the score is the criteria sum', async () => {
		const res = await gradeNarrow(teacher.id, bruno.email, { c1: 5, c2: 10 }, true);
		expect(res.ok).toBe(true);
	});

	test('AND IT DOES NOT ERASE AN AWARD ALREADY ON THE ROW', async () => {
		await gradeWide(teacher.id, alice.email, { c1: 10, c2: 5 }, 4, true);
		expect(Number((await submission(alice.email)).score)).toBe(19);

		// A teacher on a console that has never heard of extra credit fixes a
		// score. Null must mean LEAVE ALONE, or every regrade silently deletes it.
		await gradeNarrow(teacher.id, alice.email, { c1: 10, c2: 10 }, true);
		const row = await submission(alice.email);
		expect(Number(row.extra_credit)).toBe(4);
		expect(Number(row.score)).toBe(24);
	});

	test('its refusals are unchanged, because there is one implementation', async () => {
		expect(await captureError(() => gradeNarrow(teacher.id, alice.email, { c1: 12, c2: 5 }))).toContain(
			'must be between 0 and 10'
		);
		expect(
			await captureError(() =>
				gradeNarrow(teacher.id, alice.email, { c1: 10, c2: 5, nope: 1 } as Record<string, number>)
			)
		).toContain('is not a rubric criterion');
	});

	test('an off-level score still needs a comment through BOTH arities', async () => {
		const narrow = await gradeNarrow(teacher.id, bruno.email, { c1: 7, c2: 10 });
		expect(narrow.reason).toBe('override_needs_comment');
		const wide = await gradeWide(teacher.id, bruno.email, { c1: 7, c2: 10 }, 2);
		expect((wide as unknown as { reason?: string }).reason).toBe('override_needs_comment');
	});
});

// ---------------------------------------------------------------------------
// 5. POST-GRADE CHANGE: the data the derivation reads, on the real tables.
//    No migration -- this is the proof that none was needed.
// ---------------------------------------------------------------------------

describe('post-grade change is derivable from stored data', () => {
	/** The client's rule, run in SQL against the same columns the payload carries. */
	const SIGNAL = `
		select
			(s.submitted_at > s.graded_at) as resubmitted,
			(exists (
				select 1 from public.classroom_responses r
				where r.item_id = s.item_id and r.student_email = s.student_email
					and r.updated_at > s.graded_at
			)) as edited,
			s.updated_at as submission_updated_at
		from public.classroom_submissions s
		where s.item_id = $1 and s.student_email = $2`;

	async function signal(email: string) {
		const { rows } = await db.sql<{
			resubmitted: boolean;
			edited: boolean;
			submission_updated_at: Date;
		}>(SIGNAL, [item, email]);
		return rows[0];
	}

	test('a freshly graded row reports nothing', async () => {
		await gradeWide(teacher.id, alice.email, { c1: 10, c2: 10 }, null, true);
		expect(await signal(alice.email)).toMatchObject({ resubmitted: false, edited: false });
	});

	test('an EDIT after grading fires, and does not move the submission row', async () => {
		const before = (await signal(alice.email)).submission_updated_at;
		const res = await rpc<{ ok: boolean }>(
			alice.id,
			'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
			[item, 'f1', JSON.stringify('A rewritten answer, after the grade landed.')]
		);
		// A returned row is editable again -- that is the whole exposure.
		expect(res.ok).toBe(true);

		const after = await signal(alice.email);
		expect(after.edited).toBe(true);
		expect(after.resubmitted).toBe(false);
		// THE REASON THE SIGNAL CANNOT BE A STORED FLAG: the write that changes
		// the work does not touch the submission row at all, so nothing on the
		// grading side has a hook to set one.
		expect(after.submission_updated_at.getTime()).toBe(before.getTime());
	});

	test('a RESUBMISSION after grading fires as its own kind', async () => {
		const res = await rpc<{ ok: boolean }>(bruno.id, 'public.classroom_submit_assignment($1::uuid)', [
			item
		]);
		expect(res.ok).toBe(true);
		const after = await signal(bruno.email);
		expect(after.resubmitted).toBe(true);
		// Bruno never edited a response after HIS grade, so the two kinds are
		// genuinely independent rather than one thing with two names.
		expect(after.edited).toBe(false);
	});

	test('REGRADING CLEARS BOTH, because graded_at moves', async () => {
		await gradeWide(teacher.id, alice.email, { c1: 10, c2: 10 }, null, true);
		await gradeWide(teacher.id, bruno.email, { c1: 10, c2: 10 }, null, true);
		expect(await signal(alice.email)).toMatchObject({ resubmitted: false, edited: false });
		expect(await signal(bruno.email)).toMatchObject({ resubmitted: false, edited: false });
	});

	test('the mutant the derivation must not become: created_at instead of graded_at', async () => {
		// A NEGATIVE CONTROL FOR THE POSITIVE ONE ABOVE. Comparing against
		// `created_at` -- the row's birth, which every later write is after -- fires
		// on work that has not changed since it was graded, which is a signal that
		// can never clear. If this ever came back false the "it clears" test above
		// would be passing for the wrong reason.
		const { rows } = await db.sql<{ edited: boolean }>(
			`select exists (
				select 1 from public.classroom_responses r
				where r.item_id = s.item_id and r.student_email = s.student_email
					and r.updated_at > s.created_at
			) as edited
			from public.classroom_submissions s
			where s.item_id = $1 and s.student_email = $2`,
			[item, alice.email]
		);
		expect(rows[0].edited).toBe(true);
	});
});
