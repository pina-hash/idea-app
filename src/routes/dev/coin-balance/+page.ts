import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for /coin-balance (IDEA Coin V2). Mounts the REAL
 * CoinPageView over `coin_my_page()`-shaped payloads: populated, in debt with a
 * revoked pass, outside the economy, a new student, signed out, and a database
 * without 0241. No auth or live Supabase project needed. 404s in production.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
