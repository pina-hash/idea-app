// tests/ideacad-solid-sketching-layer.test.ts
//
// THE EDITING LOOK AND THE DRAWING TOOLS. `editingGuides` is what the panel
// hands to `api.guide`; it is counted here in both directions -- a marker per
// point, a glyph per constraint, an emphasis only for what is selected or
// hovered, a snap marker only when there is a snap. `constraintGlyph` is
// asserted EXHAUSTIVE over the constraint union, so a kind added to the type
// without a glyph reddens here rather than drawing nothing in the viewport.
// The DrawingTool is driven with a stub host and must emit through
// `host.draft` and never `host.finish`, with the polygon side count read
// from the module setting the panel writes.
import { describe, expect, it } from 'vitest';
import type { SketchConstraint, SketchEntity, Vec3 } from '../src/lib/ideacad/solid/types';
import { editingGuides, constraintGlyph, constraintGlyphs, snapStrokes, sketchObjects, GLYPH_COLOUR, POINT_COLOUR, SELECTED_COLOUR, HOVER_COLOUR, SNAP_COLOUR, PREVIEW_COLOUR } from '../src/lib/ideacad/solid/viewport/sketch-layer';
import { DrawingTool, drawingSettings, polygonSidesOk, POLYGON_SIDES_REFUSAL, type DrawingHost } from '../src/lib/ideacad/solid/viewport/drawing';
import { datumPlane } from '../src/lib/ideacad/solid/sketch/model';
import { rectangleEntities, SketchSession, type SketchDraft } from '../src/lib/ideacad/solid/sketch/editor';

const plane = datumPlane('XY');
const rect = (): SketchDraft => rectangleEntities([0, 0], [4, 3]);
const point = (id: string, x: number, y: number): SketchEntity => ({ id, type: 'point', x, y });
/** One fixture carrying every constraint kind once. */
const everything: { entities: SketchEntity[]; constraints: SketchConstraint[] } = {
	entities: [point('a', 0, 0), point('b', 4, 0), point('c', 4, 3), point('d', 0, 3), point('o', 6, 1), point('s', 7, 1), point('t', 5, 1), point('q', 6, 3), point('m', 2, 0),
		{ id: 'l0', type: 'line', a: 'a', b: 'b' }, { id: 'l1', type: 'line', a: 'b', b: 'c' }, { id: 'l2', type: 'line', a: 'c', b: 'd' }, { id: 'k', type: 'circle', center: 'o', radius: 1 }, { id: 'u', type: 'arc', center: 'o', start: 's', end: 't' }, { id: 'k2', type: 'circle', center: 'q', radius: 0.5 }],
	constraints: [
		{ id: 'c1', type: 'coincident', a: 'a', b: 'm' }, { id: 'c2', type: 'distance', a: 'a', b: 'b', value: 4 }, { id: 'c3', type: 'pointLineDistance', point: 'q', line: 'l0', value: 3 }, { id: 'c4', type: 'horizontal', line: 'l0' }, { id: 'c5', type: 'vertical', line: 'l1' },
		{ id: 'c6', type: 'angle', l1: 'l0', l2: 'l1', value: 90 }, { id: 'c7', type: 'parallel', l1: 'l0', l2: 'l2' }, { id: 'c8', type: 'perpendicular', l1: 'l0', l2: 'l1' }, { id: 'c9', type: 'equalLength', l1: 'l0', l2: 'l2' }, { id: 'c10', type: 'circleRadius', circle: 'k', value: 1 },
		{ id: 'c11', type: 'arcRadius', arc: 'u', value: 1 }, { id: 'c12', type: 'equalRadius', a: 'k', b: 'k2' }, { id: 'c13', type: 'pointOnCircle', point: 's', circle: 'k' }, { id: 'c14', type: 'pointOnArc', point: 's', arc: 'u' }, { id: 'c15', type: 'tangentLineArc', line: 'l1', arc: 'u', point: 's' },
		{ id: 'c16', type: 'tangentArcArc', arc1: 'u', arc2: 'u', point: 's' }, { id: 'c17', type: 'concentric', a: 'k', b: 'u' }, { id: 'c18', type: 'midpoint', point: 'm', line: 'l0' }, { id: 'c19', type: 'symmetric', a: 'a', b: 'b', axis: 'l1' }, { id: 'c20', type: 'fixX', point: 'a', value: 0 }, { id: 'c21', type: 'fixY', point: 'a', value: 0 }
	]
};
const KINDS: SketchConstraint['type'][] = ['coincident', 'distance', 'pointLineDistance', 'horizontal', 'vertical', 'angle', 'parallel', 'perpendicular', 'equalLength', 'circleRadius', 'arcRadius', 'equalRadius', 'pointOnCircle', 'pointOnArc', 'tangentLineArc', 'tangentArcArc', 'concentric', 'midpoint', 'symmetric', 'fixX', 'fixY'];

