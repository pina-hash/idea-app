// tests/ideacad-solid-analysis-engine.test.ts
//
// THE ANALYSIS MODULES OVER THE REAL ENGINE'S PROJECTION, and the interference
// request run the way the engine is asked to run it. The pure modules are
// proven on hand-built projections elsewhere; this file proves the PLUMBING a
// hand-built projection cannot: that what `SolidEngine.project()` really hands
// a panel -- tessellated display meshes, kernel bounds, the unit-density
// tensor about each body's own center -- gives the hand-computed mass, CG,
// tip angle and inertia for two extruded bodies, once a cited material is
// assigned through the ordinary `metadata` command and not before.
//
// AND THE REQUEST, BEFORE IT IS WIRED. `checkInterference` is called on the
// engine's own kernel and live bodies inside the engine's own `scratch`, which
// is the one-line engine method this lane asks the writer for; the test prefers
// that method the moment it exists. It proves the check finds the overlap two
// extrudes really have, and that it leaves the model exactly as it found it:
// every body's volume, and the saved manifest, identical before and after.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { checkInterference, type InterferenceReport } from '../src/lib/ideacad/solid/analysis/interference';
import { inertiaAbout, massReport } from '../src/lib/ideacad/solid/analysis/mass';
import { tipReport } from '../src/lib/ideacad/solid/analysis/balance';
import type { Feature, FeatureOf } from '../src/lib/ideacad/solid/types';

const engines: SolidEngine[] = [];
async function engine() { const e = await SolidEngine.create(new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'))); engines.push(e); return e; }
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; });
const add = (e: SolidEngine, feature: Feature) => e.apply({ type: 'add-feature', feature });
function rect(id: string, x0: number, y0: number, x1: number, y1: number): FeatureOf<'sketch'> {
	const pts: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
	return { id, name: id, type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [...pts.map((p, i) => ({ id: `p${i}`, type: 'point' as const, x: p[0], y: p[1] })), ...pts.map((_, i) => ({ id: `l${i}`, type: 'line' as const, a: `p${i}`, b: `p${(i + 1) % 4}` }))], constraints: [] };
}
/** The request as the engine is asked to answer it: its own kernel, its live bodies, inside its own scratch. */
function interference(e: SolidEngine): InterferenceReport {
	const inner = e as unknown as { interference?: () => InterferenceReport; k: Parameters<typeof checkInterference>[0]; live: { order: string[]; bodies: Map<string, { solid: number }> }; scratch<T>(fn: () => T): T };
	if (typeof inner.interference === 'function') return inner.interference();
	return inner.scratch(() => checkInterference(inner.k, inner.live.order.map((id) => ({ id, solid: inner.live.bodies.get(id)!.solid }))));
}
const CM3 = 16.387064, ALUMINUM = 2.7;

