// tests/gauntlet-mode-ranked-parity.test.ts
//
// `MODES[].ranked` (and its reader, `modeRanks`, in `src/lib/gauntlet.ts`) is
// the client's ONE statement of a fact that is otherwise decided entirely
// inside `gauntlet_leaderboard`'s WHERE clause (`0146`): whether a verified
// run in a mode can ever appear on that mode's own leaderboard. Nothing types
// the two together -- the view is SQL, the catalog is a plain TypeScript
// array -- so a later migration that changes the allowlist without a matching
// edit here would leave `ModelingRun.svelte`'s `ranked` prop lying to a
// student silently.
//
// PER THIS REPO'S OWN LESSON (`gauntlet-tolerance-test-fix-u79q4y`): a claim
// about what the SERVER actually does is a question about runtime behaviour,
// not about how a migration happens to spell it, so it is asked of a real
// embedded Postgres running the real migration chain rather than regex-parsed
// out of the view's SQL text. One passing submission per mode is seeded and
// `gauntlet_leaderboard` is read back for each; `modeRanks` must agree with
// whether that mode's own run showed up.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { MODES, modeRanks, type GauntletModeId } from '../src/lib/gauntlet';

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
	'0146_gauntlet_reveal_all_modeling_modes.sql',
	// The tail this file stopped short of. 0154 is the one that matters: it
	// adds a PLAUSIBILITY FLOOR to `gauntlet_leaderboard` (a macro run ranks
	// only if `value->>'elapsed_ms' >= 30000`, and a run with no such key fails
	// closed), which is precisely what this file's `onBoard` reads. 0153
	// requires 0147 and 0154 requires 0152, so the intervening files come with
	// it; 0149 is deliberately absent, matching the sibling gauntlet suites.
	'0147_gauntlet_close_target_disclosure.sql',
	'0148_gauntlet_knowledge_clock.sql',
	'0150_gauntlet_connect_run_analysis.sql',
	'0151_gauntlet_meter_practice.sql',
	'0152_gauntlet_run_review.sql',
	'0153_gauntlet_unpublish_the_target.sql',
	'0154_gauntlet_rank_what_is_checkable.sql',
	'0155_gauntlet_authoring_tier.sql'
] as const;

let db: TestDb;
let player: SeededUser;

const challengeIds = new Map<GauntletModeId, string>();

/** A published challenge per mode. See gauntlet-modeling-reveal.test.ts for
 *  why `published` is never written directly (0009's sync trigger derives it). */
