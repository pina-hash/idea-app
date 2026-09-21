// tests/ideacad-solid-triad-drag-math.test.ts
//
// WHAT A HANDLE DRAG IS WORTH, against a projection the test owns: 50px per
// inch, the screen origin at (100, 100), y up on the model is y down on the
// screen, and the camera looks down -Z (so +Z faces it). Every expected
// value is arithmetic on that projection, never a number read back off
// `dragValue`.
//
// WHY THIS IS AUTOMATED. A ring whose sign is wrong turns the body the other
// way from the hand and looks like a working control; a snap that takes
// outside its radius jumps a body a student did not ask to jump; fine
// control that also divided a face push would change every other tool's
// drags without anything on screen saying so. Each of those is asserted in
// both directions.
import { afterEach, describe, expect, it } from 'vitest';
import { ANGLE_STEP, FINE_DIVISOR, SNAP_RADIUS_PX, bodyAnchors, constrainedDelta, dragValue, resetSnapSettings, snapSettings, snapTargetsFrom, type DragInput, type DragPlane, type SnapTarget } from '../src/lib/ideacad/solid/viewport/drag-math';
import type { TriadHandle } from '../src/lib/ideacad/solid/viewport/triad';
import type { BodyProjection, ModelProjection, Vec3 } from '../src/lib/ideacad/solid/types';

const PX = 50, O = { x: 100, y: 100 };
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const toScreen = (p: Vec3) => ({ x: O.x + PX * p[0], y: O.y - PX * p[1] });
const fromScreen = (c: { x: number; y: number }, z: number): Vec3 => [(c.x - O.x) / PX, (O.y - c.y) / PX, z];
const viewPlanePoint = (c: { x: number; y: number }, through: Vec3): Vec3 => fromScreen(c, through[2]);
/** A ray straight down -Z from the client point, met with the plane; null when the plane is edge-on. */
const planePoint = (c: { x: number; y: number }, plane: DragPlane): Vec3 | null => {
	const p0 = fromScreen(c, 10), dir: Vec3 = [0, 0, -1], dn = dot(dir, plane.normal);
	if (Math.abs(dn) < 1e-9) return null;
	const t = dot([plane.origin[0] - p0[0], plane.origin[1] - p0[1], plane.origin[2] - p0[2]], plane.normal) / dn;
	return [p0[0] + dir[0] * t, p0[1] + dir[1] * t, p0[2] + dir[2] * t];
};
const at = (dx: number, dy: number) => ({ x: O.x + dx, y: O.y + dy });
const handle = (mode: TriadHandle['mode'], axis: Vec3, label: string = mode, center: Vec3 = [0, 0, 0]): TriadHandle => ({ mode, axis, label, center });
const input = (over: Partial<DragInput> = {}): DragInput => ({ start: [0, 0, 0], axis: [1, 0, 0], origin: O, pointer: O, offset: { x: 0, y: 0 }, canvas: { width: 800, height: 600 }, zoom: 1, toScreen, viewPlanePoint, planePoint, viewDirection: [0, 0, -1], ...over });
const close = (a: Vec3, b: Vec3) => { for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 9); };
afterEach(() => resetSnapSettings());

describe('axis handle', () => {
	it('is the pointer travel projected onto the axis as drawn on screen: 100px along +X is 2 in, 100px across it is nothing', () => {
		const h = handle('axis', [1, 0, 0], 'X');
		const along = dragValue(input({ handle: h, pointer: at(100, 0) }));
		expect(along.distance).toBeCloseTo(2, 9); close(along.delta, [2, 0, 0]); expect(along.handle).toBe(h); expect(along.snapped).toBeUndefined();
		const across = dragValue(input({ handle: h, pointer: at(0, 100) }));
		expect(across.distance).toBeCloseTo(0, 9); close(across.delta, [0, 0, 0]);
		const back = dragValue(input({ handle: h, pointer: at(-25, 0) }));
		expect(back.distance).toBeCloseTo(-0.5, 9);
	});
	it('falls back to vertical travel when the axis projects to a point (Z, seen from above)', () => {
		const v = dragValue(input({ handle: handle('axis', [0, 0, 1], 'Z'), axis: [0, 0, 1], pointer: at(0, -60) }));
		expect(v.distance).toBeCloseTo((60 * 6) / 600, 9);
	});
	it('Alt divides a handle drag by ten and leaves a face push alone', () => {
		const fine = dragValue(input({ handle: handle('axis', [1, 0, 0], 'X'), pointer: at(100, 0), modifiers: { alt: true } }));
		expect(fine.distance).toBeCloseTo(2 / FINE_DIVISOR, 9);
		const push = dragValue(input({ handle: null, pointer: at(100, 0), modifiers: { alt: true } }));
		expect(push.distance).toBeCloseTo(2, 9);
		const pushAngle = dragValue(input({ handle: null, pointer: at(0, -60), modifiers: { alt: true } }));
		expect(pushAngle.angle).toBeCloseTo(36, 9);
	});
});

