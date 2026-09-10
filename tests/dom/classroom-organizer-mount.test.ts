// tests/dom/classroom-organizer-mount.test.ts
//
// THE ORGANIZER'S CONTROLS, DRIVEN BY REAL EVENTS (prompt 0118, items SEVEN,
// ELEVEN and TWELVE): the class list's pointer-drag reorder, filing by drag and
// by "File here", the redrawn form controls, and the unit manager's worded grip
// and inline rename.
//
// WHY A MOUNT AND NOT AN SSR RENDER. Every one of these is a claim about what
// happens AFTER an event reaches a handler -- an arrow key on a grip, a
// pointer released over another card, a tick that grows a button on three
// headers -- and `svelte/server`'s `render()` produces one string and runs no
// handler. `tests/classroom-item-order.test.ts` keeps the pure arithmetic
// (`dragReorder`, `renumberedForFiling`); `tests/classroom-sort-drag.test.ts`
// keeps the drop index, the shifts and `foreignZone`. What is pinned HERE is
// the wiring between them: that an index the action hands back reaches
// `setOrder` as the right id array, and that a release over a zone reaches
// `setItemUnit` and NOT `setOrder` on the source.
//
// NO GEOMETRY IS ASSERTED HERE (see `tests/dom/mount.ts`): happy-dom lays
// nothing out, so `getBoundingClientRect()` is all zeros. That is also why the
// drop zone is reached by stubbing `document.elementFromPoint` -- there is no
// point to hit-test -- and the browser spec
// (`tools/browser-verify/routes/classroom-split-s-1-manage-1-state-selected.mjs`)
// is what proves the real hit test lands on the real card.
//
// BOTH DIRECTIONS, COUNTED: every "the manager has N grips" row is paired with
// the student mount of the same fixture reading zero AND reading its rows, so
// an absence can never be a page that failed to render.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';
import ClassView from '$lib/classroom/ClassView.svelte';
import UnitManager from '$lib/classroom/UnitManager.svelte';
import type {
	ClassroomComposerTransports,
	ClassroomItem,
	ClassroomSection,
	ClassroomUnit,
	ClassroomUnitTransports,
	TxResult
} from '$lib/classroom/classroom';
import { mountInto, type Mounted } from './mount';

const View = ClassView as unknown as Component<Record<string, unknown>>;
const Units = UnitManager as unknown as Component<Record<string, unknown>>;

const SECTION: ClassroomSection = {
	id: 's-1',
	course_id: 'c-1',
	label: 'Period 2',
	block: 'B',
	teacher_email: 'vargas@boscotech.edu',
	active: true,
	course: { id: 'c-1', code: 'ENG1H', title: 'Engineering 1 Honors', active: true }
};

const UNITS: ClassroomUnit[] = [
	{ id: 'u-1', course_id: 'c-1', name: 'Unit 1', sort_order: 1 },
	{ id: 'u-2', course_id: 'c-1', name: 'Unit 2', sort_order: 2 },
	{ id: 'u-3', course_id: 'c-1', name: 'Unit 3', sort_order: 3 }
];

