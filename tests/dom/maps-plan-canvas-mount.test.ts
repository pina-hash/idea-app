// tests/dom/maps-plan-canvas-mount.test.ts
//
// THE ONE RULE OF SPEC 7, PUT TO A REAL POINTER: accuracy comes from the typed
// numbers, not the mouse. A drag may move a shape; it may not change what the
// shape IS.
//
// WHY THIS CANNOT BE A SERVER RENDER. The claim is about what a POINTER
// EVENT does to a form's own inputs -- three renders apart, through a
// callback, a derived and a `bind:value`. `svelte/server`'s `render()` returns
// one string per call and never runs a handler, so it can assert that a canvas
// is on screen and nothing at all about what dragging it does.
// `tests/maps-placement.test.ts` carries the arithmetic; this file carries the
// WIRING, which is the half a mutation would break silently: the pure function
// can stay perfectly correct while the component writes its result into the
// wrong field.
//
// WHAT IS ASSERTED AND WHAT IS NOT. Input VALUES, node identity and which
// handler an event reached. NOT geometry and NOT contrast: happy-dom has no
// layout engine, `getBoundingClientRect()` answers 0x0 and
// `getComputedStyle(el).color` is the empty string, so a box or a ratio read
// here is a vacuous pass (see `tests/dom/README.md`). That the shape is drawn
// where the numbers say is `npm run verify:browser`'s claim and stays there.
//
// THE SCALE IS THE COMPONENT'S OWN UNMEASURED-PANE FALLBACK, deliberately.
// `clientWidth` is 0 in happy-dom, so `PlanCanvas` draws at its nominal 600px
// and 400 inches of room become 1.5px per inch -- the same branch a real
// browser runs for one frame before its first layout. Every pixel figure below
// is converted through that constant and stated where it is used.
//
// MUTATION-CHECKED (this session, details in the history entry): making
// `acceptPlacement` in `NodeDetail.svelte` write the dragged X into the
// rectangle WIDTH -- the exact defect this file exists for -- reddened it, and
// the file was restored from an in-memory copy, md5-verified and re-run green.

import { describe, expect, it } from 'vitest';
import { mountInto } from './mount';
import NodeDetail from '../../src/lib/maps/NodeDetail.svelte';
import { FIX, mapsEditFixture, memoryMapsTransports } from '../../src/routes/dev/maps-edit/fixture';
import type { MapsEditorData, MapsNode } from '../../src/lib/maps/maps';

/** The pane's fallback scale: 600px nominal over the 400in Machine Shop. */
const PX_PER_INCH = 600 / 400;

function openNode(nodeId: string) {
	const data: MapsEditorData = mapsEditFixture();
	const node = data.nodes.find((n) => n.id === nodeId) as MapsNode;
	const m = mountInto(NodeDetail as never, {
		node,
		data,
		transports: memoryMapsTransports(data),
		onchanged: async () => {},
		onselectnode: () => {},
		onaddchild: () => {},
		ondeleted: () => {},
		registerForm: () => {}
	});
	return { m, data, node };
}

const value = (m: { one: (s: string) => Element }, id: string) =>
	(m.one(`input[id$="${id}"]`) as HTMLInputElement).value;

/** A real pointer event at real client coordinates. */
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