describe('plane handle', () => {
	it('is the ray-plane delta in the plane whose normal is the axis: 60px right and 30px up in XY is [1.2, 0.6, 0]', () => {
		const v = dragValue(input({ handle: handle('plane', [0, 0, 1], 'XY'), axis: [0, 0, 1], pointer: at(60, -30) }));
		close(v.delta, [1.2, 0.6, 0]); expect(v.distance).toBeCloseTo(0, 9);
	});
	it('without the viewport helper it flattens the view-plane delta into the plane, and an edge-on plane loses its normal component', () => {
		const flat = dragValue(input({ handle: handle('plane', [0, 0, 1], 'XY'), axis: [0, 0, 1], pointer: at(60, -30), planePoint: undefined }));
		close(flat.delta, [1.2, 0.6, 0]);
		const edgeOn = dragValue(input({ handle: handle('plane', [0, 1, 0], 'XZ'), axis: [0, 1, 0], pointer: at(60, -30) }));
		close(edgeOn.delta, [1.2, 0, 0]);
	});
	it('Alt divides the delta by ten', () => {
		const v = dragValue(input({ handle: handle('plane', [0, 0, 1], 'XY'), axis: [0, 0, 1], pointer: at(60, -30), modifiers: { alt: true } }));
		close(v.delta, [0.12, 0.06, 0]);
	});
});

