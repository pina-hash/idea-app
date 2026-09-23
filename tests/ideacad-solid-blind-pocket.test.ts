// tests/ideacad-solid-blind-pocket.test.ts
//
// A BLIND POCKET FROM A FACE SKETCH, and a boss pulled out of a face against
// its normal, with the real kernel. On the vendored Remus build a tool swept
// AGAINST its own profile's normal returns an invalid solid from both cut and
// fuse (measured 2026-09-23, ledger 0296; the identical cylinder swept the
// other way is valid), so every interior pocket a student sketched on a top
// face and pulled down was refused with 'This change could not form a valid
// solid'. Only cuts that broke out of the part happened to survive, which is
// why the through-cut in ideacad-solid-engine.test.ts never saw it. The
// extrude executor now rebuilds such a tool from its far end; these pin that
// the pocket is exact, that its faces keep their construction names, and that
// a cut that already worked is untouched.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { refFromSelection } from '../src/lib/ideacad/solid/naming';
import type { Feature, FeatureOf, ModelProjection, Selection } from '../src/lib/ideacad/solid/types';
const engines: SolidEngine[] = [];
async function engine() { const e = await SolidEngine.create(new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'))); engines.push(e); return e; }
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; });
const block = (id: string, w: number, d: number): FeatureOf<'sketch'> => { const pts: [number, number][] = [[0, 0], [w, 0], [w, d], [0, d]]; return { id, name: id, type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [...pts.map((p, i) => ({ id: `p${i}`, type: 'point' as const, x: p[0], y: p[1] })), ...pts.map((_, i) => ({ id: `l${i}`, type: 'line' as const, a: `p${i}`, b: `p${(i + 1) % 4}` }))], constraints: [] }; };
const circle = (id: string, c: [number, number], r: number, plane: FeatureOf<'sketch'>['plane']): FeatureOf<'sketch'> => ({ id, name: id, type: 'sketch', plane, entities: [{ id: 'c', type: 'point', x: c[0], y: c[1] }, { id: 'k', type: 'circle', center: 'c', radius: r }], constraints: [] });
const face = (m: ModelProjection, z: 1 | -1): Selection => { const b = m.bodies[0], f = b.faces.find((f) => f.kind === 'plane' && f.normal[2] * z > 0.99)!; return { bodyId: b.id, kind: 'face', id: f.id }; };
const ref = (m: ModelProjection, s: Selection) => refFromSelection(s, m.bodies[0]) as never;
async function base(e: SolidEngine) {
	const add = (f: Feature) => e.apply({ type: 'add-feature', feature: f });
	await add(block('p', 3.17, 1));
	return add({ id: 'x', name: 'Block', type: 'extrude', sketch: 'p', distance: 1.17, operation: 'new' });
}
describe('a tool pulled against its profile normal', () => {
	it('cuts an exact blind pocket from a circle in the middle of a top face, with its faces named', async () => {
		const e = await engine(), add = (f: Feature) => e.apply({ type: 'add-feature', feature: f });
		let m = await base(e);
		m = await add(circle('h', [1.585, 0.5], 0.25, { kind: 'face', face: ref(m, face(m, 1)) }));
		m = await add({ id: 'cut', name: 'Pocket', type: 'extrude', sketch: 'h', distance: -0.5, operation: 'cut', target: m.bodies[0].id });
		const row = m.features.find((f) => f.id === 'cut')!;
		expect(row.status).toBe('ok');
		expect(m.bodies).toHaveLength(1);
		expect(m.bodies[0].volume).toBeCloseTo(3.17 * 1.17 - Math.PI * 0.25 ** 2 * 0.5, 6);
		const names = m.bodies[0].faces.map((f) => f.id);
		expect(names).toContain('cut.end');
		expect(names.some((n) => n.startsWith('cut.side.'))).toBe(true);
		const floor = m.bodies[0].faces.find((f) => f.id === 'cut.end')!;
		expect(floor.center[2]).toBeCloseTo(0.67, 6);
	});
	it('fuses a boss pulled down off a bottom face', async () => {
		const e = await engine(), add = (f: Feature) => e.apply({ type: 'add-feature', feature: f });
		let m = await base(e);
		m = await add(circle('b', [1.585, 0.5], 0.25, { kind: 'face', face: ref(m, face(m, 1)) }));
		/* The boss's sketch sits on the top face; pulling it up is WITH the normal, pulling a sketch on the bottom face down is against it. */
		const bottom = ref(m, face(m, -1));
		m = await add(circle('b2', [1.585, 0.5], 0.25, { kind: 'face', face: bottom }));
		const plane = m.sketches.find((s) => s.feature === 'b2')!.plane;
		/* Whichever way the bottom face's plane points, a signed distance that runs AWAY from the block along -Z is the boss. */
		const out = plane.normal[2] > 0 ? -0.5 : 0.5;
		m = await add({ id: 'boss', name: 'Boss', type: 'extrude', sketch: 'b2', distance: out, operation: 'add', target: m.bodies[0].id });
		expect(m.features.find((f) => f.id === 'boss')!.status).toBe('ok');
		expect(m.bodies[0].volume).toBeCloseTo(3.17 * 1.17 + Math.PI * 0.25 ** 2 * 0.5, 6);
		expect(m.bodies[0].bounds[2]).toBeCloseTo(-0.5, 6);
	});
	it('leaves a through-cut that already worked exactly as it was', async () => {
		const e = await engine(), add = (f: Feature) => e.apply({ type: 'add-feature', feature: f });
		let m = await base(e);
		m = await add(circle('t', [1.585, 0.5], 0.25, { kind: 'face', face: ref(m, face(m, 1)) }));
		m = await add({ id: 'thru', name: 'Through', type: 'extrude', sketch: 't', distance: -2, operation: 'cut', target: m.bodies[0].id });
		expect(m.features.find((f) => f.id === 'thru')!.status).toBe('ok');
		expect(m.bodies[0].volume).toBeCloseTo(3.17 * 1.17 - Math.PI * 0.25 ** 2 * 1.17, 6);
	});
});
