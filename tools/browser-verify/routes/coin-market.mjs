import { hydrated, MARKET_CONTRAST, MARKET_TAPS } from './_coin-market.mjs';

/**
 * THE IDEA MARKET (ledger 0402): both zones, every escrow state on Your
 * trades, your listings, and the transfer feed. The official zone holds the
 * shop, two donation want-ads, the desktop background and one staff card
 * (contracts are retired, ledger 0432); the student zone holds six classmates' listings.
 */
export default {
	path: '/dev/coin-market',
	label: 'IDEA Market: official and student zones, trades in every escrow state, transfers',
	prepare: hydrated(),
	presence: [
		{ selector: '[data-testid="mk-official"]', label: 'the official zone', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="mk-official-tile"]', label: 'eight official tiles (contracts are retired)', expectPresent: 8, maxPresent: 8, expectVisible: 8 },
		{ selector: '[data-testid="mk-students"]', label: 'the student zone', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="mk-board"] [data-testid="mk-listing"]', label: "six classmates' listings", expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="mk-mine"] [data-testid="mk-listing"]', label: 'two of your own listings', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="mk-trade"]', label: 'six trades', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="mk-feed-row"]', label: 'three public transfers', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="mk-confirm"]', label: 'one trade waiting on your confirmation', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="mk-deliver"]', label: 'one trade you deliver', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="mk-debt"]', label: 'no debt line', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="mk-trades"]', label: 'every state named in words', must: ['Coins held', 'Marked done', 'Disputed', 'Paid', 'Refunded'] },
		{ selector: '[data-testid="mk-trades"]', label: 'auto release counts down in class days', must: ['3 class days'] },
		{ selector: '[data-testid="mk-transfers"]', label: 'a removed message says so', must: ['Message removed by staff'] }
	],
	tapTargets: MARKET_TAPS,
	contrast: MARKET_CONTRAST
};