describe('ring handle', () => {
	const ring = handle('ring', [0, 0, 1], 'about Z');
	/** The client point at `deg` counter-clockwise on screen from 3 o'clock, at radius r around the centre. */
	const around = (deg: number, r = 100) => ({ x: O.x + r * Math.cos((deg * Math.PI) / 180), y: O.y - r * Math.sin((deg * Math.PI) / 180) });
	it('is the angle swept around the centre on screen, counter-clockwise positive when the axis faces the camera', () => {
		const ccw = dragValue(input({ handle: ring, axis: [0, 0, 1], origin: around(0), pointer: around(90) }));
		expect(ccw.angle).toBeCloseTo(90, 9);
		/* A turn is worth an angle only: a caller that reads distance for it moves nothing. */
		expect(ccw.distance).toBe(0); expect(ccw.delta).toEqual([0, 0, 0]);
		const cw = dragValue(input({ handle: ring, axis: [0, 0, 1], origin: around(0), pointer: around(-90) }));
		expect(cw.angle).toBeCloseTo(-90, 9);
		const wrapped = dragValue(input({ handle: ring, axis: [0, 0, 1], origin: around(170), pointer: around(-170) }));
		expect(wrapped.angle).toBeCloseTo(20, 9);
	});
	it('flips sign when the axis points away from the camera, so the body still turns the way the hand went', () => {
		const away = dragValue(input({ handle: ring, axis: [0, 0, 1], origin: around(0), pointer: around(90), viewDirection: [0, 0, 1] }));
		expect(away.angle).toBeCloseTo(-90, 9);
		const unknown = dragValue(input({ handle: ring, axis: [0, 0, 1], origin: around(0), pointer: around(90), viewDirection: undefined }));
		expect(unknown.angle).toBeCloseTo(90, 9);
	});
	it('measures around the handle centre, not the press point, and Alt divides by ten', () => {
		const off = handle('ring', [0, 0, 1], 'about Z', [2, 0, 0]);
		const c = toScreen([2, 0, 0]);
		const v = dragValue(input({ handle: off, axis: [0, 0, 1], start: [2.5, 0, 0], origin: { x: c.x + 100, y: c.y }, pointer: { x: c.x, y: c.y - 100 } }));
		expect(v.angle).toBeCloseTo(90, 9);
		const fine = dragValue(input({ handle: ring, axis: [0, 0, 1], origin: around(0), pointer: around(90), modifiers: { alt: true } }));
		expect(fine.angle).toBeCloseTo(9, 9);
	});
	it('snaps a turn to the step only when the setting is on, only within the radius, and not with Ctrl held', () => {
		snapSettings.angles = true;
		const near = dragValue(input({ handle: ring, axis: [0, 0, 1], origin: around(0), pointer: around(88) }));
		expect(near.angle).toBe(90); expect(near.snapped).toEqual({ to: '90°' });
		expect(Math.abs(88 - 90) * (Math.PI / 180) * 100).toBeLessThanOrEqual(SNAP_RADIUS_PX);
		/* 82.5° sits 7.5° from both 75° and 90°, which at a 100px radius is 13.1px: outside the radius in both directions. */
		const far = dragValue(input({ handle: ring, axis: [0, 0, 1], origin: around(0), pointer: around(82.5) }));
		expect(far.angle).toBeCloseTo(82.5, 9); expect(far.snapped).toBeUndefined();
		expect(Math.abs(82.5 - 90) * (Math.PI / 180) * 100).toBeGreaterThan(SNAP_RADIUS_PX);
		const ctrl = dragValue(input({ handle: ring, axis: [0, 0, 1], origin: around(0), pointer: around(88), modifiers: { ctrl: true } }));
		expect(ctrl.angle).toBeCloseTo(88, 9); expect(ctrl.snapped).toBeUndefined();
		snapSettings.angles = false;
		const off = dragValue(input({ handle: ring, axis: [0, 0, 1], origin: around(0), pointer: around(88) }));
		expect(off.angle).toBeCloseTo(88, 9); expect(off.snapped).toBeUndefined();
		expect(ANGLE_STEP).toBe(15);
	});
});

describe('free handle', () => {
	it('is the view-plane delta', () => {
		const v = dragValue(input({ handle: handle('free', [0, 0, 1], 'free'), axis: [0, 0, 1], pointer: at(60, -30) }));
		close(v.delta, [1.2, 0.6, 0]);
	});
});

