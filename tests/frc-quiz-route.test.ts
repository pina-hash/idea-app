// tests/frc-quiz-route.test.ts
//
// The FRC knowledge-gate ENDPOINT, `src/routes/frc/[domain]/[unit]/quiz/
// +server.ts`, driven as the REAL shipped handler against a REAL Postgres
// carrying the REAL migration chain through 0041 -- the same seam
// tests/notebook-page-load.test.ts uses for a signed-in load, for the same
// reason: the thing worth testing is not what the SQL says but what the handler
// and the database do to each other, and the gate's whole authority lives in
// that pair. The endpoint had no test of any kind.
//
// WHAT THIS FILE ADDS OVER THE PURE ENGINE SUITE. `gradeAttempt` in
// quiz-engine.ts is the CANONICAL grader and is what the engine suite covers,
// but NOTHING ON THE REAL PATH CALLS IT: the DB store grades through the
// `frc_quiz_grade` RPC (0040, recreated by 0041), which is a hand-written SQL
// MIRROR of it. A mirror that drifts is invisible from either side, so the
// comparisons below are put to the SQL, and the sealed key the SQL grades
// against is read back as the connection owner to check the endpoint stored
// what it served.
//
// THE SHIM CANNOT CARRY A JSONB ARGUMENT, and that is worked around HERE rather
// than in tests/db/postgrest-shim.ts. node-postgres serializes a JS array as a
// Postgres ARRAY literal (`{...}`), so `p_sealed` arrives as text jsonb cannot
// parse and every start fails with "invalid input syntax for type json".
// PostgREST does not do that: it sends the body as JSON and lets Postgres cast.
// `jsonClient` below restores exactly that one behaviour by stringifying an
// object-valued argument before it is bound, and changes nothing else. It is a
// gap in the shared shim, noted in this bundle's history entry.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { recoveries, type AnswerTruth, type ServedQuestion } from './frc-quiz-disclosure';
import { POST } from '../src/routes/frc/[domain]/[unit]/quiz/+server';
import { FRC_QUIZ_COOLDOWNS_SEC } from '../src/lib/frc/track';
import mdm1Bank from '../src/lib/server/frc/mdm-1-quiz-bank.json';
import sharedBanks from '../src/lib/server/frc/mdm-quiz-banks.json';

/** 0040/0041 on their dependencies, with the 0137 grant sweep last. */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0039_frc_user_progress.sql',
	'0040_frc_quiz.sql',
	'0041_frc_progress_lockdown.sql',
	'0137_anon_execute_sweep.sql'
] as const;

interface BankItem {
	objective: string;
	stem: string;
	options: string[];
	answer: number;
}
const BANKS: Record<string, { testLength: number; passPercent: number; items: BankItem[] }> = {
	'MDM-1': mdm1Bank as never,
	...((sharedBanks as unknown as { banks: Record<string, never> }).banks)
};

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
let student: SeededUser;
let other: SeededUser;

/**
 * The shim, plus the two things supabase-js does that it does not: send an
 * object-valued RPC argument as JSON, and put the whole body through JSON on
 * the way. See the file header for why that belongs here and not in the shim.
 */
function jsonClient(userId: string) {
	const base = createPostgrestShim(db, fks, userId);
	/** A jsonb-shaped argument: an object, or an array containing one. */
	const isJsonish = (v: unknown) =>
		v !== null &&
		typeof v === 'object' &&
		(!Array.isArray(v) || v.some((e) => e !== null && typeof e === 'object'));
	return {
		from: base.from,
		rpc: (name: string, args?: Record<string, unknown>) => {
			// THE WIRE STEP, and it is not decoration. supabase-js JSON.stringifies
			// the body, and JSON has no NaN or Infinity: both become `null`, which
			// reaches the function as SQL NULL. The shim binds the JS value
			// straight through instead, so a NaN would arrive as the text "NaN" and
			// blow up an integer[] cast -- a 503 this endpoint cannot actually
			// produce. Round-tripping here reproduces exactly what a browser sends,
			// which is the difference between measuring the app and measuring the
			// fixture. (`Number('nope')` is NaN, and the route coerces with
			// Number(), so this is a path a real request reaches.)
			const wire = args ? (JSON.parse(JSON.stringify(args)) as Record<string, unknown>) : args;
			return base.rpc(
				name,
				wire &&
					Object.fromEntries(
						Object.entries(wire).map(([k, v]) => [k, isJsonish(v) ? JSON.stringify(v) : v])
					)
			);
		}
	};
}

