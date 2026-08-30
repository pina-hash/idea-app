// tests/maps-placement.test.ts
//
// THE ARITHMETIC BEHIND THE TWO PLACEMENT SURFACES: the plan canvas's
// footprint and snapping, and the elevation editor's stack, ordering and save
// decision. Pure functions from `$lib/maps/maps`, driven over the REAL harness
// fixture the editor itself mounts.
//
// WHERE THE EXPECTED VALUES COME FROM, which is the question that decides
// whether a test is worth anything: every number below is derived from the
// GEOMETRY by hand and written down here, never read off the implementation.
// The rotated footprints are checked against a closed form (a rect turned 45
// degrees has an axis-aligned box of side (w+h)/root 2, and turned 90 it is the
// rect with its sides exchanged); the snap values are computed from the
// fixture's own inch numbers; the reorder oracle is the property the feature
// exists for, which is that a height RIDES WITH its compartment.
//
// This is `node` project work on purpose: it is arithmetic, and the mount that
// proves a POINTER cannot reach a dimension is `tests/dom/`'s, which needs a
// DOM and real events.

import { describe, expect, it } from 'vitest';
import {
	mapsElevationStack,
	mapsElevationWrites,
	mapsFootprint,
	mapsMoveSlot,
	mapsPlaceShape,
	mapsPlacedBox,
	mapsShapeCorners,
	mapsSnapTargets,
	mapsStackTotals,
	type MapsEditorData,
	type MapsElevationDraft,
	type MapsNode
} from '../src/lib/maps/maps';
import { FIX, mapsEditFixture } from '../src/routes/dev/maps-edit/fixture';

const fixture = (): MapsEditorData => mapsEditFixture();
const nodeIn = (data: MapsEditorData, id: string): MapsNode => {
	const found = data.nodes.find((n) => n.id === id);
	if (!found) throw new Error(`fixture has no node ${id}`);
	return found;
};

describe('footprint: the box a placed shape occupies, rotation included', () => {
	it('is the rectangle itself at no rotation', () => {
		expect(mapsFootprint({ kind: 'rect', w: 30, h: 18 }, null)).toEqual({
			minX: 0,
			minY: 0,
			maxX: 30,
			maxY: 18
		});
	});

	it('exchanges the sides at 90 degrees, about the position origin', () => {
		// Rotation is about the shape's own origin corner, so a 30x18 turned
		// 90 degrees runs 18in BACK from its position and 30in down from it.
		const box = mapsFootprint({ kind: 'rect', w: 30, h: 18 }, 90);
		expect(box.minX).toBeCloseTo(-18, 9);
		expect(box.maxX).toBeCloseTo(0, 9);
		expect(box.minY).toBeCloseTo(0, 9);
		expect(box.maxY).toBeCloseTo(30, 9);
	});

	it('matches the closed form at 45 degrees: a square of side (w + h) / root 2', () => {
		const box = mapsFootprint({ kind: 'rect', w: 30, h: 18 }, 45);
		const side = (30 + 18) / Math.SQRT2; // 33.9411...
		expect(box.maxX - box.minX).toBeCloseTo(side, 9);
		expect(box.maxY - box.minY).toBeCloseTo(side, 9);
		// And the corner that leads: -h sin45 back from the origin.
		expect(box.minX).toBeCloseTo(-18 / Math.SQRT2, 9);
		expect(box.minY).toBeCloseTo(0, 9);
	});

	it('reads a polygon from its own points, and DRAWS the same points it MEASURES', () => {
		const outline = {
			kind: 'polygon' as const,
			points: [
				[0, 0],
				[120, 0],
				[120, 96],
				[40, 96]
			] as [number, number][]
		};
		expect(mapsFootprint(outline, null)).toEqual({ minX: 0, minY: 0, maxX: 120, maxY: 96 });
		// The canvas draws mapsShapeCorners and snaps against mapsFootprint:
		// one has to be the extremes of the other, or a shape snaps somewhere
		// other than where it looks.
		const corners = mapsShapeCorners(outline, 30);
		const box = mapsFootprint(outline, 30);
		expect(Math.min(...corners.map((c) => c[0]))).toBeCloseTo(box.minX, 9);
		expect(Math.max(...corners.map((c) => c[0]))).toBeCloseTo(box.maxX, 9);
		expect(Math.min(...corners.map((c) => c[1]))).toBeCloseTo(box.minY, 9);
		expect(Math.max(...corners.map((c) => c[1]))).toBeCloseTo(box.maxY, 9);
	});

	it('has no box for a shape that is not placed, and does not invent the origin', () => {
		expect(
			mapsPlacedBox({
				outline: { kind: 'rect', w: 10, h: 10 },
				position_x_in: null,
				position_y_in: null,
				rotation_deg: null
			})
		).toBeNull();
		expect(
			mapsPlacedBox({ outline: null, position_x_in: 4, position_y_in: 4, rotation_deg: null })
		).toBeNull();
	});
});

