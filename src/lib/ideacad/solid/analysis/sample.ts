/**
 * A REPRESENTATIVE MODEL FOR THE ANALYSIS HARNESS AND ITS TESTS: a small
 * combat robot with a steel weapon disk on a motor, an aluminum chassis, two
 * wheels and a skid, written as six primitives. Development only: the dev
 * route `/dev/ideacad-analysis` and the tests import it, and no production
 * surface does.
 *
 * ONE DESCRIPTION, TWO BUILDERS. `SAMPLE_PRIMITIVES` is built here into
 * projections a fake workspace hands the panel (volume, center of mass and
 * the unit-density inertia tensor from the closed forms for a box and a tube,
 * a display mesh of corner and rim points), and the kernel test builds the
 * SAME list with `makeBox` and `makeCylinder` and checks both halves against
 * the kernel: the closed forms against `massProperties`, and
 * `SAMPLE_INTERFERENCE` (the report the harness shows) against what
 * `checkInterference` really answers for that geometry. So the harness never
 * shows a number the kernel would not.
 */
import type { BodyProjection, FaceProjection, ModelProjection, Vec3 } from '../types';
import type { InterferenceReport } from './interference';

export type SampleAxis = 'x' | 'y' | 'z';
export type SamplePrimitive =
	| { id: string; name: string; kind: 'box'; min: Vec3; max: Vec3 }
	/** A cylinder along `axis`, centered at `center`, hollow when `inner` > 0. */
	| { id: string; name: string; kind: 'tube'; center: Vec3; axis: SampleAxis; outer: number; inner: number; length: number };

export const SAMPLE_PRIMITIVES: readonly SamplePrimitive[] = [
	{ id: 'chassis#0', name: 'Chassis', kind: 'box', min: [-3, -2.5, 0.35], max: [3, 2.5, 0.6] },
	{ id: 'disk#0', name: 'Weapon disk', kind: 'tube', center: [3.5, 0, 0.85], axis: 'z', outer: 2, inner: 0.25, length: 0.25 },
	{ id: 'wheel-l#0', name: 'Left wheel', kind: 'tube', center: [-1, 2.85, 0.75], axis: 'y', outer: 0.75, inner: 0, length: 0.5 },
	{ id: 'wheel-r#0', name: 'Right wheel', kind: 'tube', center: [-1, -2.85, 0.75], axis: 'y', outer: 0.75, inner: 0, length: 0.5 },
	{ id: 'motor#0', name: 'Weapon motor', kind: 'tube', center: [3.5, 0, 0.575], axis: 'z', outer: 0.5, inner: 0, length: 0.45 },
	{ id: 'skid#0', name: 'Front skid', kind: 'box', min: [2.5, -1, 0], max: [3, 1, 0.35] }
];

/** Which material each body gets in each harness state. `cited` gives every body a cited density; `printed` is the everyday robot, where the CG is unknown. */
export type SampleState = 'cited' | 'printed';
const MATERIALS: Record<SampleState, Record<string, { materialId: string | null; massG?: number }>> = {
	cited: { 'chassis#0': { materialId: 'aluminum-6061-t6' }, 'disk#0': { materialId: 'steel-1018' }, 'wheel-l#0': { materialId: 'polycarbonate-et2613' }, 'wheel-r#0': { materialId: 'polycarbonate-et2613' }, 'motor#0': { materialId: 'steel-1018' }, 'skid#0': { materialId: 'polycarbonate-et2613' } },
	printed: { 'chassis#0': { materialId: 'aluminum-6061-t6' }, 'disk#0': { materialId: 'steel-1018' }, 'wheel-l#0': { materialId: 'printed-tpu', massG: 18 }, 'wheel-r#0': { materialId: 'printed-tpu', massG: 18 }, 'motor#0': { materialId: null }, 'skid#0': { materialId: 'polycarbonate-et2613' } }
};

