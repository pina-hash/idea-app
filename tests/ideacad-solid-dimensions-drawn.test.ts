// tests/ideacad-solid-dimensions-drawn.test.ts
//
// A SHAPE DRAWN WITH A TOP-LEVEL TOOL ARRIVES WITH ITS SIZE AS A NUMBER TO
// TYPE: `dimensions/drawn.ts` (ledger 0296, friction F024).
//
// WHY THESE ARE AUTOMATED: each regression is silent on screen.
//   * A dimension added at a value other than what was drawn MOVES the shape
//     the moment the solver runs, one replay after the student let go.
//   * A set of added relations that over-defines the draft turns the sketch
//     'unsatisfied', which a student sees only as a later extrude refusing.
//   * A polygon whose added relations do not keep it regular distorts when its
//     size is retyped, which looks like a solver bug and is not one.
// So every draft is put through the REAL kernel's 2D solver (`solveSketch`)
// before and after a retyped value, and judged by an area worked out by hand.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createKernel } from '../src/lib/ideacad/kernel/remus';
import { drawnShapeDimensions, regularPolygon, withDrivingSize } from '../src/lib/ideacad/solid/dimensions/drawn';
import { sketchDimensions } from '../src/lib/ideacad/solid/dimensions/model';
import { arcEntities, circleEntities, polygonEntities, polylineEntities, rectangleEntities } from '../src/lib/ideacad/solid/sketch/editor';
import { regions, solveSketch } from '../src/lib/ideacad/solid/sketch/model';
import type { SketchConstraint, SketchEntity } from '../src/lib/ideacad/solid/types';

const WASM = new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'));
let n = 0;
const ids = () => `t${n++}`;
type Doc = { entities: SketchEntity[]; constraints: SketchConstraint[] };
/** Retype one numbered dimension exactly as the panel and the overlay do: through `sketchDimensions`' own patch. */
const retype = (doc: Doc, index: number, value: number): Doc => ({ ...doc, constraints: sketchDimensions({ feature: 's', constraints: doc.constraints })[index].patch(value).constraints as SketchConstraint[] });

describe('what is added', () => {
	it('a rectangle gets its width and its height, at what was drawn, and nothing else', () => {
		const draft = rectangleEntities([0, 0], [4, 3]), added = drawnShapeDimensions(draft, ids);
		expect(added.entities).toEqual([]);
		expect(added.constraints.map((c) => [c.type, 'value' in c ? c.value : null])).toEqual([['distance', 4], ['distance', 3]]);
		const dims = sketchDimensions({ feature: 's', constraints: [...draft.constraints, ...added.constraints] });
		expect(dims.map((d) => d.label)).toEqual(['Distance 1', 'Distance 2']);
	});
	it('a circle gets its radius, an arc its radius and not its chord', () => {
		const circle = drawnShapeDimensions(circleEntities([1, 1], 0.75), ids);
		expect(circle.constraints).toEqual([expect.objectContaining({ type: 'circleRadius', value: 0.75 })]);
		const arc = drawnShapeDimensions(arcEntities([0, 0], [2, 0], [0, 2]), ids);
		expect(arc.constraints.map((c) => c.type)).toEqual(['arcRadius']);
		expect((arc.constraints[0] as { value: number }).value).toBeCloseTo(2, 12);
	});
	it('a regular polygon gets a construction circle through its corners and one radius, sides held equal', () => {
		const draft = polygonEntities([0, 0], [1, 0], 6), added = drawnShapeDimensions(draft, ids);
		expect(added.entities.map((e) => [e.type, e.construction])).toEqual([['point', true], ['circle', true]]);
		const types = added.constraints.map((c) => c.type);
		expect(types.filter((t) => t === 'pointOnCircle')).toHaveLength(6);
		expect(types.filter((t) => t === 'equalLength')).toHaveLength(5);
		expect(types.filter((t) => t === 'circleRadius')).toHaveLength(1);
		expect(sketchDimensions({ feature: 's', constraints: [...draft.constraints, ...added.constraints] })).toHaveLength(1);
	});
	it('a drawn polyline gets a length on every side', () => {
		const draft = polylineEntities([[0, 0], [3, 0], [3, 1], [1, 2]]), added = drawnShapeDimensions(draft, ids);
		expect(added.constraints).toHaveLength(4);
		expect(added.constraints.every((c) => c.type === 'distance')).toBe(true);
	});
	it('nothing is added twice: a draft it already ran on gets nothing more', () => {
		for (const draft of [rectangleEntities([0, 0], [2, 1]), circleEntities([0, 0], 1), arcEntities([0, 0], [1, 0], [0, 1]), polylineEntities([[0, 0], [2, 0], [1, 1]])]) {
			const once = withDrivingSize(draft, ids);
			expect(drawnShapeDimensions(once, ids).constraints).toEqual([]);
		}
	});
	it('a two-point line, which the drawing tool closes back on itself, gets one length, not two', () => {
		expect(drawnShapeDimensions(polylineEntities([[0, 0], [2, 0]]), ids).constraints).toHaveLength(1);
	});
	it('regularPolygon refuses a loop that merely closes', () => {
		const draft = polylineEntities([[0, 0], [3, 0], [3, 1]]);
		const at = (id: string) => { const p = draft.entities.find((e) => e.id === id); return p && p.type === 'point' ? [p.x, p.y] as [number, number] : null; };
		expect(regularPolygon(draft.entities.filter((e) => e.type === 'line') as never, at)).toBeNull();
	});
});

