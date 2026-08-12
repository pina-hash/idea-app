import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Dev-only harness for the home-page classroom feed. 404s in production. */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
