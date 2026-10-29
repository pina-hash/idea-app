import { redirect } from '@sveltejs/kit';
import { staffSections } from '$lib/classroom/staff-sections.server';
import type { PageServerLoad } from './$types';

/**
 * THE MACHINE WEEK (ledger 0456, report d23bc63d.3). The team staff pages' one
 * gate (`staffSections`); the read (`classroom_machine_week`) answers only the
 * classes the caller manages.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	return staffSections(supabase, claims);
};