describe('through the real solver', () => {
	it('a sized rectangle solves where it was drawn, and a retyped width makes the region that wide', async () => {
		const k = await createKernel(WASM);
		try {
			const doc = withDrivingSize(rectangleEntities([0, 0], [4, 3]), ids);
			const before = solveSketch(k, doc);
			expect(before.report.classification).not.toBe('unsatisfied');
			expect(before.report.converged).toBe(true);
			expect(regions(before.entities)[0].area).toBeCloseTo(12, 6);
			const wider = solveSketch(k, retype(doc, 0, 6));
			expect(wider.report.converged).toBe(true);
			expect(regions(wider.entities)[0].area).toBeCloseTo(18, 4);
		} finally { k.free(); }
	});
	it('a sized circle retyped to a new radius has the area of the new circle', async () => {
		const k = await createKernel(WASM);
		try {
			const doc = withDrivingSize(circleEntities([0, 0], 1), ids);
			const after = solveSketch(k, retype(doc, 0, 2));
			expect(after.report.converged).toBe(true);
			const circle = after.entities.find((e) => e.type === 'circle');
			expect(circle && circle.type === 'circle' && circle.radius).toBeCloseTo(2, 6);
		} finally { k.free(); }
	});
	it('a sized hexagon retyped stays regular: its area is the regular hexagon\'s', async () => {
		const k = await createKernel(WASM);
		try {
			const doc = withDrivingSize(polygonEntities([0, 0], [1, 0], 6), ids);
			const before = solveSketch(k, doc);
			expect(before.report.classification).not.toBe('unsatisfied');
			/* A regular hexagon of circumradius r has area 3√3/2 r². */
			expect(regions(before.entities)[0].area).toBeCloseTo(1.5 * Math.sqrt(3), 5);
			const after = solveSketch(k, retype(doc, 0, 2));
			expect(after.report.converged).toBe(true);
			expect(regions(after.entities)[0].area).toBeCloseTo(1.5 * Math.sqrt(3) * 4, 3);
		} finally { k.free(); }
	});
	it('a sized triangle drawn with the line tool solves where it was drawn', async () => {
		const k = await createKernel(WASM);
		try {
			const doc = withDrivingSize(polylineEntities([[0, 0], [3, 0], [0, 4]]), ids);
			const solved = solveSketch(k, doc);
			expect(solved.report.classification).not.toBe('unsatisfied');
			expect(Math.abs(regions(solved.entities)[0].area)).toBeCloseTo(6, 5);
		} finally { k.free(); }
	});
});
