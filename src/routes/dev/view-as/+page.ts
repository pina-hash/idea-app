import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Dev-only harness (ledger 0422): mounts the REAL component over an in-memory payload. 404s in production. */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
