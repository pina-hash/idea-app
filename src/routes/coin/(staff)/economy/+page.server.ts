import type { CoinCategory } from '$lib/coin-desk';
import { requireCoinArea } from '$lib/server/coin-scope';
import type { PageServerLoad } from './$types';

/**
 * Economy: the category price list (0080). A full coin admin's area
 * (decision 68); the page asks for it as its own first statement. Paying out
 * coins moved to Payday (IDEA Coin V2 session two).
 *
 * Unlike the Log area this loads EVERY loggable category regardless of
 * active state -- CategoriesManager has to show retired rows too, since
 * retiring is reversible and is the only way a category ever leaves the
 * loggable lists (there is no delete RPC, deliberately).
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	await requireCoinArea(supabase, claims?.sub, 'economy');
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