function item(
	over: Partial<ClassroomItem> & { id: string; sort_order: number; unit_id: string | null }
): ClassroomItem {
	return {
		kind: 'post',
		title: over.id,
		body: '',
		body_doc: null,
		points: null,
		due_at: null,
		category: null,
		author_email: 'vargas@boscotech.edu',
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		first_published_at: '2026-08-10T00:00:00Z',
		edited_at: null,
		created_at: '2026-08-10T00:00:00Z',
		updated_at: '2026-08-10T00:00:00Z',
		links: [],
		attachments: [],
		postings: [{ section_id: 's-1' }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: [],
		...over
	};
}

/** Unit 1 holds a, b (in that manual order); Unit 2 holds c; Unit 3 is empty.
 *  `c` carries one link AND one attachment so both resource blocks render in
 *  its detail and the 0193 placement can be read for each. */
const ITEMS: ClassroomItem[] = [
	item({ id: 'a', sort_order: 1, unit_id: 'u-1' }),
	item({ id: 'b', sort_order: 2, unit_id: 'u-1' }),
	item({
		id: 'c',
		sort_order: 1,
		unit_id: 'u-2',
		links: [{ id: 'l-1', label: 'Ref', url: 'https://example.com/ref' }],
		attachments: [{ id: 'f-1', filename: 'bridge-plan.pdf', mime_type: 'application/pdf', size_bytes: 2048, sort_order: 1 }],
		body: 'Some body text.'
	})
];

interface Log {
	orders: string[][];
	filed: { itemId: string; unitId: string | null }[];
	pins: { itemId: string; pinned: boolean }[];
}

const ok = <T,>(value: T): Promise<TxResult<T>> => Promise.resolve({ ok: true, data: value });

function composerTransports(log: Log): ClassroomComposerTransports {
	return {
		createItem: () => ok({ itemId: 'new', sectionIds: [], formattingDropped: false }),
		updateItem: (id) => ok({ itemId: id, sectionIds: [], formattingDropped: false }),
		deleteItem: () => ok(undefined),
		duplicateItem: () => ok({ itemId: 'copy' }),
		addPostings: () => ok({ added: 0 }),
		removePosting: () => ok({ ok: true }),
		setPublished: () => ok(undefined),
		setPinned: (itemId, pinned) => {
			log.pins.push({ itemId, pinned });
			return ok(undefined);
		},
		setOrder: (ids) => {
			log.orders.push([...ids]);
			return ok(undefined);
		},
		uploadAttachment: () => ok(undefined),
		deleteAttachment: () => ok(undefined),
		uploadInstructorAttachment: () => ok(undefined),
		deleteInstructorAttachment: () => ok(undefined),
		setInstructorResources: () => ok(undefined),
		markViewed: () => ok(undefined)
	};
}

function unitTransports(log: Log, unitOrders: string[][] = [], renames: string[] = []): ClassroomUnitTransports {
	return {
		upsertUnit: (_courseId, name, unitId) => {
			renames.push(`${unitId ?? 'new'}=${name}`);
			return ok({ unitId: unitId ?? 'u-new', created: !unitId, duplicate: false });
		},
		deleteUnit: () => ok({ unfiled: 0 }),
		setUnitOrder: (_courseId, ids) => {
			unitOrders.push([...ids]);
			return ok(undefined);
		},
		reloadUnits: () => ok(UNITS),
		setItemUnit: (itemId, unitId) => {
			log.filed.push({ itemId, unitId });
			return ok({ ok: true });
		}
	};
}

function freshLog(): Log {
	return { orders: [], filed: [], pins: [] };
}

function mountView(manage: boolean, log = freshLog()) {
	const m = mountInto(View, {
		section: SECTION,
		items: ITEMS,
		units: UNITS,
		canManage: manage,
		transports: manage ? composerTransports(log) : null,
		unitTransports: manage ? unitTransports(log) : null,
		basePath: '/classroom'
	});
	return { m, log };
}

/** A pointer event happy-dom will construct and the action will read. */
function pointer(type: string, x: number, y: number, extra: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		composed: true,
		pointerId: 3,
		pointerType: 'touch',
		isPrimary: true,
		button: 0,
		buttons: type === 'pointerup' ? 0 : 1,
		clientX: x,
		clientY: y,
		...extra
	});
}

function key(el: Element, k: string) {
	el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
	// The filing tests spy on `document.elementFromPoint` (see `stubHit`);
	// `restoreAllMocks` puts the native method back so a stub pointing at a
	// card that has since been UNMOUNTED cannot leak into a later test. It
	// did: an own-property assignment with a mismatched delete here left the
	// last stub standing, and the in-list drag test filed into a detached
	// card under `--sequence.shuffle.tests --sequence.seed=2` (and 3, and 5).
	vi.restoreAllMocks();
});

function keep(m: Mounted): Mounted {
	mounted.push(m);
	return m;
}

