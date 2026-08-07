import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { CoinCategory } from '$lib/coin-desk';
import type { CoinSectionRow } from '$lib/coin-desk/sections';
import type { PageServerLoad } from './$types';

/**
 * The day-to-day IDEA Coin entry tool (0070): log fines, awards, and
 * purchases against the real ledger. Admin-only, same as /admin and
 * /coin-entry's teacher gate -- but this gates on is_admin() specifically
 * (0067: teacher alone grants nothing elevated), not profiles.role, since
 * every write RPC this page calls is itself gated on is_admin().
 *
 * A non-admin gets 404, not a redirect -- the /admin rule, so a probing
 * request learns nothing about whether the page exists. Deliberately NOT in
 * hooks.server.ts authedPrefixes for the same reason: an anonymous visitor
 * should get the same 404 a signed-in non-admin gets.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

	const [{ data: categories, error: catError }, { data: sections, error: sectionsError }] =
		await Promise.all([
			supabase
				.from('coin_categories')
				.select(
					'id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label, formula_key, semester_point_cap, cap_period, cap_count, notes'
				)
				.eq('active', true)
				.eq('loggable', true)
				.order('sort_order'),
			// Sections (0073), for the bulk-log target picker and the section
			// manager card. Loaded via the definer RPC (not a table select) so
			// the same is_admin() gate every write on this schema uses also
			// governs this read.
			supabase.rpc('coin_admin_list_sections')
		]);

	return {
		categories: (categories ?? []) as CoinCategory[],
		// Fails soft: 0070 not applied yet reads as an empty, clearly-flagged
		// category list rather than a crashed page.
		configured: !catError,
		sections: (sections ?? []) as CoinSectionRow[],
		// Fails soft the same way: 0073 not applied yet reads as an empty,
		// clearly-flagged section list rather than a crashed page.
		sectionsConfigured: !sectionsError
	};
};
