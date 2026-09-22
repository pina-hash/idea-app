// tests/ideacad-solid-sketching-geometry.test.ts
//
// THE SKETCH EDIT OPERATIONS, PURE AND AGAINST THE REAL KERNEL. Trim, extend,
// corner fillet, join and snap are arithmetic over a shared-point graph, so
// every expected value here is ANALYTIC (a region area, a point position, a
// count of lines) and never a number read off the code and typed back in.
// The fillet is also SOLVED through the kernel's gcs, because a tangent
// constraint the solver refuses would be an arc that stops being tangent on
// the first dimension change; and the two-islands-plus-hole sketch is
// EXTRUDED through the real engine, because "regions() handles it" is the
// claim the extrude has to cash.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { createKernel } from '../src/lib/ideacad/kernel/remus';
import type { Feature, FeatureOf, SketchEntity, Vec2 } from '../src/lib/ideacad/solid/types';
import { crossings, rayHit, curveParam, curvePoint, regions, solveSketch, pointOf, arcSweep, arcSweepToward, arcPoint, inconsistentArcs, TAU } from '../src/lib/ideacad/solid/sketch/model';
import { trimEntity, extendEntity, filletCorner, joinPoints, snapPoint, chainDraft, polygonEntities, rectangleEntities, appendDraft, splitCurves, ensurePoint, arcDraft, type SketchDraft } from '../src/lib/ideacad/solid/sketch/editor';

const WASM = new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'));
const engines: SolidEngine[] = [];
async function engine() { const e = await SolidEngine.create(WASM); engines.push(e); return e; }
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; });

/** A 4x3 rectangle with named ids: p0..p3 counter-clockwise from the origin, l0 the bottom edge. */
function rect(x0 = 0, y0 = 0, w = 4, h = 3, prefix = ''): SketchDraft {
	const p = (i: number) => `${prefix}p${i}`, l = (i: number) => `${prefix}l${i}`;
	return { entities: [
		{ id: p(0), type: 'point', x: x0, y: y0 }, { id: p(1), type: 'point', x: x0 + w, y: y0 }, { id: p(2), type: 'point', x: x0 + w, y: y0 + h }, { id: p(3), type: 'point', x: x0, y: y0 + h },
		{ id: l(0), type: 'line', a: p(0), b: p(1) }, { id: l(1), type: 'line', a: p(1), b: p(2) }, { id: l(2), type: 'line', a: p(2), b: p(3) }, { id: l(3), type: 'line', a: p(3), b: p(0) }
	], constraints: [{ id: `${prefix}h0`, type: 'horizontal', line: l(0) }, { id: `${prefix}v1`, type: 'vertical', line: l(1) }, { id: `${prefix}h2`, type: 'horizontal', line: l(2) }, { id: `${prefix}v3`, type: 'vertical', line: l(3) }] };
}
const line = (id: string, a: string, b: string): SketchEntity => ({ id, type: 'line', a, b });
const point = (id: string, x: number, y: number): SketchEntity => ({ id, type: 'point', x, y });
const lines = (s: SketchDraft) => s.entities.filter((e) => e.type === 'line');
const points = (s: SketchDraft) => s.entities.filter((e) => e.type === 'point');
const curve = (s: SketchDraft, id: string) => s.entities.find((e) => e.id === id && e.type !== 'point') as Exclude<SketchEntity, { type: 'point' }>;

