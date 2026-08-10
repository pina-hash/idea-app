import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for /notebook/review. Mounts the REAL ReviewConsole (and
 * through it the real SessionManager, SectionGrid, EntryReview and
 * NotebookPhotos) against an in-memory store that mirrors 0069's rules --
 * no auth, no Supabase, no Drive. 404s in production.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
