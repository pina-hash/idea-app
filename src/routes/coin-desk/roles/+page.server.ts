import { requireCoinArea } from '$lib/server/coin-scope';
import type { PageServerLoad } from './$types';

/**
 * Roles (IDEA Coin V2 session two, 0247): a full coin admin's area (decision
 * 68). RolesManager reads everything it shows in one call
 * (coin_roles_admin) on mount, through callV2, so a database without 0247
 * says so in place. Classes are IDEA Classroom sections; the retired coin
 * sections are read by nothing here.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	await requireCoinArea(supabase, claims?.sub, 'roles');
	return {};
};