describe('crossings and parameters', () => {
	it('finds a line crossing a line at both parameters, and a line through a circle twice', () => {
		const s: SketchDraft = { entities: [point('a', 0, 0), point('b', 4, 0), line('l', 'a', 'b'), point('c', 2, -1), point('d', 2, 3), line('m', 'c', 'd'), point('o', 6, 0), { id: 'k', type: 'circle', center: 'o', radius: 1 }, point('e', 4, 0), point('f', 8, 0), line('n', 'e', 'f'), point('g', 5, 2), line('w', 'e', 'g')], constraints: [] };
		const x = crossings(s.entities, curve(s, 'l'));
		/* m crosses in the middle; w touches at l's end; n lies along l's own line and so crosses it nowhere. */
		expect(x).toHaveLength(2);
		expect(x.find((c) => c.other === 'm')).toMatchObject({ t: 0.5, tOther: 0.25 }); expect(x.find((c) => c.other === 'm')!.point).toEqual([2, 0]);
		expect(x.find((c) => c.other === 'w')!.t).toBeCloseTo(1, 12); expect(x.find((c) => c.other === 'w')!.tOther).toBeCloseTo(0, 12);
		expect(x.find((c) => c.other === 'n')).toBeUndefined();
		const through = crossings(s.entities, curve(s, 'n')).filter((c) => c.other === 'k').map((c) => c.point[0]).sort();
		expect(through).toEqual([5, 7]);
		/* An arc only crosses on its own sweep: the upper half of the same circle meets the x axis nowhere inside (0, 1). */
		const arc: SketchDraft = { entities: [...s.entities, point('s', 7, 0), point('t', 5, 0), { id: 'u', type: 'arc', center: 'o', start: 's', end: 't' }], constraints: [] };
		const onArc = crossings(arc.entities, curve(arc, 'u')).filter((c) => c.other === 'n' && c.t > 1e-6 && c.t < 1 - 1e-6);
		expect(onArc).toHaveLength(0);
		expect(curvePoint(arc.entities, curve(arc, 'u'), 0.5)).toEqual([expect.closeTo(6, 12), expect.closeTo(1, 12)]);
		expect(curveParam(arc.entities, curve(arc, 'u'), [6, 1])).toBeCloseTo(0.5, 12);
	});
	it('a ray from a point meets the nearest curve ahead and nothing behind', () => {
		const s = rect();
		const hit = rayHit(s.entities, [1, -2], [0, 1], 'none')!;
		expect(hit.other).toBe('l0'); expect(hit.point).toEqual([1, 0]); expect(hit.distance).toBeCloseTo(2, 12);
		expect(rayHit(s.entities, [1, -2], [0, -1], 'none')).toBeNull();
	});
});

