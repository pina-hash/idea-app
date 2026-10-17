import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Where a click on a thumbnail in /dev/post-thumbnails lands: it names the address, so a spec can read where the click went. 404 in production. */
export const load: PageLoad = ({ params }) => {
	if (!dev) error(404, 'Not found');
	return { rest: params.rest };
};
