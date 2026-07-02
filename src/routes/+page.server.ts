import type { PageServerLoad } from './$types';

/**
 * Homepage retention nudge: for a signed-in user, the GAUNTLET progression
 * aggregates (read-only, derived from graded submissions by the 0021 RPC)
 * plus the published challenge catalog, so the page can render the
 * "continue / next best" card (level, streak, suggested next drawing).
 * Anonymous visitors get null and no card. Fails soft to null before the
 * 0021 migration is applied.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		return { gauntletNudge: null };
	}

	const [{ data: progression }, { data: challenges }] = await Promise.all([
		supabase.rpc('gauntlet_progression'),
		supabase
			.from('challenges')
			.select('id, mode, title, difficulty')
			.eq('published', true)
	]);

	if (!progression) {
		return { gauntletNudge: null };
	}

	return {
		gauntletNudge: {
			progression,
			challenges: challenges ?? []
		}
	};
};
