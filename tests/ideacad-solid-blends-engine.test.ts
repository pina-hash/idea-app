// tests/ideacad-solid-blends-engine.test.ts
//
// FILLETS, CHAMFERS AND THE FEATURES THAT COMPLETE THEM, driven through the
// REAL engine and the REAL kernel. Every volume asserted is an ANALYTIC value
// or an analytic bracket, never a number read off the kernel and typed back
// (Addendum A5.3); where the kernel's own convention decides the geometry
// (the chamfer's angle mode, the draft's sign) the test states which
// convention was MEASURED and pins it, so a kernel that changes it reddens.
//
// Both directions are asserted on every gating claim: tangent propagation
// on versus off on the same fixture, a per-face wall thickness against the
// uniform shell, a through hole against a blind one.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { createKernel } from '../src/lib/ideacad/kernel/remus';
import type { EdgeRef, FaceRef, Feature, FeatureOf, ModelProjection } from '../src/lib/ideacad/solid/types';
import { refFromSelection } from '../src/lib/ideacad/solid/naming';
import { tangentChain } from '../src/lib/ideacad/solid/features/blends';
import { openChain } from '../src/lib/ideacad/solid/features/extra';
import { HOLE_STANDARDS, figureInches, holeDiameter, describeHole } from '../src/lib/ideacad/solid/features/holes';
import { DEFAULT_FEATURE_OPTIONS, featureOptions, resetFeatureOptions, withOptions } from '../src/lib/ideacad/solid/features/options';

const WASM = new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'));
const engines: SolidEngine[] = [];
async function engine() { const e = await SolidEngine.create(WASM); engines.push(e); return e; }
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; resetFeatureOptions(); });

function rectangle(id: string, x0: number, y0: number, w: number, h: number, plane: FeatureOf<'sketch'>['plane'] = { kind: 'datum', datum: 'XY' }): FeatureOf<'sketch'> {
	return { id, name: `Sketch ${id}`, type: 'sketch', plane, entities: [
		{ id: 'p0', type: 'point', x: x0, y: y0 }, { id: 'p1', type: 'point', x: x0 + w, y: y0 }, { id: 'p2', type: 'point', x: x0 + w, y: y0 + h }, { id: 'p3', type: 'point', x: x0, y: y0 + h },
		{ id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }
	], constraints: [] };
}
function circle(id: string, cx: number, cy: number, r: number, plane: FeatureOf<'sketch'>['plane']): FeatureOf<'sketch'> {
	return { id, name: `Sketch ${id}`, type: 'sketch', plane, entities: [{ id: 'c', type: 'point', x: cx, y: cy }, { id: 'k', type: 'circle', center: 'c', radius: r }], constraints: [] };
}
const add = (e: SolidEngine, feature: Feature) => e.apply({ type: 'add-feature', feature });
const row = (m: ModelProjection, id: string) => m.features.find((f) => f.id === id)!;
const BOX = { w: 4, h: 3, d: 1 };
/** The 4x3x1 box every case starts from: sketch `s1` on XY, extrude `x1`, body `x1#0`, faces x1.start (z=0), x1.end (z=1), x1.side.0 (y=0), .1 (x=4), .2 (y=3), .3 (x=0). */
async function box(e: SolidEngine) { await add(e, rectangle('s1', 0, 0, BOX.w, BOX.h)); return add(e, { id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: BOX.d, operation: 'new' }); }
const edgeBetween = (m: ModelProjection, a: string, b: string) => m.bodies[0].edges.find((ed) => ed.faces.includes(a) && ed.faces.includes(b))!;
const edgeRef = (m: ModelProjection, a: string, b: string) => refFromSelection({ bodyId: 'x1#0', kind: 'edge', id: edgeBetween(m, a, b).id }, m.bodies[0]) as EdgeRef;
const faceRef = (m: ModelProjection, name: string) => refFromSelection({ bodyId: 'x1#0', kind: 'face', id: name }, m.bodies[0]) as FaceRef;
/** A quarter-round removed along an edge of length L: r²(1 - π/4)L. */
const rounded = (r: number, length: number) => r * r * (1 - Math.PI / 4) * length;

