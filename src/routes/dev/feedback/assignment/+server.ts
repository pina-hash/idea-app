import { dev, version as buildId } from '$app/environment';
import { error } from '@sveltejs/kit';
import { deploy } from 'virtual:site-versions';
import { assignmentSlugs, loadAssignmentHtml, rewriteLegacyLinks } from '$lib/legacy';
import { injectVersionBadge } from '$lib/version-badge';
import { ASSIGNMENT_FEEDBACK_LAUNCH, injectFeedbackLaunch } from '$lib/server/feedback-launch';
import type { RequestHandler } from './$types';

/**
 * Dev harness for the feedback button and window on a carried-over ASSIGNMENT
 * page (report 20, 2026-09-25; ledger 0396). 404 in production, no auth, no
 * Supabase.
 *
 * It serves the REAL `src/lib/legacy/assignments/<slug>.html` through the SAME
 * pipeline `/assignments/<slug>` uses -- `rewriteLegacyLinks`, then
 * `injectFeedbackLaunch` with the route's own `ASSIGNMENT_FEEDBACK_LAUNCH`,
 * then the version badge -- and adds exactly one thing: the window's harness
 * sink (`sink=memory`), so a report lands in `window.__ideaFeedbackSink` on this
 * page, the row built by the real `submitFeedback`, instead of the database.
 *
 *   ?slug=<slug>      which assignment (default idea100-blade-01)
 *   ?signedIn=1 | 0   which arrangement the window shows: signed in (no
 *                     contact field, the account note) or signed out
 *   ?signedIn=fail    the window's page cannot load (it answers the site's
 *                     error page), so the button says so beside itself
 *
 * The page's own bytes stay session-blind, exactly as the real route's do: the
 * parameter only reaches the window, which decides what it means.
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	if (!dev) error(404, 'Not found');

	const slug = url.searchParams.get('slug') ?? 'idea100-blade-01';
	if (!assignmentSlugs.includes(slug)) error(404, 'Assignment not found');
	const html = await loadAssignmentHtml(slug);
	if (html === null) error(404, 'Assignment not found');

	const signedIn = url.searchParams.get('signedIn') === '1';
	const failing = url.searchParams.get('signedIn') === 'fail';

	const served = injectVersionBadge(
		injectFeedbackLaunch(rewriteLegacyLinks(html), {
			...ASSIGNMENT_FEEDBACK_LAUNCH,
			deploy,
			buildId,
			embedQuery: { sink: 'memory', ...(signedIn ? { signedIn: '1' } : {}), ...(failing ? { fail: '1' } : {}) }
		}),
		'assignments'
	);

	setHeaders({ 'cache-control': 'no-store' });
	return new Response(served, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
