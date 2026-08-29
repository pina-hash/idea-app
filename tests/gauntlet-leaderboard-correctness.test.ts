// tests/gauntlet-leaderboard-correctness.test.ts
//
// `0154` narrows `gauntlet_leaderboard` twice: a KNOWLEDGE row ranks only when
// it is correct, and a MODELING run ranks only when its server-stamped clock
// clears a 30 second plausibility floor. Both regressions would be SILENT --
// nothing type-checks a view's WHERE clause, the board still renders, and the
// only visible difference is which student's name is on it -- so this is the
// exception CLAUDE.md's testing rule names, not feature coverage.
//
// WHY IT IS ASKED OF A REAL POSTGRES AND NOT OF THE MIGRATION'S TEXT. A claim
// about what the server ranks is a claim about runtime behaviour. `0146` set
// that precedent for this exact view (its own section 3b is behavioural), and
// `gauntlet-tolerance-test-fix-u79q4y` is the entry recording what regex-parsing
// a migration instead had cost. Every row here is written by the REAL RPCs --
// `gauntlet_submit`, `gauntlet_speedrun_reveal`, `gauntlet_macro_start`,
// `gauntlet_macro_submit` -- so no fixture asserts a shape the writers cannot
// emit.
//
// THE MIGRATION IS APPLIED OVER SEEDED PRE-MIGRATION DATA, which is the repo's
// migration standard: `BASE` is booted, every row is written through the
// pre-`0154` RPCs, and only then is the file read off disk and applied over the
// top. So what is measured is the transition a real database will make, not a
// database that was born after the fix.
//
// EVERY EXCLUSION HERE IS MUTATION-PROVED. The mutants are built by string
// substitution ON A COPY OF THE FILE'S TEXT IN MEMORY and applied to a separate
// database; the file on disk is never written to, so there is nothing to
// restore and no `git checkout --` anywhere near this (the three-sessions-in-
// one-week lesson in CLAUDE.md).

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

const MIGRATION_FILE = new URL(
	'../supabase/migrations/0154_gauntlet_rank_what_is_checkable.sql',
	import.meta.url
);
const MIGRATION_SQL = readFileSync(MIGRATION_FILE, 'utf8');

/** The chain `0154` lands on: the gauntlet dependency set through `0153`. */
const BASE = [
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
	'0146_gauntlet_reveal_all_modeling_modes.sql',
	'0147_gauntlet_close_target_disclosure.sql',
	'0148_gauntlet_knowledge_clock.sql',
	'0150_gauntlet_connect_run_analysis.sql',
	'0151_gauntlet_meter_practice.sql',
	'0152_gauntlet_run_review.sql',
	'0153_gauntlet_unpublish_the_target.sql'
] as const;

/** Nothing round, so a number that comes back could not be a default. */
const TARGET_VOLUME_MM3 = 61237.4408;
const FLOOR_MS = 30_000;

interface BoardRow {
	mode: string;
	user_id: string;
	player: string;
	is_correct: boolean;
	score_metric: string;
	rank: string;
}

interface World {
	db: TestDb;
	/** Wrong knowledge answer only; also the forged sub-floor modeling run. */
	fast: SeededUser;
	/** Correct knowledge answer; an honest modeling run well over the floor. */
	honest: SeededUser;
	/** A sub-floor run AND an honest one on the same challenge. */
	both: SeededUser;
	/** 0152's review console is admin-gated; a non-admin gets an empty set. */
	admin: SeededUser;
	knowledgeId: string;
	/** A second knowledge challenge nobody has answered correctly. */
	knowledgeAloneId: string;
	speedrunId: string;
}

/**
 * Boot BASE, seed every row through the pre-`0154` RPCs, and hand back the
 * world WITHOUT `0154` applied. Callers apply whichever version of the file
 * they are measuring.
 */
