// tests/ideacad-solid-mates-preview.test.ts
//
// THE MAGNETIC AUTO-MATE PREVIEW, over two hand-written boxes. Every
// expected snap is the analytic gap between the boxes' faces; the negative
// controls (a gap past the tolerance, faces pointing the same way, faces that
// do not overlap, a Ctrl-suppressed call the workspace simply does not make)
// answer the unchanged delta with no candidate and no guides.
import { describe, expect, it } from 'vitest';
import { matePreview, MATE_SNAP_TOLERANCE } from '../src/lib/ideacad/solid/viewport/mate-preview';
import type { BodyProjection, FaceProjection, ModelProjection, Vec3 } from '../src/lib/ideacad/solid/types';

/** A box body with six planar faces, each carrying its mesh corners and four edges. */
function boxBody(id: string, name: string, min: Vec3, max: Vec3): BodyProjection {
	const faces: FaceProjection[] = [], edges: BodyProjection['edges'] = [];
	const corner = (x: 0 | 1, y: 0 | 1, z: 0 | 1): Vec3 => [x ? max[0] : min[0], y ? max[1] : min[1], z ? max[2] : min[2]];
	const sides: { id: string; normal: Vec3; corners: Vec3[] }[] = [
		{ id: `${id}.top`, normal: [0, 0, 1], corners: [corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1)] },
		{ id: `${id}.bottom`, normal: [0, 0, -1], corners: [corner(0, 0, 0), corner(1, 0, 0), corner(1, 1, 0), corner(0, 1, 0)] },
		{ id: `${id}.east`, normal: [1, 0, 0], corners: [corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, 0, 1)] },
		{ id: `${id}.west`, normal: [-1, 0, 0], corners: [corner(0, 0, 0), corner(0, 1, 0), corner(0, 1, 1), corner(0, 0, 1)] },
		{ id: `${id}.north`, normal: [0, 1, 0], corners: [corner(0, 1, 0), corner(1, 1, 0), corner(1, 1, 1), corner(0, 1, 1)] },
		{ id: `${id}.south`, normal: [0, -1, 0], corners: [corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1)] }
	];
	for (const s of sides) {
		const edgeIds: string[] = [];
		s.corners.forEach((c, i) => { const d = s.corners[(i + 1) % 4], eid = `${s.id}#${i}`; edgeIds.push(eid); edges.push({ id: eid, curve: 'LINE', points: new Float32Array([...c, ...d]), faces: [s.id], length: Math.hypot(...c.map((v, k) => v - d[k])), mid: [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2, (c[2] + d[2]) / 2] }); });
		const center: Vec3 = [0, 1, 2].map((k) => s.corners.reduce((sum, c) => sum + c[k], 0) / 4) as Vec3;
		faces.push({ id: s.id, kind: 'plane', center, normal: s.normal, area: 1, surface: { type: 'plane', normal: s.normal, d: 0 }, edges: edgeIds, positions: new Float32Array(s.corners.flat()), normals: new Float32Array(), indices: new Uint32Array() });
	}
	return { id, name, materialId: null, role: 'part', createdBy: id, volume: 1, bounds: [...min, ...max], centerOfMass: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], inertia: [], mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }, faces, edges, vertices: [] };
}
function cylinderBody(id: string, origin: Vec3, radius: number, height: number): BodyProjection {
	const positions: number[] = [];
	for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; positions.push(origin[0] + radius * Math.cos(a), origin[1] + radius * Math.sin(a), origin[2], origin[0] + radius * Math.cos(a), origin[1] + radius * Math.sin(a), origin[2] + height); }
	const side: FaceProjection = { id: `${id}.side`, kind: 'cylinder', center: [origin[0], origin[1] + radius, origin[2] + height / 2], normal: [0, 0, 0], area: 1, surface: { type: 'cylinder', axis: [0, 0, 1], origin, radius }, edges: [], positions: new Float32Array(positions), normals: new Float32Array(), indices: new Uint32Array() };
	return { id, name: id, materialId: null, role: 'part', createdBy: id, volume: 1, bounds: [origin[0] - radius, origin[1] - radius, origin[2], origin[0] + radius, origin[1] + radius, origin[2] + height], centerOfMass: [origin[0], origin[1], origin[2] + height / 2], inertia: [], mesh: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() }, faces: [side], edges: [], vertices: [] };
}
const model = (...bodies: BodyProjection[]): ModelProjection => ({ bodies, sketches: [], references: [], features: [], mates: [], addons: { ideaBlade: false }, canUndo: false, canRedo: false, operationMs: 0 });
/* Base 4 x 3 x 1 at the origin; bracket 2 x 2 x 1 sitting at x = 6..8 on the same floor. */
const base = boxBody('A', 'Base', [0, 0, 0], [4, 3, 1]), bracket = boxBody('B', 'Bracket', [6, 0, 0], [8, 2, 1]);

