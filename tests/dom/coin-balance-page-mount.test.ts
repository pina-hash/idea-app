// tests/dom/coin-balance-page-mount.test.ts
//
// The V2 student coin page (`/coin-balance`), mounted for real. Structure and
// events only (see ./mount.ts for why no geometry is asserted here):
//   * an omitted transport removes its purchase, and no transport removes the
//     Buy section, in both directions;
//   * a purchase is two presses, and only the second calls the transport;
//   * a purchase the balance cannot cover is refused in words BEFORE the
//     press, the control is aria-disabled (never disabled), and pressing it
//     calls nothing;
//   * a refusal the database returns is shown as a sentence;
//   * a negative balance is the balance, said in words, with no second figure;
//   * an undone pair is hidden and the count is said.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';
import CoinPageBody from '$lib/coin-balance/CoinPageBody.svelte';
import { parseCoinMyPage, type CoinMyPage } from '$lib/coin-balance';
import { COIN_SYMBOL } from '$lib/coin-format';
import { mountInto, type Mounted } from './mount';
import { fixturePage } from '../../src/routes/dev/coin-balance/fixture';

let m: Mounted | null = null;
afterEach(async () => {
	await m?.stop();
	m = null;
});

const NOW = Date.parse('2026-10-15T19:00:00Z');

function open(page: CoinMyPage | null, transports: Record<string, unknown> = {}, state = 'ready') {
	m = mountInto(CoinPageBody as unknown as Component<Record<string, unknown>>, {
		state,
		page,
		transports,
		now: NOW,
		onsignin: () => {},
		onchanged: vi.fn()
	});
	return m;
}

const populated = () => parseCoinMyPage(fixturePage('populated'))!;
const debt = () => parseCoinMyPage(fixturePage('debt'))!;
const ok = () => Promise.resolve({ ok: true as const, cost: 15, balance: 123.5 });

function all() {
	return {
		buyEatingPass: vi.fn(ok),
		buyPayRaise: vi.fn(ok),
		buyPrint: vi.fn(ok),
		buyExtraCredit: vi.fn(ok)
	};
}

describe('the Buy section is structural', () => {
	it('four transports, four purchases; none, no Buy section at all', () => {
		const v = open(populated(), all());
		expect(v.all('[data-testid="coin-buy"]')).toHaveLength(1);
		for (const id of ['buy-eating-pass', 'buy-pay-raise', 'buy-print', 'buy-extra-credit']) {
			expect(v.all(`[data-testid="${id}"]`), id).toHaveLength(1);
		}
		void v.stop();
		const w = open(populated(), {});
		expect(w.all('[data-testid="coin-buy"]')).toHaveLength(0);
		expect(w.all('button[data-testid="buy-arm"]')).toHaveLength(0);
		// The positive control: the read half of the page is still there.
		expect(w.all('[data-testid="coin-row"]').length).toBeGreaterThan(0);
	});

	it('one omitted transport removes exactly its own purchase', () => {
		const t = all();
		const v = open(populated(), { buyPrint: t.buyPrint });
		expect(v.all('[data-testid="buy-print"]')).toHaveLength(1);
		expect(v.all('[data-testid="buy-eating-pass"]')).toHaveLength(0);
		expect(v.all('[data-testid="buy-pay-raise"]')).toHaveLength(0);
	});

	it('a student outside the economy is offered nothing to buy, and told why', () => {
		const v = open(parseCoinMyPage(fixturePage('outside'))!, all());
		expect(v.all('[data-testid="coin-buy"]')).toHaveLength(0);
		expect(v.one('[data-testid="coin-not-in-economy"]').textContent).toContain('None of your classes');
	});
});

describe('a purchase is two presses', () => {
	it('the first press shows cost and balance after; only the confirm calls the transport', async () => {
		const t = all();
		const p = populated();
		p.balance = 300;
		const v = open(p, t);
		const card = v.one('[data-testid="buy-pay-raise"]');
		(card.querySelector('[data-testid="buy-arm"]') as HTMLButtonElement).click();
		v.flush();
		expect(t.buyPayRaise).not.toHaveBeenCalled();
		const panel = card.querySelector('[data-testid="buy-confirm-panel"]')!;
		expect(panel.textContent).toContain(`200${COIN_SYMBOL}`);
		expect(panel.textContent).toContain(`300${COIN_SYMBOL}`);
		expect(panel.textContent).toContain(`100${COIN_SYMBOL}`);
		(card.querySelector('[data-testid="buy-confirm"]') as HTMLButtonElement).click();
		await v.settle();
		expect(t.buyPayRaise).toHaveBeenCalledTimes(1);
		expect(card.querySelector('[data-testid="buy-outcome"]')!.textContent).toContain('Done');
	});

	it('extra credit sends the class, the work and the points picked', async () => {
		const t = all();
		const v = open(populated(), t);
		const card = v.one('[data-testid="buy-extra-credit"]');
		const work = card.querySelector('[data-testid="ec-work"]') as HTMLSelectElement;
		work.value = 'sub-lab4';
		work.dispatchEvent(new Event('change', { bubbles: true }));
		const pts = card.querySelector('[data-testid="ec-points"]') as HTMLInputElement;
		pts.value = '2';
		pts.dispatchEvent(new Event('input', { bubbles: true }));
		v.flush();
		expect(card.querySelector('[data-testid="buy-cost"]')!.textContent).toBe(`5${COIN_SYMBOL}`);
		expect(card.querySelectorAll('[data-testid="buy-blocked"]'), card.querySelector('[data-testid="buy-blocked"]')?.textContent ?? '').toHaveLength(0);
		(card.querySelector('[data-testid="buy-arm"]') as HTMLButtonElement).click();
		v.flush();
		(card.querySelector('[data-testid="buy-confirm"]') as HTMLButtonElement).click();
		await v.settle();
		expect(t.buyExtraCredit).toHaveBeenCalledWith('sec-eng1', 'sub-lab4', 2);
	});
});

