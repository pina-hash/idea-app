import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * DEV ONLY. 404s in production, exactly as every other `/dev` harness does --
 * the guard is here rather than in a shared layout because there is no layout
 * over `/dev` and a missing guard on one route is the whole failure.
 *
 * It needs no auth and no Supabase: everything the page mounts is fed from a
 * literal fixture in the component, so the harness runs against a checkout with
 * no environment at all.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
