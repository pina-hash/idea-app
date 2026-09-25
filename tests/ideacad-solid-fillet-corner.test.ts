// tests/ideacad-solid-fillet-corner.test.ts
//
// REPORT R06, "fillet corners on sharp edges/angles are open and broken",
// MEASURED ON THE REAL VENDORED KERNEL through the REAL engine, before anything
// was changed. Two suspects were named and both are measured here:
//
//   1. THE DISPLAY MESH. The viewport draws one mesh per face from the kernel's
//      per-face tessellation, where the watertight whole-body tessellation
//      would share every seam vertex. The per-face meshes lose NO area (each
//      face agrees with the watertight mesh of the same face, and the top face
//      the report's wedge crosses is exact), and their seams do open, but only
//      around a ball corner, and never wider than about 4.2e-4 of the round's
//      radius (measured at r 0.05, 0.1 and 0.25 on parts of 1, 4 and 10 in: the
//      angle tolerance bounds it, not the model-sized chord). Zoomed until the
//      round fills 1000 px, that is under half a pixel. It is not the wedge in
//      the report, so the display path was NOT changed: the watertight mesh at
//      the display chord took 1.2 to 3.5 times as long to build, and it shares
//      seam vertices between faces, so every sharp edge would need its normals
//      rebuilt before it could be drawn one mesh per face.
//
//   2. THE ROUND ITSELF, AND THIS IS THE CAUSE. Where a round ends at a convex
//      corner whose third edge is left sharp, the kernel builds the ball corner
//      that is right only when all three edges are rounded, and closes the hole
//      that leaves with a FLAT face square to the sharp edge. The corner is a
//      visible notch, and the body is r³(2/3 - π/6) short of the true round
//      at each such corner. Every volume below is ANALYTIC, never read off the
//      kernel and typed back: the true round of two perpendicular edges meeting
//      at a corner is the two cylinders' intersection, 2r³/3 of the corner cube,
//      and the kernel's is a ball octant, πr³/6 of it.
//
// THE FIX IS NOT IN THIS REPOSITORY'S HANDS WITHOUT A DECISION. The kernel is a
// frozen upstream snapshot, and the one construction this kernel does get right
// (the intersection of one-edge rounds, measured at the bottom) changes the
// geometry and the face names of every stored document that holds such a
// corner, at about a hundred times the cost of the round. So the fillet row
// WARNS in words and names the way to a clean corner, and this file pins the
// defect so a kernel that fixes it reddens here: flip the volume assertions to
// the mitre figure and delete the warning in `features/blends.ts` together.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine, DISPLAY_TESSELLATION, displayChord } from '../src/lib/ideacad/solid/engine';
import type { EdgeRef, Feature, FeatureOf, ModelProjection } from '../src/lib/ideacad/solid/types';
import { refFromSelection } from '../src/lib/ideacad/solid/naming';

const WASM = new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm'));
const engines: SolidEngine[] = [];
async function engine() { const e = await SolidEngine.create(WASM); engines.push(e); return e; }
afterEach(() => { for (const e of engines) e.destroy(); engines.length = 0; });

function rectangle(id: string, w: number, h: number): FeatureOf<'sketch'> {
	return { id, name: `Sketch ${id}`, type: 'sketch', plane: { kind: 'datum', datum: 'XY' }, entities: [
		{ id: 'p0', type: 'point', x: 0, y: 0 }, { id: 'p1', type: 'point', x: w, y: 0 }, { id: 'p2', type: 'point', x: w, y: h }, { id: 'p3', type: 'point', x: 0, y: h },
		{ id: 'l0', type: 'line', a: 'p0', b: 'p1' }, { id: 'l1', type: 'line', a: 'p1', b: 'p2' }, { id: 'l2', type: 'line', a: 'p2', b: 'p3' }, { id: 'l3', type: 'line', a: 'p3', b: 'p0' }
	], constraints: [] };
}
const add = (e: SolidEngine, feature: Feature) => e.apply({ type: 'add-feature', feature });
/** A 4 x 3 x 1 box: x1.start z=0, x1.end z=1, x1.side.0 y=0, .1 x=4, .2 y=3, .3 x=0. */
async function box(e: SolidEngine) { await add(e, rectangle('s1', 4, 3)); return add(e, { id: 'x1', name: 'Extrude 1', type: 'extrude', sketch: 's1', distance: 1, operation: 'new' }); }
const edge = (m: ModelProjection, pair: string) => { const [a, b] = pair.split('|'); return refFromSelection({ bodyId: 'x1#0', kind: 'edge', id: m.bodies[0].edges.find((ed) => ed.faces.includes(a) && ed.faces.includes(b))!.id }, m.bodies[0]) as EdgeRef; };
async function rounded(pairs: string[], radius: number) {
	const e = await engine(), m0 = await box(e);
	const m = await add(e, { id: 'f1', name: 'Fillet 1', type: 'fillet', edges: pairs.map((p) => edge(m0, p)), radius });
	return { e, m, row: m.features.find((f) => f.id === 'f1')! };
}
/** The kernel and the body's solid handle behind a projection: the engine keeps both private, and the control below needs them. */
const kernelOf = (e: SolidEngine, m: ModelProjection) => ({ k: (e as any).k, solid: (e as any).live.bodies.get(m.bodies[0].id).solid as number });

