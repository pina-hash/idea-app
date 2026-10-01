// tests/dom/item-detail-edit-layer-stacking.test.ts
//
// THE ITEM PAGE ENDS ITS OWN STACKING CONTEXT WHILE THE EDIT LAYER IS OPEN,
// AND ONLY THEN (report R06, 9f94f730, ledger 0360).
//
// `src/app.css` makes every `main` a z-index 1 stacking context, and the full-
// viewport editor is rendered inside ItemDetail's `main`, so its own z-index 60
// was ranked at 1 inside the classroom room: ClassSplit's resize separator and
// the classroom masthead (both z-index 2) painted over the form, and the grip
// went on dragging the hidden list from under it. The fix is a class on the
// page's `main` that sets `z-index: auto` while `editing` is true.
//
// WHAT THIS FILE CAN SAY: that the class is on the real ItemDetail's `main`
// exactly while the real ContentComposer's `.composer-screen` is mounted
// inside it, counted in both directions across open and close. WHAT IT CANNOT
// SAY: paint order. happy-dom has no layout and no stacking, so the claim that
// the separator and the masthead are now UNDER the layer is the browser
// spec's hit test (`classroom-split-s-1-item-i-draft-manage-1-state-edit-layer`).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';

// ItemDetail mounts `guardSaveNavigation`, which calls `beforeNavigate` during
// init; the sibling item-detail files carry the same mock for the same reason.
vi.mock('$app/navigation', async () => {
	const actual = await vi.importActual<Record<string, unknown>>('$app/navigation');
	return { ...actual, beforeNavigate: () => {}, afterNavigate: () => {} };
});

import ItemDetail from '$lib/classroom/ItemDetail.svelte';
import type {
	ClassroomComposerTransports,
	ClassroomItem,
	ClassroomSection,
	TxResult
} from '$lib/classroom/classroom';
import { mountInto, type Mounted } from './mount';

const SECTION: ClassroomSection = {
	id: 'sec-1',
	course_id: 'course-1',
	label: 'Block 3',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	active: true,
	course: { id: 'course-1', code: 'IDEA100', title: 'Engineering I', active: true }
};

const ITEM: ClassroomItem = {
	id: 'item-1',
	kind: 'assignment',
	title: 'IDEA-BLADE external HTMLs',
	body: 'Read the rulebook first.',
	body_doc: null,
	points: 20,
	due_at: null,
	category: null,
	author_email: 'teacher@boscotech.edu',
	author_name: 'T. Vargas',
	published: true,
	pinned: false,
	is_public: false,
	publish_at: null,
	unit_id: null,
	sort_order: 1,
	first_published_at: '2026-08-10T16:00:00.000Z',
	edited_at: null,
	created_at: '2026-08-10T16:00:00.000Z',
	updated_at: '2026-08-10T16:00:00.000Z',
	links: [],
	attachments: [],
	postings: [{ section_id: 'sec-1' }]
};

const ok = <T,>(data: T): Promise<TxResult<T>> => Promise.resolve({ ok: true, data });

const transports = {
	updateItem: () => ok({ itemId: 'item-1', sectionIds: ['sec-1'], formattingDropped: false }),
	createItem: () => ok({ itemId: 'item-1', sectionIds: ['sec-1'], formattingDropped: false }),
	uploadAttachment: () => ok(undefined),
	uploadInstructorAttachment: () => ok(undefined),
	deleteAttachment: () => ok(undefined),
	deleteInstructorAttachment: () => ok(undefined),
	setInstructorResources: () => ok(undefined),
	addPostings: () => ok({ added: 0 }),
	removePosting: () => ok({ ok: true }),
	loadCategorySuggestions: () => ok([]),
	deleteItem: () => ok(undefined),
	duplicateItem: () => ok({ itemId: 'item-2' }),
	setPinned: () => ok(undefined),
	setPublished: () => ok(undefined),
	reorder: () => ok(undefined)
} as unknown as ClassroomComposerTransports;

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

/** The two counts this file is about, read off the mounted page. */
function state(m: Mounted) {
	const open = m.all('main.classroom-page.edit-layer-open');
	const layers = m.all('.composer-screen');
	return {
		pages: m.all('main.classroom-page').length,
		openClass: open.length,
		layers: layers.length,
		layerInsideOpenPage: layers.length === 1 && open.length === 1 && open[0].contains(layers[0])
	};
}

describe('the item page drops its stacking context exactly while the edit layer is open', () => {
	it('closed 0/0, open 1/1 with the layer inside that main, closed again 0/0', async () => {
		const m = (mounted = mountInto(ItemDetail as unknown as Component<Record<string, unknown>>, {
			section: SECTION,
			item: ITEM,
			sections: [SECTION],
			canManage: true,
			transports
		}));
		await m.settle();
		expect(state(m)).toEqual({ pages: 1, openClass: 0, layers: 0, layerInsideOpenPage: false });

		const strip = m
			.all<HTMLButtonElement>('button')
			.find((b) => (b.textContent ?? '').includes('Instructor tools'));
		if (!strip) throw new Error('no Instructor tools strip rendered');
		if (strip.getAttribute('aria-expanded') !== 'true') strip.click();
		m.flush();
		m.one<HTMLButtonElement>('[data-testid="item-edit-toggle"]').click();
		for (let i = 0; i < 3; i++) await m.settle();
		expect(state(m)).toEqual({ pages: 1, openClass: 1, layers: 1, layerInsideOpenPage: true });

		// Untouched, so Close needs no confirmation.
		m.one<HTMLButtonElement>('[data-testid="composer-screen-close"]').click();
		await m.settle();
		expect(state(m)).toEqual({ pages: 1, openClass: 0, layers: 0, layerInsideOpenPage: false });
	});

	it('a student page never carries the class (no editor to open)', async () => {
		const m = (mounted = mountInto(ItemDetail as unknown as Component<Record<string, unknown>>, {
			section: SECTION,
			item: ITEM,
			sections: [SECTION],
			canManage: false
		}));
		await m.settle();
		expect(m.all('[data-testid="item-edit-toggle"]')).toHaveLength(0);
		expect(state(m)).toEqual({ pages: 1, openClass: 0, layers: 0, layerInsideOpenPage: false });
	});
});
