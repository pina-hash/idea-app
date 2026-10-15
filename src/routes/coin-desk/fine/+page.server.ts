import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

/**
 * THE FINE SCREEN (IDEA Coin V2). The coin desk layout's server load is the
 * admin gate for the whole group; this page asks the same question again as
 * its own first statement (SvelteKit runs a layout's server load and a page's
 * concurrently), so a non-admin or a visitor with no session gets 404 here
 * whatever the layout does. The RPCs the page calls are admin-only in the
 * database regardless; this is the page not existing for anybody else.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');
	return {};
};
