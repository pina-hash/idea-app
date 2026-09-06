// tests/dom/maps-editor-stage-mount.test.ts
//
// THE WORKSPACE, MOUNTED WHOLE, WITH A REAL POINTER AND A REAL KEYBOARD ON IT
// (prompt 0093). `tests/dom/maps-plan-canvas-mount.test.ts` mounts NodeDetail
// alone and proves the wiring inside it; this file mounts the REAL MapsEditor
// -- tree, stage and inspector together, the component the route mounts -- and
// proves the three claims the brief turns on, each read off the DRAWN GEOMETRY
// or the typed fields rather than off the source:
//
//   1. A TYPED DIMENSION CHANGES THE DRAWING. The assertion is on the shape's
//      own box and on the dimension label drawn beside it, never on the field:
//      the field holding 96 is what somebody typed, not what they see.
//   2. A DRAG DOES NOT REWRITE A TYPED DIMENSION, and UNDO -- the control and
//      Ctrl+Z on the sheet -- takes the drag back, while Ctrl+Z INSIDE A TEXT
//      FIELD is left to the field (interface standard 8).
//   3. THE SHEET IS A WAY IN: clicking a sibling drawn on it opens that node,
//      and the tree follows.
//
// Plus the two states that drew NOTHING before this bundle: a ROOT (its own
// outline is the frame, redrawn from the typed width) and a NEW ROOM with a
// size and no position (a ghost, placed by one press at the frame's centre).
// And the compartment's stage: the unit's elevation sketch, drawn at the
// height being typed.
//
// WHY THIS CANNOT BE A SERVER RENDER: every claim is about what an EVENT does
// three renders later. `svelte/server`'s render() returns one string and runs
// no handler.
//
// WHAT IS ASSERTED AND WHAT IS NOT. Inline style geometry, text content and
// input values -- happy-dom has no layout engine, so `getBoundingClientRect()`
// is 0x0 here and a box or a ratio read that way is a vacuous pass (see
// `tests/dom/README.md`). The style strings are what the layout WOULD paint,
// which is exactly what the drawing rule is about; that the browser paints
// them is `npm run verify:browser`'s claim (maps-editor-state-*.mjs).
//
// THE SCALE IS THE COMPONENT'S OWN UNMEASURED-PANE FALLBACK: `clientWidth` is 0
// in happy-dom, so the sheet draws at its nominal 600px and 400 inches of
// Machine Shop become 1.5px per inch, 1200 inches of building 0.5px per inch.
// Every pixel figure below is converted through that constant where it is used.

import { describe, expect, it } from 'vitest';
import { mountInto, type Mounted } from './mount';
import MapsEditor from '../../src/lib/maps/MapsEditor.svelte';
import { FIX, mapsEditFixture, memoryMapsTransports } from '../../src/routes/dev/maps-edit/fixture';
import type { MapsSelection } from '../../src/lib/maps/maps';

/** Machine Shop is 400in wide: 600 / 400. */
const PX_SHOP = 600 / 400;

function openEditor(initialSelection: MapsSelection | null) {
	const data = mapsEditFixture();
	const m = mountInto(MapsEditor as never, {
		initial: data,
		transports: memoryMapsTransports(data),
		initialSelection
	});
	return { m, data };
}

const value = (m: Mounted, id: string) => (m.one(`input[id$="${id}"]`) as HTMLInputElement).value;

function type(m: Mounted, id: string, text: string) {
	const input = m.one(`input[id$="${id}"]`) as HTMLInputElement;
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	m.flush();
}

const styleNum = (el: Element, prop: 'width' | 'height' | 'left' | 'top') =>
	Number(el.getAttribute('style')?.match(new RegExp(`${prop}: ([\\d.]+)px`))?.[1]);

function pointer(type: string, clientX: number, clientY: number): Event {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperties(event, {
		clientX: { value: clientX },
		clientY: { value: clientY },
		pointerId: { value: 1 }
	});
	return event;
}
function drag(shape: Element, from: [number, number], to: [number, number]) {
	shape.dispatchEvent(pointer('pointerdown', from[0], from[1]));
	shape.dispatchEvent(pointer('pointermove', to[0], to[1]));
	shape.dispatchEvent(pointer('pointerup', to[0], to[1]));
}

