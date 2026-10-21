import { hydrated } from './_coin-market.mjs';
import { ROSTER_COUNTS } from '../../../src/routes/dev/coin-stocks/stock-roster.js';

/**
 * THE IDEA STOCK MARKET (ledger 0402): the IDEA index, every stock with its
 * chart, the portfolio (never part of the balance), the leaderboard, and the
 * rules in words, no shorting among them. The stock and chart counts come
 * from the harness's own roster (ledger 0425), never a literal: the literals
 * 4 and 5 went stale when 0421 added three area stocks.
 */
export default {
	path: '/dev/coin-stocks',
	label: 'IDEA Stocks: the index, every stock, portfolio, leaderboard, rules',
	prepare: hydrated(),
	presence: [
		{ selector: '[data-testid="sk-index"]', label: 'the index', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="sk-stock"]', label: `every stock in the roster (${ROSTER_COUNTS.cards})`, expectPresent: ROSTER_COUNTS.cards, maxPresent: ROSTER_COUNTS.cards, expectVisible: ROSTER_COUNTS.cards },
		{ selector: '[data-testid="sk-chart"]', label: `a chart each, the index too (${ROSTER_COUNTS.charts})`, expectPresent: ROSTER_COUNTS.charts, maxPresent: ROSTER_COUNTS.charts, expectVisible: ROSTER_COUNTS.charts },
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
