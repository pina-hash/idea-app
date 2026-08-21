import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * A LOAD THAT REALLY FAILS, so the root +error.svelte can be driven rather than
 * reasoned about. Dev only, and it throws before anything else happens.
 *
 * `error(500, ...)` rather than a bare `throw`: a bare throw is what
 * handleError turns into the generic message, and this route exists to prove
 * the boundary renders the app's chrome and hands the status and route to the
 * report affordance. Append `?raw=1` to get the unexpected-throw path instead,
 * which is the one that mints a correlation id.
 */
export const prerender = false;

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	if (url.searchParams.get('raw') === '1') throw new Error('Harness: an unexpected failure.');
	error(500, 'Harness: this load fails on purpose.');
};