describe('the workspace mounts tree, stage and inspector together', () => {
	it('opens a placed unit with its sheet beside its fields, and nothing selected draws the overview', async () => {
		const { m } = openEditor({ kind: 'node', id: FIX.workbench });
		expect(m.all('[data-testid="maps-node-tree"] .tree-row')).toHaveLength(8);
		expect(m.all('[data-testid="maps-node-stage"]')).toHaveLength(1);
		expect(m.all('[data-testid="maps-node-inspector"]')).toHaveLength(1);
		expect(m.all('[data-testid="maps-plan-shape"]')).toHaveLength(1);
		expect(m.all('[data-testid="maps-overview"]')).toHaveLength(0);
		await m.stop();

		const none = openEditor(null);
		expect(none.m.all('[data-testid="maps-overview"]')).toHaveLength(1);
		expect(none.m.all('[data-testid="maps-overview-root"]')).toHaveLength(1);
		// The building's two placed rooms, drawn; the editing pieces absent.
		expect(none.m.all('[data-testid="maps-plan-child"]')).toHaveLength(2);
		expect(none.m.all('[data-testid="maps-plan-shape"]')).toHaveLength(0);
		expect(none.m.all('[data-testid="maps-node-detail"]')).toHaveLength(0);
		await none.m.stop();
	});
});

