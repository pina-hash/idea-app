import type { CoinRoleDefinition } from '$lib/coin-desk/roles';
import type { CoinSectionRow } from '$lib/coin-desk/sections';
import type { PageServerLoad } from './$types';

/**
 * Roles (0074, real questions + expiration in 0076). Admin-gating lives once
 * in the group's +layout.server.ts.
 *
 * RolesManager loads the frequently-changing lists itself (applications,
 * holders, live capacity) on mount, so this load supplies only the two small
 * definition-shaped things it reads up front.
 */
export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const [{ data: roleDefinitions, error: rolesError }, { data: sections }] = await Promise.all([
		// Shop Steward / Quartermaster / Safety Officer / Lab Tech -- for the
		// ratio display and the "log an application" role picker. A plain
		// table select (RLS is is_admin()-gated the same way coin_sections'
		// select is), not an RPC, since there is nothing to compute here.
		supabase
			.from('coin_role_definitions')
			.select(
				'id, name, description, ratio_kind, ratio_count, ratio_per_students, ratio_is_default, active, sort_order, notes, suggested_duration_days'
			)
			.eq('active', true)
			.order('sort_order'),
		supabase.rpc('coin_admin_list_sections')
	]);

	return {
		roleDefinitions: (roleDefinitions ?? []) as CoinRoleDefinition[],
		// Fails soft: 0074 not applied yet reads as an empty, clearly-flagged
		// role list rather than a crashed page.
		rolesConfigured: !rolesError,
		// Active sections only: ratio capacity and the stipend payout are
		// about classes currently running.
		sections: ((sections ?? []) as CoinSectionRow[]).filter((s) => s.active)
	};
};
