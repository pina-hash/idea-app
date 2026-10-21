import { hydrated } from './_coin-market.mjs';

/** One stock's page: How this price is made, the launch, every recent price change with its recorded inputs and formula version, the days since the launch. */
export default {
	path: '/dev/coin-stocks?detail=1',
	label: 'IDEA Stocks: one stock, how its price is made',
	prepare: hydrated(),
	presence: [
		{ selector: '[data-testid="sk-made"]', label: 'How this price is made', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="sk-tick-row"]', label: 'a row per price change', expectPresent: 40 },
		{ selector: '[data-testid="sk-launch"]', label: 'the launch', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="sk-chart"]', label: 'the chart', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="sk-made"]', label: 'inputs and version', must: ['v2', 'person-days', 'Launched'] }],
	contrast: [{ selector: '[data-testid="sk-tick-row"]', label: 'price change rows', min: 4.5 }]
};