describe('ClassView: the grip is a button, the checkbox is redrawn, and neither exists for a student', () => {
	it('a manager gets one grip button and one .cr-check per item row, and no native draggable', () => {
		const { m } = mountView(true);
		keep(m);
		expect(m.all('[data-testid="item-row"]')).toHaveLength(3);
		const grips = m.all<HTMLButtonElement>('button.row-grip[data-sort-handle]');
		expect(grips).toHaveLength(3);
		for (const g of grips) {
			expect(g.getAttribute('aria-label')).toMatch(/^Reorder .*: drag, or use the arrow keys$/);
		}
		expect(m.all('[draggable]')).toHaveLength(0);
		expect(m.all('input.row-select.cr-check')).toHaveLength(3);
		expect(m.all('li[data-sort-item][data-item-id]')).toHaveLength(3);
	});

	it('the student mount of the same fixture renders the rows and none of the controls', () => {
		const { m } = mountView(false);
		keep(m);
		// The positive control: the same three items are on screen.
		expect(m.all('[data-testid="item-row"]')).toHaveLength(3);
		expect(m.all('button.row-grip')).toHaveLength(0);
		expect(m.all('[data-sort-handle]')).toHaveLength(0);
		expect(m.all('input.cr-check')).toHaveLength(0);
		expect(m.all('[data-testid="group-file-here"]')).toHaveLength(0);
		expect(m.all('select')).toHaveLength(0);
	});
});

describe('ClassView: reorder commits through the same path a drag does', () => {
	it('ArrowDown on the first grip of Unit 1 writes setOrder([b, a]) and nothing else', async () => {
		const { m, log } = mountView(true);
		keep(m);
		const grip = m.one<HTMLButtonElement>('[data-testid="row-grip-a"]');
		key(grip, 'ArrowDown');
		await m.settle();
		expect(log.orders).toEqual([['b', 'a']]);
		expect(log.filed).toEqual([]);
		expect(log.pins).toEqual([]);
	});

	it('ArrowUp on the first row is a no-op: no write at all', async () => {
		const { m, log } = mountView(true);
		keep(m);
		key(m.one('[data-testid="row-grip-a"]'), 'ArrowUp');
		await m.settle();
		expect(log.orders).toEqual([]);
	});

	it('a pointer drag released in its own list writes the reordered ids', async () => {
		const { m, log } = mountView(true);
		keep(m);
		const grip = m.one<HTMLButtonElement>('[data-testid="row-grip-a"]');
		grip.dispatchEvent(pointer('pointerdown', 10, 10));
		// Past the 4px threshold, then further: every other centre (all at 0 in
		// happy-dom) is above the dragged one, so it lands last.
		grip.dispatchEvent(pointer('pointermove', 10, 20));
		grip.dispatchEvent(pointer('pointermove', 10, 60));
		grip.dispatchEvent(pointer('pointerup', 10, 60));
		await m.settle();
		expect(log.orders).toEqual([['b', 'a']]);
		expect(log.filed).toEqual([]);
	});
});

