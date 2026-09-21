// tests/ideacad-solid-reference-engine.test.ts
//
// REFERENCE GEOMETRY THROUGH THE REAL ENGINE AND THE REAL KERNEL: a plane on
// a face, an axis through a hole, a point at the middle of a face, and the
// constructions built from them -- offset, angle, mid, three points, two
// planes meeting, an axis meeting a plane -- resolved on replay and recorded
// for the features after them.
//
// WHAT IS ASSERTED IS THE PROPERTY THE SURFACE RESTS ON: a reference names
// topology through `refFromSelection`, so it FOLLOWS an upstream edit by name,
// and when the topology is gone it reports itself on its own row in the words
// `naming.ts` gives a lost reference, rather than resolving to something else.
// And that a revolve, a pattern and a mirror can name a reference and follow
// it. EVERY position is an analytic value from the fixture's own numbers, never
// one read off the kernel and typed back in.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import type { Feature, FeatureOf, ModelProjection, Vec3 } from '../src/lib/ideacad/solid/types';
import { refFromSelection, lostReference } from '../src/lib/ideacad/solid/naming';
import { faceCentroid } from '../src/lib/ideacad/solid/features/reference';
import { createKernel } from '../src/lib/ideacad/kernel/remus';

const WASM = new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'));
const engines: SolidEngine[] = [];
async function engine() { const e = await SolidEngine.create(WASM); engines.push(e); return e; }
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; });

