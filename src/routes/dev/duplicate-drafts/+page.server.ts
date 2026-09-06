import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * DEV ONLY. 404 in production, no auth, no Supabase, no network -- the harness
 * mounts the REAL `DuplicateDrafts` with a fixture shaped exactly as 0186
 * answers, and an in-memory removal that reports back.
 */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
