import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * DEV ONLY. 404 in production, no auth, no Supabase, no network -- the harness
 * mounts the REAL `ContentComposer` in EDIT mode with in-memory transports and
 * an in-memory table of stored answers the orphan counter actually reads.
 */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
