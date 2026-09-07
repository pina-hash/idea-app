// tests/gauntlet-leaderboard-history.test.ts
//
// 0154's own header names a regression it could not fix, because it lives
// under `src/`: `gauntlet_leaderboard` is a RANKING, and four list loaders --
// speedrun/+page.server.ts and the three knowledge-mode list route servers
// (drawing-reading, gdt-tolerance, spot-the-error) -- were reading it as a
// HISTORY of what a student has done. Since 0154 the board drops a wrong
// knowledge answer and a sub-floor modeling pass entirely, so a loader that
// derives "attempted"/"cleared" from board PRESENCE now answers wrong: a
// student who genuinely tried (and was wrong) reads as never having tried,
// and a student who genuinely cleared a level (under the floor) reads as
// never having cleared it.
//
// The fix reads `submissions` directly for a student's own history (RLS: "read
// own submissions", granted since 0004 -- no new RPC, no new grant) and keeps
// the board as the source for bestTime/rank, which are legitimately absent for
// an unranked run. This file proves that against a REAL Postgres with 0154
// APPLIED, because a claim about what these loaders read off a pre-0154 board
// proves nothing about the regression 0154 introduced.
//
// TWO PAGE KINDS, per CLAUDE.md's mutation-proof standard: speedrun (only
// `cleared`, no `attempted` field) and one knowledge mode driven fully against
// the database, plus a source-level equivalence sweep proving the other two
// knowledge modes carry the identical fix rather than the pre-0154 shape.
//
// MUTATION PROOF: each DB-driven assertion is re-run against a MUTANT of the
// loader that reverts to the pre-fix, board-presence-only derivation. The
// mutant is a NEW temporary file written beside the original and deleted in a
// `finally`; the original on disk is never touched, so there is nothing to
// restore and no `git checkout --` anywhere near this.
//
// THE SECOND HALF: THE SITES 0154's HEADER CALLED "NOT AFFECTED". That header
// says the home page (`/gauntlet/+page.server.ts`) and `nextUncleared`
// (`$lib/gauntlet/next-challenge.ts`) filter `is_correct` themselves and so
// were "already ignoring exactly the rows section 1 removes". That is true of
// a WRONG knowledge answer and false of a FAST CORRECT modeling run: the row
// is not in the view at all, so there is nothing to filter, and the clear is
// simply not counted. A student whose only pass on a level was under the
// floor read "0 of N cleared" on the mode grid and was re-offered that level
// as "next" after every run. The two modeling lists that 0146 keeps OFF the
// board altogether (feature-golf, reverse-engineer) had the same defect in a
// stronger form: `cleared: best !== undefined` off a board that never holds a
// row for their mode, so `cleared` was false for every level, always. All
// four now read `submissions`; the home loader and `nextUncleared` are driven
// against the real database here, with mutants, and the two modeling lists
// are swept at source level against the speedrun loader as positive control.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { load as SPEEDRUN_LOAD } from '../src/routes/gauntlet/speedrun/+page.server';
import { load as DRAWING_READING_LOAD } from '../src/routes/gauntlet/drawing-reading/+page.server';
import { load as HOME_LOAD } from '../src/routes/gauntlet/+page.server';
import { nextUncleared } from '../src/lib/gauntlet/next-challenge';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const SPEEDRUN_ROUTE = join(ROOT, 'src/routes/gauntlet/speedrun/+page.server.ts');
const DRAWING_READING_ROUTE = join(ROOT, 'src/routes/gauntlet/drawing-reading/+page.server.ts');
const GDT_TOLERANCE_ROUTE = join(ROOT, 'src/routes/gauntlet/gdt-tolerance/+page.server.ts');
const SPOT_THE_ERROR_ROUTE = join(ROOT, 'src/routes/gauntlet/spot-the-error/+page.server.ts');
const HOME_ROUTE = join(ROOT, 'src/routes/gauntlet/+page.server.ts');
const NEXT_CHALLENGE_MODULE = join(ROOT, 'src/lib/gauntlet/next-challenge.ts');
const FEATURE_GOLF_ROUTE = join(ROOT, 'src/routes/gauntlet/feature-golf/+page.server.ts');
const REVERSE_ENGINEER_ROUTE = join(ROOT, 'src/routes/gauntlet/reverse-engineer/+page.server.ts');

const MIGRATION_FILE = new URL(
	'../supabase/migrations/0154_gauntlet_rank_what_is_checkable.sql',
	import.meta.url
);
const MIGRATION_SQL = readFileSync(MIGRATION_FILE, 'utf8');

const FLOOR_MS = 30_000;
const TARGET_VOLUME_MM3 = 61237.4408;

/**
 * The two speedrun fixture levels, by TITLE. The inserts below and every
 * assertion message in the home-loader and `nextUncleared` describes read
 * these, so a failure names the level still locked rather than "the level".
 */
const SPEEDRUN_TITLE = 'History fixture: speedrun';
const SPEEDRUN_TITLE_2 = 'History fixture: speedrun II';

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
	// 0019 purges the nine seeded demo challenges (three of them speedrun,
	// published, difficulty 1). Without it the published speedrun set is the
	// three demos plus this file's two, and `nextUncleared` offers a demo
	// level first -- the same position it holds in the landing-gate chain.
	'0019_gauntlet_purge_demo.sql',
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
	// PRE-EXISTING, not fixed here: 0137 sits mid-chain and 0154 is applied by hand after it with no re-sweep; nothing in this file runs as `anon`, so no assertion depends on it.
	'0137_anon_execute_sweep.sql',
	'0146_gauntlet_reveal_all_modeling_modes.sql',
	'0147_gauntlet_close_target_disclosure.sql',
	'0148_gauntlet_knowledge_clock.sql',
	'0150_gauntlet_connect_run_analysis.sql',
	'0151_gauntlet_meter_practice.sql',
	'0152_gauntlet_run_review.sql',
	'0153_gauntlet_unpublish_the_target.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let untouched: SeededUser;
