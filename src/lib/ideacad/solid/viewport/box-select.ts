/**
 * BOX SELECT, AS SOLIDWORKS DRAWS IT. A drag that starts on empty space draws
 * a rectangle, and its DIRECTION is the rule:
 *
 *   left to right  WINDOW    only what lies FULLY inside is picked (a solid
 *                            rectangle, labelled "Inside")
 *   right to left  CROSSING  anything the rectangle TOUCHES is picked (a
 *                            dashed rectangle, labelled "Touching")
 *
 * The label is the point: the direction is visible while the student drags,
 * so the rule is learned by looking rather than by reading.
 *
 * PURE AND OVER THE PROJECTION. Nothing here asks the kernel or the worker:
 * a face is its display triangles, an edge its sampled polyline, a vertex its
 * point, a body every triangle of its faces, each carried to the screen by the
 * `project` the caller hands in (the viewport's own `projectPoint`). So the
 * box costs one pass over the tessellation already on the main thread.
 *
 * THE BOUNDARY IS INSIDE. A point exactly on the rectangle's edge counts as
 * inside, for both modes, so an edge drawn along the rectangle's side is
 * picked by a window and touched by a crossing, and nothing depends on a
 * floating-point coin toss at the line.
 *
 * WHAT A STUDENT CANNOT SEE IS NOT PICKED, EXCEPT A WHOLE BODY. A face, an
 * edge or a vertex behind the front of the model is left alone (`visible`,
 * which the viewport answers with a depth test at a few sample points), so a
 * box around a block picks the edges on its near side and not the ones behind
 * it, which is what a fillet on "these edges" means. A BODY is chosen by its
 * extent: a box drawn around two parts picks both, even where one hides the
 * other, because the student drew the box around the part.
 */
import type { BodyProjection, ModelProjection, Selection, Vec3 } from '../types';

export type BoxMode = 'window' | 'crossing';
export type BoxKind = 'face' | 'edge' | 'vertex' | 'body';
export interface ScreenPoint { x: number; y: number }
export interface ScreenRect { left: number; top: number; right: number; bottom: number }
/** The word drawn on the rectangle, so its direction is visible. */
export const BOX_WORDS: Readonly<Record<BoxMode, string>> = { window: 'Inside', crossing: 'Touching' };
/** How far a press must travel before it is a box rather than a click, in CSS pixels. */
export const BOX_THRESHOLD_PX = 4;

/** Left to right is a window, right to left a crossing. A drag straight up or down reads as a window. */
export function boxMode(start: ScreenPoint, end: ScreenPoint): BoxMode { return end.x >= start.x ? 'window' : 'crossing'; }
/** The rectangle two corners span, in either order. */
export function boxRect(a: ScreenPoint, b: ScreenPoint): ScreenRect { return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) }; }
/** Inside or on the boundary. */
export const inRect = (p: ScreenPoint, r: ScreenRect) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;

/**
 * Whether a segment touches a rectangle, boundary included: Liang-Barsky
 * clipping, so an end inside, a crossing and a segment lying along a side all
 * answer true.
 */
