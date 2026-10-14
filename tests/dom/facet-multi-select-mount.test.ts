// tests/dom/facet-multi-select-mount.test.ts
//
// Ledger 0380, reports 15a6d687 and 45b78498: the incident console's filters
// take several values. On the REAL component: ticking more than one keeps the
// panel open, the key says what is ticked in words, nothing ticked is "any",
// and Escape or a press elsewhere closes it. Structure and events only; the
// 44px rows are the browser pass's.

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import FacetMultiSelect from '../../src/lib/feedback/FacetMultiSelect.svelte';
import { mountInto, type Mounted } from './mount';

let mounted: Mounted | null = null;
let last: string[] = [];

function start(selected: string[] = []) {
	last = selected;
	mounted = mountInto(FacetMultiSelect as never, {
		label: 'App version',
		anyLabel: 'Any version',
		testId: 'fms',
		options: [
			{ value: '0.3.1', label: '0.3.1' },
			{ value: '0.3.2', label: '0.3.2' },
			{ value: '0.3.3', label: '0.3.3' }
		],
		selected,
		onchange: (next: string[]) => {
			last = next;
		}
	});
	return mounted;
}

afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

const key = (m: Mounted) => m.one<HTMLButtonElement>('[data-testid="fms"]');
const boxes = (m: Mounted) => m.all<HTMLInputElement>('.fms-row input');

describe('FacetMultiSelect', () => {
	it('opens a panel of checkboxes, one per option, and says "any" while nothing is ticked', () => {
		const m = start();
		expect(m.all('.fms-panel').length).toBe(0);
		expect(key(m).textContent).toContain('Any version');
		key(m).click();
		flushSync();
		expect(key(m).getAttribute('aria-expanded')).toBe('true');
		expect(boxes(m).length).toBe(3);
		expect(boxes(m).every((b) => !b.checked)).toBe(true);
	});

	it('ticking two values reports both, and the panel stays open between ticks', () => {
		const m = start();
		key(m).click();
		flushSync();
		boxes(m)[0].click();
		flushSync();
		expect(last).toEqual(['0.3.1']);
		expect(m.all('.fms-panel').length).toBe(1);
		// The parent hands the new list back; the second tick builds on it.
		mounted && (mounted.stop(), (mounted = null));
		const m2 = start(['0.3.1']);
		key(m2).click();
		flushSync();
		expect(boxes(m2).map((b) => b.checked)).toEqual([true, false, false]);
		boxes(m2)[2].click();
		flushSync();
		expect(last).toEqual(['0.3.1', '0.3.3']);
	});

	it('the key names one value, or counts several, and never lies about nothing', () => {
		const one = start(['0.3.2']);
		expect(key(one).textContent).toContain('0.3.2');
		expect(key(one).getAttribute('aria-label')).toBe('App version: 0.3.2');
	});

	it('the last untick is "any" again, and the Any row clears the lot', async () => {
		const m = start(['0.3.1', '0.3.2']);
		expect(key(m).textContent).toContain('2 selected');
		key(m).click();
		flushSync();
		m.one<HTMLButtonElement>('.fms-clear').click();
		expect(last).toEqual([]);
		await m.stop();
		mounted = null;
		const m3 = start(['0.3.3']);
		key(m3).click();
		flushSync();
		boxes(m3)[2].click();
		expect(last).toEqual([]);
	});

	it('Escape closes it, and a press elsewhere closes it, but a press inside does not', () => {
		const m = start();
		key(m).click();
		flushSync();
		const panel = m.one<HTMLElement>('.fms-panel');
		panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		flushSync();
		expect(m.all('.fms-panel').length).toBe(1);
		m.one<HTMLElement>('.fms').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		flushSync();
		expect(m.all('.fms-panel').length).toBe(0);
		key(m).click();
		flushSync();
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		flushSync();
		expect(m.all('.fms-panel').length).toBe(0);
	});
});
