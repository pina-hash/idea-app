import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { PageServerLoad } from './$types';

/** Dev harness: 404 in production, no auth, no Supabase, no Drive. */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
