import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the classroom module. Mounts the REAL MyClasses,
 * ClassPage, AssignmentDetail, and ManageConsole components against an
 * in-memory store (no auth or live Supabase): student views with sample and
 * empty data, and the full interactive manage console -- composer with
 * multi-section publish, roster add + CSV import, publish toggles, edits,
 * two-step deletes. 404s in production.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
