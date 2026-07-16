import type { PageServerLoad } from './$types';
import { loadItemOpens } from '$lib/fsp/item-opens';

/**
 * Homepage retention nudge: for a signed-in user, the GAUNTLET progression
 * aggregates (read-only, derived from graded submissions by the 0021 RPC)
 * plus the published challenge catalog, so the page can render the
 * "continue / next best" card (level, streak, suggested next drawing).
 * Anonymous visitors get null and no card. Fails soft to null before the
 * 0021 migration is applied.
 *
 * Also loads the signed-in student's FSP open-state (0048) so the pinned FSP
 * section can show which items they have already opened, cross-device. Fails
 * soft to an empty list before that migration is applied.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		return { gauntletNudge: null, fspOpened: [] as string[] };
	}

	const [{ data: progression }, { data: challenges }, fspOpened] = await Promise.all([
		supabase.rpc('gauntlet_progression'),
		supabase
			.from('challenges')
			.select('id, mode, title, difficulty')
			.eq('published', true),
		loadItemOpens(supabase, claims.sub)
	]);

	return {
		gauntletNudge: progression
			? { progression, challenges: challenges ?? [] }
			: null,
		fspOpened
	};
};
