/**
 * THE OFFER'S "Show me around" (ledger 0298): the offer goes, the tour runs
 * from its welcome, and the offer does not come back underneath it.
 */
import { CALLOUT_OPEN, HIDE_HARNESS_PANEL, OFFER_UP } from './_home-tour.mjs';

export default {
	path: '/dev/tour?mode=old&state=start',
	aliasOf: '/dev/tour?mode=old',
	label: 'Home tour offer: Show me around starts the tour and puts the offer away',
	settleMs: 1500,
	prepare: [HIDE_HARNESS_PANEL, OFFER_UP, { click: '[data-testid="tour-offer-start"]', until: CALLOUT_OPEN, waitMs: 900 }],
	presence: [
		{ selector: '[data-testid="tour-callout"]', label: 'the tour is running', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tour-offer"]', label: 'the offer is gone', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'it starts on the welcome, with the whole tour ahead of it',
			evaluate: `() => {
				const title = (document.querySelector('[data-testid="tour-callout"] h3')?.textContent ?? '').trim();
				const m = /^(\\d+) of (\\d+)$/.exec((document.querySelector('[data-testid="tour-count"]')?.textContent ?? '').trim());
				return [title, m ? m[1] : '?', String(!!m && Number(m[2]) >= 18)];
			}`,
			expected: ['Welcome to IDEA', '1', 'true']
		}
	]
};
