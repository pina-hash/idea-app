import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { GauntletSeries } from '$lib/gauntlet';

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
 * the dimensioned drawing stays hidden in `answer` until Start) plus the user's
 * best PASSING run per challenge from the leaderboard view. The view only ranks
 * passing modeling-mode submissions, so a row here means the student cleared it.
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

	const { data: mine } = await supabase
		.from('gauntlet_leaderboard')
		.select('challenge_id, score_metric, rank')
		.eq('user_id', claims.sub)
		.eq('mode', 'speedrun');

	const byChallenge = new Map((mine ?? []).map((r) => [r.challenge_id as string, r]));

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
			cleared: best !== undefined,
			bestTime: (best?.score_metric ?? null) as number | null,
			rank: (best?.rank ?? null) as number | null
		};
	});

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		challenges: list,
		series: (series ?? []) as GauntletSeries[]
	};
};
