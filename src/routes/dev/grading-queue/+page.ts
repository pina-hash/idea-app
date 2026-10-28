import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the NEEDS GRADING page and the Grades tab's fill empty
 * grades only switch (ledger 0457). Mounts the REAL `GradingQueue` and
 * `GradesPanel` against an in-memory read: three classes, one of which is
 * Block 4 with a kept grade, so leaving a class out and bringing it back can
 * be pressed for real. No auth, no network. 404s in production.
 */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
