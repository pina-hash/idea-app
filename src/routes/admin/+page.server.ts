import { error } from '@sveltejs/kit';
import { isAdmin, isOwner } from '$lib/server/admin';
import type { AdminRow } from '$lib/admin';
import type { PageServerLoad } from './$types';

/**
 * The admin roster page (0067). Any admin may SEE who else can administer the
 * site; only the pinned owner may change the list, which admin_grant /
 * admin_revoke enforce inside the function -- this load only decides what to
 * render.
 *
 * A non-admin gets 404 rather than a redirect, the /greenline/moderation rule:
 * it tells someone probing the URL nothing about whether the page exists.
 *
 * /admin is deliberately NOT in hooks.server.ts authedPrefixes: an anonymous
 * visitor should get the same 404 as a signed-in student, not a redirect that
 * confirms the path is real.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

	const [{ data: rows }, owner] = await Promise.all([
		supabase.rpc('admin_list'),
		isOwner(supabase)
	]);

	return {
		// Fails soft to an empty roster if 0067 is not applied yet (the isAdmin
		// fallback would have let a teacher in on the old rule).
		admins: (rows ?? []) as AdminRow[],
		isOwner: owner,
		myEmail: claims.email ?? null
	};
};
