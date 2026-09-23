// tests/ideacad-solid-blend-refusals.test.ts
//
// A REFUSED FILLET OR CHAMFER, THROUGH THE REAL ENGINE AND THE REAL KERNEL:
// what the student reads, and the one-click way forward that travels with it.
//
// Where the expected value comes from matters (Addendum A5.3). The largest
// radius that fits on the edge of a plate is bounded by the PLATE'S
// THICKNESS, a number this file types, never one read back off the search:
// a quarter-round on the edge between a 0.5 in side and the top cannot reach
// past the 0.5 in side. The kernel's own limit is a strict bound (measured:
// a 0.5 in round on a 0.5 in plate is refused, 0.499 is made), so the answer
// is asserted to sit within 1e-3 BELOW it, and then applied, and must fit.
//
// Both directions on every claim: a size search that spends kernel attempts
// only on a refusal (counted, zero on success); a fix that is offered and a
// fix that is absent; the student's typed value kept until they press it.
//
// `help` rides on the thrown refusal. The engine carries it onto the feature
// row once its catch copies it (a request to the single writer); until then
// the test reads it where the executor throws it, by wrapping the registry
// entry, which changes nothing the engine does.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { EXECUTORS } from '../src/lib/ideacad/solid/features/index';
import type { ExecutorContext } from '../src/lib/ideacad/solid/features/context';
import { BlendRefusal, FIT_ATTEMPTS, edgeKey, edgeSet, edgeShape, facesByEdge, floorFigure, largestThatFits, readKernelBlendError, sizeFixFromSentence } from '../src/lib/ideacad/solid/features/blends';
import type { EdgeRef, Feature, FeatureOf, ModelProjection, SolidCommand } from '../src/lib/ideacad/solid/types';
import { refFromSelection } from '../src/lib/ideacad/solid/naming';

const WASM = new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'));
const engines: SolidEngine[] = [];
const originals = { fillet: EXECUTORS.fillet, chamfer: EXECUTORS.chamfer };
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; EXECUTORS.fillet = originals.fillet; EXECUTORS.chamfer = originals.chamfer; });

/** Every refusal the two blend executors throw, and how many scratch probes each run spent, without changing what they do. */
function watch() {
	const log = { refusals: [] as BlendRefusal[], scratches: [] as number[] };
	const wrap = <T extends 'fillet' | 'chamfer'>(type: T) => {
		const run = originals[type] as (ctx: ExecutorContext, f: Feature) => void;
		(EXECUTORS as Record<string, unknown>)[type] = (ctx: ExecutorContext, f: Feature) => {
			let n = 0;
			const counted = { ...ctx, scratch: <R>(fn: () => R) => { n++; return ctx.scratch(fn); } } as ExecutorContext;
			try { run(counted, f); } catch (e) { if (e instanceof BlendRefusal) log.refusals.push(e); throw e; } finally { log.scratches.push(n); }
		};
	};
	wrap('fillet'); wrap('chamfer');
	return log;
}
function rectangle(id: string, w: number, h: number): FeatureOf<'sketch'> {
	return { id, name: `Sketch ${id}`, type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [
		{ id: 'p0', type: 'point', x: 0, y: 0 }, { id: 'p1', type: 'point', x: w, y: 0 }, { id: 'p2', type: 'point', x: w, y: h }, { id: 'p3', type: 'point', x: 0, y: h },
		{ id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }
	], constraints: [] };
}
const add = (e: SolidEngine, feature: Feature) => e.apply({ type: 'add-feature', feature });
const row = (m: ModelProjection, id: string) => m.features.find((f) => f.id === id)!;
const THICK = 0.5;
/** A 4 x 3 x 0.5 plate: sketch `s1` on XY, extrude `x1`, body `x1#0`; x1.end is the top, x1.side.0 the front (y = 0). */
async function plate() { const e = await SolidEngine.create(WASM); engines.push(e); await add(e, rectangle('s1', 4, 3)); return { e, m: await add(e, { id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: THICK, operation: 'new' }) }; }
const edgeBetween = (m: ModelProjection, a: string, b: string) => m.bodies[0].edges.find((ed) => ed.faces.includes(a) && ed.faces.includes(b))!;
const edgeRef = (m: ModelProjection, a: string, b: string) => refFromSelection({ bodyId: 'x1#0', kind: 'edge', id: edgeBetween(m, a, b).id }, m.bodies[0]) as EdgeRef;
/** Press a fix the way the panel does: its commands, in order, each one an ordinary edit. */
async function press(e: SolidEngine, commands: SolidCommand[]) { let m: ModelProjection = e.project(); for (const c of commands) m = await e.apply(c); return m; }
const rounded = (r: number, length: number) => r * r * (1 - Math.PI / 4) * length;

