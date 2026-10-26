import { redirect } from '@sveltejs/kit';
import { staffSections } from '$lib/classroom/staff-sections.server';
import type { PageServerLoad } from './$types';

/**
 * THE SIGN-OFF QUEUE (ledger 0436, 0304), phone first. The gate is the team
 * staff pages' one gate (`staffSections`); the queue itself re-checks every
 * request it shows (`classroom_signoff_queue`).
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	return staffSections(supabase, claims);
};
