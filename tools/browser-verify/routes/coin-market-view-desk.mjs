import { hydrated } from './_coin-market.mjs';

/** The Coin Desk's market page: every market card with its featured switch (ledger 0425), a dispute with release, refund and split, listings to feature or hide, reviews, the banner pins, transfers, stocks. */
export default {
	path: '/dev/coin-market?view=desk',
	label: 'Coin Desk market page',
	prepare: [...hydrated(), { waitFor: '() => !!document.querySelector("[data-testid=\\"md-disputes\\"]")', timeoutMs: 10000 }],
	presence: [
		{ selector: '[data-testid="md-card"]', label: 'every market card (the harness holds five)', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="md-card-feature"]', label: 'a featured switch on each card', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="md-card"][data-featured="true"]', label: 'the two tissue box want-ads featured', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="md-dispute"]', label: 'one dispute', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="md-release"]', label: 'Release', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="md-refund"]', label: 'Refund', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="md-split"]', label: 'Split', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="md-listing"]', label: 'listings to moderate', expectPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="md-banner"]', label: 'the banner pins', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="md-transfers"]', label: 'transfers', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="md-stocks"]', label: 'stocks', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [{ selector: '[data-testid="market-desk"] button', label: 'every desk key', min: 44 }],
	contrast: [{ selector: '[data-testid="market-desk"] p', label: 'desk sentences', min: 4.5 }]
};
