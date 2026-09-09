// tests/maps-viewer-drawing.test.ts
//
// THE MAP PANE'S ARITHMETIC (prompt 0112): which drawing a position gets,
// how a zoom is clamped and anchored, and what the scale bar says. Pure
// functions over the harness fixture, so every claim here is assertable
// with no browser -- the browser pass measures what these produce on screen.

import { describe, expect, it } from 'vitest';
import {
	MAPS_ZOOM_MAX,
	mapsDrawing,
	mapsScaleBar,
	mapsSitePlanView,
	mapsZoomAbout,
	mapsZoomedBox,
	type MapsViewBox
} from '../src/lib/maps/viewer/viewer';
import { mapsViewerFixture, VFIX } from '../src/routes/dev/maps-viewer/fixture';

describe('what the map pane draws', () => {
	const data = mapsViewerFixture();

	it('draws a room as its own plan and a unit as its own elevation, with nothing marked here', () => {
		const room = mapsDrawing(data, VFIX.machineShop);
		expect(room.kind).toBe('plan');
		if (room.kind !== 'plan') return;
		expect(room.frame?.id).toBe(VFIX.machineShop);
		expect(room.hereId).toBeNull();
		expect(room.synthetic).toBe(false);

		const unit = mapsDrawing(data, VFIX.toolChest);
		expect(unit.kind).toBe('elevation');
		if (unit.kind !== 'elevation') return;
		expect(unit.unit.id).toBe(VFIX.toolChest);
		expect(unit.hereId).toBeNull();
	});

	it("draws a compartment on its unit's elevation with the compartment marked here", () => {
		const drawer = mapsDrawing(data, VFIX.drawer1);
		expect(drawer.kind).toBe('elevation');
		if (drawer.kind !== 'elevation') return;
		expect(drawer.unit.id).toBe(VFIX.toolChest);
		expect(drawer.hereId).toBe(VFIX.drawer1);
		expect(drawer.slots.map((s) => s.node.id)).toContain(VFIX.drawer1);
	});

	it("draws a unit with no compartments on its room's plan, marked here", () => {
		// The Bench Cabinet has no compartments and no plan geometry either: it
		// climbs to the Machine Shop, whose plan cannot draw it. The frame is
		// still the room's, and hereId still names the cabinet -- the caption
		// can say it is in here, undrawn, rather than the pane going blank.
		const cabinet = mapsDrawing(data, VFIX.benchCabinet);
		expect(cabinet.kind).toBe('plan');
		if (cabinet.kind !== 'plan') return;
		expect(cabinet.frame?.id).toBe(VFIX.machineShop);
		expect(cabinet.hereId).toBe(VFIX.benchCabinet);
		expect(cabinet.view.unplaced.map((n) => n.id)).toContain(VFIX.benchCabinet);
	});

	it('draws the single root as itself at the top of the map', () => {
		const top = mapsDrawing(data, null);
		expect(top.kind).toBe('plan');
		if (top.kind !== 'plan') return;
		expect(top.frame?.id).toBe(VFIX.building);
		expect(top.synthetic).toBe(false);
		expect(top.hereId).toBeNull();
	});

	it('lays several unplaced roots side by side, and says the layout is its own', () => {
		const two = mapsViewerFixture();
		two.nodes.push({
			...two.nodes.find((n) => n.id === VFIX.building)!,
			id: 'b0000000-0000-4000-8000-000000000999',
			name: 'Annex',
			outline: { kind: 'rect', w: 300, h: 300 }
		});
		const top = mapsDrawing(two, null);
		expect(top.kind).toBe('plan');
		if (top.kind !== 'plan') return;
		expect(top.synthetic).toBe(true);
		expect(top.frame).toBeNull();
		expect(top.view.shapes.map((s) => s.node.name)).toEqual(['Annex', 'IDEA Building']);
		// Side by side: the second starts after the first, with a gap.
		const [a, b] = top.view.shapes;
		expect(b.box.minX).toBeGreaterThan(a.box.maxX);
		// True sizes: the annex is 300 wide, the building 1200.
		expect(a.box.maxX - a.box.minX).toBe(300);
		expect(b.box.maxX - b.box.minX).toBe(1200);
		// And the site view is exactly what the drawing used.
		expect(mapsSitePlanView(two).frame).toEqual(top.view.frame);
	});

	it('answers none for an empty map, and the directory for an address it cannot find', () => {
		expect(mapsDrawing({ nodes: [], itemTypes: [], items: [], stock: [], photos: [] }, null).kind).toBe(
			'none'
		);
		const lost = mapsDrawing(data, 'b0000000-0000-4000-8000-00000000dead');
		expect(lost.kind).toBe('plan');
		if (lost.kind !== 'plan') return;
		expect(lost.frame?.id).toBe(VFIX.building);
		expect(lost.hereId).toBeNull();
	});
});