describe('trim', () => {
	it('a line through a rectangle: trimming its two stubs joins it to both edges (1 region becomes 2), and trimming it whole restores 1', () => {
		let s = appendDraft(rect(), { entities: [point('c', 2, -1), point('d', 2, 4), line('m', 'c', 'd')], constraints: [] });
		expect(regions(s.entities)).toHaveLength(1);
		s = trimEntity(s, 'm', [2, 3.5]);
		/* The top stub is gone, the line ends on the top edge, and the top edge is split there so the two meet. */
		expect(regions(s.entities)).toHaveLength(1);
		expect(lines(s)).toHaveLength(6);
		const m1 = curve(s, 'm') as Extract<SketchEntity, { type: 'line' }>; expect(pointOf(s.entities, m1.b)).toEqual([2, 3]);
		s = trimEntity(s, 'm', [2, -0.5]);
		const r = regions(s.entities);
		expect(r).toHaveLength(2); expect(r.map((x) => x.area)).toEqual([6, 6]);
		expect(lines(s)).toHaveLength(7); expect(points(s)).toHaveLength(6);
		/* Every point is shared: no orphan was left behind by the removed stubs. */
		s = trimEntity(s, 'm', [2, 1.5]);
		expect(regions(s.entities)).toHaveLength(1); expect(regions(s.entities)[0].area).toBeCloseTo(12, 9);
		expect(lines(s)).toHaveLength(6); expect(s.entities.some((e) => e.id === 'm')).toBe(false);
	});
	it('keeps a horizontal constraint on both pieces of a split edge and drops one whose line is gone', () => {
		let s = appendDraft(rect(), { entities: [point('c', 2, -1), point('d', 2, 4), line('m', 'c', 'd')], constraints: [] });
		s = trimEntity(s, 'm', [2, 3.5]);
		const pieces = lines(s).filter((l) => l.type === 'line' && (l.a === 'p2' || l.b === 'p3' || l.a === 'p3' || l.b === 'p2'));
		const horizontal = s.constraints.filter((c) => c.type === 'horizontal').map((c) => (c as { line: string }).line);
		for (const piece of pieces.filter((p) => p.type === 'line' && (p.a === 'p2' || p.b === 'p3'))) expect(horizontal).toContain(piece.id);
		s = trimEntity(rect(), 'l0', [2, 0]);
		expect(s.constraints.some((c) => c.type === 'horizontal' && (c as { line: string }).line === 'l0')).toBe(false);
		expect(s.constraints).toHaveLength(3);
	});
	it('a circle crossing an edge becomes the arc outside it, the edge splits at both crossings, and the inner edge piece trims away: area 12 + π/2', () => {
		let s = appendDraft(rect(), { entities: [point('o', 4, 1.5), { id: 'k', type: 'circle', center: 'o', radius: 1 }], constraints: [{ id: 'rk', type: 'circleRadius', circle: 'k', value: 1 }] });
		s = trimEntity(s, 'k', [3.5, 1.5]);
		const arc = curve(s, 'k'); expect(arc.type).toBe('arc');
		if (arc.type !== 'arc') throw Error('unreachable');
		expect(pointOf(s.entities, arc.start)).toEqual([4, expect.closeTo(0.5, 9)]); expect(pointOf(s.entities, arc.end)).toEqual([4, expect.closeTo(2.5, 9)]);
		expect(s.constraints.find((c) => c.id === 'rk')).toMatchObject({ type: 'arcRadius', arc: 'k', value: 1 });
		expect(lines(s)).toHaveLength(6);
		const inner = lines(s).find((l) => l.type === 'line' && l.a === arc.start && l.b === arc.end || l.type === 'line' && l.a === arc.end && l.b === arc.start)!;
		s = trimEntity(s, inner.id, [4, 1.5]);
		const r = regions(s.entities);
		/* `regions()` measures a sampled polyline (12 segments on a half circle), so the area is the inscribed polygon's: within 0.02 of the analytic value. */
		expect(r).toHaveLength(1); expect(r[0].area).toBeCloseTo(12 + Math.PI / 2, 1); expect(r[0].area).toBeLessThan(12 + Math.PI / 2);
	});
	it('a curve crossed nowhere is removed whole, with its orphaned points', () => {
		const s = trimEntity(appendDraft(rect(), { entities: [point('c', 6, 6), point('d', 7, 7), line('m', 'c', 'd')], constraints: [] }), 'm', [6.5, 6.5]);
		expect(s.entities.map((e) => e.id).sort()).toEqual(rect().entities.map((e) => e.id).sort());
	});
});

