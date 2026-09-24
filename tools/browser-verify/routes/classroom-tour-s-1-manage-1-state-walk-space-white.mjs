/**
 * THE TEACHER'S WALKTHROUGH UNDER SPACE WHITE (ledger 0297, LEARN). The
 * harness holds no session, so the theme attribute is forced the way the live
 * harness forces it (`/dev/classroom` is in the Space White scope, and the
 * tour harness is under that prefix). The same walk as the dark spec, and the
 * callout's words re-measured on the white ground, which is where a room's
 * portal tokens most often fall short.
 */
import { CALLOUT_CONTRAST, CALLOUT_OPEN, CALLOUT_TAPS, TOUR_READY, TOUR_TEACHER, WALK_TOUR, walkVerdict } from './_classroom-tour.mjs';

const SPACE_WHITE = `() => document.documentElement.getAttribute('data-theme') === 'space-white'`;

export default {
	path: `${TOUR_TEACHER}&state=walk-space-white`,
	aliasOf: TOUR_TEACHER,
	label: 'Classroom tour (teacher) under Space White: every step on screen, callout legible',
	prepare: [
		TOUR_READY,
		{
			label: 'force Space White (no session in a harness)',
			evaluate: `() => { document.documentElement.setAttribute('data-theme', 'space-white'); return document.documentElement.getAttribute('data-theme'); }`,
			until: SPACE_WHITE
		},
		{ click: '[data-testid="tour-offer-start"]', until: CALLOUT_OPEN },
		WALK_TOUR,
		{ waitFor: SPACE_WHITE, timeoutMs: 2000 }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="tour-callout"]', label: 'the callout, on its last step', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: CALLOUT_CONTRAST,
	tapTargets: CALLOUT_TAPS,
	orderResult: [{ label: 'every step: target present, on screen, clear of the callout; at least 6 steps', evaluate: walkVerdict(6), expected: ['none', 'true'] }]
};
