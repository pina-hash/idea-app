import { error, redirect } from '@sveltejs/kit';
import { loadReviewConsole } from '$lib/server/notebook-review-console';
import { legacyReviewTarget } from '$lib/notebook/legacy-routes';
import type { PageServerLoad } from './$types';

/**
 * THE REVIEW CONSOLE'S OLD ADDRESS, KEPT (ledger 0297, package F4a).
 *
 * THE GATE RUNS BEFORE THE REDIRECT, AND THAT ORDER IS THE WHOLE RULE. A
 * non-reviewer gets the same 404 this address always gave them -- the /admin
 * rule -- because a redirect answered to anybody would confirm the review
 * surface exists to somebody who may not see it. Only a caller the console
 * would admit is sent on: a manager of `?section=` to that class's own
 * Notebook tab (where the retired Check-ins tab used to send them), anybody
 * else to the all-sections console. The target re-checks everything itself.
 */
export const load: PageServerLoad = async ({ url, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const review = await loadReviewConsole(supabase, claims);
	if (!review) error(404, 'Not found');
	redirect(307, legacyReviewTarget(url, review.sections));
};
