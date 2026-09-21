/**
 * WHAT A POINTER MOVEMENT IS WORTH, IN MODEL UNITS. Pure arithmetic over the
 * geometry the viewport hands in, so it is testable with no canvas and so the
 * part-movement surface can change what a handle means without touching the
 * pointer pipeline.
 *
 * THIS MODULE IS THE PART-MOVEMENT SURFACE'S. What each triad handle means,
 * snapping to reference geometry and to other bodies, and the fine-control
 * modifier are all decided here; the viewport only supplies the projection
 * helpers in `DragInput`.
 *
 * THE FOUR HANDLE MODES (`TriadHandle.mode`):
 *   axis   distance along the axis, from the pointer's travel projected onto
 *          the axis as it appears on screen (a drag straight across the
 *          arrow is worth nothing, by design);
 *   plane  the delta in the plane through the press point whose normal is
 *          the handle's axis, from a ray-plane intersection at press and now
 *          (`planePoint`); without that helper the view-plane delta with its
 *          normal component removed stands in;
 *   ring   the angle the pointer has swept around the triad centre ON SCREEN,
 *          in degrees, signed so that turning counter-clockwise as the
 *          student sees it turns the body counter-clockwise about the axis
 *          as the camera sees that axis (`viewDirection` says which way the
 *          axis points; without it the axis is taken to face the camera);
 *   free   the delta in the view plane, as a face drag always was.
 *
 * SNAPPING moves the ANCHORS (the moving body's corners, or the triad centre
 * when no corners are handed in) onto the nearest target that is within
 * `SNAP_RADIUS_PX` on screen, while keeping the handle's constraint: an axis
 * drag stays on its axis, a plane drag stays in its plane. Reference planes,
 * axes and points (the three datums included) are one setting; other bodies'
 * corners and flat faces are the other; both are module-level and written by
 * `MovePanel.svelte`, exactly as `features/options.ts` is written by the
 * feature panel -- nothing renders from this object, the panel mirrors it.
 * Holding Ctrl drags without snapping for that one drag.
 *
 * FINE CONTROL divides a handle drag's distance, delta or angle by
 * `FINE_DIVISOR` while Alt is held. It applies BEFORE snapping, so a snap is
 * judged on the fine value; and only to handle drags, so a face push or an
 * extrude reads exactly as it did.
 *
 * NOTHING IS CLAMPED OR ROUNDED HERE. A snap replaces a value with another
 * exact value; what the kernel refuses is the kernel's own sentence.
 */
import type { ModelProjection, Vec3 } from '../types';
import type { TriadHandle } from './triad';
import type { DragValue } from '../viewport';

/** A plane the viewport can drop a client position onto. */
export interface DragPlane { origin: Vec3; normal: Vec3 }
/** Something an anchor can land on. `source` is which setting admits it. */
export interface SnapTarget {
	kind: 'plane' | 'axis' | 'point';
	/** The words the readout shows: `XY plane`, `Body 2 corner`. */
	label: string;
	origin: Vec3;
	/** A plane's normal. */
	normal?: Vec3;
	/** An axis's direction. */
	direction?: Vec3;
	source: 'reference' | 'body';
}
export interface SnapSettings {
	/** Reference planes, axes and points, the datums included. */
	references: boolean;
	/** Other bodies' corners and flat faces. */
	bodies: boolean;
	/** A turn lands on a multiple of `ANGLE_STEP` degrees. */
	angles: boolean;
}
/** How close, on screen, a snap has to be before it takes. */
export const SNAP_RADIUS_PX = 12;
/** The step a snapped turn lands on, in degrees. */
export const ANGLE_STEP = 15;
/** What Alt divides a handle drag by. */
export const FINE_DIVISOR = 10;
/** The one modifier vocabulary the panel states and this module reads. */
export const MODIFIER_WORDS = { fine: 'Hold Alt for fine control (one tenth).', noSnap: 'Hold Ctrl to drag without snapping.' } as const;
export const DEFAULT_SNAP_SETTINGS = (): SnapSettings => ({ references: false, bodies: false, angles: false });
/** Module-level, deliberately not reactive: `MovePanel.svelte` mirrors it into its own `$state` and writes here; `dragValue` reads it at the moment a value is built. */
export const snapSettings: SnapSettings = DEFAULT_SNAP_SETTINGS();
export function resetSnapSettings() { Object.assign(snapSettings, DEFAULT_SNAP_SETTINGS()); }