/** Drive the REAL handler. `claims: null` is a signed-out request. */
async function post(
	body: unknown,
	opts: { unit?: string; domain?: string; user?: SeededUser | null; raw?: string } = {}
) {
	const domain = opts.domain ?? 'cad-mechanical';
	const unit = opts.unit ?? '1';
	const user = opts.user === undefined ? student : opts.user;
	const request = new Request(`http://localhost/frc/${domain}/${unit}/quiz`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: opts.raw ?? JSON.stringify(body)
	});
	const res = (await (POST as unknown as (e: unknown) => Promise<Response>)({
		request,
		params: { domain, unit },
		locals: {
			supabase: user ? jsonClient(user.id) : jsonClient('00000000-0000-0000-0000-000000000000'),
			claims: user ? { sub: user.id, email: user.email, role: 'authenticated' } : null
		}
	})) as Response;
	return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** The sealed key the DATABASE is holding, read as the owner. */
async function sealedOf(attemptId: string) {
	const { rows } = await db.sql<{ sealed: { c: number; o: string }[]; unit_id: string }>(
		`select sealed, unit_id from public.frc_quiz_attempts where id = $1`,
		[attemptId]
	);
	return rows[0];
}

/** The correct option per served question, resolved from the BANK's text. */
function truthFor(unitId: string, questions: ServedQuestion[]): AnswerTruth[] {
	return questions.map((q) => {
		const item = BANKS[unitId].items.find((it) => it.stem === q.stem);
		if (!item) throw new Error(`served a stem ${unitId} has no item for`);
		const text = item.options[item.answer];
		return { text, index: q.options.indexOf(text) };
	});
}

/** Start, and hand back everything the assertions need. */
async function startAttempt(unit = '1', unitId = 'MDM-1') {
	const r = await post({ action: 'start' }, { unit });
	expect(r.status, JSON.stringify(r.body)).toBe(200);
	const questions = r.body.questions as ServedQuestion[];
	const attemptId = r.body.attemptId as string;
	return { r, questions, attemptId, truth: truthFor(unitId, questions) };
}

/**
 * The endpoint reads `Date.now()` at the TOP of the handler and the database
 * stamps `submitted_at` with its own `now()` DURING the grade, so the reported
 * remaining time is the schedule value plus however long the round trip took,
 * rounded up by `Math.ceil`. Measured at 61 for a 60 second step. It is a real
 * (and harmless) property of two clocks read at two moments, not noise to be
 * retried away, so it is asserted as a band with the schedule value as the
 * FLOOR -- the gate may over-report, never under-report.
 */
function expectCooldownAbout(actual: unknown, expected: number) {
	expect(typeof actual).toBe('number');
	expect(actual as number).toBeGreaterThanOrEqual(expected);
	expect(actual as number).toBeLessThanOrEqual(expected + 2);
}

