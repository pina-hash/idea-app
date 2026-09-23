/**
 * SELECT LOOP: the edges around one face that join end to end with the edge a
 * student picked, as SolidWorks' Select Loop does. A face with a hole has two
 * loops (its outline and the hole's rim), and the one returned is the one the
 * picked edge is on.
 *
 * PURE AND OVER THE PROJECTION. `FaceProjection.edges` lists a face's edges
 * and each `EdgeProjection.points` is its sampled polyline, whose first and
 * last points are its ends; two edges of the face are joined when an end of
 * one meets an end of the other. A closed edge (a full circle) is a loop on
 * its own.
 */
import type { BodyProjection, EdgeProjection, Vec3 } from '../types';

/** How close two edge ends must be to count as one vertex, in inches: far inside any feature a student draws, far outside float noise in the sampled polylines. */
export const LOOP_JOIN_TOLERANCE = 1e-4;
const end = (e: EdgeProjection, last: boolean): Vec3 => { const i = last ? e.points.length - 3 : 0; return [e.points[i], e.points[i + 1], e.points[i + 2]]; };
const near = (a: Vec3, b: Vec3, tol: number) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tol;

/**
 * The loop on `faceId` that contains `edgeId`, in the order it was walked,
 * starting with `edgeId`. When `faceId` is absent or not one of the edge's two
 * faces, the edge's first face is used. An edge that is not on the body gives
 * an empty list.
 */
export function edgeLoop(body: Pick<BodyProjection, 'faces' | 'edges'>, edgeId: string, faceId?: string, tol = LOOP_JOIN_TOLERANCE): string[] {
	const edge = body.edges.find((e) => e.id === edgeId);
	if (!edge || edge.points.length < 3) return [];
	const face = body.faces.find((f) => f.id === (faceId && edge.faces.includes(faceId) ? faceId : edge.faces[0]));
	const onFace = (face?.edges ?? [edge.id]).map((id) => body.edges.find((e) => e.id === id)).filter((e): e is EdgeProjection => !!e && e.points.length >= 3);
	if (near(end(edge, false), end(edge, true), tol)) return [edge.id];
	const out = [edge.id], seen = new Set(out), queue = [edge];
	while (queue.length) {
		const e = queue.shift()!, ends = [end(e, false), end(e, true)];
		for (const g of onFace) {
			if (seen.has(g.id)) continue;
			const gEnds = [end(g, false), end(g, true)];
			if (!ends.some((p) => gEnds.some((q) => near(p, q, tol)))) continue;
			seen.add(g.id); out.push(g.id); queue.push(g);
		}
	}
	return out;
}
/** Which of an edge's two faces a loop should run around: the first of `preferred` that is one of them (the faces under the pointer, nearest first), else a flat one, else the first. */
export function loopFace(body: Pick<BodyProjection, 'faces' | 'edges'>, edgeId: string, preferred: readonly string[] = []): string | undefined {
	const edge = body.edges.find((e) => e.id === edgeId); if (!edge) return undefined;
	return preferred.find((f) => edge.faces.includes(f)) ?? edge.faces.find((f) => body.faces.find((x) => x.id === f)?.kind === 'plane') ?? edge.faces[0];
}