let knowledgeWrongOnly: SeededUser;
let knowledgeCorrect: SeededUser;
let speedrunSubFloor: SeededUser;
let speedrunHonest: SeededUser;

let drawingReadingId: string;
let speedrunId: string;
/** A SECOND published speedrun level, difficulty 2, created after the first. */
let speedrunId2: string;

function client(who: SeededUser) {
	return createPostgrestShim(db, fks, who.id);
}

type Shim = ReturnType<typeof createPostgrestShim>;

/**
 * `nextUncleared` excludes the level just played with `.neq('id', excludeId)`,
 * and the shared shim does not model `neq` (its filter set is eq / in / is /
 * not.is / lte, and it is a shared instrument this file does not edit). This
 * wrapper hands every other call straight to the shim and applies the ONE
 * `neq` afterwards, in JS, over rows the real query answered under real RLS.
 * So what is proven through it is the helper's `cleared` derivation against
 * the real database; only the exclusion of the just-played level is applied a
 * step later than PostgREST would apply it. It THROWS when a row lacks the
 * column the neq names, so it cannot silently turn into a no-op the way a
 * permissive shim would (the shim's own rule: throw rather than guess).
 */
function withNeq(base: Shim) {
	return {
		rpc: (name: string, args?: Record<string, unknown>) => base.rpc(name, args),
		from(table: string) {
			return {
				select(select: string) {
					const query = base.from(table).select(select);
					const neqs: Array<{ column: string; value: unknown }> = [];
					/* eslint-disable @typescript-eslint/no-explicit-any */
					const wrapped: any = {
						eq(column: string, value: unknown) {
							query.eq(column, value);
							return wrapped;
						},
						neq(column: string, value: unknown) {
							neqs.push({ column, value });
							return wrapped;
						},
						order(column: string, opts?: { ascending?: boolean }) {
							query.order(column, opts);
							return wrapped;
						},
						then(onfulfilled?: (v: any) => any, onrejected?: (e: unknown) => any) {
							return query
								.then((out) => {
									if (!Array.isArray(out.data) || neqs.length === 0) return out;
									const rows = out.data as Record<string, unknown>[];
									for (const { column } of neqs) {
										if (rows.some((r) => !(column in r))) {
											throw new Error(`neq names a column the select did not project: ${column}`);
										}
									}
									return {
										...out,
										data: rows.filter((r) => neqs.every((n) => r[n.column] !== n.value))
									};
								})
								.then(onfulfilled, onrejected);
						}
					};
					/* eslint-enable @typescript-eslint/no-explicit-any */
					return wrapped;
				}
			};
		}
	};
}

interface SpeedrunLoadResult {
	challenges: Array<{ id: string; cleared: boolean; bestTime: number | null; rank: number | null }>;
}

interface KnowledgeLoadResult {
	challenges: Array<{
		id: string;
		cleared: boolean;
		attempted: boolean;
		bestTime: number | null;
		rank: number | null;
	}>;
}

