/**
 * ENTITY FRAMES: what a mate reads off a face, an edge, a corner or a piece
 * of reference geometry. Three shapes cover every mate kind -- a PLANE (a flat
 * face, a reference plane), an AXIS (a cylinder, a cone, a circular edge, a
 * straight edge, a reference axis) and a POINT (a corner, a reference point).
 *
 * A frame is built from the same analytic record wherever it comes from: the
 * kernel's `getAnalyticSurfaceParams` in the solver, and the projection's
 * `FaceProjection.surface` (which IS that record, parsed) in the panel and the
 * magnetic preview -- so the two sides describe one face the same way. Plane
 * normals are the OUTWARD face normal, never the raw surface normal, because a
 * coincident mate means "these two faces touch" and touching is about outsides.
 */
import type { BodyProjection, EntityRef, ModelProjection, Vec3 } from '../types';
import { cross, dot, scale, sub, unit, vector } from '../math';
import { edgeId, vertexId } from '../naming';
import { applyDirection, applyMatrix } from './rigid';

export type EntityFrame =
	| { kind: 'plane'; origin: Vec3; normal: Vec3 }
	| { kind: 'axis'; origin: Vec3; direction: Vec3; radius?: number }
	| { kind: 'point'; point: Vec3 };

export const planeFrame = (origin: Vec3, normal: Vec3): EntityFrame => ({ kind: 'plane', origin, normal: unit(normal) });
export const axisFrame = (origin: Vec3, direction: Vec3, radius?: number): EntityFrame => ({ kind: 'axis', origin, direction: unit(direction), ...(radius !== undefined ? { radius } : {}) });
export const pointFrame = (point: Vec3): EntityFrame => ({ kind: 'point', point });

export const UNMATEABLE_FACE = 'Mate a flat face, a round face, a straight or circular edge, a corner, or reference geometry.';
const numbers = (value: unknown): Vec3 | null => Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every((n) => typeof n === 'number' && Number.isFinite(n)) ? [value[0], value[1], value[2]] : null;

/**
 * A frame from an analytic surface record. `anchor` is a point known to lie
 * on the face (the kernel's face anchor); `outward` is the face's outward
 * normal for a plane, which the record's own `normal` may have reversed.
 */
export function frameFromSurface(type: string, params: Record<string, unknown>, anchor: Vec3, outward?: Vec3): EntityFrame {
	if (type === 'plane') {
		const n = (outward && Math.hypot(...outward) > 0.5 ? outward : numbers(params.normal)) ?? null;
		if (!n) throw Error(UNMATEABLE_FACE);
		return planeFrame(anchor, n);
	}
	if (type === 'cylinder' || type === 'cone' || type === 'torus') {
		const axis = numbers(params.axis), origin = numbers(params.origin);
		if (!axis || !origin) throw Error(UNMATEABLE_FACE);
		return axisFrame(origin, axis, typeof params.radius === 'number' ? params.radius : undefined);
	}
	if (type === 'sphere') {
		const center = numbers(params.origin) ?? numbers(params.center);
		if (!center) throw Error(UNMATEABLE_FACE);
		return pointFrame(center);
	}
	throw Error(UNMATEABLE_FACE);
}
/** The circle through three points: its center, its axis and its radius. */
export function circleThrough(p: Vec3, q: Vec3, r: Vec3): { center: Vec3; normal: Vec3; radius: number } {
	const a = sub(q, p), b = sub(r, p), n = cross(a, b), nn = dot(n, n);
	if (nn < 1e-24) throw Error('Mate a straight or circular edge.');
	const aa = dot(a, a), bb = dot(b, b), ab = dot(a, b);
	const denominator = 2 * (aa * bb - ab * ab);
	const s = (bb * (aa - ab)) / denominator, t = (aa * (bb - ab)) / denominator;
	const center: Vec3 = [p[0] + s * a[0] + t * b[0], p[1] + s * a[1] + t * b[1], p[2] + s * a[2] + t * b[2]];
	return { center, normal: unit(n), radius: Math.hypot(...sub(p, center)) };
}
export const lineFrame = (a: Vec3, b: Vec3): EntityFrame => { if (Math.hypot(...sub(b, a)) < 1e-12) throw Error('Mate a straight or circular edge.'); return axisFrame(a, sub(b, a)); };