async function seedPreMigration(): Promise<World> {
	const db = await startTestDb(BASE as unknown as string[]);
	const fast = await createUser(db, 'fast@boscotech.net', 'Fast Forger');
	const honest = await createUser(db, 'honest@boscotech.net', 'Honest Modeller');
	const both = await createUser(db, 'both@boscotech.net', 'Both Runs');
	const admin = await createUser(db, 'chair@boscotech.edu', 'The Chair');
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
		admin.email
	]);

	const mk = async (mode: string, title: string, answer: object, prompt = '{}') => {
		const { rows } = await db.sql<{ id: string }>(
			`insert into public.challenges (mode, title, difficulty, status, prompt, answer)
			 values ($1::public.gauntlet_mode, $2, 1, 'published', $3::jsonb, $4::jsonb)
			 returning id`,
			[mode, title, prompt, JSON.stringify(answer)]
		);
		return rows[0].id;
	};

	const knowledgeId = await mk('drawing_reading', '0154 knowledge', { correct: 'b' });
	const knowledgeAloneId = await mk('drawing_reading', '0154 knowledge, wrong only', {
		correct: 'b'
	});
	const speedrunId = await mk(
		'speedrun',
		'0154 speedrun',
		{ target_volume_mm3: TARGET_VOLUME_MM3, tolerance_pct: 0.1, density: 2.7 },
		'{"par_time":275}'
	);

	// --- knowledge, through gauntlet_submit's own knowledge branch -----------
	// A WRONG answer, fast. `p_elapsed_ms` is ignored for scoring since 0148;
	// the clock is the one `gauntlet_knowledge_start` stamps, so both players
	// score whatever the server measures and neither can choose it.
	await db.asUser(fast.id, (q) =>
		q(`select public.gauntlet_submit($1::uuid, '{"answer":"a"}'::jsonb, 4000)`, [knowledgeId])
	);
	await db.asUser(fast.id, (q) =>
		q(`select public.gauntlet_submit($1::uuid, '{"answer":"a"}'::jsonb, 4000)`, [
			knowledgeAloneId
		])
	);
	// A CORRECT answer, slower.
	await db.asUser(honest.id, (q) =>
		q(`select public.gauntlet_submit($1::uuid, '{"answer":"b"}'::jsonb, 20000)`, [knowledgeId])
	);

	// --- modeling, through the real reveal / start / submit ------------------
	const run = async (user: SeededUser, backdateSeconds: number | null) => {
		const rv = await db.asUser(user.id, (q) =>
			q<{ r: { code: string } }>(`select public.gauntlet_speedrun_reveal($1::uuid) as r`, [
				speedrunId
			])
		);
		const code = rv.rows[0].r.code;
		const st = await db.asUser(user.id, (q) =>
			q<{ r: { run_id: string } }>(`select public.gauntlet_macro_start($1::text, 0.0) as r`, [
				code
			])
		);
		if (backdateSeconds !== null) {
			// The ONLY way to make the server's own clock read long: move the
			// stamp it reads. The elapsed is still computed by the RPC from
			// `started_at`, so it is the server's number and not the test's.
			await db.sql(
				`update public.gauntlet_run_tokens
				 set started_at = started_at - make_interval(secs => $2::numeric)
				 where code = $1`,
				[code, backdateSeconds]
			);
		}
		const sub = await db.asUser(user.id, (q) =>
			q<{ r: Record<string, unknown> }>(
				`select public.gauntlet_macro_submit($1::text, $2::numeric, $3::text) as r`,
				[code, TARGET_VOLUME_MM3, st.rows[0].r.run_id]
			)
		);
		return sub.rows[0].r;
	};

	// Forged: start and submit back to back, no modeling in between.
	const forged = await run(fast, null);
	// Honest: 420 seconds on the server's own clock.
	const honestRun = await run(honest, 420);
	// Both: a forged run first, then an honest one on the same challenge.
	await run(both, null);
	await run(both, 300);

	// The fixture is only worth anything if the forged run really is sub-floor
	// and the honest one really is not. Assert the premise, not the conclusion.
	expect(Number(forged.elapsed_ms)).toBeLessThan(FLOOR_MS);
	expect(Number(honestRun.elapsed_ms)).toBeGreaterThan(FLOOR_MS);

	return { db, fast, honest, both, admin, knowledgeId, knowledgeAloneId, speedrunId };
}

