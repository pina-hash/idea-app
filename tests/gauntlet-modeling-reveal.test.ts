// tests/gauntlet-modeling-reveal.test.ts
//
// 0146: Reverse Engineer and Feature Golf can start again, and neither reaches
// the global board.
//
// WHY THIS IS AUTOMATED AT ALL, given CLAUDE.md's "automated tests are the
// exception". Both halves regress SILENTLY. The gate is the case in the
// repository's own history: 0015 narrowed it to 'speedrun' as collateral while
// adding a field, its header never mentioned doing so, 0023 copied the
// narrowing forward, and two shipped modes were unstartable for thirty
// migrations with nothing anywhere reporting it -- the routes render, the pages
// load, and the failure is one exception raised inside a click handler. The
// board exclusion is worse: a mode wrongly restored to `gauntlet_leaderboard`
// looks completely normal until somebody notices the top of a board is held by
// `p_feature_count => 1`.
//
// THE CHAIN. GAUNTLET's own migrations plus the profiles/admin ones the views
// and the reveal read through, then 0137, then 0146 -- which is the real apply
// order: 0137 is a sweep over whatever exists, and 0146 is applied by hand
// after it (so it names its own grants rather than relying on the sweep).

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

const CHAIN = [
	'0001_profiles.sql',
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
	'0020_profiles_identity.sql',
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
	'0038_profile_pathway.sql',
	'0060_gauntlet_view_scoping.sql',
	'0061_gauntlet_target_disclosure.sql',
	'0067_admin_tier.sql',
	'0137_anon_execute_sweep.sql',
	'0146_gauntlet_reveal_all_modeling_modes.sql'
] as const;

let db: TestDb;
let player: SeededUser;
let other: SeededUser;

/** The three modeling modes, and the three knowledge modes the gate must refuse. */
const MODELING = ['speedrun', 'reverse_engineer', 'feature_golf'] as const;
const KNOWLEDGE = ['drawing_reading', 'gdt_tolerance', 'spot_the_error'] as const;

const challengeIds = new Map<string, string>();

/**
 * A published challenge per mode, inserted directly rather than through
 * `gauntlet_upsert_challenge`: the point here is the reveal gate and the board,
 * and the authoring RPC's publish blocker would make every seed carry a full
 * modeling payload it does not need. The two modeling fields the ranked path
 * DOES read (target_volume_mm3, tolerance_pct) are real.
 *
 * `published` is NOT written: 0009's `challenges_sync_published` trigger derives
 * it from `status` on every insert and update, so setting the boolean directly
 * is silently overwritten (which is how this seed was wrong first time round).
 */
async function seedChallenges() {
	for (const mode of [...MODELING, ...KNOWLEDGE]) {
		const answer =
			mode === 'reverse_engineer'
				? { target_volume_mm3: 80000, target_surface_area_mm2: 12000, tolerance_pct: 0.1, density: 2.7 }
				: MODELING.includes(mode as (typeof MODELING)[number])
					? { target_volume_mm3: 80000, tolerance_pct: 0.1, density: 2.7, drawing: '<svg/>' }
					: { correct: 'a' };
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, status, prompt, answer)
			 values ($1::public.gauntlet_mode, $2, 2, 'published', '{}'::jsonb, $3::jsonb)
			 returning id`,
			[mode, `Seed ${mode}`, JSON.stringify(answer)]
		);
		challengeIds.set(mode, rows[0].id);
	}
}

/** The real reveal RPC, called the way ModelingRun.svelte calls it. */
async function reveal(user: SeededUser, mode: string) {
	return db.asUser(user.id, (q) =>
		q<{ gauntlet_speedrun_reveal: { code: string } }>(
			`select public.gauntlet_speedrun_reveal($1::uuid)`,
			[challengeIds.get(mode)!]
		)
	);
}

/**
 * A passing macro submission, written the way `gauntlet_macro_submit` writes
 * one. Inserted directly because this file is about the BOARD, not about the
 * submit: driving the real RPC would need a started run token per row and would
 * make the exclusion assertions depend on the whole timing path.
 */
async function seedPassingRun(user: SeededUser, mode: string, score: number, elapsedMs = 1000) {
	await db.sql(
		`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source)
		 values ($1::uuid, $2::uuid, $3::public.gauntlet_mode, jsonb_build_object('elapsed_ms', $4::bigint), true, $5, 'macro')`,
		[user.id, challengeIds.get(mode)!, mode, elapsedMs, score]
	);
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	player = await createUser(db, 'player@boscotech.net', 'Player One');
	other = await createUser(db, 'rival@boscotech.net', 'Rival Two');
	await seedChallenges();
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('gauntlet_speedrun_reveal: the gate admits the modeling family', () => {
	it.each(MODELING)('mints a run token for %s', async (mode) => {
		const { rows } = await reveal(player, mode);
		const payload = rows[0].gauntlet_speedrun_reveal;
		expect(payload.code).toMatch(/^[A-Z0-9]+$/);

		const { rows: tokens } = await db.sql<{ n: string }>(
			`select count(*) as n from public.gauntlet_run_tokens
			  where user_id = $1::uuid and challenge_id = $2::uuid`,
			[player.id, challengeIds.get(mode)!]
		);
		expect(Number(tokens[0].n)).toBeGreaterThan(0);
	});

	// The NEGATIVE half, and it is the reason the gate is an allowlist rather
	// than being deleted: a knowledge challenge is scored by `gauntlet_submit`,
	// which has no token in it, and `gauntlet_macro_submit` has no score branch
	// for those modes -- it would raise 'This mode is not macro-scored.' AFTER
	// the token had been spent.
	it.each(KNOWLEDGE)('refuses %s, and mints nothing', async (mode) => {
		await expect(reveal(player, mode)).rejects.toThrow(/Not a modeling challenge/);

		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from public.gauntlet_run_tokens where challenge_id = $1::uuid`,
			[challengeIds.get(mode)!]
		);
		expect(Number(rows[0].n)).toBe(0);
	});

	it('still refuses a signed-out caller', async () => {
		await expect(
			db.asAnon((q) =>
				q(`select public.gauntlet_speedrun_reveal($1::uuid)`, [challengeIds.get('speedrun')!])
			)
		).rejects.toThrow();
	});

	it('is executable by authenticated and not by anon', async () => {
		const { rows } = await db.sql<{ auth: boolean; anon: boolean }>(
			`select has_function_privilege('authenticated', 'public.gauntlet_speedrun_reveal(uuid)', 'execute') as auth,
			        has_function_privilege('anon', 'public.gauntlet_speedrun_reveal(uuid)', 'execute') as anon`
		);
		expect(rows[0].auth).toBe(true);
		expect(rows[0].anon).toBe(false);
	});
});

