import { hydrated } from './_coin-market.mjs';

/** In debt: said once, in words, at the top; buying is held back but selling is not. */
export default {
	path: '/dev/coin-market?debt=1',
	label: 'IDEA Market in debt',
	prepare: hydrated(),
	presence: [{ selector: '[data-testid="mk-debt"]', label: 'the debt sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 }],
	textContains: [{ selector: '[data-testid="mk-debt"]', label: 'what debt stops and what it does not', must: ['sell', 'not buy'] }],
	contrast: [{ selector: '[data-testid="mk-debt"]', label: 'the debt sentence', min: 4.5 }]
};