describe('snapping', () => {
	const yzAt3: SnapTarget = { kind: 'plane', label: 'YZ at 3', origin: [3, 0, 0], normal: [1, 0, 0], source: 'reference' };
	const X = handle('axis', [1, 0, 0], 'X');
	it('an axis drag lands on a reference plane within 12px and not outside it', () => {
		snapSettings.references = true;
		const near = dragValue(input({ handle: X, pointer: at(145, 0), snapTargets: [yzAt3] }));
		expect(near.distance).toBeCloseTo(3, 9); close(near.delta, [3, 0, 0]); expect(near.snapped).toEqual({ to: 'YZ at 3' });
		expect(Math.abs(145 - 150)).toBeLessThanOrEqual(SNAP_RADIUS_PX);
		const far = dragValue(input({ handle: X, pointer: at(120, 0), snapTargets: [yzAt3] }));
		expect(far.distance).toBeCloseTo(2.4, 9); expect(far.snapped).toBeUndefined();
		expect(Math.abs(120 - 150)).toBeGreaterThan(SNAP_RADIUS_PX);
	});
	it('takes nothing with the setting off, with Ctrl held, or from the other setting\'s targets', () => {
		snapSettings.references = false;
		expect(dragValue(input({ handle: X, pointer: at(145, 0), snapTargets: [yzAt3] })).snapped).toBeUndefined();
		snapSettings.references = true;
		expect(dragValue(input({ handle: X, pointer: at(145, 0), snapTargets: [yzAt3], modifiers: { ctrl: true } })).snapped).toBeUndefined();
		const bodyFace: SnapTarget = { ...yzAt3, label: 'Other face', source: 'body' };
		expect(dragValue(input({ handle: X, pointer: at(145, 0), snapTargets: [bodyFace] })).snapped).toBeUndefined();
		snapSettings.bodies = true;
		expect(dragValue(input({ handle: X, pointer: at(145, 0), snapTargets: [bodyFace] })).snapped).toEqual({ to: 'Other face' });
	});
	it('a plane drag lands on the nearest corner within the plane, ignoring the corner\'s height off it', () => {
		snapSettings.bodies = true;
		const XY = handle('plane', [0, 0, 1], 'XY');
		const near: SnapTarget = { kind: 'point', label: 'near', origin: [1.1, 1, 7], source: 'body' }, far: SnapTarget = { kind: 'point', label: 'far', origin: [1.2, 1, 0], source: 'body' };
		const v = dragValue(input({ handle: XY, axis: [0, 0, 1], pointer: at(50, -50), snapTargets: [far, near] }));
		close(v.delta, [1.1, 1, 0]); expect(v.snapped).toEqual({ to: 'near' });
		const none = dragValue(input({ handle: XY, axis: [0, 0, 1], pointer: at(50, -50), snapTargets: [{ kind: 'point', label: 'off', origin: [1.5, 1, 0], source: 'body' }] }));
		close(none.delta, [1, 1, 0]); expect(none.snapped).toBeUndefined();
	});
	it('judges every anchor handed in, so a body\'s far corner can be the one that lands', () => {
		snapSettings.bodies = true;
		const v = dragValue(input({ handle: X, pointer: at(95, 0), anchors: [[0, 0, 0], [2, 0, 0]], snapTargets: [{ kind: 'point', label: 'corner', origin: [4, 0, 0], source: 'body' }] }));
		expect(v.distance).toBeCloseTo(2, 9); expect(v.snapped).toEqual({ to: 'corner' });
	});
	it('fine control is applied before the snap is judged', () => {
		snapSettings.references = true;
		const v = dragValue(input({ handle: X, pointer: at(145, 0), snapTargets: [yzAt3], modifiers: { alt: true } }));
		expect(v.distance).toBeCloseTo(0.29, 9); expect(v.snapped).toBeUndefined();
	});
	it('a ring drag never snaps to geometry', () => {
		snapSettings.references = true; snapSettings.bodies = true;
		const v = dragValue(input({ handle: handle('ring', [0, 0, 1], 'about Z'), axis: [0, 0, 1], origin: at(100, 0), pointer: at(0, -100), snapTargets: [yzAt3] }));
		expect(v.angle).toBeCloseTo(90, 9); expect(v.snapped).toBeUndefined();
	});
});

describe('constrainedDelta', () => {
	it('an axis drag cannot reach a plane parallel to it, and a plane drag cannot reach a parallel plane', () => {
		expect(constrainedDelta([0, 0, 0], [1, 0, 0], { kind: 'plane', label: '', origin: [0, 0, 5], normal: [0, 0, 1], source: 'reference' }, 'axis', [1, 0, 0])).toBeNull();
		expect(constrainedDelta([0, 0, 0], [1, 1, 0], { kind: 'plane', label: '', origin: [0, 0, 5], normal: [0, 0, 1], source: 'reference' }, 'plane', [0, 0, 1])).toBeNull();
	});
	it('an axis drag meets a skew axis at closest approach, a plane drag meets a piercing axis where it pierces, a free drag drops onto a plane', () => {
		close(constrainedDelta([0, 0, 0], [0.5, 0, 0], { kind: 'axis', label: '', origin: [2, -1, 1], direction: [0, 1, 0], source: 'reference' }, 'axis', [1, 0, 0])!, [2, 0, 0]);
		close(constrainedDelta([0, 0, 0], [0.5, 0.5, 0], { kind: 'axis', label: '', origin: [1, 1, 3], direction: [0, 0, 1], source: 'reference' }, 'plane', [0, 0, 1])!, [1, 1, 0]);
		close(constrainedDelta([0, 0, 0], [1, 1, 1], { kind: 'plane', label: '', origin: [0, 0, 0], normal: [0, 0, 1], source: 'reference' }, 'free', [0, 0, 1])!, [1, 1, 0]);
		/* A plane drag against a tilted plane: the closest point of the two planes' line to the moved point. XY drag, target x + z = 2: from M = (0.5, 0.7, 0) the line x = 2 in XY is 1.5 away, so the delta is (2, 0.7, 0). */
		close(constrainedDelta([0, 0, 0], [0.5, 0.7, 0], { kind: 'plane', label: '', origin: [2, 0, 0], normal: [Math.SQRT1_2, 0, Math.SQRT1_2], source: 'reference' }, 'plane', [0, 0, 1])!, [2, 0.7, 0]);
	});
});

