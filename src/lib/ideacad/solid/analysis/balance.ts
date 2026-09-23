/**
 * TIP-OVER, FROM THE FOOTPRINT. Pure.
 *
 * THE GROUND IS THE MODEL'S OWN LOWEST POINT, with gravity along -Z (the
 * modeler is Z-up). The FOOTPRINT is the convex hull, in XY, of every surface
 * point within `GROUND_TOLERANCE_IN` of that lowest Z: a box's bottom face, a
 * wheel's contact line, a skid's pad. Read off the display mesh, whose points
 * lie ON the surface, so a round wheel contributes its contact line and not its
 * bounding box.
 *
 * THE ANGLE ABOUT EACH FOOTPRINT EDGE is atan(d / h): d is how far the CG's
 * ground projection sits inside that edge and h is the CG's height above the
 * ground. Tilt the model about that edge by more than the angle and the CG
 * passes over it. The smallest angle is the direction it tips first. This is
 * standard statics, labeled as such where it is shown; a CG outside the
 * footprint is already tipping, and a footprint that is a line or a point (two
 * coaxial wheels, a sphere) has no area to stand on.
 */
import type { BodyProjection, Vec3 } from '../types';
import { GROUND_TOLERANCE_IN, lowestZ } from './mass';

export type P2 = [number, number];

/** Every surface point within the tolerance of the ground, projected to XY. Null when a body has no display mesh to read. */
export function groundPoints(bodies: readonly BodyProjection[], groundZ: number, tolerance = GROUND_TOLERANCE_IN): P2[] | null {
	const out: P2[] = [];
	for (const b of bodies) {
		const p = b.mesh?.positions; if (!p || p.length < 3) return null;
		if (lowestZ(b) > groundZ + tolerance) continue;
		for (let i = 0; i < p.length; i += 3) if (p[i + 2] <= groundZ + tolerance) out.push([p[i], p[i + 1]]);
	}
	return out;
}

/** Andrew's monotone chain: the convex hull, counter-clockwise, with collinear points dropped. */
export function convexHull(points: readonly P2[]): P2[] {
	const key = (p: P2) => `${p[0].toFixed(9)},${p[1].toFixed(9)}`;
	const unique = [...new Map(points.map((p) => [key(p), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	if (unique.length < 3) return unique;
	const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower: P2[] = [], upper: P2[] = [];
	for (const p of unique) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop(); lower.push(p); }
	for (let i = unique.length - 1; i >= 0; i--) { const p = unique[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop(); upper.push(p); }
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function polygonArea(hull: readonly P2[]): number {
	let a = 0; for (let i = 0; i < hull.length; i++) { const p = hull[i], q = hull[(i + 1) % hull.length]; a += p[0] * q[1] - q[0] * p[1]; }
	return a / 2;
}

/** The eight compass words for an outward direction in XY, so "tips toward -X" names the side without a picture. */
const TOWARD = ['+X', '+X +Y', '+Y', '-X +Y', '-X', '-X -Y', '-Y', '+X -Y'];
export function towardWord(direction: P2): string {
	const angle = Math.atan2(direction[1], direction[0]), i = Math.round(angle / (Math.PI / 4));
	return TOWARD[((i % 8) + 8) % 8];
}

export interface TipEdge {
	a: P2; b: P2;
	/** Unit outward normal of the edge, in XY. */
	outward: P2;
	/** How far the CG's ground projection sits inside this edge, inches. Negative is outside. */
	inside: number;
	/** atan(inside / height), degrees. */
	angleDeg: number;
	toward: string;
}
export interface TipReport {
	/** `area` when the footprint has area to stand on; `line` or `point` when it does not. */
	footprint: 'area' | 'line' | 'point' | 'none';
	hull: P2[];
	edges: TipEdge[];
	/** The edge with the smallest angle: the way it tips first. Null when the footprint has no area. */
	least: TipEdge | null;
	/** False when the CG's ground projection is outside the footprint: it is already tipping. */
	stands: boolean;
	groundZ: number;
	height: number;
}

/** The tip angle about every footprint edge for a CG at `cg` over ground `groundZ`. */
export function tipOver(cg: Vec3, hull: readonly P2[], groundZ: number): TipReport {
	const height = cg[2] - groundZ, c: P2 = [cg[0], cg[1]];
	const footprint = hull.length === 0 ? 'none' : hull.length === 1 ? 'point' : hull.length === 2 || Math.abs(polygonArea(hull)) < 1e-9 ? 'line' : 'area';
	if (footprint !== 'area') return { footprint, hull: [...hull], edges: [], least: null, stands: false, groundZ, height };
	const edges: TipEdge[] = [];
	for (let i = 0; i < hull.length; i++) {
		const a = hull[i], b = hull[(i + 1) % hull.length], ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey);
		if (len < 1e-12) continue;
		/* Counter-clockwise hull: the interior is on the left of a to b, so the outward normal is the right-hand one. */
		const outward: P2 = [ey / len, -ex / len], inside = -((c[0] - a[0]) * outward[0] + (c[1] - a[1]) * outward[1]);
		edges.push({ a, b, outward, inside, angleDeg: (Math.atan2(inside, height) * 180) / Math.PI, toward: towardWord(outward) });
	}
	const least = edges.reduce<TipEdge | null>((m, e) => (!m || e.angleDeg < m.angleDeg ? e : m), null);
	return { footprint, hull: [...hull], edges, least, stands: edges.every((e) => e.inside >= 0), groundZ, height };
}

/** The whole reading for a model: the footprint from its bodies, then the angles. Null when the footprint cannot be read. */
export function tipReport(bodies: readonly BodyProjection[], cg: Vec3, groundZ: number): TipReport | null {
	const points = groundPoints(bodies, groundZ);
	return points ? tipOver(cg, convexHull(points), groundZ) : null;
}
