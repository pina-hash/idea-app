// tests/ideacad-solid-dimensions-anchors.test.ts
//
// WHERE THE NUMBERS SIT IN THE VIEWPORT: `dimensions/anchors.ts`, the pure
// half of the dimension overlay (ledger 0296, friction F025).
//
// WHY THESE ARE AUTOMATED: each regression is silent on screen.
//   * A width label anchored on the wrong side of a rectangle still renders a
//     plausible number, over the part, where it hides what it measures.
//   * A sketch lifted through the wrong plane puts a Front sketch's numbers
//     where a Top sketch's would be, and nothing reports it.
//   * An anchor keyed wrong makes the overlay drop a number it should draw,
//     one row fewer and nothing to say a row went missing; every key
//     `featureDimensions` lists is asserted to get exactly one anchor.
//
// EXPECTED VALUES ARE WRITTEN OUT, never read back from the module: the
// rectangle is 4 x 3 with its corner at the origin, so its width label sits at
// x = 2 below y = 0 and its height label at y = 1.5 right of x = 4.
import { describe, expect, it } from 'vitest';
import { facesOf, featureAnchors, featureMiddle, measuredAnchors, pixelsPerInch, sketchAnchors, sketchConstraintAnchor } from '../src/lib/ideacad/solid/dimensions/anchors';
import { featureDimensions, sketchDimensions } from '../src/lib/ideacad/solid/dimensions/model';
import { datumPlane } from '../src/lib/ideacad/solid/sketch/model';
import type { BodyProjection, Feature, FeatureOf, FeatureRow, ModelProjection, ResolvedPlane, SketchConstraint, SketchEntity, SketchProjection, Vec3 } from '../src/lib/ideacad/solid/types';

const GAP = 0.1;
const RECT: SketchEntity[] = [
	{ id: 'p0', type: 'point', x: 0, y: 0 }, { id: 'p1', type: 'point', x: 4, y: 0 }, { id: 'p2', type: 'point', x: 4, y: 3 }, { id: 'p3', type: 'point', x: 0, y: 3 },
	{ id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }
];
const RECT_DIMS: SketchConstraint[] = [{ id: 'kh', type: 'horizontal', line: 'l0' }, { id: 'kw', type: 'distance', a: 'p0', b: 'p1', value: 4 }, { id: 'kv', type: 'distance', a: 'p1', b: 'p2', value: 3 }];
const sketch = (plane: ResolvedPlane, entities: SketchEntity[] = RECT, constraints: SketchConstraint[] = RECT_DIMS) => ({ feature: 's1', plane, entities, constraints });
const close = (a: readonly number[], b: readonly number[], digits = 9) => { expect(a).toHaveLength(b.length); a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits)); };

describe('a rectangle sketch on Top', () => {
	const top = datumPlane('XY');
	it('puts the width below the bottom edge and the height right of the right edge, keyed by their constraints', () => {
		const anchors = sketchAnchors(sketch(top), GAP);
		expect(anchors.map((a) => a.key)).toEqual(['kw', 'kv']);
		expect(anchors.every((a) => a.feature === 's1')).toBe(true);
		const [w, h] = anchors;
		close(w.at, [2, -2 * GAP, 0]);
		close(w.away, [0, -1, 0]);
		close(h.at, [4 + 2 * GAP, 1.5, 0]);
		close(h.away, [1, 0, 0]);
	});
	it('draws a dimension line and a witness line from each measured point', () => {
		const [w] = sketchAnchors(sketch(top), GAP);
		expect(w.lines).toHaveLength(3);
		close(w.lines[0][0], [0, 0, 0]); close(w.lines[0][1], [0, -2.4 * GAP, 0]);
		close(w.lines[1][0], [4, 0, 0]); close(w.lines[1][1], [4, -2.4 * GAP, 0]);
		close(w.lines[2][0], [0, -2 * GAP, 0]); close(w.lines[2][1], [4, -2 * GAP, 0]);
	});
	it('every numbered constraint gets an anchor, and one with no number gets none', () => {
		const numbered = sketchDimensions({ feature: 's1', constraints: RECT_DIMS }).map((d) => d.key);
		expect(sketchAnchors(sketch(top), GAP).map((a) => a.key)).toEqual(numbered);
		expect(sketchConstraintAnchor(sketch(top), RECT_DIMS[0], GAP)).toBeNull();
		expect(sketchConstraintAnchor(sketch(top), { id: 'gone', type: 'distance', a: 'p0', b: 'nope', value: 1 }, GAP)).toBeNull();
	});
});