describe('ClassView: filing by drag -- a release over ANOTHER card files, and does not reorder the source', () => {
	function stubHit(el: Element | null) {
		// happy-dom has `elementFromPoint` but nothing to hit-test; the stub
		// answers what a real browser would answer with the pointer over the
		// card -- which the browser spec proves against the real hit test.
		// A spy, not an assignment, so the file's `afterEach` restores it.
		vi.spyOn(document, 'elementFromPoint').mockImplementation(() => el);
	}

	it('dragging a onto Unit 2 calls setItemUnit(a, u-2) then renumbers Unit 2 with a last', async () => {
		const { m, log } = mountView(true);
		keep(m);
		const target = m.one<HTMLElement>('.group-card[data-group-id="u-2"]');
		stubHit(target.querySelector('[data-testid="group-head"]'));
		const grip = m.one<HTMLButtonElement>('[data-testid="row-grip-a"]');
		const source = grip.closest('li')!;
		grip.dispatchEvent(pointer('pointerdown', 10, 10));
		grip.dispatchEvent(pointer('pointermove', 10, 30));
		m.flush();
		// Mid-drag: the zone under the pointer is marked, the dragged row no
		// longer answers hit tests, and only ONE zone is lit.
		expect(target.getAttribute('data-sort-zone-active')).toBe('true');
		expect(m.all('[data-sort-zone-active="true"]')).toHaveLength(1);
		expect(source.style.pointerEvents).toBe('none');
		grip.dispatchEvent(pointer('pointerup', 10, 30));
		await m.settle();
		expect(log.filed).toEqual([{ itemId: 'a', unitId: 'u-2' }]);
		// The destination renumbered with the arrival last; the SOURCE group
		// (a, b) was never written.
		expect(log.orders).toEqual([['c', 'a']]);
		// Nothing is left lit and the row hit-tests again.
		expect(m.all('[data-sort-zone-active="true"]')).toHaveLength(0);
		expect(source.style.pointerEvents).toBe('');
	});

	it('released over its OWN card is a reorder, never a filing (the negative control)', async () => {
		const { m, log } = mountView(true);
		keep(m);
		const home = m.one<HTMLElement>('.group-card[data-group-id="u-1"]');
		stubHit(home.querySelector('[data-testid="group-head"]'));
		const grip = m.one<HTMLButtonElement>('[data-testid="row-grip-a"]');
		grip.dispatchEvent(pointer('pointerdown', 10, 10));
		grip.dispatchEvent(pointer('pointermove', 10, 60));
		m.flush();
		expect(m.all('[data-sort-zone-active="true"]')).toHaveLength(0);
		grip.dispatchEvent(pointer('pointerup', 10, 60));
		await m.settle();
		expect(log.filed).toEqual([]);
		expect(log.orders).toEqual([['b', 'a']]);
	});

	it('Escape mid-drag cancels: no filing and no reorder, and the zone unmarks', async () => {
		const { m, log } = mountView(true);
		keep(m);
		const target = m.one<HTMLElement>('.group-card[data-group-id="u-2"]');
		stubHit(target);
		const grip = m.one<HTMLButtonElement>('[data-testid="row-grip-a"]');
		grip.dispatchEvent(pointer('pointerdown', 10, 10));
		grip.dispatchEvent(pointer('pointermove', 10, 30));
		m.flush();
		expect(target.getAttribute('data-sort-zone-active')).toBe('true');
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		await m.settle();
		expect(m.all('[data-sort-zone-active="true"]')).toHaveLength(0);
		expect(log.filed).toEqual([]);
		expect(log.orders).toEqual([]);
	});
});