async function driveSpeedrun(who: SeededUser): Promise<SpeedrunLoadResult> {
	const out = await SPEEDRUN_LOAD({
		locals: {
			supabase: client(who),
			claims: { sub: who.id, email: who.email, role: 'authenticated' }
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);
	return out as unknown as SpeedrunLoadResult;
}

async function driveDrawingReading(who: SeededUser): Promise<KnowledgeLoadResult> {
	const out = await DRAWING_READING_LOAD({
		locals: {
			supabase: client(who),
			claims: { sub: who.id, email: who.email, role: 'authenticated' }
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);
	return out as unknown as KnowledgeLoadResult;
}

interface HomeLoadResult {
	canAuthorGauntlet: boolean;
	modeStats: {
		totals: Record<string, number>;
		cleared: Record<string, number>;
		idsByMode: Record<string, string[]>;
	};
	progression: unknown;
}

/**
 * Drives the home loader through the shim. Besides the two reads under proof
 * it calls `gauntlet_progression` (0021, in the chain, a jsonb scalar) and
 * `canAuthorGauntlet`, which calls `gauntlet_can_author` (0155, NOT in this
 * chain: it is numbered after 0154, which this file applies by hand after
 * seeding, so adding it to the chain would apply it out of order). The shim
 * answers the missing function with `PGRST202` -- the one code that helper
 * degrades on -- and it falls through to `is_admin()`, which is false for
 * every fixture student. That is a real deployment state (0155 unapplied) and
 * is covered on its own in gauntlet-landing-authoring-gate.test.ts; nothing
 * asserted here reads `canAuthorGauntlet`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function driveHome(who: SeededUser, load: any = HOME_LOAD): Promise<HomeLoadResult> {
	const out = await load({
		locals: {
			supabase: client(who),
			claims: { sub: who.id, email: who.email, role: 'authenticated' }
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any);
	return out as unknown as HomeLoadResult;
}

/** Drives `nextUncleared` (real or mutant) for the speedrun mode. */
async function driveNext(
	who: SeededUser,
	excludeId: string,
	next: typeof nextUncleared = nextUncleared
) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return next(withNeq(client(who)) as any, who.id, 'speedrun', '/gauntlet/speedrun', excludeId);
}

/**
 * Imports a MUTANT of the module at `originalPath`: a temporary copy with
 * `transform` applied, written at `mutantPath` (a sibling, so its
 * relative/alias imports resolve exactly as the original's do -- the home
 * loader imports `./$types` and `$lib/server/gauntlet-authoring`, and a copy
 * anywhere else would resolve neither) and deleted before returning. The
 * transform must actually change the source, or the mutant is not a mutant
 * and the proof is vacuous.
 */
async function withMutantModule<T>(
	originalPath: string,
	mutantPath: string,
	transform: (src: string) => string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	run: (mod: any) => Promise<T>
): Promise<T> {
	const src = readFileSync(originalPath, 'utf8');
	const mutated = transform(src);
	expect(mutated, 'mutation did not change the source').not.toBe(src);
	writeFileSync(mutantPath, mutated, 'utf8');
	try {
		const url = `${pathToFileURL(mutantPath).href}?t=${Date.now()}`;
		return await run(await import(/* @vite-ignore */ url));
	} finally {
		rmSync(mutantPath, { force: true });
	}
}

/**
 * Runs the given route loader as a MUTANT (see `withMutantModule`): the
 * temporary copy is `+page.server.mutant-<uuid>.ts` beside the route.
 */
async function withMutant<T>(
	routePath: string,
	transform: (src: string) => string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	run: (load: any) => Promise<T>
): Promise<T> {
	return withMutantModule(
		routePath,
		join(dirname(routePath), `+page.server.mutant-${randomUUID()}.ts`),
		transform,
		(mod) => run(mod.load)
	);
}

/**
 * Reverts a `submissions` history read to the board read it replaced. The
 * source must carry EXACTLY ONE `.from('submissions')`, so the mutant is the
 * whole revert rather than half of one: the board carries `challenge_id`,
 * `mode` and `is_correct` too, so the mutant compiles, runs, and answers off
 * board presence exactly as the pre-fix code did.
 */
const revertBoardRead = (src: string) => {
	expect(src.split(`.from('submissions')`).length - 1, 'exactly one submissions read').toBe(1);
	return src.replace(`.from('submissions')`, `.from('gauntlet_leaderboard')`);
};

/**
 * Replaces the home loader's DISTINCT count (the size of a per-mode Set of
 * challenge ids) with the naive per-row `+ 1` over the same submissions
 * read. The two guards (`is_correct`, published id) are repeated verbatim,
 * so the ONE thing that changes is distinctness: a level cleared twice
 * counts twice. The Set is still built and simply unread; the mutant is a
 * temp file esbuild transpiles and never type-checks, so the unused local
 * costs nothing. The line is matched whole, so a loader that rephrases it
 * fails the count below rather than silently producing a non-mutant.
 */
const DISTINCT_COUNT_LINE =
	'\tfor (const [mode, ids] of Object.entries(clearedIds)) cleared[mode] = ids.size;';
const naiveRowCount = (src: string) => {
	expect(src.split(DISTINCT_COUNT_LINE).length - 1, 'exactly one distinct-count line').toBe(1);
	return src.replace(
		DISTINCT_COUNT_LINE,
		[
			'\tfor (const row of mine ?? []) {',
			'\t\tif (row.is_correct !== true) continue;',
			'\t\tif (!idsByMode[row.mode]?.includes(row.challenge_id)) continue;',
			'\t\tcleared[row.mode] = (cleared[row.mode] ?? 0) + 1;',
			'\t}'
		].join('\n')
	);
};

/** Reverts the speedrun loader's `cleared` to the pre-fix, board-presence read. */
const revertSpeedrun = (src: string) =>
	src.replace('cleared: clearedIds.has(row.id),', 'cleared: best !== undefined,');

/** Reverts a knowledge loader's `cleared`/`attempted` to the pre-fix reads. */
const revertKnowledge = (src: string) =>
	src.replace(
		'cleared: clearedIds.has(c.id as string),\n\t\t\tattempted: attemptedIds.has(c.id as string),',
		'cleared: best?.is_correct === true,\n\t\t\tattempted: best !== undefined,'
	);

beforeAll(async () => {
	db = await startTestDb(CHAIN as unknown as string[]);
	fks = await loadForeignKeys(db);

	untouched = await createUser(db, 'untouched@boscotech.net', 'Never Tried');
	knowledgeWrongOnly = await createUser(db, 'wrong@boscotech.net', 'Wrong Only');
	knowledgeCorrect = await createUser(db, 'correct@boscotech.net', 'Got It Right');
	speedrunSubFloor = await createUser(db, 'subfloor@boscotech.net', 'Sub Floor');
	speedrunHonest = await createUser(db, 'honest@boscotech.net', 'Honest Modeller');

	const { rows: k } = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, status, prompt, answer)
		 values ('drawing_reading', 'History fixture: knowledge', 1, 'published', '{}'::jsonb, $1::jsonb)
		 returning id`,
		[JSON.stringify({ correct: 'b' })]
	);
	drawingReadingId = k[0].id;

	const { rows: s } = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, status, prompt, answer)
		 values ('speedrun', $2::text, 1, 'published', '{}'::jsonb, $1::jsonb)
		 returning id`,
		[
			JSON.stringify({ target_volume_mm3: TARGET_VOLUME_MM3, tolerance_pct: 0.1, density: 2.7 }),
			SPEEDRUN_TITLE
		]
	);
	speedrunId = s[0].id;

	// Second level, harder, created after (its own statement, so `created_at`
	// is strictly later): what `nextUncleared` offers once the first is clear.
	const { rows: s2 } = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, status, prompt, answer)
		 values ('speedrun', $2::text, 2, 'published', '{}'::jsonb, $1::jsonb)
		 returning id`,
		[
			JSON.stringify({ target_volume_mm3: TARGET_VOLUME_MM3, tolerance_pct: 0.1, density: 2.7 }),
			SPEEDRUN_TITLE_2
		]
	);
	speedrunId2 = s2[0].id;

	// --- knowledge: wrong-only history ----------------------------------
	await db.asUser(knowledgeWrongOnly.id, (q) =>
		q(`select public.gauntlet_submit($1::uuid, '{"answer":"a"}'::jsonb, 4000)`, [drawingReadingId])
	);

	// --- knowledge: a genuine, correct clear -----------------------------
	await db.asUser(knowledgeCorrect.id, (q) =>
		q(`select public.gauntlet_submit($1::uuid, '{"answer":"b"}'::jsonb, 20000)`, [drawingReadingId])
	);

	// --- modeling: forged (sub-floor) pass and an honest one -------------
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

	const forged = await run(speedrunSubFloor, null);
	// A SECOND sub-floor pass by the same student on the SAME level. This is
	// the real repeat path, not a backdated copy: a second reveal mints a new
	// code, `gauntlet_macro_submit` refuses only a REUSED code (0147), and
	// `submissions` carries no unique key (0004), so the table now holds two
	// `is_correct` rows for one (player, level). That is what makes DISTINCT
	// counting observable: the board gave one row per (player, challenge),
	// `submissions` gives one per ATTEMPT, and a per-row count reads this as
	// two clears of a two-level mode. Sub-floor again, so the student still
	// holds no board row and the premise describe below stays true.
	const forgedAgain = await run(speedrunSubFloor, null);
	const honestRun = await run(speedrunHonest, 420);

	// The fixture premise, asserted rather than assumed.
	expect(Number(forged.elapsed_ms)).toBeLessThan(FLOOR_MS);
	expect(Number(forgedAgain.elapsed_ms)).toBeLessThan(FLOOR_MS);
	expect(Number(honestRun.elapsed_ms)).toBeGreaterThan(FLOOR_MS);

	// Now apply 0154 for real: the WHOLE point is that the loaders are proven
	// against a board that has already had this file applied over it.
	await db.sql(MIGRATION_SQL);
}, 300_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
// The premise: 0154 really did remove these rows from the board.
// ===========================================================================
describe('the premise: the board (post-0154) really has dropped these seats', () => {
	it('the wrong knowledge answer holds no board row', async () => {
		const { rows } = await db.asUser(knowledgeWrongOnly.id, (q) =>
			q(
				`select 1 from public.gauntlet_leaderboard
				 where challenge_id = $1::uuid and user_id = $2::uuid`,
				[drawingReadingId, knowledgeWrongOnly.id]
			)
		);
		expect(rows).toHaveLength(0);
	});

	it('the sub-floor speedrun pass holds no board row', async () => {
		const { rows } = await db.asUser(speedrunSubFloor.id, (q) =>
			q(
				`select 1 from public.gauntlet_leaderboard
				 where challenge_id = $1::uuid and user_id = $2::uuid`,
				[speedrunId, speedrunSubFloor.id]
			)
		);
		expect(rows).toHaveLength(0);
	});

	it('the sub-floor student holds TWO passing submissions rows on the first level', async () => {
		// POSITIVE CONTROL for the distinct-count assertions below: the double
		// clear is really in the table, read under the student's own-row RLS,
		// so "still 1" cannot be true because the second run quietly failed.
		const { rows } = await db.asUser(speedrunSubFloor.id, (q) =>
			q<{ is_correct: boolean }>(
				`select is_correct from public.submissions
				 where challenge_id = $1::uuid and user_id = $2::uuid`,
				[speedrunId, speedrunSubFloor.id]
			)
		);
		expect(
			rows.map((r) => r.is_correct),
			`double clear on ${SPEEDRUN_TITLE}: two passing rows expected in submissions`
		).toEqual([true, true]);
	});
});

// ===========================================================================
// Knowledge page kind: drawing-reading, all three states, both fields.
// ===========================================================================
describe('drawing-reading list: history read from submissions, not the board', () => {
	it('a wrong-only history reads attempted, not cleared', async () => {
		const { challenges } = await driveDrawingReading(knowledgeWrongOnly);
		const row = challenges.find((c) => c.id === drawingReadingId)!;
		expect(row.attempted).toBe(true);
		expect(row.cleared).toBe(false);
		expect(row.bestTime).toBeNull();
		expect(row.rank).toBeNull();
	});

	it('a correct answer reads cleared and attempted, with a real time and rank', async () => {
		const { challenges } = await driveDrawingReading(knowledgeCorrect);
		const row = challenges.find((c) => c.id === drawingReadingId)!;
		expect(row.attempted).toBe(true);
		expect(row.cleared).toBe(true);
		expect(row.bestTime).not.toBeNull();
		expect(row.rank).not.toBeNull();
	});

	it('an untouched challenge reads as new', async () => {
		const { challenges } = await driveDrawingReading(untouched);
		const row = challenges.find((c) => c.id === drawingReadingId)!;
		expect(row.attempted).toBe(false);
		expect(row.cleared).toBe(false);
		expect(row.bestTime).toBeNull();
		expect(row.rank).toBeNull();
	});

	// --- mutation proof: the pre-fix, board-presence read gets all three wrong
	it('MUTATION PROOF: the pre-fix read fails the wrong-only case', async () => {
		const { challenges } = await withMutant<KnowledgeLoadResult>(DRAWING_READING_ROUTE, revertKnowledge, (load) =>
			load({
				locals: {
					supabase: client(knowledgeWrongOnly),
					claims: { sub: knowledgeWrongOnly.id, email: knowledgeWrongOnly.email, role: 'authenticated' }
				}
			})
		);
		const row = challenges.find((c: { id: string }) => c.id === drawingReadingId)!;
		// The regression this file exists to catch: board-presence says "never
		// attempted" for a student who genuinely, if wrongly, tried.
		expect(row.attempted).toBe(false);
	});

	it('MUTATION PROOF: the pre-fix read still gets the untouched and correct cases right', async () => {
		const untouchedOut = await withMutant<KnowledgeLoadResult>(DRAWING_READING_ROUTE, revertKnowledge, (load) =>
			load({
				locals: {
					supabase: client(untouched),
					claims: { sub: untouched.id, email: untouched.email, role: 'authenticated' }
				}
			})
		);
		const untouchedRow = untouchedOut.challenges.find((c: { id: string }) => c.id === drawingReadingId)!;
		expect(untouchedRow.attempted).toBe(false);
		expect(untouchedRow.cleared).toBe(false);

		const correctOut = await withMutant<KnowledgeLoadResult>(DRAWING_READING_ROUTE, revertKnowledge, (load) =>
			load({
				locals: {
					supabase: client(knowledgeCorrect),
					claims: { sub: knowledgeCorrect.id, email: knowledgeCorrect.email, role: 'authenticated' }
				}
			})
		);
		const correctRow = correctOut.challenges.find((c: { id: string }) => c.id === drawingReadingId)!;
		expect(correctRow.attempted).toBe(true);
		expect(correctRow.cleared).toBe(true);
	});
});

// ===========================================================================
// Modeling page kind: speedrun, all three states, the one field it exposes.
// ===========================================================================
describe('speedrun list: cleared read from submissions, not the board', () => {
	it('a sub-floor pass still reads cleared, having genuinely cleared it', async () => {
		const { challenges } = await driveSpeedrun(speedrunSubFloor);
		const row = challenges.find((c) => c.id === speedrunId)!;
		expect(row.cleared).toBe(true);
		// It does not rank, so there is no time or rank to show.
		expect(row.bestTime).toBeNull();
		expect(row.rank).toBeNull();
	});

	it('an honest, above-floor pass reads cleared, with a real time and rank', async () => {
		const { challenges } = await driveSpeedrun(speedrunHonest);
		const row = challenges.find((c) => c.id === speedrunId)!;
		expect(row.cleared).toBe(true);
		expect(row.bestTime).not.toBeNull();
		expect(row.rank).not.toBeNull();
	});

	it('an untouched challenge reads as new', async () => {
		const { challenges } = await driveSpeedrun(untouched);
		const row = challenges.find((c) => c.id === speedrunId)!;
		expect(row.cleared).toBe(false);
		expect(row.bestTime).toBeNull();
		expect(row.rank).toBeNull();
	});

	// --- mutation proof: the pre-fix, board-presence read loses the sub-floor clear
	it('MUTATION PROOF: the pre-fix read loses the sub-floor clear', async () => {
		const out = await withMutant<SpeedrunLoadResult>(SPEEDRUN_ROUTE, revertSpeedrun, (load) =>
			load({
				locals: {
					supabase: client(speedrunSubFloor),
					claims: { sub: speedrunSubFloor.id, email: speedrunSubFloor.email, role: 'authenticated' }
				}
			})
		);
		const row = out.challenges.find((c: { id: string }) => c.id === speedrunId)!;
		// The regression this file exists to catch: a genuine clear reads as
		// never cleared once the board (post-0154) drops the seat.
		expect(row.cleared).toBe(false);
	});

	it('MUTATION PROOF: the pre-fix read still gets the untouched and honest cases right', async () => {
		const untouchedOut = await withMutant<SpeedrunLoadResult>(SPEEDRUN_ROUTE, revertSpeedrun, (load) =>
			load({
				locals: {
					supabase: client(untouched),
					claims: { sub: untouched.id, email: untouched.email, role: 'authenticated' }
				}
			})
		);
		const untouchedRow = untouchedOut.challenges.find((c: { id: string }) => c.id === speedrunId)!;
		expect(untouchedRow.cleared).toBe(false);

		const honestOut = await withMutant<SpeedrunLoadResult>(SPEEDRUN_ROUTE, revertSpeedrun, (load) =>
			load({
				locals: {
					supabase: client(speedrunHonest),
					claims: { sub: speedrunHonest.id, email: speedrunHonest.email, role: 'authenticated' }
				}
			})
		);
		const honestRow = honestOut.challenges.find((c: { id: string }) => c.id === speedrunId)!;
		expect(honestRow.cleared).toBe(true);
	});
});

// ===========================================================================
// The other two knowledge modes: a source-level equivalence sweep, not a
// second full DB drive. `drawing-reading` above is proven behaviourally
// against a live database; this proves `gdt-tolerance` and `spot-the-error`
// carry the IDENTICAL fix (mode string aside) rather than the pre-0154 shape,
// which is what "find the equivalents" (the task) asks for without
// duplicating the same database proof four times over one shared pattern.
// ===========================================================================
describe('the other two knowledge-mode loaders carry the identical fix', () => {
	const knowledgeRoutes = [
		{ name: 'gdt-tolerance', path: GDT_TOLERANCE_ROUTE, mode: 'gdt_tolerance' },
		{ name: 'spot-the-error', path: SPOT_THE_ERROR_ROUTE, mode: 'spot_the_error' }
	] as const;

	it('POSITIVE CONTROL: the reference file (drawing-reading) itself matches the shape asserted below', () => {
		const src = readFileSync(DRAWING_READING_ROUTE, 'utf8');
		expect(src).toContain(`.from('submissions')`);
		expect(src).toContain(`.select('challenge_id, is_correct')`);
		expect(src).toContain('cleared: clearedIds.has(c.id as string),');
		expect(src).toContain('attempted: attemptedIds.has(c.id as string),');
	});

	for (const { name, path, mode } of knowledgeRoutes) {
		it(`${name}: reads its own \`submissions\` rows for \`cleared\`/\`attempted\``, () => {
			const src = readFileSync(path, 'utf8');
			expect(src, `${name} has no submissions read`).toContain(`.from('submissions')`);
			expect(src, `${name} does not select is_correct off submissions`).toContain(
				`.select('challenge_id, is_correct')`
			);
			// Filtered to this mode three times over: the challenges query, the
			// board query, and the new submissions query -- a loader that forgot
			// the mode filter on the new query would leak another mode's
			// attempts into this one's count.
			const modeFilterCount = (src.match(new RegExp(`\\.eq\\('mode', '${mode}'\\)`, 'g')) ?? []).length;
			expect(modeFilterCount, `${name} mode filter count`).toBe(3);
			expect(src, `${name} still derives cleared from clearedIds`).toContain(
				'cleared: clearedIds.has(c.id as string),'
			);
			expect(src, `${name} still derives attempted from attemptedIds`).toContain(
				'attempted: attemptedIds.has(c.id as string),'
			);
		});

		it(`${name}: the pre-0154-fix board-presence read is gone`, () => {
			const src = readFileSync(path, 'utf8');
			expect(src, `${name} still has the old cleared read`).not.toContain(
				'cleared: best?.is_correct === true,'
			);
			expect(src, `${name} still has the old attempted read`).not.toContain(
				'attempted: best !== undefined,'
			);
		});
	}
});