async function board(w: World, challengeId: string): Promise<BoardRow[]> {
	const { rows } = await w.db.asUser(w.honest.id, (q) =>
		q<BoardRow>(
			`select mode, user_id, player, is_correct, score_metric, rank
			 from public.gauntlet_leaderboard where challenge_id = $1::uuid order by rank, player`,
			[challengeId]
		)
	);
	return rows;
}

const seatOf = (rows: BoardRow[], u: SeededUser) => rows.find((r) => r.user_id === u.id);

// ===========================================================================
// A. THE WORLD AS IT STANDS ON 0153. Every assertion below has to be able to
//    fail, and the only thing that proves it is the pre-migration board.
// ===========================================================================
describe('before 0154: the board as 0146 left it', () => {
	let w: World;
	beforeAll(async () => {
		w = await seedPreMigration();
	}, 300_000);
	afterAll(async () => {
		await w?.db.stop();
	});

	it('a WRONG knowledge answer holds a seat, and holds RANK ONE when it is alone', async () => {
		const alone = await board(w, w.knowledgeAloneId);
		expect(alone).toHaveLength(1);
		expect(alone[0].is_correct).toBe(false);
		expect(Number(alone[0].rank)).toBe(1);
	});

	it('but it does NOT outrank a correct answer, which is the half of the audit claim that was wrong', async () => {
		// `rank() over (order by is_correct desc nulls last, ...)` puts every
		// correct row above every incorrect one. The defect is the seat, not
		// the ordering, and this test exists so nobody re-derives the stronger
		// claim from the fix.
		const rows = await board(w, w.knowledgeId);
		expect(rows).toHaveLength(2);
		expect(seatOf(rows, w.honest)).toMatchObject({ is_correct: true, rank: '1' });
		expect(seatOf(rows, w.fast)).toMatchObject({ is_correct: false, rank: '2' });
	});

	it('a forged sub-floor modeling run ranks, and beats the honest run beside it', async () => {
		// Rank one is held by whichever of the two forged runs was marginally
		// faster, so the assertion is the ORDERING and not a fixed number: a
		// sub-floor run outranks the honest one, which is the whole defect.
		const rows = await board(w, w.speedrunId);
		const forged = seatOf(rows, w.fast);
		const honest = seatOf(rows, w.honest);
		expect(forged).toBeDefined();
		expect(honest).toBeDefined();
		expect(Number(forged!.rank)).toBeLessThan(Number(honest!.rank));
		expect(Number(forged!.score_metric)).toBeLessThan(FLOOR_MS / 1000);
		expect(Number(honest!.score_metric)).toBeGreaterThan(FLOOR_MS / 1000);
	});
});

