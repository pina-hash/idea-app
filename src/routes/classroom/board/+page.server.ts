import { redirect } from '@sveltejs/kit';
import { staffSections } from '$lib/classroom/staff-sections.server';
import type { PageServerLoad } from './$types';

/**
 * THE TEAM BOARD (ledger 0436, 0306). The team staff pages' one gate
 * (`staffSections`); the board's read (`classroom_team_board`) returns only
 * the classes the caller manages.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	return staffSections(supabase, claims);
};