describe('gauntlet_leaderboard: ranks only what the server can check', () => {
	beforeAll(async () => {
		// One passing macro run per modeling mode, for two different players, so
		// the board has something to rank if it is going to.
		for (const mode of MODELING) {
			await seedPassingRun(player, mode, 12.5, 12_500);
			await seedPassingRun(other, mode, 30.0, 30_000);
		}
		// A knowledge submission, which reaches the board by the OTHER branch of
		// the view's WHERE and must be unaffected by this change.
		await db.sql(
			`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source)
			 values ($1::uuid, $2::uuid, 'drawing_reading', '{}'::jsonb, true, 4, 'manual')`,
			[player.id, challengeIds.get('drawing_reading')!]
		);
	});

	async function boardRows(mode: string) {
		const { rows } = await db.asUser(player.id, (q) =>
			q<{ user_id: string; rank: number; score_metric: string | null }>(
				`select user_id, rank, score_metric from public.gauntlet_leaderboard
				  where challenge_id = $1::uuid order by rank`,
				[challengeIds.get(mode)!]
			)
		);
		return rows;
	}

	// POSITIVE CONTROLS FIRST. Without these, "feature_golf is not on the board"
	// passes just as well against a view that matches nothing at all, or a seed
	// that never landed.
	it('Speedrun still ranks, both players, in score order', async () => {
		const rows = await boardRows('speedrun');
		expect(rows.length).toBe(2);
		expect(rows.map((r) => r.user_id)).toEqual([player.id, other.id]);
		expect(rows.map((r) => Number(r.rank))).toEqual([1, 2]);
	});

	it('a knowledge mode still ranks', async () => {
		const rows = await boardRows('drawing_reading');
		expect(rows.length).toBe(1);
	});

	it.each(['feature_golf', 'reverse_engineer'] as const)(
		'%s does not reach the board',
		async (mode) => {
			expect(await boardRows(mode)).toEqual([]);
		}
	);

	// "while still recording" is the other half of the requirement, and it is the
	// half a plain exclusion could silently take with it.
	it.each(['feature_golf', 'reverse_engineer'] as const)(
		'%s runs are still RECORDED in submissions, with their score',
		async (mode) => {
			const { rows } = await db.sql<{ n: string; score: string }>(
				`select count(*) as n, min(score_metric)::text as score
				   from public.submissions
				  where challenge_id = $1::uuid and is_correct = true and source = 'macro'`,
				[challengeIds.get(mode)!]
			);
			expect(Number(rows[0].n)).toBe(2);
			expect(Number(rows[0].score)).toBe(12.5);
		}
	);

	// The forgery this exclusion exists for, driven rather than described: the
	// board metric for Feature Golf is a raw client integer, so 1 (or 0, or -5)
	// takes the top. It must buy nothing.
	it('a forged feature count of 1 buys no rank', async () => {
		await seedPassingRun(other, 'feature_golf', 1, 5_000);
		expect(await boardRows('feature_golf')).toEqual([]);

		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from public.submissions
			  where challenge_id = $1::uuid and score_metric = 1`,
			[challengeIds.get('feature_golf')!]
		);
		expect(Number(rows[0].n)).toBe(1);
	});

	// The board's OWN grants are unchanged by the replace (a `create or replace
	// view` preserves them, so this asserts the re-assertion landed).
	it('is readable by authenticated and not by anon', async () => {
		const { rows } = await db.sql<{ auth: boolean; anon: boolean }>(
			`select has_table_privilege('authenticated', 'public.gauntlet_leaderboard', 'select') as auth,
			        has_table_privilege('anon', 'public.gauntlet_leaderboard', 'select') as anon`
		);
		expect(rows[0].auth).toBe(true);
		expect(rows[0].anon).toBe(false);
	});

	// The unpublished-challenge predicate is what compensates for the view being
	// owner-privileged (0060 section 3). Re-signing the view is exactly how it
	// would get dropped, so it is asserted here rather than assumed.
	it('still hides an unpublished challenge', async () => {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, status, prompt, answer)
			 values ('speedrun', 'Draft Speedrun', 2, 'draft', '{}'::jsonb, '{"target_volume_mm3":1}'::jsonb)
			 returning id`
		);
		await db.sql(
			`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source)
			 values ($1::uuid, $2::uuid, 'speedrun', '{}'::jsonb, true, 1, 'macro')`,
			[player.id, rows[0].id]
		);
		const { rows: board } = await db.asUser(player.id, (q) =>
			q(`select 1 from public.gauntlet_leaderboard where challenge_id = $1::uuid`, [rows[0].id])
		);
		expect(board).toEqual([]);
	});
});

/**
 * The Reverse Engineer oracle, MEASURED rather than asserted from reading the
 * SQL, because "two probes pin the target" was the audit's claim and this file
 * is what decides whether it was right.
 *
 * `gauntlet_macro_submit` returns `score_metric` to the caller on a FAILING
 * submit, and for this mode that number is the exact mean deviation from the
 * stored targets. This drives the real function twice with two wrong volumes
 * and solves for the target the caller was never told.
 *
 * It is a CHARACTERIZATION test: it pins the exposure that makes the board
 * exclusion necessary, so if somebody later closes the oracle in
 * `gauntlet_macro_submit`, this file goes red and whoever did it is pointed at
 * the exclusion they may now be able to lift.
 */
describe('why Reverse Engineer is excluded: the returned score is an exact-deviation oracle', () => {
	it('two failing probes solve for the hidden target volume', async () => {
		const challengeId = challengeIds.get('reverse_engineer')!;
		const trueTarget = 80_000; // seeded above; the caller is never told it.

		async function probe(volume: number): Promise<number> {
			const { rows: rev } = await db.asUser(player.id, (q) =>
				q<{ gauntlet_speedrun_reveal: { code: string } }>(
					`select public.gauntlet_speedrun_reveal($1::uuid)`,
					[challengeId]
				)
			);
			const code = rev[0].gauntlet_speedrun_reveal.code;
			// Room-less solo submits need a started run; gauntlet_macro_start is
			// the real unauthenticated macro entry point (anon key + the code as
			// the credential, 0016) and is what stamps started_at and the run_id.
			const { rows: started } = await db.asAnon((q) =>
				q<{ gauntlet_macro_start: { run_id: string } }>(
					`select public.gauntlet_macro_start($1::text, $2::numeric)`,
					[code, 0]
				)
			);
			const runId = started[0].gauntlet_macro_start.run_id;
			const { rows } = await db.asAnon((q) =>
				q<{ gauntlet_macro_submit: { score_metric: string | null; is_correct: boolean } }>(
					`select public.gauntlet_macro_submit($1::text, $2::numeric, $3::text, $4::numeric)`,
					[code, volume, runId, 12_000]
				)
			);
			const out = rows[0].gauntlet_macro_submit;
			expect(out.is_correct).toBe(false);
			return Number(out.score_metric);
		}

		// Surface area is submitted at its exact target both times, so the area
		// half of the mean is a constant and drops out of the difference.
		const v1 = 100_000;
		const v2 = 90_000;
		const s1 = await probe(v1);
		const s2 = await probe(v2);

		// The returned numbers themselves, so the oracle is legible rather than
		// only solved for: 100000 is 25% over an 80000 target, halved with a
		// zero area deviation gives 12.5; 90000 is 12.5% over, giving 6.25.
		expect(s1).toBeCloseTo(12.5, 6);
		expect(s2).toBeCloseTo(6.25, 6);

		// score = (|V - Vt|/Vt*100 + areaDev) / 2, with areaDev identical, so
		//   s1 - s2 = (V1 - V2) / (2 * Vt) * 100   for V1 > V2 > Vt.
		const solved = (100 * (v1 - v2)) / (2 * (s1 - s2));
		expect(solved).toBeCloseTo(trueTarget, 3);
	});
});
