import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { PageLoad } from './$types';

export const prerender = false;
export const ssr = true;

/** DEV ONLY: 404 in production, like every harness here. */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
