import { error, redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

/**
 * `/admin` IS THE CONSOLE'S OLD FRONT DOOR, AND IT FORWARDS (ledger 0117,
 * report 26). The admin roster, the IDEA Coin links, the short-link entry and
 * the Drive connection that used to render here are panels on `/dashboard`
 * now; this load exists so a link printed, bookmarked or written into another
 * surface's header before the merge still lands on the roster panel.
 *
 * THE 404 IS UNCHANGED AND IT COMES FIRST. A non-admin gets 404 rather than a
 * redirect, the /greenline/moderation rule: it tells someone probing the URL
 * nothing about whether the page exists, and the redirect below is reached
 * only by a caller who could already open the console. `/admin` is still
 * deliberately NOT in hooks.server.ts `authedPrefixes` for the same reason --
 * an anonymous visitor gets the same 404 as a signed-in student.
 *
 * NO `+page.svelte` BESIDE THIS FILE, deliberately: every branch of the load
 * ends in an error or a redirect, so a component here could never render.
 * Measured on a throwaway dev route that a server load with no page
 * component answers its redirect (303) rather than 500.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');
	redirect(303, '/dashboard#panel-admins');
};