export interface DragInput {
	/** The world point the drag started on and the axis it runs along. */
	start: Vec3;
	axis: Vec3;
	handle?: TriadHandle | null;
	/** The pointer at press and now, in client pixels. */
	origin: { x: number; y: number };
	pointer: { x: number; y: number };
	/** The pointer now, relative to the canvas, for the readout position. */
	offset: { x: number; y: number };
	canvas: { width: number; height: number };
	zoom: number;
	/** Client-pixel position of a world point. */
	toScreen: (p: Vec3) => { x: number; y: number };
	/** The world point under a client position on the view plane through `through`. */
	viewPlanePoint: (client: { x: number; y: number }, through: Vec3) => Vec3 | null;
	/** The world point under a client position on an arbitrary plane; the viewport supplies it from its ray. Optional until it does. */
	planePoint?: (client: { x: number; y: number }, plane: DragPlane) => Vec3 | null;
	/** The camera's world direction (from the camera into the scene), for a ring's sign. */
	viewDirection?: Vec3;
	/** What an anchor may snap to, already excluding the bodies being moved (`snapTargetsFrom`). */
	snapTargets?: readonly SnapTarget[];
	/** The points that are moved and judged for a snap: the moving body's corners (`bodyAnchors`). The triad centre stands in when absent. */
	anchors?: readonly Vec3[];
	/** Held modifiers, for fine control and snapping decisions. */
	modifiers?: { shift?: boolean; ctrl?: boolean; alt?: boolean };
}
/** A drag value with the snap it took, when it took one. `snapped` is this surface's field; the readout may show `snapped.to`. */
export type MoveDragValue = DragValue & { snapped?: { to: string } };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => { const n = norm(a); return n > 1e-12 ? mul(a, 1 / n) : [0, 0, 1]; };
const EPS = 1e-9;

/** The drag's value: distance along the axis (screen-projected), the free delta in the view plane, an angle and a count from vertical travel. */
export function dragValue(input: DragInput): MoveDragValue {
	const a = input.toScreen(input.start), b = input.toScreen(add(input.start, input.axis));
	const vx = b.x - a.x, vy = b.y - a.y, l = vx * vx + vy * vy;
	const dx = input.pointer.x - input.origin.x, dy = input.pointer.y - input.origin.y;
	const startPoint = input.viewPlanePoint(input.origin, input.start), endPoint = input.viewPlanePoint(input.pointer, input.start);
	const viewDelta: Vec3 = startPoint && endPoint ? sub(endPoint, startPoint) : [0, 0, 0];
	const handle = input.handle ?? null, mode = handle?.mode;
	const fine = handle && input.modifiers?.alt ? 1 / FINE_DIVISOR : 1;
	let distance = (l > 4 ? (dx * vx + dy * vy) / l : (-dy * 6) / input.canvas.height / input.zoom) * fine;
	let delta: Vec3 = mul(viewDelta, fine);
	let angle = (-dy / input.canvas.height) * 360 * fine;
	let snapped: { to: string } | undefined;
	if (mode === 'plane') delta = mul(planeDelta(input), fine);
	/* A ring is worth an angle and nothing else: its distance and delta are zero, so a caller still reading distance for a turn moves nothing. */
	else if (mode === 'ring') { angle = ringAngle(input, handle!) * fine; distance = 0; delta = [0, 0, 0]; }
	if (mode === 'axis') delta = mul(input.axis, distance);
	if (handle && mode !== 'ring' && !input.modifiers?.ctrl) {
		const snap = snapDelta(input, handle, mode === 'axis' ? 'axis' : mode === 'plane' ? 'plane' : 'free', delta);
		if (snap) { delta = snap.delta; snapped = { to: snap.to }; }
	}
	if (mode === 'ring' && snapSettings.angles && !input.modifiers?.ctrl) {
		const step = Math.round(angle / ANGLE_STEP) * ANGLE_STEP, c = input.toScreen(handle!.center ?? input.start);
		const radius = Math.hypot(input.pointer.x - c.x, input.pointer.y - c.y);
		if (Math.abs(angle - step) * Math.PI / 180 * radius <= SNAP_RADIUS_PX && step !== angle) { angle = step; snapped = { to: `${step}°` }; }
	}
	if (mode === 'axis') distance = dot(delta, input.axis) / Math.max(dot(input.axis, input.axis), EPS);
	else if (mode === 'plane' || mode === 'free') distance = dot(delta, unit(input.axis));
	return {
		distance,
		delta,
		angle,
		count: Math.max(2, 2 + Math.round(-dy / 35)),
		point: input.offset,
		handle,
		modifiers: input.modifiers,
		...(snapped ? { snapped } : {})
	};
}

