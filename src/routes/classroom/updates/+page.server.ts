import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The update log is committed content, not data -- there is nothing to load.
 * /classroom is in hooks.server.ts authedPrefixes so an anonymous visitor is
 * already redirected; this is the belt-and-braces guard every classroom load
 * carries for a direct hit.
 */
export const load: PageServerLoad = async ({ locals: { claims } }) => {
	if (!claims) redirect(303, '/');
	return {};
};
