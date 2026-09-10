// src/lib/gauntlet/board-selects.ts
//
// THE `gauntlet_leaderboard` SELECT LADDER (0194).
//
// `rank_state` is a column `0194` adds, and `0194` is applied BY HAND and
// separately -- so a deployment sitting between this code and the migration is
// a real state, not a hypothetical. PostgREST refuses a select naming a column
// that does not exist and fails the WHOLE select with `42703`, so a loader that
// simply asked for the column would report the board as empty on exactly that
// deployment: a blank leaderboard, on every Speedrun page, with nothing saying
// why.
//
// SO EVERY BOARD READ IS A LADDER: widest first, retried one capability
// narrower, ending on a select that works on the schema `0154` left behind.
//
// AND THE CAPABILITY REPORTS ITSELF. `rankStateReady` starts FALSE and is
// turned on only by a rung that actually included the column succeeding. A
// surface reads it to decide whether it may say anything about a held run at
// all -- "cannot tell" must never render as "ranked", which is the direction
// this would fail in silently.
//
// THE RUNGS ARE IN ONE MODULE RATHER THAN INLINE IN TWO ROUTES, per CLAUDE.md,
// and `tests/gauntlet-board-selects.test.ts` asserts they strictly narrow.

/** Columns every rung asks for, on every supported schema. */
export const BOARD_BASE_COLUMNS = 'challenge_id, user_id, player, score_metric, rank, created_at';

/**
 * The board read, widest first.
 *
 * Rung 0 names `rank_state` (0194). Rung 1 is the pre-0194 select, which is
 * `0154`'s schema exactly.
 */
export const BOARD_SELECT_RUNGS: readonly string[] = [
	`${BOARD_BASE_COLUMNS}, rank_state`,
	BOARD_BASE_COLUMNS
] as const;

/**
 * The same ladder for a read that wants only the caller's own row on one
 * challenge, where `player` and `created_at` are not used.
 */
export const MY_BEST_SELECT_RUNGS: readonly string[] = ['score_metric, rank, rank_state', 'score_metric, rank'] as const;

/** What a board read came back with, and what this deployment could tell. */
export interface BoardRead<Row> {
	rows: Row[];
	/**
	 * Did the rung that succeeded include `rank_state`. FALSE means 0194 is not
	 * applied here, so nothing on screen may claim a run is held or ranked
	 * beyond what `rank` itself says.
	 */
	rankStateReady: boolean;
}

/**
 * PostgREST's code for "no such column". THE CODE ALONE, never the message: a
 * runtime failure inside the read must fail closed rather than degrade to a
 * narrower answer that looks like a working board.
 */
const UNDEFINED_COLUMN = '42703';

/**
 * Run a board select down the ladder.
 *
 * `run` is handed one rung's column list and returns whatever the caller's
 * query builder produced. It is called at most once per rung, and only a
 * `42703` moves down -- every other error is returned as-is on the WIDEST rung,
 * because a permission failure or a dropped view is not a schema-version
 * question and answering it with a narrower select would turn a broken read
 * into an empty board.
 */
export async function readBoard<Row>(
	// `PromiseLike` and not `Promise`: a Supabase query builder is a thenable
	// rather than a real promise, so a caller chaining `.then(...)` on one hands
	// back a `PromiseLike`. Narrowing this to `Promise` costs every call site a
	// cast for no gain -- `await` accepts either.
	run: (columns: string) => PromiseLike<{ data: Row[] | null; error: { code?: string } | null }>,
	rungs: readonly string[] = BOARD_SELECT_RUNGS
): Promise<BoardRead<Row>> {
	for (let i = 0; i < rungs.length; i++) {
		const { data, error } = await run(rungs[i]);
		if (!error) {
			return { rows: data ?? [], rankStateReady: rungs[i].includes('rank_state') };
		}
		if (error.code !== UNDEFINED_COLUMN) break;
	}
	return { rows: [], rankStateReady: false };
}
