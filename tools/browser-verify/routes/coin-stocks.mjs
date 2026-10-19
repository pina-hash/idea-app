import { hydrated } from './_coin-market.mjs';

/**
 * THE IDEA STOCK MARKET (ledger 0402): the IDEA index, four stocks with their
 * charts, the portfolio (never part of the balance), the leaderboard, and the
 * rules in words, no shorting among them.
 */
export default {
	path: '/dev/coin-stocks',
	label: 'IDEA Stocks: the index, four stocks, portfolio, leaderboard, rules',
	prepare: hydrated(),
	presence: [
		{ selector: '[data-testid="sk-index"]', label: 'the index', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="sk-stock"]', label: 'four stocks', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="sk-chart"]', label: 'a chart each, the index too', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="sk-portfolio"]', label: 'the portfolio', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="sk-leaderboard"]', label: 'the leaderboard', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="sk-closed"]', label: 'open today', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="sk-rules"]', label: 'the rules say no shorting, the fee and the cap', must: ['No shorting', '2%', '50'] },
		{ selector: '[data-testid="sk-portfolio"]', label: 'shares are not the balance', must: ['balance'] }
	],
	tapTargets: [{ selector: '[data-testid="sk-page"] button', label: 'every key', min: 44 }],
	contrast: [
		{ selector: '[data-testid="sk-stock"] .sk-name', label: 'stock names', min: 4.5 },
		{ selector: '[data-testid="sk-rules"] p', label: 'the rules', min: 4.5 },
		{ selector: '[data-testid="sk-portfolio-value"]', label: 'portfolio value', min: 4.5 }
	]
};