describe('extend, fillet and join', () => {
	it('extends a line to the next edge, moving its own end and splitting the edge it lands on', () => {
		const s = extendEntity(appendDraft(rect(), { entities: [point('c', 1, -2), point('d', 1, -1), line('m', 'c', 'd')], constraints: [] }), 'm', [1, -1.2]);
		const m = curve(s, 'm') as Extract<SketchEntity, { type: 'line' }>;
		expect(pointOf(s.entities, m.b)).toEqual([1, 0]);
		expect(lines(s)).toHaveLength(6); expect(points(s)).toHaveLength(6);
		expect(() => extendEntity(s, 'm', [1, -1.9])).toThrow(/Nothing lies ahead/);
		expect(() => extendEntity(rect(), 'l0', [2, 0])).toThrow(/Nothing lies ahead/);
	});
	it('rounds a rectangle corner with an arc tangent to both lines, solves clean, and refuses a radius the lines cannot hold', async () => {
		const s = filletCorner(rect(), 'l0', 'l1', 1);
		const l0 = curve(s, 'l0') as Extract<SketchEntity, { type: 'line' }>, l1 = curve(s, 'l1') as Extract<SketchEntity, { type: 'line' }>;
		expect(pointOf(s.entities, l0.b)).toEqual([expect.closeTo(3, 9), expect.closeTo(0, 9)]); expect(pointOf(s.entities, l1.a)).toEqual([expect.closeTo(4, 9), expect.closeTo(1, 9)]);
		const arc = s.entities.find((e) => e.type === 'arc') as Extract<SketchEntity, { type: 'arc' }>;
		expect(pointOf(s.entities, arc.center)).toEqual([expect.closeTo(3, 9), expect.closeTo(1, 9)]);
		expect(s.entities.some((e) => e.id === 'p1')).toBe(false);
		expect(s.constraints.filter((c) => c.type === 'tangentLineArc')).toHaveLength(2);
		/* A rounded 4x3 rectangle loses one square corner: r²(1 - π/4). The sampled quarter arc (6 segments) reads within 0.01 of it. */
		expect(regions(s.entities)[0].area).toBeCloseTo(12 - (1 - Math.PI / 4), 1);
		const k = await createKernel(WASM);
		const solved = solveSketch(k, s);
		expect(solved.report.converged).toBe(true); expect(['solved', 'underConstrained']).toContain(solved.report.classification);
		expect(regions(solved.entities)[0].area).toBeCloseTo(12 - (1 - Math.PI / 4), 1);
		k.free();
		expect(() => filletCorner(rect(), 'l0', 'l1', 5)).toThrow(/larger than the lines allow/);
		expect(() => filletCorner(rect(), 'l0', 'l2', 1)).toThrow(/meet at a corner/);
		expect(() => filletCorner(rect(), 'l0', 'l1', 0)).toThrow(/greater than zero/);
	});
	it('joins two points so their lines share one, and refuses a line that would start and end at one point', () => {
		const open: SketchDraft = { entities: [point('a', 0, 0), point('b', 4, 0), point('c', 4, 3), point('d', 0, 3), point('e', 0.01, 0.01), line('l0', 'a', 'b'), line('l1', 'b', 'c'), line('l2', 'c', 'd'), line('l3', 'd', 'e')], constraints: [] };
		expect(regions(open.entities)).toHaveLength(0);
		const closed = joinPoints(open, 'e', 'a');
		expect(regions(closed.entities)).toHaveLength(1); expect(closed.entities.some((e) => e.id === 'e')).toBe(false);
		expect(() => joinPoints(closed, 'b', 'a')).toThrow(/cannot start and end at the same point/);
	});
	it('splits a circle into two arcs at two points, and leaves it whole at one', () => {
		const one: SketchDraft = { entities: [point('o', 0, 0), { id: 'k', type: 'circle', center: 'o', radius: 1 }, point('s', 1, 0), point('t', -1, 0)], constraints: [] };
		expect(splitCurves(one, new Map([['k', ['s']]])).entities.find((e) => e.id === 'k')!.type).toBe('circle');
		const two = splitCurves(one, new Map([['k', ['s', 't']]]));
		expect(two.entities.filter((e) => e.type === 'arc')).toHaveLength(2); expect(two.entities.some((e) => e.type === 'circle')).toBe(false);
		expect(regions(two.entities)[0].area).toBeCloseTo(Math.PI, 1);
		expect(ensurePoint(one, [1, 1e-9]).id).toBe('s'); expect(ensurePoint(one, [1, 0.5]).created).toBe(true);
	});
});