describe('fillets', () => {
	it('rounds three edges at once, parallel so no corners meet, at 0.2: 12 - 3 r²(1 - π/4) L exactly, one blend face per edge named between its two faces', async () => {
		const e = await engine(); const m0 = await box(e);
		const edges = [edgeRef(m0, 'x1.end', 'x1.side.0'), edgeRef(m0, 'x1.end', 'x1.side.2'), edgeRef(m0, 'x1.start', 'x1.side.0')];
		const m = await add(e, { id: 'f1', name: 'Fillet 1', type: 'fillet', edges, radius: 0.2 });
		expect(row(m, 'f1').status).toBe('ok');
		expect(m.bodies[0].volume).toBeCloseTo(12 - 3 * rounded(0.2, BOX.w), 9);
		const blends = m.bodies[0].faces.filter((f) => f.id.startsWith('f1.blend.'));
		expect(blends.map((f) => f.id).sort()).toEqual(['f1.blend.x1.end|x1.side.0', 'f1.blend.x1.end|x1.side.2', 'f1.blend.x1.side.0|x1.start']);
		expect(blends.every((f) => f.kind === 'cylinder')).toBe(true);
	});
	it('a face gives all its edges: the four edges FaceProjection.edges lists round together, and the removal sits inside the analytic bracket', async () => {
		const e = await engine(); const m0 = await box(e);
		const top = m0.bodies[0].faces.find((f) => f.id === 'x1.end')!;
		expect(top.edges).toHaveLength(4);
		const edges = top.edges.map((id) => refFromSelection({ bodyId: 'x1#0', kind: 'edge', id }, m0.bodies[0]) as EdgeRef);
		const r = 0.2;
		const m = await add(e, { id: 'f1', name: 'Fillet 1', type: 'fillet', edges, radius: r });
		expect(row(m, 'f1').status).toBe('ok');
		/* Straight portions only (a lower bound on what is removed) up to straight portions plus the four whole corner cubes (an upper bound). */
		const straight = 2 * rounded(r, BOX.w - 2 * r) + 2 * rounded(r, BOX.h - 2 * r);
		expect(m.bodies[0].volume).toBeLessThan(12 - straight);
		expect(m.bodies[0].volume).toBeGreaterThan(12 - straight - 4 * r * r * r);
		expect(m.bodies[0].faces.filter((f) => f.id.startsWith('f1.blend.') && f.kind === 'cylinder')).toHaveLength(4);
	});
	it('propagates along a tangent chain: one edge of the ring around a rounded box top carries the round to all eight; without propagate the kernel cannot end a round at a tangent edge and the edit is refused with its sentence', async () => {
		const e = await engine(); const m0 = await box(e);
		const vertical = ['x1.side.0|x1.side.1', 'x1.side.1|x1.side.2', 'x1.side.2|x1.side.3', 'x1.side.0|x1.side.3'].map((pair) => { const [a, b] = pair.split('|'); return edgeRef(m0, a, b); });
		const m1 = await add(e, { id: 'f1', name: 'Corners', type: 'fillet', edges: vertical, radius: 0.3 });
		expect(row(m1, 'f1').status).toBe('ok');
		const top = m1.bodies[0].faces.find((f) => f.id === 'x1.end')!;
		expect(top.edges).toHaveLength(8);
		const one = refFromSelection({ bodyId: 'x1#0', kind: 'edge', id: edgeBetween(m1, 'x1.end', 'x1.side.0').id }, m1.bodies[0]) as EdgeRef;
		const on = await add(e, { id: 'f2', name: 'Rim', type: 'fillet', edges: [one], radius: 0.1, propagate: true });
		expect(row(on, 'f2').status).toBe('ok');
		const onBlends = on.bodies[0].faces.filter((f) => f.id.startsWith('f2.blend.'));
		expect(onBlends).toHaveLength(8);
		/* Four straight runs are cylinders; the four corner runs around the rounded corners are curved patches the kernel reports as bspline. */
		expect(onBlends.filter((f) => f.kind === 'cylinder')).toHaveLength(4);
		expect(onBlends.filter((f) => f.kind !== 'cylinder' && f.kind !== 'plane')).toHaveLength(4);
		/* The four straight blends are exact cylinders of the typed radius. The removed volume is bounded above by the straight runs plus four whole corner cubes; it is NOT asserted against the ideal quarter-round below, because the kernel's corner patches are approximations: measured 0.0225 in³ removed against 0.0249 for the straight runs alone. */
		for (const f of onBlends.filter((x) => x.kind === 'cylinder')) expect(f.surface.radius).toBeCloseTo(0.1, 9);
		const removed = m1.bodies[0].volume - on.bodies[0].volume;
		expect(removed).toBeGreaterThan(0);
		expect(removed).toBeLessThan(rounded(0.1, 2 * (BOX.w - 0.6) + 2 * (BOX.h - 0.6)) + 4 * 0.1 * 0.1 * 0.1);
		/* The other direction: the same feature with propagation off is ONE edge ending at two tangent edges, which this kernel refuses; the edit is refused in the student's words (never the kernel's text) and the rim stays. */
		await expect(e.apply({ type: 'set-feature', id: 'f2', patch: { propagate: false } })).rejects.toThrow('This edge runs smoothly on into the next edges, and a round cannot stop partway along them.');
		const still = e.project();
		expect(row(still, 'f2').status).toBe('ok');
		expect(still.bodies[0].faces.filter((f) => f.id.startsWith('f2.blend.'))).toHaveLength(8);
		expect(still.features[3].summary).toBe('R 0.1 in · 1 edge');
	});
	it('tangentChain stops at a sharp corner: on a plain box every edge is its own chain', async () => {
		const k = await createKernel(WASM);
		const solid = k.makeBox(4, 3, 1); const edges = [...k.getSolidEdges(solid)];
		expect(edges).toHaveLength(12);
		for (const edge of edges) expect(tangentChain(k, solid, [edge])).toEqual([edge]);
		expect(tangentChain(k, solid, [edges[0], edges[1], edges[0]])).toEqual([edges[0], edges[1]]);
		k.free();
	});
	it('a variable radius runs from the radius to the end value: the removal lies between the two constant rounds and the blend is a bspline face named between its faces', async () => {
		const e = await engine(); const m0 = await box(e);
		const edge = edgeRef(m0, 'x1.end', 'x1.side.0');
		const m = await add(e, { id: 'f1', name: 'Fillet 1', type: 'fillet', edges: [edge], radius: 0.1, variable: { end: 0.3, law: 'linear' } });
		expect(row(m, 'f1').status).toBe('ok');
		expect(m.bodies[0].volume).toBeLessThan(12 - rounded(0.1, BOX.w));
		expect(m.bodies[0].volume).toBeGreaterThan(12 - rounded(0.3, BOX.w));
		const blend = m.bodies[0].faces.find((f) => f.id === 'f1.blend.x1.end|x1.side.0');
		expect(blend?.kind).toBe('bspline');
		expect(m.features[2].summary).toBe('R 0.1 in → 0.3 in · 1 edge');
	});
});