describe('ClassView: filing by click -- File here exists only while something is ticked', () => {
	it('zero at rest, one per open group once a row is ticked, and pressing one files the selection there', async () => {
		const { m, log } = mountView(true);
		keep(m);
		expect(m.all('[data-testid="group-file-here"]')).toHaveLength(0);
		// The positive control for the absence: the groups themselves are there.
		expect(m.all('[data-testid="unit-group"]')).toHaveLength(3);

		const box = m.one<HTMLInputElement>('[data-testid="row-select-b"]');
		box.click();
		m.flush();
		expect(box.checked).toBe(true);
		const here = m.all<HTMLButtonElement>('[data-testid="group-file-here"]');
		expect(here).toHaveLength(3);
		expect(here.map((b) => b.textContent?.trim())).toEqual(['File here', 'File here', 'File here']);
		// The keyboard spelling stays beside it, redrawn.
		expect(m.all('select.cr-select[data-testid="bulk-unit-select"]')).toHaveLength(1);

		const intoU3 = here.find((b) => b.dataset.groupId === 'u-3')!;
		intoU3.click();
		await m.settle();
		expect(log.filed).toEqual([{ itemId: 'b', unitId: 'u-3' }]);
		// Unit 3 was empty, so its renumbering is the arrival alone.
		expect(log.orders).toEqual([['b']]);
	});

	it('clearing the selection takes every File here away again', async () => {
		const { m } = mountView(true);
		keep(m);
		m.one<HTMLInputElement>('[data-testid="row-select-a"]').click();
		m.flush();
		expect(m.all('[data-testid="group-file-here"]')).toHaveLength(3);
		m.one<HTMLButtonElement>('[data-testid="bulk-clear"]').click();
		m.flush();
		expect(m.all('[data-testid="group-file-here"]')).toHaveLength(0);
	});

	it('the empty unit promises the two doors ONLY when both exist: with transports, without unitTransports, and as a student', () => {
		// Unit 3 is empty in the fixture, so exactly one hint renders per mount.
		// The dashed drop-hint and the "Drag items here ... File here" sentence
		// key on `editable && unitTransports` -- the SAME predicate every
		// filing path keys on -- so a manager the page could not hand a unit
		// transport to (the middle mount) reads the same "Nothing here yet" a
		// student does rather than two doors that do not exist.
		const withBoth = mountView(true);
		keep(withBoth.m);
		const hintBoth = withBoth.m.all<HTMLElement>('[data-testid="group-empty-hint"]');
		expect(hintBoth).toHaveLength(1);
		expect(hintBoth[0].classList.contains('drop-hint')).toBe(true);
		expect(hintBoth[0].textContent).toContain('File here');
		expect(hintBoth[0].textContent).not.toContain('Nothing here yet');

		const noUnits = keep(
			mountInto(View, {
				section: SECTION,
				items: ITEMS,
				units: UNITS,
				canManage: true,
				transports: composerTransports(freshLog()),
				unitTransports: null,
				basePath: '/classroom'
			})
		);
		const hintNoUnits = noUnits.all<HTMLElement>('[data-testid="group-empty-hint"]');
		expect(hintNoUnits).toHaveLength(1);
		expect(hintNoUnits[0].classList.contains('drop-hint')).toBe(false);
		expect(hintNoUnits[0].textContent).toContain('Nothing here yet');
		expect(hintNoUnits[0].textContent).not.toContain('File here');
		// The positive control for that mount: it IS a manager's view (grips render).
		expect(noUnits.all('button.row-grip')).toHaveLength(3);

		// A student never sees an EMPTY unit at all (`classGroups` takes
		// `includeEmptyUnits: canManage`), so for them the absence is the card
		// itself, not a softer sentence in it; the rows are the positive control.
		const student = mountView(false);
		keep(student.m);
		expect(student.m.all('[data-testid="item-row"]')).toHaveLength(3);
		expect(student.m.all('.group-card[data-group-id="u-3"]')).toHaveLength(0);
		expect(student.m.all('[data-testid="group-empty-hint"]')).toHaveLength(0);
	});

	it('the row menu unit picker is a .cr-select too', () => {
		const { m } = mountView(true);
		keep(m);
		expect(m.all('select')).toHaveLength(0);
		m.all<HTMLButtonElement>('[data-testid="row-menu"]')[0].click();
		m.flush();
		expect(m.all('select.cr-select[data-testid="row-unit"]')).toHaveLength(1);
		expect(m.all('select:not(.cr-select)')).toHaveLength(0);
	});
});

