import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for /coin-balance/role (IDEA Coin V2 2.5). Mounts the REAL
 * CoinRolePortal over a `coin_my_role()`-shaped payload with in-memory
 * transports. No auth or live Supabase project needed. 404s in production.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
