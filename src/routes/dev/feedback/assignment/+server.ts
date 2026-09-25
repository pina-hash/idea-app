import { dev, version as buildId } from '$app/environment';
import { error } from '@sveltejs/kit';
import { deploy } from 'virtual:site-versions';
import { assignmentSlugs, loadAssignmentHtml, rewriteLegacyLinks } from '$lib/legacy';
import { injectVersionBadge } from '$lib/version-badge';
import { ASSIGNMENT_REPORT_OPTIONS, injectLegacyReportPanel } from '$lib/server/legacy-report-panel';
import type { RequestHandler } from './$types';

/**
 * Dev harness for the report control on a carried-over ASSIGNMENT page
 * (report 20, 2026-09-25). 404 in production, no auth, no Supabase.
 *
 * It serves the REAL `src/lib/legacy/assignments/<slug>.html` through the SAME
 * pipeline `/assignments/<slug>` uses -- `rewriteLegacyLinks`, then
 * `injectLegacyReportPanel` with the route's own `ASSIGNMENT_REPORT_OPTIONS`,
 * then the version badge -- and overrides exactly two things: the session
 * probe and the signed-in endpoint point at fixtures beside this file, so both
 * sessions can be driven with no Google account. The anonymous endpoint cannot
 * be overridden (the module takes it from the shared constant), so a signed-out
 * send here reaches the REAL `/api/feedback`, which with no service key answers
 * a structured `not_configured` refusal -- the refusal branch, reported once.
 *
 *   ?slug=<slug>          which assignment (default idea100-blade-01)
 *   ?signedIn=1 | 0 | fail  what the probe answers: signed in, signed out, or a
 *                         503 (the "could not check" branch)
 *
 * The toggle rides a COOKIE scoped to this harness, not the probe's URL, for
 * the reason `/dev/coins` gives: the probe URL is fixed in the injected bytes,
 * exactly as it is on the real route.
 */
export const GET: RequestHandler = async ({ url, cookies, setHeaders }) => {
	if (!dev) error(404, 'Not found');

	const slug = url.searchParams.get('slug') ?? 'idea100-blade-01';
	if (!assignmentSlugs.includes(slug)) error(404, 'Assignment not found');
	const html = await loadAssignmentHtml(slug);
	if (html === null) error(404, 'Assignment not found');

	const mode = url.searchParams.get('signedIn');
	cookies.set('dev_assignment_report', mode === '1' ? '1' : mode === 'fail' ? 'fail' : '0', {
		path: '/dev/feedback/assignment',
		httpOnly: false
	});

	const served = injectVersionBadge(
		injectLegacyReportPanel(rewriteLegacyLinks(html), {
			...ASSIGNMENT_REPORT_OPTIONS,
			sessionProbe: '/dev/feedback/assignment/session',
			signedInEndpoint: '/dev/feedback/assignment/sink',
			deploy,
			buildId
		}),
		'assignments'
	);

	setHeaders({ 'cache-control': 'no-store' });
	return new Response(served, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
