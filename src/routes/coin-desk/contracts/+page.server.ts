import type { CoinSectionRow } from '$lib/coin-desk/sections';
import type { PageServerLoad } from './$types';

/**
 * Contracts (0077). Admin-gating lives once in the group's
 * +layout.server.ts.
 *
 * ContractsManager loads the real listing itself via
 * coin_admin_list_contracts() on mount (a frequently-changing list, not a
 * small admin-edited definition table), so this load only supplies the
 * section list its optional "restrict to a section" picker offers, plus a
 * cheap configured check.
 */
export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const [{ data: sections }, { error: contractsError }] = await Promise.all([
		supabase.rpc('coin_admin_list_sections'),
		supabase.from('coin_contracts').select('id').limit(1)
	]);

	return {
		// Active sections only: a contract restricted to an archived section
		// would be claimable by nobody.
		sections: ((sections ?? []) as CoinSectionRow[]).filter((s) => s.active),
		// Fails soft: 0077 not applied yet reads as a clearly-flagged "not
		// available" card instead of a crashed page.
		contractsConfigured: !contractsError
	};
};
