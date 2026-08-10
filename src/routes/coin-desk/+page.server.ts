import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { CoinCategory } from '$lib/coin-desk';
import type { CoinSectionRow } from '$lib/coin-desk/sections';
import type { CoinRoleDefinition } from '$lib/coin-desk/roles';
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

	const [
		{ data: categories, error: catError },
		{ data: sections, error: sectionsError },
		{ data: roleDefinitions, error: rolesError },
		{ error: contractsError }
	] = await Promise.all([
		// Every LOGGABLE category regardless of active state (never
		// loggable=false mechanism rows like the system Eating Pass revoke
		// event) -- CategoriesManager (0080) needs to show retired categories
		// too, not just the ones a student can currently be charged.
		// CoinDeskTool.svelte's own `selectableCategories` derived value is
		// what filters this down to active-only for the logging dropdowns.
		supabase
			.from('coin_categories')
			.select(
				'id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label, formula_key, semester_point_cap, cap_period, cap_count, notes, active'
			)
			.eq('loggable', true)
			.order('sort_order'),
		// Sections (0073), for the bulk-log target picker and the section
		// manager card. Loaded via the definer RPC (not a table select) so
		// the same is_admin() gate every write on this schema uses also
		// governs this read.
		supabase.rpc('coin_admin_list_sections'),
		// Role definitions (0074) -- Shop Steward / Quartermaster / Safety
		// Officer / Lab Tech -- for RolesManager's ratio display and the
		// "log an application" role picker. A plain table select (RLS is
		// is_admin()-gated the same way coin_sections' select is), not an
		// RPC, since there is nothing to compute here.
		supabase
			.from('coin_role_definitions')
			.select(
				'id, name, description, ratio_kind, ratio_count, ratio_per_students, ratio_is_default, active, sort_order, notes, suggested_duration_days'
			)
			.eq('active', true)
			.order('sort_order'),
		// Contracts (0077) -- ContractsManager loads the real listing itself via
		// coin_admin_list_contracts() on mount (the RolesManager applications/
		// holders convention: a frequently-changing list, not a small admin-
		// edited definition table). This is only a cheap configured check, the
		// same shape as the sections/roles ones above.
		supabase.from('coin_contracts').select('id').limit(1)
	]);

	return {
		categories: (categories ?? []) as CoinCategory[],
		// Fails soft: 0070 not applied yet reads as an empty, clearly-flagged
		// category list rather than a crashed page.
		configured: !catError,
		sections: (sections ?? []) as CoinSectionRow[],
		// Fails soft the same way: 0073 not applied yet reads as an empty,
		// clearly-flagged section list rather than a crashed page.
		sectionsConfigured: !sectionsError,
		roleDefinitions: (roleDefinitions ?? []) as CoinRoleDefinition[],
		// Fails soft the same way again: 0074 not applied yet reads as an
		// empty, clearly-flagged role list rather than a crashed page.
		rolesConfigured: !rolesError,
		// Fails soft the same way once more: 0077 not applied yet reads as a
		// clearly-flagged "not available" card instead of a crashed page.
		contractsConfigured: !contractsError
	};
};