function polygon(id: string, points: [number, number][], plane: FeatureOf<'sketch'>['plane'] = { kind: 'datum', datum: 'XY' }): FeatureOf<'sketch'> {
	return { id, name: `Sketch ${id}`, type: 'sketch', plane, entities: [
		...points.map((p, i) => ({ id: `p${i}`, type: 'point' as const, x: p[0], y: p[1] })),
		...points.map((_, i) => ({ id: `l${i}`, type: 'line' as const, a: `p${i}`, b: `p${(i + 1) % points.length}` }))
	], constraints: [] };
}
const rectangle = (id: string, x0: number, y0: number, w: number, h: number, plane?: FeatureOf<'sketch'>['plane']) => polygon(id, [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], plane);
function circle(id: string, cx: number, cy: number, r: number, plane: FeatureOf<'sketch'>['plane'] = { kind: 'datum', datum: 'XY' }): FeatureOf<'sketch'> {
	return { id, name: `Sketch ${id}`, type: 'sketch', plane, entities: [{ id: 'c', type: 'point', x: cx, y: cy }, { id: 'k', type: 'circle', center: 'c', radius: r }], constraints: [] };
}
const add = (e: SolidEngine, feature: Feature) => e.apply({ type: 'add-feature', feature });
const row = (m: ModelProjection, id: string) => m.features.find((f) => f.id === id)!;
const refOf = (m: ModelProjection, id: string) => m.references.find((r) => r.feature === id);
const close = (a: Vec3, b: Vec3, digits = 6) => { expect(a[0]).toBeCloseTo(b[0], digits); expect(a[1]).toBeCloseTo(b[1], digits); expect(a[2]).toBeCloseTo(b[2], digits); };
const alongZ = (d: Vec3) => expect(Math.abs(d[2])).toBeCloseTo(1, 6);
/** The 4x3x1 box every case starts from: sketch `s1`, extrude `x1`. */
async function box(e: SolidEngine) { await add(e, rectangle('s1', 0, 0, 4, 3)); return add(e, { id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' }); }
const faceRef = (m: ModelProjection, body: number, id: string) => refFromSelection({ bodyId: m.bodies[body].id, kind: 'face', id }, m.bodies[body]);
const vertexAt = (m: ModelProjection, body: number, p: Vec3) => { const v = m.bodies[body].vertices.find((x) => Math.hypot(...x.point.map((n, i) => n - p[i])) < 1e-6)!; expect(v).toBeDefined(); return refFromSelection({ bodyId: m.bodies[body].id, kind: 'vertex', id: v.id }, m.bodies[body]); };

describe('a plane on a face', () => {
	it('sits on the face, follows the face by name through upstream edits, and reports itself lost when the feature that made the face is suppressed or gone', async () => {
		const e = await engine(); const m0 = await box(e);
		const m1 = await add(e, { id: 'pl1', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'face', face: faceRef(m0, 0, 'x1.end') as never }, offset: 0 } });
		expect(row(m1, 'pl1').status).toBe('ok');
		expect(row(m1, 'pl1').name).toBe('Plane 1');
		expect(m1.references).toHaveLength(1);
		close(refOf(m1, 'pl1')!.origin, [0, 0, 1]); alongZ(refOf(m1, 'pl1')!.normal!);
		/* Name tier: the profile is widened and the end face is still `x1.end`, so the plane stays on it. */
		const m2 = await e.apply({ type: 'set-feature', id: 's1', patch: { entities: rectangle('s1', 0, 0, 6, 3).entities } });
		expect(row(m2, 'pl1').status).toBe('ok'); close(refOf(m2, 'pl1')!.origin, [0, 0, 1]);
		/* And it follows the face when the face moves: the extrude grows to 2 and the plane is at z = 2. */
		const m3 = await e.apply({ type: 'set-feature', id: 'x1', patch: { distance: 2 } });
		expect(row(m3, 'pl1').status).toBe('ok'); close(refOf(m3, 'pl1')!.origin, [0, 0, 2]);
		/* Deleting the extrude is refused by the reducer, in words naming the plane. */
		await expect(e.apply({ type: 'remove-feature', id: 'x1' })).rejects.toThrow(/Plane 1/);
		/* Suppressing it takes the body away: the plane's row says so and names the body, and the plane is no longer drawn. */
		const bodyName = m3.bodies[0].name;
		const broken = await e.apply({ type: 'suppress-feature', id: 'x1', suppressed: true });
		expect(row(broken, 'pl1').status).toBe('error');
		expect(row(broken, 'pl1').message).toBe(lostReference('body', bodyName));
		expect(broken.references).toHaveLength(0);
		const back = await e.apply({ type: 'suppress-feature', id: 'x1', suppressed: false });
		expect(row(back, 'pl1').status).toBe('ok'); expect(back.references).toHaveLength(1);
		/* A document that arrives without the extrude at all (edited elsewhere) opens with the plane in error rather than refusing to open. */
		const saved = await e.snapshot();
		const gone = await e.load({ manifest: { ...saved.manifest, features: saved.manifest.features.filter((f) => f.id !== 'x1') }, artifacts: saved.artifacts });
		expect(gone.features.map((f) => f.id)).toEqual(['s1', 'pl1']);
		expect(row(gone, 'pl1').status).toBe('error');
		expect(row(gone, 'pl1').message).toMatch(/^Lost reference: the body this feature used/);
		expect(gone.references).toHaveLength(0);
	});
	it('refuses a round face for a plane in the plane\'s own words, and the tree is left as it was', async () => {
		const e = await engine(); await add(e, circle('s1', 1, 2, 0.5)); const m = await add(e, { id: 'c1', name: '', type: 'extrude', sketch: 's1', distance: 2, operation: 'new' });
		const round = m.bodies[0].faces.find((f) => f.kind === 'cylinder')!;
		await expect(add(e, { id: 'pl1', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'face', face: faceRef(m, 0, round.id) as never }, offset: 0 } })).rejects.toThrow(/Pick a flat face for a plane/);
		expect(e.project().features).toHaveLength(2);
	});
});
describe('from the geometry', () => {
	it('an axis from a round face, a straight edge and two corners; a point at a corner, an edge middle, a face center and a body center', async () => {
		const e = await engine(); const m0 = await box(e);
		await add(e, circle('s2', 1, 2, 0.5)); const m1 = await add(e, { id: 'c1', name: '', type: 'extrude', sketch: 's2', distance: 2, operation: 'new' });
		const cyl = m1.bodies[1], round = cyl.faces.find((f) => f.kind === 'cylinder')!;
		const m2 = await add(e, { id: 'ax1', name: '', type: 'axis', definition: { kind: 'cylinder', face: refFromSelection({ bodyId: cyl.id, kind: 'face', id: round.id }, cyl) as never } });
		expect(row(m2, 'ax1').status).toBe('ok'); alongZ(refOf(m2, 'ax1')!.direction!);
		expect(refOf(m2, 'ax1')!.origin[0]).toBeCloseTo(1, 6); expect(refOf(m2, 'ax1')!.origin[1]).toBeCloseTo(2, 6);
		/* The box edge along y = 0, z = 1 runs in x. */
		const edge = m0.bodies[0].edges.find((ed) => ed.faces.includes('x1.end') && ed.faces.includes('x1.side.0'))!;
		const edgeRef = refFromSelection({ bodyId: 'x1#0', kind: 'edge', id: edge.id }, m0.bodies[0]);
		const m3 = await add(e, { id: 'ax2', name: '', type: 'axis', definition: { kind: 'edge', edge: edgeRef as never } });
		expect(Math.abs(refOf(m3, 'ax2')!.direction![0])).toBeCloseTo(1, 6); expect(refOf(m3, 'ax2')!.origin[1]).toBeCloseTo(0, 6); expect(refOf(m3, 'ax2')!.origin[2]).toBeCloseTo(1, 6);
		/* Two corners of the top: (0,0,1) to (4,3,1), so the direction is (4,3,0)/5. */
		const m4 = await add(e, { id: 'ax3', name: '', type: 'axis', definition: { kind: 'two-points', a: { kind: 'vertex', vertex: vertexAt(m0, 0, [0, 0, 1]) as never }, b: { kind: 'vertex', vertex: vertexAt(m0, 0, [4, 3, 1]) as never } } });
		close(refOf(m4, 'ax3')!.origin, [0, 0, 1]); close(refOf(m4, 'ax3')!.direction!, [0.8, 0.6, 0]);
		const m5 = await add(e, { id: 'pt1', name: '', type: 'point', definition: { kind: 'vertex', vertex: vertexAt(m0, 0, [4, 3, 1]) as never } });
		close(refOf(m5, 'pt1')!.origin, [4, 3, 1]);
		const m6 = await add(e, { id: 'pt2', name: '', type: 'point', definition: { kind: 'edge-midpoint', edge: edgeRef as never } });
		close(refOf(m6, 'pt2')!.origin, [2, 0, 1]);
		/* The round cap's center is the circle's center, (1, 2, 2), not a point on its rim: the projection's own `center` (the vertex average) is on the rim, 0.5 away. */
		const cap = cyl.faces.find((f) => f.kind === 'plane' && f.normal[2] > 0.99)!;
		expect(Math.hypot(cap.center[0] - 1, cap.center[1] - 2)).toBeCloseTo(0.5, 3);
		const m7 = await add(e, { id: 'pt3', name: '', type: 'point', definition: { kind: 'face-center', face: refFromSelection({ bodyId: cyl.id, kind: 'face', id: cap.id }, cyl) as never } });
		expect(Math.hypot(...refOf(m7, 'pt3')!.origin.map((n, i) => n - [1, 2, 2][i]))).toBeLessThan(2e-3);
		const m8 = await add(e, { id: 'pt4', name: '', type: 'point', definition: { kind: 'body-center', body: 'x1#0' } });
		close(refOf(m8, 'pt4')!.origin, [2, 1.5, 0.5]);
		expect(m8.features.map((f) => f.status)).toEqual(Array(11).fill('ok'));
	});
	it('a face center is the area centroid, which on an L-shaped face is not the vertex average', async () => {
		/* L: 4x1 foot plus 1x2 upright; area 6; centroid (1.5, 1); vertex average (5/3, 4/3). */
		const e = await engine(); await add(e, polygon('s1', [[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [0, 3]])); const m = await add(e, { id: 'x1', name: '', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' });
		const top = m.bodies[0].faces.find((f) => f.id === 'x1.end')!;
		close(top.center, [5 / 3, 4 / 3, 1], 6);
		const p = await add(e, { id: 'pt1', name: '', type: 'point', definition: { kind: 'face-center', face: faceRef(m, 0, 'x1.end') as never } });
		close(refOf(p, 'pt1')!.origin, [1.5, 1, 1], 6);
		/* And the same function on a raw kernel cylinder cap, against the kernel's own axis. */
		const k = await createKernel(WASM); const solid = k.makeCylinder(0.5, 2);
		const faces = [...k.getSolidFaces(solid)], side = faces.find((f) => k.getSurfaceType(f) === 'cylinder')!, caps = faces.filter((f) => k.getSurfaceType(f) === 'plane');
		const params = JSON.parse(k.getAnalyticSurfaceParams(side)) as { origin: number[] };
		expect(caps).toHaveLength(2);
		for (const cap of caps) { const c = faceCentroid(k, cap); expect(Math.hypot(c[0] - params.origin[0], c[1] - params.origin[1])).toBeLessThan(2e-3); }
		k.free();
	});
});
describe('by construction', () => {
	it('offset, angle, mid, three points, two planes meeting and an axis meeting a plane, each at its analytic position', async () => {
		const e = await engine(); const m0 = await box(e);
		const m1 = await add(e, { id: 'pl1', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 1 } });
		close(refOf(m1, 'pl1')!.origin, [0, 0, 1]); alongZ(refOf(m1, 'pl1')!.normal!);
		/* Chained: offset -2.5 from the plane at 1 is at -1.5. */
		const m2 = await add(e, { id: 'pl2', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'reference', feature: 'pl1' }, offset: -2.5 } });
		close(refOf(m2, 'pl2')!.origin, [0, 0, -1.5]);
		expect(row(m2, 'pl2').dependsOn).toEqual(['pl1']);
		/* XY turned 90 degrees about X faces along y. */
		const m3 = await add(e, { id: 'pl3', name: '', type: 'plane', definition: { kind: 'angle', from: { kind: 'datum', datum: 'XY' }, about: { kind: 'datum', axis: 'X' }, angle: 90 } });
		expect(Math.abs(refOf(m3, 'pl3')!.normal![1])).toBeCloseTo(1, 6);
		const m4 = await add(e, { id: 'pl4', name: '', type: 'plane', definition: { kind: 'mid', a: { kind: 'datum', datum: 'XY' }, b: { kind: 'reference', feature: 'pl1' } } });
		close(refOf(m4, 'pl4')!.origin, [0, 0, 0.5]); alongZ(refOf(m4, 'pl4')!.normal!);
		const m5 = await add(e, { id: 'pl5', name: '', type: 'plane', definition: { kind: 'through-points', points: [{ kind: 'vertex', vertex: vertexAt(m0, 0, [0, 0, 1]) as never }, { kind: 'vertex', vertex: vertexAt(m0, 0, [4, 0, 1]) as never }, { kind: 'vertex', vertex: vertexAt(m0, 0, [4, 3, 1]) as never }] } });
		alongZ(refOf(m5, 'pl5')!.normal!); expect(refOf(m5, 'pl5')!.origin[2]).toBeCloseTo(1, 6);
		/* XY meets YZ along y, through the origin. */
		const m6 = await add(e, { id: 'ax1', name: '', type: 'axis', definition: { kind: 'plane-plane', a: { kind: 'datum', datum: 'XY' }, b: { kind: 'datum', datum: 'YZ' } } });
		expect(Math.abs(refOf(m6, 'ax1')!.direction![1])).toBeCloseTo(1, 6); expect(refOf(m6, 'ax1')!.origin[0]).toBeCloseTo(0, 6); expect(refOf(m6, 'ax1')!.origin[2]).toBeCloseTo(0, 6);
		const m7 = await add(e, { id: 'pt1', name: '', type: 'point', definition: { kind: 'axis-plane', axis: { kind: 'datum', axis: 'Z' }, plane: { kind: 'reference', feature: 'pl1' } } });
		close(refOf(m7, 'pt1')!.origin, [0, 0, 1]);
		expect(m7.features.map((f) => f.status)).toEqual(Array(9).fill('ok'));
		expect(m7.references).toHaveLength(7);
	});
	it('refuses what has no answer, in words, and leaves the tree as it was each time', async () => {
		const e = await engine(); await box(e);
		await add(e, { id: 'pl1', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 1 } });
		const before = e.project().features.length;
		const pt = (p: Vec3) => ({ kind: 'coordinates' as const, point: p });
		await expect(add(e, { id: 'bad1', name: '', type: 'plane', definition: { kind: 'through-points', points: [pt([0, 0, 0]), pt([1, 0, 0]), pt([2, 0, 0])] } })).rejects.toThrow(/three points are in a line/);
		await expect(add(e, { id: 'bad2', name: '', type: 'plane', definition: { kind: 'mid', a: { kind: 'datum', datum: 'XY' }, b: { kind: 'datum', datum: 'YZ' } } })).rejects.toThrow(/two parallel planes/);
		await expect(add(e, { id: 'bad3', name: '', type: 'axis', definition: { kind: 'two-points', a: pt([1, 1, 1]), b: pt([1, 1, 1]) } })).rejects.toThrow(/two different points/);
		await expect(add(e, { id: 'bad4', name: '', type: 'axis', definition: { kind: 'plane-plane', a: { kind: 'datum', datum: 'XY' }, b: { kind: 'reference', feature: 'pl1' } } })).rejects.toThrow(/Parallel planes do not meet/);
		await expect(add(e, { id: 'bad5', name: '', type: 'point', definition: { kind: 'axis-plane', axis: { kind: 'datum', axis: 'X' }, plane: { kind: 'datum', datum: 'XY' } } })).rejects.toThrow(/never meets it/);
		await expect(add(e, { id: 'bad6', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: Number.NaN } })).rejects.toThrow(/finite offset/);
		await add(e, circle('s2', 1, 2, 0.5)); const mc = await add(e, { id: 'c1', name: '', type: 'extrude', sketch: 's2', distance: 2, operation: 'new' });
		const curved = mc.bodies[1].edges.find((ed) => ed.curve === 'CIRCLE')!;
		await expect(add(e, { id: 'bad7', name: '', type: 'axis', definition: { kind: 'edge', edge: refFromSelection({ bodyId: mc.bodies[1].id, kind: 'edge', id: curved.id }, mc.bodies[1]) as never } })).rejects.toThrow(/straight edge/);
		await expect(add(e, { id: 'bad8', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'reference', feature: 'nowhere' }, offset: 1 } })).rejects.toThrow(/Lost reference: the plane/);
		expect(e.project().features).toHaveLength(before + 2);
		expect(e.project().features.every((f) => f.status === 'ok')).toBe(true);
	});
});
describe('a revolve, a pattern and a mirror can name a reference', () => {
	it('revolve turns about a reference axis, both patterns run along or about one, and mirror reflects across a reference plane; each follows the reference and reports it lost', async () => {
		const e = await engine(); await box(e);
		/* A 1x1 square from x = 1 to 2, revolved about the Y axis, is a tube of volume pi (2^2 - 1^2) * 1. */
		await add(e, rectangle('s3', 1, 0, 1, 1));
		await add(e, { id: 'ay', name: 'Spin axis', type: 'axis', definition: { kind: 'datum', axis: 'Y' } });
		const mr = await add(e, { id: 'r1', name: '', type: 'revolve', sketch: 's3', angle: 360, axis: { kind: 'reference', feature: 'ay' }, operation: 'new' });
		expect(row(mr, 'r1').status).toBe('ok');
		expect(mr.bodies.find((b) => b.id === 'r1#0')!.volume).toBeCloseTo(3 * Math.PI, 4);
		expect(row(mr, 'r1').dependsOn).toEqual(['s3', 'ay']);
		/* Linear along a reference axis: the copy of the 4x3x1 box, spacing 5 along X, spans x = 5..9. */
		await add(e, { id: 'ax', name: '', type: 'axis', definition: { kind: 'datum', axis: 'X' } });
		const ml = await add(e, { id: 'pa', name: '', type: 'pattern', body: 'x1#0', mode: 'linear', axis: { kind: 'reference', feature: 'ax' }, spacing: 5, count: 2 });
		const copy = ml.bodies.find((b) => b.id === 'pa#0')!;
		expect(copy.bounds[0]).toBeCloseTo(5, 6); expect(copy.bounds[3]).toBeCloseTo(9, 6); expect(copy.bounds[1]).toBeCloseTo(0, 6); expect(copy.bounds[4]).toBeCloseTo(3, 6);
		/* Circular about a reference axis through (10, 0) along Z: half a turn puts the box at x = 16..20, y = -3..0. */
		await add(e, { id: 'ac', name: '', type: 'axis', definition: { kind: 'point-direction', point: { kind: 'coordinates', point: [10, 0, 0] }, direction: { kind: 'datum', axis: 'Z' } } });
		const mc = await add(e, { id: 'pc', name: '', type: 'pattern', body: 'x1#0', mode: 'circular', axis: { kind: 'reference', feature: 'ac' }, spacing: 180, count: 2 });
		const turned = mc.bodies.find((b) => b.id === 'pc#0')!;
		expect(turned.bounds[0]).toBeCloseTo(16, 5); expect(turned.bounds[3]).toBeCloseTo(20, 5); expect(turned.bounds[1]).toBeCloseTo(-3, 5); expect(turned.bounds[4]).toBeCloseTo(0, 5);
		/* Mirror across a reference plane at z = 2: the box at z = 0..1 lands at z = 3..4. */
		await add(e, { id: 'pm', name: 'Mirror plane', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 2 } });
		const mm = await add(e, { id: 'mi', name: '', type: 'mirror', bodies: ['x1#0'], plane: { kind: 'reference', feature: 'pm' } });
		const mirrored = mm.bodies.find((b) => b.id === 'mi#0')!;
		expect(mirrored.bounds[2]).toBeCloseTo(3, 6); expect(mirrored.bounds[5]).toBeCloseTo(4, 6);
		expect(row(mm, 'mi').dependsOn).toEqual(['x1', 'pm']);
		/* Following: move the plane to z = 3 and the copy is at z = 5..6. Lost: suppress the plane and the mirror says which plane, by name. */
		const moved = await e.apply({ type: 'set-feature', id: 'pm', patch: { definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 3 } } });
		expect(moved.bodies.find((b) => b.id === 'mi#0')!.bounds[2]).toBeCloseTo(5, 6);
		const lost = await e.apply({ type: 'suppress-feature', id: 'pm', suppressed: true });
		expect(row(lost, 'mi').status).toBe('error');
		expect(row(lost, 'mi').message).toBe(lostReference('plane', 'Mirror plane'));
		expect(lost.bodies.find((b) => b.id === 'mi#0')).toBeUndefined();
		const lostAxis = await e.apply({ type: 'suppress-feature', id: 'ay', suppressed: true });
		expect(row(lostAxis, 'r1').message).toBe(lostReference('axis', 'Spin axis'));
		expect(lostAxis.bodies.find((b) => b.id === 'r1#0')).toBeUndefined();
	});
});
