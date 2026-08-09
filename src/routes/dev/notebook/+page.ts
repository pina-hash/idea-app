import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for /notebook. Mounts the REAL NotebookView against
 * sample data for three accounts (student, instructor, plain non-instructor)
 * with the two upload transports faked in memory -- no auth, no Supabase, no
 * Drive. 404s in production.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