// ===========================================================================
// B. THE SAME WORLD, WITH 0154 APPLIED OVER IT.
// ===========================================================================
describe('after 0154, applied over the seeded pre-migration rows', () => {
	let w: World;
	beforeAll(async () => {
		w = await seedPreMigration();
		// Seed one macro row with NO elapsed_ms key, which nothing in the
		// codebase has written since 0006 and which the file's own warning
		// branch counts. Inserted directly, deliberately: it is the shape no
		// RPC can emit, and the point is that the floor fails CLOSED on it.
		await w.db.sql(
			`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source)
			 values ($1::uuid, $2::uuid, 'speedrun', '{"volume_mm3": 1}'::jsonb, true, 0.02, 'macro')`,
			[w.both.id, w.knowledgeAloneId]
		);
		// Applying the real file over the real seeded rows. Every `raise notice`
		// branch in it runs here -- a malformed format string raises -- so this
		// call IS the test of the counting block, which cannot be asserted any
		// other way without parsing notices.
		await w.db.sql(MIGRATION_SQL);
	}, 300_000);
	afterAll(async () => {
		await w?.db.stop();
	});

	// --- knowledge ---------------------------------------------------------
	it('a CORRECT knowledge answer still ranks', async () => {
		const rows = await board(w, w.knowledgeId);
		expect(seatOf(rows, w.honest)).toMatchObject({ is_correct: true, rank: '1' });
	});

	it('an INCORRECT knowledge answer does not', async () => {
		const rows = await board(w, w.knowledgeId);
		expect(seatOf(rows, w.fast)).toBeUndefined();
		// 1 present against 2 before: the positive control for the exclusion.
		expect(rows).toHaveLength(1);
	});

	it('a board with nothing but wrong answers on it is EMPTY, not wrongly ranked', async () => {
		expect(await board(w, w.knowledgeAloneId)).toHaveLength(0);
	});

	it('no row anywhere on the board is incorrect, and correct rows remain', async () => {
		const { rows } = await w.db.asUser(w.honest.id, (q) =>
			q<{ wrong: string; right: string }>(
				`select count(*) filter (where is_correct is distinct from true)::text as wrong,
				        count(*) filter (where is_correct = true)::text as right
				 from public.gauntlet_leaderboard`
			)
		);
		expect(Number(rows[0].wrong)).toBe(0);
		expect(Number(rows[0].right)).toBeGreaterThan(0); // positive control
	});

	// --- modeling ----------------------------------------------------------
	it('a modeling run above the floor still ranks', async () => {
		const rows = await board(w, w.speedrunId);
		expect(seatOf(rows, w.honest)).toBeDefined();
		expect(Number(seatOf(rows, w.honest)!.score_metric)).toBeGreaterThan(FLOOR_MS / 1000);
	});

	it('a modeling run below the floor does not', async () => {
		const rows = await board(w, w.speedrunId);
		expect(seatOf(rows, w.fast)).toBeUndefined();
	});

	it('the floor removes the RUN, not the PLAYER: a student with both keeps their honest seat', async () => {
		const rows = await board(w, w.speedrunId);
		const kept = seatOf(rows, w.both);
		expect(kept).toBeDefined();
		expect(Number(kept!.score_metric)).toBeGreaterThan(FLOOR_MS / 1000);
	});

	it('a macro row carrying no elapsed_ms at all fails CLOSED', async () => {
		const rows = await board(w, w.knowledgeAloneId);
		expect(rows.every((r) => r.mode !== 'speedrun')).toBe(true);
	});

	// --- what must NOT have changed ----------------------------------------
	it('every run still RECORDS: not one submissions row was touched', async () => {
		const { rows } = await w.db.sql<{ n: string }>(
			`select count(*)::text as n from public.submissions
			 where mode = 'speedrun' and source = 'macro' and is_correct = true`
		);
		// four macro runs (fast, honest, both x2) plus the hand-seeded row.
		expect(Number(rows[0].n)).toBe(5);
	});

	it('a sub-floor run still PASSED and still carries its deviation band', async () => {
		const { rows } = await w.db.sql<{
			is_correct: boolean;
			band: string | null;
			ems: string;
		}>(
			`select is_correct, value ->> 'deviation_band' as band, value ->> 'elapsed_ms' as ems
			 from public.submissions
			 where user_id = $1::uuid and challenge_id = $2::uuid and source = 'macro'`,
			[w.fast.id, w.speedrunId]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].is_correct).toBe(true);
		expect(rows[0].band).not.toBeNull();
		expect(Number(rows[0].ems)).toBeLessThan(FLOOR_MS);
	});

	it('an above-floor run carries the same band field, so the band is not what moved', async () => {
		const { rows } = await w.db.sql<{ is_correct: boolean; band: string | null }>(
			`select is_correct, value ->> 'deviation_band' as band from public.submissions
			 where user_id = $1::uuid and challenge_id = $2::uuid and source = 'macro'`,
			[w.honest.id, w.speedrunId]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].is_correct).toBe(true);
		expect(rows[0].band).not.toBeNull();
	});

	it('the review console still shows the unranked run, with a null board rank', async () => {
		// 0152 selects from `submissions`; only its board_rank scalar reads the
		// view. Nothing becomes invisible to a teacher.
		const { rows } = await w.db.asUser(w.admin.id, (q) =>
			q<{ user_id: string; board_rank: number | null }>(
				`select user_id, board_rank from public.gauntlet_run_review(
					p_challenge_id => $1::uuid, p_observed_only => false, p_include_absent => true)`,
				[w.speedrunId]
			)
		);
		const forged = rows.filter((r) => r.user_id === w.fast.id);
		expect(forged.length).toBeGreaterThan(0);
		expect(forged.every((r) => r.board_rank === null)).toBe(true);
		// Positive control: somebody on this report DOES have a rank.
		expect(rows.some((r) => r.board_rank !== null)).toBe(true);
	});

	it('re-applying 0154 is a no-op', async () => {
		const beforeRows = await board(w, w.speedrunId);
		await w.db.sql(MIGRATION_SQL);
		expect(await board(w, w.speedrunId)).toEqual(beforeRows);
	});

	it('the view is still granted to authenticated and still refused to anon', async () => {
		const { rows } = await w.db.sql<{ a: boolean; b: boolean }>(
			`select has_table_privilege('anon', 'public.gauntlet_leaderboard', 'select') as a,
			        has_table_privilege('authenticated', 'public.gauntlet_leaderboard', 'select') as b`
		);
		expect(rows[0].a).toBe(false);
		expect(rows[0].b).toBe(true);
	});
});

