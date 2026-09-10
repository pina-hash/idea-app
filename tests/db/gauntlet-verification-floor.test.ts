// tests/db/gauntlet-verification-floor.test.ts
//
// 0194: THE PIN. A run under the plausibility floor must reach the review
// console. That is the whole reason `0154` chose 30 seconds -- it is `0152`'s
// own `p_fast_finish_seconds` default, so that no run loses a board seat
// without also appearing by name in front of a teacher. `0194` moves the floor
// into a settings row Mr. Pina owns, which means an apply-time equality between
// two literals can no longer enforce it, and this file is what replaces that
// assertion.
//
// THE FAILURE THIS EXISTS TO CATCH IS SILENT IN BOTH DIRECTIONS, which is why
// it is here and not in a harness. A held run that stops being reported does not
// throw, does not render wrong, and does not change any count a teacher looks
// at -- it simply is not in a list nobody has a reason to suspect. And a held
// run that quietly starts RANKING looks like an ordinary fast student.
//
// EVERY ASSERTION IS PAIRED WITH A POSITIVE CONTROL, because every one of them
// is an absence or a presence in a set that could be empty for unrelated
// reasons. `gauntlet_run_review` answers an EMPTY SET to a non-admin rather
// than raising, so "the console does not report it" is exactly what a closed
// gate looks like; every console read here is made as a real admin and is
// control-proved against the same read made by a student.
//
// THE THREE THINGS PROVED, in the order they matter:
//
//   1. A sub-floor run REACHES THE CONSOLE, at the console's NARROWEST setting
//      -- a zero-second lens with `p_observed_only`, which switches
//      `fast_finish` off entirely and is the exact configuration that would
//      have hidden the run before this file. This is the pin.
//   2. It is ON THE BOARD carrying `pending_verification` and a NULL rank, so
//      it can never be absent from both places at once. `0154`'s shape had it
//      absent from the board; the failure mode "vanishes from both" is closed
//      structurally here rather than by an assertion.
//   3. The floor is a SETTING. Moving it moves both sides together, and neither
//      side is ever computed from the caller's own parameter.

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDb, createUser, type TestDb, type SeededUser } from './harness';

/**
 * The GAUNTLET chain as production stands, THROUGH `0154`, then the file under
 * test. `0154` is in the chain deliberately rather than skipped: the property
 * being preserved is `0154`'s, and a chain that never applied it would be
 * proving something about a schema nobody runs.
 */
const CHAIN = [
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
	'0038_profile_pathway.sql',
	'0061_gauntlet_target_disclosure.sql',
	'0137_anon_execute_sweep.sql',
	'0146_gauntlet_reveal_all_modeling_modes.sql',
	'0147_gauntlet_close_target_disclosure.sql',
	'0148_gauntlet_knowledge_clock.sql',
	'0150_gauntlet_connect_run_analysis.sql',
	'0151_gauntlet_meter_practice.sql',
	'0152_gauntlet_run_review.sql',
	'0154_gauntlet_rank_what_is_checkable.sql',
	'0194_gauntlet_verification_floor.sql'
] as const;

// Nothing round, so a figure that comes back could not have come from a default
// or from a fixture elsewhere.
const TARGET_VOLUME_MM3 = 61237.4408;
const DENSITY_G_CM3 = 2.7;

/** Comfortably under the 30s default: the run the board holds. */
const SUB_FLOOR_MS = 4_312;
/** Comfortably over it: the run the board ranks. Ben's -- the faster of the
 *  two honest runs, so he holds rank 1 regardless of insertion order. */
const HONEST_MS = 187_004;
/**
 * Cleo's honest run. Distinctly slower than Ben's `HONEST_MS`, and the gap
 * (nearly six seconds) is deliberate: `runFor` backdates `started_at` in one
 * statement and `gauntlet_macro_submit` computes `elapsed_ms` from `now()` in
 * a later one, so the stored metric is `elapsedMs + drift` with an
 * independent drift per call. Two equal nominal times therefore land as two
 * unpredictably different stored ones, and the ranking that decides Ben's
 * seat 1 depends on the ORDER of those two numbers, not on a tiebreak this
 * fixture cannot make deterministic. The gap must outlast any plausible
 * drift, not merely the drift measured on one quiet machine.
 */
const CLEO_HONEST_MS = 192_881;