describe('snapping and drafts', () => {
	it('snaps to a point over the origin, to the origin over an alignment, and level or plumb with the reference', () => {
		const s = rect();
		expect(snapPoint([3.95, 0.05], { entities: s.entities, radius: 0.2 })).toMatchObject({ kind: 'point', point: 'p1', at: [4, 0] });
		expect(snapPoint([0.05, 0.1], { entities: s.entities, radius: 0.2 })).toMatchObject({ kind: 'point', point: 'p0' });
		expect(snapPoint([0.05, 0.1], { entities: s.entities, radius: 0.2, exclude: new Set(['p0']) })).toMatchObject({ kind: 'origin', at: [0, 0] });
		expect(snapPoint([2, 1.05], { entities: [], radius: 0.2, reference: [0, 1] })).toMatchObject({ kind: 'horizontal', at: [2, 1] });
		expect(snapPoint([0.1, 2], { entities: [], radius: 0.2, reference: [0, 0] })).toMatchObject({ kind: 'vertical', at: [0, 2] });
		expect(snapPoint([2, 2], { entities: [], radius: 0.2, reference: [0, 0] })).toMatchObject({ kind: 'none', at: [2, 2] });
	});
	it('a chain draft reuses a snapped point, closes on its first anchor, and records level and plumb steps as constraints', () => {
		const s = rect();
		const draft = chainDraft([{ at: [4, 3], point: 'p2', kind: 'point' }, { at: [6, 3], kind: 'horizontal' }, { at: [6, 5], kind: 'vertical' }, { at: [4, 5], kind: 'horizontal' }], true);
		expect(draft.entities.filter((e) => e.type === 'point')).toHaveLength(3); expect(draft.entities.filter((e) => e.type === 'line')).toHaveLength(4);
		expect(draft.constraints.map((c) => c.type)).toEqual(['horizontal', 'vertical', 'horizontal']);
		expect(regions(appendDraft(s, draft).entities).map((r) => r.area)).toEqual([12, 4]);
	});
	it('an eight-sided polygon is eight equal lines closing one region', () => {
		const draft = polygonEntities([0, 0], [2, 0], 8);
		expect(draft.entities.filter((e) => e.type === 'line')).toHaveLength(8);
		const lengths = draft.entities.filter((e) => e.type === 'line').map((l) => { const a = pointOf(draft.entities, (l as { a: string }).a), b = pointOf(draft.entities, (l as { b: string }).b); return Math.hypot(b[0] - a[0], b[1] - a[1]); });
		for (const n of lengths) expect(n).toBeCloseTo(2 * Math.sqrt(2 - Math.SQRT2), 9);
		expect(regions(draft.entities)[0].area).toBeCloseTo(2 * Math.SQRT2 * 4, 9);
	});
	it('reports Under defined with 4 free for a drawn rectangle and 3 free with one distance added', async () => {
		const k = await createKernel(WASM);
		const s = rectangleEntities([0, 0], [4, 3]);
		const plain = solveSketch(k, s);
		expect(plain.report.classification).toBe('underConstrained'); expect(plain.report.dof).toBe(4);
		const l0 = s.entities.find((e) => e.type === 'line') as Extract<SketchEntity, { type: 'line' }>;
		const dimensioned = solveSketch(k, { ...s, constraints: [...s.constraints, { id: 'd', type: 'distance', a: l0.a, b: l0.b, value: 5 }] });
		expect(dimensioned.report.classification).toBe('underConstrained'); expect(dimensioned.report.dof).toBe(3);
		expect(regions(dimensioned.entities)[0].area).toBeCloseTo(15, 6);
		k.free();
	});
});

describe('two islands and a hole through the real engine', () => {
	const sketch = (): FeatureOf<'sketch'> => {
		const a = rect(0, 0, 4, 3, 'a'), b = rect(6, 0, 2, 2, 'b');
		return { id: 's', name: 'Sketch', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [...a.entities, ...b.entities, point('o', 2, 1.5), { id: 'k', type: 'circle', center: 'o', radius: 0.5 }], constraints: [...a.constraints, ...b.constraints] };
	};
	it('extrudes both islands, the hole cut from the first, and one when the extrude names one region', async () => {
		const e = await engine();
		await e.apply({ type: 'add-feature', feature: sketch() as Feature });
		const m = await e.apply({ type: 'add-feature', feature: { id: 'x', name: 'Extrude', type: 'extrude', sketch: 's', distance: 2, operation: 'new' } });
		expect(m.sketches[0].regions.map((r) => r.id)).toEqual(['r0', 'r1']);
		expect(m.bodies).toHaveLength(2);
		expect(m.bodies.map((b) => b.volume).sort((x, y) => x - y)).toEqual([expect.closeTo(8, 6), expect.closeTo((12 - Math.PI * 0.25) * 2, 6)]);
		const one = await e.apply({ type: 'set-feature', id: 'x', patch: { regions: ['r1'] } });
		expect(one.bodies).toHaveLength(1); expect(one.bodies[0].volume).toBeCloseTo(8, 6);
		expect(one.features.find((f) => f.id === 'x')!.status).toBe('ok');
	});
});

