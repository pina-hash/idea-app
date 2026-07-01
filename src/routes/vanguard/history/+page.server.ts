import { summarizeRuns, type VanguardRun } from '$lib/vanguard-history';
import type { PageServerLoad } from './$types';

/**
 * VANGUARD run-history portal page. Public route (NOT in the auth-guarded
 * prefixes): signed-out visitors get a sign-in prompt, signed-in players see
 * their own runs (own-row RLS on `vanguard_runs`). We fetch all of the user's
 * rows to summarize (a student's count is small), show the most recent ~50, and
 * compute the summary with the same helper the API uses.
 */

const RUN_COLUMNS =
	'id, user_id, created_at, mode, version, score, sector, accuracy, time_s, kills, bosses, coins_earned, primary_weapon, heavy_weapon, death_cause';

const RECENT_LIMIT = 50;

export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		return { signedIn: false as const };
	}

	const { data, error } = await supabase
		.from('vanguard_runs')
		.select(RUN_COLUMNS)
		.eq('user_id', claims.sub)
		.order('created_at', { ascending: false });

	if (error) {
		// Degrade to an empty (but signed-in) view rather than 500 the page.
		return { signedIn: true as const, runs: [], summary: summarizeRuns([]) };
	}

	const all = (data ?? []) as unknown as VanguardRun[];
	return {
		signedIn: true as const,
		runs: all.slice(0, RECENT_LIMIT),
		summary: summarizeRuns(all)
	};
};
