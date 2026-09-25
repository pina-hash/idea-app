/**
 * THE HOME TOUR FOR SOMEBODY WHO HAS SEEN THIS ONE (ledger 0298): a stamp on
 * or after `HOME_TOUR_VERSION`, so nothing starts and nothing is offered. The
 * absence rows stand beside a positive control (Take the tour, which replays
 * it on demand), so a renamed hook cannot pass for the rule holding.
 */
import { HIDE_HARNESS_PANEL } from './_home-tour.mjs';

export default {
	path: '/dev/tour?mode=done',
	label: 'Home tour (seen this version): no offer, no tour, Take the tour still there',
	settleMs: 2000,
	prepare: [HIDE_HARNESS_PANEL],
	presence: [
		{ selector: '[data-testid="tour-offer"]', label: 'no offer', expectPresent: 0 },
		{ selector: '[data-testid="tour-callout"]', label: 'no tour started', expectPresent: 0 },
		{ selector: '[data-tour="tour-trigger"]', label: 'POSITIVE CONTROL: Take the tour', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-tour="hero"]', label: 'POSITIVE CONTROL: the page', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'and nothing was written',
			evaluate: `() => [String(!!window.__tourHarness && !window.__tourHarness.log().some((l) => l.includes('tour_completed_at')))]`,
			expected: ['true']
		}
	]
};