describe('1. A TYPED DIMENSION CHANGES THE DRAWING', () => {
	it('widening the typed width widens the DRAWN shape and the dimension label, and leaves the depth box alone', async () => {
		const { m } = openEditor({ kind: 'node', id: FIX.workbench });
		const shape = () => m.one('[data-testid="maps-plan-shape"]');
		expect(styleNum(shape(), 'width')).toBe(72 * PX_SHOP);
		expect(styleNum(shape(), 'height')).toBe(30 * PX_SHOP);
		expect(m.one('[data-testid="maps-plan-dim-w"]').textContent?.trim()).toBe('72″');

		type(m, '-rect-w', '96');

		// THE ASSERTION THIS FILE EXISTS FOR: the geometry moved, not the field.
		expect(styleNum(shape(), 'width')).toBe(96 * PX_SHOP);
		expect(styleNum(shape(), 'height')).toBe(30 * PX_SHOP);
		expect(m.one('[data-testid="maps-plan-dim-w"]').textContent?.trim()).toBe('96″');
		expect(m.one('[data-testid="maps-plan-dim-h"]').textContent?.trim()).toBe('30″');
		await m.stop();
	});

	it("a ROOT's own frame is redrawn from its typed width: 1200x800 -> 1500x800 changes the frame's aspect", async () => {
		const { m } = openEditor({ kind: 'node', id: FIX.building });
		const frame = () => m.one('[data-testid="maps-plan-frame"]');
		// Nominal 600px over 1200in: the frame is drawn 600 x 400.
		expect(styleNum(frame(), 'width')).toBe(600);
		expect(styleNum(frame(), 'height')).toBe(400);
		// Its two placed rooms are inside it; nothing is an editable shape.
		expect(m.all('[data-testid="maps-plan-child"]')).toHaveLength(2);
		expect(m.all('[data-testid="maps-plan-shape"]')).toHaveLength(0);

		type(m, '-rect-w', '1500');

		// Fit is by width at the nominal scale, so the frame stays 600 wide and
		// the DEPTH shrinks: the aspect ratio is what says the frame redrew.
		const w = styleNum(frame(), 'width');
		const h = styleNum(frame(), 'height');
		expect(w / h).toBeCloseTo(1500 / 800, 6);
		expect(m.one('[data-testid="maps-plan-frame-size"]').textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'building 1500″ × 800″'
		);
		await m.stop();
	});

	it('a NEW ROOM with a typed size and no position is a GHOST, and Place here writes the centre into the fields', async () => {
		const { m } = openEditor({ kind: 'new-node', parentId: FIX.building, presetKind: 'room' });
		expect(m.all('[data-testid="maps-plan-ghost"]')).toHaveLength(0);
		expect(m.all('[data-testid="maps-plan-shape"]')).toHaveLength(0);
		// HAPPY-DOM NEVER MATCHES `:checked` ON AN <option> (measured: with the
		// rect option selected, `select.querySelector(':checked')` is undefined),
		// and Svelte's select binding reads that selector and falls back to the
		// first ENABLED option. Disabling the placeholder option makes the
		// fallback land on "rect", which is what selecting it in a browser
		// produces; the real select is driven by the browser harness
		// (maps-editor-state-new-room.mjs). The value is set too, so the DOM
		// reads as a browser's would.
		const outline = m.one('select[id$="-outline"]') as HTMLSelectElement;
		(outline.querySelector('option[value="none"]') as HTMLOptionElement).disabled = true;
		(outline.querySelector('option[value="rect"]') as HTMLOptionElement).selected = true;
		outline.value = 'rect';
		outline.dispatchEvent(new Event('change', { bubbles: true }));
		m.flush();
		type(m, '-rect-w', '240');
		type(m, '-rect-h', '180');
		expect(m.all('[data-testid="maps-plan-ghost"]')).toHaveLength(1);
		expect(value(m, '-pos-x')).toBe('');

		(m.one('[data-testid="maps-plan-place-ghost"]') as HTMLButtonElement).click();
		m.flush();
		// 1200 x 800 frame, 240 x 180 footprint: centred is (480, 310), from the
		// fixture's inches and not from the implementation.
		expect(value(m, '-pos-x')).toBe('480');
		expect(value(m, '-pos-y')).toBe('310');
		expect(m.all('[data-testid="maps-plan-ghost"]')).toHaveLength(0);
		expect(m.all('[data-testid="maps-plan-shape"]')).toHaveLength(1);
		await m.stop();
	});

	it("a COMPARTMENT's stage is its unit's elevation sketch, drawn at the height being typed", async () => {
		const { m } = openEditor({ kind: 'node', id: FIX.drawer1 });
		expect(m.all('[data-testid="maps-plan-canvas"]')).toHaveLength(0);
		expect(m.all('[data-testid="maps-unit-elevation"]')).toHaveLength(0);
		const marked = () => m.one('[data-testid="maps-elevation-sketch-marked"]');
		const slots = () => m.all('[data-testid="maps-elevation-sketch-stack"] .slot');
		expect(slots()).toHaveLength(2);
		// 3in and 5in at the sketch's 12px/in cap: 36 and 60.
		expect(styleNum(marked(), 'height')).toBe(36);
		type(m, '-elev-h', '6');
		expect(styleNum(marked(), 'height')).toBe(72);
		const other = slots().find((el) => el !== marked())!;
		expect(styleNum(other, 'height')).toBe(60);
		expect(marked().textContent?.replace(/\s+/g, ' ')).toContain('6″');
		await m.stop();
	});
});

