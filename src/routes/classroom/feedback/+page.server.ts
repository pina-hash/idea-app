import { redirect } from '@sveltejs/kit';
import { requireFeedbackConsole } from '$lib/server/feedback-console';
import type { PageServerLoad } from './$types';

/**
 * THE FEEDBACK CONSOLE'S OLD ADDRESS, AND IT FORWARDS (report R03, decision 42).
 *
 * The console covers every surface on the site, so it left the classroom for
 * `/admin/feedback`. Links, bookmarks and the address bar's own history still
 * name this one, so it answers a 307 to the new address rather than a 404.
 *
 * THE 404 IS UNCHANGED AND IT COMES FIRST. `requireFeedbackConsole` is the new
 * address's own gate, called rather than copied, so a non-admin gets a 404 here
 * exactly as they do there and the redirect is reached only by a caller who
 * could already open the console: a redirect answered to anybody else would
 * confirm the console exists. (A signed-out visitor never reaches this load at
 * all: `/classroom` is in hooks.server.ts `authedPrefixes`, which sends them to
 * `/` the way it does for every classroom address, so this path reveals nothing
 * the prefix guard did not already.)
 *
 * 307 and not 308, the short-link rule: a permanent redirect is cached past the
 * point where anybody could re-point it.
 *
 * NO `+page.svelte` BESIDE THIS FILE, deliberately, the `/admin` precedent:
 * every branch of the load ends in an error or a redirect, so a component here
 * could never render.
 */
export const load: PageServerLoad = async ({ locals }) => {
	await requireFeedbackConsole(locals);
	redirect(307, '/admin/feedback');
};
