import { error } from '@sveltejs/kit';
import { version as buildId } from '$app/environment';
import { deploy } from 'virtual:site-versions';
import { loadAssignmentHtml, rewriteLegacyLinks } from '$lib/legacy';
import { injectVersionBadge } from '$lib/version-badge';
import { ASSIGNMENT_FEEDBACK_LAUNCH, injectFeedbackLaunch } from '$lib/server/feedback-launch';
import type { RequestHandler } from './$types';

/**
 * Public serving pattern (raw-import, not `static/`).
 *
 * Assignments are public: anyone may open `/assignments/<slug>`. The HTML
 * still lives OUTSIDE `static/` and is pulled in via build-time raw imports,
 * so this endpoint remains the only way to reach it (and the serve-time
 * `rewriteLegacyLinks` fixes its legacy asset/link paths).
 *
 * IT CARRIES THE SITE'S OWN FEEDBACK BUTTON AND WINDOW (report 20, 2026-09-25:
 * "must be available on every single possible page"; ledger 0396: the same
 * window everywhere). A page served from a `+server.ts` renders no layout, so
 * the root layout's control never reaches it: the real `FeedbackTrigger` is
 * server-rendered into the served STRING at the bottom right, and it opens the
 * real window, `/feedback/embed`, in a frame placed exactly where the home
 * page's box opens (`$lib/server/feedback-launch.ts`). The file on disk is
 * untouched.
 *
 * THE INJECTED BYTES ARE THE SAME FOR EVERY READER, and that is forced by the
 * cache header below: this response is one shared cache entry for a whole
 * class. Nothing here reads a session, a cookie or a claim -- the window is a
 * page of the site and knows who is signed in the way every page does -- and
 * `tests/feedback-coverage.test.ts` holds it to that.
 */
export const GET: RequestHandler = async ({ params }) => {
	const html = await loadAssignmentHtml(params.slug);
	if (html === null) {
		error(404, 'Assignment not found');
	}

	const served = injectVersionBadge(
		injectFeedbackLaunch(rewriteLegacyLinks(html), { ...ASSIGNMENT_FEEDBACK_LAUNCH, deploy, buildId }),
		'assignments'
	);

	return new Response(served, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			/* A SHORT SHARED CACHE, BECAUSE A WHOLE CLASS OPENS THIS AT ONCE.
			   These are QR-coded and printed onto handouts, so the arrival
			   pattern is thirty phones hitting one slug inside a minute, and
			   every one of them was executing the function. Sixty seconds
			   collapses that to one origin hit and no more: an assignment
			   CORRECTED mid-class must reach the room, so this is deliberately
			   not longer. `max-age=0, must-revalidate` keeps the browser
			   itself honest -- the shared cache absorbs the burst, the reader's
			   own reload still gets the current bytes.

			   NO `Vary: Cookie`, WHICH IS THE DIFFERENCE FROM THE COIN LEDGER'S
			   OTHERWISE IDENTICAL HEADER. That route injects a signed-in
			   boolean, so its bytes genuinely vary by session. This handler
			   reads no session, no cookie and no claim: `loadAssignmentHtml`,
			   `rewriteLegacyLinks`, `injectFeedbackLaunch` and
			   `injectVersionBadge` are all pure functions of the slug and the
			   build. The feedback window is a page of the site and reads the
			   session itself, in its own private response. Adding `Vary: Cookie` here
			   would fragment the shared cache by every student's distinct
			   session cookie, which is exactly the class-wide burst this is
			   for -- it would cost the whole benefit to describe a variance
			   that does not exist. */
			'cache-control': 'public, max-age=0, s-maxage=60, must-revalidate'
		}
	});
};