const quarterRound = (r: number, length: number) => r * r * (1 - Math.PI / 4) * length;
/** Removed from the corner cube r³: the true round of two perpendicular edges leaves the cylinders' intersection, 2r³/3; the kernel's ball leaves πr³/6. */
const TRUE_CORNER = (r: number) => r ** 3 / 3;
const BALL_CORNER = (r: number) => r ** 3 * (1 - Math.PI / 6);

const VERTICAL = 'x1.side.0|x1.side.1', TOP_RIGHT = 'x1.end|x1.side.1', TOP_FRONT = 'x1.end|x1.side.0';
const TOP_FOUR = ['x1.end|x1.side.0', 'x1.end|x1.side.1', 'x1.end|x1.side.2', 'x1.end|x1.side.3'];
const VERTICAL_FOUR = ['x1.side.0|x1.side.1', 'x1.side.1|x1.side.2', 'x1.side.2|x1.side.3', 'x1.side.0|x1.side.3'];
const BOX_PLANES = new Set(['0,0,-1|0', '0,0,1|1', '0,-1,0|0', '1,0,0|4', '0,1,0|3', '-1,0,0|0']);
/** Planar faces lying in none of the box's six planes: the kernel's steps, read off the projection's own normal and centre. */
const steps = (m: ModelProjection) => m.bodies[0].faces.filter((f) => {
	if (f.kind !== 'plane') return false;
	const axis = f.normal.findIndex((c) => Math.abs(Math.abs(c) - 1) < 1e-9);
	return axis < 0 || !BOX_PLANES.has(`${f.normal.map((c) => Math.round(c)).join(',')}|${Math.round(f.center[axis] * 1e6) / 1e6}`);
});

function triArea(p: ArrayLike<number>, idx: ArrayLike<number>, from = 0, to = idx.length) {
	let s = 0;
	for (let t = from; t < to; t += 3) {
		const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
		const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
		s += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
	}
	return s;
}
/**
 * The open seams of a set of triangle meshes drawn together: vertices welded on
 * a 1e-6 in grid (the kernel's own mesh report welds at 1 µm), an edge used by
 * one triangle is open, and the gap is how far an open edge's points sit from
 * the nearest open edge of ANOTHER mesh.
 */
