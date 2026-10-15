// tests/dom/coin-balance-session-two-mount.test.ts
//
// The session-two sections of the student coin page, mounted for real.
// Structure and events only (see ./mount.ts for why no geometry is asserted):
//   * every new action's control is there with its transport and gone without
//     it, counted in both directions on the same fixture;
//   * a read that is missing (null extras) draws no section, and the page
//     still renders;
//   * a split payment calls the split transport with the item and the
//     physical part, and only on the second press;
//   * in debt, no split is offered and the reason is said.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';
import CoinPageBody from '$lib/coin-balance/CoinPageBody.svelte';
import { parseCoinMyPage } from '$lib/coin-balance';
import { mountInto, type Mounted } from './mount';
import { fixtureExtras, fixturePage } from '../../src/routes/dev/coin-balance/fixture';

let m: Mounted | null = null;
afterEach(async () => {
	await m?.stop();
	m = null;
});

const NOW = Date.parse('2026-10-15T19:00:00Z');
const okAct = () => Promise.resolve({ ok: true as const, data: { ok: true } });
const okBuy = () => Promise.resolve({ ok: true as const, digital: 10, physical: 5, price: 15, balance: 100 });

function every() {
	return {
		buyEatingPass: vi.fn(okBuy),
		buyPayRaise: vi.fn(okBuy),
		buyPrint: vi.fn(okBuy),
		buyExtraCredit: vi.fn(okBuy),
		buySplit: vi.fn(okBuy),
		requestPayout: vi.fn(okAct),
		cancelPayout: vi.fn(okAct),
		uploadPhoto: vi.fn(() => Promise.resolve({ ok: true as const, path: 'u/x.png' })),
		submitBackground: vi.fn(okAct),
		submitDonation: vi.fn(okAct),
		reportOnHand: vi.fn(okAct),
		disputeFine: vi.fn(okAct),
		cancelRequest: vi.fn(okAct),
		claimContract: vi.fn(okAct),
		markContractDone: vi.fn(okAct),
		auditorValidate: vi.fn(okAct),
		exportRows: vi.fn(() => Promise.resolve({ ok: true as const, data: { rows: [] } }))
	};
}

function open(scenario: 'populated' | 'auditor' | 'debt', transports: Record<string, unknown>, extras: Record<string, unknown> | null = null) {
	m = mountInto(CoinPageBody as unknown as Component<Record<string, unknown>>, {
		state: 'ready',
		page: parseCoinMyPage(fixturePage(scenario)),
		transports,
		extras: extras ?? fixtureExtras(scenario),
		now: NOW,
		onsignin: () => {},
		onchanged: vi.fn()
	});
	return m;
}

const CONTROLS = [
	'[data-testid="payout-cancel"]',
	'[data-testid="bg-send"]',
	'[data-testid="donation-send"]',
	'[data-testid="onhand-send"]',
	'[data-testid="coin-dispute"]',
	'[data-testid="request-cancel"]',
	'[data-testid="contract-claim"]',
	'[data-testid="contract-done"]',
	'[data-testid="stats-export-csv"]',
	'[data-testid="split-toggle"]'
];

describe('every session-two control is structural', () => {
	it('with every transport, each control is there; with none, none is', () => {
		const v = open('populated', every());
		const present = CONTROLS.map((sel) => v.all(sel).length);
		expect(present.every((n) => n > 0), JSON.stringify(present)).toBe(true);
		void v.stop();
		const w = open('populated', {});
		const absent = CONTROLS.map((sel) => w.all(sel).length);
		expect(absent).toEqual(CONTROLS.map(() => 0));
		// The positive control: the read half of every section is still drawn.
		for (const id of ['coin-payout', 'coin-background', 'coin-donations', 'coin-contracts', 'coin-requests', 'coin-stats']) {
			expect(w.all(`[data-testid="${id}"]`), id).toHaveLength(1);
		}
		expect(w.all('[data-testid="coin-edited"]')).toHaveLength(1);
	});

	it('the auditor block is there only with the auditor read, and Approve only with its transport', () => {
		const v = open('auditor', every());
		expect(v.all('[data-testid="audit-row"]')).toHaveLength(2);
		expect(v.all('[data-testid="audit-approve"]')).toHaveLength(2);
		void v.stop();
		const w = open('auditor', {});
		expect(w.all('[data-testid="audit-row"]')).toHaveLength(2);
		expect(w.all('[data-testid="audit-approve"]')).toHaveLength(0);
		void w.stop();
		const x = open('populated', every());
		expect(x.all('[data-testid="coin-auditor"]')).toHaveLength(0);
	});

	it('missing reads draw no section and the page still renders', () => {
		const v = open('populated', every(), {});
		for (const id of ['coin-contracts', 'coin-stats', 'coin-donations', 'coin-auditor', 'coin-role-link']) {
			expect(v.all(`[data-testid="${id}"]`), id).toHaveLength(0);
		}
		expect(v.all('[data-testid="coin-balance"]')).toHaveLength(1);
		expect(v.all('[data-testid="coin-background"]')).toHaveLength(1);
	});
});

describe('a split payment', () => {
	it('sends the item and the physical part, only on the confirm', async () => {
		const t = every();
		const p = parseCoinMyPage(fixturePage('populated'))!;
		p.eating_pass.active = false;
		m = mountInto(CoinPageBody as unknown as Component<Record<string, unknown>>, {
			state: 'ready',
			page: p,
			transports: t,
			extras: {},
			now: NOW,
			onsignin: () => {},
			onchanged: vi.fn()
		});
		const card = m.one('[data-testid="buy-eating-pass"]');
		const toggle = card.querySelector('[data-testid="split-toggle"]') as HTMLInputElement;
		toggle.click();
		m.flush();
		const field = card.querySelector('[data-testid="split-physical"]') as HTMLInputElement;
		field.value = '5';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		expect(card.querySelector('[data-testid="buy-cost"]')!.textContent).toContain('10');
		(card.querySelector('[data-testid="buy-arm"]') as HTMLButtonElement).click();
		m.flush();
		expect(t.buySplit).not.toHaveBeenCalled();
		(card.querySelector('[data-testid="buy-confirm"]') as HTMLButtonElement).click();
		await m.settle();
		expect(t.buySplit).toHaveBeenCalledWith('eating_pass', 5, {});
		expect(t.buyEatingPass).not.toHaveBeenCalled();
		expect(card.querySelector('[data-testid="buy-outcome"]')!.textContent).toContain('Hand 5');
	});

	it('a physical part above the price is refused before the press', () => {
		const p = parseCoinMyPage(fixturePage('populated'))!;
		p.eating_pass.active = false;
		m = mountInto(CoinPageBody as unknown as Component<Record<string, unknown>>, {
			state: 'ready', page: p, transports: every(), extras: {}, now: NOW, onsignin: () => {}, onchanged: vi.fn()
		});
		const card = m.one('[data-testid="buy-eating-pass"]');
		(card.querySelector('[data-testid="split-toggle"]') as HTMLInputElement).click();
		m.flush();
		const field = card.querySelector('[data-testid="split-physical"]') as HTMLInputElement;
		field.value = '99';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		expect(card.querySelector('[data-testid="buy-arm"]')!.getAttribute('aria-disabled')).toBe('true');
		expect(card.querySelector('[data-testid="buy-blocked"]')!.textContent).toContain('no more than the price');
	});

	it('in debt there is no split, and the reason is said', () => {
		const v = open('debt', every());
		expect(v.all('[data-testid="split-toggle"]')).toHaveLength(0);
		expect(v.all('[data-testid="split-in-debt"]').length).toBeGreaterThan(0);
	});
});
