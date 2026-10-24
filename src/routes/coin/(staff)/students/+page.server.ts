import type { CoinCategory } from '$lib/coin-desk';
import { requireCoinArea } from '$lib/server/coin-scope';
import type { PageServerLoad } from './$types';

/**
 * Students (IDEA Coin V2 session two): one student, end to end. Section coin
 * staff open it over their own students; a full coin admin also gets the
 * tools (decision 68). The page asks for its tier as its own first
 * statement, because a layout's load and a page's run concurrently.
 *
 * The pre-V2 coin sections and the roster import are gone (0251): the class
 * list is the layout's `coinStaff.sections`, and a class's roster is read on
 * the client when it is picked (coin_fine_roster).
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	await requireCoinArea(supabase, claims?.sub, 'students');
	// Every category: the history's kinds (a retired category still names
	// rows), and the student tools' purchase list.
	const { data: categories } = await supabase
		.from('coin_categories')
		.select(
			'id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label, formula_key, semester_point_cap, cap_period, cap_count, notes, active'
		)
		.order('sort_order');

	const list = (categories ?? []) as CoinCategory[];
	return {
		categories: list,
		categoryKinds: Object.fromEntries(list.map((c) => [c.id, c.kind])) as Record<string, string>
	};
};
