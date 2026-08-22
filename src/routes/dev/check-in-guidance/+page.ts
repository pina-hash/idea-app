import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the check-in guidance prompt field (0123). Mounts the
 * REAL `CheckInGuidance` in both of its modes and the real reading pair
 * (`Disclosure` + `ItemBody`) against an in-memory save transport -- no auth,
 * no Supabase, no network. 404s in production, like every harness here.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
