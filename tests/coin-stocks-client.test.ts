// tests/coin-stocks-client.test.ts
//
// THE STOCK PAGE'S CLIENT RULES (ledger 0402): the chart maps the series into
// its box (a flat series still draws), the move is said in words, the rules
// sentence carries the board's own numbers, and the trade preview mirrors the
// fee the database takes.

import { describe, expect, test } from 'vitest';
import { changeWords, chartGeometry, parseStocksBoard, priceFormulaWords, sharesFor, stockRefusalWords, tradeRulesWords } from '$lib/coin-stocks/stocks';

describe('the chart', () => {
	test('points stay inside the box, oldest left, highest close at the top', () => {
		const g = chartGeometry(
			[
				{ day: 'a', close: 10, carried: false },
				{ day: 'b', close: 12, carried: false },
				{ day: 'c', close: 8, carried: true }
			],
			200,
			60
		)!;
		expect(g.points.map((p) => p.x)).toEqual([6, 100, 194]);
		expect(g.points[1].y).toBe(6);
		expect(g.points[2].y).toBe(54);
		expect(g.points[2].carried).toBe(true);
	});
	test('a flat series still draws, mid-box', () => {
		const g = chartGeometry([{ day: 'a', close: 10, carried: false }, { day: 'b', close: 10, carried: false }], 100, 40)!;
		expect(g.points[0].y).toBe(20);
	});
	test('an empty series draws nothing', () => {
		expect(chartGeometry([], 100, 40)).toBeNull();
	});
});

describe('words', () => {
	test('a move is a sentence, never only a colour', () => {
		expect(changeWords(2.4)).toEqual({ text: 'Up 2.40%', tone: 'up' });
		expect(changeWords(-1)).toEqual({ text: 'Down 1.00%', tone: 'down' });
		expect(changeWords(null).text).toBe('Unchanged');
	});
	test('the formula and the trading rules read the board, and say no shorting', () => {
		const board = parseStocksBoard({ signed_in: true, rules: { fee_percent: 3, position_cap: 40, clamp_percent: 8, floor: 2, ceiling: 90, base: 10, median_weeks: 6 } })!;
		expect(priceFormulaWords(board.rules)).toMatch(/last 6 weeks.*8% a day.*between 2 and 90/);
		const rules = tradeRulesWords(board.rules);
		expect(rules).toMatch(/3% fee/);
		expect(rules).toMatch(/No shorting/);
	});
	test('a short sale and a closed day are refused in words', () => {
		expect(stockRefusalWords({ reason: 'no_short' })).toMatch(/no shorting/);
		expect(stockRefusalWords({ reason: 'market_closed' })).toMatch(/class days/);
	});
	test('the buy preview takes the fee first, as the database does', () => {
		expect(sharesFor(10, 2, 2)).toBeCloseTo(4.9, 6);
		expect(sharesFor(0, 2, 2)).toBe(0);
	});
});
