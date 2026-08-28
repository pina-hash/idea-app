import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the digital hall pass (0143, split by role in 0144).
 * Mounts the REAL `HallPass` in every projection it has -- student free, student
 * holding, student blocked, manager with somebody out, manager empty -- against
 * in-memory transports. No auth, no Supabase, no network. 404s in production,
 * like every harness here.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
