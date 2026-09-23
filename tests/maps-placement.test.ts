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
	mapsNodeContent,
	mapsOuterCorners,
	mapsOuterFootprint,
	mapsPlaceShape,
	mapsPlacedBox,
	mapsResolveWallThickness,
	mapsShapeCorners,
	mapsSnapTargets,
	mapsStackTotals,
	mapsThicknessChain,
	mapsThicknessReady,
	mapsWallThicknessOk,
	type MapsEditorData,
	type MapsElevationDraft,
	type MapsNode,
	type MapsOutline,
	type MapsSnapTarget
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
		expect(targets.map((t) => t.label)).toEqual([
			'the inside face of the room walls',
			'Workbench B'
		]);
		// 0224: the parent is offered by its INNER face and a sibling by its
		// OUTER face, and with no thickness set anywhere the outer face IS the
		// inner face -- which is why both boxes below are unchanged from what
		// this test asserted before 0224.
		expect(targets.map((t) => t.face)).toEqual(['inner', 'outer']);
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
		expect(labels).toEqual(['the inside face of the building walls', 'Machine Shop']);
	});
});

describe('placement: a drag positions, and says what it landed on', () => {
	/* Tool Chest A as the fixture holds it: 30 x 18 turned 90 degrees, so its
	   box runs from (position - 18) to position across, and position to
	   (position + 30) down. */
	const footprint = { minX: -18, minY: 0, maxX: 0, maxY: 30 };
	const targets: MapsSnapTarget[] = [
		{
			label: 'the inside face of the room walls',
			box: { minX: 0, minY: 0, maxX: 400, maxY: 300 },
			face: 'inner'
		},
		{ label: 'Workbench B', box: { minX: 120, minY: 12, maxX: 192, maxY: 42 }, face: 'outer' }
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
		expect(result.snapX).toBe(
			'leading edge onto the leading edge of the inside face of the room walls'
		);
		expect(result.y).toBe(0);
		expect(result.snapY).toBe(
			'leading edge onto the leading edge of the inside face of the room walls'
		);
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

// ---------------------------------------------------------------------------
// WALL THICKNESS -- decision 36, migration 0224.
//
// WHERE THE EXPECTED VALUES COME FROM. Every figure below is the geometry done
// by hand from the decision's one sentence -- the typed outline is the
// INTERIOR face, so a wall of t lies outward from it -- and not read off the
// implementation. A 240 x 180 room with a 6 inch wall has an interior of
// 240 x 180 (unchanged, which is the promise) and an exterior of 252 x 192
// starting at (-6, -6). The polygon miter is checked against the RECT branch
// on a rectangle-shaped polygon, which is an oracle the polygon code cannot
// produce for itself.
// ---------------------------------------------------------------------------

describe('the thickness mirror of _maps_wall_thickness_ok', () => {
	it('accepts null and every real non-negative number', () => {
		expect(mapsWallThicknessOk(null)).toBe(true);
		expect(mapsWallThicknessOk(0)).toBe(true);
		expect(mapsWallThicknessOk(5.5)).toBe(true);
		expect(mapsWallThicknessOk(1200)).toBe(true);
	});

	it('refuses the three values a plain >= 0 check gets wrong in one language or the other', () => {
		// -1 both languages agree on. NaN is refused by JavaScript's ordering
		// and by SQL's explicit clause; Infinity passes `>= 0` in BOTH, which
		// is the one this mirror would have got wrong if it had been written
		// as `>= 0` on either side.
		expect(mapsWallThicknessOk(-1)).toBe(false);
		expect(mapsWallThicknessOk(Number.NaN)).toBe(false);
		expect(mapsWallThicknessOk(Number.POSITIVE_INFINITY)).toBe(false);
		expect(mapsWallThicknessOk(Number.NEGATIVE_INFINITY)).toBe(false);
	});

	it('refuses undefined, which is a ladder rung and not a value', () => {
		// A pre-0224 select leaves the column undefined. That is "this
		// deployment cannot answer", which `mapsThicknessReady` reports; a
		// validator that accepted it would be looser than the SQL it mirrors.
		expect(mapsWallThicknessOk(undefined)).toBe(false);
		expect(mapsWallThicknessOk('5')).toBe(false);
	});
});

describe('resolution: own value, then the nearest ancestor default, then nothing', () => {
	const content = (own: number | null, def: number | null) =>
		mapsNodeContent({ wall_thickness_in: own, default_wall_thickness_in: def });

	it('prefers the node\'s own value over every default above it', () => {
		const chain = [content(3, null), content(99, 6), content(null, 12)];
		expect(mapsResolveWallThickness(chain)).toEqual({ thickness: 3, source: 'own' });
	});

	it('takes the NEAREST ancestor default, not the outermost', () => {
		// The building says 12 and the room the unit sits in says 6. A unit
		// with no value of its own gets 6: the closest answer wins, which is
		// what "a building-level default" means once there is more than one
		// level able to state one.
		const chain = [content(null, null), content(null, 6), content(null, 12)];
		expect(mapsResolveWallThickness(chain)).toEqual({ thickness: 6, source: 'inherited' });
	});

	it('stops the walk at a ZERO, which is why zero is not null', () => {
		// 0224's column comment: zero is an answer somebody gave and means a
		// drawn line. A room given zero inside a building whose default is 6
		// draws a line -- it does not inherit the six.
		const chain = [content(0, null), content(null, 6)];
		expect(mapsResolveWallThickness(chain)).toEqual({ thickness: 0, source: 'own' });
	});

	it('ignores the node\'s OWN default, which is for its descendants', () => {
		// The trap this pair exists for: a building carrying a 6 inch default
		// for its rooms does not thereby have a 6 inch exterior wall.
		expect(mapsResolveWallThickness([content(null, 6)])).toEqual({
			thickness: null,
			source: 'none'
		});
		// The positive control in the same read: give it its own wall and it
		// answers, so "none" above is not an empty function.
		expect(mapsResolveWallThickness([content(12, 6)])).toEqual({
			thickness: 12,
			source: 'own'
		});
	});

	it('answers nothing for an empty chain rather than throwing', () => {
		expect(mapsResolveWallThickness([])).toEqual({ thickness: null, source: 'none' });
	});

	it('walks the real fixture tree through mapsThicknessChain', () => {
		const data = fixture();
		const chain = mapsThicknessChain(data.nodes, FIX.toolChest, (n) => mapsNodeContent(n));
		// Tool Chest A -> Machine Shop -> IDEA Building: the containment chain,
		// nearest first, which is the order resolution reads it in.
		expect(chain.length).toBeGreaterThanOrEqual(3);
		// The fixture sets no thickness anywhere, so the whole tree resolves to
		// nothing -- which is exactly the pre-0224 world.
		expect(mapsResolveWallThickness(chain).thickness).toBeNull();
	});
});

describe('the outer face: a band lying OUTWARD from the typed outline', () => {
	const room = { kind: 'rect', w: 240, h: 180 } as const;

	it('leaves the inner face exactly where it was -- the whole promise of decision 36', () => {
		// The typed numbers are the INTERIOR, so adding a wall must not move
		// them. This is the first thing to prove and it is proven by the inner
		// helpers simply not taking a thickness at all.
		expect(mapsFootprint(room, null)).toEqual({ minX: 0, minY: 0, maxX: 240, maxY: 180 });
		expect(mapsShapeCorners(room, null)).toEqual([
			[0, 0],
			[240, 0],
			[240, 180],
			[0, 180]
		]);
	});

	it('grows a rect by t on every side: 240 x 180 interior is 252 x 192 exterior at 6in', () => {
		expect(mapsOuterFootprint(room, 6, null)).toEqual({
			minX: -6,
			minY: -6,
			maxX: 246,
			maxY: 186
		});
		const box = mapsOuterFootprint(room, 6, null);
		expect(box.maxX - box.minX).toBe(252);
		expect(box.maxY - box.minY).toBe(192);
	});

	it('returns the inner face itself for null and for zero', () => {
		// Not "a very similar box": the same answer, from the same function,
		// so "no wall" cannot become a second arithmetic that drifts.
		expect(mapsOuterFootprint(room, null, null)).toEqual(mapsFootprint(room, null));
		expect(mapsOuterFootprint(room, 0, null)).toEqual(mapsFootprint(room, null));
		expect(mapsOuterCorners(room, null, 37)).toEqual(mapsShapeCorners(room, 37));
		expect(mapsOuterCorners(room, 0, 37)).toEqual(mapsShapeCorners(room, 37));
	});

	it('refuses to grow inward on a negative thickness', () => {
		// The constraint refuses one at the database; this is the renderer
		// declining to invent a shape if one ever arrives another way.
		expect(mapsOuterFootprint(room, -5, null)).toEqual(mapsFootprint(room, null));
	});

	it('rotates the outer face about the SAME origin as the inner face', () => {
		// A rect turned 90 degrees: (x,y) -> (-y,x). The outer face's corner
		// (-6,-6) therefore lands at (6,-6), and the box is the rect with its
		// sides exchanged, grown by 6 on each side: 192 across by 252 down.
		const box = mapsOuterFootprint(room, 6, 90);
		expect(box.maxX - box.minX).toBeCloseTo(192, 9);
		expect(box.maxY - box.minY).toBeCloseTo(252, 9);
		// And the two faces are concentric about the origin at every angle --
		// if they were rotated about different points the wall would be thicker
		// on one side than the other.
		const inner = mapsFootprint(room, 37);
		const outer = mapsOuterFootprint(room, 6, 37);
		expect((inner.minX + inner.maxX) / 2).toBeCloseTo((outer.minX + outer.maxX) / 2, 9);
		expect((inner.minY + inner.maxY) / 2).toBeCloseTo((outer.minY + outer.maxY) / 2, 9);
	});

	describe('the polygon miter', () => {
		// THE ORACLE: a rectangle written as a POLYGON must offset to the same
		// four points the rect branch produces by exact arithmetic. The two
		// paths exist because the rect case must stay float-exact; this is the
		// measurement that says they agree, which is the only thing that lets
		// two paths exist at all.
		const asPolygon: MapsOutline = {
			kind: 'polygon',
			points: [
				[0, 0],
				[240, 0],
				[240, 180],
				[0, 180]
			]
		};

		it('reduces exactly to the rect branch on a rectangle-shaped polygon', () => {
			const viaPolygon = mapsOuterCorners(asPolygon, 6, null);
			const viaRect = mapsOuterCorners(room, 6, null);
			expect(viaPolygon.length).toBe(4);
			for (let i = 0; i < 4; i += 1) {
				expect(viaPolygon[i][0]).toBeCloseTo(viaRect[i][0], 9);
				expect(viaPolygon[i][1]).toBeCloseTo(viaRect[i][1], 9);
			}
		});

		it('pushes OUTWARD whichever way the points were wound', () => {
			// A person typing a polygon into the shelf form has no idea they
			// are choosing a winding direction. Reversed, the shape is the same
			// room and the wall must still be on the outside of it -- so both
			// windings must give the same box, and it must be the BIGGER one.
			const reversed: MapsOutline = {
				kind: 'polygon',
				points: [...(asPolygon as { points: [number, number][] }).points].reverse()
			};
			const a = mapsOuterFootprint(asPolygon, 6, null);
			const b = mapsOuterFootprint(reversed, 6, null);
			expect(a.minX).toBeCloseTo(b.minX, 9);
			expect(a.maxX).toBeCloseTo(b.maxX, 9);
			expect(a.minY).toBeCloseTo(b.minY, 9);
			expect(a.maxY).toBeCloseTo(b.maxY, 9);
			// The positive control: it really did grow, in both windings.
			expect(a.minX).toBeCloseTo(-6, 9);
			expect(b.maxX).toBeCloseTo(246, 9);
		});

		it('miters an L-shaped room, with the concave corner pulled IN rather than pushed out', () => {
			// An L: the concave corner is the one at (120, 90). Its two walls
			// meet from the inside, so the outer face there moves toward the
			// room's interior diagonal, not away from it. Hand-derived: at a
			// 90 degree corner the miter reach is t * root 2 along the bisector,
			// so a corner at (120, 90) whose bisector points at (+1,+1)/root 2
			// lands at (126, 96).
			const ell: MapsOutline = {
				kind: 'polygon',
				points: [
					[0, 0],
					[240, 0],
					[240, 90],
					[120, 90],
					[120, 180],
					[0, 180]
				]
			};
			const out = mapsOuterCorners(ell, 6, null);
			expect(out.length).toBe(6);
			expect(out[0][0]).toBeCloseTo(-6, 9);
			expect(out[0][1]).toBeCloseTo(-6, 9);
			expect(out[1][0]).toBeCloseTo(246, 9);
			expect(out[1][1]).toBeCloseTo(-6, 9);
			// The concave vertex, which is the one worth measuring.
			expect(out[3][0]).toBeCloseTo(126, 9);
			expect(out[3][1]).toBeCloseTo(96, 9);
		});

		it('returns a degenerate shape unchanged rather than inventing a wall for it', () => {
			// Zero area (three collinear points) and a repeated point have no
			// inside for a wall to be outside of.
			const collinear: MapsOutline = {
				kind: 'polygon',
				points: [
					[0, 0],
					[10, 0],
					[20, 0]
				]
			};
			expect(mapsOuterCorners(collinear, 6, null)).toEqual(mapsShapeCorners(collinear, null));
			const repeated: MapsOutline = {
				kind: 'polygon',
				points: [
					[0, 0],
					[0, 0],
					[10, 10]
				]
			};
			expect(mapsOuterCorners(repeated, 6, null)).toEqual(mapsShapeCorners(repeated, null));
		});
	});
});

describe('snapping gains a face', () => {
	/** The fixture with one sibling given a real wall, everything else untouched. */
	const withWall = (id: string, own: number | null, def: number | null = null) => {
		const data = fixture();
		const node = data.nodes.find((n) => n.id === id);
		if (!node) throw new Error(`fixture has no node ${id}`);
		node.wall_thickness_in = own;
		node.default_wall_thickness_in = def;
		return data;
	};

	it('offers the parent by its INNER face, which is the outline as typed', () => {
		// Give the room a 9 inch wall and the box the parent offers must NOT
		// move: a toolbox against the wall sits against the plaster. This is
		// the assertion that says decision 36 was implemented and not just
		// described.
		const data = withWall(FIX.machineShop, 9);
		const targets = mapsSnapTargets(data, nodeIn(data, FIX.machineShop), FIX.toolChest);
		expect(targets[0].face).toBe('inner');
		expect(targets[0].box).toEqual({ minX: 0, minY: 0, maxX: 400, maxY: 300 });
	});

	it('offers a sibling by its OUTER face, grown by that sibling\'s own wall', () => {
		// Workbench B is 72 x 30 at (120, 12). With a 3 inch wall its outer
		// face runs (117, 9) to (195, 45).
		const data = withWall(FIX.workbench, 3);
		const targets = mapsSnapTargets(data, nodeIn(data, FIX.machineShop), FIX.toolChest);
		const bench = targets.find((t) => t.label.includes('Workbench B'));
		expect(bench?.face).toBe('outer');
		expect(bench?.box).toEqual({ minX: 117, minY: 9, maxX: 195, maxY: 45 });
		expect(bench?.label).toBe('the outside face of Workbench B');
	});

	it('grows a sibling by an INHERITED building default with no value of its own', () => {
		// The room carries a 4 inch default; the bench carries nothing. Its
		// outer face is the bench grown by 4: (116, 8) to (196, 46).
		const data = withWall(FIX.machineShop, null, 4);
		const targets = mapsSnapTargets(data, nodeIn(data, FIX.machineShop), FIX.toolChest);
		const bench = targets.find((t) => t.label.includes('Workbench B'));
		expect(bench?.box).toEqual({ minX: 116, minY: 8, maxX: 196, maxY: 46 });
		// And the parent's own face still did not move, on the same payload.
		expect(targets[0].box).toEqual({ minX: 0, minY: 0, maxX: 400, maxY: 300 });
	});

	it('is byte-for-byte the pre-0224 answer when nothing carries a thickness', () => {
		// The regression guard for the whole bundle: the fixture as it stands
		// has no wall anywhere, so every box must be what it was.
		const data = fixture();
		const targets = mapsSnapTargets(data, nodeIn(data, FIX.machineShop), FIX.toolChest);
		expect(targets.map((t) => t.box)).toEqual([
			{ minX: 0, minY: 0, maxX: 400, maxY: 300 },
			{ minX: 120, minY: 12, maxX: 192, maxY: 42 }
		]);
		// A sibling with no wall is named plainly, with no face in the words:
		// a label that said "the outside face of" where there is no wall would
		// be teaching a distinction the drawing does not show.
		expect(targets[1].label).toBe('Workbench B');
	});

	it('places the mover\'s OUTER face on the parent\'s INNER face', () => {
		// A 30 x 18 unit with a 2 inch wall, pushed into the room's top-left
		// corner. Its outer face runs (-2,-2) to (32,20) relative to the
		// origin, so putting that outer face on the wall at 0 puts the stored
		// position -- which is the INTERIOR origin -- at 2. The wall material
		// occupies 0 to 2 and the usable inside starts at 2.
		const unit = { kind: 'rect', w: 30, h: 18 } as const;
		const result = mapsPlaceShape({
			desiredX: 0.4,
			desiredY: 0.4,
			footprint: mapsOuterFootprint(unit, 2, null),
			targets: [
				{
					label: 'the inside face of the room walls',
					box: { minX: 0, minY: 0, maxX: 400, maxY: 300 },
					face: 'inner'
				}
			],
			toleranceIn: 5
		});
		expect(result.x).toBe(2);
		expect(result.y).toBe(2);
		// The control: the same drag with no wall puts the origin at 0, which
		// is exactly what it did before 0224.
		const bare = mapsPlaceShape({
			desiredX: 0.4,
			desiredY: 0.4,
			footprint: mapsOuterFootprint(unit, null, null),
			targets: [
				{
					label: 'the inside face of the room walls',
					box: { minX: 0, minY: 0, maxX: 400, maxY: 300 },
					face: 'inner'
				}
			],
			toleranceIn: 5
		});
		expect(bare.x).toBe(0);
		expect(bare.y).toBe(0);
	});
});

describe('the ladder capability', () => {
	it('is false unless a rung that NAMED the columns actually answered', () => {
		expect(mapsThicknessReady({})).toBe(false);
		expect(mapsThicknessReady({ thicknessReady: false })).toBe(false);
		expect(mapsThicknessReady({ thicknessReady: true })).toBe(true);
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
