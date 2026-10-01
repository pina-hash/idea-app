// tests/dom/presentation-links-mount.test.ts
//
// LEDGER 0360: PRESENTATION MODE, MOUNTED THROUGH THE REAL GRADING CONSOLE.
//
// Five students, three of whom handed in a working link in the declared field,
// one who typed words there and one who left it empty. The silent failures are
// a student with nothing to open put up on the projector, and an address on a
// screen that faces the room; both are asserted, with the counts. The keys and
// the ends of the list are asserted as events, never as geometry.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import GradingConsole from '$lib/classroom/GradingConsole.svelte';
import { mountInto, type Mounted } from './mount';

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

const SECTION = { id: 's1', label: 'Period 1', course: { code: 'IDEA100', title: 'Design' } };
const ITEM = { id: 'i1', kind: 'assignment' as const, title: 'Pitch', body: '', points: 0, published: true };
const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Pitch',
	course: 'IDEA100',
	points: 0,
	modules: [
		{
			id: 'm1',
			title: 'Deck',
			points: 0,
			blocks: [{ id: 'm1-link', field: 'deck', type: 'text', link: 'presentation', prompt: 'Link to your deck' }],
			criteria: []
		}
	]
};
const NAMES = ['Ana Reyes', 'Ben Okafor', 'Cruz Delgado', 'Dee Marsh', 'Eli Nakamura'];
const EMAILS = NAMES.map((n) => `${n.split(' ')[0].toLowerCase()}@boscotech.net`);
const DECKS: (string | null)[] = [
	'https://docs.google.com/presentation/d/ana/edit',
	'my deck is not done',
	'canva.com/design/cruz',
	null,
	'https://www.canva.com/design/eli/view'
];
const GRADING = {
	roster: NAMES.map((n, i) => ({ student_email: EMAILS[i], display_name: n, active: true })),
	submissions: [],
	responses: DECKS.flatMap((d, i) =>
		d === null ? [] : [{ student_email: EMAILS[i], item_id: 'i1', block_id: 'm1-link', value: { text: d } }]
	),
	files: [],
	approvals: []
};

function mountConsole(): Mounted {
	return mountInto(GradingConsole as unknown as Component<Record<string, unknown>>, {
		section: SECTION,
		item: ITEM,
		spec: null,
		rubric: null,
		manifest: MANIFEST,
		transports: { loadGrading: async () => ({ ok: true, data: GRADING }) },
		presence: null
	});
}

async function openPresenting(m: Mounted) {
	const key = m.one<HTMLButtonElement>('[data-testid="present-open-key"]');
	key.click();
	await m.settle();
	return m.one<HTMLDialogElement>('[data-testid="present-dialog"]');
}

describe('presentation mode', () => {
	it('the header key counts the presenters and says how many have no link', async () => {
		mounted = mountConsole();
		await mounted.settle();
		expect(mounted.one('[data-testid="present-open-key"]').textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Present links · 3'
		);
		expect(mounted.one('[data-testid="present-missing-count"]').textContent?.trim()).toBe('2 without a link');
	});

	it('the queue holds only the three with a link that opens, in roster order', async () => {
		mounted = mountConsole();
		await mounted.settle();
		const dialog = await openPresenting(mounted);
		expect(dialog.open).toBe(true);
		const queue = [...dialog.querySelectorAll('.pl-list li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
		expect(queue).toEqual(['1. Ana Reyes', '2. Cruz Delgado', '3. Eli Nakamura']);
		expect(dialog.querySelector('[data-testid="present-missing"]')?.textContent?.replace(/\s+/g, ' ')).toMatch(
			/2 students have no link that opens, and 1 of them typed something that is not a link/
		);
		// THE ROOM SEES NO ADDRESS: no "@" anywhere in what the dialog prints.
		expect(dialog.textContent ?? '').not.toContain('@');
	});

	it('Next, Previous and the arrow keys walk it; the ends are aria-disabled and say so', async () => {
		mounted = mountConsole();
		await mounted.settle();
		const dialog = await openPresenting(mounted);
		const name = () => dialog.querySelector('[data-testid="present-name"]')?.textContent?.trim();
		const prev = () => dialog.querySelector('[data-testid="present-prev"]')!;
		const next = () => dialog.querySelector('[data-testid="present-next"]')!;
		expect(name()).toBe('Ana Reyes');
		expect(prev().getAttribute('aria-disabled')).toBe('true');
		expect(prev().hasAttribute('disabled')).toBe(false);
		(next() as HTMLElement).click();
		await mounted.settle();
		expect(name()).toBe('Cruz Delgado');
		// The open key goes to Cruz's link, completed to https.
		const open = dialog.querySelector<HTMLAnchorElement>('[data-testid="present-open"]')!;
		expect(open.getAttribute('href')).toBe('https://canva.com/design/cruz');
		expect(open.getAttribute('target')).toBe('_blank');
		expect(open.getAttribute('rel')).toContain('noopener');
		dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		await mounted.settle();
		expect(name()).toBe('Eli Nakamura');
		expect(next().getAttribute('aria-disabled')).toBe('true');
		(next() as HTMLElement).click();
		await mounted.settle();
		expect(name()).toBe('Eli Nakamura');
		expect(dialog.querySelector('[data-testid="present-note"]')?.textContent).toContain('last presenter');
		dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		await mounted.settle();
		expect(name()).toBe('Cruz Delgado');
	});

	it('the queue is behind a closed Disclosure, and Escape closes the dialog and tells the console', async () => {
		mounted = mountConsole();
		await mounted.settle();
		const dialog = await openPresenting(mounted);
		const trigger = dialog.querySelector('[data-testid="present-queue"]');
		expect(trigger?.getAttribute('aria-expanded')).toBe('false');
		dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		await mounted.settle();
		expect(dialog.open).toBe(false);
		// The console knows: pressing the key again opens it again, on the first presenter.
		await openPresenting(mounted);
		expect(dialog.open).toBe(true);
		expect(dialog.querySelector('[data-testid="present-name"]')?.textContent?.trim()).toBe('Ana Reyes');
	});

	it('an assignment with no link field and no links offers no key at all', async () => {
		mounted = mountInto(GradingConsole as unknown as Component<Record<string, unknown>>, {
			section: SECTION,
			item: ITEM,
			spec: null,
			rubric: null,
			manifest: { ...MANIFEST, modules: [{ ...MANIFEST.modules[0], blocks: [{ id: 'm1-x', field: 'x', type: 'text' }] }] },
			transports: {
				loadGrading: async () => ({ ok: true, data: { ...GRADING, responses: [] } })
			},
			presence: null
		});
		await mounted.settle();
		expect(mounted.all('[data-testid="present-open-key"]')).toHaveLength(0);
		expect(mounted.all('[data-testid="present-dialog"]')).toHaveLength(0);
		// The positive control is every other case in this file: the key exists there.
	});
});
