import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for a class's Videos section (ledger 0298, R08): the REAL
 * ClassView over a fixture whose items carry YouTube links in every place a
 * teacher writes one, a non-YouTube link, and none. No auth, no Supabase; 404
 * in production.
 *
 *   ?manage=1            the class's teacher: a draft's video is held back and
 *                        an instructor-only link is never listed
 *   ?state=none          a class with links but no video: no section at all
 *   ?state=pane          the class list as the column beside an open item:
 *                        the same videos, and no section drawn
 *   ?theme=space-white   force the Space White attribute (no session here)
 */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
