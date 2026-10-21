// tests/coin-stocks-client.test.ts
//
// THE STOCK PAGE'S CLIENT RULES (ledger 0402; formula v2 since 0283): the
// chart maps the series into its box (a flat series still draws), the move is
// said in words, the rule sentences carry the board's own numbers (the launch
// ramp and the circuit breakers come from the database, never from a copy
// here), a pause is refused in plain words, and the trade preview mirrors the
// fee the database takes.

import { describe, expect, test } from 'vitest';
import {
	changeWords,
	chartGeometry,
	haltRulesWords,
	haltWords,
	parseStock,
	parseStocksBoard,
	phaseWords,
	priceFormulaWords,
	rampWords,
	sharesFor,
	stockRefusalWords,
	tradeRulesWords
} from '$lib/coin-stocks/stocks';

describe('the chart', () => {
	test('points stay inside the box, oldest left, highest price at the top', () => {
		const g = chartGeometry(
			[
				{ at: '2026-10-21T15:00:00Z', close: 10 },
				{ at: '2026-10-21T15:01:00Z', close: 12 },
				{ at: '2026-10-21T15:02:00Z', close: 8 }
			],
			200,
			60
		)!;
		expect(g.points.map((p) => p.x)).toEqual([6, 100, 194]);
		expect(g.points[1].y).toBe(6);
		expect(g.points[2].y).toBe(54);
	});
	test('a flat series still draws, mid-box', () => {
		const g = chartGeometry([{ at: 'a', close: 10 }, { at: 'b', close: 10 }], 100, 40)!;
		expect(g.points[0].y).toBe(20);
	});
	test('an empty series draws nothing', () => {
		expect(chartGeometry([], 100, 40)).toBeNull();
	});
});

// The board as 0283's coin_stocks_board answers it, with numbers that differ
// from the shipped ones, so a sentence reading a constant instead of the
// board would show the wrong figure.
const BOARD = {
	signed_in: true,
	rules: {
		fee_percent: 3,
		position_cap: 40,
		floor: 2,
		ceiling: 90,
		base: 10,
		ramp: [
			{ week: 1, cap_percent: 4 },
			{ week: 2, cap_percent: 8 },
			{ week: 3, cap_percent: 12 }
		],
		halts: [
			{ level: 1, move_percent: 9, minutes: 10 },
			{ level: 2, move_percent: 18, minutes: null }
		]
	}
};

describe('words', () => {
	test('a move is a sentence, never only a colour', () => {
		expect(changeWords(2.4)).toEqual({ text: 'Up 2.40%', tone: 'up' });
		expect(changeWords(-1)).toEqual({ text: 'Down 1.00%', tone: 'down' });
		expect(changeWords(null).text).toBe('Unchanged');
	});
	test('the formula, the ramp, the breakers and the trading rules read the board', () => {
		const board = parseStocksBoard(BOARD)!;
		expect(priceFormulaWords(board.rules)).toMatch(/every minute.*between 2 and 90/);
		expect(rampWords(board.rules)).toBe(
			"For the first 3 weeks after the launch, a price can move at most 4% in week 1, 8% in week 2 and 12% in week 3, counted from the day's starting price. After that there is no daily limit."
		);
		expect(haltRulesWords(board.rules)).toMatch(/a move up or down of 9% pauses it for 10 minutes and 18% for the rest of the day\./);
		const rules = tradeRulesWords(board.rules);
		expect(rules).toMatch(/3% fee/);
		expect(rules).toMatch(/No shorting/);
		for (const s of [priceFormulaWords(board.rules), rampWords(board.rules), haltRulesWords(board.rules), rules]) expect(s).not.toMatch(/—/);
	});
	test('a stock says where it stands: a launch week, or open with a pause in force', () => {
		const ramp = parseStock({ id: 'g', kind: 'gauntlet', phase: { phase: 'ramp', week: 2, cap_percent: 10 } })!;
		expect(phaseWords(ramp.phase)).toBe('Launch week 2: moves at most 10% a day.');
		const halted = parseStock({
			id: 'g',
			kind: 'gauntlet',
			phase: { phase: 'open', week: 6 },
			halt: { level: 1, move_percent: -11.4, until: '2026-10-21T17:17:00Z', rest_of_day: false }
		})!;
		expect(phaseWords(halted.phase)).toMatch(/No daily limit/);
		expect(haltWords(halted.halt)).toBe('Trading is paused until 10:17 AM: its price moved 11.4% today.');
		const rest = parseStock({ id: 'g', kind: 'gauntlet', halt: { level: 3, move_percent: 31, until: '2026-10-22T07:00:00Z', rest_of_day: true } })!;
		expect(haltWords(rest.halt)).toMatch(/rest of the day/);
		// Control: a stock with no pause says nothing about one.
		expect(haltWords(ramp.halt)).toBe('');
	});
	test('a short sale, a closed day and a pause are refused in words', () => {
		expect(stockRefusalWords({ reason: 'no_short' })).toMatch(/no shorting/);
		expect(stockRefusalWords({ reason: 'market_closed' })).toMatch(/class days/);
		expect(stockRefusalWords({ reason: 'halted', until: '2026-10-21T17:17:00Z', move_percent: 12 })).toBe(
			'Trading in this stock is paused until 10:17 AM because its price moved 12% today. Buying and selling open again then.'
		);
		expect(stockRefusalWords({ reason: 'halted', until: '2026-10-22T07:00:00Z', rest_of_day: true })).toMatch(/rest of the day/);
	});
	test('the buy preview takes the fee first, as the database does', () => {
		expect(sharesFor(10, 2, 2)).toBeCloseTo(4.9, 6);
		expect(sharesFor(0, 2, 2)).toBe(0);
	});
});