describe('2. A DRAG DOES NOT REWRITE A TYPED DIMENSION, AND UNDO TAKES IT BACK', () => {
	it('drag moves X, holds width/depth/rotation byte-identically, and the Undo control restores X', async () => {
		const { m } = openEditor({ kind: 'node', id: FIX.workbench });
		const before = { w: value(m, '-rect-w'), h: value(m, '-rect-h'), rot: value(m, '-rot'), x: value(m, '-pos-x') };
		expect(before).toEqual({ w: '72', h: '30', rot: '', x: '120' });
		const undo = m.one('[data-testid="maps-plan-undo"]') as HTMLButtonElement;
		expect(undo.getAttribute('aria-disabled')).toBe('true');

		// +150px at 1.5px/in is +100in: 120 -> 220, far from every snap edge.
		drag(m.one('[data-testid="maps-plan-shape"]'), [400, 200], [550, 200]);
		m.flush();
		expect(value(m, '-pos-x')).toBe('220');
		expect(value(m, '-rect-w')).toBe(before.w);
		expect(value(m, '-rect-h')).toBe(before.h);
		expect(value(m, '-rot')).toBe(before.rot);
		expect(undo.getAttribute('aria-disabled')).toBe('false');

		undo.click();
		m.flush();
		expect(value(m, '-pos-x')).toBe('120');
		expect(value(m, '-rect-w')).toBe(before.w);
		expect(m.one('[data-testid="maps-plan-snap-note"]').textContent).toContain('Undid the last drag');
		await m.stop();
	});

	it('Ctrl+Z on the sheet undoes; Ctrl+Z inside a text field does not', async () => {
		const { m } = openEditor({ kind: 'node', id: FIX.workbench });
		const sheet = m.one('[data-testid="maps-plan-canvas"]');
		drag(m.one('[data-testid="maps-plan-shape"]'), [400, 200], [550, 200]);
		m.flush();
		expect(value(m, '-pos-x')).toBe('220');

		// Sheet-wide: the key lands on the shape (a child of the sheet) and bubbles.
		m.one('[data-testid="maps-plan-shape"]').dispatchEvent(
			new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
		);
		m.flush();
		expect(value(m, '-pos-x')).toBe('120');

		// A second drag, then Ctrl+Z from INSIDE the width field: the field's
		// own undo, not the sheet's -- X stays where the drag put it.
		drag(m.one('[data-testid="maps-plan-shape"]'), [400, 200], [550, 200]);
		m.flush();
		expect(value(m, '-pos-x')).toBe('220');
		m.one('input[id$="-rect-w"]').dispatchEvent(
			new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
		);
		m.flush();
		expect(value(m, '-pos-x')).toBe('220');
		expect(value(m, '-rect-w')).toBe('72');
		expect(sheet).toBeTruthy();
		await m.stop();
	});

	it('a nudge is undoable too, and the negative control: Ctrl+Z with nothing to undo moves nothing', async () => {
		const { m } = openEditor({ kind: 'node', id: FIX.workbench });
		m.one('[data-testid="maps-plan-shape"]').dispatchEvent(
			new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
		);
		m.flush();
		expect(value(m, '-pos-x')).toBe('120');
		m.one('[data-testid="maps-plan-shape"]').dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
		);
		m.flush();
		expect(value(m, '-pos-x')).toBe('121');
		(m.one('[data-testid="maps-plan-undo"]') as HTMLButtonElement).click();
		m.flush();
		expect(value(m, '-pos-x')).toBe('120');
		await m.stop();
	});
});

describe('3. THE SHEET IS A WAY IN', () => {
	it('clicking the sibling drawn on the sheet opens it, and the tree follows', async () => {
		const { m } = openEditor({ kind: 'node', id: FIX.workbench });
		const sibling = m.one('[data-testid="maps-plan-sibling"]') as HTMLButtonElement;
		expect(sibling.getAttribute('aria-label')).toContain('Tool Chest A');
		sibling.click();
		await m.settle();
		await m.settle();
		expect(m.one('[data-testid="maps-node-inspector"] h2').textContent).toContain('Tool Chest A');
		const current = m.one('[data-testid="maps-node-tree"] .tree-row[aria-current="true"] .row-name');
		expect(current.textContent).toBe('Tool Chest A');
		// And the sheet redrew for the new selection: Tool Chest A is the shape
		// now and Workbench B is its sibling.
		expect(m.one('[data-testid="maps-plan-shape"]').getAttribute('aria-label')).toContain('Tool Chest A');
		expect(m.one('[data-testid="maps-plan-sibling"]').getAttribute('aria-label')).toContain('Workbench B');
		await m.stop();
	});

	it('a room shows its own units inside it, and clicking one opens the unit', async () => {
		const { m } = openEditor({ kind: 'node', id: FIX.machineShop });
		const children = m.all('[data-testid="maps-plan-child"]');
		expect(children.map((c) => c.getAttribute('aria-label')?.split(',')[0]).sort()).toEqual([
			'Tool Chest A',
			'Workbench B'
		]);
		(children.find((c) => c.getAttribute('aria-label')?.startsWith('Workbench B')) as HTMLButtonElement).click();
		await m.settle();
		await m.settle();
		expect(m.one('[data-testid="maps-node-inspector"] h2').textContent).toContain('Workbench B');
		await m.stop();
	});
});