describe('snap targets: the walls, then every sibling that is actually placed', () => {
	it('offers the room walls and the one placed sibling, self excluded', () => {
		const data = fixture();
		const targets = mapsSnapTargets(data, nodeIn(data, FIX.machineShop), FIX.toolChest);
		expect(targets.map((t) => t.label)).toEqual(['the room walls', 'Workbench B']);
		// Machine Shop is 400 x 300 in its own frame.
		expect(targets[0].box).toEqual({ minX: 0, minY: 0, maxX: 400, maxY: 300 });
		// Workbench B: 72 x 30 at (120, 12), unrotated.
		expect(targets[1].box).toEqual({ minX: 120, minY: 12, maxX: 192, maxY: 42 });
	});

	it('drops an UNPLACED sibling rather than treating it as sitting at the origin', () => {
		const data = fixture();
		const targets = mapsSnapTargets(data, nodeIn(data, FIX.building), FIX.millRoom);
		const labels = targets.map((t) => t.label);
		// The absence: Prototype Lab is a draft room with no outline and no
		// position, so it has no edge to snap to.
		expect(labels).not.toContain('Prototype Lab');
		// The positive control, in the same read: a sibling that IS placed is
		// there, so an empty list would not pass this pair.
		expect(labels).toContain('Machine Shop');
		expect(labels).toEqual(['the building walls', 'Machine Shop']);
	});
});

