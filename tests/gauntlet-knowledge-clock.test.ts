// tests/gauntlet-knowledge-clock.test.ts
//
// 0148: the knowledge modes get a server-side clock.
//
// WHAT IS BEING PROVEN, and why each of these would otherwise regress silently.
// The defect 0148 closes is not visible from any surface: a knowledge board
// showing "0.00" reads as a very fast student, and a board full of them reads
// as a competitive class. Nothing on screen distinguishes a real time from a
// number the browser typed into the form, which is the whole reason this claim
// needs a test rather than a harness.
//
// THE PERMISSIVE CONTROLS ARE THREE SEPARATE DATABASES, NOT A MUTATED FILE.
//
//   BEFORE  the chain ending at 0147, which is production as it stands. Every
//           "the client's number is ignored" assertion is run against it first
//           and must FAIL there, so the detector is proven to bite rather than
//           merely found not to fire.
//   AFTER   the same chain with 0148 on top.
//   MUTANT  AFTER, plus a `create or replace` that removes ONE guard from the
//           shipped function. The mutant SQL is DERIVED from the real migration
//           text by a single string replacement whose anchor count is asserted,
//           never retyped: a body typed into a test characterizes what somebody
//           believed the migration said. Mutating in the PERMISSIVE direction
//           is what CLAUDE.md asks for -- a guard deleted outright fails closed
//           and reddens nothing.
//
// NOTHING HERE EDITS A FILE ON DISK, so there is no restore to get wrong.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestDb, createUser, type TestDb, type SeededUser } from './db/harness';

/** GAUNTLET's dependency chain, ending where production stands today. */
const CHAIN_0147 = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0004_gauntlet.sql',
	'0005_gauntlet_speedrun.sql',
	'0006_gauntlet_macro.sql',
	'0007_gauntlet_modeling_modes.sql',
	'0008_gauntlet_knowledge_modes.sql',
	'0009_gauntlet_authoring.sql',
	'0010_gauntlet_rooms.sql',
	'0015_gauntlet_speedrun_formalize.sql',
	'0016_gauntlet_speedrun_start.sql',
	'0017_gauntlet_run_status.sql',
	'0018_gauntlet_speedrun_units.sql',
	'0021_gauntlet_progression.sql',
	'0022_gauntlet_drawing_series.sql',
	'0023_gauntlet_reveal_focus_regions.sql',
	'0024_gauntlet_leaderboards.sql',
	'0026_gauntlet_material_gate.sql',
	'0027_gauntlet_material_density_gate.sql',
	'0028_gauntlet_room_code_and_host_play.sql',
	'0029_gauntlet_drop_tiers.sql',
	'0030_gauntlet_unit_system.sql',
	'0033_gauntlet_speedrun_attempts.sql',
	'0034_gauntlet_volume_only_verification.sql',
	'0035_gauntlet_run_events.sql',
	'0036_gauntlet_volume_tolerance_0_1.sql',
	'0061_gauntlet_target_disclosure.sql',
	'0137_anon_execute_sweep.sql',
	// 0146 is what the leaderboard assertions below read: it is the last applied
	// definition of `gauntlet_leaderboard`, and its knowledge branch (and the
	// `elapsed_ms` tiebreak this file cares about) is 0007's, carried forward.
	'0146_gauntlet_reveal_all_modeling_modes.sql',
	'0147_gauntlet_close_target_disclosure.sql'
] as const;

const FILE_0148 = '0148_gauntlet_knowledge_clock.sql';
const CHAIN_0148 = [...CHAIN_0147, FILE_0148] as const;

/**
 * THE WORLD AS IT WILL ACTUALLY STAND, and the reason this constant exists.
 *
 * This file was, for a while, the ONLY one of the twelve test files carrying
 * 0148 that did NOT also carry 0151 -- which is precisely why the rewind below
 * was invisible. 0151 redefines `gauntlet_submit` from a base of 0147, so on a
 * chain that has both, 0148's clock is simply gone: the knowledge branch goes
 * back to `greatest(coalesce(p_elapsed_ms, 0), 0)` and every assertion in this
 * file about a server-stamped clock would be describing a function nobody runs.
 *
 * SO EVERY PLAIN ASSERTION BELOW RUNS ON THIS CHAIN, not on `CHAIN_0148`. A
 * suite that detects a revert but never applies the reverting file is not a
 * suite, and moving the ten `seed()` calls is the whole of what closes that.
 *
 * `CHAIN_0148` SURVIVES FOR EXACTLY TWO USES, and both need 0148 to be the
 * LAST word on `gauntlet_submit`:
 *
 *   * the before/after pair, whose subject is what 0148 itself changed
 *     against 0147, and which says nothing about anything later;
 *   * the two MUTANTS, which `seed()` applies as extra SQL AFTER the chain.
 *     A mutated 0148 pasted over 0158 would put a body carrying no practice
 *     meter in front of the assertions -- the mutation proof would still pass
 *     and would silently have stopped describing the shipped function.
 *
 * 0150 rides along because 0151's own suite carries it. 0152 to 0155 are here
 * because they are what production will actually have between 0151 and 0158;
 * nothing in this file reads any of them.
 */
