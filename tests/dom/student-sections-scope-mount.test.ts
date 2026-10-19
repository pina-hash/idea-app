// tests/dom/student-sections-scope-mount.test.ts
//
// THE SECTIONS MENU'S SWITCH: these choices for this class, or for every class
// (report bd38fa25, Mr. Pina 2026-10-19, ledger 0416). The real component;
// both directions asserted. No geometry here.

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, type Component } from 'svelte';
import StudentSectionsMenu from '$lib/classroom/StudentSectionsMenu.svelte';
import { mountInto, type Mounted } from './mount';

const Menu = StudentSectionsMenu as unknown as Component<Record<string, unknown>>;
let mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted) await m.stop();
	mounted = [];
});

describe('the scope switch', () => {
	it('names where the choice applies, and hands the other scope back when pressed', async () => {
		const picked: string[] = [];
		const m = await mountInto(Menu, { hidden: ['notebook'], onchange: () => {}, scope: 'class', onscope: (s: string) => picked.push(s), className: 'IDEA209H · Block 2' });
		mounted.push(m);
		const root = m.target;
		root.querySelector<HTMLButtonElement>('[data-testid="so-sections"]')!.click();
		flushSync();
		expect(root.querySelector('.ssm-head')?.textContent).toBe("Show on IDEA209H · Block 2's student pages");
		const keys = [...root.querySelectorAll<HTMLButtonElement>('[data-testid="so-sections-scope"] button')];
		expect(keys.map((k) => [k.textContent?.trim(), k.getAttribute('aria-checked')])).toEqual([
			['This class', 'true'],
			['Every class', 'false']
		]);
		keys[1].click();
		expect(picked).toEqual(['everywhere']);
	});

	it('every class: the heading says so; with no switch handler there is no switch', async () => {
		const m = await mountInto(Menu, { hidden: [], onchange: () => {}, scope: 'everywhere', onscope: () => {} });
		mounted.push(m);
		m.target.querySelector<HTMLButtonElement>('[data-testid="so-sections"]')!.click();
		flushSync();
		expect(m.target.querySelector('.ssm-head')?.textContent).toBe('Show on every student page');
		expect(m.target.querySelectorAll('[data-testid="so-sections-scope"] button')).toHaveLength(2);
		const bare = await mountInto(Menu, { hidden: [], onchange: () => {} });
		mounted.push(bare);
		bare.target.querySelector<HTMLButtonElement>('[data-testid="so-sections"]')!.click();
		flushSync();
		expect(bare.target.querySelectorAll('[data-testid="so-sections-scope"]')).toHaveLength(0);
	});
});