describe('chamfers', () => {
	it('two distances bevel asymmetrically: 12 - ½ d1 d2 L, named as a bevel', async () => {
		const e = await engine(); const m0 = await box(e);
		const m = await add(e, { id: 'c1', name: 'Chamfer 1', type: 'chamfer', edges: [edgeRef(m0, 'x1.end', 'x1.side.0')], distance: 0.2, distance2: 0.4 });
		expect(row(m, 'c1').status).toBe('ok');
		expect(m.bodies[0].volume).toBeCloseTo(12 - 0.5 * 0.2 * 0.4 * BOX.w, 9);
		expect(m.bodies[0].faces.find((f) => f.id === 'c1.bevel.x1.end|x1.side.0')?.kind).toBe('plane');
		expect(m.features[2].summary).toBe('0.2 in × 0.4 in');
	});
	it('distance and angle: the kernel sets the distance back along one face and the other leg is distance × tan(angle), measured, so 12 - ½ d (d tan θ) L', async () => {
		const e = await engine(); const m0 = await box(e);
		const m = await add(e, { id: 'c1', name: 'Chamfer 1', type: 'chamfer', edges: [edgeRef(m0, 'x1.end', 'x1.side.0')], distance: 0.2, angle: 30 });
		expect(row(m, 'c1').status).toBe('ok');
		expect(m.bodies[0].volume).toBeCloseTo(12 - 0.5 * 0.2 * (0.2 * Math.tan(Math.PI / 6)) * BOX.w, 9);
		await expect(e.apply({ type: 'set-feature', id: 'c1', patch: { angle: 90 } })).rejects.toThrow('Use a chamfer angle between 0 and 90 degrees.');
	});
});

