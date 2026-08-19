import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for /notebook/review/student/[studentEmail] (0106/0117).
 * Mounts the SAME markup that route renders -- the back strip naming the
 * student, the read-only NotebookView, and the Deleted section with its
 * staff Restore control -- against an in-memory store, no auth, no Supabase.
 * 404s in production.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
