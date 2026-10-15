import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the IDEA Coin V2 fine screen: the REAL `FineScreen`
 * over an in-memory ledger, plus the REAL `HallPass` card showing its warnings
 * and fines. No auth, no Supabase, no network. 404s in production, like every
 * harness here.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