/** Move every finalized attempt back in time, the way the clock would. */
async function backdate(userId: string, unitId: string, seconds: number) {
	await db.sql(
		`update public.frc_quiz_attempts
		 set submitted_at = submitted_at - make_interval(secs => $3)
		 where user_id = $1 and unit_id = $2 and submitted_at is not null`,
		[userId, unitId, seconds]
	);
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	fks = await loadForeignKeys(db);
	student = await createUser(db, 'quiz-student@boscotech.net', 'Quinn Student');
	other = await createUser(db, 'quiz-other@boscotech.net', 'Otto Other');
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// The gate around the gate.
// ---------------------------------------------------------------------------
describe('the endpoint refuses before it does anything', () => {
	it('401s a signed-out caller, without touching the store', async () => {
		const r = await post({ action: 'start' }, { user: null });
		expect(r.status).toBe(401);
		expect(r.body).toEqual({ ok: false, reason: 'unauthorized' });
		const { rows } = await db.sql(`select count(*)::int as n from public.frc_quiz_attempts`);
		expect(rows[0].n).toBe(0);
	});

	it('404s a unit with no bank, an unknown unit, and a domain that is not this one', async () => {
		// MDM-4 through MDM-8 are modeling units: a gauntlet gate, no quiz bank.
		for (const unit of ['4', '5', '6', '7', '8'])
			expect((await post({ action: 'start' }, { unit })).status, `unit ${unit}`).toBe(404);
		for (const unit of ['0', '11', '99', 'abc', '', '1.5', '-1'])
			expect((await post({ action: 'start' }, { unit })).status, `unit "${unit}"`).toBe(404);
		for (const domain of ['foundation', 'electrical', ''])
			expect((await post({ action: 'start' }, { domain })).status, domain).toBe(404);
	});

	it('404s the whole Foundation domain, whose units DO have banks -- a live defect', async () => {
		// PINNED AS BEHAVIOUR, NOT ENDORSED. The handler opens with
		// `params.domain !== 'cad-mechanical'` and resolves the unit through
		// `mdmUnitByNumber`, so it answers for the CAD/Mechanical domain only. But
		// `getQuizBank` carries F1 through F5, every Foundation unit is authored
		// `gate: quiz`, and the unit page's own load builds a live `gate` whenever
		// a bank exists -- so all five render "Start quiz" against an endpoint that
		// 404s them, and FrcQuizGate reports "The quiz is not available right now."
		// The two halves are asserted together so the pair cannot be half-fixed
		// silently, and this test is the thing that goes green when it is fixed.
		const foundationBanks = ['F1', 'F2', 'F3', 'F4', 'F5'];
		for (const id of foundationBanks) expect(BANKS[id], `${id} has a bank`).toBeDefined();
		for (let n = 1; n <= 5; n++) {
			const r = await post({ action: 'start' }, { domain: 'foundation', unit: String(n) });
			expect(r.status, `foundation/${n}`).toBe(404);
			expect(r.body).toEqual({ ok: false, reason: 'unavailable' });
		}
		// Nothing was written for any of them, so the refusal is total.
		expect(
			(await db.sql(`select count(*)::int as n from public.frc_quiz_attempts`)).rows[0].n
		).toBe(0);
	});

	it('400s a body it cannot read, an action it does not have, and a submit with no attempt', async () => {
		expect((await post(null, { raw: 'not json at all' })).status).toBe(400);
		expect((await post({}).then((r) => r.status))).toBe(400);
		expect((await post({ action: 'restart' })).status).toBe(400);
		expect((await post({ action: 'submit', answers: [0] })).status).toBe(400);
	});

	it('409s an attempt id that is not the caller OWN in-flight attempt', async () => {
		const { attemptId } = await startAttempt();
		// Somebody else's attempt, from their own session.
		const mine = await post({ action: 'submit', attemptId, answers: [0] }, { user: other });
		expect(mine.status).toBe(409);
		expect(mine.body).toEqual({ ok: false, reason: 'no_attempt' });
		// A well-formed uuid that is nobody's.
		const nobody = await post({
			action: 'submit',
			attemptId: '11111111-2222-3333-4444-555555555555',
			answers: [0]
		});
		expect(nobody.status).toBe(409);
		// The real attempt is untouched by either.
		const { rows } = await db.sql<{ status: string }>(
			`select status from public.frc_quiz_attempts where id = $1`,
			[attemptId]
		);
		expect(rows[0].status).toBe('in_progress');
		await db.sql(`delete from public.frc_quiz_attempts`);
	});
});

// ---------------------------------------------------------------------------
// THE KEY NEVER REACHES THE CLIENT, over every code path the endpoint has.
// ---------------------------------------------------------------------------
describe('no response a student receives carries the key', () => {
	it('a served attempt is stems and options only, and the stored key matches it', async () => {
		const { r, questions, attemptId, truth } = await startAttempt();
		expect(Object.keys(r.body).sort()).toEqual(['attemptId', 'ok', 'questions', 'total']);
		expect(r.body.total).toBe(BANKS['MDM-1'].testLength);
		for (const q of questions) expect(Object.keys(q).sort()).toEqual(['options', 'stem']);
		expect(recoveries(r.body, questions, truth)).toEqual([]);

		// The key the DATABASE holds is the position of the correct TEXT in what
		// the student was actually sent. This is the whole join between the served
		// payload and the grader, and it is what an off-by-one breaks silently.
		const stored = await sealedOf(attemptId);
		expect(stored.unit_id).toBe('MDM-1');
		expect(stored.sealed.map((s) => s.c)).toEqual(truth.map((t) => t.index));
		await db.sql(`delete from public.frc_quiz_attempts`);
	});

	it('a FAILED submit returns topics and a cooldown, and nothing recoverable', async () => {
		const { questions, attemptId, truth } = await startAttempt();
		const wrong = questions.map((q, i) => q.options.findIndex((_, k) => k !== truth[i].index));
		const r = await post({ action: 'submit', attemptId, answers: wrong });
		expect(r.status).toBe(200);
		expect(r.body.passed).toBe(false);
		expect(r.body.score).toBe(0);
		expect(Object.keys(r.body).sort()).toEqual([
			'cooldownRemainingSec',
			'missedTopics',
			'ok',
			'passed',
			'score'
		]);
		// The detector over the FAIL path -- the one where the student already
		// knows they were wrong and a helpful field is most tempting.
		expect(recoveries(r.body, questions, truth)).toEqual([]);
		const topics = r.body.missedTopics as string[];
		expect(topics.length).toBeGreaterThan(0);
		for (const t of topics)
			for (const q of questions)
				for (const o of q.options) expect(t.includes(o), `"${t}" quotes "${o}"`).toBe(false);
		await db.sql(`delete from public.frc_quiz_attempts`);
		await db.sql(`delete from public.frc_user_progress`);
	});

	it('a PASSED submit returns no topics and nothing recoverable', async () => {
		const { questions, attemptId, truth } = await startAttempt();
		const r = await post({
			action: 'submit',
			attemptId,
			answers: truth.map((t) => t.index)
		});
		expect(r.status).toBe(200);
		expect(r.body).toMatchObject({
			ok: true,
			passed: true,
			score: 100,
			missedTopics: [],
			cooldownRemainingSec: 0
		});
		expect(recoveries(r.body, questions, truth)).toEqual([]);
		await db.sql(`delete from public.frc_quiz_attempts`);
		await db.sql(`delete from public.frc_user_progress`);
	});

	it('the SECOND surface is shut too: a student cannot select sealed or pass_percent', async () => {
		// THE ENDPOINT IS NOT THE ONLY WAY TO THE ROW. 0040 grants column-level
		// SELECT on frc_quiz_attempts, so a student reads their own attempt log
		// straight through PostgREST -- and the key is a column ON that row. A
		// suite that asserted non-disclosure over the endpoint alone would be the
		// exact shape this repo has shipped before: one surface proved clean while
		// a second carried the same data.
		const { attemptId } = await startAttempt();
		const denied = async (columns: string) => {
			try {
				await db.asUser(student.id, (q) =>
					q(`select ${columns} from public.frc_quiz_attempts`)
				);
				return null;
			} catch (e) {
				return (e as Error).message;
			}
		};
		expect(await denied('sealed')).toMatch(/permission denied/i);
		expect(await denied('pass_percent')).toMatch(/permission denied/i);
		expect(await denied('*')).toMatch(/permission denied/i);
		// The POSITIVE CONTROL: the log columns really are readable, so the three
		// refusals above are the grant working and not the table being unreachable.
		const log = await db.asUser(student.id, (q) =>
			q(`select id, unit_id, status, score, started_at, submitted_at
			   from public.frc_quiz_attempts`)
		);
		expect(log.rows.length).toBe(1);
		expect((log.rows[0] as { id: string }).id).toBe(attemptId);
		// And another student's row is invisible entirely (RLS, not the grant).
		const theirs = await db.asUser(other.id, (q) =>
			q(`select id from public.frc_quiz_attempts`)
		);
		expect(theirs.rows.length).toBe(0);
		await db.sql(`delete from public.frc_quiz_attempts`);
	});

	it('no RPC a student may execute hands back the key', async () => {
		// The functions are the other way to a row. `frc_quiz_start` answers with
		// an id and a timestamp; `frc_quiz_grade` with a verdict and objective
		// TAGS. Neither may ever carry `sealed`, whatever else it gains.
		const client = jsonClient(student.id);
		const started = await client.rpc('frc_quiz_start', {
			p_unit_id: 'MDM-1',
			p_sealed: [{ c: 3, o: 'alpha' }],
			p_pass_percent: 90
		});
		expect(Object.keys(started.data as object).sort()).toEqual(['attempt_id', 'started_at']);
		const graded = await client.rpc('frc_quiz_grade', {
			p_attempt_id: (started.data as { attempt_id: string }).attempt_id,
			p_answers: [0]
		});
		expect(Object.keys(graded.data as object).sort()).toEqual(['missed', 'passed', 'score']);
		expect(JSON.stringify(graded.data)).not.toContain('"c"');
		await db.sql(`delete from public.frc_quiz_attempts`);
		await db.sql(`delete from public.frc_user_progress`);
	});
});

// ---------------------------------------------------------------------------
// GRADING AT ITS EDGES, put to the SQL mirror rather than to the TS grader.
// ---------------------------------------------------------------------------
describe('the SQL grader agrees with the canonical one at every edge', () => {
	/** One attempt with a key we choose, graded through the real endpoint. */
	async function gradeSealed(sealed: { c: number; o: string }[], answers: unknown[]) {
		const client = jsonClient(student.id);
		const started = await client.rpc('frc_quiz_start', {
			p_unit_id: 'MDM-1',
			p_sealed: sealed,
			p_pass_percent: 90
		});
		const attemptId = (started.data as { attempt_id: string }).attempt_id;
		const r = await post({ action: 'submit', attemptId, answers });
		await db.sql(`delete from public.frc_quiz_attempts`);
		await db.sql(`delete from public.frc_user_progress`);
		return r;
	}
	const four = [
		{ c: 0, o: 'alpha' },
		{ c: 1, o: 'beta' },
		{ c: 2, o: 'gamma' },
		{ c: 3, o: 'delta' }
	];

	it('every option correct, and every option wrong', async () => {
		expect((await gradeSealed(four, [0, 1, 2, 3])).body).toMatchObject({
			passed: true,
			score: 100
		});
		const lost = await gradeSealed(four, [1, 0, 0, 0]);
		expect(lost.body).toMatchObject({ passed: false, score: 0 });
		expect((lost.body.missedTopics as string[]).length).toBe(4);
	});

	it('an unanswered item is wrong, whether the array is short or holed', async () => {
		expect((await gradeSealed(four, [0, 1])).body).toMatchObject({ score: 50 });
		expect((await gradeSealed(four, [])).body).toMatchObject({ score: 0 });
	});

	it('an out-of-range or non-numeric index is wrong at either end', async () => {
		expect((await gradeSealed(four, [-1, -1, -1, -1])).body).toMatchObject({ score: 0 });
		expect((await gradeSealed(four, [999, 999, 999, 999])).body).toMatchObject({ score: 0 });
		// Number('nope') is NaN, which JSON writes as null, which reaches the
		// function as SQL NULL and is coalesced to -1: never an index, and never
		// an error the student sees.
		expect((await gradeSealed(four, ['nope', 'nope', 'nope', 'nope'])).body).toMatchObject({
			score: 0
		});
		// A NUMERIC string is a different case, and the endpoint's Number() makes
		// it a real index: '0' grades as 0. Pinned because it is the one place a
		// value the client typed becomes a choice the gate honours.
		expect((await gradeSealed(four, ['0', '1', '2', '3'])).body).toMatchObject({ score: 100 });
	});

	it('a JSON null is graded as option 0, not as "no answer"', async () => {
		// `Number(null)` is 0, so the endpoint cannot tell an unanswered question
		// from one where the student chose the first option. It is not a bypass --
		// after the shuffle the correct index is uniform, so a blank sheet is worth
		// chance -- but it IS a client-supplied value the server does not
		// re-derive, and it is why an all-null sheet scores 25 here rather than 0.
		expect((await gradeSealed(four, [null, null, null, null])).body).toMatchObject({
			score: 25
		});
		// Against a key with no zero in it, the same sheet scores nothing.
		const noZero = four.map((s2) => ({ ...s2, c: 3 }));
		expect((await gradeSealed(noZero, [null, null, null, null])).body).toMatchObject({
			score: 0
		});
	});

	it('an extra answer past the last question cannot score', async () => {
		expect((await gradeSealed(four, [0, 1, 2, 3, 3, 3, 3, 3])).body).toMatchObject({
			score: 100
		});
		expect((await gradeSealed(four, [1, 1, 2, 3, 0, 0])).body).toMatchObject({ score: 75 });
	});

	it('answering the same attempt twice is refused, not re-graded', async () => {
		const client = jsonClient(student.id);
		const started = await client.rpc('frc_quiz_start', {
			p_unit_id: 'MDM-1',
			p_sealed: four,
			p_pass_percent: 90
		});
		const attemptId = (started.data as { attempt_id: string }).attempt_id;
		const first = await post({ action: 'submit', attemptId, answers: [1, 0, 0, 0] });
		expect(first.body).toMatchObject({ passed: false, score: 0 });
		// The second submit carries the RIGHT answers. It must not overwrite the
		// fail: an attempt is finalized once, and a re-grade is how a failed gate
		// becomes a passed one by pressing submit again.
		const second = await post({ action: 'submit', attemptId, answers: [0, 1, 2, 3] });
		expect(second.status).toBe(409);
		expect(second.body).toEqual({ ok: false, reason: 'no_attempt' });
		const { rows } = await db.sql<{ status: string; score: number }>(
			`select status, score from public.frc_quiz_attempts where id = $1`,
			[attemptId]
		);
		expect(rows[0]).toEqual({ status: 'failed', score: 0 });
		const prog = await db.sql(`select count(*)::int as n from public.frc_user_progress`);
		expect(prog.rows[0].n).toBe(0);
		await db.sql(`delete from public.frc_quiz_attempts`);
	});

	it('the pass boundary is the rounded percentage, with no partial credit', async () => {
		const six = Array.from({ length: 6 }, (_, i) => ({ c: 0, o: `o${i}` }));
		// 5 of 6 is 83: the 90% gate means all six.
		expect((await gradeSealed(six, [0, 0, 0, 0, 0, 1])).body).toMatchObject({
			score: 83,
			passed: false
		});
		expect((await gradeSealed(six, [0, 0, 0, 0, 0, 0])).body).toMatchObject({
			score: 100,
			passed: true
		});
		const ten = Array.from({ length: 10 }, (_, i) => ({ c: 0, o: `o${i}` }));
		expect((await gradeSealed(ten, [0, 0, 0, 0, 0, 0, 0, 0, 0, 1])).body).toMatchObject({
			score: 90,
			passed: true
		});
	});

	it('Postgres round() and Math.round() agree at the tie this gate can reach', async () => {
		// The SQL mirror rounds; the canonical grader uses Math.round. 1 of 8 is
		// 12.5, the only tie a small item count produces, and both answer 13.
		const eight = Array.from({ length: 8 }, (_, i) => ({ c: 0, o: `o${i}` }));
		expect((await gradeSealed(eight, [0, 1, 1, 1, 1, 1, 1, 1])).body).toMatchObject({
			score: 13
		});
	});

	it('records the pass in frc_user_progress, and a fail records nothing', async () => {
		const { attemptId, truth } = await startAttempt();
		await post({ action: 'submit', attemptId, answers: truth.map((t) => t.index) });
		const passed = await db.sql<{ unit_id: string; user_id: string }>(
			`select user_id, unit_id from public.frc_user_progress`
		);
		expect(passed.rows).toEqual([{ user_id: student.id, unit_id: 'MDM-1' }]);
		await db.sql(`delete from public.frc_quiz_attempts`);
		await db.sql(`delete from public.frc_user_progress`);

		const second = await startAttempt();
		await post({
			action: 'submit',
			attemptId: second.attemptId,
			answers: second.questions.map((q, i) =>
				q.options.findIndex((_, k) => k !== second.truth[i].index)
			)
		});
		const after = await db.sql(`select count(*)::int as n from public.frc_user_progress`);
		expect(after.rows[0].n).toBe(0);
		await db.sql(`delete from public.frc_quiz_attempts`);
	});

	it('a student still has no direct write to frc_user_progress (0041)', async () => {
		// The gate is only a gate while passing it is the ONLY way to the row.
		let message: string | null = null;
		try {
			await db.asUser(student.id, (q) =>
				q(`insert into public.frc_user_progress (user_id, unit_id) values ($1, 'MDM-1')`, [
					student.id
				])
			);
		} catch (e) {
			message = (e as Error).message;
		}
		expect(message).toMatch(/permission denied/i);
		expect(
			(await db.sql(`select count(*)::int as n from public.frc_user_progress`)).rows[0].n
		).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// THE COOLDOWN, measured through the real endpoint.
// ---------------------------------------------------------------------------
describe('the cooldown, through the endpoint', () => {
	/** Fail the unit once, and hand back the reported cooldown. */
	async function failOnce(unit = '1', unitId = 'MDM-1') {
		const { questions, attemptId, truth } = await startAttempt(unit, unitId);
		const wrong = questions.map((q, i) => q.options.findIndex((_, k) => k !== truth[i].index));
		const r = await post({ action: 'submit', attemptId, answers: wrong }, { unit });
		expect(r.body.passed).toBe(false);
		return r.body.cooldownRemainingSec as number;
	}

	it('escalates 60/300/900/3600 and then holds, and refuses a start throughout', async () => {
		await db.sql(`delete from public.frc_quiz_attempts`);
		const reported: number[] = [];
		for (let n = 1; n <= 6; n++) {
			reported.push(await failOnce());
			expectCooldownAbout(reported[n - 1], FRC_QUIZ_COOLDOWNS_SEC[Math.min(n, 4) - 1]);
			// A start during the cooldown is refused, with the remaining time.
			const blocked = await post({ action: 'start' });
			expect(blocked.status, `after fail ${n}`).toBe(429);
			expect(blocked.body.reason).toBe('cooldown');
			expect(blocked.body.remainingSec as number).toBeGreaterThan(0);
			// Age the log past the cooldown so the next attempt can start. This is
			// the CLOCK moving, written to a column only the database sets.
			await backdate(student.id, 'MDM-1', 4000);
		}
		const cap = FRC_QUIZ_COOLDOWNS_SEC[FRC_QUIZ_COOLDOWNS_SEC.length - 1];
		expect(reported[reported.length - 1]).toBeLessThanOrEqual(cap + 2);
		for (let i = 1; i < reported.length; i++)
			expect(reported[i], `step ${i}`).toBeGreaterThanOrEqual(reported[i - 1]);
		await db.sql(`delete from public.frc_quiz_attempts`);
	});

	it('a start is allowed again once the cooldown has genuinely elapsed', async () => {
		await db.sql(`delete from public.frc_quiz_attempts`);
		expectCooldownAbout(await failOnce(), 60);
		expect((await post({ action: 'start' })).status).toBe(429);
		await backdate(student.id, 'MDM-1', 59);
		expect((await post({ action: 'start' })).status, 'one second short').toBe(429);
		await backdate(student.id, 'MDM-1', 2);
		expect((await post({ action: 'start' })).status, 'past the window').toBe(200);
		await db.sql(`delete from public.frc_quiz_attempts`);
	});

	it('a pass clears the streak, so the next fail starts at the first step again', async () => {
		await db.sql(`delete from public.frc_quiz_attempts`);
		await db.sql(`delete from public.frc_user_progress`);
		expectCooldownAbout(await failOnce(), 60);
		await backdate(student.id, 'MDM-1', 4000);
		expectCooldownAbout(await failOnce(), 300);
		await backdate(student.id, 'MDM-1', 4000);
		const win = await startAttempt();
		await post({ action: 'submit', attemptId: win.attemptId, answers: win.truth.map((t) => t.index) });
		await backdate(student.id, 'MDM-1', 4000);
		expectCooldownAbout(await failOnce(), 60);
		await db.sql(`delete from public.frc_quiz_attempts`);
		await db.sql(`delete from public.frc_user_progress`);
	});

	it('is per unit: failing one does not meter another', async () => {
		await db.sql(`delete from public.frc_quiz_attempts`);
		expectCooldownAbout(await failOnce('1', 'MDM-1'), 60);
		expect((await post({ action: 'start' }, { unit: '1' })).status).toBe(429);
		expect((await post({ action: 'start' }, { unit: '9' })).status, 'MDM-9 is unmetered').toBe(
			200
		);
		await db.sql(`delete from public.frc_quiz_attempts`);
	});

	it('a student cannot shorten it with anything they send', async () => {
		await db.sql(`delete from public.frc_quiz_attempts`);
		expectCooldownAbout(await failOnce(), 60);
		// Every field the response carries, sent back as a request field. None of
		// them is a parameter of anything on this path: the attempt log comes from
		// the store and the clock from the server, so a body key can only be
		// ignored.
		for (const extra of [
			{ remainingSec: 0 },
			{ cooldownRemainingSec: 0 },
			{ failStreak: 0 },
			{ nowMs: Date.now() + 86_400_000 },
			{ now: Date.now() + 86_400_000 },
			{ passed: true, score: 100 },
			{ unitId: 'MDM-9', unit_id: 'MDM-9' },
			{ userId: other.id, user_id: other.id, sub: other.id }
		]) {
			const r = await post({ action: 'start', ...extra });
			expect(r.status, JSON.stringify(extra)).toBe(429);
			expect(r.body.remainingSec as number, JSON.stringify(extra)).toBeGreaterThan(0);
		}
		// And no in-flight attempt was created by any of them.
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.frc_quiz_attempts where status = 'in_progress'`
		);
		expect(rows[0].n).toBe(0);
		await db.sql(`delete from public.frc_quiz_attempts`);
	});

	it('an abandoned in-flight attempt is not a fail and never meters anyone', async () => {
		await db.sql(`delete from public.frc_quiz_attempts`);
		// Starting twice replaces the in-flight attempt (0040 deletes the prior
		// one), so a student cannot bank a second live key for the same unit.
		const first = await startAttempt();
		const second = await startAttempt();
		expect(second.attemptId).not.toBe(first.attemptId);
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.frc_quiz_attempts`
		);
		expect(rows[0].n).toBe(1);
		// The abandoned one is gone, so submitting it is refused.
		expect((await post({ action: 'submit', attemptId: first.attemptId, answers: [0] })).status).toBe(
			409
		);
		await db.sql(`delete from public.frc_quiz_attempts`);
	});
});

// ---------------------------------------------------------------------------
// The route's unit and the attempt's unit are two different things. Pinned as
// BEHAVIOUR, because it is a client-supplied value the server does not
// re-derive -- see this bundle's history entry.
// ---------------------------------------------------------------------------
describe('the URL unit and the attempt unit', () => {
	it('grades and records against the ATTEMPT own unit, not the URL', async () => {
		await db.sql(`delete from public.frc_quiz_attempts`);
		await db.sql(`delete from public.frc_user_progress`);
		// Start under MDM-9 ...
		const nine = await startAttempt('9', 'MDM-9');
		// ... and submit through the MDM-1 URL.
		const r = await post(
			{ action: 'submit', attemptId: nine.attemptId, answers: nine.truth.map((t) => t.index) },
			{ unit: '1' }
		);
		expect(r.status).toBe(200);
		expect(r.body.passed).toBe(true);
		// 0041 reads unit_id off the attempt row, so the COMPLETION is MDM-9's --
		// the gate cannot be opened for a unit the student did not sit.
		expect(
			(await db.sql<{ unit_id: string }>(`select unit_id from public.frc_user_progress`)).rows
		).toEqual([{ unit_id: 'MDM-9' }]);
		await db.sql(`delete from public.frc_quiz_attempts`);
		await db.sql(`delete from public.frc_user_progress`);
	});

	it('but the FAIL response reports the URL unit COOLDOWN, which is the divergence', async () => {
		await db.sql(`delete from public.frc_quiz_attempts`);
		// Fail MDM-1 once and then age it past its own 60 second window, so MDM-1
		// carries a settled log and MDM-9 carries none.
		const one = await startAttempt('1', 'MDM-1');
		await post(
			{
				action: 'submit',
				attemptId: one.attemptId,
				answers: one.questions.map((q, i) => q.options.findIndex((_, k) => k !== one.truth[i].index))
			},
			{ unit: '1' }
		);
		await backdate(student.id, 'MDM-1', 4000);

		// Now fail an MDM-9 attempt THROUGH the MDM-1 url.
		const nine = await startAttempt('9', 'MDM-9');
		const r = await post(
			{
				action: 'submit',
				attemptId: nine.attemptId,
				answers: nine.questions.map((q, i) =>
					q.options.findIndex((_, k) => k !== nine.truth[i].index)
				)
			},
			{ unit: '1' }
		);
		expect(r.body.passed).toBe(false);

		// The attempt that was finalized really is MDM-9's: `submitQuiz` grades
		// through the attempt row, so nothing about the VERDICT followed the URL.
		const rows = await db.sql<{ unit_id: string; status: string }>(
			`select unit_id, status from public.frc_quiz_attempts
			 where status = 'failed' order by unit_id`
		);
		expect(rows.rows).toEqual([
			{ unit_id: 'MDM-1', status: 'failed' },
			{ unit_id: 'MDM-9', status: 'failed' }
		]);

		// But the cooldown handed back is recomputed over the URL unit's log, and
		// MDM-1's window has elapsed -- so the student is told there is NO cooldown
		// on a unit they just failed.
		expect(r.body.cooldownRemainingSec).toBe(0);

		// The GATE itself is unaffected, which is what makes this a reporting
		// defect rather than a bypass: a start on MDM-9 is still refused, and the
		// real remaining time is MDM-9's first step.
		const blocked = await post({ action: 'start' }, { unit: '9' });
		expect(blocked.status).toBe(429);
		expectCooldownAbout(blocked.body.remainingSec, 59);
		await db.sql(`delete from public.frc_quiz_attempts`);
		await db.sql(`delete from public.frc_user_progress`);
	});
});
