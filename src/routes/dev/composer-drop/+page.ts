import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for WHERE A FILE DROPPED ON THE COMPOSER GOES (ledger 0297,
 * package ITEM; report 21). Mounts the REAL ContentComposer with every typed
 * target it can carry -- the spec importer, the presentation box and the
 * ported-document box (as an admin) -- and drops real files on its title field
 * with real DragEvents carrying a real DataTransfer. No auth, no Supabase, no
 * network beyond the local `/hx/worksheet` fixture, which is fetched as the
 * ported document to drop. 404s in production.
 */
export const prerender = false;
export const ssr = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
