import type { CoinCategory } from '$lib/coin-desk';
import type { CoinSectionRow } from '$lib/coin-desk/sections';
import type { PageServerLoad } from './$types';

/**
 * Log: the day-to-day view -- find a student, log a fine/award/purchase
 * against them or against a whole section. Admin-gating lives once in the
 * group's +layout.server.ts.
 *
 * This load fetches EXACTLY what this area needs and nothing more: the
 * route-group split replaced the old single page's shared, two-way-bound
 * state (one `sections` array wired from SectionManager into the bulk-log
 * picker) with per-route loading, so there is no cross-area coupling left to
 * keep in sync.
 */
export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const [{ data: categories, error: catError }, { data: sections, error: sectionsError }] =
		await Promise.all([
			// Loggable categories; the view filters to active-only for the
			// dropdowns (a retired category stays readable in a student's
			// history but can never be logged again). Editing the price list
			// itself lives on /coin-desk/economy.
			supabase
				.from('coin_categories')
				.select(
					'id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label, formula_key, semester_point_cap, cap_period, cap_count, notes, active'
				)
				.eq('loggable', true)
				.order('sort_order'),
			// Sections (0073), for the bulk-log target picker ONLY -- managing
			// them lives on /coin-desk/students. Loaded via the definer RPC
			// (not a table select) so the same is_admin() gate every write on
			// this schema uses also governs this read.
			supabase.rpc('coin_admin_list_sections')
		]);

	return {
		categories: (categories ?? []) as CoinCategory[],
		// Fails soft: 0070 not applied yet reads as an empty, clearly-flagged
		// category list rather than a crashed page.
		configured: !catError,
		// Only ACTIVE sections can be bulk-logged against, so the filter is
		// here rather than in the view -- an archived section keeps its roster
		// and history, it just stops being a target.
		sections: ((sections ?? []) as CoinSectionRow[]).filter((s) => s.active),
		// Fails soft the same way: 0073 not applied yet reads as a clearly
		// flagged "sections unavailable" note inside Section mode.
		sectionsConfigured: !sectionsError
	};
};