describe('holes', () => {
	it('drills a tapped 1/4-20 through the top: a cylinder face h1.wall at the tap drill radius, no bottom, and π r² × 1 removed', async () => {
		const e = await engine(); const m0 = await box(e);
		const m = await add(e, { id: 'h1', name: 'Hole 1', type: 'hole', face: faceRef(m0, 'x1.end'), center: [2, 1.5], standard: '1/4-20', fit: 'tapped', depth: 'through' });
		expect(row(m, 'h1').status).toBe('ok');
		const r = 0.201 / 2;
		expect(m.bodies[0].volume).toBeCloseTo(12 - Math.PI * r * r * BOX.d, 9);
		const wall = m.bodies[0].faces.find((f) => f.id === 'h1.wall');
		expect(wall?.kind).toBe('cylinder');
		expect(wall?.surface.radius).toBeCloseTo(r, 9);
		expect(m.bodies[0].faces.some((f) => f.id === 'h1.bottom')).toBe(false);
		expect(m.bodies[0].faces.map((f) => f.id)).toContain('x1.end');
		expect(m.features[2].summary).toBe('1/4-20 tapped');
	});
	it('a blind hole stops at its depth with a bottom face; a close-fit hole is wider than a tapped one; a custom diameter is used as typed', async () => {
		const e = await engine(); const m0 = await box(e);
		const m = await add(e, { id: 'h1', name: 'Hole 1', type: 'hole', face: faceRef(m0, 'x1.end'), center: [1, 1], standard: '1/4-20', fit: 'close', depth: 0.5 });
		expect(row(m, 'h1').status).toBe('ok');
		const r = 17 / 64 / 2;
		expect(m.bodies[0].volume).toBeCloseTo(12 - Math.PI * r * r * 0.5, 9);
		const bottom = m.bodies[0].faces.find((f) => f.id === 'h1.bottom');
		expect(bottom?.kind).toBe('plane'); expect(bottom?.center[2]).toBeCloseTo(0.5, 9);
		const custom = await e.apply({ type: 'set-feature', id: 'h1', patch: { fit: 'custom', diameter: 0.5 } });
		expect(custom.bodies[0].volume).toBeCloseTo(12 - Math.PI * 0.25 * 0.25 * 0.5, 9);
		await expect(e.apply({ type: 'set-feature', id: 'h1', patch: { fit: 'custom', diameter: undefined } })).rejects.toThrow('Enter a hole diameter in inches, like 0.25.');
		await expect(e.apply({ type: 'set-feature', id: 'h1', patch: { fit: 'normal', standard: '7/16-14' } })).rejects.toThrow('7/16-14 is not in the hole chart.');
	});
	it('every listed size has three sourced fits, tapped < close < normal, and a metric figure is converted from the millimetres its chart prints', () => {
		expect(HOLE_STANDARDS.length).toBe(14);
		for (const s of HOLE_STANDARDS) {
			for (const fit of ['tapped', 'close', 'normal'] as const) { expect(s[fit].source.length).toBeGreaterThan(5); expect(s[fit].diameter).toBeGreaterThan(0); }
			expect(figureInches(s.tapped)).toBeLessThan(figureInches(s.close));
			expect(figureInches(s.close)).toBeLessThan(figureInches(s.normal));
		}
		expect(holeDiameter('M6', 'close')).toBeCloseTo(6.4 / 25.4, 12);
		expect(holeDiameter('#4-40', 'tapped')).toBe(0.089);
		expect(describeHole('1/4-20', 'tapped')).toBe('#7 drill, 0.201 in');
		expect(describeHole('M8', 'normal')).toBe('9.0 mm drill, 0.3543 in');
	});
});

