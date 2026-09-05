import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the instructor tools (prompt 0016): the roster export,
 * the class mail draft, the random picker, and a hall pass REFUSED by 0174's
 * limit.
 *
 * It mounts the REAL `PeoplePanel` and the REAL `HallPass` against in-memory
 * transports. No auth, no Supabase, no network. 404s in production, like every
 * harness here.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