describe('the same rectangle on Front', () => {
	/* Front is XZ with u = +X and v = +Z, so the sketch's y is the world's z and the sketch sits at world y = 0. */
	it('lifts through the Front plane: the width sits below z = 0 and the height right of x = 4, all at y = 0', () => {
		const [w, h] = sketchAnchors(sketch(datumPlane('XZ')), GAP);
		close(w.at, [2, 0, -2 * GAP]);
		close(w.away, [0, 0, -1]);
		close(h.at, [4 + 2 * GAP, 0, 1.5]);
		for (const a of [w, h]) for (const line of a.lines) for (const p of line) expect(p[1]).toBeCloseTo(0, 12);
	});
	it('an offset plane carries its offset: Front offset 2 is world y = -2', () => {
		const [w] = sketchAnchors(sketch(datumPlane('XZ', 2)), GAP);
		close(w.at, [2, -2, -2 * GAP]);
	});
});

describe('a circle, an arc, an angle and a fixed coordinate', () => {
	const top = datumPlane('XY');
	it('a circle shows its DIAMETER: a line across it at 45 degrees and the label just past the rim, times two', () => {
		const entities: SketchEntity[] = [{ id: 'c', type: 'point', x: 1, y: 1 }, { id: 'o', type: 'circle', center: 'c', radius: 0.5 }];
		const a = sketchConstraintAnchor(sketch(top, entities, []), { id: 'kr', type: 'circleRadius', circle: 'o', value: 0.5 }, GAP)!;
		expect(a.prefix).toBe('⌀');
		expect(a.factor).toBe(2);
		const d = Math.SQRT1_2;
		close(a.at, [1 + d * (0.5 + GAP), 1 + d * (0.5 + GAP), 0]);
		close(a.lines[0][0], [1 - d * 0.5, 1 - d * 0.5, 0]); close(a.lines[0][1], [1 + d * 0.5, 1 + d * 0.5, 0]);
	});
	it('an arc shows its radius from the centre to the middle of the arc', () => {
		/* A quarter arc from +u to +v about the origin, radius 2: its middle is at 45 degrees. */
		const entities: SketchEntity[] = [{ id: 'c', type: 'point', x: 0, y: 0 }, { id: 's', type: 'point', x: 2, y: 0 }, { id: 'e', type: 'point', x: 0, y: 2 }, { id: 'a', type: 'arc', center: 'c', start: 's', end: 'e' }];
		const a = sketchConstraintAnchor(sketch(top, entities, []), { id: 'kr', type: 'arcRadius', arc: 'a', value: 2 }, GAP)!;
		expect(a.prefix).toBe('R');
		expect(a.factor).toBeUndefined();
		const d = Math.SQRT1_2;
		close(a.lines[0][1], [2 * d, 2 * d, 0]);
		close(a.at, [(2 + GAP) * d, (2 + GAP) * d, 0]);
	});
	it('an angle sits on the bisector of the corner the two lines make', () => {
		/* Two lines from the origin along +u and +v: a right angle whose bisector is 45 degrees. */
		const entities: SketchEntity[] = [{ id: 'o', type: 'point', x: 0, y: 0 }, { id: 'x', type: 'point', x: 3, y: 0 }, { id: 'y', type: 'point', x: 0, y: 3 }, { id: 'a', type: 'line', a: 'o', b: 'x' }, { id: 'b', type: 'line', a: 'y', b: 'o' }];
		const a = sketchConstraintAnchor(sketch(top, entities, []), { id: 'kg', type: 'angle', l1: 'a', l2: 'b', value: 90 }, GAP)!;
		const r = 3 * GAP, d = Math.SQRT1_2;
		close(a.at, [r * d, r * d, 0]);
		close(a.lines[0][0], [r, 0, 0]); close(a.lines[0][a.lines[0].length - 1], [0, r, 0]);
	});
	it('a fixed X sits on the line from the axis to the point', () => {
		const entities: SketchEntity[] = [{ id: 'p', type: 'point', x: 2, y: 1 }];
		const a = sketchConstraintAnchor(sketch(top, entities, []), { id: 'kx', type: 'fixX', point: 'p', value: 2 }, GAP)!;
		close(a.lines[0][0], [0, 1, 0]); close(a.lines[0][1], [2, 1, 0]);
		close(a.at, [1, 1 + GAP, 0]);
	});
});