export const AXIS_VECTOR: Record<SampleAxis, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
/** Two unit vectors square to the axis, for drawing rims. */
const RIM: Record<SampleAxis, [Vec3, Vec3]> = { x: [[0, 1, 0], [0, 0, 1]], y: [[1, 0, 0], [0, 0, 1]], z: [[1, 0, 0], [0, 1, 0]] };
const SEGMENTS = 72;
const at = (c: Vec3, u: Vec3, v: Vec3, a: Vec3, r: number, t: number, s: number): Vec3 => [c[0] + r * (Math.cos(t) * u[0] + Math.sin(t) * v[0]) + s * a[0], c[1] + r * (Math.cos(t) * u[1] + Math.sin(t) * v[1]) + s * a[1], c[2] + r * (Math.cos(t) * u[2] + Math.sin(t) * v[2]) + s * a[2]];
const empty = () => ({ positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() });

/** Volume, center and the unit-density inertia tensor `[Ixx, Iyy, Izz, Pxy, Pxz, Pyz]` about the center, from the closed forms. */
export function primitiveMass(p: SamplePrimitive): { volume: number; centerOfMass: Vec3; inertia: number[] } {
	if (p.kind === 'box') {
		const [a, b, c] = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]], v = a * b * c;
		return { volume: v, centerOfMass: [(p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2], inertia: [(v * (b * b + c * c)) / 12, (v * (a * a + c * c)) / 12, (v * (a * a + b * b)) / 12, 0, 0, 0] };
	}
	const rr = p.outer * p.outer + p.inner * p.inner, v = Math.PI * (p.outer * p.outer - p.inner * p.inner) * p.length;
	const axial = (v * rr) / 2, transverse = (v * (3 * rr + p.length * p.length)) / 12;
	const diag: Vec3 = p.axis === 'x' ? [axial, transverse, transverse] : p.axis === 'y' ? [transverse, axial, transverse] : [transverse, transverse, axial];
	return { volume: v, centerOfMass: [...p.center] as Vec3, inertia: [...diag, 0, 0, 0] };
}

/** One primitive as a projection, with a material and, optionally, a measured mass. */
export function primitiveBody(p: SamplePrimitive, material: { materialId: string | null; massG?: number }): BodyProjection {
	const mass = primitiveMass(p), base = p.id.split('#')[0];
	let positions: number[] = [], faces: FaceProjection[] = [], bounds: number[];
	if (p.kind === 'box') {
		for (const x of [p.min[0], p.max[0]]) for (const y of [p.min[1], p.max[1]]) for (const z of [p.min[2], p.max[2]]) positions.push(x, y, z);
		bounds = [...p.min, ...p.max];
	} else {
		const a = AXIS_VECTOR[p.axis], [u, v] = RIM[p.axis], h = p.length / 2;
		for (const s of [-h, h]) for (const r of p.inner > 0 ? [p.outer, p.inner] : [p.outer]) for (let i = 0; i < SEGMENTS; i++) positions.push(...at(p.center, u, v, a, r, (i / SEGMENTS) * Math.PI * 2, s));
		const origin = at(p.center, u, v, a, 0, 0, -h), round = (id: string, radius: number): FaceProjection => ({ id: `${base}.${id}`, kind: 'cylinder', center: at(p.center, u, v, a, radius, 0, 0), normal: [0, 0, 0], area: 2 * Math.PI * radius * p.length, surface: { type: 'cylinder', origin, axis: a, radius }, edges: [], ...empty() });
		faces = [round('outer', p.outer), ...(p.inner > 0 ? [round('bore', p.inner)] : [])];
		const lo: number[] = [], hi: number[] = [];
		for (let d = 0; d < 3; d++) { const extent = a[d] ? h : p.outer; lo.push(p.center[d] - extent); hi.push(p.center[d] + extent); }
		bounds = [...lo, ...hi];
	}
	const n = positions.length / 3, indices: number[] = [];
	for (let i = 2; i < n; i++) indices.push(0, i - 1, i);
	return { id: p.id, name: p.name, materialId: material.materialId, role: 'part', ...(material.massG !== undefined ? { massG: material.massG, massSource: 'measured' as const } : {}), createdBy: base, faces, edges: [], vertices: [], mesh: { positions: new Float32Array(positions), normals: new Float32Array(positions.length), indices: new Uint32Array(indices) }, bounds, ...mass };
}

