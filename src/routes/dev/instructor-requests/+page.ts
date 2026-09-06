import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for prompt 0069's four built items, mounting the REAL
 * components against in-memory transports. No auth, no Supabase, no network.
 * 404s in production, like every harness here.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
