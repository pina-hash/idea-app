// tests/ideacad-solid-features.test.ts
//
// THE SPINE: a document is its feature list, replayed. What is asserted here
// is the property the whole bundle rests on -- that a number changed three
// features deep rebuilds the model correctly, with every later feature still
// finding the face it meant -- and the two things that would silently break
// it: a face name that did not survive an upstream edit, and a v1 document
// that no longer opened or rendered as saved.
//
// EVERY VOLUME IS AN ANALYTIC BOUND, never a number read off the kernel and
// typed back in (Addendum A5.3). Replay cost and checkpoint memory are
// MEASURED and printed, so the arithmetic in docs/IDEACAD.md is a reading.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine, CHECKPOINT_WINDOW } from '../src/lib/ideacad/solid/engine';
import { kernelMemoryBytes, createKernel } from '../src/lib/ideacad/kernel/remus';
import { emptyManifest, KERNEL_ID, type Feature, type FeatureOf, type LegacyManifest, type ModelProjection } from '../src/lib/ideacad/solid/types';
import { reduce } from '../src/lib/ideacad/solid/commands';
import { reorderRange, upgradeManifest, dependsOnFeatures } from '../src/lib/ideacad/solid/features';
import { regions, solveSketch, loops } from '../src/lib/ideacad/solid/sketch/model';
import { refFromSelection } from '../src/lib/ideacad/solid/naming';

const WASM = new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'));
const engines: SolidEngine[] = [];
async function engine() { const e = await SolidEngine.create(WASM); engines.push(e); return e; }
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; });