describe('the magnetic auto-mate preview', () => {
	it('snaps a bottom face that has come within tolerance of the base top onto it, naming the stationary face first', () => {
		/* Dragging the bracket up by 1.08 puts its bottom 0.08 above the base top and over it in x. */
		const p = matePreview(model(base, bracket), 'B', [-3, 0, 1.08]);
		expect(p.candidate).toEqual({ kind: 'coincident', a: { bodyId: 'A', kind: 'face', id: 'A.top' }, b: { bodyId: 'B', kind: 'face', id: 'B.bottom' } });
		expect(p.delta[0]).toBe(-3); expect(p.delta[1]).toBe(0); expect(p.delta[2]).toBeCloseTo(1, 12);
		/* Guides: the target face's four edges and the moving face's four, where it will land. */
		expect(p.guides).toHaveLength(8);
		expect(p.guides.slice(4).every((line) => line.every((point) => Math.abs(point[2] - 1) < 1e-9))).toBe(true);
	});
	it('snaps from below as well (the bracket coming up from underneath the base top plane is still coincident)', () => {
		const p = matePreview(model(base, bracket), 'B', [-3, 0, 0.9]);
		expect(p.candidate?.kind).toBe('coincident'); expect(p.delta[2]).toBeCloseTo(1, 12);
	});
	it('does nothing past the tolerance, for faces pointing the same way, or for faces that do not overlap', () => {
		const far = matePreview(model(base, bracket), 'B', [-3, 0, 1.3]);
		expect(far).toEqual({ delta: [-3, 0, 1.3], candidate: null, guides: [] });
		/* At x = 6..8 the bracket's west face (x = 6) faces the base's east face (x = 4) but is 2 in away; nothing else faces anything within reach. */
		const apart = matePreview(model(base, bracket), 'B', [0, 0, 0]);
		expect(apart.candidate).toBeNull(); expect(apart.delta).toEqual([0, 0, 0]);
		/* Lifted to the right height but slid past the base in y: the faces do not overlap. */
		const beside = matePreview(model(base, bracket), 'B', [-3, 4, 1.05]);
		expect(beside.candidate).toBeNull();
		/* Tolerance is the caller's; at 0 nothing snaps. */
		expect(matePreview(model(base, bracket), 'B', [-3, 0, 1.08], 0).candidate).toBeNull();
		expect(MATE_SNAP_TOLERANCE).toBe(0.15);
	});
	it('chooses the closest of two reachable snaps', () => {
		/* The bracket's west face is 0.1 from the base's east face and its bottom is 0.05 above the base's top: the bottom wins. */
		const p = matePreview(model(base, bracket), 'B', [-1.9, 0, 1.05]);
		expect(p.candidate?.b.id).toBe('B.bottom'); expect(p.delta[2]).toBeCloseTo(1, 12); expect(p.delta[0]).toBe(-1.9);
		const q = matePreview(model(base, bracket), 'B', [-1.95, 0, 1.1]);
		expect(q.candidate?.b.id).toBe('B.west'); expect(q.delta[0]).toBeCloseTo(-2, 12); expect(q.delta[2]).toBe(1.1);
	});
	it('snaps a pin onto a hole axis: a concentric candidate with the axis drawn as a guide', () => {
		const hole = cylinderBody('H', [1, 1, 0], 0.25, 1), pin = cylinderBody('P', [5, 1.1, 0], 0.2, 2);
		const p = matePreview(model(hole, pin), 'P', [-4, 0, 0]);
		expect(p.candidate).toEqual({ kind: 'concentric', a: { bodyId: 'H', kind: 'face', id: 'H.side' }, b: { bodyId: 'P', kind: 'face', id: 'P.side' } });
		expect(p.delta[0]).toBeCloseTo(-4, 12); expect(p.delta[1]).toBeCloseTo(-0.1, 12); expect(p.delta[2]).toBe(0);
		expect(p.guides.at(-1)!.every((point) => Math.abs(point[0] - 1) < 1e-9 && Math.abs(point[1] - 1) < 1e-9)).toBe(true);
		/* Slid off the end of the hole along the axis: no overlap, no snap. */
		expect(matePreview(model(hole, pin), 'P', [-4, 0, 5]).candidate).toBeNull();
	});
	it('an unknown body answers the delta unchanged', () => {
		expect(matePreview(model(base), 'nobody', [1, 2, 3])).toEqual({ delta: [1, 2, 3], candidate: null, guides: [] });
	});
});