export function sampleModel(state: SampleState = 'cited', addons: Record<string, boolean> = {}): ModelProjection {
	return { bodies: SAMPLE_PRIMITIVES.map((p) => primitiveBody(p, MATERIALS[state][p.id])), sketches: [], references: [{ feature: 'axis1', name: 'Weapon axis', kind: 'axis', origin: [3.5, 0, 0], direction: [0, 0, 1], size: 4 }], features: [], mates: [], addons: { ideaBlade: false, ...addons }, operationMs: 0, canUndo: false, canRedo: false };
}

/**
 * The interference report for `SAMPLE_PRIMITIVES`, as `checkInterference`
 * answers it on the vendored kernel. `tests/ideacad-solid-analysis-kernel.test.ts`
 * rebuilds the geometry and asserts every pair's kind, volume, distance and
 * quality against this list, so the harness shows the kernel's answer.
 */
export const SAMPLE_INTERFERENCE: InterferenceReport = {
	bodies: 6, pairsChecked: 15, broadPhase: 11, searched: 11, ms: 0,
	pairs: [
		{ a: 'chassis#0', b: 'disk#0', kind: 'clear', distance: 0.125, points: [[2.7346, 1.8478, 0.6], [2.7346, 1.8478, 0.725]], quality: 'exact' },
		{ a: 'chassis#0', b: 'wheel-l#0', kind: 'clear', distance: 0.1, points: [[-0.3071, 2.5, 0.463], [-0.3071, 2.6, 0.463]], quality: 'exact' },
		{ a: 'chassis#0', b: 'wheel-r#0', kind: 'clear', distance: 0.1, points: [[-0.3071, -2.5, 0.463], [-0.3071, -2.6, 0.463]], quality: 'exact' },
		{ a: 'chassis#0', b: 'motor#0', kind: 'touching', distance: 0, points: [[3, 0, 0.35], [3, 0, 0.35]], quality: 'exact' },
		{ a: 'chassis#0', b: 'skid#0', kind: 'touching', distance: 0, points: [[2.5, -1, 0.35], [2.5, -1, 0.35]], quality: 'exact' },
		{ a: 'disk#0', b: 'wheel-l#0', kind: 'clear', distance: 2.563168, points: [[1.8564, 1.1396, 0.75], [-0.25, 2.6, 0.75]], quality: 'approximate' },
		{ a: 'disk#0', b: 'wheel-r#0', kind: 'clear', distance: 2.563168, points: [[1.8564, -1.1396, 0.75], [-0.25, -2.6, 0.75]], quality: 'approximate' },
		{ a: 'disk#0', b: 'motor#0', kind: 'interference', volume: 0.044179, point: [3.5, 0, 0.7625], quality: 'exact' },
		{ a: 'disk#0', b: 'skid#0', kind: 'clear', distance: 0.375, points: [[2.5, -1, 0.725], [2.5, -1, 0.35]], quality: 'exact' },
		{ a: 'wheel-l#0', b: 'wheel-r#0', kind: 'clear', distance: 5.2, points: [[-0.25, 2.6, 0.75], [-0.25, -2.6, 0.75]], quality: 'exact' },
		{ a: 'wheel-l#0', b: 'motor#0', kind: 'clear', distance: 4.063168, points: [[-0.25, 2.6, 0.75], [3.0891, 0.2849, 0.75]], quality: 'approximate' },
		{ a: 'wheel-l#0', b: 'skid#0', kind: 'clear', distance: 3.201301, points: [[-0.2549, 2.6, 0.6648], [2.5, 1, 0.35]], quality: 'approximate' },
		{ a: 'wheel-r#0', b: 'motor#0', kind: 'clear', distance: 4.063168, points: [[-0.25, -2.6, 0.75], [3.0891, -0.2849, 0.75]], quality: 'approximate' },
		{ a: 'wheel-r#0', b: 'skid#0', kind: 'clear', distance: 3.201301, points: [[-0.2549, -2.6, 0.6648], [2.5, -1, 0.35]], quality: 'approximate' },
		{ a: 'motor#0', b: 'skid#0', kind: 'touching', distance: 0, points: [[3, 0, 0.35], [3, 0, 0.35]], quality: 'exact' }
	]
};
