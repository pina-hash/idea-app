import { hydrated } from './_coin-market.mjs';

/** The coin page's market strip: the market door, the portfolio (never part of the balance, and said), Send coins, hall pass time. */
export default {
	path: '/dev/coin-market?view=coin-page',
	label: 'Coin page: market strip, portfolio, send, hall pass time',
	prepare: hydrated(),
	presence: [
		{ selector: '[data-testid="coin-market-strip"]', label: 'the strip', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-market-link"]', label: 'the door to /market', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-portfolio"]', label: 'the portfolio', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="hall-pass-minutes"]', label: 'hall pass time', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="coin-portfolio"]', label: 'a portfolio is not the balance', must: ['not part of your balance'] }],
	tapTargets: [{ selector: '[data-testid="coin-market-strip"] button, [data-testid="coin-market-strip"] a', label: 'every key', min: 44 }],
	contrast: [{ selector: '[data-testid="coin-market-strip"] p', label: 'strip words', min: 4.5 }]
};
