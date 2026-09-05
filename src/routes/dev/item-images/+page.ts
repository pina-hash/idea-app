import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Dev-only harness for pictures in an item body (0176). 404s in production. */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