// ===========================================================================
// The home page's per-mode progression: 0154's header called this loader
// "NOT AFFECTED" because it filters `is_correct` itself. A sub-floor pass is
// `is_correct = true` and is simply NOT IN THE VIEW, so there was nothing to
// filter and the mode grid read "0 of N cleared" for a level genuinely
// cleared. Every assertion ABOUT A FIXTURE LEVEL in this describe and the
// `nextUncleared` one carries a message naming that level by TITLE
// (`SPEEDRUN_TITLE`, `SPEEDRUN_TITLE_2`) and the case it proves, so a failure
// reads as WHICH level is still locked, still not counted or still re-offered,
// never as "the level". The handful of catalog assertions (published modes,
// totals per mode, the 0008 seeds) name a mode instead, because a level title
// would say nothing there.
// ===========================================================================
describe('home page: cleared[mode] counted from submissions, not the board', () => {
	it('totals and idsByMode come from the published challenge list', async () => {
		const { modeStats } = await driveHome(untouched);
		// This file's two speedrun levels, and nothing else: 0019 purged the
		// three demo seeds. The knowledge modes still carry 0008's seeds, so
		// every mode's total is checked against the catalog rather than typed.
		expect(
			modeStats.totals.speedrun,
			`published speedrun count: ${SPEEDRUN_TITLE} and ${SPEEDRUN_TITLE_2}`
		).toBe(2);
		const { rows } = await db.sql<{ mode: string; n: number }>(
			`select mode, count(*)::int as n from public.challenges where published group by mode`
		);
		// POSITIVE CONTROL that 0008's knowledge seeds survived 0019's purge
		// (which keys on `prompt->>'demo'`, a flag the seeds do not carry). This
		// file's own fixtures account for exactly TWO published modes (speedrun
		// and drawing_reading), so "more than two" can only be cleared by the
		// seeded ones: 0008's six `gdt_tolerance` and five `spot_the_error`
		// rows, named here so the bound says what makes it true.
		const publishedModes = rows.map((r) => r.mode);
		expect(
			rows.length,
			'positive control: more published modes than the two this file seeds'
		).toBeGreaterThan(2);
		expect(publishedModes, "0008's gdt_tolerance seeds are published").toContain('gdt_tolerance');
		expect(publishedModes, "0008's spot_the_error seeds are published").toContain('spot_the_error');
		expect(modeStats.totals, 'totals per mode against the catalog').toEqual(
			Object.fromEntries(rows.map((r) => [r.mode, r.n]))
		);
		// THE ID SET AND THE `created_at` ORDER, and no more. The loader chains
		// `.order('difficulty').order('created_at')`, but the shared shim keeps
		// only the LAST `.order()` call -- its `order()` is
		// `this.orderBy = { column, ascending: opts?.ascending !== false };`, an
		// overwrite -- so through this instrument the query runs as
		// `order by created_at asc` alone. The fixture creates difficulty 1
		// before difficulty 2, so the two orderings agree here and the
		// difficulty leg is OUTSIDE what this assertion can check. A fixture
		// where they disagreed would fail against correct code through this
		// shim, which is why none is built and the shim is not edited.
		expect(
			modeStats.idsByMode.speedrun,
			`speedrun ids: the set {${SPEEDRUN_TITLE}, ${SPEEDRUN_TITLE_2}} in created_at order`
		).toEqual([speedrunId, speedrunId2]);
	});

	it('a sub-floor speedrun pass counts as cleared on the mode grid', async () => {
		const { modeStats } = await driveHome(speedrunSubFloor);
		expect(
			modeStats.cleared.speedrun ?? 0,
			`sub-floor pass on ${SPEEDRUN_TITLE} still reads as not cleared on the mode grid`
		).toBe(1);
		expect(
			modeStats.totals.speedrun,
			`published speedrun total beside the sub-floor clear on ${SPEEDRUN_TITLE}`
		).toBe(2);
	});

	it('a level cleared TWICE by the sub-floor student counts ONCE: distinct ids, not rows', async () => {
		// The fixture gave this student two passing `submissions` rows on the
		// first level (the premise describe reads them back). The board gave
		// one row per (player, challenge); `submissions` gives one per ATTEMPT,
		// so a per-row count would read this as "2 of 2", a two-level mode
		// fully clear off one level. The naive-count mutant below proves this
		// assertion bites.
		const { modeStats } = await driveHome(speedrunSubFloor);
		expect(
			modeStats.cleared.speedrun ?? 0,
			`double clear on ${SPEEDRUN_TITLE} (two passing rows, one level) counted twice instead of once`
		).toBe(1);
	});

	it('an honest, above-floor pass counts as cleared too', async () => {
		const { modeStats } = await driveHome(speedrunHonest);
		expect(
			modeStats.cleared.speedrun ?? 0,
			`honest pass on ${SPEEDRUN_TITLE} still reads as not cleared on the mode grid`
		).toBe(1);
	});

	it('an untouched student has cleared nothing', async () => {
		const { modeStats } = await driveHome(untouched);
		expect(
			modeStats.cleared.speedrun,
			`untouched student shows a clear on ${SPEEDRUN_TITLE} or ${SPEEDRUN_TITLE_2}`
		).toBeUndefined();
		expect(
			Object.keys(modeStats.cleared),
			'untouched student shows a clear in some mode'
		).toEqual([]);
	});

	it('a clear on a since-unpublished level is not counted, so cleared cannot exceed totals', async () => {
		// The board carried `where c.published`; `submissions` does not, so the
		// loader has to apply the bound itself. Unpublish the level the honest
		// student cleared (through `status`: since 0009 `published` is a
		// trigger-derived boolean and a direct write to it is overwritten),
		// read, and put it back in a `finally` so no later test sees the
		// fixture moved.
		await db.sql(`update public.challenges set status = 'draft' where id = $1::uuid`, [speedrunId]);
		try {
			const { modeStats } = await driveHome(speedrunHonest);
			expect(
				modeStats.totals.speedrun,
				`one published speedrun level left once ${SPEEDRUN_TITLE} is a draft`
			).toBe(1);
			expect(
				modeStats.cleared.speedrun,
				`honest clear on ${SPEEDRUN_TITLE}, unpublished since, was counted against the published total`
			).toBeUndefined();
		} finally {
			await db.sql(`update public.challenges set status = 'published' where id = $1::uuid`, [
				speedrunId
			]);
		}
		// POSITIVE CONTROL for the restore: the clear is counted again.
		const { modeStats } = await driveHome(speedrunHonest);
		expect(
			modeStats.cleared.speedrun ?? 0,
			`honest clear on ${SPEEDRUN_TITLE} not counted again once republished`
		).toBe(1);
	});

	// --- mutation proof: the board read loses the sub-floor clear and nothing else
	it('MUTATION PROOF: the board read answers 0 cleared for the sub-floor student', async () => {
		const { modeStats } = await withMutant<HomeLoadResult>(HOME_ROUTE, revertBoardRead, (load) =>
			driveHome(speedrunSubFloor, load)
		);
		// The regression this half of the file exists to catch: off the
		// post-0154 board the sub-floor clear is not there to be counted.
		expect(
			modeStats.cleared.speedrun ?? 0,
			`the board-read mutant still counted the sub-floor pass on ${SPEEDRUN_TITLE}, so the proof is vacuous`
		).toBe(0);
	});

	it('MUTATION PROOF: the board read still gets the honest and untouched cases right', async () => {
		const honest = await withMutant<HomeLoadResult>(HOME_ROUTE, revertBoardRead, (load) =>
			driveHome(speedrunHonest, load)
		);
		expect(
			honest.modeStats.cleared.speedrun ?? 0,
			`board-read mutant lost the honest clear on ${SPEEDRUN_TITLE}`
		).toBe(1);

		const nobody = await withMutant<HomeLoadResult>(HOME_ROUTE, revertBoardRead, (load) =>
			driveHome(untouched, load)
		);
		expect(
			nobody.modeStats.cleared.speedrun ?? 0,
			`board-read mutant invented a clear on ${SPEEDRUN_TITLE} for the untouched student`
		).toBe(0);
	});

	// --- mutation proof: a per-row count reads the double clear as two clears
	it('MUTATION PROOF: the per-row count answers 2 for the double clear and 1 for the honest student', async () => {
		const doubled = await withMutant<HomeLoadResult>(HOME_ROUTE, naiveRowCount, (load) =>
			driveHome(speedrunSubFloor, load)
		);
		// The proof that the distinct assertion above bites: with the Set gone,
		// two passing rows on one level count as two.
		expect(
			doubled.modeStats.cleared.speedrun ?? 0,
			`the per-row mutant did not count the double clear on ${SPEEDRUN_TITLE} twice, so the distinct assertion is vacuous`
		).toBe(2);

		// And the control that stops it passing vacuously: one row, one clear,
		// so the mutant agrees with the real loader on the honest student.
		const honest = await withMutant<HomeLoadResult>(HOME_ROUTE, naiveRowCount, (load) =>
			driveHome(speedrunHonest, load)
		);
		expect(
			honest.modeStats.cleared.speedrun ?? 0,
			`the per-row mutant miscounted the honest student's single clear on ${SPEEDRUN_TITLE}`
		).toBe(1);
	});
});