/**
 * WHAT THE KERNEL DOES WITH AN ARC WHOSE TWO ENDS SIT AT DIFFERENT DISTANCES
 * FROM ITS CENTER. Ledger 0275 could not answer this from a comment and the
 * prompt that raised it expected the seam to be unreadable from a container,
 * so the whole arc design was to be made not to depend on the answer. The
 * answer is reachable -- the wasm is committed and the suite already loads it
 * -- and it is sharp enough to be worth pinning: the kernel REFUSES such an
 * edge outright, and its 2D solver couples the two radii, so an inconsistent
 * arc is never merely cosmetic. Both facts are load-bearing for
 * `arcDraft` and for `inconsistentArcs`, so both are asserted here rather
 * than recorded in prose that nothing checks.
 */
describe('an arc with two radii, against the real kernel', () => {
	const flat = (start: Vec2, end: Vec2): [number, number, number, number, number, number, number, number, number, number, number, number] =>
		[start[0], start[1], 0, end[0], end[1], 0, 0, 0, 0, 0, 0, 1];

	it('refuses the edge outright, down to one part in a million, and builds the consistent one beside it', async () => {
		const k = await createKernel(WASM);
		{
			/* The positive control first, so a refusal below cannot be the kernel refusing everything. */
			expect(typeof k.makeCircleArc3d(...flat([1, 0], [0, 1]))).toBe('number');
			for (const [label, end] of [['three times the radius', [0, 3]], ['one part in ten thousand', [0, 1.0001]], ['one part in a million', [0, 1.000001]]] as [string, Vec2][]) {
				expect(() => k.makeCircleArc3d(...flat([1, 0], end)), label).toThrow(/edge vertices do not agree/);
			}
			/* And the two degeneracies a third click used to be able to commit. */
			expect(() => k.makeCircleArc3d(...flat([0, 0], [0, 0]))).toThrow(/coincides with center/);
			expect(() => k.makeCircleArc3d(...flat([1, 0], [0, 0]))).toThrow(/non-zero span/);
		}
	});

	it('couples the two radii in its 2D solver, so a constraint anywhere teleports a mismatched end onto the radius', async () => {
		const k = await createKernel(WASM);
		{
			/* THE COUPLING IS ONE EQUATION, and a line over the same three points is the control that it is the ARC contributing it. */
			const dof = (kind: 'none' | 'line' | 'arc') => {
				const s = k.gcsNew();
				const c = k.gcsAddPoint(s, 0, 0, true), a = k.gcsAddPoint(s, 1, 0, false), b = k.gcsAddPoint(s, 0, 3, false);
				if (kind === 'line') k.gcsAddLine(s, a, b);
				if (kind === 'arc') k.gcsAddArc(s, c, a, b);
				const raw = k.gcsDof(s);
				return (typeof raw === 'string' ? JSON.parse(raw) : raw) as { dof: number; numParams: number; numEquations: number };
			};
			expect(dof('none')).toMatchObject({ numParams: 4, numEquations: 0, dof: 4 });
			expect(dof('line')).toMatchObject({ numParams: 4, numEquations: 0, dof: 4 });
			expect(dof('arc')).toMatchObject({ numParams: 4, numEquations: 1, dof: 3 });

			/* Behaviourally: the end three inches out is pulled onto the start's one inch by the first solve, and nothing asked it to move. */
			const s = k.gcsNew();
			const c = k.gcsAddPoint(s, 0, 0, true), a = k.gcsAddPoint(s, 1, 0, false), b = k.gcsAddPoint(s, 0, 3, false);
			k.gcsAddArc(s, c, a, b);
			k.gcsAddConstraint(s, JSON.stringify({ type: 'fixX', point: a, value: 1 }));
			k.gcsSolveDetailed(s, 400, 1e-12);
			const end = Array.from(k.gcsPointPosition(s, b));
			expect(Math.hypot(end[0], end[1])).toBeCloseTo(1, 9);
			expect(Array.from(k.gcsPointPosition(s, a))).toEqual([expect.closeTo(1, 9), expect.closeTo(0, 9)]);
		}
	});

	it('refuses the extrude of a profile carrying one, and builds the same profile once the radii agree', async () => {
		const profile = (end: Vec2): Feature => ({
			id: 'profile', name: 'Profile', type: 'sketch', plane: { kind: 'datum', datum: 'XY' },
			entities: [
				{ id: 'c', type: 'point', x: 0, y: 0 }, { id: 's', type: 'point', x: 1, y: 0 }, { id: 'e', type: 'point', x: end[0], y: end[1] },
				{ id: 'a', type: 'arc', center: 'c', start: 's', end: 'e' }, { id: 'l', type: 'line', a: 'e', b: 's' }
			], constraints: []
		});
		const build = async (end: Vec2) => {
			const e = await engine();
			await e.apply({ type: 'add-feature', feature: profile(end) });
			return e.apply({ type: 'add-feature', feature: { id: 'x', name: 'Extrude', type: 'extrude', sketch: 'profile', distance: 1, operation: 'new' } });
		};
		/*
		 * The chord runs end to start, so the region is a circular SEGMENT and
		 * not a quarter disc: r^2/2 * (theta - sin theta) at r = 1 and theta =
		 * pi/2, which is pi/4 - 1/2, one inch thick.
		 */
		const ok = await build([0, 1]);
		expect(ok.bodies).toHaveLength(1);
		expect(ok.bodies[0].volume).toBeCloseTo(Math.PI / 4 - 0.5, 3);
		await expect(build([0, 3])).rejects.toThrow(/edge vertices do not agree/);
		/* Which is why the sketch says so in its own words rather than leaving a student to read that sentence. */
		const entitiesOf = (end: Vec2) => (profile(end) as FeatureOf<'sketch'>).entities;
		expect(inconsistentArcs(entitiesOf([0, 3]))).toEqual(['a']);
		expect(inconsistentArcs(entitiesOf([0, 1]))).toEqual([]);
	});
});