describe('placement: a drag positions, and says what it landed on', () => {
	/* Tool Chest A as the fixture holds it: 30 x 18 turned 90 degrees, so its
	   box runs from (position - 18) to position across, and position to
	   (position + 30) down. */
	const footprint = { minX: -18, minY: 0, maxX: 0, maxY: 30 };
	const targets = [
		{ label: 'the room walls', box: { minX: 0, minY: 0, maxX: 400, maxY: 300 } },
		{ label: 'Workbench B', box: { minX: 120, minY: 12, maxX: 192, maxY: 42 } }
	];

	it('snaps the trailing edge onto a sibling edge and names both', () => {
		// Desired X 118 is 2in short of putting the chest's own trailing edge
		// (its box max, which sits AT the position) on Workbench B's leading
		// edge at 120. Desired Y 12 is already on the bench's top edge.
		const result = mapsPlaceShape({
			desiredX: 118,
			desiredY: 12,
			footprint,
			targets,
			toleranceIn: 5
		});
		expect(result.x).toBe(120);
		expect(result.y).toBe(12);
		expect(result.snapX).toBe('trailing edge onto the leading edge of Workbench B');
		expect(result.snapY).toBe('leading edge onto the leading edge of Workbench B');
	});

	it('snaps to a wall, and a wall wins a tie with a sibling', () => {
		// Desired X 17.4: the chest's leading edge (position - 18) lands on the
		// west wall at 0 when the position is 18.
		const result = mapsPlaceShape({
			desiredX: 17.4,
			desiredY: 0.3,
			footprint,
			targets,
			toleranceIn: 5
		});
		expect(result.x).toBe(18);
		expect(result.snapX).toBe('leading edge onto the leading edge of the room walls');
		expect(result.y).toBe(0);
		expect(result.snapY).toBe('leading edge onto the leading edge of the room walls');
	});

	it('leaves a value alone when nothing is near enough, and SAYS nothing snapped', () => {
		// 200.456 is 9.5in from the nearest candidate (leading edge onto the
		// bench's trailing edge at 192 puts the position at 210).
		const result = mapsPlaceShape({
			desiredX: 200.456,
			desiredY: 150.5,
			footprint,
			targets,
			toleranceIn: 5
		});
		expect(result.x).toBe(200.46);
		expect(result.y).toBe(150.5);
		expect(result.snapX).toBeNull();
		expect(result.snapY).toBeNull();
	});

	it('is a pure function of position: nothing it returns can change a dimension', () => {
		const result = mapsPlaceShape({
			desiredX: 118,
			desiredY: 12,
			footprint,
			targets,
			toleranceIn: 5
		});
		// The STRUCTURAL half of the typed-value-wins rule: the answer a drag
		// produces carries an x, a y and two sentences, and there is no width,
		// height, outline or rotation in it to overwrite anything with.
		expect(Object.keys(result).sort()).toEqual(['snapX', 'snapY', 'x', 'y']);
	});

	it('honours the tolerance in inches, so the same drag snaps or does not by scale alone', () => {
		const near = { desiredX: 114, desiredY: 200, footprint, targets };
		expect(mapsPlaceShape({ ...near, toleranceIn: 7 }).x).toBe(120);
		expect(mapsPlaceShape({ ...near, toleranceIn: 5 }).x).toBe(114);
		expect(mapsPlaceShape({ ...near, toleranceIn: 5 }).snapX).toBeNull();
	});
});