const FILE_0151 = '0151_gauntlet_meter_practice.sql';
const FILE_0158 = '0158_gauntlet_submit_reconcile.sql';
const CHAIN_TODAY = [
	...CHAIN_0148,
	'0150_gauntlet_connect_run_analysis.sql',
	FILE_0151,
	'0152_gauntlet_run_review.sql',
	'0153_gauntlet_unpublish_the_target.sql',
	'0154_gauntlet_rank_what_is_checkable.sql',
	'0155_gauntlet_authoring_tier.sql',
	FILE_0158
] as const;

/**
 * The same world ONE FILE SHORT of the reconciliation: the rewind, kept so it
 * can be asserted rather than described.
 *
 * DERIVED BY TRUNCATING AT THE NAMED FILE, never by `CHAIN_TODAY.slice(0, -1)`.
 * That spelling means "without 0158" only while 0158 happens to be last, so
 * appending anything to `CHAIN_TODAY` would silently turn this control into
 * "with 0158, without whatever is newest" -- and it would keep passing, because
 * the thing it asserts absent arrives at 0158 either way. The identical defect
 * was found and fixed in `gauntlet-practice-meter.test.ts` and in
 * `gauntlet-run-review-route.test.ts`; this is the shape that does not have it.
 */
const CHAIN_REWOUND = CHAIN_TODAY.slice(
	0,
	CHAIN_TODAY.indexOf(FILE_0158)
) as unknown as string[];

// `indexOf` returning -1 would make the slice above the WHOLE chain, so the
// control would quietly become a duplicate of CHAIN_TODAY and assert the
// opposite of its own name.
if (!CHAIN_TODAY.includes(FILE_0158)) {
	throw new Error('CHAIN_REWOUND cannot be derived: 0158 is not on CHAIN_TODAY.');
}

const migrationText = (file: string) =>
	readFileSync(join(process.cwd(), 'supabase', 'migrations', file), 'utf8');

/**
 * A permissive mutant of the SHIPPED migration, built by one replacement.
 *
 * Returns SQL that re-creates the affected function with a guard removed. It is
 * applied on top of a fully-migrated database, so everything else about the
 * world is the real thing.
 */
function mutate(anchor: string, replacement: string): string {
	const text = migrationText(FILE_0148);
	const hits = text.split(anchor).length - 1;
	if (hits !== 1) {
		throw new Error(
			`mutation anchor matched ${hits} times, expected exactly 1. The migration moved; ` +
				`fix the anchor rather than the count, or this proof stops proving anything.`
		);
	}
	return text.replace(anchor, replacement);
}

/**
 * MUTATION 1: the submit stops REFUSING a missing start row and falls back to
 * "the clock started now", which is the shape somebody reaches for when the
 * refusal looks unfriendly. It scores every unstarted submit at zero.
 */
const ANCHOR_REFUSAL =
	`\t\tif not found then\n` +
	`\t\t\traise exception 'This question was not started on this device, so there is no timer to score it against. Reload the page and answer it again.';\n` +
	`\t\tend if;\n`;
const MUTANT_NO_REFUSAL = `\t\tif not found then\n\t\t\tv_start.started_at := now();\n\t\tend if;\n`;

/**
 * MUTATION 2: the start's `where` clause goes, so every start restarts the
 * clock. This is 0147's `do nothing` swung the other way, and it is the repair
 * this file's header calls the trap in the obvious fix.
 */
