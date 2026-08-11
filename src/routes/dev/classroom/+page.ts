import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the classroom module. Mounts the REAL MyClasses,
 * ClassPage, ItemDetail, ManageConsole, UpdatesPage and FeedbackConsole
 * components against an in-memory store (no auth, no live Supabase, no Drive).
 *
 * What it exists to make drivable without a backend: the canonical sync loop
 * (edit an item in Period 1, see the change in Period 2), linkage add/remove,
 * duplication, pin and reorder, the "Updated" badge clearing on view, link
 * preview cards in both their rich and degraded states, and the feedback loop
 * from a class page into the admin console. 404s in production.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
