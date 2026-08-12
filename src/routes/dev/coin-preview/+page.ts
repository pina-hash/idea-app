import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Dev-only harness route: 404 in production, the /dev convention. */
export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