describe('the largest size that fits', () => {
	it('an oversize round on the plate edge is refused in words with the largest radius that fits, within 1e-3 below the plate thickness, in ONE extra kernel attempt; pressing it rounds the edge and the typed value was kept until then', async () => {
		const log = watch(); const { e, m } = await plate();
		/* Added the way the feature panel adds it (no id), so the refused row stays in the tree with the value as typed. */
		const refused = await add(e, { id: '', name: '', type: 'fillet', edges: [edgeRef(m, 'x1.end', 'x1.side.0')], radius: 3 } as Feature);
		const fillet = refused.features[2];
		expect(fillet.status).toBe('error');
		expect((await e.snapshot()).manifest.features[2]).toMatchObject({ type: 'fillet', radius: 3 });
		const refusal = log.refusals.at(-1)!;
		const fit = refusal.help.fix!.value!;
		expect(fit).toBeLessThan(THICK); expect(THICK - fit).toBeLessThanOrEqual(1e-3 + 1e-12);
		expect(fillet.message).toBe(`That radius is too big for this edge. The largest that fits here is ${fit} in.`);
		expect(fillet.message).not.toMatch(/Id\(|blend cliff|available radius/);
		expect(refusal.help.detail).toMatch(/available radius 0\.5/);
		expect(refusal.help.fix!.label).toBe(`Use ${fit} in`);
		expect(refusal.help.where).toEqual([{ bodyId: 'x1#0', kind: 'edge', id: 'edge:x1.end|x1.side.0' }]);
		/* The kernel named its limit, so the search spent exactly one probe: the confirmation just under it. */
		expect(log.scratches.at(-1)).toBe(1);
		/* Until the engine carries help onto the row, the panel reads the same fix back out of the sentence: identical, both ways. */
		const stored = (await e.snapshot()).manifest.features[2];
		expect(sizeFixFromSentence(fillet, stored)).toEqual(refusal.help.fix);
		expect(sizeFixFromSentence({ ...fillet, message: 'Several rounds meet at one corner here in a way that cannot be blended. Try fewer edges at a time.' }, stored)).toBeNull();
		expect(sizeFixFromSentence(fillet, { ...stored, id: 'other' })).toBeNull();
		const fixed = await press(e, refusal.help.fix!.commands);
		expect(row(fixed, fillet.id).status).toBe('ok');
		expect(fixed.bodies[0].volume).toBeCloseTo(4 * 3 * THICK - rounded(fit, 4), 9);
		/* A blend that succeeds spends no probe at all. */
		expect(log.scratches.at(-1)).toBe(0);
	});
	it('an oversize chamfer is refused the same way: the largest distance that fits sits within 1e-3 below the plate thickness and pressing it bevels the edge', async () => {
		const log = watch(); const { e, m } = await plate();
		const refused = await add(e, { id: '', name: '', type: 'chamfer', edges: [edgeRef(m, 'x1.end', 'x1.side.0')], distance: 3 } as Feature);
		const chamfer = refused.features[2];
		const refusal = log.refusals.at(-1)!, fit = refusal.help.fix!.value!;
		expect(fit).toBeLessThan(THICK); expect(THICK - fit).toBeLessThanOrEqual(1e-3 + 1e-12);
		expect(chamfer.message).toBe(`That chamfer is too big for this edge. The largest that fits here is ${fit} in.`);
		expect(refusal.help.detail).toMatch(/Reduce the chamfer distance below 0\.5/);
		expect(sizeFixFromSentence(chamfer, (await e.snapshot()).manifest.features[2])).toEqual(refusal.help.fix);
		const fixed = await press(e, refusal.help.fix!.commands);
		expect(row(fixed, chamfer.id).status).toBe('ok');
		expect(fixed.bodies[0].volume).toBeCloseTo(4 * 3 * THICK - 0.5 * fit * fit * 4, 9);
	});
	it('the drag path refuses the same sentence: an add with its own id is refused whole and nothing is left in the tree', async () => {
		const { e, m } = await plate();
		await expect(add(e, { id: 'f1', name: 'Fillet 1', type: 'fillet', edges: [edgeRef(m, 'x1.end', 'x1.side.0')], radius: 0.75 })).rejects.toThrow(/^That radius is too big for this edge\. The largest that fits here is 0\.499 in\.$/);
		expect(e.project().features).toHaveLength(2);
	});
});

describe('refusals that name an edge or a corner', () => {
	it('F014: all four edges of the top after one is rounded names the rounded edge and offers to round the other three in Fillet 1, which then makes all four', async () => {
		const log = watch(); const { e, m } = await plate();
		const r = 0.1;
		await add(e, { id: 'f1', name: 'Fillet 1', type: 'fillet', edges: [edgeRef(m, 'x1.end', 'x1.side.0')], radius: r });
		const m1 = e.project();
		const top = m1.bodies[0].faces.find((f) => f.id === 'x1.end')!;
		expect(top.edges).toHaveLength(4);
		const four = top.edges.map((id) => refFromSelection({ bodyId: 'x1#0', kind: 'edge', id }, m1.bodies[0]) as EdgeRef);
		const refused = await add(e, { id: '', name: '', type: 'fillet', edges: four, radius: r } as Feature);
		const f2 = refused.features[3];
		expect(f2.status).toBe('error');
		expect(f2.message).toBe('1 of these edges is already rounded by Fillet 1, and the others meet that round at its corners. Rounds that share a corner have to be made together.');
		const refusal = log.refusals.at(-1)!;
		expect(refusal.help.where).toEqual([{ bodyId: 'x1#0', kind: 'edge', id: 'edge:f1.blend.x1.end|x1.side.0|x1.end' }]);
		/* The projection joins a round's own name into its edge ids differently; `edgeKey` is the one spelling both sides compare by. */
		const smoothEdge = m1.bodies[0].edges.find((x) => facesByEdge(m1.bodies[0]).get(x.id)!.map((f) => f.id).sort().join() === ['f1.blend.x1.end|x1.side.0', 'x1.end'].join())!;
		expect(edgeKey(smoothEdge.id)).toBe(edgeKey(refusal.help.where![0].id));
		expect(refusal.help.fix!.label).toBe('Add 3 edges to Fillet 1');
		/* No kernel probe was spent: an edge with no corner to round is named before any size is tried. */
		expect(log.scratches.at(-1)).toBe(0);
		const fixed = await press(e, refusal.help.fix!.commands);
		expect(fixed.features.map((f) => f.id)).toEqual(['s1', 'x1', 'f1']);
		expect(row(fixed, 'f1').status).toBe('ok');
		expect(fixed.bodies[0].faces.filter((f) => f.id.startsWith('f1.blend.') && f.kind === 'cylinder')).toHaveLength(4);
		const straight = 2 * rounded(r, 4 - 2 * r) + 2 * rounded(r, 3 - 2 * r);
		expect(fixed.bodies[0].volume).toBeLessThan(6 - straight);
		expect(fixed.bodies[0].volume).toBeGreaterThan(6 - straight - 4 * r * r * r);
	});
	it('a sharp edge that meets an earlier round at a corner, with no size that fits, is offered to that round; the other direction, an edge far from it, rounds on its own', async () => {
		const log = watch(); const { e, m } = await plate();
		await add(e, { id: 'f1', name: 'Fillet 1', type: 'fillet', edges: [edgeRef(m, 'x1.end', 'x1.side.0')], radius: 0.1 });
		const refused = await add(e, { id: '', name: '', type: 'fillet', edges: [edgeRef(m, 'x1.end', 'x1.side.1')], radius: 0.1 } as Feature);
		const f2 = refused.features[3];
		expect(f2.message).toBe('This edge meets the round from Fillet 1 at a corner. Rounds that share a corner have to be made together.');
		const refusal = log.refusals.at(-1)!;
		expect(refusal.help.fix!.label).toBe('Add to Fillet 1');
		expect(log.scratches.at(-1)).toBeLessThanOrEqual(FIT_ATTEMPTS);
		const fixed = await press(e, refusal.help.fix!.commands);
		expect(fixed.features.map((f) => f.id)).toEqual(['s1', 'x1', 'f1']);
		expect(row(fixed, 'f1').status).toBe('ok');
		const far = await add(e, { id: 'f3', name: 'Fillet 3', type: 'fillet', edges: [edgeRef(m, 'x1.start', 'x1.side.2')], radius: 0.1 });
		expect(row(far, 'f3').status).toBe('ok');
	});
	it('an edge that is already smooth is refused with no corner to round and no fix; a tangent run with the chain turned off is offered the whole chain', async () => {
		const log = watch(); const { e, m } = await plate();
		await add(e, { id: 'f1', name: 'Fillet 1', type: 'fillet', edges: [edgeRef(m, 'x1.end', 'x1.side.0')], radius: 0.1 });
		const m1 = e.project();
		const tangent = m1.bodies[0].edges.find((ed) => ed.faces.includes('x1.end') && ed.faces.some((f) => f.startsWith('f1.blend.')))!;
		await expect(add(e, { id: 'f2', name: 'Fillet 2', type: 'fillet', edges: [refFromSelection({ bodyId: 'x1#0', kind: 'edge', id: tangent.id }, m1.bodies[0]) as EdgeRef], radius: 0.05 })).rejects.toThrow('That edge is already smooth, so there is no corner to round.');
		expect(log.refusals.at(-1)!.help.fix).toBeUndefined();
		/* Four vertical corners rounded, then one top edge with the chain OFF: the kernel cannot stop a round partway along a smooth run. */
		const { e: e2, m: b } = await plate();
		const vertical = [['x1.side.0', 'x1.side.1'], ['x1.side.1', 'x1.side.2'], ['x1.side.2', 'x1.side.3'], ['x1.side.0', 'x1.side.3']].map(([a, c]) => edgeRef(b, a, c));
		await add(e2, { id: 'c1', name: 'Corners', type: 'fillet', edges: vertical, radius: 0.3 });
		const b1 = e2.project();
		const one = refFromSelection({ bodyId: 'x1#0', kind: 'edge', id: edgeBetween(b1, 'x1.end', 'x1.side.0').id }, b1.bodies[0]) as EdgeRef;
		const refused = await add(e2, { id: '', name: '', type: 'fillet', edges: [one], radius: 0.1, propagate: false } as Feature);
		expect(refused.features[3].message).toBe('This edge runs smoothly on into the next edges, and a round cannot stop partway along them.');
		const fix = log.refusals.at(-1)!.help.fix!;
		expect(fix.label).toBe('Round the whole chain');
		const fixed = await press(e2, fix.commands);
		expect(fixed.features[3].status).toBe('ok');
		expect(fixed.bodies[0].faces.filter((f) => f.id.startsWith(`${fixed.features[3].id}.blend.`))).toHaveLength(8);
	});
});

describe('the pure halves', () => {
	it('reads the kernel texts measured on this build, and a text it does not know is `other`, never a guess', () => {
		expect(readKernelBlendError('blend: blend cliff on face Id(2) at edge Id(9): requested radius 3, available radius 2.999999999999999')).toEqual({ kind: 'cliff', limit: 2.999999999999999 });
		expect(readKernelBlendError('invalid input: chamfer setback does not fit: 3.000000 of material must be taken from an edge only 0.500000 long. Reduce the chamfer distance below 0.500000.')).toEqual({ kind: 'setback', limit: 0.5 });
		expect(readKernelBlendError('blend: unsupported vertex blend at Id(25): 2 stripes meet').kind).toBe('vertex');
		expect(readKernelBlendError('blend: trimming failure on face Id(7)').kind).toBe('trim');
		expect(readKernelBlendError('chamfer: unsupported configuration: corner 22 of bevelled edge 44 also lies on curved face 14; re-trimming a curved neighbour against the bevel is not implemented').kind).toBe('curved');
		expect(readKernelBlendError('invalid-input: invalid input: fillet postcondition validation failed with 2 error(s): wire self-intersection between edges 0 and 2').kind).toBe('self');
		expect(readKernelBlendError('something new').kind).toBe('other');
	});
	it('floorFigure keeps three figures and never rounds up; the search spends nothing it need not, stays within its budget, and returns only a size it tried', () => {
		expect([0.4999999995, 2.996999, 0.1414213562, 12.99999, 0.001, 1234.5].map(floorFigure)).toEqual([0.499, 2.99, 0.141, 12.9, 0.001, 1230]);
		for (const v of [0.4999999995, 2.996999, 0.1414213562, 0.0123456, 7]) expect(floorFigure(v)).toBeLessThanOrEqual(v);
		const TRUE_MAX = 0.3172, tried: number[] = [];
		const fits = (v: number) => { tried.push(v); return v < TRUE_MAX; };
		const hinted = largestThatFits(fits, 3, TRUE_MAX);
		expect(hinted).toEqual({ value: 0.317, attempts: 1 });
		tried.length = 0;
		const searched = largestThatFits(fits, 3);
		expect(searched.attempts).toBeLessThanOrEqual(FIT_ATTEMPTS);
		expect(tried).toContain(searched.value);
		expect(searched.value!).toBeLessThan(TRUE_MAX);
		expect(TRUE_MAX - searched.value!).toBeLessThan(TRUE_MAX * 0.02);
		/* No size fits: two probes, a small one and a tiny one, then it stops. */
		expect(largestThatFits(() => false, 3)).toEqual({ value: null, attempts: 2 });
	});
});

describe('edge sets over the projection (no kernel in the helpers; the projections come from the real engine)', () => {
	/** An L bracket: a 3 x 0.25 foot and a 0.25 x 2 wall, drawn on XZ and pulled 2 in. One inside corner, seventeen outside ones. */
	async function bracket() {
		const e = await SolidEngine.create(WASM); engines.push(e);
		const pts: [number, number][] = [[0, 0], [3, 0], [3, 0.25], [0.25, 0.25], [0.25, 2], [0, 2]];
		const entities: FeatureOf<'sketch'>['entities'] = [...pts.map(([x, y], i) => ({ id: `p${i}`, type: 'point' as const, x, y })), ...pts.map((_, i) => ({ id: `l${i}`, type: 'line' as const, a: `p${i}`, b: `p${(i + 1) % pts.length}` }))];
		await add(e, { id: 's1', name: 'L', type: 'sketch', plane: { kind: 'datum', datum: 'XZ' }, entities, constraints: [] });
		return add(e, { id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: 2, operation: 'new' });
	}
	it('convex and concave split an L bracket 17 to 1 by the dihedral sign, the one concave edge being the inside corner; a plain plate is 12 convex, 0 concave', async () => {
		const m = await bracket(), body = m.bodies[0];
		expect(body.edges).toHaveLength(18);
		const concave = edgeSet(body, 'concave'), convex = edgeSet(body, 'convex');
		expect(convex).toHaveLength(17); expect(concave).toHaveLength(1);
		const inside = body.edges.find((x) => x.id === concave[0])!;
		/* The inside corner runs along the pull at x = 0.25, z = 0.25. */
		expect(inside.mid[0]).toBeCloseTo(0.25, 9); expect(inside.mid[2]).toBeCloseTo(0.25, 9);
		const { m: p } = await plate();
		expect(edgeSet(p.bodies[0], 'convex')).toHaveLength(12); expect(edgeSet(p.bodies[0], 'concave')).toHaveLength(0);
		expect(edgeSet(p.bodies[0], 'body')).toHaveLength(12);
	});
	it('the tangent chain grows one rim edge of a box with rounded corners to all eight, agrees with the kernel walk, and stops at a sharp corner on a plain plate', async () => {
		const { e, m } = await plate();
		const vertical = [['x1.side.0', 'x1.side.1'], ['x1.side.1', 'x1.side.2'], ['x1.side.2', 'x1.side.3'], ['x1.side.0', 'x1.side.3']].map(([a, c]) => edgeRef(m, a, c));
		const r = await add(e, { id: 'c1', name: 'Corners', type: 'fillet', edges: vertical, radius: 0.3 });
		const body = r.bodies[0], top = body.faces.find((f) => f.id === 'x1.end')!;
		const seed = edgeBetween(r, 'x1.end', 'x1.side.0').id;
		const chain = edgeSet(body, 'chain', { edge: seed });
		expect(chain).toHaveLength(8);
		expect([...chain].sort()).toEqual([...top.edges].sort());
		/* Four of them run beside the corner rounds, four beside the flat sides: every one of them is on the top face. */
		expect(chain.filter((id) => id.includes('c1.blend.'))).toHaveLength(4);
		expect(edgeSet(m.bodies[0], 'chain', { edge: edgeBetween(m, 'x1.end', 'x1.side.0').id })).toEqual([edgeBetween(m, 'x1.end', 'x1.side.0').id]);
		/* The edge beside a round is smooth, neither convex nor concave. */
		const beside = body.edges.find((x) => facesByEdge(body).get(x.id)!.map((f) => f.id).sort().join() === ['c1.blend.x1.side.0|x1.side.1', 'x1.side.0'].join())!;
		expect(edgeShape(body, beside)).toBe('smooth');
	});
	it('a face loop through an edge is that loop only (the plate rim, not the hole rim); the feature set is the edges beside the faces a feature made', async () => {
		const { e, m } = await plate();
		const holed = await add(e, { id: 'h1', name: 'Hole 1', type: 'hole', face: refFromSelection({ bodyId: 'x1#0', kind: 'face', id: 'x1.end' }, m.bodies[0]) as never, center: [2, 1.5], standard: '1/4-20', fit: 'close', depth: 'through' });
		const body = holed.bodies[0], top = body.faces.find((f) => f.id === 'x1.end')!;
		expect(top.edges).toHaveLength(5);
		const rim = edgeBetween(holed, 'x1.end', 'x1.side.0').id;
		expect([...edgeSet(body, 'loop', { edge: rim, face: 'x1.end' })].sort()).toEqual(top.edges.filter((id) => !id.includes('h1.')).sort());
		const holeRim = top.edges.find((id) => id.includes('h1.'))!;
		expect(edgeSet(body, 'loop', { edge: holeRim, face: 'x1.end' })).toEqual([holeRim]);
		expect(edgeSet(body, 'loop', { face: 'x1.end' })).toEqual(top.edges);
		const holeEdges = edgeSet(body, 'feature', { feature: 'h1' });
		expect(holeEdges.length).toBeGreaterThanOrEqual(2);
		expect(holeEdges.every((id) => body.edges.find((x) => x.id === id)!.faces.some((f) => f.startsWith('h1.')))).toBe(true);
		/* The hole's rims are convex, like every outside edge of a plate. */
		expect(holeEdges.every((id) => edgeShape(body, body.edges.find((x) => x.id === id)!) === 'convex')).toBe(true);
		expect(edgeSet(body, 'chain', {})).toEqual([]); expect(edgeSet(body, 'feature', { feature: 'nothing' })).toEqual([]);
	});
});
