import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for one student's page in one class (the 2026-10-07 round).
 * Mounts the REAL ClassroomShell and the REAL StudentOverview, over a page the
 * real `buildStudentPage` built from fixture reads, under the measure the real
 * route sets. No auth, no Supabase. 404s in production.
 */
export const prerender = false;
export const ssr = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