describe('shell, draft, sweep, loft, rib', () => {
	it('shells with one open face: 12 - (4 - 0.2)(3 - 0.2)(1 - 0.1); a wall with its own thickness moves its inner face by the difference', async () => {
		const e = await engine(); const m0 = await box(e);
		const m = await add(e, { id: 'sh1', name: 'Shell 1', type: 'shell', body: 'x1#0', thickness: 0.1, openFaces: [faceRef(m0, 'x1.end')] });
		expect(row(m, 'sh1').status).toBe('ok');
		expect(m.bodies[0].volume).toBeCloseTo(12 - 3.8 * 2.8 * 0.9, 9);
		expect(m.bodies[0].faces.map((f) => f.id)).toContain('sh1.inner.x1.start');
		const thick = await e.apply({ type: 'set-feature', id: 'sh1', patch: { faceThickness: [{ face: faceRef(m0, 'x1.start'), thickness: 0.25 }] } });
		expect(row(thick, 'sh1').status).toBe('ok');
		expect(thick.bodies[0].volume).toBeCloseTo(12 - 3.8 * 2.8 * 0.75, 9);
		await expect(e.apply({ type: 'set-feature', id: 'sh1', patch: { faceThickness: [{ face: faceRef(m0, 'x1.end'), thickness: 0.25 }] } })).rejects.toThrow(/x1.end is an open face/);
	});
	it('drafts the +X face about the XY plane along +Z: the kernel tilts it outward for a positive angle (measured), 12 + ½ tan(10°) × 1 × 3, and refuses a curved face by name', async () => {
		const e = await engine(); const m0 = await box(e);
		const m = await add(e, { id: 'd1', name: 'Draft 1', type: 'draft', faces: [faceRef(m0, 'x1.side.1')], angle: 10, pull: { kind: 'datum', axis: 'Z' }, neutral: { kind: 'datum', datum: 'XY' } });
		expect(row(m, 'd1').status).toBe('ok');
		expect(m.bodies[0].volume).toBeCloseTo(12 + 0.5 * Math.tan(Math.PI / 18) * BOX.d * BOX.d * BOX.h, 9);
		expect(m.bodies[0].faces.map((f) => f.id).sort()).toEqual(['x1.end', 'x1.side.0', 'x1.side.1', 'x1.side.2', 'x1.side.3', 'x1.start']);
		const inward = await e.apply({ type: 'set-feature', id: 'd1', patch: { angle: -10 } });
		expect(inward.bodies[0].volume).toBeCloseTo(12 - 0.5 * Math.tan(Math.PI / 18) * BOX.d * BOX.d * BOX.h, 9);
		await expect(e.apply({ type: 'set-feature', id: 'd1', patch: { angle: 0 } })).rejects.toThrow('Use a draft angle other than zero.');
		const hole = await add(e, { id: 'h1', name: 'Hole', type: 'hole', face: faceRef(m0, 'x1.end'), center: [2, 1.5], standard: 'M6', fit: 'normal', depth: 'through' });
		const wall = refFromSelection({ bodyId: 'x1#0', kind: 'face', id: 'h1.wall' }, hole.bodies[0]) as FaceRef;
		await expect(add(e, { id: 'd2', name: 'Draft 2', type: 'draft', faces: [wall], angle: 5, pull: { kind: 'datum', axis: 'Z' }, neutral: { kind: 'datum', datum: 'XY' } })).rejects.toThrow('Draft flat faces. h1.wall is curved.');
	});
	it('sweeps a circle along a straight sketch line exactly, names its caps, warns on a curved path, and refuses a closed or branching path in words', async () => {
		const e = await engine();
		await add(e, circle('prof', 0, 0, 0.25, { kind: 'datum', datum: 'YZ' }));
		await add(e, { id: 'path', name: 'Path', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [{ id: 'a', type: 'point', x: 0, y: 0 }, { id: 'b', type: 'point', x: 3, y: 0 }, { id: 'l', type: 'line', a: 'a', b: 'b' }], constraints: [] });
		const m = await add(e, { id: 'sw1', name: 'Sweep 1', type: 'sweep', profile: 'prof', path: 'path', operation: 'new' });
		expect(row(m, 'sw1')).toMatchObject({ status: 'ok' });
		expect(m.bodies[0].volume).toBeCloseTo(Math.PI * 0.25 * 0.25 * 3, 9);
		expect(m.bodies[0].faces.map((f) => f.id).sort()).toEqual(['sw1.end', 'sw1.side.0', 'sw1.start']);
		expect(m.sketches.every((s) => s.consumed)).toBe(true);
		const bent = await e.apply({ type: 'set-feature', id: 'path', patch: { entities: [{ id: 'a', type: 'point', x: 0, y: 0 }, { id: 'b', type: 'point', x: 3, y: 0 }, { id: 'c', type: 'point', x: 3, y: 2 }, { id: 'l', type: 'line', a: 'a', b: 'b' }, { id: 'l2', type: 'line', a: 'b', b: 'c' }] } });
		expect(row(bent, 'sw1').status).toBe('warning');
		expect(row(bent, 'sw1').message).toMatch(/faceted rather than exact/);
		expect(openChain([{ id: 'a', type: 'point', x: 0, y: 0 }, { id: 'b', type: 'point', x: 1, y: 0 }, { id: 'c', type: 'point', x: 1, y: 1 }, { id: 'l1', type: 'line', a: 'b', b: 'c' }, { id: 'l0', type: 'line', a: 'a', b: 'b' }]).map((s) => `${s.entity.id}${s.reversed ? '-' : '+'}`)).toEqual(['l0+', 'l1+']);
		expect(() => openChain(rectangle('r', 0, 0, 1, 1).entities)).toThrow('The path sketch is closed. Draw the path as an open chain of lines and arcs.');
		expect(() => openChain([{ id: 'a', type: 'point', x: 0, y: 0 }, { id: 'b', type: 'point', x: 1, y: 0 }, { id: 'c', type: 'point', x: 1, y: 1 }, { id: 'd', type: 'point', x: 2, y: 0 }, { id: 'l0', type: 'line', a: 'a', b: 'b' }, { id: 'l1', type: 'line', a: 'b', b: 'c' }, { id: 'l2', type: 'line', a: 'b', b: 'd' }])).toThrow('The path branches. Keep one chain of lines and arcs.');
	});
	it('lofts two squares two inches apart into a frustum, h(A + √(AB) + B)/3, with start, end and side names; refuses one profile and a mismatched edge count in words', async () => {
		const e = await engine();
		await add(e, rectangle('a', -1, -1, 2, 2));
		await add(e, rectangle('b', -0.5, -0.5, 1, 1, { kind: 'datum', datum: 'XY', offset: 2 }));
		const m = await add(e, { id: 'lo1', name: 'Loft 1', type: 'loft', profiles: ['a', 'b'], operation: 'new' });
		expect(row(m, 'lo1').status).toBe('ok');
		expect(m.bodies[0].volume).toBeCloseTo(2 * (4 + Math.sqrt(4) + 1) / 3, 9);
		expect(m.bodies[0].faces.map((f) => f.id).sort()).toEqual(['lo1.end', 'lo1.side.0', 'lo1.side.1', 'lo1.side.2', 'lo1.side.3', 'lo1.start']);
		await expect(e.apply({ type: 'set-feature', id: 'lo1', patch: { profiles: ['a'] } })).rejects.toThrow('Pick at least two sketches to loft, in order from first to last.');
		await add(e, circle('c', 0, 0, 0.5, { kind: 'datum', datum: 'XY', offset: 4 }));
		/* The kernel ACCEPTS a one-edge circle against a four-edge square and returns an invalid solid (measured), so the executor refuses it first, in words. */
		await expect(add(e, { id: 'lo2', name: 'Loft 2', type: 'loft', profiles: ['c', 'a'], operation: 'new' })).rejects.toThrow('Each profile needs the same number of edges: a four-sided shape lofts to a four-sided shape. These have 1, 4.');
		await add(e, circle('d', 0, 0, 1, { kind: 'datum', datum: 'XY', offset: 6 }));
		const cone = await add(e, { id: 'lo3', name: 'Loft 3', type: 'loft', profiles: ['c', 'd'], operation: 'new' });
		expect(row(cone, 'lo3').status).toBe('ok');
		expect(cone.bodies[1].volume).toBeCloseTo(2 * Math.PI * (0.25 + 0.5 + 1) / 3, 9);
		expect(cone.bodies[1].faces.map((f) => f.id).sort()).toEqual(['lo3.end', 'lo3.side.0', 'lo3.start']);
	});
	it('a rib is refused in words when added, and a saved document carrying one opens with the sentence on its row and the rest of the model standing', async () => {
		const e = await engine(); await box(e);
		const sentence = 'Rib is not built in this build: the kernel cannot extend an open sketch to the body. Draw the rib as a closed shape and extrude it instead.';
		await expect(add(e, { id: 'r1', name: 'Rib 1', type: 'rib', sketch: 's1', thickness: 0.1, target: 'x1#0' })).rejects.toThrow(sentence);
		expect(e.project().features).toHaveLength(2);
		const saved = await e.snapshot();
		const m = await e.load({ manifest: { ...saved.manifest, features: [...saved.manifest.features, { id: 'r1', name: 'Rib 1', type: 'rib', sketch: 's1', thickness: 0.1, target: 'x1#0' }] }, artifacts: saved.artifacts });
		expect(row(m, 'r1')).toMatchObject({ status: 'error', message: sentence });
		expect(m.bodies[0].volume).toBeCloseTo(12, 9);
	});
});

