import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for /fsp/frc-interest and its /admin roster. Mounts the
 * REAL FrcInterestForm and FrcInterestAdmin components with a fake submit
 * endpoint and sample rows, so the form + admin table can be browser-verified
 * (signed-out and signed-in prefill states) without Supabase or auth. 404s in
 * a production build.
 */
export const ssr = false;
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
