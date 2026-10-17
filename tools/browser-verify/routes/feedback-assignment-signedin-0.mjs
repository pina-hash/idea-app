/**
 * A CARRIED-OVER ASSIGNMENT PAGE CARRIES THE SITE'S OWN FEEDBACK BUTTON AND
 * WINDOW (report 20, 2026-09-25: "must be available on every single possible
 * page"; ledger 0396: the same window everywhere), measured SIGNED OUT on the
 * REAL `idea100-blade-01.html` served through the REAL `/assignments/<slug>`
 * pipeline (`/dev/feedback/assignment`).
 *
 * The page's bytes are the same for every reader -- the route is a shared
 * public cache entry with no `Vary: Cookie` -- and since ledger 0396 the page
 * does not even ask: the window is a page of the site and knows the session
 * the way the home box does. Signed out, its note says the report carries no
 * name and it offers a way to be reached; the signed-in spec beside this one
 * is the other half of both.
 */
import { ESCAPE_CLOSES_FRAME, frameFields, FRAME_TYPESET_CHECK, OFFICIAL_CORNER_CHECK, OPEN_FRAME_BOX, ROOM_INKS, ROOM_INKS_CHECK, sinkReportCheck, TYPE_FRAME_REPORT } from './_report-room.mjs';

export default {
	path: '/dev/feedback/assignment?signedIn=0',
	label: 'Assignment page (signed out): the official feedback button and its framed window, in the page palette',
	settleMs: 1200,
	prepare: [OPEN_FRAME_BOX, TYPE_FRAME_REPORT, ROOM_INKS],
	presence: [
		{ selector: '#idea-feedback-launch .sfb-trigger', label: 'the official feedback button, server-rendered', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-feedback-frame.is-open', label: 'the window, open in its frame', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-legacy-report, #idea-legacy-report-btn', label: 'no look-alike panel or its button', expectPresent: 0 }
	],
	contrast: [{ selector: '#idea-feedback-launch .sfb-word', label: 'the button word', min: 4.5 }],
	tapTargets: [{ selector: '#idea-feedback-launch .sfb-trigger', label: 'the feedback button', min: 44 }],
	orderResult: [
		frameFields(false),
		FRAME_TYPESET_CHECK,
		OFFICIAL_CORNER_CHECK,
		ROOM_INKS_CHECK,
		{
			label: 'the window files against the assignment route, without the plate, and the page stays session-blind',
			evaluate: `() => {
				const f = document.getElementById('idea-feedback-frame');
				if (!f) return ['NO FRAME'];
				const q = new URL(f.src, location.href).searchParams;
				const scripts = [...document.scripts].map((s) => s.textContent || '').join('\\n');
				return [
					'route ' + q.get('route'),
					'plate ' + (q.get('plate') || 'off'),
					/signedIn|sessionProbe|assignment-feedback/.test(scripts.replace(/"extra":\\{[^}]*\\}/, '')) ? 'THE PAGE NAMES A SESSION' : 'the page names no session'
				];
			}`,
			expected: ['route /assignments/[slug]', 'plate off', 'the page names no session']
		},
		ESCAPE_CLOSES_FRAME,
		sinkReportCheck(false)
	]
};
