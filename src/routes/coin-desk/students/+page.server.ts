import type { CoinCategory } from '$lib/coin-desk';
import type { CoinSectionRow } from '$lib/coin-desk/sections';
import type { PageServerLoad } from './$types';

/**
 * Students: sections + rosters (0073), plus balance lookup and signed
 * adjustments by email (0070, moved here from /admin). Admin-gating lives
 * once in the group's +layout.server.ts.
 *
 * Unlike the Log area this loads EVERY section, archived ones included --
 * archiving is reversible and a section keeps its roster and history, so it
 * has to stay visible and reactivatable here.
 */
export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const [{ data: sections, error: sectionsError }, { data: categories }] = await Promise.all([
		supabase.rpc('coin_admin_list_sections'),
		// Just the kinds, for the balance panel's transaction rows: a row's kind
		// is what tells a BALANCE CORRECTION apart from an ordinary award or
		// fine. EVERY category, not just loggable ones -- a student's history
		// keeps rows logged under a category that has since been retired, and
		// those must still read correctly.
		// Since IDEA Coin V2 the name, pricing and active flag too: the student
		// tools record a purchase paid in coins and need the purchase list.
		supabase
			.from('coin_categories')
			.select(
				'id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label, formula_key, semester_point_cap, cap_period, cap_count, notes, active'
			)
			.order('sort_order')
	]);

	return {
		sections: (sections ?? []) as CoinSectionRow[],
		categoryKinds: Object.fromEntries(
			((categories ?? []) as { id: string; kind: string }[]).map((c) => [c.id, c.kind])
		) as Record<string, string>,
		categories: (categories ?? []) as CoinCategory[],
		// Fails soft: 0073 not applied yet reads as an empty, clearly-flagged
		// section list rather than a crashed page. The balance tool below it
		// only needs 0070 and keeps working either way.
		sectionsConfigured: !sectionsError
	};
};