export function segmentTouches(p: ScreenPoint, q: ScreenPoint, r: ScreenRect): boolean {
	const dx = q.x - p.x, dy = q.y - p.y;
	let t0 = 0, t1 = 1;
	for (const [den, num] of [[-dx, p.x - r.left], [dx, r.right - p.x], [-dy, p.y - r.top], [dy, r.bottom - p.y]] as [number, number][]) {
		if (den === 0) { if (num < 0) return false; continue; }
		const t = num / den;
		if (den < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
		else { if (t < t0) return false; if (t < t1) t1 = t; }
	}
	return t0 <= t1;
}
const side = (p: ScreenPoint, a: ScreenPoint, b: ScreenPoint) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
/** Whether a point is inside a triangle, edges included, whatever the winding. */
export function inTriangle(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): boolean {
	const d1 = side(p, a, b), d2 = side(p, b, c), d3 = side(p, c, a);
	return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
/** Whether a triangle touches a rectangle: one of its sides does, or the rectangle sits wholly inside it. */
export function triangleTouches(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, r: ScreenRect): boolean {
	return segmentTouches(a, b, r) || segmentTouches(b, c, r) || segmentTouches(c, a, r) || inTriangle({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }, a, b, c);
}

export interface BoxSelectOptions {
	/** A world point to screen pixels: the viewport's `projectPoint`. */
	project: (p: Vec3) => ScreenPoint;
	/** Whether an item on a body's surface can be seen at any of these points. Absent: everything is visible. Bodies never ask it. */
	visible?: (points: Vec3[]) => boolean;
	/** Bodies that are not drawn, and so cannot be picked. */
	hidden?: ReadonlySet<string>;
}
const at = (a: ArrayLike<number>, i: number): Vec3 => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
/** Up to `n` points spread along a list, ends included, for a depth test that does not test every sample. */
function spread<T>(list: readonly T[], n: number): T[] { if (list.length <= n) return [...list]; const out: T[] = []; for (let i = 0; i < n; i++) out.push(list[Math.round(i * (list.length - 1) / (n - 1))]); return out; }

/**
 * Where an edge's depth is tested: its midpoint and points a fifth of the way
 * in from each end, NEVER its ends. An end is a corner shared with the edges
 * of the faces on the far side, so a back edge's end on the silhouette would
 * read as seen and the edge behind the block would be picked.
 */
export function edgeSamples(points: Float32Array, mid: Vec3): Vec3[] {
	const n = points.length / 3; if (n < 2) return [mid];
	const lengths = [0]; for (let i = 1; i < n; i++) { const a = at(points, i - 1), b = at(points, i); lengths.push(lengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); }
	const total = lengths[n - 1]; if (total <= 0) return [mid];
	const along = (t: number): Vec3 => { const d = t * total; let i = 1; while (i < n - 1 && lengths[i] < d) i++; const a = at(points, i - 1), b = at(points, i), k = (d - lengths[i - 1]) / Math.max(lengths[i] - lengths[i - 1], 1e-12); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; };
	return [mid, along(0.2), along(0.35), along(0.65), along(0.8)];
}
/** The screen form of one face, its triangles, and the world points a depth test reads. */
function faceShape(face: BodyProjection['faces'][number], project: (p: Vec3) => ScreenPoint) {
	const count = face.positions.length / 3, screen: ScreenPoint[] = [];
	for (let i = 0; i < count; i++) screen.push(project(at(face.positions, i)));
	const tris: [number, number, number][] = [];
	for (let i = 0; i + 2 < face.indices.length; i += 3) tris.push([face.indices[i], face.indices[i + 1], face.indices[i + 2]]);
	const centroids = spread(tris, 6).map(([a, b, c]) => { const p = at(face.positions, a), q = at(face.positions, b), s = at(face.positions, c); return [(p[0] + q[0] + s[0]) / 3, (p[1] + q[1] + s[1]) / 3, (p[2] + q[2] + s[2]) / 3] as Vec3; });
	return { screen, tris, samples: [face.center, ...centroids] };
}
function faceIn(shape: ReturnType<typeof faceShape>, r: ScreenRect, mode: BoxMode): boolean {
	if (!shape.screen.length) return false;
	if (mode === 'window') return shape.screen.every((p) => inRect(p, r));
	return shape.tris.some(([a, b, c]) => triangleTouches(shape.screen[a], shape.screen[b], shape.screen[c], r)) || (!shape.tris.length && shape.screen.some((p) => inRect(p, r)));
}
function edgeIn(points: Float32Array, r: ScreenRect, mode: BoxMode, project: (p: Vec3) => ScreenPoint): boolean {
	const n = points.length / 3; if (!n) return false;
	const screen: ScreenPoint[] = []; for (let i = 0; i < n; i++) screen.push(project(at(points, i)));
	if (mode === 'window') return screen.every((p) => inRect(p, r));
	if (screen.length === 1) return inRect(screen[0], r);
	for (let i = 0; i + 1 < screen.length; i++) if (segmentTouches(screen[i], screen[i + 1], r)) return true;
	return false;
}

/**
 * What a box picks: selections in model order (bodies, then each body's faces,
 * edges and vertices), of the kinds asked for. `kinds` follows the active
 * tool, which the caller decides (`boxKinds`).
 */
export function boxSelect(model: Pick<ModelProjection, 'bodies'>, rect: ScreenRect, mode: BoxMode, kinds: readonly BoxKind[], o: BoxSelectOptions): Selection[] {
	const out: Selection[] = [];
	const seen = (p: Vec3[]) => (o.visible ? o.visible(p) : true);
	for (const body of model.bodies) {
		if (o.hidden?.has(body.id)) continue;
		const shapes = kinds.includes('face') || kinds.includes('body') ? body.faces.map((f) => faceShape(f, o.project)) : [];
		if (kinds.includes('body')) {
			const picked = mode === 'window' ? shapes.length > 0 && shapes.every((s) => s.screen.every((p) => inRect(p, rect))) : shapes.some((s) => faceIn(s, rect, 'crossing'));
			if (picked) out.push({ bodyId: body.id, kind: 'body', id: body.id });
		}
		if (kinds.includes('face')) body.faces.forEach((face, i) => { if (faceIn(shapes[i], rect, mode) && seen(shapes[i].samples)) out.push({ bodyId: body.id, kind: 'face', id: face.id }); });
		if (kinds.includes('edge')) for (const edge of body.edges) if (edgeIn(edge.points, rect, mode, o.project) && seen(edgeSamples(edge.points, edge.mid))) out.push({ bodyId: body.id, kind: 'edge', id: edge.id });
		if (kinds.includes('vertex')) for (const vertex of body.vertices) if (inRect(o.project(vertex.point), rect) && seen([vertex.point])) out.push({ bodyId: body.id, kind: 'vertex', id: vertex.id });
	}
	return out;
}