function seams(meshes: { positions: ArrayLike<number>; indices: ArrayLike<number>; from?: number; to?: number }[]) {
	const ids = new Map<string, number>(), at: number[][] = [], uses = new Map<string, { n: number; owner: number }>();
	const vid = (p: ArrayLike<number>, i: number) => { const key = [0, 1, 2].map((c) => Math.round(p[i * 3 + c] / 1e-6)).join(','); let v = ids.get(key); if (v === undefined) { v = at.length; ids.set(key, v); at.push([p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]); } return v; };
	meshes.forEach((m, owner) => {
		for (let t = m.from ?? 0; t < (m.to ?? m.indices.length); t += 3) {
			const v = [vid(m.positions, m.indices[t]), vid(m.positions, m.indices[t + 1]), vid(m.positions, m.indices[t + 2])];
			if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
			for (let j = 0; j < 3; j++) { const a = v[j], b = v[(j + 1) % 3], key = a < b ? `${a}-${b}` : `${b}-${a}`, u = uses.get(key); if (u) u.n++; else uses.set(key, { n: 1, owner }); }
		}
	});
	const open = [...uses].filter(([, u]) => u.n === 1).map(([key, u]) => { const [a, b] = key.split('-').map(Number); return { owner: u.owner, a: at[a], b: at[b] }; });
	const toSegment = (p: number[], a: number[], b: number[]) => { const d = [0, 1, 2].map((c) => b[c] - a[c]), w = [0, 1, 2].map((c) => p[c] - a[c]), L = d[0] ** 2 + d[1] ** 2 + d[2] ** 2, t = L ? Math.max(0, Math.min(1, (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / L)) : 0; return Math.hypot(w[0] - t * d[0], w[1] - t * d[1], w[2] - t * d[2]); };
	let gap = 0;
	for (const s of open) for (const p of [s.a, s.b, [0, 1, 2].map((c) => (s.a[c] + s.b[c]) / 2)]) { let best = Infinity; for (const o of open) if (o.owner !== s.owner) best = Math.min(best, toSegment(p, o.a, o.b)); if (Number.isFinite(best)) gap = Math.max(gap, best); }
	return { open: open.length, owners: new Set(open.map((s) => s.owner)), gap };
}

describe('R06: the display mesh is not what opens the corner', () => {
	it('two rounds meeting at a corner: every face\'s drawn mesh holds the area of the watertight mesh of the same face, the top face is exact, and the only seams are around the ball, a tenth of a pixel wide', async () => {
		const r = 0.25, { e, m } = await rounded([VERTICAL, TOP_RIGHT], r), body = m.bodies[0], { k, solid } = kernelOf(e, m);
		const size = Math.max(...[0, 1, 2].map((i) => body.bounds[i + 3] - body.bounds[i])), chord = displayChord(size);
		const g = k.tessellateSolidGroupedBinary(solid, chord, DISPLAY_TESSELLATION.angle);
		const gp = new Float32Array(g.positions), gi = new Uint32Array(g.indices), go = new Uint32Array(g.faceOffsets); g.free();
		const handles: number[] = [...k.getSolidFaces(solid)];
		expect(go.length - 1).toBe(body.faces.length);
		let compared = 0;
		for (const face of body.faces) {
			const i = handles.findIndex((h) => k.getFaceName(h) === face.id);
			expect(i).toBeGreaterThanOrEqual(0);
			/* Measured: at most 1.4e-5 in² apart (the ball, sampled differently). A wedge a few pixels wide and a tenth of an inch long is 1e-4 or more. */
			expect(Math.abs(triArea(face.positions, face.indices) - triArea(gp, gi, go[i], go[i + 1]))).toBeLessThan(5e-5);
			compared++;
		}
		expect(compared).toBe(10);
		/* The face the reported wedge runs across, against its analytic area: a 3.75 x 3 rectangle, every edge straight. */
		const top = body.faces.find((f) => f.id === 'x1.end')!;
		expect(triArea(top.positions, top.indices)).toBeCloseTo(3.75 * 3, 6);

		const drawn = seams(body.faces), watertight = seams([...Array(go.length - 1).keys()].map((i) => ({ positions: gp, indices: gi, from: go[i], to: go[i + 1] })));
		/* Both directions: the per-face meshes DO open (so the counter can see a seam), and the kernel's watertight mesh of the same body does not. */
		expect(drawn.open).toBeGreaterThan(0);
		expect(watertight.open).toBe(0);
		expect(JSON.parse(k.meshQuality(solid, chord, DISPLAY_TESSELLATION.angle))).toMatchObject({ boundaryEdges: 0, isWatertight: true });
		/* Every face with an open seam is the ball or one of its neighbours. */
		const ball = body.faces.find((f) => f.kind === 'sphere')!;
		expect(ball).toBeDefined();
		for (const owner of drawn.owners) { const f = body.faces[owner]; expect(f === ball || f.edges.some((id) => ball.edges.includes(id))).toBe(true); }
		/* Measured 1.058e-4 in here, 4.2e-4 of the radius; the same fraction at r 0.05 on a 10 in part and r 0.1 on a 1 in part. Under a pixel with the round filling 1000 px. */
		expect(drawn.gap).toBeGreaterThan(0);
		expect(drawn.gap).toBeLessThan(1e-3 * r);
	});
	it('one round alone: the drawn meshes close with no seam at all', async () => {
		const { m, row } = await rounded([VERTICAL], 0.5);
		expect(row.status).toBe('ok');
		expect(seams(m.bodies[0].faces).open).toBe(0);
	});
});

describe('R06: the kernel rounds a corner with a sharp third edge as a ball and a flat step', () => {
	it('a vertical edge and a top edge meeting at a corner: one flat face square to the sharp edge, r²(1 - π/4) in area, and a body r³(2/3 - π/6) short of the true round; the row says so', async () => {
		const r = 0.25, { m, row } = await rounded([VERTICAL, TOP_RIGHT], r);
		const straight = quarterRound(r, 0.75) + quarterRound(r, 2.75);
		expect(m.bodies[0].volume).toBeCloseTo(12 - straight - BALL_CORNER(r), 4);
		/* The true round is 0.00224 in³ away, so a kernel that fixed it would not pass the line above. */
		expect(Math.abs(m.bodies[0].volume - (12 - straight - TRUE_CORNER(r)))).toBeGreaterThan(0.002);
		const flat = steps(m);
		expect(flat).toHaveLength(1);
		/* The step sits at x = 4 - r, facing +x, along the sharp top-front edge: the kernel names it as a blend of x1.end and x1.side.0, which nothing rounded. */
		expect(flat[0].normal.map((c) => Math.round(c))).toEqual([1, 0, 0]);
		expect(flat[0].center[0]).toBeCloseTo(4 - r, 9);
		expect(flat[0].area).toBeCloseTo(r * r * (1 - Math.PI / 4), 4);
		expect(m.bodies[0].faces.filter((f) => f.kind === 'sphere')).toHaveLength(1);
		expect(row.status).toBe('warning');
		expect(row.message).toBe('At 1 corner this round meets an edge left sharp, and IdeaCAD cannot blend the two yet, so it leaves a small flat step there. Add that sharp edge to this round for a smooth corner.');
	});
	it('the four edges of a top face, the commonest round there is: a step at every corner, four times the shortfall, and the row counts them', async () => {
		const r = 0.2, { m, row } = await rounded(TOP_FOUR, r);
		const straight = quarterRound(r, 2 * (4 - 2 * r) + 2 * (3 - 2 * r));
		expect(m.bodies[0].volume).toBeCloseTo(12 - straight - 4 * BALL_CORNER(r), 4);
		expect(Math.abs(m.bodies[0].volume - (12 - straight - 4 * TRUE_CORNER(r)))).toBeGreaterThan(0.004);
		expect(steps(m)).toHaveLength(4);
		for (const s of steps(m)) { expect(s.normal.map((c) => Math.round(c))).toEqual([0, 0, 1]); expect(s.center[2]).toBeCloseTo(1 - r, 9); }
		expect(row.status).toBe('warning');
		expect(row.message).toBe('At 4 corners this round meets edges left sharp, and IdeaCAD cannot blend them yet, so it leaves a small flat step at each. Add those sharp edges to this round for smooth corners.');
	});
	it('the advice works, and nothing that is not a step warns: all three edges at a corner make a true ball, the top face with its four corners makes four, one edge, four parallel edges and a bevel make none', async () => {
		const r = 0.25, three = await rounded([VERTICAL, TOP_RIGHT, TOP_FRONT], r);
		expect(three.row.status).toBe('ok');
		expect(steps(three.m)).toHaveLength(0);
		/* A true ball corner: the three straight runs plus the octant, 12 - r²(1 - π/4)(0.75 + 2.75 + 3.75) - r³(1 - π/6). */
		expect(three.m.bodies[0].volume).toBeCloseTo(12 - quarterRound(r, 7.25) - BALL_CORNER(r), 4);
		const eight = await rounded([...TOP_FOUR, ...VERTICAL_FOUR], 0.2);
		expect(eight.row.status).toBe('ok');
		expect(steps(eight.m)).toHaveLength(0);
		expect(eight.m.bodies[0].faces.filter((f) => f.kind === 'sphere')).toHaveLength(4);
		for (const pairs of [[VERTICAL], VERTICAL_FOUR, [TOP_RIGHT]]) { const { m, row } = await rounded(pairs, 0.25); expect(row.status).toBe('ok'); expect(steps(m)).toHaveLength(0); }
		const e = await engine(), m0 = await box(e);
		const bevel = await add(e, { id: 'c1', name: 'Chamfer 1', type: 'chamfer', edges: [edge(m0, VERTICAL), edge(m0, TOP_RIGHT)], distance: 0.25 });
		expect(bevel.features.find((f) => f.id === 'c1')!.status).toBe('ok');
	});
	it('the true round is buildable in this kernel, so the defect is in its corner blend: the intersection of the two one-edge rounds is the mitre to 1e-5, with no ball and no step', async () => {
		const r = 0.25, e2 = await engine(), m0 = await box(e2), { k: k2, solid: base } = kernelOf(e2, m0);
		const handleOf = (pair: string) => { const [a, b] = pair.split('|'); return (e2 as any).bodyCache((e2 as any).live.bodies.get('x1#0')).handles.edges.get(m0.bodies[0].edges.find((ed) => ed.faces.includes(a) && ed.faces.includes(b))!.id) as number; };
		const mitre = k2.intersect(k2.fillet(base, new Uint32Array([handleOf(VERTICAL)]), r), k2.fillet(base, new Uint32Array([handleOf(TOP_RIGHT)]), r));
		expect(k2.validateSolid(mitre)).toBe(0);
		expect(JSON.parse(k2.massProperties(mitre)).volume).toBeCloseTo(12 - quarterRound(r, 0.75) - quarterRound(r, 2.75) - TRUE_CORNER(r), 5);
		const kinds: string[] = [...k2.getSolidFaces(mitre)].map((f: number) => k2.getSurfaceType(f));
		expect(kinds.filter((x) => x === 'sphere')).toHaveLength(0);
		expect(kinds.filter((x) => x === 'cylinder')).toHaveLength(2);
		expect(kinds.filter((x) => x === 'plane')).toHaveLength(6);
	});
});
