import { requireCoinArea } from '$lib/server/coin-scope';
import type { PageServerLoad } from './$types';

/**
 * Contracts (IDEA Coin V2 session two, 0248): a full coin admin's area
 * (decision 68). ContractsManager reads the list itself (coin_contracts_admin)
 * on mount, through callV2, so a database without 0248 says so in place. The
 * classes a contract may be restricted to are the layout's
 * `coinStaff.sections`: IDEA Classroom sections, never the retired coin
 * sections.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	await requireCoinArea(supabase, claims?.sub, 'contracts');
	return {};
};