/** The delta in the handle's plane through the press point: a ray-plane intersection at press and now, or the view-plane delta flattened into the plane. */
function planeDelta(input: DragInput): Vec3 {
	const n = unit(input.axis), plane: DragPlane = { origin: input.start, normal: n };
	if (input.planePoint) {
		const p0 = input.planePoint(input.origin, plane), p1 = input.planePoint(input.pointer, plane);
		if (p0 && p1) return sub(p1, p0);
	}
	const s = input.viewPlanePoint(input.origin, input.start), e = input.viewPlanePoint(input.pointer, input.start);
	if (!s || !e) return [0, 0, 0];
	const d = sub(e, s);
	return sub(d, mul(n, dot(d, n)));
}
/**
 * The angle swept around the triad centre on screen, in degrees. Screen y
 * runs down, so a counter-clockwise sweep as the student sees it is a FALLING
 * `atan2`; the sign is then flipped again when the axis points away from the
 * camera, so the body always turns the way the hand went.
 */
export function ringAngle(input: DragInput, handle: TriadHandle): number {
	const c = input.toScreen(handle.center ?? input.start);
	const a0 = Math.atan2(input.origin.y - c.y, input.origin.x - c.x), a1 = Math.atan2(input.pointer.y - c.y, input.pointer.x - c.x);
	let swept = (a0 - a1) * 180 / Math.PI;
	if (swept > 180) swept -= 360; else if (swept <= -180) swept += 360;
	const facing = input.viewDirection ? -dot(unit(handle.axis), unit(input.viewDirection)) : 1;
	return facing < 0 ? -swept : swept;
}

type Constraint = 'axis' | 'plane' | 'free';
/** The delta that puts one anchor on `target` while keeping the handle's constraint, or null when the geometry does not meet. */
export function constrainedDelta(anchor: Vec3, moved: Vec3, target: SnapTarget, constraint: Constraint, axis: Vec3): Vec3 | null {
	const A = anchor, M = moved, ax = unit(axis);
	if (target.kind === 'point') {
		const d = sub(target.origin, A);
		if (constraint === 'axis') return mul(ax, dot(d, ax));
		if (constraint === 'plane') return sub(d, mul(ax, dot(d, ax)));
		return d;
	}
	if (target.kind === 'axis') {
		const O = target.origin, D = unit(target.direction ?? [0, 0, 1]);
		if (constraint === 'axis') {
			/* Closest approach of two lines A + ax t and O + D s. */
			const w = sub(A, O), b = dot(ax, D), d = dot(ax, w), e = dot(D, w), denom = 1 - b * b;
			const t = Math.abs(denom) < EPS ? -d : (b * e - d) / denom;
			return mul(ax, t);
		}
		if (constraint === 'plane') {
			const dn = dot(D, ax);
			if (Math.abs(dn) > EPS) { const s = dot(sub(A, O), ax) / dn; return sub(add(O, mul(D, s)), A); }
			const Op = sub(O, mul(ax, dot(sub(O, A), ax))), s = dot(sub(M, Op), D);
			return sub(add(Op, mul(D, s)), A);
		}
		const s = dot(sub(M, O), D);
		return sub(add(O, mul(D, s)), A);
	}
	const O = target.origin, N = unit(target.normal ?? [0, 0, 1]);
	if (constraint === 'axis') {
		const an = dot(ax, N);
		if (Math.abs(an) < EPS) return null;
		return mul(ax, dot(sub(O, A), N) / an);
	}
	if (constraint === 'plane') {
		if (norm(cross(ax, N)) < EPS) return null;
		/* The point of the two planes' intersection line closest to M: M + a·ax + b·N with M already on the motion plane. */
		const nn = dot(ax, N), rhs = -dot(sub(M, O), N), det = 1 - nn * nn;
		const a = (-nn * rhs) / det, b = rhs / det;
		return sub(add(M, add(mul(ax, a), mul(N, b))), A);
	}
	return sub(sub(M, mul(N, dot(sub(M, O), N))), A);
}
const PRIORITY: Record<SnapTarget['kind'], number> = { point: 0, axis: 1, plane: 2 };
/** The nearest admissible snap within `SNAP_RADIUS_PX` of where an anchor would land, or null. */
function snapDelta(input: DragInput, handle: TriadHandle, constraint: Constraint, delta: Vec3): { delta: Vec3; to: string } | null {
	const targets = (input.snapTargets ?? []).filter((t) => (t.source === 'reference' ? snapSettings.references : snapSettings.bodies));
	if (!targets.length) return null;
	const anchors = input.anchors?.length ? input.anchors : [handle.center ?? input.start];
	let best: { delta: Vec3; to: string; px: number; priority: number } | null = null;
	for (const A of anchors) {
		const M = add(A, delta), m = input.toScreen(M);
		for (const t of targets) {
			const d = constrainedDelta(A, M, t, constraint, input.axis);
			if (!d || !d.every(Number.isFinite)) continue;
			const p = input.toScreen(add(A, d)), px = Math.hypot(p.x - m.x, p.y - m.y);
			if (px > SNAP_RADIUS_PX) continue;
			const priority = PRIORITY[t.kind];
			if (!best || px < best.px - 1e-9 || (Math.abs(px - best.px) <= 1e-9 && priority < best.priority)) best = { delta: d, to: t.label, px, priority };
		}
	}
	return best;
}

