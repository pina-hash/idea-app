import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for /coin-balance. Mounts the REAL CoinBalanceView against
 * sample data covering a populated account, a zero-transaction account (the
 * empty state), an active Eating Pass with strikes, and the pre-0070
 * fail-soft state -- no auth or live Supabase project needed. 404s in
 * production.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