// ===========================================================================
// `nextUncleared`: the same "NOT AFFECTED" claim, the same hole. A student
// whose only pass on the first level was under the floor kept being offered
// that level as "next" after every run, because the board it read had no row
// for the clear. What is proven here is the `cleared` derivation; which of
// two UNCLEARED levels comes first rests on `created_at` alone through this
// shim (see the idsByMode note above), and the fixture makes the two
// orderings agree.
// ===========================================================================
describe('nextUncleared: cleared read from submissions, not the board', () => {
	it('the sub-floor student, having cleared the first level, is offered nothing after the second', async () => {
		const next = await driveNext(speedrunSubFloor, speedrunId2);
		expect(
			next,
			`sub-floor pass on ${SPEEDRUN_TITLE} not recognised: it is re-offered as next after ${SPEEDRUN_TITLE_2}`
		).toBeNull();
	});

	it('the sub-floor student, after the first level, is offered the second', async () => {
		const next = await driveNext(speedrunSubFloor, speedrunId);
		expect(
			next?.href,
			`after ${SPEEDRUN_TITLE}, the sub-floor student is not offered ${SPEEDRUN_TITLE_2} as next`
		).toBe(`/gauntlet/speedrun/${speedrunId2}`);
		expect(
			next?.title,
			`the level offered after ${SPEEDRUN_TITLE} is not titled ${SPEEDRUN_TITLE_2}`
		).toBe(SPEEDRUN_TITLE_2);
	});

	it('the honest student, having cleared the first level, is offered nothing after the second', async () => {
		expect(
			await driveNext(speedrunHonest, speedrunId2),
			`honest pass on ${SPEEDRUN_TITLE} not recognised: it is re-offered as next after ${SPEEDRUN_TITLE_2}`
		).toBeNull();
	});

	it('an untouched student is offered the first level', async () => {
		const next = await driveNext(untouched, speedrunId2);
		expect(
			next?.href,
			`untouched student not offered ${SPEEDRUN_TITLE} as next (the only uncleared level not excluded)`
		).toBe(`/gauntlet/speedrun/${speedrunId}`);
	});

	// --- mutation proof: the board read re-offers the cleared level
	it('MUTATION PROOF: the board read re-offers the sub-floor student their cleared level', async () => {
		const next = await withMutantModule(
			NEXT_CHALLENGE_MODULE,
			join(dirname(NEXT_CHALLENGE_MODULE), `mutant-${randomUUID()}.ts`),
			revertBoardRead,
			(mod) => driveNext(speedrunSubFloor, speedrunId2, mod.nextUncleared)
		);
		expect(
			next?.href,
			`the board-read mutant did not re-offer the sub-floor student ${SPEEDRUN_TITLE}, so the proof is vacuous`
		).toBe(`/gauntlet/speedrun/${speedrunId}`);
	});

	it('MUTATION PROOF: the board read still gets the honest and untouched cases right', async () => {
		const mutantPath = () => join(dirname(NEXT_CHALLENGE_MODULE), `mutant-${randomUUID()}.ts`);
		const honest = await withMutantModule(NEXT_CHALLENGE_MODULE, mutantPath(), revertBoardRead, (mod) =>
			driveNext(speedrunHonest, speedrunId2, mod.nextUncleared)
		);
		expect(honest, `board-read mutant re-offered the honest student ${SPEEDRUN_TITLE}`).toBeNull();

		const nobody = await withMutantModule(NEXT_CHALLENGE_MODULE, mutantPath(), revertBoardRead, (mod) =>
			driveNext(untouched, speedrunId2, mod.nextUncleared)
		);
		expect(
			nobody?.href,
			`board-read mutant did not offer the untouched student ${SPEEDRUN_TITLE}`
		).toBe(`/gauntlet/speedrun/${speedrunId}`);
	});
});

