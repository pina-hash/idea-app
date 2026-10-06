import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE IDEA ARMORY HARNESS. Dev only: 404 in production, no auth, no Supabase.
 * The REAL Armory components with seeded fake data, one state per
 * `?state=` (for screenshots) or every state stacked (no query, for the
 * browser-verify spec): empty, editing, synced, a quiet (possibly offline)
 * computer, side versions, storage not configured, and the projects, connect
 * and download pages.
 */
export const prerender = false;

export const load = ({ url }) => {
	if (!dev) error(404, 'Not found');
	return { only: url.searchParams.get('state') };
};
