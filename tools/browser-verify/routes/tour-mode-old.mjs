/**
 * THE HOME TOUR, OFFERED AGAIN ONCE TO SOMEBODY WHO FINISHED THE OLD ONE
 * (ledger 0298, report R22). Their stamp predates `HOME_TOUR_VERSION`, so
 * nothing starts on its own: one row under the header, in the page flow above
 * the hero, words and two buttons, nothing dimmed and nothing paused.
 *
 * RECORDED THE MOMENT IT SHOWS: the stub client's log carries the
 * `tour_completed_at` write, and the stamp is not older than the version, or
 * the offer would come back on every visit. The row's words and buttons are
 * measured against the 4.5:1 and 44px floors.
 */
import { HIDE_HARNESS_PANEL, OFFER_EDGES, OFFER_UP, STAMP_WRITTEN } from './_home-tour.mjs';

export default {
	path: '/dev/tour?mode=old',
	label: 'Home tour offer (finished the old tour): one row under the header, stamped when shown',
	settleMs: 1500,
	prepare: [HIDE_HARNESS_PANEL, OFFER_UP, OFFER_EDGES],
	presence: [
		{ selector: '[data-testid="tour-offer"]', label: 'the offer row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tour-callout"]', label: 'nothing started on its own', expectPresent: 0 },
		{ selector: '[data-tour="hero"]', label: 'POSITIVE CONTROL: the page under the offer', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	domOrder: [
		{ before: '.legacy-index header', after: '[data-testid="tour-offer"]', label: 'the offer sits under the header' },
		{ before: '[data-testid="tour-offer"]', after: '[data-tour="hero"]', label: 'and above the hero, in the flow' }
	],
	contrast: [
		{ selector: '[data-testid="tour-offer"] .hto-text', label: 'the offer words', min: 4.5 },
		{ selector: '[data-testid="tour-offer-start"]', label: 'Show me around', min: 4.5 },
		{ selector: '[data-testid="tour-offer-dismiss"]', label: 'Not now', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="tour-offer"] button', label: 'the offer buttons', min: 44 }],
	orderResult: [
		{ label: 'the offer stamped the profile when it showed, never older than the version', evaluate: STAMP_WRITTEN, expected: ['true', 'true'] }
	]
};
