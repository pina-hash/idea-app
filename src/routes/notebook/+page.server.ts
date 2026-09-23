import { redirect } from '@sveltejs/kit';
import { legacyNotebookTarget } from '$lib/notebook/legacy-routes';
import type { PageServerLoad } from './$types';

/**
 * THE NOTEBOOK'S OLD FRONT DOOR, KEPT AS A REDIRECT (ledger 0297, package F4a).
 *
 * The notebook lives inside the classroom now: a class's own Notebook tab, and
 * the whole notebook at `/classroom/notebook`. This address is on printed
 * check-in cards, in posts and in bookmarks, so it answers forever -- a 307 to
 * the whole notebook with the query string intact, which is what carries a
 * check-in deep link (`?checkin=<session>&section=<class>`) through unchanged.
 *
 * NO COMPONENT: the load always redirects, so nothing here ever renders. An
 * anonymous visitor never reaches it (hooks.server.ts keeps `/notebook` in its
 * authed prefixes); the check below is belt-and-braces for a direct load.
 */
export const load: PageServerLoad = async ({ url, locals: { claims } }) => {
	if (!claims) redirect(303, '/');
	redirect(307, legacyNotebookTarget(url));
};