const DATUM_PLANES: SnapTarget[] = [
	{ kind: 'plane', label: 'XY plane', origin: [0, 0, 0], normal: [0, 0, 1], source: 'reference' },
	{ kind: 'plane', label: 'XZ plane', origin: [0, 0, 0], normal: [0, 1, 0], source: 'reference' },
	{ kind: 'plane', label: 'YZ plane', origin: [0, 0, 0], normal: [1, 0, 0], source: 'reference' },
	{ kind: 'axis', label: 'X axis', origin: [0, 0, 0], direction: [1, 0, 0], source: 'reference' },
	{ kind: 'axis', label: 'Y axis', origin: [0, 0, 0], direction: [0, 1, 0], source: 'reference' },
	{ kind: 'axis', label: 'Z axis', origin: [0, 0, 0], direction: [0, 0, 1], source: 'reference' },
	{ kind: 'point', label: 'origin', origin: [0, 0, 0], source: 'reference' }
];
/** Everything in the model an anchor may land on: the datums, every reference, and the corners and flat faces of every body NOT in `exclude` (the bodies being moved). */
export function snapTargetsFrom(model: ModelProjection, exclude: readonly string[] = []): SnapTarget[] {
	const out: SnapTarget[] = [...DATUM_PLANES];
	for (const r of model.references) {
		if (r.kind === 'plane' && r.normal) out.push({ kind: 'plane', label: r.name, origin: r.origin, normal: r.normal, source: 'reference' });
		else if (r.kind === 'axis' && r.direction) out.push({ kind: 'axis', label: r.name, origin: r.origin, direction: r.direction, source: 'reference' });
		else if (r.kind === 'point') out.push({ kind: 'point', label: r.name, origin: r.origin, source: 'reference' });
	}
	for (const body of model.bodies) {
		if (exclude.includes(body.id)) continue;
		for (const v of body.vertices) out.push({ kind: 'point', label: `${body.name} corner`, origin: v.point, source: 'body' });
		for (const f of body.faces) if (f.kind === 'plane' && norm(f.normal) > 0.9) out.push({ kind: 'plane', label: `${body.name} face`, origin: f.center, normal: f.normal, source: 'body' });
	}
	return out;
}
/** The points of a body that are judged for a snap: its corners, or its centre of mass when it has none (a sphere). */
export function bodyAnchors(model: ModelProjection, bodyId: string): Vec3[] {
	const body = model.bodies.find((b) => b.id === bodyId);
	if (!body) return [];
	return body.vertices.length ? body.vertices.map((v) => v.point) : [body.centerOfMass];
}
