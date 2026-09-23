import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for a class's notebook timeline (ledger 0297, package
 * F4b). Mounts the REAL ClassroomShell and the REAL NotebookTimeline, built by
 * the real buildTimeline and classDayStreak over fixture rows, under the
 * measure the real route sets. No auth, no Supabase, no Drive. 404s in
 * production.
 */
export const prerender = false;
export const ssr = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