/* -------------------------------------------------- features, over a fake projection */
const EMPTY_MESH = { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() };
const face = (id: string, center: Vec3, normal: Vec3, kind = 'plane') => ({ id, kind, center, normal, area: 1, surface: {}, edges: [], ...EMPTY_MESH });
const row = (id: string, type: Feature['type'], bodies: string[] = []): FeatureRow => ({ id, index: 0, type, name: id, status: 'ok', summary: '', bodies, dependsOn: [], suppressed: false });
const body = (over: Partial<BodyProjection>): BodyProjection => ({ id: 'x1#0', name: 'Body', materialId: null, role: 'part', createdBy: 'x1', volume: 12, bounds: [0, 0, 0, 4, 3, 1], centerOfMass: [2, 1.5, 0.5], inertia: [], mesh: EMPTY_MESH, faces: [], edges: [], vertices: [], ...over });
const sketchProjection = (plane = datumPlane('XY')): SketchProjection => ({ feature: 's1', name: 'Sketch 1', plane, planeRef: { kind: 'datum', datum: 'XY' }, entities: RECT, constraints: RECT_DIMS,
	solve: { converged: true, classification: 'solved', dof: 2, maxResidual: 0, trouble: [] }, regions: [{ id: 'r0', outline: [[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]], holes: [], area: 12 }], consumed: true });
const model = (over: Partial<ModelProjection> = {}): ModelProjection => ({ bodies: [], sketches: [sketchProjection()], references: [], features: [], mates: [], addons: { ideaBlade: false }, operationMs: 0, canUndo: false, canRedo: false, ...over });
const extrude = (over: Partial<FeatureOf<'extrude'>> = {}): FeatureOf<'extrude'> => ({ id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: 1, operation: 'new', ...over });

describe('an extrude', () => {
	it('puts its depth at the middle of a side, one gap out from the profile, on a line parallel to the pull', () => {
		/* With no projector the corner furthest along u + v wins: (4, 3). Outward from the profile middle (2, 1.5) is (0.8, 0.6). */
		const [a] = featureAnchors(extrude(), model(), GAP);
		expect(a.key).toBe('distance'); expect(a.feature).toBe('x1');
		const out: Vec3 = [0.8, 0.6, 0];
		close(a.away, out);
		close(a.at, [4 + 0.8 * 2 * GAP, 3 + 0.6 * 2 * GAP, 0.5]);
		const dim = a.lines[2];
		close(dim[0], [4 + 0.8 * 2 * GAP, 3 + 0.6 * 2 * GAP, 0]); close(dim[1], [4 + 0.8 * 2 * GAP, 3 + 0.6 * 2 * GAP, 1]);
	});
	it('a reversed or negative extrude runs the other way from the sketch plane', () => {
		for (const f of [extrude({ direction: 'reverse' }), extrude({ distance: -1 })]) close(featureAnchors(f, model(), GAP)[0].at.slice(2), [-0.5]);
		/* Reversed AND negative is forward again. */
		close(featureAnchors(extrude({ direction: 'reverse', distance: -1 }), model(), GAP)[0].at.slice(2), [0.5]);
	});
	it('with a projector, the corner furthest right on screen carries the number', () => {
		/* A projector that mirrors x makes the corners at x = 0 the rightmost on screen. */
		const [a] = featureAnchors(extrude(), model(), GAP, (p) => ({ x: -p[0], y: -p[1] }));
		expect(a.at[0]).toBeLessThan(0);
	});
	it('with its sketch missing, it still has a place: the middle of what it made', () => {
		const m = model({ sketches: [], bodies: [body({})], features: [row('x1', 'extrude', ['x1#0'])] });
		const [a] = featureAnchors(extrude(), m, GAP);
		close(a.at, [2, 1.5, 0.5]);
	});
});

