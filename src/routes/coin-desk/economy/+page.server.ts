import type { CoinCategory } from '$lib/coin-desk';
import type { PageServerLoad } from './$types';

/**
 * Economy: the category price list (0080) and paying out positive balances
 * (0079). Admin-gating lives once in the group's +layout.server.ts.
 *
 * Unlike the Log area this loads EVERY loggable category regardless of
 * active state -- CategoriesManager has to show retired rows too, since
 * retiring is reversible and is the only way a category ever leaves the
 * loggable lists (there is no delete RPC, deliberately). PayoutManager reads
 * its own candidate list from coin_balances on mount.
 */
export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const { data: categories, error: catError } = await supabase
		.from('coin_categories')
		.select(
			'id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label, formula_key, semester_point_cap, cap_period, cap_count, notes, active'
		)
		.eq('loggable', true)
		.order('sort_order');

	return {
		categories: (categories ?? []) as CoinCategory[],
		// Fails soft: 0070 not applied yet reads as an empty, clearly-flagged
		// list rather than a crashed page.
		configured: !catError
	};
};