describe('ClassView: where the links and files sit follows the item layout (0193)', () => {
	function detailOrder(m: Mounted): string[] {
		const detail = m.one<HTMLElement>('[data-testid="row-detail"]');
		return Array.from(detail.children).map(
			(el) => (el as HTMLElement).dataset.testid ?? el.className.split(' ')[0]
		);
	}

	/** Mount `c` with the given layout (or none) as a student and open its detail. */
	function openC(layout: { links: 'top' | 'bottom'; files: 'top' | 'bottom' } | null) {
		const items = layout
			? ITEMS.map((i) => (i.id === 'c' ? Object.assign({ ...i }, { layout }) : i))
			: ITEMS;
		const m = keep(
			mountInto(View, { section: SECTION, items, units: UNITS, canManage: false, basePath: '/classroom' })
		);
		m.one<HTMLElement>('li[data-item-id="c"]')
			.querySelector<HTMLButtonElement>('[data-testid="row-expand"]')!
			.click();
		m.flush();
		return detailOrder(m);
	}

	/** Where the body sits in the detail's child list (the reference every placement is read against). */
	const bodyIndex = (order: string[]) => order.findIndex((k) => k !== 'detail-links' && k !== 'detail-files');

	it('with no layout on the row, links AND files render BELOW the body (the pre-0193 default)', () => {
		const order = openC(null);
		// Both blocks are present (the positive control for every "not first"
		// below), and both sit after the body.
		expect(order).toContain('detail-links');
		expect(order).toContain('detail-files');
		expect(order[0]).not.toBe('detail-links');
		expect(order[0]).not.toBe('detail-files');
		expect(order.indexOf('detail-links')).toBeGreaterThan(bodyIndex(order));
		expect(order.indexOf('detail-files')).toBeGreaterThan(bodyIndex(order));
	});

	it('with links placed on top, the links block is the first child and files stay below', () => {
		const order = openC({ links: 'top', files: 'bottom' });
		expect(order[0]).toBe('detail-links');
		expect(order.indexOf('detail-files')).toBeGreaterThan(bodyIndex(order));
	});

	it('with files placed on top, the files block is the first child and links stay below', () => {
		const order = openC({ links: 'bottom', files: 'top' });
		expect(order[0]).toBe('detail-files');
		expect(order.indexOf('detail-links')).toBeGreaterThan(bodyIndex(order));
	});

	it('with both on top, links lead, files follow, and neither renders twice', () => {
		const order = openC({ links: 'top', files: 'top' });
		expect(order.slice(0, 2)).toEqual(['detail-links', 'detail-files']);
		expect(order.filter((k) => k === 'detail-links')).toHaveLength(1);
		expect(order.filter((k) => k === 'detail-files')).toHaveLength(1);
	});
});

