// tests/ideacad-solid-mates-engine.test.ts
//
// MATES AGAINST THE REAL ENGINE AND THE REAL KERNEL. Two extruded boxes, mate
// features applied through `SolidEngine.apply`, and every expectation read off
// the PROJECTION'S BOUNDS -- where the kernel says the bodies are after the
// solve -- against the analytic answer for boxes of those sizes.
//
//   * coincident on facing faces: the gap between the two bounds is 0 to 1e-9;
//   * a distance mate of 0.25 leaves 0.25;
//   * an over-constrained third mate is reported on its own row by name and
//     the bracket does not move from where the first two put it;
//   * a body with `fixed` set never moves, whichever side of the mate it is;
//   * editing a mate's value re-solves and the projection follows (the cache
//     for an in-place transformed solid is dropped, which is what
//     `ctx.replaceBody` is called for);
//   * a mate on a round face and one on an edge and a corner resolve;
//   * face names survive the transform, so a later feature still finds them.
//
// Solver time per mate is PRINTED from the engine's own report, not claimed.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { refFromSelection } from '../src/lib/ideacad/solid/naming';
import { solveAssembly } from '../src/lib/ideacad/solid/mates/solve';
import { MATE_KINDS, MATE_WORDS } from '../src/lib/ideacad/solid/features/mate';
import { emptyManifest, type EntityRef, type Feature, type FeatureOf, type ModelProjection, type MateKind, type SolidManifest } from '../src/lib/ideacad/solid/types';
import { planJoint } from '../src/lib/ideacad/solid/mates/joints';
import { moveWithinFreedom } from '../src/lib/ideacad/solid/mates/motion';
import { selectionWords } from '../src/lib/ideacad/solid/mates/words';

const WASM = new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'));
const engines: SolidEngine[] = [];
async function engine() { const e = await SolidEngine.create(WASM); engines.push(e); return e; }
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; });

