// tests/dom/class-view-edit-layer-stacking.test.ts
//
// THE CLASS PAGE ENDS ITS OWN STACKING CONTEXT WHILE A ROW'S EDIT LAYER IS
// OPEN, AND ONLY THEN (report R06 on the class list, ledger 0360; the item
// page's fix is ItemDetail's own, tests/dom/item-detail-edit-layer-stacking).
//
// `src/app.css` makes every `main` a z-index 1 stacking context, and a row's
// full-viewport editor (`ContentComposer screen`, z-index 60) is rendered
// inside ClassView's `main`, so it was ranked at 1: the classroom masthead
// painted over its title and its Close (hit-tested at 375 and 1440). The fix
// is a class on the page's root while `editing` is set.
//
// WHAT THIS FILE CAN SAY: that the class is on the real ClassView's root
// exactly while the real ContentComposer's `.composer-screen` is mounted inside
// it, counted in both directions across open and close, and never for a
// student. WHAT IT CANNOT SAY: paint order. happy-dom has no layout and no
// stacking; that claim is the browser spec's hit test
// (`classroom-split-s-1-manage-1-state-edit-layer`).

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import ClassView from '$lib/classroom/ClassView.svelte';
import type { ClassroomComposerTransports, TxResult } from '$lib/classroom/classroom';
import { CLOCK, ITEMS, SECTION } from '../classroom-panel-layout-render-cases';
import { mountInto, type Mounted } from './mount';

const View = ClassView as unknown as Component<Record<string, unknown>>;
const ok = <T,>(data: T): Promise<TxResult<T>> => Promise.resolve({ ok: true, data });

const transports = {
	updateItem: () => ok({ itemId: 'day-24', sectionIds: ['s-1'], formattingDropped: false }),
	createItem: () => ok({ itemId: 'day-24', sectionIds: ['s-1'], formattingDropped: false }),
	uploadAttachment: () => ok(undefined),
	uploadInstructorAttachment: () => ok(undefined),
	deleteAttachment: () => ok(undefined),
	deleteInstructorAttachment: () => ok(undefined),
	setInstructorResources: () => ok(undefined),
	addPostings: () => ok({ added: 0 }),
	removePosting: () => ok({ ok: true }),
	loadCategorySuggestions: () => ok([]),
	deleteItem: () => ok(undefined),
	duplicateItem: () => ok({ itemId: 'day-24-copy' }),
	setPinned: () => ok(undefined),
	setPublished: () => ok(undefined),
	reorder: () => ok(undefined)
} as unknown as ClassroomComposerTransports;

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

function state(m: Mounted) {
	const open = m.all('.classroom-page.edit-layer-open');
	const layers = m.all('.composer-screen');
	return {
		pages: m.all('.classroom-page[role="main"]').length,
		openClass: open.length,
		layers: layers.length,
		layerInsideOpenPage: layers.length === 1 && open.length === 1 && open[0].contains(layers[0])
	};
}

describe('the class page drops its stacking context exactly while a row is being edited', () => {
	it('closed 0/0, open 1/1 with the layer inside that main, closed again 0/0', async () => {
		const m = (mounted = mountInto(View, {
			section: SECTION,
			items: ITEMS,
			sections: [SECTION],
			canManage: true,
			transports,
			clock: CLOCK,
			basePath: '/classroom'
		}));
		await m.settle();
		expect(state(m)).toEqual({ pages: 1, openClass: 0, layers: 0, layerInsideOpenPage: false });

		m.one<HTMLButtonElement>('[data-testid="item-row"] [data-testid="row-menu"]').click();
		m.flush();
		const edit = m.all<HTMLButtonElement>('[data-testid="row-menu-open"] button[role="menuitem"]').find((b) => b.textContent?.trim() === 'Edit');
		if (!edit) throw new Error('no Edit in the row menu');
		edit.click();
		for (let i = 0; i < 3; i++) await m.settle();
		expect(state(m)).toEqual({ pages: 1, openClass: 1, layers: 1, layerInsideOpenPage: true });

		// Untouched, so Close needs no confirmation.
		m.one<HTMLButtonElement>('[data-testid="composer-screen-close"]').click();
		for (let i = 0; i < 2; i++) await m.settle();
		expect(state(m)).toEqual({ pages: 1, openClass: 0, layers: 0, layerInsideOpenPage: false });
	});

	it('a student page never carries the class (no row menu, no editor)', async () => {
		const m = (mounted = mountInto(View, { section: SECTION, items: ITEMS, canManage: false, clock: CLOCK, basePath: '/classroom' }));
		await m.settle();
		expect(m.all('[data-testid="row-menu"]')).toHaveLength(0);
		// POSITIVE CONTROL: the rows are there.
		expect(m.all('[data-testid="item-row"]').length).toBeGreaterThan(0);
		expect(state(m)).toEqual({ pages: 1, openClass: 0, layers: 0, layerInsideOpenPage: false });
	});
});
