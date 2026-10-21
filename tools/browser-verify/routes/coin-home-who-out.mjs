/**
 * /coin signed out (ledger 0422): the Ledger preview from the public board,
 * a sign-in key, and every other preview asking for a sign-in.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export default {
	path: '/dev/coin-home?who=out',
	label: 'Coin home signed out: the public Ledger, a sign-in for the rest',
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '[data-testid="ch-signin"]', label: 'the sign-in key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ch-balance"]', label: 'no balance', expectPresent: 0, maxPresent: 0 },
		{ selector: '.ch-board li', label: 'the public top three', expectPresent: 3, maxPresent: 3 },
		{ selector: '.ch-card .ch-quiet', label: 'three sign-in notes', expectPresent: 3, maxPresent: 3 }
	],
	orderResult: [
		{
			label: 'no horizontal scroll',
			evaluate: `() => [document.documentElement.scrollWidth === document.documentElement.clientWidth ? 'no overflow' : 'overflow ' + document.documentElement.scrollWidth]`,
			expected: ['no overflow']
		}
	],
	contrast: [{ selector: '.ch-quiet', label: 'sign-in notes', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="ch-signin"]', label: 'the sign-in key', min: 44 }]
};