function rectangle(id: string, x0: number, y0: number, w: number, h: number, plane: FeatureOf<'sketch'>['plane'] = { kind: 'datum', datum: 'XY' }): FeatureOf<'sketch'> {
	return { id, name: `Sketch ${id}`, type: 'sketch', plane, entities: [
		{ id: 'p0', type: 'point', x: x0, y: y0 }, { id: 'p1', type: 'point', x: x0 + w, y: y0 }, { id: 'p2', type: 'point', x: x0 + w, y: y0 + h }, { id: 'p3', type: 'point', x: x0, y: y0 + h },
		{ id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }
	], constraints: [] };
}
function circle(id: string, cx: number, cy: number, r: number, plane: FeatureOf<'sketch'>['plane'] = { kind: 'datum', datum: 'XY' }): FeatureOf<'sketch'> {
	return { id, name: `Sketch ${id}`, type: 'sketch', plane, entities: [{ id: 'c', type: 'point', x: cx, y: cy }, { id: 'k', type: 'circle', center: 'c', radius: r }], constraints: [] };
}
const add = (e: SolidEngine, feature: Feature) => e.apply({ type: 'add-feature', feature });
/** Box A: 4 x 3 x 1 at the origin (`x1#0`). Box B: 2 x 2 x 1 at x = 6..8 (`x2#0`). */
async function twoBoxes(e: SolidEngine) {
	await add(e, rectangle('s1', 0, 0, 4, 3));
	await add(e, { id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' });
	await add(e, rectangle('s2', 6, 0, 2, 2));
	return add(e, { id: 'x2', name: 'Extrude 2', type: 'extrude', sketch: 's2', distance: 1, operation: 'new' });
}
const body = (m: ModelProjection, id: string) => m.bodies.find((b) => b.id === id)!;
const face = (m: ModelProjection, bodyId: string, faceId: string): EntityRef => ({ kind: 'face', ...refFromSelection({ bodyId, kind: 'face', id: faceId }, body(m, bodyId)) as { body: string; name: string } });
const row = (m: ModelProjection, id: string) => m.features.find((f) => f.id === id)!;
const mateFeature = (id: string, kind: MateKind, a: EntityRef, b: EntityRef, extra: Partial<FeatureOf<'mate'>> = {}): Feature => ({ id, name: `Mate ${id.replace(/\D/g, '')}`, type: 'mate', kind, a, b, ...extra });
/* The mate's own executor names its bodies BEFORE the solve runs, so every mate here is a feature whose replay is the measurement. */

describe('mates against the real kernel', () => {
	it('coincident on facing faces closes the gap to within 1e-9, moving only the bracket, and names 3 degrees of freedom', async () => {
		const e = await engine(); const m0 = await twoBoxes(e);
		expect(body(m0, 'x2#0').bounds).toEqual([6, 0, 0, 8, 2, 1]);
		const m = await add(e, mateFeature('m1', 'coincident', face(m0, 'x1#0', 'x1.end'), face(m0, 'x2#0', 'x2.start')));
		expect(row(m, 'm1').status).toBe('ok');
		expect(m.mates[0]).toMatchObject({ feature: 'm1', kind: 'coincident', status: 'ok' });
		const a = body(m, 'x1#0').bounds, b = body(m, 'x2#0').bounds;
		expect(a).toEqual([0, 0, 0, 4, 3, 1]);
		/* The bracket's bottom (its bounds' z-min) sits on the base's top (z-max): gap 0 to 1e-9, x and y untouched. */
		expect(Math.abs(b[2] - a[5])).toBeLessThanOrEqual(1e-9);
		expect(b[0]).toBeCloseTo(6, 9); expect(b[1]).toBeCloseTo(0, 9); expect(b[5]).toBeCloseTo(2, 9);
		expect(body(m, 'x2#0').dof).toBe(3); expect(body(m, 'x1#0').dof).toBe(6);
		expect(m.mates[0].residual).toBeLessThanOrEqual(1e-9);
		/* Face names ride through the transform: a later feature still finds them. */
		expect(body(m, 'x2#0').faces.map((f) => f.id).sort()).toEqual(['x2.end', 'x2.side.0', 'x2.side.1', 'x2.side.2', 'x2.side.3', 'x2.start']);
		expect(body(m, 'x2#0').faces.find((f) => f.id === 'x2.start')!.center[2]).toBeCloseTo(1, 9);
		const pushed = await add(e, { id: 'p1', name: 'Push', type: 'push', face: refFromSelection({ bodyId: 'x2#0', kind: 'face', id: 'x2.end' }, body(m, 'x2#0')) as never, value: 1 });
		expect(row(pushed, 'p1').status).toBe('ok'); expect(body(pushed, 'x2#0').volume).toBeCloseTo(8, 8);
		console.log(`replay with one mate: ${m.replayMs?.toFixed(2)} ms`);
	});
	it('a distance mate of 0.25 leaves 0.25, editing it to 0.5 re-solves and the projection follows', async () => {
		const e = await engine(); const m0 = await twoBoxes(e);
		const m = await add(e, mateFeature('m1', 'distance', face(m0, 'x1#0', 'x1.end'), face(m0, 'x2#0', 'x2.start'), { value: 0.25 }));
		expect(row(m, 'm1').status).toBe('ok');
		expect(body(m, 'x2#0').bounds[2] - body(m, 'x1#0').bounds[5]).toBeCloseTo(0.25, 9);
		expect(row(m, 'm1').summary).toBe('distance 0.25 in');
		const edited = await e.apply({ type: 'set-feature', id: 'm1', patch: { value: 0.5 } });
		expect(body(edited, 'x2#0').bounds[2] - body(edited, 'x1#0').bounds[5]).toBeCloseTo(0.5, 9);
		expect(body(edited, 'x2#0').faces.find((f) => f.id === 'x2.start')!.center[2]).toBeCloseTo(1.5, 9);
		/* Suppressing the mate puts the bracket back where its extrude left it. */
		const off = await e.apply({ type: 'suppress-feature', id: 'm1', suppressed: true });
		expect(body(off, 'x2#0').bounds).toEqual([6, 0, 0, 8, 2, 1]);
		expect(body(off, 'x2#0').dof).toBeUndefined();
	});
	it('an over-constrained third mate is refused on its own row, by name, and the bracket stays where the first two put it', async () => {
		const e = await engine(); const m0 = await twoBoxes(e);
		await add(e, mateFeature('m1', 'coincident', face(m0, 'x1#0', 'x1.end'), face(m0, 'x2#0', 'x2.start')));
		const m2 = await add(e, mateFeature('m2', 'coincident', face(m0, 'x1#0', 'x1.side.1'), face(m0, 'x2#0', 'x2.side.3')));
		expect(m2.features.map((f) => f.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
		/* Lifted 1 and slid so the bracket's -x face is on the base's +x face at x = 4. */
		expect(body(m2, 'x2#0').bounds.map((n) => Math.round(n * 1e9) / 1e9)).toEqual([4, 0, 1, 6, 2, 2]);
		expect(body(m2, 'x2#0').dof).toBe(1);
		const before = body(m2, 'x2#0').bounds;
		const m3 = await add(e, mateFeature('m3', 'distance', face(m0, 'x1#0', 'x1.end'), face(m0, 'x2#0', 'x2.start'), { value: 0.25 }));
		expect(row(m3, 'm3').status).toBe('error');
		expect(row(m3, 'm3').message).toBe('Mate 3 conflicts with Mate 1: Body 2 cannot satisfy both. Delete one of them, or change its value.');
		expect(m3.mates.find((x) => x.feature === 'm3')).toMatchObject({ status: 'error', residual: expect.closeTo(0.25, 9) });
		expect(row(m3, 'm1').status).toBe('ok'); expect(row(m3, 'm2').status).toBe('ok');
		expect(body(m3, 'x2#0').bounds).toEqual(before);
		expect(body(m3, 'x2#0').dof).toBe(1);
		/* The whole model is otherwise intact: the extrudes are fine and the base never moved. */
		expect(body(m3, 'x1#0').bounds).toEqual([0, 0, 0, 4, 3, 1]);
	});
	it('a fixed body never moves: fixing the bracket makes the base drop instead, and fixing both refuses by name', async () => {
		const e = await engine(); const m0 = await twoBoxes(e);
		await e.apply({ type: 'metadata', bodyId: 'x2#0', fixed: true });
		const m = await add(e, mateFeature('m1', 'coincident', face(m0, 'x1#0', 'x1.end'), face(m0, 'x2#0', 'x2.start')));
		expect(row(m, 'm1').status).toBe('ok');
		expect(body(m, 'x2#0').bounds).toEqual([6, 0, 0, 8, 2, 1]);
		expect(body(m, 'x1#0').bounds.map((n) => Math.round(n * 1e9) / 1e9 + 0)).toEqual([0, 0, -1, 4, 3, 0]);
		expect(body(m, 'x2#0').dof).toBe(0); expect(body(m, 'x2#0').fixed).toBe(true);
		await e.apply({ type: 'metadata', bodyId: 'x1#0', fixed: true });
		/* Re-solving happens on the next replay; a value edit is one. */
		const both = await e.apply({ type: 'set-feature', id: 'm1', patch: { flip: false } });
		expect(row(both, 'm1').status).toBe('error');
		expect(row(both, 'm1').message).toBe('Mate 1 would move Body 1 or Body 2, but both are fixed. Unfix one of them.');
		expect(body(both, 'x1#0').bounds).toEqual([0, 0, 0, 4, 3, 1]); expect(body(both, 'x2#0').bounds).toEqual([6, 0, 0, 8, 2, 1]);
	});
	it('concentric on a real hole and a real pin, a corner on a face, and an edge along an edge all resolve', async () => {
		const e = await engine(); await twoBoxes(e);
		/* A hole through the base and a pin standing up from x = 12. */
		const m0 = e.project();
		await add(e, circle('s3', 1, 1, 0.25, { kind: 'face', face: (face(m0, 'x1#0', 'x1.end') as { kind: 'face' } & { body: string; name: string }) as never }));
		await add(e, { id: 'x3', name: 'Hole', type: 'extrude', sketch: 's3', distance: -2, operation: 'cut', target: 'x1#0' });
		await add(e, circle('s4', 12, 0, 0.25));
		const m1 = await add(e, { id: 'x4', name: 'Pin', type: 'extrude', sketch: 's4', distance: 2, operation: 'new' });
		const hole = body(m1, 'x1#0').faces.find((f) => f.id.startsWith('x3.side'))!, pin = body(m1, 'x4#0').faces.find((f) => f.kind === 'cylinder')!;
		expect(hole.kind).toBe('cylinder');
		const m = await add(e, mateFeature('m1', 'concentric', face(m1, 'x1#0', hole.id), face(m1, 'x4#0', pin.id)));
		expect(row(m, 'm1').status).toBe('ok');
		const b = body(m, 'x4#0').bounds;
		expect((b[0] + b[3]) / 2).toBeCloseTo(1, 9); expect((b[1] + b[4]) / 2).toBeCloseTo(1, 9);
		expect(body(m, 'x4#0').dof).toBe(2);
		/* A corner of the bracket onto the base's top: one degree removed. */
		const corner = body(m, 'x2#0').vertices[0];
		const c = await add(e, { id: 'm2', name: 'Mate 2', type: 'mate', kind: 'coincident', a: face(m, 'x1#0', 'x1.end'), b: { kind: 'vertex', ...refFromSelection({ bodyId: 'x2#0', kind: 'vertex', id: corner.id }, body(m, 'x2#0')) as { body: string; faces: string[] } } });
		expect(row(c, 'm2').status).toBe('ok'); expect(body(c, 'x2#0').dof).toBe(5);
		/* An edge of the pin's top rim concentric with the hole: a circular edge is an axis. */
		const rim = body(c, 'x4#0').edges.find((ed) => ed.curve === 'CIRCLE')!;
		const r = await add(e, { id: 'm3', name: 'Mate 3', type: 'mate', kind: 'concentric', a: face(c, 'x1#0', hole.id), b: { kind: 'edge', ...refFromSelection({ bodyId: 'x4#0', kind: 'edge', id: rim.id }, body(c, 'x4#0')) as { body: string; faces: string[] } } });
		expect(row(r, 'm3').status).toBe('error'); expect(row(r, 'm3').message).toMatch(/adds nothing: Mate 1 already holds/);
	});
	it('a lost reference is the resolver\'s own sentence on the mate row, and the rest of the model stands', async () => {
		const e = await engine(); const m0 = await twoBoxes(e);
		await add(e, mateFeature('m1', 'coincident', face(m0, 'x1#0', 'x1.end'), face(m0, 'x2#0', 'x2.start')));
		const broken = await e.apply({ type: 'suppress-feature', id: 'x2', suppressed: true });
		expect(row(broken, 'm1').status).toBe('error');
		expect(row(broken, 'm1').message).toMatch(/^Lost reference: the body/);
		expect(broken.bodies).toHaveLength(1);
		const back = await e.apply({ type: 'suppress-feature', id: 'x2', suppressed: false });
		expect(row(back, 'm1').status).toBe('ok'); expect(Math.abs(body(back, 'x2#0').bounds[2] - 1)).toBeLessThanOrEqual(1e-9);
	});
	it('every kind has a word, and the solver reports its own time per mate', async () => {
		expect(MATE_KINDS.map((k) => MATE_WORDS[k])).toEqual(['Coincident', 'Concentric', 'Parallel', 'Perpendicular', 'Distance', 'Angle']);
		const e = await engine(); const m0 = await twoBoxes(e);
		await add(e, mateFeature('m1', 'coincident', face(m0, 'x1#0', 'x1.end'), face(m0, 'x2#0', 'x2.start')));
		await add(e, mateFeature('m2', 'coincident', face(m0, 'x1#0', 'x1.side.1'), face(m0, 'x2#0', 'x2.side.3')));
		const m = await add(e, mateFeature('m3', 'coincident', face(m0, 'x1#0', 'x1.side.0'), face(m0, 'x2#0', 'x2.side.0'), { flip: true }));
		expect(m.features.slice(4).map((f) => f.status)).toEqual(['ok', 'ok', 'ok']);
		expect(body(m, 'x2#0').dof).toBe(0);
		/* The pure solve on the same three mates, timed on its own: what the engine's replay pays for mates. */
		const timed = solveAssembly({ bodies: [{ id: 'A', name: 'A', center: [2, 1.5, 0.5] }, { id: 'B', name: 'B', center: [7, 1, 0.5] }], mates: [
			{ feature: 'm1', name: 'Mate 1', kind: 'coincident', a: { body: 'A', frame: { kind: 'plane', origin: [2, 1.5, 1], normal: [0, 0, 1] } }, b: { body: 'B', frame: { kind: 'plane', origin: [7, 1, 0], normal: [0, 0, -1] } } },
			{ feature: 'm2', name: 'Mate 2', kind: 'coincident', a: { body: 'A', frame: { kind: 'plane', origin: [4, 1.5, 0.5], normal: [1, 0, 0] } }, b: { body: 'B', frame: { kind: 'plane', origin: [6, 1, 0.5], normal: [-1, 0, 0] } } },
			{ feature: 'm3', name: 'Mate 3', kind: 'coincident', flip: true, a: { body: 'A', frame: { kind: 'plane', origin: [2, 0, 0.5], normal: [0, -1, 0] } }, b: { body: 'B', frame: { kind: 'plane', origin: [7, 0, 0.5], normal: [0, -1, 0] } } }
		] });
		expect(timed.errors).toEqual([]);
		console.log(`solver ms per mate (pure): ${[...timed.ms].map(([k, v]) => `${k}=${v.toFixed(3)}`).join(' ')}; replay with three mates: ${m.replayMs?.toFixed(2)} ms`);
	});
	it('a hinge planned from the real projection lands as ONE batch (one undo), leaves the pin one turn about the hole axis, and a drag keeps only that turn', async () => {
		const e = await engine(); const m0 = await twoBoxes(e);
		/* The Hole tool through the base at (2, 1.5), and a pin standing at x = 12. */
		await add(e, { id: 'h1', name: 'Hole 1', type: 'hole', face: face(m0, 'x1#0', 'x1.end') as never, center: [2, 1.5], standard: 'custom', fit: 'custom', diameter: 0.5, depth: 'through' });
		await add(e, circle('s4', 12, 0, 0.25));
		const m1 = await add(e, { id: 'x4', name: 'Pin', type: 'extrude', sketch: 's4', distance: 2, operation: 'new' });
		const wall = body(m1, 'x1#0').faces.find((f) => f.id === 'h1.wall')!, shank = body(m1, 'x4#0').faces.find((f) => f.kind === 'cylinder')!;
		expect(wall.kind).toBe('cylinder');
		const pick = (bodyId: string, id: string) => ({ kind: 'face' as const, bodyId, id });
		const manifest = { ...emptyManifest(), features: [{ id: 'h1', name: 'Hole 1', type: 'hole' }] } as unknown as SolidManifest;
		const plan = planJoint({ model: m1, manifest }, 'hinge', [pick('x1#0', wall.id), pick('x4#0', shank.id), pick('x1#0', 'x1.end'), pick('x4#0', 'x4.start')]);
		expect(plan.reason).toBeNull(); expect(plan.ready).toBe(true);
		const base = body(m1, 'x1#0').name, pinName = body(m1, 'x4#0').name;
		expect(plan.slots.map((s) => s.words)).toEqual([`${base}, hole wall`, selectionWords({ model: m1, manifest }, pick('x4#0', shank.id)), `${base}, end face`, `${pinName}, start face`]);
		expect(plan.slots[1].words).toMatch(new RegExp(`^${pinName}, round face \\d+$`));
		const m = await e.apply({ type: 'batch', commands: plan.mates.map((mt, i) => ({ type: 'add-feature', feature: { id: `j${i}`, name: `Hinge 1 ${i}`, type: 'mate', kind: mt.kind, a: mt.a, b: mt.b, joint: 'hinge', group: 'j0' } })) });
		expect(row(m, 'j0').status).toBe('ok'); expect(row(m, 'j1').status).toBe('ok');
		expect(row(m, 'j0').summary).toBe('hinge');
		const pin = body(m, 'x4#0');
		expect(pin.dof).toBe(1);
		expect((pin.bounds[0] + pin.bounds[3]) / 2).toBeCloseTo(2, 9); expect((pin.bounds[1] + pin.bounds[4]) / 2).toBeCloseTo(1.5, 9); expect(pin.bounds[2]).toBeCloseTo(1, 9);
		/* A drag across the axis and up keeps nothing; a turn about the hole axis survives whole. */
		const across = moveWithinFreedom(m, 'x4#0', { translation: [1, 1, 1] });
		expect(Math.hypot(...across.v)).toBeLessThan(1e-6); expect(across.dof).toBe(1);
		const spin = moveWithinFreedom(m, 'x4#0', { rotation: { axis: [0, 0, 1], angle: 0.7, pivot: [2, 1.5, 0] } });
		expect(spin.omega[2]).toBeCloseTo(0.7, 6); expect(Math.hypot(spin.omega[0], spin.omega[1], ...spin.v)).toBeLessThan(1e-6);
		/* One edit, one undo: the whole hinge goes. */
		const undone = await e.undo();
		expect(undone.mates).toHaveLength(0); expect(undone.features.some((f) => f.id === 'j0' || f.id === 'j1')).toBe(false);
	});
	it('a drag projected onto a cylindrical joint lands as a Move the solve keeps: the pin slides up its hole and stays on the axis', async () => {
		const e = await engine(); const m0 = await twoBoxes(e);
		await add(e, { id: 'h1', name: 'Hole 1', type: 'hole', face: face(m0, 'x1#0', 'x1.end') as never, center: [2, 1.5], standard: 'custom', fit: 'custom', diameter: 0.5, depth: 'through' });
		await add(e, circle('s4', 12, 0, 0.25));
		const m1 = await add(e, { id: 'x4', name: 'Pin', type: 'extrude', sketch: 's4', distance: 2, operation: 'new' });
		const shank = body(m1, 'x4#0').faces.find((f) => f.kind === 'cylinder')!;
		const m2 = await add(e, mateFeature('m1', 'concentric', face(m1, 'x1#0', 'h1.wall'), face(m1, 'x4#0', shank.id)));
		const before = body(m2, 'x4#0').bounds;
		expect((before[0] + before[3]) / 2).toBeCloseTo(2, 9);
		/* The student drags the pin up and sideways; only the slide along the hole axis survives the projection. */
		const motion = moveWithinFreedom(m2, 'x4#0', { translation: [0.6, -0.4, 0.5] });
		expect(motion.dof).toBe(2); expect(motion.v[0]).toBeCloseTo(0, 9); expect(motion.v[1]).toBeCloseTo(0, 9); expect(motion.v[2]).toBeCloseTo(0.5, 9);
		const m3 = await add(e, { id: 't1', name: 'Move 1', type: 'transform', bodies: ['x4#0'], matrix: motion.matrix });
		expect(row(m3, 'm1').status).toBe('ok'); expect(row(m3, 't1').status).toBe('ok');
		const after = body(m3, 'x4#0').bounds;
		expect(after[2] - before[2]).toBeCloseTo(0.5, 6); expect(after[5] - before[5]).toBeCloseTo(0.5, 6);
		expect((after[0] + after[3]) / 2).toBeCloseTo(2, 6); expect((after[1] + after[4]) / 2).toBeCloseTo(1.5, 6);
	});
	it('a pin in a slot planned from the real projection rides the slot wall at its own radius, sits on the plate, and keeps a slide along the slot and a spin', async () => {
		const e = await engine(); const m0 = await twoBoxes(e);
		/* A slot 3 long and 0.5 wide cut through the base along X at y = 0.5 .. 1.0. */
		await add(e, rectangle('s5', 0.5, 0.5, 3, 0.5, { kind: 'face', face: (face(m0, 'x1#0', 'x1.end') as { kind: 'face' } & { body: string; name: string }) as never }));
		await add(e, { id: 'x5', name: 'Slot', type: 'extrude', sketch: 's5', distance: -2, operation: 'cut', target: 'x1#0' });
		await add(e, circle('s4', 12, 0, 0.25));
		const m1 = await add(e, { id: 'x4', name: 'Pin', type: 'extrude', sketch: 's4', distance: 2, operation: 'new' });
		const near = body(m1, 'x1#0').faces.find((f) => f.id.startsWith('x5.side') && f.kind === 'plane' && f.normal[1] > 0.9)!;
		expect(near.center[1]).toBeCloseTo(0.5, 9);
		const shank = body(m1, 'x4#0').faces.find((f) => f.kind === 'cylinder')!;
		const pick = (bodyId: string, id: string) => ({ kind: 'face' as const, bodyId, id });
		const plan = planJoint({ model: m1, manifest: emptyManifest() }, 'slot', [pick('x1#0', near.id), pick('x4#0', shank.id), pick('x1#0', 'x1.end'), pick('x4#0', 'x4.start')]);
		expect(plan.reason).toBeNull(); expect(plan.ready).toBe(true);
		expect(plan.mates.map((m) => [m.kind, m.value ?? null])).toEqual([['distance', 0.25], ['coincident', null]]);
		const m = await e.apply({ type: 'batch', commands: plan.mates.map((mt, i) => ({ type: 'add-feature', feature: { id: `k${i}`, name: `Pin in slot 1 ${i}`, type: 'mate', kind: mt.kind, a: mt.a, b: mt.b, ...(mt.value !== undefined ? { value: mt.value } : {}), joint: 'slot', group: 'k0' } })) });
		expect(row(m, 'k0').status).toBe('ok'); expect(row(m, 'k1').status).toBe('ok');
		const pin = body(m, 'x4#0');
		expect(pin.dof).toBe(2);
		/* Its axis sits 0.25 off the near wall, which is the slot's middle, and its bottom on the base's top. */
		expect((pin.bounds[1] + pin.bounds[4]) / 2).toBeCloseTo(0.75, 6); expect(pin.bounds[2]).toBeCloseTo(1, 6);
		const slide = moveWithinFreedom(m, 'x4#0', { translation: [1, 1, 1] });
		expect(slide.v[0]).toBeCloseTo(1, 6); expect(Math.hypot(slide.v[1], slide.v[2])).toBeLessThan(1e-6);
	});
});
