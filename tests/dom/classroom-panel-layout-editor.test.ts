// tests/dom/classroom-panel-layout-editor.test.ts
//
// THE PAGE-LAYOUT EDITOR AND ITS PLACE IN THE SETTINGS PANEL, ON THE REAL
// COMPONENTS (ledger 0360, report R23, phase 1).
//
// Mounts the REAL `PanelLayoutEditor` with a reactive layout (so each change
// re-renders it the way the store would), and the REAL `ClassroomSettings`
// over a real preference store, opened the two ways a person reaches it.
//
// WHY A MOUNT. Four things regress silently: the anchor row quietly gaining a
// grip or a toggle (and so becoming movable or hideable from the UI even
// though the reader refuses it), a piece of the class header gaining a move
// (the reader drops a piece from every order, so the control would do
// nothing), a keyboard move landing on the wrong row (sortDrag's indices run
// over every row, the anchor's included), and the settings panel opened "for
// this page" from a page's Arrange arriving with the editor shut. Counts in both directions, positive controls beside every zero.
// No geometry: happy-dom lays nothing out; the 44px targets and the 375px fit
// are tools/browser-verify/routes/classroom-layout-page-item-settings-open.mjs and its Space White twin.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, type Component } from 'svelte';
import PanelLayoutEditor from '../../src/lib/classroom/PanelLayoutEditor.svelte';
import ClassroomSettings from '../../src/lib/classroom/ClassroomSettings.svelte';
import { CLASSROOM_PREFERENCE_SCHEMA } from '../../src/lib/preferences/classroom';
import { MemoryPreferenceStore } from '../../src/lib/preferences/store';
import { editorOrder, type PanelLayout } from '../../src/lib/classroom/panel-layout';
import { mountInto, type Mounted } from './mount';
import { reactiveProps } from './reactive-props.svelte';

let mounted: Mounted | null = null;
const opened: { stop: () => Promise<void> }[] = [];
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
	for (const o of opened.splice(0)) await o.stop();
});

/** The editor over a layout that follows its own onchange, as the store would make it. */
function editor(page: 'class' | 'item', role: 'student' | 'manager', layout: PanelLayout | null = null) {
	const changes: (PanelLayout | null)[] = [];
	const props = reactiveProps<Record<string, unknown>>({ page, role, layout, onchange: () => {} });
	props.onchange = (next: PanelLayout | null) => {
		changes.push(next);
		props.layout = next;
	};
	mounted = mountInto(PanelLayoutEditor as never, props);
	return { m: mounted, changes, props };
}
const rows = (m: Mounted) => m.all<HTMLElement>('[data-testid="panel-row"]').map((r) => r.dataset.panel);
const row = (m: Mounted, id: string) => m.one<HTMLElement>(`[data-testid="panel-row"][data-panel="${id}"]`);
const piece = (m: Mounted, id: string) => m.one<HTMLElement>(`[data-testid="panel-piece"][data-panel="${id}"]`);
const pieces = (m: Mounted) => m.all<HTMLElement>('[data-testid="panel-piece"]').map((r) => r.dataset.panel);
/** A row's OWN controls, not its pieces'. */
const own = (r: HTMLElement, testId: string) => r.querySelectorAll(`:scope > .pl-controls [data-testid="${testId}"], :scope > [data-testid="${testId}"]`);

