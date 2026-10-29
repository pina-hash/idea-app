// tests/dom/coin-custom-labels-mount.test.ts
//
// Ledger 0455 (report 65c46fcf): a Custom record is called by what it was for
// wherever a history is listed, and a Deposit reads as a Deposit. The real
// components, mounted. Both directions on one fixture: the Custom row's name
// IS its note and the note is not drawn a second time; the listed row keeps
// its category name and its note line.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';
import CoinTransactionRows from '$lib/coin-balance/CoinTransactionRows.svelte';
import CoinPageBody from '$lib/coin-balance/CoinPageBody.svelte';
import { parseCoinMyPage } from '$lib/coin-balance';
import { mountInto, type Mounted } from './mount';
import { fixtureExtras, fixturePage } from '../../src/routes/dev/coin-balance/fixture';

let m: Mounted | null = null;
afterEach(async () => {
	await m?.stop();
	m = null;
});

const REASON = 'IDEA-Blade Rotation 2 tournament: 1st place, 12 wins';
const at = '2026-10-28T16:26:23Z';
const ROWS = [
	{ id: 'a', category_id: 'custom_award', category_name: 'Custom Award', amount: 22, medium: 'digital', note: REASON, created_at: at },
	{ id: 'b', category_id: 'coin_deposit', category_name: 'Deposit', amount: 5, medium: 'digital', note: 'Physical to digital', created_at: at },
	{ id: 'c', category_id: 'off_task_device_use', category_name: 'Off-Task', amount: -2, medium: 'digital', note: 'phone out', created_at: at },
	{ id: 'd', category_id: 'custom_fine', category_name: 'Custom Fine', amount: -3, medium: 'digital', note: '', created_at: at }
];
const KINDS = { custom_award: 'award', coin_deposit: 'award', off_task_device_use: 'fine', custom_fine: 'fine' };

describe('the shared history rows', () => {
	it('names a Custom record by its note, a listed one by its category, and a deposit as a Deposit', () => {
		m = mountInto(CoinTransactionRows as unknown as Component<Record<string, unknown>>, { transactions: ROWS, kinds: KINDS });
		const rows = m.all('[data-testid="coin-row"]');
		expect(rows).toHaveLength(4);
		const reasons = rows.map((r) => r.querySelector('.reason')?.textContent?.trim());
		expect(reasons).toEqual([REASON, 'Deposit', 'Off-Task', 'Custom Fine']);
		// The custom row's note is its name, so it is drawn once; the listed row keeps its note line.
		const notes = rows.map((r) => r.querySelectorAll('.note-text').length);
		expect(notes).toEqual([0, 1, 1, 0]);
		expect(rows[2].querySelector('.note-text')?.textContent).toBe('phone out');
		expect(rows.filter((r) => (r.textContent ?? '').includes('Custom Award'))).toHaveLength(0);
		const chips = m.all('[data-testid="type-chip"]').map((c) => c.textContent?.trim());
		expect(chips).toEqual(['Award', 'Deposit', 'Fine', 'Fine']);
		expect(m.all('[data-testid="type-chip"][data-type="deposit"]')).toHaveLength(1);
	});
});

describe("the student's own coin page", () => {
	it('says what a Custom award was for, and calls a deposit a Deposit', () => {
		const raw = fixturePage('populated') as Record<string, unknown>;
		const history = raw.history as Array<Record<string, unknown>>;
		const base = { reverses: null, reversed: false, automatic: false };
		raw.history = [
			{ ...base, id: 'x1', at, amount: '22', category_id: 'custom_award', name: 'Custom Award', kind: 'award', note: REASON },
			{ ...base, id: 'x2', at, amount: '5', category_id: 'coin_deposit', name: 'Deposit', kind: 'award', note: 'Physical to digital' },
			...history
		];
		m = mountInto(CoinPageBody as unknown as Component<Record<string, unknown>>, {
			state: 'ready',
			page: parseCoinMyPage(raw),
			transports: {},
			extras: fixtureExtras('populated'),
			now: Date.parse('2026-10-29T19:00:00Z'),
			onsignin: () => {},
			onchanged: vi.fn()
		});
		const rows = m.all('[data-testid="coin-row"]');
		expect(rows[0].querySelector('.cp-reason')?.textContent).toBe(REASON);
		expect(rows[0].querySelectorAll('.cp-row-note')).toHaveLength(0);
		expect(rows[1].querySelector('[data-testid="coin-type"]')?.textContent?.trim()).toBe('Deposit');
		// Control: a listed row on the same page keeps its category name and its note.
		const listed = rows.find((r) => r.querySelector('.cp-reason')?.textContent === 'Shop Safety Violation');
		expect(listed?.querySelector('.cp-row-note')?.textContent).toBe('No safety glasses at the drill press.');
		expect(rows.some((r) => r.querySelector('.cp-reason')?.textContent === 'Custom Award')).toBe(false);
	});
});