describe('a fillet', () => {
	const fillet: FeatureOf<'fillet'> = { id: 'f1', name: 'Fillet 1', type: 'fillet', edges: [{ body: 'x1#0', faces: ['x1.end', 'x1.side.0'], hint: { curve: 'line', mid: [2, 0, 1], length: 4 } }], radius: 0.25 };
	it('sits at the centre of its own round face, pushed out along the face normal, marked R', () => {
		const m = model({ bodies: [body({ faces: [face('x1.end', [2, 1.5, 1], [0, 0, 1]), face('f1.blend.x1.end|x1.side.0', [2, 0.07, 0.93], [0, -0.7071, 0.7071], 'cylinder')] })] });
		const [a] = featureAnchors(fillet, m, GAP);
		expect(a.key).toBe('radius'); expect(a.prefix).toBe('R');
		close(a.at, [2, 0.07, 0.93]);
		close(a.away, [0, -Math.SQRT1_2, Math.SQRT1_2], 4);
	});
	it('with no round face (the fillet failed), it sits on the edge it was asked to round', () => {
		const [a] = featureAnchors(fillet, model({ bodies: [body({})] }), GAP);
		close(a.at, [2, 0, 1]);
	});
	it('a variable fillet anchors its end radius too', () => {
		const m = model({ bodies: [body({ faces: [face('f1.blend.a', [0, 0, 0], [0, 0, 1]), face('f1.blend.b', [1, 0, 0], [0, 0, 1])] })] });
		const anchors = featureAnchors({ ...fillet, variable: { end: 0.5 } }, m, GAP);
		expect(anchors.map((a) => a.key)).toEqual(['radius', 'end']);
		close(anchors[1].at, [1, 0, 0]);
	});
});

