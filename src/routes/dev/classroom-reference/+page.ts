import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Dev-only regression harness: 404 in production, no auth, no Supabase. */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
