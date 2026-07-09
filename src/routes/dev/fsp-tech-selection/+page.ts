import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for /fsp-tech-selection. Mounts the REAL FspTechSelection
 * component with a mock signed-in student and an injected save primitive, so
 * the ranking interaction, the debounce + saving/saved/error indicator, the
 * retry/backoff, and the duplicate-pick guard can be browser-verified without
 * real OAuth or the Apps Script endpoint. 404s in a production build.
 */
export const ssr = false;
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
