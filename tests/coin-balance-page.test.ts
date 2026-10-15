// tests/coin-balance-page.test.ts
//
// The pure half of the V2 student coin page (`/coin-balance`, 0241): the
// payload parse, the undone-pair hiding, the rule groups, the two prices shown
// before a purchase, and a refusal sentence for every reason the purchases can
// answer. The expected prices come from the migration's own arithmetic
// written out by hand here, never from the helper under test.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	coinBuyRefusalWords,
	coinCanAfford,
	coinExtraCreditCost,
	coinPrintPrice,
	coinWhen,
	groupCoinRules,
	noShopWhy,
	parseCoinMyPage,
	visibleHistory,
	type CoinPageHistoryRow
} from '../src/lib/coin-balance';
import { readBuyAnswer } from '../src/lib/coin-balance/transports';
import { COIN_SYMBOL } from '../src/lib/coin-format';
import { schoolDayOf } from '../src/lib/classroom/school-calendar';

function h(id: string, extra: Partial<CoinPageHistoryRow> = {}): CoinPageHistoryRow {
	return {
		id,
		at: '2026-10-15T18:00:00Z',
		amount: 1,
		category_id: 'weekly_wage',
		name: 'Weekly Wage',
		kind: 'award',
		note: null,
		reverses: null,
		reversed: false,
		automatic: false,
		...extra
	};
}

describe('parseCoinMyPage', () => {
	it('answers null for a signed-out payload and for garbage, so the page shows sign-in', () => {
		expect(parseCoinMyPage({ signed_in: false })).toBeNull();
		expect(parseCoinMyPage(null)).toBeNull();
		expect(parseCoinMyPage('x')).toBeNull();
	});

	it('reads numerics sent as strings, and keeps a negative balance negative', () => {
		const p = parseCoinMyPage({
			signed_in: true,
			in_economy: true,
			balance: '-12.25',
			wage_tier: 2,
			weekly_wage: '2',
			pay_raise: { tier: 2, new_tier: 3, cost: '200', wage_now: '2', wage_after: '3' },
			eating_pass: { active: false, strikes: 3, revoked_at: '2026-10-10T19:20:00Z', price: '15' },
			print: { grams_per_coin: '10', active: true },
			extra_credit: { price_per_point: '2.5', classes: [] },
			history: [{ id: 'a', at: '2026-10-01T00:00:00Z', amount: '-7.50', category_id: 'extra_credit', name: 'Extra Credit', kind: 'purchase', note: '', reverses: null, reversed: false, automatic: false }],
			rules: []
		})!;
		expect(p.balance).toBe(-12.25);
		expect(p.pay_raise.cost).toBe(200);
		expect(p.eating_pass.price).toBe(15);
		expect(p.extra_credit.price_per_point).toBe(2.5);
		expect(p.history[0].amount).toBe(-7.5);
		// An empty note is no note, so a line never ends in an empty reason.
		expect(p.history[0].note).toBeNull();
	});

	it('a missing price is NULL (not for sale), never 0 (free)', () => {
		const p = parseCoinMyPage({ signed_in: true, eating_pass: { active: false, strikes: 0, price: null }, extra_credit: { price_per_point: null } })!;
		expect(p.eating_pass.price).toBeNull();
		expect(p.extra_credit.price_per_point).toBeNull();
	});
});

describe('visibleHistory hides BOTH halves of an undone pair', () => {
	it('drops the undone row and the undo, keeps the rest in order, and counts the pairs', () => {
		const rows = [h('u', { reverses: 'b', category_id: 'reversal' }), h('a'), h('b', { reversed: true }), h('c')];
		const v = visibleHistory(rows);
		expect(v.rows.map((r) => r.id)).toEqual(['a', 'c']);
		expect(v.hiddenPairs).toBe(1);
	});
	it('the positive control: nothing undone hides nothing', () => {
		const v = visibleHistory([h('a'), h('b')]);
		expect(v.rows).toHaveLength(2);
		expect(v.hiddenPairs).toBe(0);
	});
});

describe('groupCoinRules', () => {
	it('groups by the payload type, in Awards, Fines, Purchases order, sorted inside', () => {
		const rule = (type: string, reason: string, sort_order: number) => ({ type, reason, detail: '1', sort_order, category_id: reason, explanation: null });
		const g = groupCoinRules([rule('Fine', 'B', 2), rule('Purchase', 'P', 1), rule('Fine', 'A', 1), rule('Award', 'W', 1)]);
		expect(g.map((x) => x.heading)).toEqual(['Awards', 'Fines', 'Purchases']);
		expect(g[1].rules.map((r) => r.reason)).toEqual(['A', 'B']);
	});
	it('an empty group is not listed', () => {
		expect(groupCoinRules([]).length).toBe(0);
	});
});

