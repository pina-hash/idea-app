import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the item page's notebook capture (ledger 0297, package
 * F4b). Mounts the REAL ClassroomShell, ClassSplit, ClassView and ItemDetail,
 * with the REAL NotebookCapture handed in exactly as the item route hands it,
 * over in-memory transports with a stated latency. No auth, no Supabase, no
 * Drive. 404s in production.
 */
export const prerender = false;
export const ssr = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