describe('the plan canvas is wired to the typed fields and to nothing else', () => {
	it('draws the shape from the typed numbers, with its parent and sibling around it', async () => {
		const { m } = openNode(FIX.workbench);
		expect(m.all('[data-testid="maps-plan-canvas"]')).toHaveLength(1);
		expect(m.all('[data-testid="maps-plan-shape"]')).toHaveLength(1);
		// Machine Shop holds Tool Chest A besides this bench: one sibling drawn,
		// which is also the snap target the drag tests below land on.
		expect(m.all('[data-testid="maps-plan-sibling"]')).toHaveLength(1);
		await m.stop();
	});

	it('A DRAG MOVES THE POSITION AND LEAVES EVERY DIMENSION BYTE-IDENTICAL', async () => {
		const { m } = openNode(FIX.workbench);
		const before = {
			w: value(m, '-rect-w'),
			h: value(m, '-rect-h'),
			rot: value(m, '-rot'),
			x: value(m, '-pos-x'),
			y: value(m, '-pos-y')
		};
		expect(before).toEqual({ w: '72', h: '30', rot: '', x: '120', y: '12' });

		// +150px across at 1.5px/in is +100in: 120 -> 220, which is 108in from
		// the nearest snap candidate and so lands exactly where it was dragged.
		drag(m.one('[data-testid="maps-plan-shape"]'), [400, 200], [550, 200]);
		m.flush();

		expect(value(m, '-pos-x')).toBe('220');
		// THE ASSERTION THIS FILE EXISTS FOR. Not "roughly unchanged": the same
		// strings, because a drag has no path to these fields at all.
		expect(value(m, '-rect-w')).toBe(before.w);
		expect(value(m, '-rect-h')).toBe(before.h);
		expect(value(m, '-rot')).toBe(before.rot);
		await m.stop();
	});

	it('the same drag is not a no-op, which is what makes the four unchanged fields mean anything', async () => {
		// The positive control for the test above: if the pointer path were
		// broken, every dimension would also be unchanged and the assertion
		// would pass for the wrong reason.
		const { m } = openNode(FIX.workbench);
		const startX = value(m, '-pos-x');
		const startY = value(m, '-pos-y');
		drag(m.one('[data-testid="maps-plan-shape"]'), [400, 200], [550, 260]);
		m.flush();
		expect(value(m, '-pos-x')).not.toBe(startX);
		expect(value(m, '-pos-y')).not.toBe(startY);
		await m.stop();
	});

	it('snaps onto a sibling edge and SAYS which edge, in the typed value', async () => {
		const { m } = openNode(FIX.workbench);
		// Tool Chest A is 30 x 18 turned 90 degrees at (30, 12), so it occupies
		// x = 12 .. 30. Dragging the bench LEFT by 91.5in (-137.25px at
		// 1.5px/in) wants x = 28.5, which is 1.5in from putting the bench's own
		// leading edge on the chest's trailing edge at 30 -- inside the
		// 7px (4.67in) tolerance.
		drag(
			m.one('[data-testid="maps-plan-shape"]'),
			[400, 200],
			[400 - 91.5 * PX_PER_INCH, 200]
		);
		m.flush();
		expect(value(m, '-pos-x')).toBe('30');
		const note = m.one('[data-testid="maps-plan-snap-note"]').textContent ?? '';
		expect(note).toContain('leading edge onto the trailing edge of Tool Chest A');
		expect(note).toContain('X 30in');
		await m.stop();
	});

	it('reaches the same move from the keyboard, and still changes no dimension', async () => {
		const { m } = openNode(FIX.workbench);
		const shape = m.one('[data-testid="maps-plan-shape"]');
		shape.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		m.flush();
		// The default nudge step is one inch.
		expect(value(m, '-pos-x')).toBe('121');
		expect(value(m, '-rect-w')).toBe('72');
		shape.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		m.flush();
		expect(value(m, '-pos-y')).toBe('13');
		expect(value(m, '-rect-h')).toBe('30');
		await m.stop();
	});

	it('a key that is not a direction is left to the browser', async () => {
		// The negative control for the keydown handler: a handler that moved
		// the shape on every key would pass every assertion above.
		const { m } = openNode(FIX.workbench);
		m.one('[data-testid="maps-plan-shape"]').dispatchEvent(
			new KeyboardEvent('keydown', { key: 'a', bubbles: true })
		);
		m.flush();
		expect(value(m, '-pos-x')).toBe('120');
		await m.stop();
	});

	it('TYPING A DIMENSION MOVES THE DRAWING: the typed field is the source', async () => {
		const { m } = openNode(FIX.workbench);
		const shape = () => m.one('[data-testid="maps-plan-shape"]') as HTMLElement;
		const widthPx = () => shape().getAttribute('style')?.match(/width: ([\d.]+)px/)?.[1];
		expect(widthPx()).toBe(String(72 * PX_PER_INCH));
		const input = m.one('input[id$="-rect-w"]') as HTMLInputElement;
		input.value = '96';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		expect(widthPx()).toBe(String(96 * PX_PER_INCH));
		await m.stop();
	});

	it('offers no canvas where there is nothing to place against, and says why', async () => {
		// A compartment carries no plan geometry at all (the schema forbids it),
		// so the section is absent rather than empty.
		const { m } = openNode(FIX.drawer1);
		expect(m.all('[data-testid="maps-plan-canvas"]')).toHaveLength(0);
		await m.stop();

		// The positive control, and the stated-reason case in one: a top-level
		// building HAS the section and no shape in it, with the reason in words.
		const top = openNode(FIX.building);
		expect(top.m.all('[data-testid="maps-plan-canvas"]')).toHaveLength(1);
		expect(top.m.all('[data-testid="maps-plan-shape"]')).toHaveLength(0);
		expect(top.m.one('[data-testid="maps-plan-reason"]').textContent).toContain(
			'no frame to be placed in'
		);
		await top.m.stop();
	});
});