const mesh = () => ({ positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array() });
const body = (id: string, name: string, corners: Vec3[], faces: { kind: string; center: Vec3; normal: Vec3 }[], centerOfMass: Vec3 = [0, 0, 0]): BodyProjection => ({ id, name, materialId: null, role: 'part', createdBy: id, volume: 1, bounds: [0, 0, 0, 1, 1, 1], centerOfMass, inertia: [], mesh: mesh(), edges: [],
	vertices: corners.map((point, i) => ({ id: `v${i}`, point, faces: [] })),
	faces: faces.map((f, i) => ({ id: `f${i}`, kind: f.kind, center: f.center, normal: f.normal, area: 1, surface: {}, edges: [], ...mesh() })) });
const model = (bodies: BodyProjection[], references: ModelProjection['references'] = []): ModelProjection => ({ bodies, sketches: [], references, features: [], mates: [], addons: { ideaBlade: false }, canUndo: false, canRedo: false, operationMs: 0 });
describe('snapTargetsFrom and bodyAnchors', () => {
	const moving = body('m', 'Moving', [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], [{ kind: 'plane', center: [0.5, 0.5, 1], normal: [0, 0, 1] }]);
	const other = body('o', 'Other', [[5, 0, 0], [6, 0, 0]], [{ kind: 'plane', center: [5.5, 0, 1], normal: [0, 0, 1] }, { kind: 'cylinder', center: [5.5, 0, 0.5], normal: [0, 0, 0] }]);
	const refs: ModelProjection['references'] = [
		{ feature: 'p1', name: 'Plane 1', kind: 'plane', origin: [0, 0, 2], normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], size: 1 },
		{ feature: 'a1', name: 'Axis 1', kind: 'axis', origin: [1, 1, 0], direction: [0, 0, 1], size: 1 },
		{ feature: 'pt1', name: 'Point 1', kind: 'point', origin: [2, 3, 4], size: 1 }
	];
	it('offers the datums, every reference, and the other bodies\' corners and flat faces, and never the moving body\'s own', () => {
		const targets = snapTargetsFrom(model([moving, other], refs), ['m']);
		expect(targets.filter((t) => t.source === 'reference').map((t) => t.label)).toEqual(['XY plane', 'XZ plane', 'YZ plane', 'X axis', 'Y axis', 'Z axis', 'origin', 'Plane 1', 'Axis 1', 'Point 1']);
		expect(targets.filter((t) => t.source === 'body').map((t) => `${t.kind}:${t.label}`)).toEqual(['point:Other corner', 'point:Other corner', 'plane:Other face']);
		expect(targets.filter((t) => t.label.startsWith('Moving'))).toHaveLength(0);
		/* The positive control: with nothing excluded the moving body's eight corners and one flat face are offered. */
		expect(snapTargetsFrom(model([moving, other], refs), []).filter((t) => t.label.startsWith('Moving'))).toHaveLength(9);
	});
	it('anchors are the body\'s corners, its centre when it has none, and nothing for an unknown body', () => {
		expect(bodyAnchors(model([moving]), 'm')).toHaveLength(8);
		expect(bodyAnchors(model([body('s', 'Sphere', [], [], [3, 3, 3])]), 's')).toEqual([[3, 3, 3]]);
		expect(bodyAnchors(model([moving]), 'nope')).toEqual([]);
	});
});