describe('refused before the press, in words', () => {
	it('in debt: every purchase with a cost says why, is aria-disabled, and a press calls nothing', () => {
		const t = all();
		const v = open(debt(), t);
		const card = v.one('[data-testid="buy-eating-pass"]');
		const arm = card.querySelector('[data-testid="buy-arm"]') as HTMLButtonElement;
		expect(arm.getAttribute('aria-disabled')).toBe('true');
		expect(arm.disabled).toBe(false);
		expect(card.querySelector('[data-testid="buy-blocked"]')!.textContent).toContain('A purchase has to leave you at');
		arm.click();
		v.flush();
		expect(card.querySelectorAll('[data-testid="buy-confirm-panel"]')).toHaveLength(0);
		expect(t.buyEatingPass).not.toHaveBeenCalled();
	});

	it('the positive control: an affordable pass is not blocked', () => {
		const p = debt();
		p.balance = 50;
		const v = open(p, all());
		const arm = v.one('[data-testid="buy-eating-pass"] [data-testid="buy-arm"]');
		expect(arm.getAttribute('aria-disabled')).toBeNull();
		expect(v.all('[data-testid="buy-eating-pass"] [data-testid="buy-blocked"]')).toHaveLength(0);
	});

	it('a held pass cannot be bought again', () => {
		const v = open(populated(), all());
		expect(v.one('[data-testid="buy-eating-pass"] [data-testid="buy-blocked"]').textContent).toContain('already hold');
	});

	it("a database refusal is shown as a sentence", async () => {
		const p = debt();
		p.balance = 500;
		const v = open(p, { buyEatingPass: () => Promise.resolve({ ok: false, reason: 'rate_limited' }) });
		const card = v.one('[data-testid="buy-eating-pass"]');
		(card.querySelector('[data-testid="buy-arm"]') as HTMLButtonElement).click();
		v.flush();
		(card.querySelector('[data-testid="buy-confirm"]') as HTMLButtonElement).click();
		await v.settle();
		expect(card.querySelector('[data-testid="buy-outcome"]')!.textContent).toContain('Wait a minute');
	});
});

describe('the standing', () => {
	it('a negative balance is the balance, in words, with no second figure', () => {
		const v = open(debt(), all());
		expect(v.one('[data-testid="coin-balance"]').textContent).toBe(`-12.25${COIN_SYMBOL}`);
		expect(v.one('[data-testid="coin-debt"]').textContent).toBe('In debt');
		const text = v.target.textContent ?? '';
		expect(text).not.toMatch(/physical|digital|lifetime|paid out/i);
	});
	it('the positive control: a positive balance says nothing about debt', () => {
		const v = open(populated(), all());
		expect(v.all('[data-testid="coin-debt"]')).toHaveLength(0);
	});
	it('no shop today says so and why', () => {
		const v = open(populated(), all());
		const t = v.one('[data-testid="coin-noshop"]').textContent ?? '';
		expect(t).toContain('No shop today');
		expect(t).toContain('No safety glasses at the drill press.');
	});
	it('a revoked pass says so', () => {
		const v = open(debt(), all());
		expect(v.one('[data-testid="coin-pass"]').textContent).toContain('revoked');
	});
});

describe('the history', () => {
	it('an undone pair is hidden, both halves, and the count is said', () => {
		const v = open(populated(), all());
		const rows = v.all('[data-testid="coin-row"]').map((r) => r.textContent ?? '');
		expect(rows.some((r) => r.includes('Eating Violation'))).toBe(false);
		expect(rows.some((r) => r.includes('Logged on the wrong student'))).toBe(false);
		expect(v.one('[data-testid="coin-undone-note"]').textContent).toContain('1 entry was undone');
		// 12 rows in the fixture, 2 hidden.
		expect(rows).toHaveLength(10);
	});
	it('every line has a reason, and automatic rows are marked', () => {
		const v = open(populated(), all());
		for (const r of v.all('[data-testid="coin-row"]')) {
			expect((r.querySelector('.cp-reason')?.textContent ?? '').trim().length).toBeGreaterThan(0);
		}
		expect(v.all('[data-testid="coin-auto"]')).toHaveLength(5);
	});
});

describe('the rules', () => {
	it('every rule is a closed button disclosure that opens on a press', () => {
		const v = open(populated(), all());
		const rules = v.all('[data-testid="rule"]');
		expect(rules).toHaveLength(12);
		const btn = rules[0].querySelector('button.disc-trigger') as HTMLButtonElement;
		expect(btn.getAttribute('aria-expanded')).toBe('false');
		btn.click();
		v.flush();
		expect(btn.getAttribute('aria-expanded')).toBe('true');
		expect(v.all('[data-testid="rule-group"]').map((g) => g.getAttribute('data-type'))).toEqual(['Award', 'Fine', 'Purchase']);
	});
});

describe('the other states', () => {
	it('signed out shows the sign-in panel and no balance', () => {
		const v = open(null, {}, 'signed_out');
		expect(v.all('[data-testid="coin-signin"] button')).toHaveLength(1);
		expect(v.all('[data-testid="coin-balance"]')).toHaveLength(0);
	});
	it('a database without 0241 says it is being updated', () => {
		const v = open(null, {}, 'updating');
		expect(v.one('[data-testid="coin-updating"]').textContent).toContain('being updated');
	});
});