describe('zoom', () => {
	const base: MapsViewBox = { x: -8, y: -8, w: 416, h: 316 };

	it('is the whole frame at zoom 1 whatever the centre says', () => {
		expect(mapsZoomedBox(base, 1, 9999, -9999)).toEqual(base);
		expect(mapsZoomedBox(base, 0.2, 0, 0)).toEqual(base);
	});

	it('cannot be panned out of the frame', () => {
		const left = mapsZoomedBox(base, 2, -1000, -1000);
		expect(left.x).toBe(base.x);
		expect(left.y).toBe(base.y);
		const right = mapsZoomedBox(base, 2, 1000, 1000);
		expect(right.x + right.w).toBeCloseTo(base.x + base.w);
		expect(right.y + right.h).toBeCloseTo(base.y + base.h);
		expect(right.w).toBeCloseTo(base.w / 2);
	});

	it('stops at the maximum', () => {
		const deep = mapsZoomedBox(base, 1000, 100, 100);
		expect(deep.w).toBeCloseTo(base.w / MAPS_ZOOM_MAX);
	});

	it('keeps the point under the pointer where it is', () => {
		// Zooming about a point: the point's offset from the new centre is its
		// old offset scaled by the zoom ratio, so on screen it does not move.
		const before = { zoom: 1, cx: 200, cy: 150 };
		const after = mapsZoomAbout(before, 2, 50, 50);
		expect(after.zoom).toBe(2);
		// Before: the pointer was 150 left of centre at zoom 1. After, at zoom
		// 2, the same screen position is 75 left of centre.
		expect(50 - after.cx).toBeCloseTo(-75);
		expect(50 - after.cy).toBeCloseTo(-50);
		// Zooming back out about the same point returns to the start.
		const back = mapsZoomAbout(after, 0.5, 50, 50);
		expect(back.zoom).toBe(1);
		expect(back.cx).toBeCloseTo(200);
		expect(back.cy).toBeCloseTo(150);
	});
});

describe('the scale bar', () => {
	it('picks the longest round length that fits, in feet once it is whole feet', () => {
		// 2.5px per inch: 60in is 150px and fits 160; 120in would be 300.
		expect(mapsScaleBar(2.5)).toEqual({ inches: 60, px: 150, label: '5 ft' });
		// 0.5px per inch: 240in is 120px.
		expect(mapsScaleBar(0.5)).toEqual({ inches: 240, px: 120, label: '20 ft' });
		// 20px per inch: 6in is 120px, 12in would be 240.
		expect(mapsScaleBar(20)).toEqual({ inches: 6, px: 120, label: '6 in' });
	});

	it('answers null when the drawing is too small to put a bar on, or the scale is nonsense', () => {
		expect(mapsScaleBar(0)).toBeNull();
		expect(mapsScaleBar(-1)).toBeNull();
		expect(mapsScaleBar(Number.NaN)).toBeNull();
		// 0.001px per inch: even 2400in is 2.4px.
		expect(mapsScaleBar(0.001)).toBeNull();
	});
});
