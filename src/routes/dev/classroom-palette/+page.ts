import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** The harness has one class to open; its root sends you there. 404 in production. */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	redirect(307, '/dev/classroom-palette/s-1');
};
