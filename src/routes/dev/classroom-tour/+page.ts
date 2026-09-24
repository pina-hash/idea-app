import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** The harness has one class to open; its root sends you there, query kept. 404 in production. */
export const load: PageLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	redirect(307, `/dev/classroom-tour/s-1${url.search}`);
};