async function seedChallenges() {
	for (const mode of MODES.map((m) => m.id)) {
		const answer =
			mode === 'reverse_engineer'
				? { target_volume_mm3: 80000, target_surface_area_mm2: 12000, tolerance_pct: 0.1, density: 2.7 }
				: mode === 'speedrun' || mode === 'feature_golf'
					? { target_volume_mm3: 80000, tolerance_pct: 0.1, density: 2.7, drawing: '<svg/>' }
					: { correct: 'a' };
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, status, prompt, answer)
			 values ($1::public.gauntlet_mode, $2, 2, 'published', '{}'::jsonb, $3::jsonb)
			 returning id`,
			[mode, `Ranked-parity seed ${mode}`, JSON.stringify(answer)]
		);
		challengeIds.set(mode, rows[0].id);
	}
}

/**
 * 0154's plausibility floor, in milliseconds, written down once. The view ranks
 * a macro run only when `(value->>'elapsed_ms')::numeric >= 30000`.
 */
const CLOCK_FLOOR_MS = 30_000;

/** One passing run, inserted directly (the same shape `gauntlet_macro_submit`
 *  and the knowledge `gauntlet_submit` branch each write). Modeling modes are
 *  scored 'macro'; knowledge modes are scored 'manual', matching the seed in
 *  gauntlet-modeling-reveal.test.ts.
 *
 *  THE CLOCK IS REAL RATHER THAN ABSENT, and it used to be neither: `value` was
 *  `'{}'::jsonb`, so `elapsed_ms` was NULL. 0154 fails a missing key CLOSED, so
 *  every macro run this file seeds would have dropped off the board and the
 *  parity check below would have reported `speedrun` as unranked -- a FIXTURE
 *  that stopped being something the producer can emit, not a claim that
 *  changed. `gauntlet_macro_submit` writes an `elapsed_ms` on every run it
 *  records. */
async function seedPassingRun(mode: GauntletModeId, elapsedMs = CLOCK_FLOOR_MS + 15_000) {
	const source = mode === 'speedrun' || mode === 'reverse_engineer' || mode === 'feature_golf' ? 'macro' : 'manual';
	await db.sql(
		`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source)
		 values ($1::uuid, $2::uuid, $3::public.gauntlet_mode,
		         jsonb_build_object('elapsed_ms', $5::bigint), true, 1, $4)`,
		[player.id, challengeIds.get(mode)!, mode, source, elapsedMs]
	);
}

async function onBoard(mode: GauntletModeId): Promise<boolean> {
	const { rows } = await db.asUser(player.id, (q) =>
		q(`select 1 from public.gauntlet_leaderboard where challenge_id = $1::uuid`, [challengeIds.get(mode)!])
	);
	return rows.length > 0;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	player = await createUser(db, 'player@boscotech.net', 'Player One');
	await seedChallenges();
	for (const mode of MODES.map((m) => m.id)) {
		await seedPassingRun(mode);
	}
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('MODES[].ranked agrees with gauntlet_leaderboard, mode by mode', () => {
	// THE INSTRUMENT CONTROL RUNS FIRST, and it is here because of what 0154
	// nearly did to this file. A parity check between a catalog and a view is
	// satisfied by a view that returns NOTHING for every mode the catalog marks
	// unranked -- so if the board went empty, only the ranked modes would
	// redden, and a fixture defect that emptied it entirely would read as a
	// catalog disagreement. Asserting that at least one mode really is on the
	// board makes "the view matches nothing" a distinct, loud failure.
	it('CONTROL: the board is not empty, so parity is measured against a live view', async () => {
		const ranked = MODES.filter((m) => m.ranked).map((m) => m.id);
		expect(ranked.length).toBeGreaterThan(0);
		const seats = await Promise.all(ranked.map((m) => onBoard(m)));
		expect(seats.filter(Boolean).length).toBe(ranked.length);
	});

	it.each(MODES.map((m) => m.id))('%s', async (mode) => {
		expect(modeRanks(mode)).toBe(await onBoard(mode));
	});

	it('THE FLOOR BITES: a macro run under 0154 clock floor holds no seat', async () => {
		// Why the seeded clock is the number it is. Without this a later
		// session could put `elapsed_ms` back under 30s, or drop it, and the
		// parity check would fail with no statement anywhere of the reason.
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, status, prompt, answer)
			 values ('speedrun', 'Floor probe', 2, 'published', '{}'::jsonb,
			         '{"target_volume_mm3": 80000, "tolerance_pct": 0.1, "density": 2.7, "drawing": "<svg/>"}'::jsonb)
			 returning id`
		);
		const probe = rows[0].id;
		const seated = async () =>
			(
				await db.asUser(player.id, (q) =>
					q(`select 1 from public.gauntlet_leaderboard where challenge_id = $1::uuid`, [probe])
				)
			).rows.length;

		await db.sql(
			`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source)
			 values ($1::uuid, $2::uuid, 'speedrun', jsonb_build_object('elapsed_ms', $3::bigint), true, 1, 'macro')`,
			[player.id, probe, CLOCK_FLOOR_MS - 1]
		);
		expect(await seated()).toBe(0);

		// POSITIVE CONTROL: one millisecond over, the identical row ranks -- so
		// the absence above is the floor and not the probe level being invisible.
		await db.sql(`delete from public.submissions where challenge_id = $1::uuid`, [probe]);
		await db.sql(
			`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source)
			 values ($1::uuid, $2::uuid, 'speedrun', jsonb_build_object('elapsed_ms', $3::bigint), true, 1, 'macro')`,
			[player.id, probe, CLOCK_FLOOR_MS]
		);
		expect(await seated()).toBe(1);

		await db.sql(`delete from public.submissions where challenge_id = $1::uuid`, [probe]);
		await db.sql(`delete from public.challenges where id = $1::uuid`, [probe]);
	});
});

describe('the catalog names every mode the enum has, exactly once', () => {
	// A mode absent from MODES would report `ranked: false` from `modeRanks`'
	// fallback without ever being checked against the database above --
	// `it.each` only runs over what MODES already lists.
	it('six modes, each appearing once', () => {
		const ids = MODES.map((m) => m.id);
		expect(ids).toHaveLength(6);
		expect(new Set(ids).size).toBe(6);
	});
});
