import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the classroom song queue (0145). Mounts the REAL
 * `SongQueue` in every projection it has -- student with room to ask, student at
 * the cap, student with a rejection to read, manager with a queue, manager with
 * nothing waiting -- against in-memory transports. No auth, no Supabase, no
 * network. 404s in production, like every harness here.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
