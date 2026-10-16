import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for `/admin/avatars` (ledger 0392): the REAL
 * AvatarHoldsConsole over an in-memory stand-in. No auth, no Supabase. 404s in
 * production.
 */
export const prerender = false;
export const ssr = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
