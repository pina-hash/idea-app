import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Dev only; client-rendered so the switch's in-memory answer is per tab. */
export const ssr = false;
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
