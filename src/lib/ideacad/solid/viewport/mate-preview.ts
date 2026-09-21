/**
 * THE MAGNETIC AUTO-MATE. While a body is dragged with the Move tool, the
 * workspace asks this function what the drag would snap to: a flat face of the
 * moving body that has come within `tolerance` of a facing flat face on
 * another body (a coincident mate), or a round face whose axis has come within
 * `tolerance` of another body's round face's axis (a concentric mate). It
 * answers with the SNAPPED delta -- the drag delta corrected by the smallest
 * move that closes the gap -- the candidate mate as two selections, and the
 * guide polylines to draw (the target face's own edges, and the moving face's
 * edges where they will land).
 *
 * Pure over the projection: no kernel, no viewport, so it is assertable with
 * two hand-written boxes. The candidate's `a` is the STATIONARY body's entity
 * and `b` is the moving body's, because the solver keeps the first body a mate
 * names still and moves the second to it -- the body under the pointer is the
 * one that should move.
 */
import type { BodyProjection, FaceProjection, MateKind, ModelProjection, Selection, Vec3 } from '../types';
import { dot, sub, unit } from '../math';

/** How close, in inches, a face or an axis has to come before it snaps. */
export const MATE_SNAP_TOLERANCE = 0.15;
export interface MatePreview { delta: Vec3; candidate: { kind: MateKind; a: Selection; b: Selection } | null; guides: Vec3[][] }
const NONE = (delta: Vec3): MatePreview => ({ delta, candidate: null, guides: [] });

const shifted = (p: Vec3, delta: Vec3): Vec3 => [p[0] + delta[0], p[1] + delta[1], p[2] + delta[2]];
/** The axis-aligned box of a face's mesh, shifted by `delta`. Null for a face with no mesh. */
function box(face: FaceProjection, delta: Vec3): { min: Vec3; max: Vec3 } | null {
	const p = face.positions; if (p.length < 3) return null;
	const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { const v = p[i + k] + delta[k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
	return { min, max };
}
const overlaps = (a: { min: Vec3; max: Vec3 }, b: { min: Vec3; max: Vec3 }, margin: number) => [0, 1, 2].every((k) => a.min[k] <= b.max[k] + margin && b.min[k] <= a.max[k] + margin);
/** The extent of a face's mesh along a unit direction. */
function span(face: FaceProjection, delta: Vec3, direction: Vec3): [number, number] | null {
	const p = face.positions; if (p.length < 3) return null;
	let lo = Infinity, hi = -Infinity;
	for (let i = 0; i < p.length; i += 3) { const t = (p[i] + delta[0]) * direction[0] + (p[i + 1] + delta[1]) * direction[1] + (p[i + 2] + delta[2]) * direction[2]; if (t < lo) lo = t; if (t > hi) hi = t; }
	return [lo, hi];
}
const numbers = (value: unknown): Vec3 | null => (Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every((n) => typeof n === 'number' && Number.isFinite(n)) ? [value[0], value[1], value[2]] : null);
const axisOf = (face: FaceProjection): { origin: Vec3; direction: Vec3 } | null => { if (face.kind !== 'cylinder') return null; const axis = numbers(face.surface.axis), origin = numbers(face.surface.origin); return axis && origin && Math.hypot(...axis) > 1e-9 ? { origin, direction: unit(axis) } : null; };
/** A face's edges as polylines, shifted. */
function outline(body: BodyProjection, face: FaceProjection, delta: Vec3): Vec3[][] {
	const out: Vec3[][] = [];
	for (const id of face.edges) {
		const edge = body.edges.find((e) => e.id === id); if (!edge || edge.points.length < 6) continue;
		const line: Vec3[] = []; for (let i = 0; i < edge.points.length; i += 3) line.push(shifted([edge.points[i], edge.points[i + 1], edge.points[i + 2]], delta));
		out.push(line);
	}
	return out;
}

export function matePreview(model: ModelProjection, movingBodyId: string, delta: Vec3, tolerance = MATE_SNAP_TOLERANCE): MatePreview {
	const mover = model.bodies.find((b) => b.id === movingBodyId);
	if (!mover || !(tolerance > 0)) return NONE(delta);
	type Candidate = { correction: Vec3; size: number; kind: MateKind; a: Selection; b: Selection; target: BodyProjection; targetFace: FaceProjection; face: FaceProjection };
	let best: Candidate | null = null;
	const consider = (size: number, correction: Vec3, kind: MateKind, face: FaceProjection, target: BodyProjection, targetFace: FaceProjection) => {
		if (size > tolerance || (best && size >= best.size)) return;
		best = { correction, size, kind, a: { bodyId: target.id, kind: 'face', id: targetFace.id }, b: { bodyId: mover.id, kind: 'face', id: face.id }, target, targetFace, face };
	};
	for (const face of mover.faces) {
		const movedBox = box(face, delta);
		if (face.kind === 'plane' && Math.hypot(...face.normal) > 0.5) {
			const center = shifted(face.center, delta);
			for (const other of model.bodies) {
				if (other.id === mover.id) continue;
				for (const g of other.faces) {
					if (g.kind !== 'plane' || dot(face.normal, g.normal) > -0.999) continue;
					const gap = dot(sub(center, g.center), g.normal);
					if (Math.abs(gap) > tolerance) continue;
					const targetBox = box(g, [0, 0, 0]);
					if (movedBox && targetBox && !overlaps(movedBox, targetBox, tolerance)) continue;
					consider(Math.abs(gap), [-gap * g.normal[0], -gap * g.normal[1], -gap * g.normal[2]], 'coincident', face, other, g);
				}
			}
		}
		const axis = axisOf(face);
		if (axis) {
			const origin = shifted(axis.origin, delta);
			for (const other of model.bodies) {
				if (other.id === mover.id) continue;
				for (const g of other.faces) {
					const target = axisOf(g); if (!target || Math.abs(dot(axis.direction, target.direction)) < 0.999) continue;
					const w = sub(origin, target.origin), off = sub(w, [target.direction[0] * dot(w, target.direction), target.direction[1] * dot(w, target.direction), target.direction[2] * dot(w, target.direction)]);
					const size = Math.hypot(...off);
					if (size > tolerance) continue;
					const mine = span(face, delta, target.direction), theirs = span(g, [0, 0, 0], target.direction);
					if (mine && theirs && (mine[0] > theirs[1] + tolerance || theirs[0] > mine[1] + tolerance)) continue;
					consider(size, [-off[0], -off[1], -off[2]], 'concentric', face, other, g);
				}
			}
		}
	}
	/* `best` is assigned inside `consider`, which the narrowing above cannot see. */
	const b = best as Candidate | null;
	if (!b) return NONE(delta);
	const snapped = shifted(delta, b.correction);
	const guides = [...outline(b.target, b.targetFace, [0, 0, 0]), ...outline(mover, b.face, snapped)];
	if (b.kind === 'concentric') {
		const target = axisOf(b.targetFace)!, extent = span(b.targetFace, [0, 0, 0], target.direction) ?? [0, 0];
		const along = (t: number): Vec3 => [target.origin[0] + target.direction[0] * t, target.origin[1] + target.direction[1] * t, target.origin[2] + target.direction[2] * t];
		const base = dot(target.origin, target.direction);
		guides.push([along(extent[0] - base - 0.5), along(extent[1] - base + 0.5)]);
	}
	return { delta: snapped, candidate: { kind: b.kind, a: b.a, b: b.b }, guides };
}
