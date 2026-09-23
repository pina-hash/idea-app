// tests/ideacad-solid-rollback.test.ts
//
// THE ROLLBACK BAR AND THE TIME-LAPSE, WITH THE REAL KERNEL. Both are
// WORKSPACE STATE: the bar builds only features [0, k) and the time-lapse
// replays once to hand the main thread a mesh per step. The regressions that
// would be silent are a bar that writes the manifest (every drag of it would
// become a history row and a save), a feature added while rolled back landing
// at the end instead of at the bar, and a roll forward that does not rebuild
// what the bar skipped. Every volume is an analytic bound for a 4 x 3 box with
// push steps on its top face, never a number read off the kernel and typed back.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { type Feature, type FeatureOf } from '../src/lib/ideacad/solid/types';

const WASM = new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'));
const engines: SolidEngine[] = [];
async function engine() { const e = await SolidEngine.create(WASM); engines.push(e); return e; }
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; });

function rectangle(id: string, x0: number, y0: number, w: number, h: number): FeatureOf<'sketch'> {
	return { id, name: `Sketch ${id}`, type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [
		{ id: 'p0', type: 'point', x: x0, y: y0 }, { id: 'p1', type: 'point', x: x0 + w, y: y0 }, { id: 'p2', type: 'point', x: x0 + w, y: y0 + h }, { id: 'p3', type: 'point', x: x0, y: y0 + h },
		{ id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }
	], constraints: [] };
}
const add = (e: SolidEngine, feature: Feature) => e.apply({ type: 'add-feature', feature });
const push = (id: string, value: number): Feature => ({ id, name: `Push ${id}`, type: 'push', face: { body: 'x1#0', name: 'x1.end' }, value });
/** A 4 x 3 x 1 box, then three pushes of the top face: +0.5, +0.25, +0.125, so heights 1, 1.5, 1.75, 1.875. */
async function stack(e: SolidEngine) {
	await add(e, rectangle('s1', 0, 0, 4, 3));
	await add(e, { id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' });
	await add(e, push('pa', 0.5)); await add(e, push('pb', 0.25));
	return add(e, push('pc', 0.125));
}
const height = (volume: number) => volume / 12;

describe('the rollback bar builds only the features above it', () => {
	it('rolling back to k shows k features, keeps the manifest, and rolling forward replays the rest', async () => {
		const e = await engine(); const full = await stack(e);
		expect(height(full.bodies[0].volume)).toBeCloseTo(1.875, 9);
		const saved = JSON.stringify((await e.snapshot()).manifest);
		const back = await e.rollback(3);
		expect(back.rollbackIndex).toBe(3);
		expect(height(back.bodies[0].volume)).toBeCloseTo(1.5, 9);
		/* Every feature is still listed, with the status its last full build gave it. */
		expect(back.features.map((f) => f.id)).toEqual(['s1', 'x1', 'pa', 'pb', 'pc']);
		expect(back.features.map((f) => f.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
		/* The bar is workspace state: the manifest a save would send is unchanged. */
		expect(JSON.stringify((await e.snapshot()).manifest)).toBe(saved);
		const empty = await e.rollback(0);
		expect(empty.bodies).toHaveLength(0);
		const forward = await e.rollback(null);
		expect(forward.rollbackIndex).toBeNull();
		expect(height(forward.bodies[0].volume)).toBeCloseTo(1.875, 9);
	});
	it('a feature added while rolled back goes in at the bar, and the bar moves past it', async () => {
		const e = await engine(); await stack(e);
		await e.rollback(3);
		const added = await add(e, push('pd', 1));
		expect(added.features.map((f) => f.id)).toEqual(['s1', 'x1', 'pa', 'pd', 'pb', 'pc']);
		expect(added.rollbackIndex).toBe(4);
		/* Built: the box, +0.5 and the new +1; pb and pc still wait below the bar. */
		expect(height(added.bodies[0].volume)).toBeCloseTo(2.5, 9);
		const forward = await e.rollback(null);
		expect(height(forward.bodies[0].volume)).toBeCloseTo(2.875, 9);
	});
	it('the workspace undo and redo (a whole tree loaded over this one) keep the bar after what was built', async () => {
		const e = await engine(); await stack(e);
		await e.rollback(3);
		const before = (await e.snapshot());
		await add(e, push('pd', 1));
		const withInsert = (await e.snapshot());
		/* Undo: the tree without the inserted push. The bar goes back to where it stood. */
		const undone = await e.load(before, false);
		expect(undone.rollbackIndex).toBe(3);
		expect(height(undone.bodies[0].volume)).toBeCloseTo(1.5, 9);
		/* Redo: the push comes back at the bar and is built with it. */
		const redone = await e.load(withInsert, false);
		expect(redone.rollbackIndex).toBe(4);
		expect(height(redone.bodies[0].volume)).toBeCloseTo(2.5, 9);
	});
	it('a gesture while rolled back inserts at the bar and a cancelled one leaves the bar where it was', async () => {
		const e = await engine(); await stack(e);
		await e.rollback(2);
		await e.begin();
		const during = await e.update({ type: 'add-feature', feature: push('pg', 0.75) });
		expect(during.features.findIndex((f) => f.id === 'pg')).toBe(2);
		expect(height(during.bodies[0].volume)).toBeCloseTo(1.75, 9);
		const cancelled = await e.cancel();
		expect(cancelled.rollbackIndex).toBe(2);
		expect(cancelled.features.map((f) => f.id)).toEqual(['s1', 'x1', 'pa', 'pb', 'pc']);
	});
});

describe('the time-lapse is built once', () => {
	it('hands back one step per feature carrying only the bodies that changed, and leaves the model as it was', async () => {
		const e = await engine(); await stack(e);
		const { steps } = await e.timelapse();
		expect(steps).toHaveLength(5);
		/* The sketch makes no body; the extrude makes the box; each push changes it. */
		expect(steps.map((s) => s.changed.length)).toEqual([0, 1, 1, 1, 1]);
		expect(steps[0].sketches.map((s) => s.feature)).toEqual(['s1']);
		expect(steps[1].sketches).toHaveLength(0);
		expect(steps.map((s) => s.changed[0] ? height(s.changed[0].volume) : null)).toEqual([null, expect.closeTo(1, 9), expect.closeTo(1.5, 9), expect.closeTo(1.75, 9), expect.closeTo(1.875, 9)]);
		const after = e.project();
		expect(after.rollbackIndex).toBeNull();
		expect(height(after.bodies[0].volume)).toBeCloseTo(1.875, 9);
	});
	it('keeps the rollback bar where it stood', async () => {
		const e = await engine(); await stack(e);
		await e.rollback(3);
		const { steps } = await e.timelapse();
		expect(steps).toHaveLength(5);
		const after = e.project();
		expect(after.rollbackIndex).toBe(3);
		expect(height(after.bodies[0].volume)).toBeCloseTo(1.5, 9);
	});
	it('measures the one-time cost and the bytes it holds for a forty-feature document', async () => {
		const e = await engine(); await stack(e);
		for (let i = 0; i < 35; i++) await add(e, push(`q${i}`, i % 2 ? 0.1 : -0.05));
		expect(e.project().features).toHaveLength(40);
		const { steps, ms } = await e.timelapse();
		let bytes = 0;
		for (const step of steps) for (const body of step.changed) for (const face of body.faces) bytes += face.positions.byteLength + face.normals.byteLength + (face.indices as Uint32Array).byteLength;
		for (const step of steps) for (const body of step.changed) for (const edge of body.edges) bytes += edge.points.byteLength;
		console.log(`time-lapse over 40 features: built in ${ms.toFixed(1)} ms, ${steps.length} steps, ${steps.reduce((n, s) => n + s.changed.length, 0)} body meshes, ${(bytes / 1e6).toFixed(2)} MB of mesh`);
		expect(steps).toHaveLength(40);
	});
});