describe('UnitManager: a worded grip, the arrow keys, and an inline rename', () => {
	function mountUnits() {
		const unitOrders: string[][] = [];
		const renames: string[] = [];
		const m = keep(
			mountInto(Units, {
				courseId: 'c-1',
				courseLabel: 'ENG1H',
				units: UNITS,
				transports: unitTransports(freshLog(), unitOrders, renames),
				chrome: false
			})
		);
		return { m, unitOrders, renames };
	}

	it('one grip per row carrying the word Move, and no glyph-only arrow buttons', () => {
		const { m } = mountUnits();
		expect(m.all('[data-testid="unit-row"]')).toHaveLength(3);
		const grips = m.all<HTMLButtonElement>('[data-testid="unit-grip"][data-sort-handle]');
		expect(grips).toHaveLength(3);
		for (const g of grips) expect(g.textContent).toContain('Move');
		expect(m.all('[data-testid="unit-up"], [data-testid="unit-down"]')).toHaveLength(0);
		// The kept testids.
		expect(m.all('[data-testid="unit-new-name"]')).toHaveLength(1);
		expect(m.all('[data-testid="unit-add"]')).toHaveLength(1);
		expect(m.all('[data-testid="unit-delete"]')).toHaveLength(3);
	});

	it('ArrowDown on the first grip stores the FULL list with that unit one step down', async () => {
		const { m, unitOrders } = mountUnits();
		key(m.all('[data-testid="unit-grip"]')[0], 'ArrowDown');
		await m.settle();
		expect(unitOrders).toEqual([['u-2', 'u-1', 'u-3']]);
	});

	it('a second ArrowDown from wherever focus landed writes a second order: the grip is never `disabled`', async () => {
		// THE GRIP MUST NOT TAKE `disabled` MID-WRITE. `reorder()` sets `busy`
		// synchronously inside the action's `ondrop`, so a `disabled={busy}`
		// binding is flushed BEFORE the action's own microtask refocus runs --
		// and Chrome blurs a button the moment it becomes disabled, so the
		// refocus is a no-op on a control that no longer takes focus, focus
		// drops to <body>, and the next arrow press goes nowhere (measured in
		// Chromium 141: activeElement BODY at 10ms and at 300ms, one write).
		// happy-dom does not emulate that blur, so the focus half of this
		// could pass vacuously on the broken code; the CONTRACT is what is
		// asserted alongside it -- no `disabled` attribute on the grip while
		// the write is in flight -- per the dispatchEvent-on-disabled rule.
		const { m, unitOrders } = mountUnits();
		const first = m.all<HTMLButtonElement>('[data-testid="unit-grip"]')[0];
		first.focus();
		expect(document.activeElement).toBe(first);
		key(first, 'ArrowDown');
		m.flush();
		// Mid-write: `busy` is true (the row's other controls ARE disabled, the
		// positive control), and the grip is not.
		expect(m.all<HTMLButtonElement>('[data-testid="unit-rename"]').every((b) => b.disabled)).toBe(true);
		expect(first.hasAttribute('disabled')).toBe(false);
		expect(first.disabled).toBe(false);
		await m.settle();
		expect(unitOrders).toEqual([['u-2', 'u-1', 'u-3']]);
		// Focus is still on the SAME grip (the element survives the keyed
		// each), and a second press from the active element writes again.
		expect(document.activeElement).toBe(first);
		key(document.activeElement!, 'ArrowDown');
		await m.settle();
		expect(unitOrders).toHaveLength(2);
		expect(unitOrders[1]).toEqual(['u-2', 'u-1', 'u-3']);
	});

	it('ArrowUp on the last grip moves it up; ArrowDown on it writes nothing', async () => {
		const { m, unitOrders } = mountUnits();
		const last = m.all('[data-testid="unit-grip"]')[2];
		key(last, 'ArrowDown');
		await m.settle();
		expect(unitOrders).toEqual([]);
		key(last, 'ArrowUp');
		await m.settle();
		expect(unitOrders).toEqual([['u-1', 'u-3', 'u-2']]);
	});

	it('Rename turns the name into an input seeded with it; Escape cancels with no write', async () => {
		const { m, renames } = mountUnits();
		expect(m.all('[data-testid="unit-rename-input"]')).toHaveLength(0);
		m.all<HTMLButtonElement>('[data-testid="unit-rename"]')[1].click();
		m.flush();
		const input = m.one<HTMLInputElement>('[data-testid="unit-rename-input"]');
		expect(input.value).toBe('Unit 2');
		expect(m.all('[data-testid="unit-rename-save"]')).toHaveLength(1);
		expect(m.all('[data-testid="unit-rename-cancel"]')).toHaveLength(1);
		// The name itself is the input now: one fewer static name on screen.
		expect(m.all('.unit-name')).toHaveLength(2);
		key(input, 'Escape');
		await m.settle();
		expect(m.all('[data-testid="unit-rename-input"]')).toHaveLength(0);
		expect(m.all('.unit-name')).toHaveLength(3);
		expect(renames).toEqual([]);
	});

	it('Enter saves through upsertUnit with the unit id, and the visible Cancel closes it too', async () => {
		const { m, renames } = mountUnits();
		m.all<HTMLButtonElement>('[data-testid="unit-rename"]')[0].click();
		m.flush();
		const input = m.one<HTMLInputElement>('[data-testid="unit-rename-input"]');
		input.value = 'Sketching';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await m.settle();
		expect(renames).toEqual(['u-1=Sketching']);
		expect(m.all('[data-testid="unit-rename-input"]')).toHaveLength(0);

		m.all<HTMLButtonElement>('[data-testid="unit-rename"]')[2].click();
		m.flush();
		expect(m.all('[data-testid="unit-rename-input"]')).toHaveLength(1);
		m.one<HTMLButtonElement>('[data-testid="unit-rename-cancel"]').click();
		m.flush();
		expect(m.all('[data-testid="unit-rename-input"]')).toHaveLength(0);
		expect(renames).toEqual(['u-1=Sketching']);
	});
});
