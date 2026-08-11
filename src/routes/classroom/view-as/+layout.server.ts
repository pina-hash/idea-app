import { error, redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { LayoutServerLoad } from './$types';

/**
 * VIEW AS STUDENT -- the admin gate for the whole subtree.
 *
 * WHY IT EXISTS. There is no way to obtain a @boscotech.net session for
 * testing, so nobody can otherwise check what a student's classroom actually
 * looks like: whether the right classes appear, whether a draft leaked,
 * whether an attachment loads. This mode renders the ordinary student
 * experience for any enrolled email.
 *
 * THIS GUARD IS NOT THE BOUNDARY, and that is deliberate. Every read under it
 * goes through a 0083 view_as RPC whose FIRST act is is_admin(); a non-admin
 * calling one straight through PostgREST is refused by the database, so
 * "non-admins can never reach any form of it" holds without depending on a
 * page load. What the guard buys is that a non-admin never lands on a page
 * whose every query would fail -- and a 404 rather than a redirect, the
 * /admin rule, so probing the URL reveals nothing about whether the feature
 * exists.
 *
 * READ-ONLY IS STRUCTURAL. Nothing in this tree is handed transports, and
 * 0083 ships no view_as write RPC of any kind, so there is no write to
 * accidentally execute while impersonating -- it is a property of the surface
 * area, not a discipline the UI has to keep.
 */
export const load: LayoutServerLoad = async ({ locals: { supabase, claims } }) => {
	// Anonymous visitors are already turned away by the /classroom authed
	// prefix; this is belt-and-braces for a direct load.
	if (!claims) redirect(303, '/');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');
	return {};
};
