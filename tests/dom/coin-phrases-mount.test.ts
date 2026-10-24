// tests/dom/coin-phrases-mount.test.ts
//
// The coin settings list of phrases Claude learned (ledger 0432), mounted:
// learned phrases by default and the starter words only on asking, a set
// price shown as such with no default to edit, and Save sending exactly the
// number typed for exactly that phrase.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import CoinPhrasesPanel from '$lib/coin-desk/CoinPhrasesPanel.svelte';
import { mountInto, type Mounted } from './mount';

const LIST = [
	{ id: 'p1', phrase: 'hitting a sick trick shot', kind: 'award', category_id: 'custom_award', category: 'Custom Award', pricing_model: 'variable', category_amount: null, amount: 10, source: 'voice', uses: 2 },
	{ id: 'p2', phrase: 'phone', kind: 'fine', category_id: 'off_task_device_use', category: 'Off-Task Device Use', pricing_model: 'flat', category_amount: 2, amount: null, source: 'seed', uses: 5 }
];

const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});
const click = (el: Element) => el.dispatchEvent(new Event('click', { bubbles: true }));

function open() {
	const calls: [string, Record<string, unknown> | undefined][] = [];
	const supabase = {
		rpc: async (fn: string, args?: Record<string, unknown>) => {
			calls.push([fn, args]);
			if (fn === 'coin_alias_list') return { data: LIST, error: null };
			return { data: { ok: true }, error: null };
		}
	};
	const m = mountInto(CoinPhrasesPanel as unknown as Component<Record<string, unknown>>, { supabase });
	mounted.push(m);
	return { m, calls };
}

describe('the phrases Claude learned', () => {
	it('shows what it learned, and the starter words only when asked', async () => {
		const { m } = open();
		await m.settle();
		expect(m.all('[data-testid="cd-coin-phrase"]')).toHaveLength(1);
		expect(m.one('[data-testid="cd-coin-phrase"]').textContent).toContain('Default 10i¢');
		const all = m.all<HTMLButtonElement>('.ph-filter button')[1];
		click(all);
		m.flush();
		const items = m.all('[data-testid="cd-coin-phrase"]');
		expect(items).toHaveLength(2);
		const phone = items.find((x) => x.textContent?.includes('phone'))!;
		expect(phone.textContent).toContain('Set price 2i¢');
		expect(phone.querySelector('input[type="number"]')).toBeNull();
	});
	it('Save sends the number typed for that phrase', async () => {
		const { m, calls } = open();
		await m.settle();
		const input = m.one<HTMLInputElement>('[data-testid="cd-coin-phrase"] input[type="number"]');
		input.value = '6';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		const save = m.all<HTMLButtonElement>('[data-testid="cd-coin-phrase"] button').find((b) => b.textContent?.trim() === 'Save default')!;
		click(save);
		await m.settle();
		expect(calls.filter(([fn]) => fn === 'coin_alias_set_amount')).toEqual([['coin_alias_set_amount', { p_id: 'p1', p_amount: 6 }]]);
	});
});
