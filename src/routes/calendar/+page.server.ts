import { redirect } from '@sveltejs/kit';
import { loadCalendar } from '$lib/server/calendar/load';
import type { PageServerLoad } from './$types';

/**
 * THE IDEA CALENDAR (ledger 0439): one page per signed-in person, every layer
 * they can see. `/calendar` is in `authedPrefixes`; the check here is the same
 * answer for a load reached any other way.
 */
export const load: PageServerLoad = async ({ url, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	return { calendar: await loadCalendar(supabase, url) };
};
