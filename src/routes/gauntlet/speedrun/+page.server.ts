import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { rankStateOf, type GauntletSeries, type RankState } from '$lib/gauntlet';
import { readBoard } from '$lib/gauntlet/board-selects';

/**
 * One row of the named-field projection in the load below. PostgREST flattens a `->>`
 * selection onto the row under the KEY's own name, so `prompt->>material`
 * arrives as `material`, a string (or null) rather than the authored type --
 * which is why `demo` is selected with `->` and compared to the boolean, and why
 * nothing numeric is selected at all.
 */
interface SpeedrunListRow {
	id: string;
	title: string;
	difficulty: number;
	series_id: string | null;
	series_order: number | null;
	material: string | null;
	mass_unit: string | null;
	model_path: string | null;
	demo: boolean | null;
}

/**
 * Speedrun challenge list. Loads published Speedrun challenges (framing only,
 * the dimensioned drawing stays hidden in `answer` until Start), the user's
 * best RANKED run per challenge from the leaderboard view (for bestTime/rank),
 * and `cleared` from the student's own `submissions` rows directly (0154's
 * client-side fix). `gauntlet_leaderboard` is a RANKING, not a history: since
 * 0154 it also drops a passing run under the 30s plausibility floor, so board
 * presence alone would read a genuine clear as never attempted.
 *
 * IT ASKS FOR NAMED FRAMING FIELDS, NOT FOR `prompt` (0153). It used to select
 * the whole column and read `target_mass` out of it, which put the level's
 * ranked answer on a card in a list, for every published level at once. Naming
 * the fields is what makes that a decision rather than a default: a key added to
 * `prompt` later arrives here only if somebody adds it to this list, and the
 * answer keys are not on it.
 *
 * IT IS NOT THE BOUNDARY, THOUGH, AND MUST NOT BE MISTAKEN FOR ONE. `0004`
 * grants `select (... prompt ...)` on `challenges` to `authenticated` and RLS
 * admits every published row, so a student reaches the whole column through
 * PostgREST without going near this loader. What actually closes the leak is
 * that the keys are no longer WRITTEN (`buildPayload`) and no longer STORED
 * (0153); this projection is the layer that stops the next field leaking by
 * accident.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', claims.sub)
		.single();

	const { data: challenges } = await supabase
		.from('challenges')
		.select(
			'id, title, difficulty, series_id, series_order, ' +
				'prompt->>material, prompt->>mass_unit, prompt->>model_path, prompt->demo'
		)
		.eq('mode', 'speedrun')
		.eq('published', true)
		.order('difficulty', { ascending: true })
		.order('created_at', { ascending: true });

	// Series definitions for the browse-by-series UI (0022).
	const { data: series } = await supabase
		.from('gauntlet_series')
		.select('id, name, description, sort_order')
		.order('sort_order', { ascending: true })
		.order('name', { ascending: true });

	// 0194: the board now carries a STATE, and it is read through the ladder in
	// `$lib/gauntlet/board-selects` because 0194 is applied by hand -- a
	// deployment between this code and the migration would otherwise report an
	// empty board on every Speedrun page.
	const { rows: mine } = await readBoard<{
		challenge_id: string;
		score_metric: number | null;
		rank: number | null;
		rank_state?: RankState;
	}>((columns) =>
		supabase
			.from('gauntlet_leaderboard')
			.select(columns)
			.eq('user_id', claims.sub)
			.eq('mode', 'speedrun')
			.then(({ data, error }) => ({
				data: data as unknown as Array<{
					challenge_id: string;
					score_metric: number | null;
					rank: number | null;
					rank_state?: RankState;
				}> | null,
				error
			})),
		['challenge_id, score_metric, rank, rank_state', 'challenge_id, score_metric, rank']
	);

	// A student's own history, never the board: the board (above) is a RANKING
	// and, since 0154, drops a passing run under the 30s plausibility floor from
	// the board entirely. That run was still genuinely cleared, so "cleared" is
	// read from the student's own `submissions` rows (RLS: own-row select,
	// granted since 0004), not from board presence. `mine` above still supplies
	// bestTime/rank, which are legitimately absent for a sub-floor clear.
	const { data: mySubmissions } = await supabase
		.from('submissions')
		.select('challenge_id, is_correct')
		.eq('user_id', claims.sub)
		.eq('mode', 'speedrun');

	const byChallenge = new Map(mine.map((r) => [r.challenge_id, r]));
	const clearedIds = new Set(
		(mySubmissions ?? [])
			.filter((s) => s.is_correct === true)
			.map((s) => s.challenge_id as string)
	);

	const list = (challenges ?? []).map((c) => {
		const row = c as unknown as SpeedrunListRow;
		const best = byChallenge.get(row.id);
		return {
			id: row.id,
			title: row.title,
			difficulty: row.difficulty,
			material: row.material ?? null,
			massUnit: row.mass_unit ?? 'g',
			demo: row.demo === true,
			// Storage path of the shape-only STL: the client renders (and caches)
			// the tile's isometric thumbnail from it, signing a URL only on miss.
			modelPath: row.model_path ?? null,
			seriesId: row.series_id ?? null,
			seriesOrder: row.series_order ?? null,
			cleared: clearedIds.has(row.id),
			bestTime: best?.score_metric ?? null,
			rank: best?.rank ?? null,
			// 0194: null when there is no board row at all (never played, or a
			// pre-0194 deployment that dropped a held run), so the tile can tell
			// "held" apart from "not attempted" -- which are the two things the
			// old null rank ran together.
			rankState: best ? rankStateOf(best) : null
		};
	});

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		challenges: list,
		series: (series ?? []) as GauntletSeries[]
		// `rankStateReady` IS DELIBERATELY NOT RETURNED. The ladder above still
		// uses it to pick a rung, but this page has no branch that needs it: a
		// held run has no board row at all on a pre-0194 deployment, so
		// `rankState` is null and the tile falls to its "cleared, no rank to
		// show" branch, which is the true, narrower sentence for that state.
		// Returning a flag nothing reads is the dormant fallback this codebase
		// keeps paying for. The DETAIL page does read it, because there the
		// chip is a thing that would otherwise be guessed at.
	};
};
