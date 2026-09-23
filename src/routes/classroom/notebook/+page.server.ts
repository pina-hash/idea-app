import { redirect } from '@sveltejs/kit';
import { loadStudentNotebook } from '$lib/server/notebook-student';
import type { PageServerLoad } from './$types';

/**
 * THE STUDENT'S WHOLE NOTEBOOK, every class, inside the classroom shell (ledger
 * 0297, package F4a). It was `/notebook`, a separate app with its own
 * masthead; that address redirects here now, query string and all, so every
 * link, bookmark and printed check-in card keeps landing on it.
 *
 * `?checkin=<session>&section=<class>` preselects a check-in exactly as it
 * always did, and `?section=<class>` alone names the class a student came
 * from, which the composer files a free entry to by default. Both are
 * validated against the caller's own RLS-scoped lists inside the load, so a
 * parameter can only pick something the page was already going to offer.
 *
 * The load is `loadStudentNotebook`, shared with a class's own Notebook tab,
 * which is the same function with a class to scope to.
 */
export const load: PageServerLoad = async ({ url, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	return loadStudentNotebook({ url, supabase, claims });
};