describe('the prices shown before a purchase', () => {
	it('3D print: round half up of grams over grams per coin (0239 _coin_print_price)', () => {
		expect(coinPrintPrice(25, 10)).toBe(3); // 2.5 rounds UP
		expect(coinPrintPrice(24.9, 10)).toBe(2);
		expect(coinPrintPrice(42.5, 10)).toBe(4); // 4.25
		expect(coinPrintPrice(4, 10)).toBe(0);
		expect(coinPrintPrice(15, 10)).toBe(2); // 1.5 rounds up
		expect(coinPrintPrice(0.15, 0.1)).toBe(2); // float noise must not round a half down
	});
	it('extra credit: price per point times points, to the cent', () => {
		expect(coinExtraCreditCost(3, 2.5)).toBe(7.5);
		expect(coinExtraCreditCost(3, 0.1)).toBe(0.3);
	});
	it('the purchase rule: balance after must be 0 or more', () => {
		expect(coinCanAfford(15, 15)).toBe(true);
		expect(coinCanAfford(14.99, 15)).toBe(false);
		expect(coinCanAfford(-1, 0)).toBe(false);
		expect(coinCanAfford(0, 0)).toBe(true);
	});
});

describe('every refusal reason has a sentence', () => {
	const REASONS = ['signed_out', 'not_in_economy', 'rate_limited', 'insufficient', 'pass_already_active', 'cap', 'not_your_work', 'not_your_class', 'grams', 'points', 'no_semester', 'not_available'];
	const fallback = coinBuyRefusalWords({ reason: 'something_new' });
	for (const reason of REASONS) {
		it(reason, () => {
			const w = coinBuyRefusalWords({ reason, balance: 3, cost: 15, room: { remaining_points: 2 } });
			expect(w.length).toBeGreaterThan(10);
			expect(w).not.toBe(fallback);
			// A code is never shown; 'grams' and 'points' are also plain words.
			if (reason.includes('_')) expect(w).not.toContain(reason);
			expect(w).not.toMatch(/—/); // no em dash in student copy
		});
	}
	it('insufficient names the cost and the balance with the coin symbol', () => {
		const w = coinBuyRefusalWords({ reason: 'insufficient', balance: '3.5', cost: 15 });
		expect(w).toContain(`15${COIN_SYMBOL}`);
		expect(w).toContain(`3.50${COIN_SYMBOL}`);
	});
});

describe('noShopWhy', () => {
	const today = '2026-10-15';
	it("today's shop safety fine is the why, with its note", () => {
		const rows = [h('f', { category_id: 'shop_safety_violation', note: 'No glasses.', at: '2026-10-15T15:00:00Z' })];
		expect(noShopWhy(rows, today, schoolDayOf)).toContain('No glasses.');
	});
	it("an undone fine or yesterday's fine is not the why", () => {
		const rows = [
			h('f', { category_id: 'shop_safety_violation', note: 'Undone.', reversed: true }),
			h('g', { category_id: 'shop_safety_violation', note: 'Old.', at: '2026-10-14T15:00:00Z' })
		];
		expect(noShopWhy(rows, today, schoolDayOf)).toBe('Mr. Pina marked it for today.');
	});
});

describe('readBuyAnswer', () => {
	it('a missing function is not for sale, never a crash', () => {
		expect(readBuyAnswer({ data: null, error: { code: 'PGRST202' } })).toEqual({ ok: false, reason: 'not_available' });
		expect(readBuyAnswer({ data: null, error: { code: '42883' } })).toEqual({ ok: false, reason: 'not_available' });
	});
	it('a structured refusal keeps its reason and figures', () => {
		const r = readBuyAnswer({ data: { ok: false, reason: 'insufficient', balance: '3', cost: '15' }, error: null });
		expect(r).toMatchObject({ ok: false, reason: 'insufficient', balance: 3, cost: 15 });
	});
	it('success reads numerics', () => {
		expect(readBuyAnswer({ data: { ok: true, cost: '15', balance: '123.5' }, error: null })).toMatchObject({ ok: true, cost: 15, balance: 123.5 });
	});
});

describe('copy rules on the new page sources', () => {
	const ROOT = fileURLToPath(new URL('..', import.meta.url));
	const FILES = ['src/lib/coin-balance/CoinPageView.svelte', 'src/lib/coin-balance/CoinBuy.svelte', 'src/lib/coin-balance/CoinPageBody.svelte', 'src/lib/coin-balance.ts'];
	const WEEKDAYS = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/;
	for (const f of FILES) {
		it(`${f}: no em dash, no weekday, no literal coin symbol outside comments`, () => {
			const src = readFileSync(ROOT + f, 'utf8')
				.replace(/\/\*[\s\S]*?\*\//g, ' ')
				.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
				.replace(/<!--[\s\S]*?-->/g, ' ');
			expect(src).not.toMatch(/—/);
			expect(src).not.toMatch(WEEKDAYS);
			expect(src).not.toContain(COIN_SYMBOL);
		});
	}
	it('coinWhen never names a weekday', () => {
		expect(coinWhen('2026-10-15T22:05:00Z')).toBe('Oct 15, 3:05 PM');
	});
});