// ===========================================================================
// The two modeling lists 0146 keeps OFF the board: a source-level equivalence
// sweep against the speedrun loader (proven behaviourally above) as positive
// control. For these two modes the board never holds a row at all, so
// `cleared: best !== undefined` was false for every level, always.
// ===========================================================================
describe('the feature-golf and reverse-engineer lists carry the speedrun fix', () => {
	const modelingRoutes = [
		{ name: 'feature-golf', path: FEATURE_GOLF_ROUTE, mode: 'feature_golf' },
		{ name: 'reverse-engineer', path: REVERSE_ENGINEER_ROUTE, mode: 'reverse_engineer' }
	] as const;

	it('POSITIVE CONTROL: the reference file (speedrun) itself matches the shape asserted below', () => {
		const src = readFileSync(SPEEDRUN_ROUTE, 'utf8');
		expect(src).toContain(`.from('submissions')`);
		expect(src).toContain(`.select('challenge_id, is_correct')`);
		expect((src.match(/\.eq\('mode', 'speedrun'\)/g) ?? []).length).toBe(3);
		expect(src).toContain('cleared: clearedIds.has(row.id),');
		expect(src).not.toContain('cleared: best !== undefined,');
		// ... and `clearedIds` is DERIVED from that submissions read.
		expect(src).toContain('mySubmissions ?? []');
		expect(src).toContain('.filter((s) => s.is_correct === true)');
	});

	for (const { name, path, mode } of modelingRoutes) {
		it(`${name}: reads its own \`submissions\` rows for \`cleared\``, () => {
			const src = readFileSync(path, 'utf8');
			expect(src, `${name} has no submissions read`).toContain(`.from('submissions')`);
			expect(src, `${name} does not select is_correct off submissions`).toContain(
				`.select('challenge_id, is_correct')`
			);
			// Filtered to this mode three times over: the challenges query, the
			// board query, and the new submissions query -- a loader that forgot
			// the mode filter on the new query would count another mode's clears
			// as this one's.
			const modeFilterCount = (src.match(new RegExp(`\\.eq\\('mode', '${mode}'\\)`, 'g')) ?? []).length;
			expect(modeFilterCount, `${name} mode filter count`).toBe(3);
			expect(src, `${name} does not derive cleared from clearedIds`).toContain(
				'cleared: clearedIds.has(c.id as string),'
			);
			// `clearedIds` is DERIVED from the submissions read, not from some
			// third source that happens to share the name: the same two
			// spellings the speedrun loader (positive control above) uses.
			expect(src, `${name} does not build clearedIds off the submissions read`).toContain(
				'mySubmissions ?? []'
			);
			expect(src, `${name} does not filter the submissions read on is_correct`).toContain(
				'.filter((s) => s.is_correct === true)'
			);
		});

		it(`${name}: the board-presence read (false for every level of this mode) is gone`, () => {
			const src = readFileSync(path, 'utf8');
			expect(src, `${name} still derives cleared from board presence`).not.toContain(
				'cleared: best !== undefined,'
			);
		});
	}
});
