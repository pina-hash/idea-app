import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for `TournamentSettingsForm` (ledger 0298, R02): the REAL
 * form, in the tournaments room, answered by an in-memory stand-in for
 * `tournament_update` / `tournament_create` that applies the same format lock
 * the 0192 RPC does. No auth, no Supabase. 404s in a production build.
 */
export const ssr = false;
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
