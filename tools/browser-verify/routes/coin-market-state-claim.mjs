import { hydrated } from './_coin-market.mjs';

/** A classmate's offer opened: who is selling, their rating, the price, and Claim, which holds the coins in escrow. */
export default {
	path: '/dev/coin-market-state-claim',
	aliasOf: '/dev/coin-market',
	label: 'IDEA Market: a listing opened, Claim armed',
	prepare: [
		...hydrated(),
		{ click: '[data-testid="mk-board"] [data-testid="mk-listing"]', until: '() => !!document.querySelector("[data-testid=\\"mk-listing-dialog\\"][open]")' },
		{ click: '[data-testid="mk-claim"]', until: '() => !!document.querySelector("[data-testid=\\"mk-claim-confirm\\"]")' }
	],
	presence: [
		{ selector: '[data-testid="mk-listing-dialog"]', label: 'the listing dialog', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="mk-profile"]', label: "the seller's profile line", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="mk-claim-confirm"]', label: 'the second press', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="mk-listing-dialog"]', label: 'the hold is said before it happens', must: ['3.50', 'held'] }],
	tapTargets: [{ selector: '[data-testid="mk-listing-dialog"] button', label: 'every key in the dialog', min: 44 }],
	contrast: [{ selector: '[data-testid="mk-listing-dialog"] p', label: 'dialog sentences', min: 4.5 }]
};