describe('the editing look', () => {
	it('draws a marker on every point, a glyph per constraint, and nothing more when nothing is selected, hovered or previewed', () => {
		const s = rect();
		const guides = editingGuides({ plane, ...s }, { selected: [], hovered: null, size: 0.1 });
		expect(guides.filter((g) => g.color === POINT_COLOUR)).toHaveLength(4);
		/* An H is three strokes, a V one: two of each on a rectangle. */
		expect(guides.filter((g) => g.color === GLYPH_COLOUR)).toHaveLength(2 * 3 + 2 * 1);
		expect(guides.filter((g) => g.color === SELECTED_COLOUR || g.color === HOVER_COLOUR || g.color === SNAP_COLOUR || g.color === PREVIEW_COLOUR)).toHaveLength(0);
		for (const g of guides) for (const p of g.points) expect(p[2]).toBe(0);
	});
	it('the selected entity and the hovered entity each get one emphasis, a selected point a larger marker, and a snap its marker', () => {
		const s = rect(), l0 = s.entities.find((e) => e.type === 'line')!, p0 = s.entities[0];
		const guides = editingGuides({ plane, ...s }, { selected: [l0.id, p0.id], hovered: s.entities.find((e) => e.type === 'line' && e.id !== l0.id)!.id, size: 0.1, preview: { polylines: [[[0, 0], [1, 1]]], anchors: [[0, 0]], moved: null, snap: { at: [4, 0], kind: 'point', point: 'x' } } });
		expect(guides.filter((g) => g.color === SELECTED_COLOUR)).toHaveLength(2);
		expect(guides.filter((g) => g.color === HOVER_COLOUR)).toHaveLength(1);
		expect(guides.filter((g) => g.color === SNAP_COLOUR)).toHaveLength(1);
		expect(guides.filter((g) => g.color === PREVIEW_COLOUR)).toHaveLength(2);
		const marker = (id: string) => { const p = s.entities.find((e) => e.id === id) as { x: number; y: number }; return guides.find((g) => g.points.length === 5 && Math.abs(g.points[1][0] - p.x) < 0.2 && g.points[0][1] < p.y); };
		const chosen = marker(p0.id)!, plain = marker(s.entities[2].id)!;
		expect(chosen.points[1][0] - chosen.points[3][0]).toBeCloseTo(0.16, 9); expect(plain.points[1][0] - plain.points[3][0]).toBeCloseTo(0.1, 9);
	});
	it('a drag in progress draws the moved curves from the session\'s own preview without throwing (measured: the old shape threw inside the redraw effect)', () => {
		const s = rect(), session = new SketchSession(), ctx = { entities: s.entities, constraints: s.constraints, tolerance: 0.15, snapRadius: 0.25, polygonSides: 6, filletRadius: 0.5, canWrite: true };
		session.down([4.02, 3.02], ctx); session.move([5, 4], ctx);
		const preview = session.preview(ctx);
		expect(preview.moved?.curves).toHaveLength(2);
		const guides = editingGuides({ plane, ...s }, { selected: session.selected, hovered: null, size: 0.1, preview });
		/* The two moved lines in the selection colour, plus the selected point's own marker. */
		expect(guides.filter((g) => g.color === SELECTED_COLOUR)).toHaveLength(3);
		const movedLine = guides.filter((g) => g.color === SELECTED_COLOUR && g.points.length === 2);
		expect(movedLine.some((g) => g.points.some((p) => Math.abs(p[0] - 5) < 1e-9 && Math.abs(p[1] - 4) < 1e-9))).toBe(true);
	});
	it('every constraint kind has a glyph, and one naming a missing entity draws nothing', () => {
		for (const kind of KINDS) {
			const c = everything.constraints.find((k) => k.type === kind)!;
			expect(c, kind).toBeDefined();
			expect(constraintGlyph(everything.entities, c, 0.1).length, kind).toBeGreaterThan(0);
		}
		expect(constraintGlyphs(everything.entities, everything.constraints, 0.1)).toHaveLength(KINDS.length);
		expect(constraintGlyph(everything.entities, { id: 'x', type: 'horizontal', line: 'gone' }, 0.1)).toEqual([]);
		expect(constraintGlyph(everything.entities, { id: 'x', type: 'distance', a: 'a', b: 'gone', value: 1 }, 0.1)).toEqual([]);
	});
	it('a snap marker is a square on a point, a cross at the origin and a rule for an alignment; none for no snap', () => {
		expect(snapStrokes({ at: [1, 1], kind: 'point', point: 'p' }, 0.1)).toHaveLength(1);
		expect(snapStrokes({ at: [0, 0], kind: 'origin' }, 0.1)).toHaveLength(2);
		expect(snapStrokes({ at: [3, 1], kind: 'horizontal', reference: [0, 1] }, 0.1)[0]).toEqual([[0, 1], [3, 1]]);
		expect(snapStrokes({ at: [3, 1], kind: 'none' }, 0.1)).toEqual([]);
	});
	it('the resting look is unchanged: one object per curve plus one fill per region, points drawn by nobody', () => {
		const s = rect();
		const objects = sketchObjects({ feature: 's', name: 'S', plane, planeRef: { kind: 'datum', datum: 'XY' }, entities: s.entities, constraints: s.constraints, solve: { converged: true, classification: 'solved', dof: 0, maxResidual: 0, trouble: [] }, regions: [{ id: 'r0', outline: [[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]], holes: [], area: 12 }], consumed: false });
		expect(objects).toHaveLength(5);
		expect(objects.filter((o) => o.userData.entity)).toHaveLength(4); expect(objects.filter((o) => o.userData.region)).toHaveLength(1);
	});
});