describe('analysis over the engine\'s own projection', () => {
	it('two aluminum plates: mass, CG, tip angle and inertia from the projection match the hand values, and none exist before a material is chosen', async () => {
		const e = await engine();
		await add(e, rect('s1', 0, 0, 4, 2)); await add(e, { id: 'a', name: 'Plate', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' });
		await add(e, rect('s2', 6, 0, 8, 2)); let model = await add(e, { id: 'b', name: 'Block', type: 'extrude', sketch: 's2', distance: 1, operation: 'new' });
		/* Before: no material, so nothing is known and both bodies are named. */
		const before = massReport(model);
		expect(before.totalG).toBeNull(); expect(before.cg).toBeNull();
		expect(before.blockers.map((b) => b.blocker)).toEqual(['no-material', 'no-material']);
		for (const body of model.bodies) model = await e.apply({ type: 'metadata', bodyId: body.id, materialId: 'aluminum-6061-t6' });
		const r = massReport(model);
		const ma = 8 * CM3 * ALUMINUM, mb = 4 * CM3 * ALUMINUM;
		expect(r.totalG).toBeCloseTo(ma + mb, 8);
		expect(r.cg![0]).toBeCloseTo((2 * ma + 7 * mb) / (ma + mb), 8);
		expect(r.cg![2]).toBeCloseTo(0.5, 8);
		expect(r.groundZ).toBeCloseTo(0, 9);
		/* The footprint is the hull of both bottoms, 0..8 by 0..2; it tips first over a long side, at atan(1 / 0.5). */
		const t = tipReport(model.bodies, r.cg!, r.groundZ!)!;
		expect(t.footprint).toBe('area');
		expect(t.least!.angleDeg).toBeCloseTo((Math.atan(1 / 0.5) * 180) / Math.PI, 6);
		/* About the world Z axis: each plate's m (a^2 + b^2) / 12 plus m d^2 to its own center. */
		const I = inertiaAbout(model.bodies, { origin: [0, 0, 0], direction: [0, 0, 1] }).gIn2!;
		expect(I).toBeCloseTo((ma * 20) / 12 + ma * (4 + 1) + (mb * 8) / 12 + mb * (49 + 1), 5);
	});
	it('the interference request finds the overlap two extrudes really have, and leaves the model as it found it', async () => {
		const e = await engine();
		await add(e, rect('s1', 0, 0, 4, 2)); await add(e, { id: 'a', name: 'Plate', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' });
		await add(e, rect('s2', 3, 1, 5, 3)); const model = await add(e, { id: 'b', name: 'Block', type: 'extrude', sketch: 's2', distance: 2, operation: 'new' });
		const snapshot = await e.snapshot();
		const report = interference(e);
		expect(report.pairsChecked).toBe(1);
		expect(report.pairs[0]).toMatchObject({ a: 'a#0', b: 'b#0', kind: 'interference', quality: 'exact' });
		/* Hand: x 3..4, y 1..2, z 0..1. */
		expect(report.pairs[0].volume).toBeCloseTo(1, 9);
		const after = e.project();
		expect(after.bodies.map((b) => b.volume)).toEqual(model.bodies.map((b) => b.volume));
		expect((await e.snapshot()).manifest).toEqual(snapshot.manifest);
		/* And it runs again, on the same live bodies, with the same answer. */
		expect(interference(e).pairs[0].volume).toBeCloseTo(1, 9);
	});
	it('Measure between two bodies reads the true gap beside a curved face, and zero where two bodies overlap', async () => {
		const e = await engine();
		await add(e, rect('s1', 0, 0, 4, 2)); await add(e, { id: 'a', name: 'Plate', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' });
		await add(e, rect('s2', 3, 1, 5, 3)); await add(e, { id: 'b', name: 'Block', type: 'extrude', sketch: 's2', distance: 2, operation: 'new' });
		await add(e, { id: 's3', name: 's3', type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [{ id: 'c', type: 'point', x: 1, y: -1.1 }, { id: 'k', type: 'circle', center: 'c', radius: 1 }], constraints: [] });
		await add(e, { id: 'c', name: 'Wheel', type: 'extrude', sketch: 's3', distance: 1, operation: 'new' });
		await add(e, { id: 's4', name: 's4', type: 'sketch', plane: { kind: 'datum', datum: 'XY', offset: 1.125 }, entities: [{ id: 'c', type: 'point', x: 1.5, y: 1 }, { id: 'k', type: 'circle', center: 'c', radius: 0.75 }], constraints: [] });
		await add(e, { id: 'd', name: 'Disk', type: 'extrude', sketch: 's4', distance: 0.25, operation: 'new' });
		const body = (id: string) => ({ bodyId: id, kind: 'body' as const, id });
		expect(e.measure(body('a#0'), body('b#0'))).toMatchObject({ kind: 'distance', value: 0 });
		/* Hand: the wheel's rim comes to y = -0.1 at x = 1, inside the plate's own x range, so the gap is 0.1 to its side face. */
		expect(e.measure(body('a#0'), body('c#0')).value).toBeCloseTo(0.1, 6);
		/* Hand: a disk whose bottom sits 0.125 above the plate's top, wholly over it. */
		expect(e.measure(body('a#0'), body('d#0')).value).toBeCloseTo(0.125, 6);
	});
});