describe('the editor', () => {
	it('lists the role\'s panels in the stored order; the anchor row has no grip, no toggle and no moves', () => {
		const { m } = editor('class', 'student');
		expect(rows(m)).toEqual(editorOrder('class', 'student', null));
		expect(rows(m)).not.toContain('actions');
		const anchor = row(m, 'stream');
		expect(anchor.querySelectorAll('[data-testid="panel-grip"]')).toHaveLength(0);
		expect(anchor.querySelectorAll('[data-testid="panel-toggle"]')).toHaveLength(0);
		expect(anchor.querySelectorAll('[data-testid="panel-move-up"]')).toHaveLength(0);
		expect(anchor.textContent).toContain('Always shown');
		// Positive control: the four other student rows all have a grip, and the
		// three hideable ones a toggle of their own (the header moves but never
		// hides); the header's two pieces a toggle each, and no grip.
		expect(m.all('[data-testid="panel-grip"]')).toHaveLength(4);
		expect(m.all('[data-testid="panel-toggle"]')).toHaveLength(5);
		expect(own(row(m, 'banner'), 'panel-toggle')).toHaveLength(0);
		expect(row(m, 'banner').querySelectorAll('[data-testid="panel-grip"]')).toHaveLength(1);
	});

	it("the header's pieces are listed inside its row: Show and Hide, no grip, no moves, and where they are in words", () => {
		const { m } = editor('class', 'student');
		expect(pieces(m)).toEqual(['tools', 'theme']);
		for (const id of ['tools', 'theme']) {
			const p = piece(m, id);
			expect(p.closest('[data-testid="panel-row"]')?.getAttribute('data-panel'), id).toBe('banner');
			expect(p.querySelectorAll('[data-testid="panel-grip"]'), id).toHaveLength(0);
			expect(p.querySelectorAll('[data-testid="panel-move-up"], [data-testid="panel-move-down"]'), id).toHaveLength(0);
			expect(p.querySelectorAll('[data-testid="panel-toggle"]'), id).toHaveLength(1);
			expect(p.textContent, id).toContain('In the class header');
		}
		// No other row carries pieces.
		expect(m.all('[data-testid="panel-pieces"]')).toHaveLength(1);
	});

	it('a manager also gets the posting keys, as a piece of the header', () => {
		const { m } = editor('class', 'manager');
		expect(rows(m)).not.toContain('actions');
		expect(pieces(m)).toEqual(['tools', 'theme', 'actions']);
		expect(piece(m, 'actions').textContent).toContain('Quick post, new post and units');
		expect(m.all('[data-testid="panel-grip"]')).toHaveLength(4);
	});

	it('hiding a piece stores it hidden and marks it in words; showing it again stores the default', () => {
		const { m, changes } = editor('class', 'manager');
		const toggle = () => piece(m, 'actions').querySelector<HTMLButtonElement>('[data-testid="panel-toggle"]')!;
		expect(toggle().getAttribute('aria-pressed')).toBe('true');
		toggle().click();
		m.flush();
		expect(changes.at(-1)).toEqual({ order: [], hidden: ['actions'] });
		expect(piece(m, 'actions').querySelectorAll('[data-testid="panel-hidden-chip"]')).toHaveLength(1);
		expect(piece(m, 'actions').textContent).not.toContain('In the class header');
		toggle().click();
		m.flush();
		expect(changes.at(-1)).toBeNull();
	});

	it('Move down moves one row, and the stored order is the moved one', () => {
		const { m, changes } = editor('class', 'student');
		own(row(m, 'banner'), 'panel-move-down')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		m.flush();
		expect(changes).toHaveLength(1);
		expect(changes[0]?.order.slice(0, 2)).toEqual(['teams', 'banner']);
		expect(rows(m).slice(0, 2)).toEqual(['teams', 'banner']);
		// The header's pieces went with it.
		expect(piece(m, 'tools').closest('[data-testid="panel-row"]')?.getAttribute('data-panel')).toBe('banner');
		// At an end the control is aria-disabled, never disabled, and does nothing.
		const top = row(m, 'teams').querySelector<HTMLButtonElement>('[data-testid="panel-move-up"]')!;
		expect(top.getAttribute('aria-disabled')).toBe('true');
		expect(top.disabled).toBe(false);
		top.click();
		m.flush();
		expect(changes).toHaveLength(1);
	});

	it('Show toggles a panel hidden and back, and Reset gives null', () => {
		const { m, changes } = editor('class', 'student');
		const toggle = () => row(m, 'videos').querySelector<HTMLButtonElement>('[data-testid="panel-toggle"]')!;
		expect(toggle().getAttribute('aria-pressed')).toBe('true');
		toggle().click();
		m.flush();
		expect(changes.at(-1)).toEqual({ order: [], hidden: ['videos'] });
		expect(toggle().getAttribute('aria-pressed')).toBe('false');
		expect(row(m, 'videos').querySelectorAll('[data-testid="panel-hidden-chip"]')).toHaveLength(1);
		const reset = m.one<HTMLButtonElement>('[data-testid="panel-reset"]');
		expect(reset.getAttribute('aria-disabled')).toBe('false');
		reset.click();
		m.flush();
		expect(changes.at(-1)).toBeNull();
		expect(reset.getAttribute('aria-disabled')).toBe('true');
		// Reset at the default writes nothing more.
		const before = changes.length;
		reset.click();
		m.flush();
		expect(changes).toHaveLength(before);
	});

	it('ArrowDown on a grip moves that row past the anchor and keeps the anchor row in place', async () => {
		const { m, changes } = editor('item', 'student');
		expect(rows(m)).toEqual(['deck', 'notebook', 'body', 'reference', 'links', 'files', 'work', 'rubric']);
		const anchorNode = row(m, 'work');
		const grip = row(m, 'files').querySelector<HTMLButtonElement>('[data-testid="panel-grip"]')!;
		grip.focus();
		grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		await m.settle();
		expect(changes).toHaveLength(1);
		expect(rows(m)).toEqual(['deck', 'notebook', 'body', 'reference', 'links', 'work', 'files', 'rubric']);
		// The same element, moved by the keyed list rather than rebuilt.
		expect(row(m, 'work')).toBe(anchorNode);
		expect(m.one('[data-testid="panel-layout-status"]').textContent).toBe('Files moved to 7 of 8.');
	});
});