describe('the drawing tools emit entity collections', () => {
	function host() {
		const calls = { draft: [] as { draft: SketchDraft; ref: unknown }[], finish: 0, errors: [] as string[], guides: [] as Vec3[][] };
		const h: DrawingHost = { planeHit: (e) => [e.clientX / 100, e.clientY / 100, 0], zoom: () => 1, guide: (points) => { calls.guides.push(points); }, clearGuides: () => {}, error: (m) => { calls.errors.push(m); }, draft: (draft, ref) => { calls.draft.push({ draft, ref }); }, capture: () => {}, pointer: () => ({ x: 0, y: 0 }) };
		return { h, calls };
	}
	const drawPlane = { plane, ref: { kind: 'datum', datum: 'XY' } as const };
	const press = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1 } as PointerEvent);
	it('a rectangle drag lands as four points, four lines and four constraints through draft, never finish', () => {
		const { h, calls } = host(), tool = new DrawingTool(h);
		expect(tool.down(press(0, 0), 'rectangle', drawPlane)).toBe(true);
		tool.move(press(400, 300)); expect(tool.readout()!.text).toBe('4.000 × 3.000 in');
		expect(tool.up()).toBe(true);
		expect(calls.finish).toBe(0); expect(calls.draft).toHaveLength(1);
		const d = calls.draft[0].draft;
		expect(d.entities.filter((e) => e.type === 'point')).toHaveLength(4); expect(d.entities.filter((e) => e.type === 'line')).toHaveLength(4); expect(d.constraints).toHaveLength(4);
		expect(calls.draft[0].ref).toEqual({ kind: 'datum', datum: 'XY' });
		expect(tool.active).toBe(false);
	});
	it('a polygon reads its side count from drawingSettings, the readout names it, and a count under three is refused by sentence', () => {
		const { h, calls } = host(), tool = new DrawingTool(h);
		const before = drawingSettings.polygonSides;
		try {
			drawingSettings.polygonSides = 8;
			tool.down(press(0, 0), 'polygon', drawPlane); tool.move(press(200, 0));
			expect(tool.readout()!.text).toContain('8 sides');
			tool.up();
			expect(calls.draft[0].draft.entities.filter((e) => e.type === 'line')).toHaveLength(8);
			drawingSettings.polygonSides = 2;
			tool.down(press(0, 0), 'polygon', drawPlane); tool.move(press(200, 0)); tool.up();
			expect(calls.errors).toEqual([POLYGON_SIDES_REFUSAL]); expect(calls.draft).toHaveLength(1);
		} finally { drawingSettings.polygonSides = before; }
		expect(polygonSidesOk(3)).toBe(true); expect(polygonSidesOk(2)).toBe(false); expect(polygonSidesOk(4.5)).toBe(false); expect(polygonSidesOk(1000)).toBe(true);
	});
	it('a line chain closes on the first point or Enter and an arc takes three presses; a host without draft is told', () => {
		const { h, calls } = host(), tool = new DrawingTool(h);
		tool.down(press(0, 0), 'line', drawPlane); tool.down(press(400, 0), 'line', drawPlane); tool.down(press(400, 300), 'line', drawPlane);
		expect(tool.key({ key: 'Enter' } as KeyboardEvent)).toBe(true);
		expect(calls.draft[0].draft.entities.filter((e) => e.type === 'line')).toHaveLength(3);
		tool.down(press(0, 0), 'arc', drawPlane); tool.down(press(200, 0), 'arc', drawPlane); tool.down(press(0, 200), 'arc', drawPlane);
		expect(calls.draft[1].draft.entities.map((e) => e.type).sort()).toEqual(['arc', 'line', 'point', 'point', 'point']);
		const bare = host(); delete bare.h.draft;
		const t2 = new DrawingTool(bare.h); t2.down(press(0, 0), 'circle', drawPlane); t2.move(press(100, 0)); t2.up();
		expect(bare.calls.errors).toEqual(['This viewport cannot take a drawn shape.']); expect(bare.calls.finish).toBe(0);
	});
});
