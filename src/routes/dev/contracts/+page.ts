import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for /contracts. Mounts the REAL ContractsView against a
 * fresh instance of the SAME in-memory ledger /dev/coin-desk uses
 * (fake-ledger.ts, module-level state), seeded with the identical five
 * sample contracts every time this page loads -- not a live session shared
 * with /dev/coin-desk (each is its own harness, visited independently, the
 * same way /dev/coin-desk and /dev/coin-balance are). No auth or live
 * Supabase project needed. 404s in production.
 */
export const ssr = false;
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