describe('every feature number has exactly one anchor', () => {
	const features: Feature[] = [
		extrude(),
		{ id: 'r1', name: 'Revolve', type: 'revolve', sketch: 's1', angle: 90, axis: { kind: 'datum', axis: 'Z' }, operation: 'new' },
		{ id: 'c1', name: 'Chamfer', type: 'chamfer', edges: [], distance: 0.1, distance2: 0.2 },
		{ id: 'h1', name: 'Shell', type: 'shell', body: 'x1#0', thickness: 0.1, openFaces: [], faceThickness: [{ face: { body: 'x1#0', name: 'x1.end' }, thickness: 0.3 }] },
		{ id: 'o1', name: 'Hole', type: 'hole', face: { body: 'x1#0', name: 'x1.end' }, center: [1, 1], standard: 'custom', fit: 'custom', diameter: 0.25, depth: 0.5 },
		{ id: 'n1', name: 'Pattern', type: 'pattern', body: 'x1#0', mode: 'linear', axis: { kind: 'datum', axis: 'X' }, spacing: 5, count: 3 },
		{ id: 'm1', name: 'Move', type: 'transform', bodies: ['x1#0'], matrix: [1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1] },
		{ id: 'q1', name: 'Plane', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 2 } },
		{ id: 'k1', name: 'Mate', type: 'mate', kind: 'distance', a: { kind: 'body', body: 'x1#0' }, b: { kind: 'body', body: 'x2#0' }, value: 1 },
		{ id: 'b1', name: 'Combine', type: 'boolean', operation: 'union', bodies: [] }
	];
	it.each(features.map((f) => [f.type, f] as const))('%s', (_type, f) => {
		const anchors = featureAnchors(f, model({ bodies: [body({})] }), GAP);
		expect(anchors.map((a) => a.key)).toEqual(featureDimensions(f).map((d) => d.key));
		for (const a of anchors) { expect(a.feature).toBe(f.id); for (const v of a.at) expect(Number.isFinite(v)).toBe(true); }
	});
	it('the census is not empty: a sweep that generated nothing cannot pass', () => {
		expect(features.reduce((n, f) => n + featureDimensions(f).length, 0)).toBe(1 + 1 + 2 + 2 + 2 + 2 + 3 + 1 + 1 + 0);
	});
	it('a hole puts its diameter on its own wall, marked with the diameter sign', () => {
		const hole = features.find((f) => f.type === 'hole')!;
		const m = model({ bodies: [body({ faces: [face('o1.wall', [1, 1, 0.75], [1, 0, 0], 'cylinder'), face('o1.bottom', [1, 1, 0.5], [0, 0, -1])] })] });
		const [diameter, depth] = featureAnchors(hole, m, GAP);
		expect(diameter.prefix).toBe('⌀'); expect(diameter.factor).toBeUndefined();
		close(diameter.at, [1, 1, 0.75]); close(depth.at, [1, 1, 0.5]);
	});
	it('a pattern spaces its label between the source and its first copy', () => {
		const pattern = features.find((f) => f.type === 'pattern')!;
		const m = model({ bodies: [body({}), body({ id: 'n1#0', createdBy: 'n1', centerOfMass: [7, 1.5, 0.5] }), body({ id: 'n1#1', createdBy: 'n1', centerOfMass: [12, 1.5, 0.5] })] });
		const [count, spacing] = featureAnchors(pattern, m, GAP);
		close(count.at, [7, 1.5, 0.5]);
		close(spacing.at, [4.5, 1.5, 0.5]);
		close(spacing.lines[0][0], [2, 1.5, 0.5]); close(spacing.lines[0][1], [7, 1.5, 0.5]);
	});
});

describe('measured values and helpers', () => {
	it('a selected edge shows its length at its middle, pushed out from its body; anything else shows nothing here', () => {
		const m = model({ bodies: [body({ edges: [{ id: 'edge:a|b', curve: 'line', points: new Float32Array(), faces: ['a', 'b'], length: 4, mid: [2, 0, 1] }] })] });
		const [a] = measuredAnchors({ bodyId: 'x1#0', kind: 'edge', id: 'edge:a|b' }, m);
		expect(a.key).toBe('length'); expect(a.feature).toBe('');
		close(a.at, [2, 0, 1]);
		expect(measuredAnchors({ bodyId: 'x1#0', kind: 'face', id: 'x1.end' }, m)).toEqual([]);
		expect(measuredAnchors(null, m)).toEqual([]);
	});
	it('facesOf finds only the faces the feature named, sorted', () => {
		const m = model({ bodies: [body({ faces: [face('f1.blend.b', [0, 0, 0], [0, 0, 1]), face('f10.blend.a', [0, 0, 0], [0, 0, 1]), face('f1.blend.a', [0, 0, 0], [0, 0, 1])] })] });
		expect(facesOf(m, 'f1', 'blend').map((f) => f.face.id)).toEqual(['f1.blend.a', 'f1.blend.b']);
	});
	it('featureMiddle never throws for a feature that made nothing', () => {
		close(featureMiddle({ id: 'z', name: 'z', type: 'delete', bodies: [] }, model()), [0, 0, 0]);
	});
	it('pixelsPerInch reads the longer of the plane\'s two axes on screen', () => {
		expect(pixelsPerInch((p) => ({ x: p[0] * 50, y: p[1] * 20 }), datumPlane('XY'))).toBeCloseTo(50, 9);
	});
});
