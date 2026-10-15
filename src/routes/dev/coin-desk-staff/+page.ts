import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the four IDEA Coin V2 staff areas (the queue, payday,
 * the digest and the tournament transfer): the REAL components over an
 * in-memory backend shaped like 0245-0249's answers. No auth, no Supabase, no
 * network. 404s in production, like every harness here.
 */
export const ssr = false;
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
