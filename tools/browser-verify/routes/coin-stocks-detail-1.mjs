import { hydrated } from './_coin-market.mjs';

/** One stock's page: How this price is made, every close with its recorded inputs and formula version; carried days say why. */
export default {
	path: '/dev/coin-stocks?detail=1',
	label: 'IDEA Stocks: one stock, how its price is made',
	prepare: hydrated(),
	presence: [
		{ selector: '[data-testid="sk-made"]', label: 'How this price is made', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="sk-close-row"]', label: 'a row per close', expectPresent: 40 },
		{ selector: '[data-testid="sk-chart"]', label: 'the chart', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="sk-made"]', label: 'inputs and version', must: ['v1', 'People each day'] }],
	contrast: [{ selector: '[data-testid="sk-close-row"]', label: 'close rows', min: 4.5 }]
};