describe('which arc a third click asks for', () => {
	const C: Vec2 = [0, 0], S: Vec2 = [1, 0];
	const deg = (n: number) => n * 180 / Math.PI;
	const at = (d: number): Vec2 => [Math.cos(d * Math.PI / 180), Math.sin(d * Math.PI / 180)];

	it('is signed, is the short way round, and is never more than a half turn without Shift', () => {
		for (const d of [-179, -170, -90, -45, -1, -0.001, 0.001, 1, 45, 90, 170, 179]) {
			expect(deg(arcSweepToward(C, S, at(d))), `${d} degrees`).toBeCloseTo(d, 9);
			expect(Math.abs(arcSweepToward(C, S, at(d)))).toBeLessThanOrEqual(Math.PI + 1e-9);
		}
		/* Exactly opposite is the one tie, and it is broken counter-clockwise so the answer is total. */
		expect(deg(arcSweepToward(C, S, [-1, 0]))).toBeCloseTo(180, 9);
		expect(deg(arcSweepToward(C, S, [-1, 0], true))).toBeCloseTo(-180, 9);
		/* The distance of the click from the center changes nothing: it is a direction. */
		for (const r of [0.01, 0.5, 1, 4, 1000]) expect(deg(arcSweepToward(C, S, [r * Math.cos(-0.7), r * Math.sin(-0.7)]))).toBeCloseTo(deg(-0.7), 9);
	});

	it('takes the long way to the SAME end point under Shift, so the pair is exhaustive', () => {
		for (const d of [-170, -90, -10, 10, 90, 170]) {
			const minor = arcSweepToward(C, S, at(d)), major = arcSweepToward(C, S, at(d), true);
			expect(Math.abs(minor) + Math.abs(major)).toBeCloseTo(TAU, 9);
			expect(Math.sign(major)).toBe(-Math.sign(minor));
			/* The same end point: the two arcs differ only in which way round they reach it. */
			const a = arcPoint(C, S, minor, 1), b = arcPoint(C, S, major, 1);
			expect(a[0]).toBeCloseTo(b[0], 9); expect(a[1]).toBeCloseTo(b[1], 9);
		}
	});

	it('is a different question from `arcSweep`, which still answers about a STORED arc', () => {
		/* The stored reading is unsigned and counter-clockwise, which is what every reader of an arc entity needs and what made the tool wrong. */
		expect(deg(arcSweep(C, S, at(-10)))).toBeCloseTo(350, 9);
		expect(deg(arcSweepToward(C, S, at(-10)))).toBeCloseTo(-10, 9);
		/* And they agree exactly where the drawn arc did run counter-clockwise. */
		for (const d of [10, 90, 170]) expect(deg(arcSweep(C, S, at(d)))).toBeCloseTo(deg(arcSweepToward(C, S, at(d))), 9);
	});

	/*
	 * `arcDraft` IS TESTED ON ITS OWN INPUT, not only through the session, and
	 * a mutation run is what said so. `SketchSession` hands it a third click
	 * its own `arcSnap` has ALREADY projected onto the circle, so replacing
	 * `arcDraft`'s projection with the raw click changes nothing reachable
	 * from a session test and the mutant survived all fifty-eight of them.
	 * Two layers holding one guarantee is the right shape -- the preview and
	 * the commit both go through this function -- but each has to be asserted
	 * where it can fail.
	 */
	it('projects any third click onto the start radius, however far off it the click was', () => {
		const far: Vec2[] = [[0, 3], [0.02, 2.98], [7, -7], [0.05, -0.05], [-1000, 1]];
		for (const towards of far) {
			for (const major of [false, true]) {
				const draft = arcDraft({ at: C, kind: 'none' }, { at: S, kind: 'none' }, towards, major);
				const arc = draft.entities.find((e) => e.type === 'arc') as Extract<SketchEntity, { type: 'arc' }>;
				const c = pointOf(draft.entities, arc.center), st = pointOf(draft.entities, arc.start), en = pointOf(draft.entities, arc.end);
				expect(Math.hypot(st[0] - c[0], st[1] - c[1]), `${towards} major=${major}`).toBeCloseTo(1, 12);
				expect(Math.hypot(en[0] - c[0], en[1] - c[1]), `${towards} major=${major}`).toBeCloseTo(1, 12);
				expect(inconsistentArcs(draft.entities)).toEqual([]);
				/*
				 * And the NEW end is on the RAY to the click, which is what
				 * makes the projection the right one rather than merely a
				 * consistent one. It is not always `arc.end`: a clockwise arc
				 * is stored with its ends swapped, so the new end is whichever
				 * of the two is not the start the caller placed.
				 */
				const other = Math.hypot(st[0] - S[0], st[1] - S[1]) < 1e-12 ? en : st;
				const wanted = Math.atan2(towards[1], towards[0]), got = Math.atan2(other[1], other[0]);
				expect(Math.abs(Math.atan2(Math.sin(got - wanted), Math.cos(got - wanted))), `${towards} major=${major}`).toBeLessThan(1e-9);
			}
		}
		/* The positive control: handed the raw click as the end, every one of those would be off the radius. */
		for (const towards of far) expect(Math.abs(Math.hypot(towards[0], towards[1]) - 1)).toBeGreaterThan(1e-6);
	});

	it('names every arc whose ends disagree, and no arc whose ends agree', () => {
		const arc = (end: Vec2): SketchEntity[] => [
			{ id: 'c', type: 'point', x: 0, y: 0 }, { id: 's', type: 'point', x: 1, y: 0 }, { id: 'e', type: 'point', x: end[0], y: end[1] },
			{ id: 'a', type: 'arc', center: 'c', start: 's', end: 'e' }
		];
		for (const end of [[0, 3], [0, 1.0001], [0, 0], [2, 0]] as Vec2[]) expect(inconsistentArcs(arc(end)), String(end)).toEqual(['a']);
		for (const d of [-170, -90, 10, 90, 179]) expect(inconsistentArcs(arc(at(d))), `${d} degrees`).toEqual([]);
		/* A radius of zero is named too, which is neither of the two above: every point is the same point. */
		expect(inconsistentArcs([{ id: 'c', type: 'point', x: 0, y: 0 }, { id: 's', type: 'point', x: 0, y: 0 }, { id: 'e', type: 'point', x: 0, y: 0 }, { id: 'a', type: 'arc', center: 'c', start: 's', end: 'e' }])).toEqual(['a']);
		/* And a sketch with no arc in it at all is not a finding. */
		expect(inconsistentArcs(rect().entities)).toEqual([]);
	});
});