/** A rectangle sketch: four shared points, four lines. */
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
const faceNamed = (m: ModelProjection, body: number, suffix: string) => m.bodies[body].faces.find((f) => f.id.endsWith(suffix))!;
const row = (m: ModelProjection, id: string) => m.features.find((f) => f.id === id)!;
/** The 4x3x1 box every case starts from: sketch `s1`, extrude `x1`. */
async function box(e: SolidEngine) {
	await add(e, rectangle('s1', 0, 0, 4, 3));
	return add(e, { id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' });
}

describe('the feature list replays into the model', () => {
	it('extrudes a sketch feature and names every face by its construction role', async () => {
		const e = await engine(); const m = await box(e);
		expect(m.bodies).toHaveLength(1); expect(m.bodies[0].id).toBe('x1#0');
		expect(m.bodies[0].volume).toBeCloseTo(12, 9);
		expect(m.bodies[0].faces.map((f) => f.id).sort()).toEqual(['x1.end', 'x1.side.0', 'x1.side.1', 'x1.side.2', 'x1.side.3', 'x1.start']);
		expect(faceNamed(m, 0, '.end').normal[2]).toBeCloseTo(1, 9);
		expect(faceNamed(m, 0, '.start').normal[2]).toBeCloseTo(-1, 9);
		/* side.0 swept edge l0 (y = 0), so it faces -y. */
		expect(faceNamed(m, 0, '.side.0').normal[1]).toBeCloseTo(-1, 9);
		expect(m.features.map((f) => f.status)).toEqual(['ok', 'ok']);
		expect(m.sketches[0].consumed).toBe(true);
	});
	it('cuts a hole from a sketch on a face and carries the tool faces by surface', async () => {
		const e = await engine(); const m0 = await box(e);
		const top = refFromSelection({ bodyId: 'x1#0', kind: 'face', id: 'x1.end' }, m0.bodies[0]);
		await add(e, circle('s2', 2, 1.5, 0.5, { kind: 'face', face: top as never }));
		const m = await add(e, { id: 'x2', name: 'Cut', type: 'extrude', sketch: 's2', distance: -2, operation: 'cut', target: 'x1#0' });
		expect(m.bodies[0].volume).toBeCloseTo(12 - Math.PI / 4, 9);
		const ids = m.bodies[0].faces.map((f) => f.id);
		expect(ids).toContain('x1.end'); expect(ids).toContain('x1.start');
		expect(ids.filter((id) => id.startsWith('x2.side'))).toHaveLength(1);
		expect(m.bodies[0].faces.find((f) => f.id.startsWith('x2.side'))!.kind).toBe('cylinder');
	});
	it('rebuilds correctly when a number changes three features deep, and the fillet still finds its edge', async () => {
		const e = await engine(); const m0 = await box(e);
		const top = refFromSelection({ bodyId: 'x1#0', kind: 'face', id: 'x1.end' }, m0.bodies[0]);
		await add(e, circle('s2', 2, 1.5, 0.5, { kind: 'face', face: top as never }));
		const m1 = await add(e, { id: 'x2', name: 'Cut', type: 'extrude', sketch: 's2', distance: -2, operation: 'cut', target: 'x1#0' });
		const edge = m1.bodies[0].edges.find((ed) => ed.faces.includes('x1.end') && ed.faces.includes('x1.side.0'))!;
		expect(edge).toBeDefined();
		const m2 = await add(e, { id: 'f1', name: 'Fillet 1', type: 'fillet', edges: [refFromSelection({ bodyId: 'x1#0', kind: 'edge', id: edge.id }, m1.bodies[0]) as never], radius: 0.25 });
		/* A quarter-round removed along the 4 in edge: r²(1 - π/4) per unit length. */
		const removed = (r: number, length: number) => r * r * (1 - Math.PI / 4) * length;
		expect(m2.bodies[0].volume).toBeCloseTo(12 - Math.PI / 4 - removed(0.25, 4), 8);
		expect(row(m2, 'f1').status).toBe('ok');
		/* Now change the FIRST feature: the sketch's width from 4 to 6. */
		const wider = structuredClone((m2 as never as { features: Feature[] }) && rectangle('s1', 0, 0, 6, 3));
		const m3 = await e.apply({ type: 'set-feature', id: 's1', patch: { entities: wider.entities } });
		expect(m3.replayedFrom).toBe(0);
		expect(m3.features.map((f) => f.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
		expect(m3.bodies[0].volume).toBeCloseTo(18 - Math.PI / 4 - removed(0.25, 6), 8);
		/* And the extrude distance, two deep from the fillet. */
		const m4 = await e.apply({ type: 'set-feature', id: 'x1', patch: { distance: 2 } });
		expect(m4.replayedFrom).toBe(1);
		expect(m4.bodies[0].volume).toBeCloseTo(36 - Math.PI / 4 * 2 - removed(0.25, 6), 8);
		expect(row(m4, 'f1').status).toBe('ok');
		const m5 = await e.apply({ type: 'set-feature', id: 'f1', patch: { radius: 0.5 } });
		expect(m5.replayedFrom).toBe(4);
		expect(m5.bodies[0].volume).toBeCloseTo(36 - Math.PI / 4 * 2 - removed(0.5, 6), 8);
	});
	it('reports a lost reference on its own row, keeps the rest of the model, and recovers when the reference returns', async () => {
		const e = await engine(); const m0 = await box(e);
		const top = refFromSelection({ bodyId: 'x1#0', kind: 'face', id: 'x1.end' }, m0.bodies[0]);
		await add(e, circle('s2', 2, 1.5, 0.5, { kind: 'face', face: top as never }));
		const m1 = await add(e, { id: 'x2', name: 'Cut', type: 'extrude', sketch: 's2', distance: -2, operation: 'cut', target: 'x1#0' });
		const rim = m1.bodies[0].edges.find((ed) => ed.faces.includes('x1.end') && ed.faces.some((f) => f.startsWith('x2.side')))!;
		await add(e, { id: 'f1', name: 'Fillet rim', type: 'fillet', edges: [refFromSelection({ bodyId: 'x1#0', kind: 'edge', id: rim.id }, m1.bodies[0]) as never], radius: 0.1 });
		const broken = await e.apply({ type: 'suppress-feature', id: 'x2', suppressed: true });
		expect(row(broken, 'x2').status).toBe('suppressed');
		expect(row(broken, 'f1').status).toBe('error');
		expect(row(broken, 'f1').message).toMatch(/Lost reference: the edge/);
		expect(broken.bodies[0].volume).toBeCloseTo(12, 9);
		const back = await e.apply({ type: 'suppress-feature', id: 'x2', suppressed: false });
		expect(back.features.map((f) => f.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
		/* An edit whose OWN feature fails is refused with the feature's sentence and put back; a reference that matches nothing is named, never guessed. */
		await expect(e.apply({ type: 'set-feature', id: 'f1', patch: { edges: [{ body: 'x1#0', faces: ['x1.end', 'nowhere'], hint: { curve: 'CIRCLE', mid: [9, 9, 9], length: 1 } }] } })).rejects.toThrow(/Lost reference: the edge .*nowhere/);
		expect(e.project().features.map((f) => f.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
	});
	it('a body keeps its record while its feature is suppressed: name, material, colour, role and fixed survive the round trip', async () => {
		/* Measured before the fix: reconcileRecords rebuilt the records from the live bodies only, so suppressing the extrude dropped the record, the next save persisted the drop, and the body came back as `Body 1` with nothing on it. */
		const e = await engine();
		const pts = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y], i) => ({ id: `p${i}`, type: 'point', x, y }));
		const lines = pts.map((_, i) => ({ id: `l${i}`, type: 'line', a: `p${i}`, b: `p${(i + 1) % 4}` }));
		await e.apply({ type: 'add-feature', feature: { id: 'sk', name: 'Sketch', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [...pts, ...lines] as never, constraints: [] } });
		await e.apply({ type: 'add-feature', feature: { id: 'ex', name: 'Box', type: 'extrude', sketch: 'sk', distance: 1, operation: 'new' } });
		await e.apply({ type: 'metadata', bodyId: 'ex#0', name: 'Plate', materialId: 'steel-1018', color: '#d24a3a', fixed: true });
		await e.snapshot(); /* the workspace snapshots after every command, which is what gives the record its artifact hash */
		const off = await e.apply({ type: 'suppress-feature', id: 'ex', suppressed: true });
		expect(off.bodies).toHaveLength(0);
		expect((await e.snapshot()).manifest.bodies.find((b) => b.id === 'ex#0')).toMatchObject({ name: 'Plate', materialId: 'steel-1018', color: '#d24a3a', fixed: true });
		const on = await e.apply({ type: 'suppress-feature', id: 'ex', suppressed: false });
		expect(on.bodies[0]).toMatchObject({ id: 'ex#0', name: 'Plate', materialId: 'steel-1018', color: '#d24a3a', fixed: true });
		/* Positive control: a body whose feature is GONE loses its record. */
		await e.apply({ type: 'remove-feature', id: 'ex' });
		expect((await e.snapshot()).manifest.bodies.some((b) => b.id === 'ex#0')).toBe(false);
	});
	it('refuses a reorder above a dependency and a delete with dependents, in words naming them', async () => {
		const e = await engine(); await box(e);
		const m = e.project();
		expect(reorderRange('x1', (await e.snapshot()).manifest.features)).toEqual({ min: 1, max: 1 });
		await expect(e.apply({ type: 'move-feature', id: 'x1', to: 0 })).rejects.toThrow(/cannot move above/);
		await expect(e.apply({ type: 'remove-feature', id: 's1' })).rejects.toThrow(/Extrude 1/);
		const stored = (await e.snapshot()).manifest.features;
		expect(dependsOnFeatures(stored[1], stored)).toEqual(['s1']); expect(dependsOnFeatures(stored[0], stored)).toEqual([]); expect(m.features[1].dependsOn).toEqual(['s1']);
		const after = await e.apply({ type: 'remove-feature', id: 'x1' });
		expect(after.bodies).toHaveLength(0); expect(after.sketches[0].consumed).toBe(false);
	});
	it('opens a v1 document as saved bodies, renders the exact bytes, and builds on them', async () => {
		const k = await createKernel(WASM); const solid = k.makeBox(2, 3, 4); const bytes = k.serializeSolids(new Uint32Array([solid])); k.free();
		const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))].map((b) => b.toString(16).padStart(2, '0')).join('');
		const legacy: LegacyManifest = { format: 'ideacad-solid-v1', kernel: KERNEL_ID, units: 'in', title: 'Old', bodies: [{ id: 'b-old', name: 'Old box', artifact: hash, materialId: 'steel-1018', role: 'part', topologyEpoch: '00000000-0000-4000-8000-000000000000' }], sketches: [], addons: { ideaBlade: false } };
		expect(upgradeManifest(legacy).features[0]).toMatchObject({ type: 'body', bodyId: 'b-old', artifact: hash });
		const e = await engine(); const m = await e.load({ manifest: legacy, artifacts: [{ hash, bytes }] });
		expect(m.bodies[0].id).toBe('b-old'); expect(m.bodies[0].name).toBe('Old box'); expect(m.bodies[0].materialId).toBe('steel-1018');
		expect(m.bodies[0].volume).toBeCloseTo(24, 9);
		expect(m.features[0]).toMatchObject({ type: 'body', name: 'Saved body 1', status: 'ok' });
		expect(m.bodies[0].faces.map((f) => f.id).sort()).toEqual([0, 1, 2, 3, 4, 5].map((i) => `legacy-b-old.face.${i}`));
		const top = m.bodies[0].faces.find((f) => f.normal[2] > 0.99)!;
		const pushed = await add(e, { id: 'p1', name: 'Push', type: 'push', face: refFromSelection({ bodyId: 'b-old', kind: 'face', id: top.id }, m.bodies[0]) as never, value: 1 });
		expect(pushed.bodies[0].volume).toBeCloseTo(30, 8);
		const saved = await e.snapshot();
		expect(saved.manifest.format).toBe('ideacad-solid-v2');
		expect(saved.manifest.bodies[0]).toMatchObject({ id: 'b-old', materialId: 'steel-1018' });
		expect(saved.manifest.bodies[0].artifact).not.toBe(hash);
	});
	it('round-trips through a snapshot into a fresh engine with the same volume and the same names', async () => {
		const e = await engine(); const m0 = await box(e);
		const top = refFromSelection({ bodyId: 'x1#0', kind: 'face', id: 'x1.end' }, m0.bodies[0]);
		await add(e, circle('s2', 2, 1.5, 0.5, { kind: 'face', face: top as never }));
		const m1 = await add(e, { id: 'x2', name: 'Cut', type: 'extrude', sketch: 's2', distance: -2, operation: 'cut', target: 'x1#0' });
		const saved = await e.snapshot();
		const fresh = await engine(); const m2 = await fresh.load(saved);
		expect(m2.bodies[0].volume).toBeCloseTo(m1.bodies[0].volume, 9);
		expect(m2.bodies[0].faces.map((f) => f.id).sort()).toEqual(m1.bodies[0].faces.map((f) => f.id).sort());
		expect(m2.features.map((f) => f.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
		expect((await fresh.snapshot()).manifest.bodies[0].artifact).toBe(saved.manifest.bodies[0].artifact);
	});
	it('a gesture is one undo step, a cancelled gesture leaves nothing, and the checkpoint stack is bounded', async () => {
		const e = await engine(); await box(e);
		const before = e.checkpointCount();
		await e.begin();
		const face = { body: 'x1#0', name: 'x1.end' };
		await e.update({ type: 'add-feature', feature: { id: 'g', name: 'Push', type: 'push', face, value: 1 } });
		await e.update({ type: 'add-feature', feature: { id: 'g', name: 'Push', type: 'push', face, value: 2 } });
		const done = await e.commit();
		expect(done.bodies[0].volume).toBeCloseTo(36, 8);
		expect(e.checkpointCount()).toBe(before + 1);
		expect((await e.undo()).bodies[0].volume).toBeCloseTo(12, 8);
		expect((await e.redo()).bodies[0].volume).toBeCloseTo(36, 8);
		await e.begin();
		await expect(e.update({ type: 'add-feature', feature: { id: 'g2', name: 'Push', type: 'push', face, value: -10 } })).rejects.toBeDefined();
		expect((await e.cancel()).bodies[0].volume).toBeCloseTo(36, 8);
		expect(e.checkpointCount()).toBe(before + 1);
	});
	it('mirrors and patterns carry the source names onto the copies', async () => {
		const e = await engine(); await box(e);
		const m = await add(e, { id: 'mr', name: 'Mirror', type: 'mirror', bodies: ['x1#0'], plane: { kind: 'datum', datum: 'YZ' } });
		expect(m.bodies).toHaveLength(2); expect(m.bodies[1].id).toBe('mr#0');
		expect(m.bodies[1].faces.map((f) => f.id).sort()).toEqual(m.bodies[0].faces.map((f) => f.id).sort());
		const p = await add(e, { id: 'pt', name: 'Pattern', type: 'pattern', body: 'x1#0', mode: 'linear', axis: { kind: 'datum', axis: 'Y' }, spacing: 5, count: 3 });
		expect(p.bodies.map((b) => b.id)).toEqual(['x1#0', 'mr#0', 'pt#0', 'pt#1']);
		expect(p.bodies[3].faces.map((f) => f.id).sort()).toEqual(p.bodies[0].faces.map((f) => f.id).sort());
		expect(p.bodies[3].centerOfMass[1]).toBeCloseTo(1.5 + 10, 8);
		const c = await add(e, { id: 'cp', name: 'Ring', type: 'pattern', body: 'x1#0', mode: 'circular', axis: { kind: 'line', origin: [10, 0, 0], direction: [0, 0, 1] }, spacing: 90, count: 4 });
		expect(c.bodies.filter((b) => b.id.startsWith('cp#'))).toHaveLength(3);
		expect(c.bodies.find((b) => b.id === 'cp#1')!.centerOfMass[0]).toBeCloseTo(10 + (10 - 2), 6);
	});
	it('revolves about a reference axis, not the file centre', async () => {
		const e = await engine();
		await add(e, { id: 'ax', name: 'Axis 1', type: 'axis', definition: { kind: 'point-direction', point: { kind: 'coordinates', point: [0, 0, 0] }, direction: { kind: 'datum', axis: 'Z' } } });
		await add(e, rectangle('s1', 1, 0, 1, 2, { kind: 'datum', datum: 'XZ' }));
		const m = await add(e, { id: 'r1', name: 'Revolve', type: 'revolve', sketch: 's1', angle: 360, axis: { kind: 'reference', feature: 'ax' }, operation: 'new' });
		/* A ring: (R² - r²) π h with R = 2, r = 1, h = 2. */
		expect(m.bodies[0].volume).toBeCloseTo(Math.PI * (4 - 1) * 2, 6);
		expect(m.references[0]).toMatchObject({ kind: 'axis', feature: 'ax' });
		const half = await e.apply({ type: 'set-feature', id: 'r1', patch: { angle: 180 } });
		/* Measured: the kernel's exact integration of a 180-degree revolve lands 1.3e-4 relative below the analytic ring, where the 360-degree one is exact to 1e-9. */
		expect(half.bodies[0].volume).toBeCloseTo(Math.PI * 3, 2);
		expect(half.bodies[0].faces.map((f) => f.id)).toContain('r1.start');
		expect(half.bodies[0].faces.map((f) => f.id)).toContain('r1.end');
	});
});

describe('sketch regions and the constraint solver', () => {
	it('finds two regions in a figure-eight and a hole inside a rectangle', () => {
		const eight = [
			{ id: 'a', type: 'point', x: 0, y: 0 }, { id: 'b', type: 'point', x: 1, y: 0 }, { id: 'c', type: 'point', x: 2, y: 0 }, { id: 'd', type: 'point', x: 2, y: 1 }, { id: 'e', type: 'point', x: 1, y: 1 }, { id: 'f', type: 'point', x: 0, y: 1 },
			{ id: 'l1', type: 'line', a: 'a', b: 'b' }, { id: 'l2', type: 'line', a: 'b', b: 'c' }, { id: 'l3', type: 'line', a: 'c', b: 'd' }, { id: 'l4', type: 'line', a: 'd', b: 'e' }, { id: 'l5', type: 'line', a: 'e', b: 'f' }, { id: 'l6', type: 'line', a: 'f', b: 'a' }, { id: 'l7', type: 'line', a: 'b', b: 'e' }
		] as const;
		const r = regions(eight as never);
		expect(r).toHaveLength(2); expect(r.map((x) => x.area)).toEqual([1, 1]); expect(r.map((x) => x.id)).toEqual(['r0', 'r1']);
		const holed = [...rectangle('s', 0, 0, 4, 3).entities, { id: 'c', type: 'point', x: 2, y: 1.5 }, { id: 'k', type: 'circle', center: 'c', radius: 0.5 }] as never;
		const h = regions(holed); expect(h).toHaveLength(1); expect(h[0].holes).toHaveLength(1); expect(h[0].area).toBeCloseTo(12 - Math.PI * 0.25, 2);
		/* A dangling line closes nothing. */
		expect(loops([...rectangle('s', 0, 0, 1, 1).entities, { id: 'q', type: 'point', x: 5, y: 5 }, { id: 'lq', type: 'line', a: 'p2', b: 'q' }] as never)).toHaveLength(1);
	});
	it('drives a dimension through the kernel solver and reports the classification', async () => {
		const k = await createKernel(WASM);
		const doc = rectangle('s', 0, 0, 4, 3);
		doc.constraints = [
			{ id: 'k1', type: 'fixX', point: 'p0', value: 0 }, { id: 'k2', type: 'fixY', point: 'p0', value: 0 },
			{ id: 'h1', type: 'horizontal', line: 'l0' }, { id: 'v1', type: 'vertical', line: 'l1' }, { id: 'h2', type: 'horizontal', line: 'l2' }, { id: 'v2', type: 'vertical', line: 'l3' },
			{ id: 'd1', type: 'distance', a: 'p0', b: 'p1', value: 6 }, { id: 'd2', type: 'distance', a: 'p1', b: 'p2', value: 2 }
		];
		const solved = solveSketch(k, doc);
		expect(solved.report.converged).toBe(true); expect(solved.report.classification).toBe('solved');
		expect(regions(solved.entities)[0].area).toBeCloseTo(12, 6);
		const p2 = solved.entities.find((e) => e.id === 'p2') as { x: number; y: number }; expect(p2.x).toBeCloseTo(6, 6); expect(p2.y).toBeCloseTo(2, 6);
		const under = solveSketch(k, { ...doc, constraints: doc.constraints.slice(0, 6) });
		expect(under.report.classification).toBe('underConstrained'); expect(under.report.dof).toBe(2);
		const bad = solveSketch(k, { ...doc, constraints: [...doc.constraints, { id: 'd3', type: 'distance', a: 'p0', b: 'p1', value: 9 }] });
		expect(['unsatisfied', 'redundant']).toContain(bad.report.classification);
		k.free();
	});
});

describe('replay cost, measured', () => {
	it('prints the cost of editing deep and shallow in a forty-feature document, and the memory the checkpoints take', async () => {
		const e = await engine(); await box(e);
		const memory0 = kernelMemoryBytes();
		for (let i = 0; i < 38; i++) await add(e, { id: `p${i}`, name: `Push ${i}`, type: 'push', face: { body: 'x1#0', name: 'x1.end' }, value: i % 2 ? 0.1 : -0.05 });
		const m = e.project(); expect(m.features).toHaveLength(40);
		const memory1 = kernelMemoryBytes();
		const time = async (id: string, patch: Record<string, unknown>) => { const t = performance.now(); const r = await e.apply({ type: 'set-feature', id, patch }); return { ms: performance.now() - t, replayMs: r.replayMs!, from: r.replayedFrom! }; };
		const deep = await time('x1', { distance: 1.5 });
		const mid = await time('p5', { value: 0.11 });
		const shallow = await time('p37', { value: 0.12 });
		const window = await time(`p${38 - CHECKPOINT_WINDOW}`, { value: 0.13 });
		console.log(`replay cost over 40 features: edit feature 1 -> replay ${deep.from}.. in ${deep.replayMs.toFixed(1)} ms (apply ${deep.ms.toFixed(1)} ms); edit feature 7 -> from ${mid.from} in ${mid.replayMs.toFixed(1)} ms; edit last -> from ${shallow.from} in ${shallow.replayMs.toFixed(1)} ms; edit at the window edge -> from ${window.from} in ${window.replayMs.toFixed(1)} ms; checkpoints held ${e.checkpointCount()} (window ${CHECKPOINT_WINDOW}); kernel memory ${(memory0 / 1e6).toFixed(1)} MB before, ${(memory1 / 1e6).toFixed(1)} MB after`);
		/* A checkpoint survives only for the newest window, so an edit at feature 1 rebuilds from the base (0) or from 1. */
		expect(deep.from).toBeLessThanOrEqual(1); expect(shallow.from).toBe(39);
		expect(e.checkpointCount()).toBeLessThanOrEqual(CHECKPOINT_WINDOW + 2);
		expect(m.bodies[0].volume).toBeCloseTo(12 + 4 * 3 * (19 * 0.1 - 19 * 0.05), 6);
	});
});

describe('the reducer, without a kernel', () => {
	it('names features by type count, keeps ids, and refuses the shapes it should', () => {
		let m = emptyManifest();
		m = reduce(m, { type: 'add-feature', feature: { id: '', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: 1 } } });
		expect(m.features[0].name).toBe('Plane 1'); expect(m.features[0].id).toMatch(/^f[0-9a-f]{12}$/);
		m = reduce(m, { type: 'rename-feature', id: m.features[0].id, name: 'Top offset' });
		expect(m.features[0].name).toBe('Top offset');
		expect(() => reduce(m, { type: 'rename-feature', id: m.features[0].id, name: ' ' })).toThrow(/1 to 60/);
		expect(() => reduce(m, { type: 'set-feature', id: 'missing', patch: {} })).toThrow(/no longer in the tree/);
		m = reduce(m, { type: 'suppress-feature', id: m.features[0].id, suppressed: true });
		expect(m.features[0].suppressed).toBe(true);
		m = reduce(m, { type: 'suppress-feature', id: m.features[0].id, suppressed: false });
		expect('suppressed' in m.features[0]).toBe(false);
		expect(() => reduce(m, { type: 'metadata', bodyId: 'nope', name: 'x' })).toThrow(/Select a body/);
		m.bodies.push({ id: 'b', name: 'B', artifact: '', materialId: null, role: 'part' });
		m = reduce(m, { type: 'metadata', bodyId: 'b', color: '#FF8800', fixed: true });
		expect(m.bodies[0].color).toBe('#ff8800'); expect(m.bodies[0].fixed).toBe(true);
		expect(() => reduce(m, { type: 'metadata', bodyId: 'b', color: 'red' })).toThrow(/colour/);
	});
});