describe('the options store', () => {
	it('folds the panel options into a dragged fillet, chamfer and shell, and leaves every other feature alone; a wall face is removed from the open faces', () => {
		expect(featureOptions).toEqual(DEFAULT_FEATURE_OPTIONS());
		const edges: EdgeRef[] = [{ body: 'x1#0', faces: ['a', 'b'] }];
		/* Tangent chain is ON by default for both blends; turned off, the feature carries no propagate key at all. */
		expect(withOptions({ type: 'fillet', edges, radius: 0.2 })).toEqual({ type: 'fillet', edges, radius: 0.2, propagate: true });
		expect(withOptions({ type: 'chamfer', edges, distance: 0.1 })).toEqual({ type: 'chamfer', edges, distance: 0.1, propagate: true });
		featureOptions.fillet.propagate = false; featureOptions.chamfer.propagate = false;
		expect(withOptions({ type: 'fillet', edges, radius: 0.2 })).toEqual({ type: 'fillet', edges, radius: 0.2 });
		expect(withOptions({ type: 'chamfer', edges, distance: 0.1 })).toEqual({ type: 'chamfer', edges, distance: 0.1 });
		featureOptions.fillet.propagate = true; featureOptions.fillet.variableEnd = 0.4; featureOptions.fillet.law = 'scurve';
		expect(withOptions({ type: 'fillet', edges, radius: 0.2 })).toEqual({ type: 'fillet', edges, radius: 0.2, propagate: true, variable: { end: 0.4, law: 'scurve' } });
		featureOptions.chamfer.distance2 = 0.3;
		expect(withOptions({ type: 'chamfer', edges, distance: 0.1 })).toEqual({ type: 'chamfer', edges, distance: 0.1, distance2: 0.3 });
		featureOptions.chamfer.angle = 30; featureOptions.chamfer.propagate = true;
		expect(withOptions({ type: 'chamfer', edges, distance: 0.1 })).toEqual({ type: 'chamfer', edges, distance: 0.1, propagate: true, angle: 30 });
		const top: FaceRef = { body: 'x1#0', name: 'x1.end' }, bottom: FaceRef = { body: 'x1#0', name: 'x1.start' };
		featureOptions.shell.faceThickness = [{ face: bottom, thickness: 0.25 }];
		expect(withOptions({ type: 'shell', body: 'x1#0', thickness: 0.1, openFaces: [top, bottom] })).toEqual({ type: 'shell', body: 'x1#0', thickness: 0.1, openFaces: [top], faceThickness: [{ face: bottom, thickness: 0.25 }] });
		expect(withOptions({ type: 'extrude', sketch: 's', distance: 1, operation: 'new' })).toEqual({ type: 'extrude', sketch: 's', distance: 1, operation: 'new' });
		resetFeatureOptions();
		expect(featureOptions).toEqual(DEFAULT_FEATURE_OPTIONS());
	});
});
