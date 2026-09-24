/**
 * THE TEACHER'S WALKTHROUGH, STEP BY STEP (ledger 0297, LEARN). Started from
 * the offer's "Show me around", walked with Next to its last step: every step
 * points at a control that is present, on screen and not under the callout,
 * and the callout stays inside the window. On a desktop the header tools are
 * their own steps; on a phone they fold into the Menu, which gets one step of
 * its own instead (`_classroom-tour.mjs` prints the list either way).
 *
 * Measured on the last step, then closed with Escape: the tour goes, the
 * state reads `dismissed` (closing is not finishing), and focus comes back to
 * a header control, never to a callout that no longer exists.
 */
import { CALLOUT_CONTRAST, CALLOUT_OPEN, CALLOUT_TAPS, TOUR_READY, TOUR_TEACHER, WALK_TOUR, pressThenRead, walkVerdict } from './_classroom-tour.mjs';

export default {
	path: `${TOUR_TEACHER}&state=walk`,
	aliasOf: TOUR_TEACHER,
	label: 'Classroom tour (teacher): every step on screen, then Escape',
	prepare: [
		TOUR_READY,
		{ click: '[data-testid="tour-offer-start"]', until: CALLOUT_OPEN },
		WALK_TOUR
	],
	presence: [
		{ selector: '[data-testid="tour-callout"]', label: 'the callout, on its last step', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tour-offer"]', label: 'the offer is gone once the tour runs', expectPresent: 0 }
	],
	contrast: CALLOUT_CONTRAST,
	tapTargets: CALLOUT_TAPS,
	orderResult: [
		{ label: 'every step: target present, on screen, clear of the callout; at least 6 steps', evaluate: walkVerdict(6), expected: ['none', 'true'] },
		{
			label: 'Escape: closed, handled, dismissed (not finished), focus on a header control',
			evaluate: pressThenRead('Escape', 'teacher'),
			expected: ['true', 'true', 'dismissed', 'true']
		}
	]
};
