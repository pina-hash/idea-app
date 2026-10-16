import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

/**
 * Profile picture moderation (ledger 0392, migration 0267). A non-admin gets
 * 404 rather than a redirect (the /admin rule), and every RPC behind the page
 * re-checks `is_admin()` itself; the gate here is convenience.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');
	return {};
};
