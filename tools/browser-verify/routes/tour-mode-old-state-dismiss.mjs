/**
 * THE OFFER'S "Not now" (ledger 0298): the offer goes, no tour starts, and
 * focus lands on Take the tour -- the control the tour lives on -- rather than
 * on a row that no longer exists.
 */
import { HIDE_HARNESS_PANEL, OFFER_UP } from './_home-tour.mjs';

export default {
	path: '/dev/tour?mode=old&state=dismiss',
	aliasOf: '/dev/tour?mode=old',
	label: 'Home tour offer: Not now puts it away and hands focus to Take the tour',
	settleMs: 1500,
	prepare: [
		HIDE_HARNESS_PANEL,
		OFFER_UP,
		{ click: '[data-testid="tour-offer-dismiss"]', until: `() => !document.querySelector('[data-testid="tour-offer"]')`, waitMs: 300 }
	],
	presence: [
		{ selector: '[data-testid="tour-offer"]', label: 'the offer is gone', expectPresent: 0 },
		{ selector: '[data-testid="tour-callout"]', label: 'no tour started', expectPresent: 0 },
		{ selector: '[data-tour="tour-trigger"]', label: 'POSITIVE CONTROL: Take the tour is still there', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'focus is on Take the tour',
			evaluate: `() => [String(!!document.activeElement && document.activeElement.matches('[data-tour="tour-trigger"]'))]`,
			expected: ['true']
		}
	]
};
