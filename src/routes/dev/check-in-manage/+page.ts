import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for MANAGING a check-in that already exists.
 *
 * It mounts the REAL `SessionManager` -- the component `/notebook/review`
 * mounts -- against an in-memory store, with no auth and no Supabase. 404s in
 * production.
 *
 * WHY IT IS A SECOND HARNESS BESIDE `/dev/notebook-review` RATHER THAN A
 * FIXTURE ADDED TO IT. That one exists to drive the whole console (three
 * viewers, four modes, the grid, entry review) and its check-in list is
 * deliberately small. What this bundle has to prove is the state that harness
 * never reaches: a check-in with WORK ALREADY FILED AGAINST IT, which is the
 * only state in which either warning renders at all. A fixture that cannot
 * reach the answers-exist state proves nothing about the case that matters.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