// ===========================================================================
// C. MUTATION PROOF. Every exclusion above is re-run against a deliberately
//    WEAKENED 0154 -- permissive, per CLAUDE.md, because a predicate commented
//    out entirely fails closed and reddens nothing. The mutants are built from
//    a copy of the file's text held in memory; the file on disk is never
//    written to.
// ===========================================================================
describe('mutation proof: each term is what does the work', () => {
	/** Substitute, asserting the substitution actually hit something. */
	function mutate(from: string, to: string): string {
		expect(MIGRATION_SQL).toContain(from);
		const out = MIGRATION_SQL.split(from).join(to);
		expect(out).not.toEqual(MIGRATION_SQL);
		return out;
	}

	/** The file with its self-checks removed, so a mutant can apply at all. */
	const withoutChecks = (sql: string) => sql.split('do $chk$')[0];

	it('drop the correctness term and the wrong answer comes back', async () => {
		const w = await seedPreMigration();
		try {
			await w.db.sql(
				withoutChecks(
					mutate(
						'\twhere s.is_correct = true\n\t\tand (\n\t\t\ts.mode in',
						'\twhere true\n\t\tand (\n\t\t\ts.mode in'
					)
				)
			);
			const rows = await board(w, w.knowledgeId);
			expect(seatOf(rows, w.fast)).toBeDefined();
			expect(seatOf(rows, w.fast)!.is_correct).toBe(false);
			expect(await board(w, w.knowledgeAloneId)).toHaveLength(1);
		} finally {
			await w.db.stop();
		}
	}, 300_000);

	it('drop the floor and the forged run comes back at rank one', async () => {
		const w = await seedPreMigration();
		try {
			await w.db.sql(
				withoutChecks(
					mutate(
						"and (s.value ->> 'elapsed_ms')::numeric >= 30000",
						"and (s.value ->> 'elapsed_ms')::numeric >= 0"
					)
				)
			);
			const rows = await board(w, w.speedrunId);
			const forged = seatOf(rows, w.fast);
			expect(forged).toBeDefined();
			expect(Number(forged!.rank)).toBeLessThan(Number(seatOf(rows, w.honest)!.rank));
			expect(Number(forged!.score_metric)).toBeLessThan(FLOOR_MS / 1000);
		} finally {
			await w.db.stop();
		}
	}, 300_000);

	it('the two self-checks bite: a view that did not narrow is refused', async () => {
		const w = await seedPreMigration();
		try {
			// Section A reverted to 0146's predicate, section B left intact.
			// The behavioural checks must catch it rather than pass vacuously.
			const broken = mutate(
				'\twhere s.is_correct = true\n\t\tand (\n\t\t\ts.mode in',
				'\twhere true\n\t\tand (\n\t\t\ts.mode in'
			).split("and (s.value ->> 'elapsed_ms')::numeric >= 30000").join(
				"and (s.value ->> 'elapsed_ms')::numeric >= 0"
			);
			// The view still carries the literal 30000 in a COMMENT, so B1's
			// text tie still passes and the BEHAVIOURAL checks are what has to
			// fire. That is the point of them being behavioural.
			await expect(w.db.sql(broken)).rejects.toThrow(/0154:/);
		} finally {
			await w.db.stop();
		}
	}, 300_000);
});

