import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * DEV ONLY. 404 in production, no auth, no Supabase, no network -- the harness
 * mounts the REAL PeoplePanel, the REAL SpecImporter and the REAL
 * ContentComposer with in-memory transports.
 */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