const ANCHOR_RESTART_GUARD =
	`\t\tset started_at = now()\n` +
	`\t\twhere public.gauntlet_knowledge_starts.answered_at is null\n` +
	`\t\t\tand public.gauntlet_knowledge_starts.started_at\n` +
	`\t\t\t\t< now() - public._gauntlet_knowledge_window();\n`;
const MUTANT_ALWAYS_RESTART = `\t\tset started_at = now();\n`;

// ---------------------------------------------------------------------------
// The fixture. A published multiple-choice question with a known key.
// ---------------------------------------------------------------------------
const CORRECT = 'c';
const WRONG = 'a';

interface World {
	db: TestDb;
	student: SeededUser;
	other: SeededUser;
	challengeId: string;
	/** A published MODELING challenge, for the not-a-knowledge-mode refusal. */
	modelingId: string;
}

async function seed(chain: readonly string[], extraSql?: string): Promise<World> {
	const db = await startTestDb([...chain]);
	if (extraSql) await db.sql(extraSql);
	const student = await createUser(db, 'reader@boscotech.net', 'Reader One');
	const other = await createUser(db, 'second@boscotech.net', 'Reader Two');

	const knowledge = await db.sql<{ id: string }>(
		// `published` is DERIVED from `status` by 0009's trigger, so the boolean
		// cannot be set directly.
		`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
		 values ('drawing_reading', 'Clock Fixture', 2, $1::jsonb, $2::jsonb, 'published')
		 returning id`,
		[
			JSON.stringify({
				question: 'Which view is the section?',
				options: [
					{ id: 'a', label: 'Top' },
					{ id: 'b', label: 'Front' },
					{ id: 'c', label: 'Section A-A' }
				]
			}),
			JSON.stringify({ type: 'choice', correct: CORRECT, explanation: 'A-A is hatched.' })
		]
	);

	const modeling = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
		 values ('speedrun', 'Not A Question', 2, $1::jsonb, $2::jsonb, 'published')
		 returning id`,
		[
			JSON.stringify({ material: 'Aluminum 6061', density: 2.7, target_mass: 216, tolerance_pct: 2 }),
			JSON.stringify({ target_volume_mm3: 80000, density: 2.7, tolerance_pct: 2 })
		]
	);

	return {
		db,
		student,
		other,
		challengeId: knowledge.rows[0].id,
		modelingId: modeling.rows[0].id
	};
}

// --- the calls a browser actually makes, through the real RPCs ---------------

interface SubmitResult {
	is_correct: boolean;
	correct: string | null;
	explanation: string | null;
	score_metric: number;
	timed_attempt?: boolean;
}

const submit = (w: World, answer: string, clientElapsedMs: number, who?: string) =>
	w.db.asUser(who ?? w.student.id, async (q) => {
		const { rows } = await q<{ r: SubmitResult }>(
			`select public.gauntlet_submit($1::uuid, $2::jsonb, $3::integer) as r`,
			[w.challengeId, JSON.stringify({ answer }), clientElapsedMs]
		);
		return rows[0].r;
	});

interface StartResult {
	ok: boolean;
	started_at: string;
	restarted: boolean;
	timed: boolean;
}

const start = (w: World, who?: string, challengeId?: string) =>
	w.db.asUser(who ?? w.student.id, async (q) => {
		const { rows } = await q<{ r: StartResult }>(
			`select public.gauntlet_knowledge_start($1::uuid) as r`,
			[challengeId ?? w.challengeId]
		);
		return rows[0].r;
	});

/** Move an attempt's clock back, as the owner. Seeding, not the thing tested. */
const backdate = (w: World, interval: string, who?: string) =>
	w.db.sql(
		`update public.gauntlet_knowledge_starts set started_at = now() - $1::interval
		 where user_id = $2 and challenge_id = $3`,
		[interval, who ?? w.student.id, w.challengeId]
	);

const attemptRow = async (w: World, who?: string) => {
	const { rows } = await w.db.sql<{ started_at: Date; answered_at: Date | null }>(
		`select started_at, answered_at from public.gauntlet_knowledge_starts
		 where user_id = $1 and challenge_id = $2`,
		[who ?? w.student.id, w.challengeId]
	);
	return rows[0] ?? null;
};

/** The row `gauntlet_leaderboard` would show this student, read as they read it. */
const boardRow = (w: World, who?: string) =>
	w.db.asUser(who ?? w.student.id, async (q) => {
		const { rows } = await q<{ score_metric: string | null; is_correct: boolean; rank: string }>(
			`select score_metric, is_correct, rank from public.gauntlet_leaderboard
			 where challenge_id = $1 and user_id = $2`,
			[w.challengeId, who ?? w.student.id]
		);
		return rows[0] ?? null;
	});

/** Every submission this student has, oldest first, with the stored value blob. */
const submissions = async (w: World, who?: string) => {
	const { rows } = await w.db.sql<{
		score_metric: string | null;
		is_correct: boolean;
		value: Record<string, unknown>;
	}>(
		`select score_metric, is_correct, value from public.submissions
		 where user_id = $1 and challenge_id = $2 order by created_at asc, id asc`,
		[who ?? w.student.id, w.challengeId]
	);
	return rows;
};

let before: World;
let after: World;
let mutantNoRefusal: World;
let mutantAlwaysRestart: World;

beforeAll(async () => {
	// SEQUENTIALLY, never Promise.all: every database here lives on one shared
	// cluster and the stub's `create role ... if not exists` guards race each
	// other across concurrent connections (CLAUDE.md, the parallelism trap).
	before = await seed(CHAIN_0147);
	after = await seed(CHAIN_0148);
	mutantNoRefusal = await seed(
		CHAIN_0148,
		mutate(ANCHOR_REFUSAL, MUTANT_NO_REFUSAL)
	);
	mutantAlwaysRestart = await seed(
		CHAIN_0148,
		mutate(ANCHOR_RESTART_GUARD, MUTANT_ALWAYS_RESTART)
	);
}, 300_000);

afterAll(async () => {
	await before?.db.stop();
	await after?.db.stop();
	await mutantNoRefusal?.db.stop();
	await mutantAlwaysRestart?.db.stop();
});

// ---------------------------------------------------------------------------
describe('the clock is the server\'s, not the form\'s', () => {
	it('BEFORE 0148 the client owns score_metric outright (the permissive control)', async () => {
		const r = await submit(before, CORRECT, 0);
		expect(r.is_correct).toBe(true);
		// This is the defect, asserted as a fact about production rather than
		// described: a passing knowledge submit claiming zero milliseconds is
		// recorded as a zero-second run.
		expect(Number(r.score_metric)).toBe(0);
		const [row] = await submissions(before);
		expect(row.value.elapsed_ms).toBe(0);
		// ...and zero is rank one.
		const board = await boardRow(before);
		expect(Number(board.score_metric)).toBe(0);
		expect(Number(board.rank)).toBe(1);
	});

	it('AFTER 0148 the same call is scored on the server clock and the claim is ignored', async () => {
		await start(after);
		await backdate(after, '45 seconds');
		const r = await submit(after, CORRECT, 0);

		expect(r.is_correct).toBe(true);
		// 45s, give or take the time the statements themselves take.
		expect(Number(r.score_metric)).toBeGreaterThanOrEqual(44);
		expect(Number(r.score_metric)).toBeLessThan(50);

		const [row] = await submissions(after);
		// The VIEW'S TIEBREAK reads `value.elapsed_ms`. If only score_metric had
		// moved, this would still be the browser's 0 and the board would still be
		// ranking on it.
		expect(Number(row.value.elapsed_ms)).toBeGreaterThanOrEqual(44_000);
		expect(row.value.clock).toBe('server');
		// The forged number is KEPT as evidence rather than discarded.
		expect(row.value.client_elapsed_ms).toBe(0);
	});

	it('a wildly large client claim is ignored in the other direction too', async () => {
		const w = after;
		await w.db.asUser(w.other.id, async (q) => {
			await q(`select public.gauntlet_knowledge_start($1::uuid)`, [w.challengeId]);
		});
		const r = await submit(w, WRONG, 999_999_999, w.other.id);
		// Seconds, not the ~11.5 days the caller claimed.
		expect(Number(r.score_metric)).toBeLessThan(60);
	});
});

// ---------------------------------------------------------------------------
describe('a submit with no start is refused, and says what to do', () => {
	it('refuses, and names the action', async () => {
		const w = await seed(CHAIN_TODAY);
		try {
			await expect(submit(w, CORRECT, 0)).rejects.toThrow(/not started on this device/i);
			// The refusal names the ACTION, because the honest way to reach it is a
			// stale tab and a student told only that something is wrong presses the
			// same button again.
			await expect(submit(w, CORRECT, 0)).rejects.toThrow(/Reload the page/i);
			// And it records NOTHING: a refused submit is not an attempt.
			expect(await submissions(w)).toHaveLength(0);
		} finally {
			await w.db.stop();
		}
	});

	it('POSITIVE CONTROL: the identical call succeeds once the question is started', async () => {
		const w = await seed(CHAIN_TODAY);
		try {
			await start(w);
			const r = await submit(w, CORRECT, 0);
			expect(r.is_correct).toBe(true);
			expect(await submissions(w)).toHaveLength(1);
		} finally {
			await w.db.stop();
		}
	});

	it('MUTATION: a submit that falls back to "started now" instead of refusing scores zero', async () => {
		const r = await submit(mutantNoRefusal, CORRECT, 0);
		expect(r.is_correct).toBe(true);
		// The refusal is what stands between an unstarted submit and a 0.00 board
		// row. With it removed the exploit is back, which is what proves the
		// assertions above are load-bearing rather than incidentally true.
		expect(Number(r.score_metric)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
describe('what a SECOND start does: the decision, in all three cases', () => {
	it('UNANSWERED and FRESH: the first start stands (reload-before-answering buys nothing)', async () => {
		const w = await seed(CHAIN_TODAY);
		try {
			const first = await start(w);
			const again = await start(w);
			expect(again.restarted).toBe(false);
			expect(again.started_at).toBe(first.started_at);
			expect(again.timed).toBe(true);
		} finally {
			await w.db.stop();
		}
	});

	it('UNANSWERED and STALE: the clock restarts, so an abandoned tab is not a life sentence', async () => {
		const w = await seed(CHAIN_TODAY);
		try {
			const first = await start(w);
			// Past the 30 minute window: the student closed the tab and came back.
			await backdate(w, '31 minutes');
			const again = await start(w);
			expect(again.restarted).toBe(true);
			expect(new Date(again.started_at).getTime()).toBeGreaterThan(
				new Date(first.started_at).getTime()
			);
			// And the honest time they then post is their real one.
			const r = await submit(w, CORRECT, 0);
			expect(Number(r.score_metric)).toBeLessThan(60);
		} finally {
			await w.db.stop();
		}
	});

	it('just INSIDE the window is not stale, so the boundary is the window and not "a while"', async () => {
		const w = await seed(CHAIN_TODAY);
		try {
			await start(w);
			await backdate(w, '29 minutes');
			// The BACKDATED stamp is what a second start is deciding about, so it
			// is what the comparison is against: the pre-backdate value is not in
			// the table any more.
			const stale = (await attemptRow(w)).started_at.getTime();
			const again = await start(w);
			expect(again.restarted).toBe(false);
			expect(new Date(again.started_at).getTime()).toBe(stale);
		} finally {
			await w.db.stop();
		}
	});

	it('ANSWERED: the clock is closed forever, at any age', async () => {
		const w = await seed(CHAIN_TODAY);
		try {
			await start(w);
			await backdate(w, '40 seconds');
			const first = await submit(w, WRONG, 0);
			expect(first.timed_attempt).toBe(true);
			// The answer key is still returned on a miss: that is the teaching, and
			// with a working clock reading it no longer buys a time.
			expect(first.correct).toBe(CORRECT);

			const row = await attemptRow(w);
			expect(row.answered_at).not.toBeNull();
			const closedAt = row.started_at.getTime();

			// A day later, well past the window, the student comes back.
			await backdate(w, '1 day');
			const again = await start(w);
			expect(again.restarted).toBe(false);
			expect(again.timed).toBe(false);
			expect(new Date(again.started_at).getTime()).toBeLessThan(closedAt);
		} finally {
			await w.db.stop();
		}
	});

	it('so the read-the-key-and-resubmit loop costs the whole detour', async () => {
		const w = await seed(CHAIN_TODAY);
		try {
			await start(w);
			// Two seconds in, submit garbage to read the key off the refusal.
			await backdate(w, '2 seconds');
			const miss = await submit(w, WRONG, 0);
			expect(miss.is_correct).toBe(false);
			expect(miss.correct).toBe(CORRECT);

			// Detour through the answer key, then restart and resubmit with a
			// claimed zero. This is the exact sequence 0147 section 6 describes.
			await backdate(w, '20 minutes');
			await start(w);
			const win = await submit(w, CORRECT, 0);

			expect(win.is_correct).toBe(true);
			expect(win.timed_attempt).toBe(false);
			// The whole detour, not the two seconds they chose. ACCRUAL -- charging
			// attempt one plus attempt two -- would have scored this ~2s, which is
			// why 0148 freezes instead. See the migration header.
			expect(Number(win.score_metric)).toBeGreaterThan(1000);

			const board = await boardRow(w);
			expect(board.is_correct).toBe(true);
			// They CLEAR it, which is the point of still allowing the submit, and
			// they do not top the board with it.
			expect(Number(board.score_metric)).toBeGreaterThan(1000);
		} finally {
			await w.db.stop();
		}
	});

	it('MUTATION: an unconditional restart hands both cases straight back', async () => {
		const w = mutantAlwaysRestart;
		// Case 2 (fresh) reddens: reload-before-answering resets the clock.
		const first = await start(w);
		const again = await start(w);
		expect(again.restarted).toBe(true);
		expect(again.started_at).not.toBe(first.started_at);

		// Case 3 (answered) reddens: the resubmit loop scores ~0 again.
		await backdate(w, '5 minutes');
		await submit(w, WRONG, 0);
		await start(w);
		const win = await submit(w, CORRECT, 0);
		expect(win.is_correct).toBe(true);
		expect(Number(win.score_metric)).toBeLessThan(5);
	});
});

// ---------------------------------------------------------------------------
describe('the attempt table is closed to every client', () => {
	it('a signed-in student cannot select it, and cannot write it', async () => {
		const w = after;
		await w.db.asUser(w.student.id, async (q) => {
			await expect(
				q(`select * from public.gauntlet_knowledge_starts`)
			).rejects.toThrow(/permission denied/i);
			await expect(
				q(`insert into public.gauntlet_knowledge_starts (user_id, challenge_id) values ($1, $2)`, [
					w.student.id,
					w.challengeId
				])
			).rejects.toThrow(/permission denied/i);
			await expect(
				q(`update public.gauntlet_knowledge_starts set started_at = now()`)
			).rejects.toThrow(/permission denied/i);
		});
	});

	it('anon reaches neither the table nor the start RPC', async () => {
		const w = after;
		await w.db.asAnon(async (q) => {
			await expect(
				q(`select * from public.gauntlet_knowledge_starts`)
			).rejects.toThrow(/permission denied/i);
			await expect(
				q(`select public.gauntlet_knowledge_start($1::uuid)`, [w.challengeId])
			).rejects.toThrow(/permission denied/i);
		});
	});

	it('the window helper is private, and RLS is on with no policy', async () => {
		const { rows } = await after.db.sql<{
			anon: boolean;
			authed: boolean;
			svc: boolean;
			rls: boolean;
			policies: string;
		}>(
			`select
				has_function_privilege('anon', 'public._gauntlet_knowledge_window()', 'execute') as anon,
				has_function_privilege('authenticated', 'public._gauntlet_knowledge_window()', 'execute') as authed,
				has_function_privilege('service_role', 'public._gauntlet_knowledge_window()', 'execute') as svc,
				(select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
				 where n.nspname = 'public' and c.relname = 'gauntlet_knowledge_starts') as rls,
				(select count(*) from pg_policies where schemaname = 'public'
				 and tablename = 'gauntlet_knowledge_starts')::text as policies`
		);
		expect(rows[0].anon).toBe(false);
		expect(rows[0].authed).toBe(false);
		expect(rows[0].svc).toBe(false);
		// Two independent refusals: either one alone denies every select.
		expect(rows[0].rls).toBe(true);
		expect(rows[0].policies).toBe('0');
	});
});

// ---------------------------------------------------------------------------
describe('the start RPC applies the same gates the submit does', () => {
	it('refuses a modeling challenge: those time from a run token, not from here', async () => {
		const w = after;
		await expect(start(w, w.student.id, w.modelingId)).rejects.toThrow(/not a knowledge challenge/i);
	});

	it('refuses an unknown challenge', async () => {
		const w = after;
		await expect(
			start(w, w.student.id, '00000000-0000-0000-0000-000000000000')
		).rejects.toThrow(/challenge not found/i);
	});

	it('refuses an unpublished challenge to a student and allows it to a teacher', async () => {
		const w = await seed(CHAIN_TODAY);
		try {
			const teacher = await createUser(w.db, 'staff@boscotech.edu', 'Staff One');
			const draft = await w.db.sql<{ id: string }>(
				`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
				 values ('gdt_tolerance', 'Draft', 1, '{}'::jsonb, $1::jsonb, 'draft') returning id`,
				[JSON.stringify({ type: 'choice', correct: 'b' })]
			);
			await expect(start(w, w.student.id, draft.rows[0].id)).rejects.toThrow(/not available/i);
			// `is_teacher()` returns is_admin() since 0067, so this is the ADMIN
			// gate under its historical name, exactly as gauntlet_submit reads it.
			await w.db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
				teacher.email.toLowerCase()
			]);
			const r = await start(w, teacher.id, draft.rows[0].id);
			expect(r.ok).toBe(true);
		} finally {
			await w.db.stop();
		}
	});

	it('one student\'s clock is not another\'s', async () => {
		const w = await seed(CHAIN_TODAY);
		try {
			await start(w, w.student.id);
			await backdate(w, '10 minutes', w.student.id);
			await start(w, w.other.id);

			const slow = await submit(w, CORRECT, 0, w.student.id);
			const quick = await submit(w, CORRECT, 0, w.other.id);
			expect(Number(slow.score_metric)).toBeGreaterThan(500);
			expect(Number(quick.score_metric)).toBeLessThan(60);
		} finally {
			await w.db.stop();
		}
	});
});

// ---------------------------------------------------------------------------
describe('nothing else about gauntlet_submit moved', () => {
	it('the Speedrun practice branch still grades and still needs no start row', async () => {
		const w = after;
		const r = await w.db.asUser(w.student.id, async (q) => {
			const { rows } = await q<{ r: Record<string, unknown> }>(
				`select public.gauntlet_submit($1::uuid, $2::jsonb, $3::integer) as r`,
				[w.modelingId, JSON.stringify({ mass: 216 }), 12_000]
			);
			return rows[0].r;
		});
		expect(r.mode).toBe('speedrun');
		expect(r.is_correct).toBe(true);
		// The modeling path is untouched, so its clock is still the caller's.
		expect(Number(r.score_metric)).toBe(12);
		// And 0147's disclosure closure still holds on it.
		expect(r).not.toHaveProperty('target_mass');
		expect(r).not.toHaveProperty('tolerance_pct');
	});

	it('exactly one arity of each function, so no old overload survives', async () => {
		const { rows } = await after.db.sql<{ proname: string; n: string }>(
			`select proname, count(*)::text as n from pg_proc p
			 join pg_namespace ns on ns.oid = p.pronamespace
			 where ns.nspname = 'public' and proname in ('gauntlet_submit', 'gauntlet_knowledge_start')
			 group by proname order by proname`
		);
		expect(rows).toEqual([
			{ proname: 'gauntlet_knowledge_start', n: '1' },
			{ proname: 'gauntlet_submit', n: '1' }
		]);
	});

	it('re-applying 0148 over an already-migrated database is a no-op', async () => {
		const w = await seed(CHAIN_TODAY);
		try {
			await start(w);
			const stampBefore = (await attemptRow(w)).started_at.getTime();
			// Re-pasting a migration is ordinary. It must not drop the table, reset
			// a clock, or fail on the second run.
			await w.db.sql(migrationText(FILE_0148));
			expect((await attemptRow(w)).started_at.getTime()).toBe(stampBefore);
			const r = await submit(w, CORRECT, 0);
			expect(r.is_correct).toBe(true);
		} finally {
			await w.db.stop();
		}
	});
});


// ---------------------------------------------------------------------------
// THE CHAIN THIS FILE USED TO STOP SHORT OF
// ---------------------------------------------------------------------------
describe('the clock survives the rest of the chain, which it did not before 0158', () => {
	it('IS REWOUND by 0151 alone -- the positive control on why 0158 exists', async () => {
		// THE FINDING, PINNED SO IT CANNOT COME BACK QUIETLY. On 0148 + 0151 with
		// no 0158, `gauntlet_submit` no longer reads the start table at all: 0151
		// was written as a diff against 0147 and its `create or replace` drops
		// 0148's whole knowledge branch.
		//
		// This asserts the BROKEN world deliberately. Without it, the tests below
		// would prove only that the clock works on a chain carrying 0158, and
		// nothing would say that the chain WITHOUT it is the state production is
		// one hand-applied migration away from.
		const w = await seed(CHAIN_REWOUND);
		try {
			const { rows } = await w.db.sql<{ reads_starts: boolean }>(
				`select p.prosrc like '%gauntlet_knowledge_starts%' as reads_starts
				   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = 'gauntlet_submit'`
			);
			expect(rows[0].reads_starts).toBe(false);

			// AND THE CONSEQUENCE, behaviourally rather than from the catalog: a
			// submit with NO start row is accepted, and the client's number is
			// scored again. This is the exact shape that fills a board with 0.00
			// rows, because the deployed client omits the parameter entirely once
			// its start call has succeeded.
			const r = await submit(w, CORRECT, 4000);
			expect(r.score_metric).toBe(4);

			const omitted = await w.db.asUser(w.other.id, async (q) => {
				const { rows: o } = await q<{ r: SubmitResult }>(
					`select public.gauntlet_submit($1::uuid, $2::jsonb) as r`,
					[w.challengeId, JSON.stringify({ answer: CORRECT })]
				);
				return o[0].r;
			});
			// ZERO. This is the production defect, reproduced.
			expect(omitted.score_metric).toBe(0);
		} finally {
			await w.db.stop();
		}
	});

	it('is restored by 0158: the refusal, the server stamp and the evidence all hold', async () => {
		const w = await seed(CHAIN_TODAY);
		try {
			// 1. THE REFUSAL. Byte-identical to 0148's, because a student who has
			//    met this sentence before must not read a new one now.
			await expect(submit(w, CORRECT, 0)).rejects.toThrow(
				/was not started on this device/
			);

			// 2. THE SERVER STAMP, with the client claiming something absurd.
			await start(w);
			await backdate(w, '9 seconds');
			const r = await submit(w, CORRECT, 999_999);
			expect(r.score_metric).toBeGreaterThanOrEqual(9);
			expect(r.score_metric).toBeLessThan(11);
			expect(r.timed_attempt).toBe(true);

			// 3. THE EVIDENCE. The browser's number is kept, never scored.
			const { rows } = await w.db.sql<{ value: Record<string, unknown> }>(
				`select value from public.submissions where user_id = $1 and challenge_id = $2`,
				[w.student.id, w.challengeId]
			);
			expect(rows[0].value.clock).toBe('server');
			expect(rows[0].value.client_elapsed_ms).toBe(999_999);
			expect(Number(rows[0].value.elapsed_ms)).toBeGreaterThanOrEqual(9000);

			// 4. THE CLOCK CLOSES, so a later review attempt is not a second
			//    ranked run. 0148's `coalesce(answered_at, now())`.
			expect((await attemptRow(w)).answered_at).not.toBeNull();
			const again = await submit(w, CORRECT, 0);
			expect(again.timed_attempt).toBe(false);
		} finally {
			await w.db.stop();
		}
	});

	it('and 0151\'s practice meter is still there beside it, on the same body', async () => {
		// The other half of the reconciliation. If 0158 had been built by simply
		// re-applying 0148 -- the obvious repair -- this would redden, and the
		// board would be correct while the free pass/fail oracle was unmetered
		// again. Both halves or neither.
		const w = await seed(CHAIN_TODAY);
		try {
			const { rows } = await w.db.sql<{ meters: boolean; clocks: boolean }>(
				`select p.prosrc like '%_gauntlet_practice_min_interval%' as meters,
				        p.prosrc like '%gauntlet_knowledge_starts%' as clocks
				   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = 'gauntlet_submit'`
			);
			expect(rows[0]).toEqual({ meters: true, clocks: true });

			// Behaviourally, on the modeling challenge this fixture already seeds:
			// two practice checks back to back, the second refused by the floor.
			const check = () =>
				w.db.asUser(w.student.id, (q) =>
					q(`select public.gauntlet_submit($1::uuid, jsonb_build_object('mass', '150.25')) as r`, [
						w.modelingId
					])
				);
			await expect(check()).resolves.toBeDefined();
			await expect(check()).rejects.toThrow(/checked this part a moment ago/);
		} finally {
			await w.db.stop();
		}
	});

	it('leaves exactly one gauntlet_submit overload on the full chain', async () => {
		const w = await seed(CHAIN_TODAY);
		try {
			const { rows } = await w.db.sql<{ n: string }>(
				`select count(*)::text as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = 'gauntlet_submit'`
			);
			expect(Number(rows[0].n)).toBe(1);
		} finally {
			await w.db.stop();
		}
	});
});