export function transformFrame(frame: EntityFrame, m: readonly number[]): EntityFrame {
	if (frame.kind === 'plane') return { kind: 'plane', origin: applyMatrix(m as number[], frame.origin), normal: applyDirection(m, frame.normal) };
	if (frame.kind === 'axis') return { kind: 'axis', origin: applyMatrix(m as number[], frame.origin), direction: applyDirection(m, frame.direction), ...(frame.radius !== undefined ? { radius: frame.radius } : {}) };
	return { kind: 'point', point: applyMatrix(m as number[], frame.point) };
}
/** The frame's anchor: where a rotation that keeps the entity in place turns about. */
export const frameOrigin = (frame: EntityFrame): Vec3 => frame.kind === 'point' ? frame.point : frame.origin;
/** The frame's direction, if it has one. */
export const frameDirection = (frame: EntityFrame): Vec3 | null => frame.kind === 'plane' ? frame.normal : frame.kind === 'axis' ? frame.direction : null;

/* ------------------------------------------------------------------------
 * FROM THE PROJECTION, for the panel and the magnetic preview
 * --------------------------------------------------------------------- */
const at = (points: Float32Array, i: number): Vec3 => [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
/** The frame of a projected edge: a straight edge by its ends, a circular one by three of its samples. */
export function edgeFrameFromProjection(edge: BodyProjection['edges'][number]): EntityFrame {
	const n = edge.points.length / 3;
	if (n < 2) throw Error('Mate a straight or circular edge.');
	if (edge.curve === 'LINE') return lineFrame(at(edge.points, 0), at(edge.points, n - 1));
	if (edge.curve === 'CIRCLE') { const c = circleThrough(at(edge.points, 0), at(edge.points, Math.floor(n / 3)), at(edge.points, Math.floor((2 * n) / 3))); return axisFrame(c.center, c.normal, c.radius); }
	throw Error('Mate a straight or circular edge.');
}
/** The frame a stored reference names, read off the projection, or null when nothing on the model answers to it. */
export function frameFromProjection(model: ModelProjection, ref: EntityRef): { body: string | null; frame: EntityFrame } | null {
	if (ref.kind === 'reference') {
		const r = model.references.find((x) => x.feature === ref.feature); if (!r) return null;
		if (r.kind === 'plane' && r.normal) return { body: null, frame: planeFrame(r.origin, r.normal) };
		if (r.kind === 'axis' && r.direction) return { body: null, frame: axisFrame(r.origin, r.direction) };
		return { body: null, frame: pointFrame(r.origin) };
	}
	if (ref.kind === 'body' || ref.kind === 'sketch-entity') return null;
	const body = model.bodies.find((b) => b.id === ref.body); if (!body) return null;
	try {
		if (ref.kind === 'face') { const f = body.faces.find((x) => x.id === ref.name); return f ? { body: body.id, frame: frameFromSurface(f.kind, f.surface, f.center, f.normal) } : null; }
		if (ref.kind === 'edge') { const id = edgeId(ref.faces, ref.ordinal); const e = body.edges.find((x) => x.id === id); return e ? { body: body.id, frame: edgeFrameFromProjection(e) } : null; }
		const id = vertexId(ref.faces, ref.ordinal); const v = body.vertices.find((x) => x.id === id); return v ? { body: body.id, frame: pointFrame(v.point) } : null;
	} catch { return null; }
}
/** The center of a body's bounds: the point its twist is written about. */
export const boundsCenter = (bounds: readonly number[]): Vec3 => [(bounds[0] + bounds[3]) / 2, (bounds[1] + bounds[4]) / 2, (bounds[2] + bounds[5]) / 2];
export { vector, scale };