describe('the elevation stack: order, totals and what a reorder writes', () => {
	it('reads the unit\'s compartments top first, with their typed inches', () => {
		const data = fixture();
		const stack = mapsElevationStack(data, FIX.toolChest);
		expect(stack.map((s) => [s.name, s.order, s.heightIn, s.widthIn])).toEqual([
			['Drawer 1', 1, 3, 28],
			['Drawer 2', 2, 5, 28]
		]);
	});

	it('reads a PENDING edit rather than the live row, which is the whole model', () => {
		const data = fixture();
		data.pending.push({
			id: 'pending-drawer-1',
			node_id: FIX.drawer1,
			item_type_id: null,
			item_id: null,
			stock_id: null,
			snapshot: { ...nodeIn(data, FIX.drawer1), name: 'Drawer 1 (deepened)', elevation_h_in: 9 },
			created_at: '2026-08-20T12:00:00Z'
		});
		const stack = mapsElevationStack(data, FIX.toolChest);
		expect(stack[0].heightIn).toBe(9);
		expect(stack[0].name).toBe('Drawer 1 (deepened)');
		expect(stack[0].pending).not.toBeNull();
		// The positive control: the untouched sibling still reads its live row.
		expect(stack[1].heightIn).toBe(5);
		expect(stack[1].pending).toBeNull();
	});

	it('sorts an unplaced compartment to the bottom instead of dropping it', () => {
		const data = fixture();
		data.nodes.push({
			...nodeIn(data, FIX.drawer1),
			id: 'node-drawer-unplaced',
			name: 'Bottom bin',
			elevation_order: null,
			elevation_h_in: null,
			elevation_w_in: null
		});
		const stack = mapsElevationStack(data, FIX.toolChest);
		expect(stack.map((s) => s.name)).toEqual(['Drawer 1', 'Drawer 2', 'Bottom bin']);
	});

	it('totals only what has been typed, and REPORTS what has not', () => {
		const data = fixture();
		expect(mapsStackTotals(mapsElevationStack(data, FIX.toolChest))).toEqual({
			totalIn: 8, // 3 + 5
			unsized: 0,
			widestIn: 28
		});
		data.nodes.push({
			...nodeIn(data, FIX.drawer1),
			id: 'node-drawer-unplaced',
			name: 'Bottom bin',
			elevation_order: 3,
			elevation_h_in: null,
			elevation_w_in: null
		});
		// A compartment with no height is not a zero-height compartment: the
		// total stays 8 and the missing one is counted out loud.
		expect(mapsStackTotals(mapsElevationStack(data, FIX.toolChest))).toEqual({
			totalIn: 8,
			unsized: 1,
			widestIn: 28
		});
	});

	it('clamps a move at both ends rather than renumbering backwards', () => {
		expect(mapsMoveSlot(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
		expect(mapsMoveSlot(['a', 'b', 'c'], 2, 3)).toEqual(['a', 'b', 'c']);
		expect(mapsMoveSlot(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
		expect(mapsMoveSlot(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
	});
});

describe('what a reorder writes: the heights ride with their compartments', () => {
	const draftOf = (data: MapsEditorData): MapsElevationDraft[] =>
		mapsElevationStack(data, FIX.toolChest).map((s) => ({
			id: s.node.id,
			name: s.name,
			heightIn: s.heightIn,
			widthIn: s.widthIn
		}));

	it('writes nothing at all when nothing moved', () => {
		const data = fixture();
		const stack = mapsElevationStack(data, FIX.toolChest);
		expect(mapsElevationWrites(stack, draftOf(data))).toEqual([]);
	});

	it('swaps the two orders and CARRIES each typed height, retyping neither', () => {
		const data = fixture();
		const stack = mapsElevationStack(data, FIX.toolChest);
		const moved = mapsMoveSlot(draftOf(data), 1, 0); // Drawer 2 to the top
		const writes = mapsElevationWrites(stack, moved);
		expect(
			writes.map((w) => [
				w.name,
				w.content.elevation_order,
				w.content.elevation_h_in,
				w.content.elevation_w_in
			])
		).toEqual([
			// Drawer 2 keeps its 5in depth and becomes slot 1; Drawer 1 keeps
			// its 3in and becomes slot 2. THIS IS THE FEATURE: a reorder that
			// made somebody retype a height would produce the other answer.
			['Drawer 2', 1, 5, 28],
			['Drawer 1', 2, 3, 28]
		]);
	});

	it('carries every other content column through untouched', () => {
		const data = fixture();
		const stack = mapsElevationStack(data, FIX.toolChest);
		const moved = mapsMoveSlot(draftOf(data), 1, 0);
		const drawer2 = mapsElevationWrites(stack, moved).find((w) => w.name === 'Drawer 2');
		// maps_publish promotes a snapshot wholesale, so a write that dropped
		// the subtype or the parent would publish a compartment with neither.
		expect(drawer2?.content.subtype).toBe('drawer');
		expect(drawer2?.content.parent_id).toBe(FIX.toolChest);
		expect(drawer2?.content.kind).toBe('compartment');
		// And a compartment carries no plan geometry, which the write must
		// keep true rather than quietly inventing a position.
		expect(drawer2?.content.outline).toBeNull();
		expect(drawer2?.content.position_x_in).toBeNull();
	});

	it('writes ONE row for a rename, not the whole stack', () => {
		const data = fixture();
		const stack = mapsElevationStack(data, FIX.toolChest);
		const draft = draftOf(data);
		draft[0] = { ...draft[0], name: 'Drawer One' };
		const writes = mapsElevationWrites(stack, draft);
		expect(writes.map((w) => w.name)).toEqual(['Drawer One']);
	});

	it('records a cleared height as null rather than as zero', () => {
		const data = fixture();
		const stack = mapsElevationStack(data, FIX.toolChest);
		const draft = draftOf(data);
		draft[1] = { ...draft[1], heightIn: null };
		const writes = mapsElevationWrites(stack, draft);
		expect(writes).toHaveLength(1);
		expect(writes[0].content.elevation_h_in).toBeNull();
	});
});
