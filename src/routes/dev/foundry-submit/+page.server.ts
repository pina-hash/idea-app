import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Dev-only, and 404 in production. It needs no auth and no Supabase: the whole
 * point is that the submit surface's five-step orchestration can be driven with
 * nothing running behind it.
 */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