let db: TestDb;
let ana: SeededUser;   // sub-floor only
let ben: SeededUser;   // honest only
let cleo: SeededUser;  // BOTH, on the same challenge
let admin: SeededUser;
let challengeId: string;

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Okafor');
	cleo = await createUser(db, 'cleo@boscotech.net', 'Cleo Nakamura');
	admin = await createUser(db, 'pina@boscotech.edu', 'A Pina');
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		admin.email
	]);

	const prompt = {
		material: 'Aluminium 6061',
		density: DENSITY_G_CM3,
		unit_system: 'MMGS',
		par_time: 275,
		drawing: '<svg/>'
	};
	const answer = {
		target_volume_mm3: TARGET_VOLUME_MM3,
		target_mass: (TARGET_VOLUME_MM3 / 1000) * DENSITY_G_CM3,
		density: DENSITY_G_CM3,
		tolerance_pct: 0.1,
		drawing: '<svg/>'
	};
	const { rows } = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
		 values ('speedrun', 'Alpha Bracket', 2, $1::jsonb, $2::jsonb, 'published') returning id`,
		[JSON.stringify(prompt), JSON.stringify(answer)]
	);
	challengeId = rows[0].id;

	// Every run below goes through the REAL RPC chain -- reveal, start, submit
	// -- because the thing under test is what the board and the console make of
	// a row `gauntlet_macro_submit` actually wrote. A hand-inserted submission
	// would be a fixture the producer cannot emit, and the clock is exactly the
	// field a hand-written row would get wrong.
	await runFor(ana, SUB_FLOOR_MS);
	await runFor(ben, HONEST_MS);
	await runFor(cleo, CLEO_HONEST_MS);
	await runFor(cleo, SUB_FLOOR_MS);
}, 300_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// Driving helpers.
// ---------------------------------------------------------------------------

/**
 * One complete pass, clocked.
 *
 * THE CLOCK IS SERVER-STAMPED AND CANNOT BE ASKED FOR, which is the whole
 * premise of the floor -- `gauntlet_macro_submit` computes `elapsed_ms` from
 * `gauntlet_run_tokens.started_at` to `now()`. So the token's `started_at` is
 * back-dated after the run starts, which is the only way to produce a run of a
 * chosen length without waiting for it. Nothing else about the path is
 * simulated: the reveal, the start, the grading and the row are all real.
 */
async function runFor(who: SeededUser, elapsedMs: number): Promise<void> {
	const reveal = await db.asUser(who.id, (q) =>
		q<{ r: { code: string } }>(`select public.gauntlet_speedrun_reveal($1::uuid) as r`, [
			challengeId
		])
	);
	const code = reveal.rows[0].r.code;
	const started = await db.sql<{ r: { run_id: string } }>(
		`select public.gauntlet_macro_start($1::text, 0::numeric) as r`,
		[code]
	);
	const runId = started.rows[0].r.run_id;
	await db.sql(
		`update public.gauntlet_run_tokens
		 set started_at = now() - make_interval(secs => $2::numeric / 1000.0)
		 where run_id = $1`,
		[runId, String(elapsedMs)]
	);
	const out = await db.sql<{ r: Record<string, unknown> }>(
		`select public.gauntlet_macro_submit(
			p_code => $1::text, p_volume_mm3 => $2::numeric, p_run_id => $3::text,
			p_surface_area_mm2 => 12000, p_feature_count => 6) as r`,
		[code, String(TARGET_VOLUME_MM3), runId]
	);
	// The premise of every assertion below: the run PASSED. 0154 and 0194 are
	// both about what happens to a run that is correct, so a fixture that
	// silently stopped passing would make the whole file vacuous.
	expect(out.rows[0].r.is_correct, 'the fixture run must PASS -- everything below is about a correct run').toBe(true);
}

/** The console, read as a real admin, at whatever lens the caller names. */
async function console_(opts: { floorSeconds: number; observedOnly?: boolean }) {
	return db.asUser(admin.id, (q) =>
		q<{ user_id: string; elapsed_ms: string | null; observations: string[]; board_rank: number | null }>(
			`select user_id, elapsed_ms, observations, board_rank
			   from public.gauntlet_run_review(null, 8760, $1::integer, false, $2::boolean, 1000)`,
			[String(opts.floorSeconds), String(opts.observedOnly ?? true)]
		)
	);
}

/** The board, read as a signed-in student -- the way a page reads it. */
async function board(who: SeededUser) {
	return db.asUser(who.id, (q) =>
		q<{ user_id: string; rank: string | null; rank_state: string; score_metric: string | null }>(
			`select user_id, rank, rank_state, score_metric
			   from public.gauntlet_leaderboard
			  where challenge_id = $1::uuid
			  order by rank asc nulls last`,
			[challengeId]
		)
	);
}

async function setFloorMs(ms: number) {
	const out = await db.asUser(admin.id, (q) =>
		q<{ r: Record<string, unknown> }>(`select public.gauntlet_rank_settings_set($1::integer) as r`, [
			String(ms)
		])
	);
	return out.rows[0].r;
}

describe('0194: a sub-floor run reaches the review console', () => {
	// -----------------------------------------------------------------------
	// 1. THE PIN.
	// -----------------------------------------------------------------------
	it('reports a held run at the console\'s NARROWEST lens, where fast_finish is off entirely', async () => {
		// A zero-second lens plus `p_observed_only` is the configuration a
		// teacher reaches by typing 0 into "Quick finish under (seconds)". Under
		// 0152 alone that emits `fast_finish` for nothing, so a run whose only
		// observation was `fast_finish` disappears from the report -- while the
		// board (under 0154) had already dropped it. That pair is the hole.
		const narrow = await console_({ floorSeconds: 0 });

		const anasRows = narrow.rows.filter((r) => r.user_id === ana.id);
		expect(anasRows.length, 'the held run must be reported even at a zero-second lens').toBe(1);
		expect(anasRows[0].observations).toContain('pending_verification');
		// The discriminator: it is NOT reaching the report through fast_finish.
		expect(
			anasRows[0].observations,
			'at a zero-second lens fast_finish must be off, or this assertion is proving the wrong mechanism'
		).not.toContain('fast_finish');

		// POSITIVE CONTROL, and it is the one that matters most here: the same
		// read at the DEFAULT lens still works and still finds the run. Without
		// it, "1 row at a zero-second lens" cannot be told from a report that
		// returns Ana's row under every condition for some unrelated reason.
		const wide = await console_({ floorSeconds: 30 });
		const anasWide = wide.rows.filter((r) => r.user_id === ana.id);
		expect(anasWide.length).toBe(1);
		expect(anasWide[0].observations).toEqual(
			expect.arrayContaining(['pending_verification', 'fast_finish'])
		);

		// AND THE NEGATIVE CONTROL. An honest run is on neither list, so the
		// report is genuinely discriminating rather than returning everything.
		expect(narrow.rows.some((r) => r.user_id === ben.id)).toBe(false);
		expect(wide.rows.some((r) => r.user_id === ben.id)).toBe(false);
	});

	it('is an empty set for a student, so the console read above proves the pin and not the gate', async () => {
		// `gauntlet_run_review` answers an empty set rather than raising to a
		// non-admin. That makes "no rows" ambiguous, and this is what
		// disambiguates it: the same call, same parameters, made by a student,
		// returns nothing -- so every non-empty result above was reached
		// through the admin gate and is a real reading of the report.
		const asStudent = await db.asUser(ana.id, (q) =>
			q(`select user_id from public.gauntlet_run_review(null, 8760, 0, false, true, 1000)`)
		);
		expect(asStudent.rows.length).toBe(0);
	});

	// -----------------------------------------------------------------------
	// 2. THE BOARD SIDE. It can never be absent from both.
	// -----------------------------------------------------------------------
	it('keeps the held run ON the board, with a state and no seat', async () => {
		const rows = (await board(ana)).rows;

		const anas = rows.find((r) => r.user_id === ana.id);
		expect(anas, '0154 dropped this row entirely; 0194 must keep it').toBeDefined();
		expect(anas?.rank_state).toBe('pending_verification');
		expect(anas?.rank, 'a held run holds no seat').toBeNull();

		// POSITIVE CONTROL: the ranked rows are still there, still ranked, and
		// still numbered from 1 -- a held row must not renumber the board.
		const bens = rows.find((r) => r.user_id === ben.id);
		expect(bens?.rank_state).toBe('ranked');
		expect(Number(bens?.rank)).toBe(1);
		const ranked = rows.filter((r) => r.rank_state === 'ranked');
		expect(ranked.map((r) => Number(r.rank)).sort((a, b) => a - b)).toEqual([1, 2]);
	});

	it('never leaves a run off BOTH the board and the console -- the property 0154 bought with its literal', async () => {
		// Stated as the property rather than as two separate facts, because the
		// property is what must survive a future edit to either side. Every
		// passing macro Speedrun submission in the table is enumerated, and each
		// must be reachable from at least one of the two surfaces.
		const all = await db.sql<{ user_id: string }>(
			`select distinct user_id from public.submissions
			  where is_correct = true and source = 'macro' and mode = 'speedrun'`
		);
		expect(all.rows.length, 'the sweep must have something to sweep').toBeGreaterThan(0);

		const onBoard = new Set((await board(admin)).rows.map((r) => r.user_id));
		const onConsole = new Set((await console_({ floorSeconds: 0 })).rows.map((r) => r.user_id));

		for (const { user_id } of all.rows) {
			expect(
				onBoard.has(user_id) || onConsole.has(user_id),
				`user ${user_id} has a passing run that is on neither the board nor the review console`
			).toBe(true);
		}
	});

	// -----------------------------------------------------------------------
	// 3. 0154's OWN PROPERTY, PRESERVED: it removes the run, not the player.
	// -----------------------------------------------------------------------
	it('represents a student holding both a held run and an honest one by the HONEST one', async () => {
		// Cleo has both, on the same challenge, and the held one is far faster
		// -- so every ordering term except the new one prefers it. This is the
		// assertion that catches a `distinct on` whose held-last term was
		// dropped, which would silently cost an honest student their seat.
		const rows = (await board(cleo)).rows;
		const cleos = rows.filter((r) => r.user_id === cleo.id);
		expect(cleos.length, 'the board is one row per player per challenge').toBe(1);
		expect(cleos[0].rank_state).toBe('ranked');
		expect(cleos[0].rank).not.toBeNull();
		// Her HONEST time, not her 4.3-second one.
		expect(Number(cleos[0].score_metric)).toBeCloseTo(CLEO_HONEST_MS / 1000, 1);
	});

	it('keeps a held run out of the published per-drawing record', async () => {
		// `gauntlet_leaderboards()` joins the board `on ... and rec.rank = 1`.
		// A held row's rank is NULL and `NULL = 1` is NULL, so this needed no
		// change -- which is exactly why it needs an assertion: nothing in the
		// diff would show it breaking.
		const out = await db.asUser(ben.id, (q) =>
			q<{ r: Record<string, unknown> }>(`select public.gauntlet_leaderboards(100) as r`)
		);
		// The per-drawing record list is the `speedrun` key: one entry per
		// published Speedrun challenge, carrying whoever holds rank 1 on it.
		const records =
			(out.rows[0].r as { speedrun?: Array<{ user_id: string | null; best_time: number | null }> })
				.speedrun ?? [];
		expect(records.length, 'there must be a record row to be wrong about').toBeGreaterThan(0);
		expect(records.some((r) => r.user_id === ana.id)).toBe(false);
		// POSITIVE CONTROL: the seat is not simply empty -- the honest holder is
		// in it, at his honest time. Without this, "Ana is not the record holder"
		// would pass just as well on a record list nobody holds at all, which is
		// what a view returning no rank-1 rows would produce.
		const held = records.find((r) => r.user_id === ben.id);
		expect(held, 'the honest run must hold the record').toBeDefined();
		expect(Number(held?.best_time)).toBeCloseTo(HONEST_MS / 1000, 1);
	});

	// -----------------------------------------------------------------------
	// 4. THE FLOOR IS A SETTING, AND MOVING IT MOVES BOTH SIDES TOGETHER.
	// -----------------------------------------------------------------------
	it('moves the board and the console together when the floor changes', async () => {
		try {
			// Raise the floor ABOVE Ben's honest 187s run. If the two sides read
			// one row, he is held on the board AND reported by the console in the
			// same breath. If either side kept a literal, exactly one of these
			// two assertions fails -- which is the drift 0154's apply-time check
			// could not survive being moved into a form.
			const set = await setFloorMs(240_000);
			expect(set.ok).toBe(true);
			expect(set.speedrun_floor_ms).toBe(240000);

			const bensRow = (await board(ben)).rows.find((r) => r.user_id === ben.id);
			expect(bensRow?.rank_state).toBe('pending_verification');
			expect(bensRow?.rank).toBeNull();

			const reported = (await console_({ floorSeconds: 0 })).rows.filter(
				(r) => r.user_id === ben.id
			);
			expect(reported.length, 'the console must follow the board').toBe(1);
			expect(reported[0].observations).toContain('pending_verification');

			// A floor of 0 is a legitimate setting -- "runners must be able to
			// submit legitimate times under 30 seconds" taken all the way -- and
			// it must hold nothing on the clock.
			await setFloorMs(0);
			const allRanked = (await board(ben)).rows;
			expect(allRanked.every((r) => r.rank_state === 'ranked')).toBe(true);
			expect(
				(await console_({ floorSeconds: 0 })).rows.some((r) =>
					r.observations.includes('pending_verification')
				),
				'at a zero floor nothing on the clock is held, so nothing is reported as held'
			).toBe(false);
		} finally {
			// Restore, so the ordering of the file cannot change another test's
			// answer. This runs even if an assertion above threw.
			await setFloorMs(30_000);
		}
	});

	it('refuses an out-of-range floor with its bounds, and refuses a non-admin outright', async () => {
		const tooBig = await setFloorMs(999_999);
		expect(tooBig.ok).toBe(false);
		expect(tooBig.reason).toBe('out_of_range');
		// The number is still what it was: a refusal that half-applied would be
		// worse than one that raised.
		const still = await db.asUser(admin.id, (q) =>
			q<{ r: { speedrun_floor_ms: number } }>(`select public.gauntlet_rank_settings_get() as r`)
		);
		expect(still.rows[0].r.speedrun_floor_ms).toBe(30000);

		// Genuine misuse RAISES rather than returning a structured refusal: a
		// caller who may not be here is not being shown a form.
		await expect(
			db.asUser(ana.id, (q) => q(`select public.gauntlet_rank_settings_set(5000)`))
		).rejects.toThrow(/admin/i);
	});

	// -----------------------------------------------------------------------
	// 5. THE NUMBER IS NOT PUBLISHED.
	// -----------------------------------------------------------------------
	it('does not hand a student the threshold, by any path this schema offers', async () => {
		// The whole argument for a STATE rather than a sentence naming seconds
		// is that the state says something true without saying the number. That
		// is worth nothing if the number is one PostgREST call away.
		await expect(
			db.asUser(ana.id, (q) => q(`select speedrun_floor_ms from public.gauntlet_rank_settings`))
		).rejects.toThrow(/permission denied/i);

		// The reader function exists but answers NULL to a student -- the same
		// answer a missing row would give, so nothing can be inferred from it.
		const got = await db.asUser(ana.id, (q) =>
			q<{ r: unknown }>(`select public.gauntlet_rank_settings_get() as r`)
		);
		expect(got.rows[0].r).toBeNull();

		// POSITIVE CONTROL: it is not null for everyone -- the admin gets the number.
		const asAdmin = await db.asUser(admin.id, (q) =>
			q<{ r: { speedrun_floor_ms: number } }>(`select public.gauntlet_rank_settings_get() as r`)
		);
		expect(asAdmin.rows[0].r.speedrun_floor_ms).toBe(30000);

		// And the board itself projects a STATE and no threshold. Asserted on the
		// column list rather than on a row, so a future column carrying a number
		// reddens even on an empty board.
		const cols = await db.sql<{ column_name: string }>(
			`select column_name from information_schema.columns
			  where table_schema = 'public' and table_name = 'gauntlet_leaderboard'`
		);
		const names = cols.rows.map((c) => c.column_name);
		expect(names).toContain('rank_state');
		expect(names.some((n) => /floor|threshold|ms$/.test(n))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// RE-APPLIABILITY. Its own database, because it applies the file TWICE.
//
// CLAUDE.md: "Re-pasting a migration is ordinary -- someone re-pastes, or a
// first attempt failed partway and gets retried -- so a migration that only
// works once fails exactly then, with the schema half-built."
//
// AND THE SECOND HALF IS THE ONE THAT WOULD COST SOMETHING REAL: a re-paste
// must not overwrite a floor he has edited. `0015`'s singleton seeds with
// `on conflict do nothing` for exactly that reason and this file copies it, so
// this is the assertion that says the copy actually took.
// ---------------------------------------------------------------------------
describe('0194 re-applies', () => {
	let twice: TestDb;
	afterAll(async () => {
		await twice?.stop();
	});

	it('applies twice with no error, and seeds the singleton once', async () => {
		twice = await startTestDb([...CHAIN, '0194_gauntlet_verification_floor.sql']);
		const { rows } = await twice.sql<{ n: string; floor: number }>(
			`select count(*)::text n, min(speedrun_floor_ms) floor from public.gauntlet_rank_settings`
		);
		expect(rows[0].n).toBe('1');
		expect(rows[0].floor).toBe(30000);
	}, 300_000);

	it('does not overwrite an edited floor on a re-paste', async () => {
		// Nothing round, so the number coming back could not be a default.
		await twice.sql(`update public.gauntlet_rank_settings set speedrun_floor_ms = 12345 where id`);
		await twice.sql(
			readFileSync('supabase/migrations/0194_gauntlet_verification_floor.sql', 'utf8')
		);
		const { rows } = await twice.sql<{ floor: number }>(
			`select speedrun_floor_ms floor from public.gauntlet_rank_settings`
		);
		expect(rows[0].floor).toBe(12345);
	}, 120_000);
});