describe('the settings panel', () => {
	async function openSettings(role: 'student' | 'manager', target?: string) {
		const target_ = document.createElement('div');
		document.body.appendChild(target_);
		const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA);
		const app = mount(ClassroomSettings as unknown as Component<Record<string, unknown>>, {
			target: target_,
			props: { preferences: store, role }
		}) as unknown as { open: (t?: string) => void };
		flushSync();
		app.open(target);
		flushSync();
		await new Promise((r) => setTimeout(r, 20));
		flushSync();
		opened.push({
			stop: async () => {
				await unmount(app as never);
				target_.remove();
			}
		});
		return { root: target_, store };
	}
	const expanded = (root: HTMLElement, page: string) =>
		root.querySelector(`[data-testid="settings-arrange-${page}"]`)?.getAttribute('aria-expanded');

	it('offers a Page layout group with both pages, closed when opened from the top', async () => {
		const { root } = await openSettings('student');
		expect(root.querySelectorAll('[data-group="panels"]')).toHaveLength(1);
		expect(expanded(root, 'class')).toBe('false');
		expect(expanded(root, 'item')).toBe('false');
		// The editors are in the DOM (a Disclosure hides, never removes).
		expect(root.querySelectorAll('[data-testid="panel-layout-editor-class"]')).toHaveLength(1);
		expect(root.querySelector('[data-testid="settings-summary-panels-class"]')?.textContent).toBe('Standard order, nothing hidden');
	});

	it('opened FOR a page, that page\'s editor arrives open and its group heading has focus', async () => {
		const { root } = await openSettings('student', 'panels:item');
		expect(expanded(root, 'item')).toBe('true');
		expect(expanded(root, 'class')).toBe('false');
		expect(document.activeElement?.id).toBe('cs-panels');
	});

	it('a change in the editor lands in the store, and the group then offers Reset', async () => {
		const { root, store } = await openSettings('manager', 'panels:class');
		expect(root.querySelector('[data-testid="settings-default-panels"]')).not.toBeNull();
		const toggle = root.querySelector<HTMLButtonElement>(
			'[data-testid="panel-layout-editor-class"] [data-panel="videos"] [data-testid="panel-toggle"]'
		)!;
		toggle.click();
		flushSync();
		expect(store.current.panels.classPage).toEqual({ order: [], hidden: ['videos'] });
		expect(root.querySelector('[data-testid="settings-reset-panels"]')).not.toBeNull();
		expect(root.querySelector('[data-testid="settings-summary-panels-class"]')?.textContent).toBe('Standard order, 1 hidden');
		root.querySelector<HTMLButtonElement>('[data-testid="settings-reset-panels"]')!.click();
		flushSync();
		expect(store.current.panels).toEqual({ classPage: null, itemPage: null });
	});
});

void vi;
