import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Dev-only landing for the home feed harness's class link. 404s in production. */
export const load: PageLoad = ({ params }) => {
	if (!dev) error(404, 'Not found');
	return { sectionId: params.sectionId };
};