// ===========================================================================
// D. THE TIE TO 0152. The floor's whole justification is that it equals
//    `gauntlet_run_review.p_fast_finish_seconds`, so every run it unranks is a
//    run that console reports. Nothing enforces that but the file's own check.
// ===========================================================================
describe('the floor is pinned to 0152 fast_finish, and the pin bites', () => {
	let db: TestDb;
	beforeAll(async () => {
		db = await startTestDb([...BASE, '0154_gauntlet_rank_what_is_checkable.sql']);
	}, 300_000);
	afterAll(async () => {
		await db?.stop();
	});

	it('0152 really does default fast_finish to 30, read from the catalog', async () => {
		const { rows } = await db.sql<{ a: string }>(
			`select pg_get_function_arguments(p.oid) as a from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'gauntlet_run_review'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].a).toContain('p_fast_finish_seconds integer DEFAULT 30');
	});

	it('the view carries that same number as its floor, in milliseconds', async () => {
		const { rows } = await db.sql<{ d: string }>(
			`select pg_get_viewdef('public.gauntlet_leaderboard'::regclass, true) as d`
		);
		expect(rows[0].d).toContain("(s.value ->> 'elapsed_ms'::text)::numeric) >= 30000");
	});

	it('raising the floor ABOVE 0152 reporting threshold is REFUSED', async () => {
		// The property that justifies the number is "everything unranked is
		// reported". A 60s floor against a 30s report breaks it, so the file
		// must refuse rather than apply half an argument.
		const drifted = MIGRATION_SQL.split("::numeric >= 30000")
			.join("::numeric >= 60000")
			.split('c_floor_s constant integer := 30;')
			.join('c_floor_s constant integer := 60;');
		expect(drifted).not.toEqual(MIGRATION_SQL);
		await expect(db.sql(drifted)).rejects.toThrow(/would be unranked and never reported/);
	});

	it('and the refusal is a real check, not the view tie firing first', async () => {
		// Same mutation with the two numbers left DISAGREEING: B1's view tie is
		// what should fire here. Both checks exist and neither shadows the
		// other.
		const mismatched = MIGRATION_SQL.split('c_floor_s constant integer := 30;').join(
			'c_floor_s constant integer := 44;'
		);
		await expect(db.sql(mismatched)).rejects.toThrow(/does not carry the 44000 ms floor/);
	});

	it('after those refusals the deployed view is untouched', async () => {
		const { rows } = await db.sql<{ d: string }>(
			`select pg_get_viewdef('public.gauntlet_leaderboard'::regclass, true) as d`
		);
		expect(rows[0].d).toContain('>= 30000');
		expect(rows[0].d).toContain('is_correct = true');
	});
});
