/**
 * THE SKETCH EDITOR STATE MACHINE: what a press, a move and a release mean
 * while a sketch is open for editing, in the sketch's own 2D coordinates.
 * Pure: it takes plane coordinates and returns entity edits, so the viewport
 * only translates pointer events into (u, v) and draws what comes back.
 *
 * EVERY EDIT IS A NEW ENTITY LIST. Nothing here writes the document; an
 * operation takes a `SketchDraft` and returns the next one, and
 * `SketchEditor.svelte` hands that to `api.apply({type:'set-feature', ...})`
 * with the label the history row shows. A refusal is a thrown `Error` whose
 * message is a sentence for the student, which the panel shows through
 * `api.error` where every other refusal shows.
 *
 * THE GRAPH IS THE PROFILE (see `model.ts`), so every operation here is
 * written to keep points SHARED: a trim splits the curve it cut against so
 * both meet at one point, an extend lands on a point the target curve now
 * owns, a line chain that snaps to an existing point names that point rather
 * than making a twin, and a point dropped on another point JOINS them. A
 * sketch edited with these tools closes because its graph closes, not
 * because a coincident constraint was remembered.
 *
 * `SketchSession` is the pointer state machine: tool, selection, hover, the
 * anchors of a line chain or an arc, a drag in progress. It returns what to
 * commit and what to preview; drawing is `viewport/sketch-layer.ts`'s.
 */
import { newEntityId } from '../features';
import { pointOf, samples, isCurve, crossings, curveParam, curvePoint, rayHit, curveLength, TAU, type CurveEntity } from './model';
import type { SketchConstraint, SketchEntity, Vec2 } from '../types';

export interface SketchDraft { entities: SketchEntity[]; constraints: SketchConstraint[] }
export type SketchTool = 'select' | 'line' | 'rectangle' | 'circle' | 'arc' | 'polygon' | 'trim' | 'extend' | 'fillet' | 'dimension';
/** What the cursor is over, with the distance it was found at. */
export interface SketchPick { entity: string; kind: SketchEntity['type']; distance: number }

/** A rectangle from two corners: four shared points, four lines, and the horizontal/vertical constraints that keep it one. */
export function rectangleEntities(a: Vec2, b: Vec2): SketchDraft {
	const p = [newEntityId(), newEntityId(), newEntityId(), newEntityId()], l = [newEntityId(), newEntityId(), newEntityId(), newEntityId()];
	return {
		entities: [
			{ id: p[0], type: 'point', x: a[0], y: a[1] }, { id: p[1], type: 'point', x: b[0], y: a[1] }, { id: p[2], type: 'point', x: b[0], y: b[1] }, { id: p[3], type: 'point', x: a[0], y: b[1] },
			{ id: l[0], type: 'line', a: p[0], b: p[1] }, { id: l[1], type: 'line', a: p[1], b: p[2] }, { id: l[2], type: 'line', a: p[2], b: p[3] }, { id: l[3], type: 'line', a: p[3], b: p[0] }
		],
		constraints: [
			{ id: newEntityId(), type: 'horizontal', line: l[0] }, { id: newEntityId(), type: 'vertical', line: l[1] },
			{ id: newEntityId(), type: 'horizontal', line: l[2] }, { id: newEntityId(), type: 'vertical', line: l[3] }
		]
	};
}
export function circleEntities(center: Vec2, radius: number): SketchDraft {
	const c = newEntityId();
	return { entities: [{ id: c, type: 'point', x: center[0], y: center[1] }, { id: newEntityId(), type: 'circle', center: c, radius }], constraints: [] };
}
/** A regular polygon: `sides` shared points and lines, first corner at `first`. */
export function polygonEntities(center: Vec2, first: Vec2, sides: number): SketchDraft {
	const n = Math.max(3, Math.floor(sides)), r = Math.hypot(first[0] - center[0], first[1] - center[1]), a0 = Math.atan2(first[1] - center[1], first[0] - center[0]);
	const points = Array.from({ length: n }, (_, i) => ({ id: newEntityId(), type: 'point' as const, x: center[0] + r * Math.cos(a0 + i * Math.PI * 2 / n), y: center[1] + r * Math.sin(a0 + i * Math.PI * 2 / n) }));
	const lines = points.map((p, i) => ({ id: newEntityId(), type: 'line' as const, a: p.id, b: points[(i + 1) % n].id }));
	return { entities: [...points, ...lines], constraints: [] };
}
/** A closed polyline from ordered corners, sharing the first point when the last returns to it. */
export function polylineEntities(corners: Vec2[]): SketchDraft {
	const points = corners.map((c) => ({ id: newEntityId(), type: 'point' as const, x: c[0], y: c[1] }));
	const lines = points.map((p, i) => ({ id: newEntityId(), type: 'line' as const, a: p.id, b: points[(i + 1) % points.length].id }));
	return { entities: [...points, ...lines], constraints: [] };
}
/** An arc and its chord from a center, a start and an end direction. */
export function arcEntities(center: Vec2, start: Vec2, towards: Vec2): SketchDraft {
	const r = Math.hypot(start[0] - center[0], start[1] - center[1]), d = Math.hypot(towards[0] - center[0], towards[1] - center[1]) || 1;
	const end: Vec2 = [center[0] + (towards[0] - center[0]) * r / d, center[1] + (towards[1] - center[1]) * r / d];
	const c = newEntityId(), s = newEntityId(), e = newEntityId();
	return { entities: [{ id: c, type: 'point', x: center[0], y: center[1] }, { id: s, type: 'point', x: start[0], y: start[1] }, { id: e, type: 'point', x: end[0], y: end[1] }, { id: newEntityId(), type: 'arc', center: c, start: s, end: e }, { id: newEntityId(), type: 'line', a: e, b: s }], constraints: [] };
}
/** Merge a draft into a sketch's entity list. */
export function appendDraft(sketch: SketchDraft, draft: SketchDraft): SketchDraft {
	return { entities: [...sketch.entities, ...draft.entities], constraints: [...sketch.constraints, ...draft.constraints] };
}
/**
 * The nearest entity to a plane point within `radius`. A POINT WITHIN THE
 * RADIUS WINS OUTRIGHT over every curve: a press on a corner lies exactly on
 * both lines through it (distance zero) while the point carries the press's
 * own error, so no weight can make the corner win and a corner is what a
 * press there means (measured: a fillet press on a rectangle corner picked
 * "Line 2" under a 0.6 weight). Curves are compared among themselves only
 * when no point is in reach. `kinds` narrows what may be picked (a trim never
 * picks a point); the whole list is still needed to resolve a curve's points.
 */
export function pickEntity(entities: readonly SketchEntity[], at: Vec2, radius: number, kinds?: readonly SketchEntity['type'][]): SketchPick | null {
	let best: SketchPick | null = null;
	const consider = (entity: string, kind: SketchEntity['type'], distance: number) => { if (distance <= radius && (!best || distance < best.distance)) best = { entity, kind, distance }; };
	const allowed = (type: SketchEntity['type']) => !kinds || kinds.includes(type);
	if (allowed('point')) for (const e of entities) if (e.type === 'point') consider(e.id, 'point', Math.hypot(e.x - at[0], e.y - at[1]));
	if (best) return best;
	for (const e of entities) {
		if (!isCurve(e) || !allowed(e.type)) continue;
		if (e.type === 'circle') { const c = pointOf(entities, e.center); consider(e.id, 'circle', Math.abs(Math.hypot(at[0] - c[0], at[1] - c[1]) - e.radius)); continue; }
		const pts = samples(entities, e);
		let d = Infinity;
		for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segmentDistance(pts[i], pts[i + 1], at));
		consider(e.id, e.type, d);
	}
	return best;
}
export function segmentDistance(a: Vec2, b: Vec2, p: Vec2): number {
	const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
	const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
	return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}
/** Remove an entity and everything that names it (a line's points stay; a point takes its lines and arcs). */
export function removeEntity(sketch: SketchDraft, id: string): SketchDraft {
	const gone = new Set([id]);
	for (const e of sketch.entities) if (e.type !== 'point' && Object.values(e).some((v) => typeof v === 'string' && gone.has(v)) && e.id !== id && (e.type === 'line' ? e.a === id || e.b === id : e.type === 'circle' ? e.center === id : e.center === id || e.start === id || e.end === id)) gone.add(e.id);
	const entities = sketch.entities.filter((e) => !gone.has(e.id));
	const used = new Set<string>(); for (const e of entities) if (e.type !== 'point') for (const v of Object.values(e)) if (typeof v === 'string') used.add(v);
	const kept = entities.filter((e) => e.type !== 'point' || used.has(e.id) || e.fixed);
	const ids = new Set(kept.map((e) => e.id));
	return { entities: kept, constraints: sketch.constraints.filter((c) => Object.values(c).every((v) => typeof v !== 'string' || v === c.id || v === c.type || ids.has(v))) };
}

/* ---------------------------------------------------------- graph helpers */
const clone = (sketch: SketchDraft): SketchDraft => ({ entities: sketch.entities.map((e) => ({ ...e })), constraints: sketch.constraints.map((c) => ({ ...c })) });
const near = (a: Vec2, b: Vec2, tolerance: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;
/** The point ids a curve names, in the order it names them. A point names itself. */
export function entityPoints(entities: readonly SketchEntity[], id: string): string[] {
	const e = entities.find((x) => x.id === id);
	if (!e) return [];
	if (e.type === 'point') return [e.id];
	if (e.type === 'line') return [e.a, e.b];
	if (e.type === 'circle') return [e.center];
	return [e.center, e.start, e.end];
}
/** The curves that name a point. */
export const pointUsers = (entities: readonly SketchEntity[], pointId: string): CurveEntity[] => entities.filter(isCurve).filter((c) => entityPoints(entities, c.id).includes(pointId));
/** "Line 2", "Circle 1": the ordinal of an entity among those of its type, so a panel can name what an id cannot. */
export function entityLabel(entities: readonly SketchEntity[], id: string): string {
	const e = entities.find((x) => x.id === id); if (!e) return 'Entity';
	const word = { point: 'Point', line: 'Line', circle: 'Circle', arc: 'Arc' }[e.type];
	return `${word} ${entities.filter((x) => x.type === e.type).indexOf(e) + 1}`;
}
/** Drop points nothing names (fixed ones stay, as `removeEntity` keeps them) and constraints naming anything gone. */
export function pruneDraft(sketch: SketchDraft): SketchDraft {
	const used = new Set<string>(); for (const e of sketch.entities) if (e.type !== 'point') for (const id of entityPoints(sketch.entities, e.id)) used.add(id);
	const entities = sketch.entities.filter((e) => e.type !== 'point' || used.has(e.id) || e.fixed);
	const ids = new Set(entities.map((e) => e.id));
	return { entities, constraints: sketch.constraints.filter((c) => Object.values(c).every((v) => typeof v !== 'string' || v === c.id || v === c.type || ids.has(v))) };
}
/** A point at `at`: an existing one within `tolerance` is reused, so two curves meeting there share it; otherwise a new one is appended. */
export function ensurePoint(sketch: SketchDraft, at: Vec2, tolerance = 1e-6): { sketch: SketchDraft; id: string; created: boolean } {
	const existing = sketch.entities.find((e) => e.type === 'point' && near([e.x, e.y], at, tolerance));
	if (existing) return { sketch, id: existing.id, created: false };
	const id = newEntityId();
	return { sketch: { entities: [...sketch.entities, { id, type: 'point', x: at[0], y: at[1] }], constraints: sketch.constraints }, id, created: true };
}
/** The horizontal/vertical constraints on a line, re-keyed onto another line: what a split piece inherits. */
const inheritedConstraints = (constraints: readonly SketchConstraint[], from: string, to: string): SketchConstraint[] =>
	constraints.filter((c) => (c.type === 'horizontal' || c.type === 'vertical') && c.line === from).map((c) => ({ ...c, id: newEntityId(), line: to }));
/** A circle that became an arc keeps its id, so `equalRadius`/`concentric` still resolve; the two circle-only kinds are re-spelled for an arc. */
const circleConstraintsToArc = (constraints: readonly SketchConstraint[], id: string): SketchConstraint[] =>
	constraints.map((c) => c.type === 'circleRadius' && c.circle === id ? { id: c.id, type: 'arcRadius', arc: id, value: c.value } : c.type === 'pointOnCircle' && c.circle === id ? { id: c.id, type: 'pointOnArc', point: c.point, arc: id } : c);
/**
 * Split curves at points that lie on them, so what crosses there now MEETS
 * there. A line or an arc becomes consecutive pieces sharing the split
 * points; a circle with two or more split points becomes that many arcs and
 * a circle with one is left whole (an arc from a point to itself is not a
 * shape the kernel takes). The first piece keeps the curve's id and every
 * constraint on it; a horizontal or vertical is copied onto the other pieces.
 */
export function splitCurves(sketch: SketchDraft, splits: ReadonlyMap<string, readonly string[]>, eps = 1e-7): SketchDraft {
	let next = clone(sketch);
	for (const [curveId, pointIds] of splits) {
		const curve = next.entities.find((e) => e.id === curveId);
		if (!curve || !isCurve(curve)) continue;
		const params = [...new Set(pointIds)].map((pid) => ({ pid, t: curveParam(next.entities, curve, pointOf(next.entities, pid)) }))
			.filter(({ t }) => curve.type === 'circle' || (t > eps && t < 1 - eps)).sort((a, b) => a.t - b.t)
			.filter((p, i, all) => i === 0 || p.t - all[i - 1].t > eps);
		if (!params.length || (curve.type === 'circle' && params.length < 2)) continue;
		const pieces: CurveEntity[] = [], extra: SketchConstraint[] = [];
		if (curve.type === 'line') {
			const stops = [curve.a, ...params.map((p) => p.pid), curve.b];
			for (let i = 0; i < stops.length - 1; i++) pieces.push({ ...curve, id: i === 0 ? curve.id : newEntityId(), a: stops[i], b: stops[i + 1] });
		} else if (curve.type === 'arc') {
			const stops = [curve.start, ...params.map((p) => p.pid), curve.end];
			for (let i = 0; i < stops.length - 1; i++) pieces.push({ ...curve, id: i === 0 ? curve.id : newEntityId(), start: stops[i], end: stops[i + 1] });
		} else {
			const stops = params.map((p) => p.pid);
			for (let i = 0; i < stops.length; i++) pieces.push({ id: i === 0 ? curve.id : newEntityId(), type: 'arc', center: curve.center, start: stops[i], end: stops[(i + 1) % stops.length], ...(curve.construction ? { construction: true } : {}) });
			next.constraints = circleConstraintsToArc(next.constraints, curve.id);
		}
		for (const piece of pieces.slice(1)) extra.push(...inheritedConstraints(next.constraints, curve.id, piece.id));
		const index = next.entities.indexOf(curve);
		next = { entities: [...next.entities.slice(0, index), ...pieces, ...next.entities.slice(index + 1)], constraints: [...next.constraints, ...extra] };
	}
	return next;
}
/** The crossings of a curve, grouped by parameter so one cut point splits every curve that passes through it. */
function cutStops(entities: readonly SketchEntity[], curve: CurveEntity, eps = 1e-7): { t: number; point: Vec2; others: { id: string; t: number }[] }[] {
	const stops: { t: number; point: Vec2; others: { id: string; t: number }[] }[] = [];
	for (const c of crossings(entities, curve, eps)) {
		if (curve.type !== 'circle' && (c.t <= eps || c.t >= 1 - eps)) continue;
		const stop = stops.find((s) => Math.abs(s.t - c.t) <= 1e-6);
		if (stop) stop.others.push({ id: c.other, t: c.tOther }); else stops.push({ t: c.t, point: c.point, others: [{ id: c.other, t: c.tOther }] });
	}
	return stops;
}
/**
 * TRIM: remove the part of a curve between the two crossings either side of
 * `at` (or up to the curve's own end when there is no crossing that way).
 * A curve crossed nowhere is removed whole. A circle keeps its id as the arc
 * that remains. The curves that were crossed are SPLIT at the cut points so
 * the sketch meets there, which is what makes the region graph close.
 */
export function trimEntity(sketch: SketchDraft, id: string, at: Vec2, tolerance = 1e-6): SketchDraft {
	const curve = sketch.entities.find((e) => e.id === id);
	if (!curve || !isCurve(curve)) throw Error('Click the part of a line, arc or circle to remove.');
	const stops = cutStops(sketch.entities, curve), t0 = curveParam(sketch.entities, curve, at);
	if (!stops.length) return removeEntity(sketch, id);
	let lower: typeof stops[number] | null = null, upper: typeof stops[number] | null = null;
	if (curve.type === 'circle') {
		for (const s of stops) { if (s.t < t0 && (!lower || s.t > lower.t)) lower = s; if (s.t > t0 && (!upper || s.t < upper.t)) upper = s; }
		if (!lower) lower = stops.reduce((a, b) => (b.t > a.t ? b : a)); if (!upper) upper = stops.reduce((a, b) => (b.t < a.t ? b : a));
		if (lower === upper) return removeEntity(sketch, id);
	} else {
		for (const s of stops) { if (s.t < t0 && (!lower || s.t > lower.t)) lower = s; if (s.t > t0 && (!upper || s.t < upper.t)) upper = s; }
		if (!lower && !upper) return removeEntity(sketch, id);
	}
	let next = clone(sketch);
	const splits = new Map<string, string[]>();
	const cutPoint = (stop: typeof stops[number]) => { const made = ensurePoint(next, stop.point, tolerance); next = made.sketch; for (const o of stop.others) splits.set(o.id, [...(splits.get(o.id) ?? []), made.id]); return made.id; };
	const pl = lower ? cutPoint(lower) : null, pu = upper ? cutPoint(upper) : null;
	const index = next.entities.findIndex((e) => e.id === id), current = next.entities[index] as CurveEntity;
	if (current.type === 'circle') {
		next.entities[index] = { id: current.id, type: 'arc', center: current.center, start: pu!, end: pl!, ...(current.construction ? { construction: true } : {}) };
		next.constraints = circleConstraintsToArc(next.constraints, current.id);
	} else if (current.type === 'line') {
		if (pl && pu) { const second: CurveEntity = { ...current, id: newEntityId(), a: pu, b: current.b }; next.entities.splice(index + 1, 0, second); next.constraints.push(...inheritedConstraints(next.constraints, current.id, second.id)); next.entities[index] = { ...current, b: pl }; }
		else if (pl) next.entities[index] = { ...current, b: pl };
		else next.entities[index] = { ...current, a: pu! };
	} else {
		if (pl && pu) { const second: CurveEntity = { ...current, id: newEntityId(), start: pu, end: current.end }; next.entities.splice(index + 1, 0, second); next.entities[index] = { ...current, end: pl }; }
		else if (pl) next.entities[index] = { ...current, end: pl };
		else next.entities[index] = { ...current, start: pu! };
	}
	return pruneDraft(splitCurves(next, splits));
}
/**
 * EXTEND: a line's nearer end runs on along its own direction to the first
 * curve it meets, and that curve is split there so the two share the point.
 * The end point moves when this line alone names it, so a corner shared with
 * another line is not dragged; a new point takes its place instead.
 */
export function extendEntity(sketch: SketchDraft, id: string, at: Vec2, tolerance = 1e-6): SketchDraft {
	const line = sketch.entities.find((e) => e.id === id);
	if (!line || line.type !== 'line') throw Error('Only a line can be extended. Click a line near the end to extend.');
	const a = pointOf(sketch.entities, line.a), b = pointOf(sketch.entities, line.b);
	const fromB = Math.hypot(at[0] - b[0], at[1] - b[1]) < Math.hypot(at[0] - a[0], at[1] - a[1]);
	const end = fromB ? line.b : line.a, from = fromB ? b : a, back = fromB ? a : b;
	const hit = rayHit(sketch.entities, from, [from[0] - back[0], from[1] - back[1]], id);
	if (!hit) throw Error('Nothing lies ahead of this line to extend to. Draw what it should meet first.');
	let next = clone(sketch);
	const shared = pointUsers(next.entities, end).length > 1;
	const existing = next.entities.find((e) => e.type === 'point' && e.id !== end && near([e.x, e.y], hit.point, tolerance));
	let landed: string;
	if (existing) landed = existing.id;
	else if (!shared) { const p = next.entities.find((e) => e.id === end) as Extract<SketchEntity, { type: 'point' }>; p.x = hit.point[0]; p.y = hit.point[1]; landed = end; }
	else { const made = ensurePoint(next, hit.point, tolerance); next = made.sketch; landed = made.id; }
	if (landed !== end) { const index = next.entities.findIndex((e) => e.id === id); next.entities[index] = { ...line, ...(fromB ? { b: landed } : { a: landed }) }; }
	return pruneDraft(splitCurves(next, new Map([[hit.other, [landed]]])));
}
/**
 * CORNER FILLET: two lines meeting at a point become two shortened lines and
 * an arc tangent to both. The tangency is recorded as two `tangentLineArc`
 * constraints, so a dimension changed later keeps the corner round.
 */
export function filletCorner(sketch: SketchDraft, first: string, second: string, radius: number): SketchDraft {
	const l1 = sketch.entities.find((e) => e.id === first), l2 = sketch.entities.find((e) => e.id === second);
	if (!l1 || !l2 || l1.type !== 'line' || l2.type !== 'line' || l1.id === l2.id) throw Error('Pick two lines that meet at a corner.');
	if (!(Number.isFinite(radius) && radius > 0)) throw Error('Enter a fillet radius greater than zero.');
	const corner = [l1.a, l1.b].find((p) => p === l2.a || p === l2.b);
	if (!corner) throw Error('Pick two lines that meet at a corner.');
	const P = pointOf(sketch.entities, corner), A = pointOf(sketch.entities, l1.a === corner ? l1.b : l1.a), B = pointOf(sketch.entities, l2.a === corner ? l2.b : l2.a);
	const la = Math.hypot(A[0] - P[0], A[1] - P[1]), lb = Math.hypot(B[0] - P[0], B[1] - P[1]);
	const dA: Vec2 = [(A[0] - P[0]) / la, (A[1] - P[1]) / la], dB: Vec2 = [(B[0] - P[0]) / lb, (B[1] - P[1]) / lb];
	const theta = Math.acos(Math.max(-1, Math.min(1, dA[0] * dB[0] + dA[1] * dB[1])));
	if (theta < 1e-6 || Math.PI - theta < 1e-6) throw Error('These lines lie along one another, so there is no corner to round.');
	const d = radius / Math.tan(theta / 2);
	if (d > la + 1e-9 || d > lb + 1e-9) throw Error('The fillet radius is larger than the lines allow. Use a smaller radius.');
	const TA: Vec2 = [P[0] + dA[0] * d, P[1] + dA[1] * d], TB: Vec2 = [P[0] + dB[0] * d, P[1] + dB[1] * d];
	const bis: Vec2 = [dA[0] + dB[0], dA[1] + dB[1]], bn = Math.hypot(bis[0], bis[1]), h = radius / Math.sin(theta / 2);
	const C: Vec2 = [P[0] + bis[0] / bn * h, P[1] + bis[1] / bn * h];
	const ccw = (TA[0] - C[0]) * (TB[1] - C[1]) - (TA[1] - C[1]) * (TB[0] - C[0]) > 0;
	const ta = newEntityId(), tb = newEntityId(), c = newEntityId(), arc = newEntityId();
	const next = clone(sketch);
	next.entities.push({ id: c, type: 'point', x: C[0], y: C[1] }, { id: ta, type: 'point', x: TA[0], y: TA[1] }, { id: tb, type: 'point', x: TB[0], y: TB[1] }, { id: arc, type: 'arc', center: c, start: ccw ? ta : tb, end: ccw ? tb : ta });
	const swap = (line: Extract<SketchEntity, { type: 'line' }>, to: string) => { const i = next.entities.findIndex((e) => e.id === line.id); next.entities[i] = { ...line, a: line.a === corner ? to : line.a, b: line.b === corner ? to : line.b }; };
	swap(l1, ta); swap(l2, tb);
	next.constraints.push({ id: newEntityId(), type: 'tangentLineArc', line: l1.id, arc, point: ta }, { id: newEntityId(), type: 'tangentLineArc', line: l2.id, arc, point: tb });
	return pruneDraft(next);
}
/** JOIN: everything naming `from` names `to` instead, and `from` goes. Refused when a curve would then start and end at one point. */
export function joinPoints(sketch: SketchDraft, from: string, to: string): SketchDraft {
	if (from === to) return sketch;
	const rename = (id: string) => (id === from ? to : id);
	const entities = sketch.entities.filter((e) => e.id !== from).map((e): SketchEntity => e.type === 'line' ? { ...e, a: rename(e.a), b: rename(e.b) } : e.type === 'circle' ? { ...e, center: rename(e.center) } : e.type === 'arc' ? { ...e, center: rename(e.center), start: rename(e.start), end: rename(e.end) } : e);
	for (const e of entities) {
		if (e.type === 'line' && e.a === e.b) throw Error('A line cannot start and end at the same point. Delete it instead of joining its ends.');
		if (e.type === 'arc' && (e.start === e.end || e.center === e.start || e.center === e.end)) throw Error('An arc cannot start, end and center on one point.');
	}
	const constraints = sketch.constraints.map((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, k !== 'id' && k !== 'type' && typeof v === 'string' ? rename(v) : v])) as SketchConstraint)
		.filter((c) => !(('a' in c && 'b' in c && c.a === c.b) || (c.type === 'symmetric' && c.a === c.b)));
	return pruneDraft({ entities, constraints });
}
/** MOVE: points at new positions. A fixed point is refused before any drag starts, so this never sees one. */
export function movePoints(sketch: SketchDraft, moves: ReadonlyMap<string, Vec2>): SketchDraft {
	return { entities: sketch.entities.map((e) => { const to = e.type === 'point' ? moves.get(e.id) : undefined; return to ? { ...e, x: to[0], y: to[1] } : e; }), constraints: sketch.constraints };
}

/* ------------------------------------------------------------- snapping */
export type SnapKind = 'point' | 'origin' | 'horizontal' | 'vertical' | 'none';
export interface Snap { at: Vec2; kind: SnapKind; point?: string; reference?: Vec2 }
export interface SnapContext { entities: readonly SketchEntity[]; radius: number; exclude?: ReadonlySet<string>; reference?: Vec2 | null }
/**
 * Where a press or a drag lands: on an existing point within the radius
 * (which the caller then SHARES), on the origin, level or plumb with the
 * reference point, or where the pointer is. Points win over the origin and
 * the origin over an alignment, so the smallest target is always reachable.
 */
export function snapPoint(at: Vec2, ctx: SnapContext): Snap {
	let best: { id: string; d: number } | null = null;
	for (const e of ctx.entities) {
		if (e.type !== 'point' || ctx.exclude?.has(e.id)) continue;
		const d = Math.hypot(e.x - at[0], e.y - at[1]);
		if (d <= ctx.radius && (!best || d < best.d)) best = { id: e.id, d };
	}
	if (best) { const p = pointOf(ctx.entities, best.id); return { at: p, kind: 'point', point: best.id }; }
	if (Math.hypot(at[0], at[1]) <= ctx.radius) return { at: [0, 0], kind: 'origin' };
	if (ctx.reference) {
		const du = Math.abs(at[0] - ctx.reference[0]), dv = Math.abs(at[1] - ctx.reference[1]);
		if (dv <= ctx.radius && dv <= du) return { at: [at[0], ctx.reference[1]], kind: 'horizontal', reference: ctx.reference };
		if (du <= ctx.radius) return { at: [ctx.reference[0], at[1]], kind: 'vertical', reference: ctx.reference };
	}
	return { at, kind: 'none' };
}

/* --------------------------------------------------------- chain drafts */
/** One corner of a line chain or an arc: where it landed and, when it snapped to an existing point, which point it IS. */
export interface Anchor { at: Vec2; point?: string; kind: SnapKind }
/** A line chain through anchors: new points where none was shared, one line per step, and a horizontal/vertical constraint where a step snapped level or plumb. Closed chains return to the first anchor. */
export function chainDraft(anchors: readonly Anchor[], closed: boolean): SketchDraft {
	const entities: SketchEntity[] = [], constraints: SketchConstraint[] = [];
	const ids = anchors.map((a) => { if (a.point) return a.point; const id = newEntityId(); entities.push({ id, type: 'point', x: a.at[0], y: a.at[1] }); return id; });
	const steps = closed ? anchors.length : anchors.length - 1;
	for (let i = 0; i < steps; i++) {
		const a = ids[i], b = ids[(i + 1) % ids.length]; if (a === b) continue;
		const id = newEntityId(); entities.push({ id, type: 'line', a, b });
		const kind = closed && i === steps - 1 ? 'none' : anchors[i + 1].kind;
		if (kind === 'horizontal' || kind === 'vertical') constraints.push({ id: newEntityId(), type: kind, line: id });
	}
	return { entities, constraints };
}
/** An arc alone (no chord: inside a sketch an arc connects through its points) from a center anchor, a start anchor and the direction of the end. */
export function arcDraft(center: Anchor, start: Anchor, towards: Anchor): SketchDraft {
	const r = Math.hypot(start.at[0] - center.at[0], start.at[1] - center.at[1]), d = Math.hypot(towards.at[0] - center.at[0], towards.at[1] - center.at[1]) || 1;
	const end: Vec2 = towards.point ? towards.at : [center.at[0] + (towards.at[0] - center.at[0]) * r / d, center.at[1] + (towards.at[1] - center.at[1]) * r / d];
	const entities: SketchEntity[] = [];
	const id = (a: Anchor, at: Vec2) => { if (a.point) return a.point; const pid = newEntityId(); entities.push({ id: pid, type: 'point', x: at[0], y: at[1] }); return pid; };
	const c = id(center, center.at), s = id(start, start.at), e = id(towards, end);
	entities.push({ id: newEntityId(), type: 'arc', center: c, start: s, end: e });
	return { entities, constraints: [] };
}
/** A draft whose one point `from` is replaced by the sketch's existing point `to`: how a drag-drawn circle centers on a corner that is already there. */
export function sharePoint(draft: SketchDraft, from: string, to: string): SketchDraft {
	const rename = (id: string) => (id === from ? to : id);
	return { entities: draft.entities.filter((e) => e.id !== from).map((e): SketchEntity => e.type === 'line' ? { ...e, a: rename(e.a), b: rename(e.b) } : e.type === 'circle' ? { ...e, center: rename(e.center) } : e.type === 'arc' ? { ...e, center: rename(e.center), start: rename(e.start), end: rename(e.end) } : e), constraints: draft.constraints };
}

/* ------------------------------------------------- constraint offers */
export interface ConstraintOffer {
	key: string; label: string;
	/** The number the offer starts from, for one that carries a value. Absent for a relation. */
	value?: number; unit?: 'in' | 'deg';
	/** The constraints to add; `value` is ignored by a relation. `structural` offers rewrite the graph instead (Join points). */
	build(value?: number): SketchConstraint[];
}
const CONSTRAINT_WORDS: Record<SketchConstraint['type'], string> = {
	coincident: 'Coincident', distance: 'Distance', pointLineDistance: 'Distance to line', horizontal: 'Horizontal', vertical: 'Vertical', angle: 'Angle', parallel: 'Parallel', perpendicular: 'Perpendicular',
	equalLength: 'Equal length', circleRadius: 'Radius', arcRadius: 'Radius', equalRadius: 'Equal radius', pointOnCircle: 'Point on circle', pointOnArc: 'Point on arc', tangentLineArc: 'Tangent', tangentArcArc: 'Tangent',
	concentric: 'Concentric', midpoint: 'Midpoint', symmetric: 'Symmetric', fixX: 'Fix X', fixY: 'Fix Y'
};
/** The word for a constraint and the entities it names, for a list row. */
export function constraintLabel(entities: readonly SketchEntity[], c: SketchConstraint): { word: string; names: string; value?: number; unit?: 'in' | 'deg' } {
	const names = Object.entries(c).filter(([k, v]) => k !== 'id' && k !== 'type' && typeof v === 'string').map(([, v]) => entityLabel(entities, v as string)).join(', ');
	return { word: CONSTRAINT_WORDS[c.type], names, ...('value' in c ? { value: c.value, unit: c.type === 'angle' ? 'deg' as const : 'in' as const } : {}) };
}
const lineAngle = (entities: readonly SketchEntity[], l: Extract<SketchEntity, { type: 'line' }>) => { const a = pointOf(entities, l.a), b = pointOf(entities, l.b); return Math.atan2(b[1] - a[1], b[0] - a[0]); };
const radiusOf = (entities: readonly SketchEntity[], e: CurveEntity) => e.type === 'circle' ? e.radius : e.type === 'arc' ? Math.hypot(...([pointOf(entities, e.start)[0] - pointOf(entities, e.center)[0], pointOf(entities, e.start)[1] - pointOf(entities, e.center)[1]] as Vec2)) : 0;
/**
 * What can be constrained from what is selected. Each offer is one button in
 * the panel; those with a `value` also get an input seeded with the measured
 * number, which the student may change to anything finite -- the solver is
 * the only thing that refuses a value.
 */
export function constraintOffers(entities: readonly SketchEntity[], selected: readonly string[]): ConstraintOffer[] {
	const picked = selected.map((id) => entities.find((e) => e.id === id)).filter((e): e is SketchEntity => !!e);
	const kinds = picked.map((e) => e.type).sort().join('+');
	const out: ConstraintOffer[] = [];
	const id = () => newEntityId();
	const distance = (a: string, b: string, value: number) => out.push({ key: 'distance', label: 'Distance', value, unit: 'in', build: (v) => [{ id: id(), type: 'distance', a, b, value: v ?? value }] });
	if (kinds === 'line') {
		const l = picked[0] as Extract<SketchEntity, { type: 'line' }>;
		out.push({ key: 'horizontal', label: 'Horizontal', build: () => [{ id: id(), type: 'horizontal', line: l.id }] }, { key: 'vertical', label: 'Vertical', build: () => [{ id: id(), type: 'vertical', line: l.id }] });
		distance(l.a, l.b, curveLength(entities, l));
	} else if (kinds === 'point') {
		const p = picked[0] as Extract<SketchEntity, { type: 'point' }>;
		out.push({ key: 'fix', label: 'Fix in place', build: () => [{ id: id(), type: 'fixX', point: p.id, value: p.x }, { id: id(), type: 'fixY', point: p.id, value: p.y }] });
	} else if (kinds === 'point+point') {
		const [a, b] = picked as Extract<SketchEntity, { type: 'point' }>[];
		distance(a.id, b.id, Math.hypot(b.x - a.x, b.y - a.y));
	} else if (kinds === 'circle' || kinds === 'arc') {
		const c = picked[0] as CurveEntity;
		out.push({ key: 'radius', label: 'Radius', value: radiusOf(entities, c), unit: 'in', build: (v) => [c.type === 'circle' ? { id: id(), type: 'circleRadius', circle: c.id, value: v ?? radiusOf(entities, c) } : { id: id(), type: 'arcRadius', arc: c.id, value: v ?? radiusOf(entities, c) }] });
	} else if (kinds === 'line+line') {
		const [l1, l2] = picked as Extract<SketchEntity, { type: 'line' }>[];
		const angle = ((lineAngle(entities, l2) - lineAngle(entities, l1)) * 180 / Math.PI + 360) % 360;
		out.push({ key: 'parallel', label: 'Parallel', build: () => [{ id: id(), type: 'parallel', l1: l1.id, l2: l2.id }] }, { key: 'perpendicular', label: 'Perpendicular', build: () => [{ id: id(), type: 'perpendicular', l1: l1.id, l2: l2.id }] }, { key: 'equal', label: 'Equal length', build: () => [{ id: id(), type: 'equalLength', l1: l1.id, l2: l2.id }] }, { key: 'angle', label: 'Angle', value: angle, unit: 'deg', build: (v) => [{ id: id(), type: 'angle', l1: l1.id, l2: l2.id, value: v ?? angle }] });
	} else if (kinds === 'arc+arc' || kinds === 'circle+circle' || kinds === 'arc+circle') {
		const [a, b] = picked as CurveEntity[];
		out.push({ key: 'equalRadius', label: 'Equal radius', build: () => [{ id: id(), type: 'equalRadius', a: a.id, b: b.id }] }, { key: 'concentric', label: 'Concentric', build: () => [{ id: id(), type: 'concentric', a: a.id, b: b.id }] });
	} else if (kinds === 'line+point') {
		const p = picked.find((e) => e.type === 'point') as Extract<SketchEntity, { type: 'point' }>, l = picked.find((e) => e.type === 'line') as Extract<SketchEntity, { type: 'line' }>;
		const a = pointOf(entities, l.a), b = pointOf(entities, l.b), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
		const gap = Math.abs((b[0] - a[0]) * (a[1] - p.y) - (a[0] - p.x) * (b[1] - a[1])) / len;
		out.push({ key: 'midpoint', label: 'Midpoint', build: () => [{ id: id(), type: 'midpoint', point: p.id, line: l.id }] }, { key: 'pointLineDistance', label: 'Distance to line', value: gap, unit: 'in', build: (v) => [{ id: id(), type: 'pointLineDistance', point: p.id, line: l.id, value: v ?? gap }] });
	} else if (kinds === 'circle+point' || kinds === 'arc+point') {
		const p = picked.find((e) => e.type === 'point') as Extract<SketchEntity, { type: 'point' }>, c = picked.find((e) => e.type !== 'point') as CurveEntity;
		out.push({ key: 'on', label: c.type === 'circle' ? 'Point on circle' : 'Point on arc', build: () => [c.type === 'circle' ? { id: id(), type: 'pointOnCircle', point: p.id, circle: c.id } : { id: id(), type: 'pointOnArc', point: p.id, arc: c.id }] });
	}
	return out;
}

/* -------------------------------------------------------------- session */
export interface SessionContext {
	entities: readonly SketchEntity[]; constraints: readonly SketchConstraint[];
	/** Pick tolerance and snap radius, in sketch inches (the panel converts from pixels). */
	tolerance: number; snapRadius: number;
	polygonSides: number; filletRadius: number;
	shift?: boolean; canWrite: boolean;
}
export interface Commit { label: string; sketch: SketchDraft }
export interface SessionResult { changed: boolean; commit?: Commit; error?: string }
/** What the layer draws over the sketch for the state the session is in. */
/** `moved` is the WHOLE entity list with the drag applied plus the ids of the curves that moved: a curve's points have to be in the list handed to `samples`. */
export interface SessionPreview { polylines: Vec2[][]; snap: Snap | null; moved: { entities: SketchEntity[]; curves: string[] } | null; anchors: Vec2[] }
interface Drag { origin: Vec2; points: string[]; single: string | null; from: Map<string, Vec2>; current: Map<string, Vec2>; moved: boolean; snap: Snap | null }
const CURVE_KINDS: readonly SketchEntity['type'][] = ['line', 'circle', 'arc'];
const circleOutline = (c: Vec2, r: number, n = 64): Vec2[] => Array.from({ length: n + 1 }, (_, i) => [c[0] + r * Math.cos(i / n * TAU), c[1] + r * Math.sin(i / n * TAU)] as Vec2);
export class SketchSession {
	tool: SketchTool = 'select';
	selected: string[] = [];
	hovered: string | null = null;
	/** The line picked first for a fillet, waiting for its partner. */
	pendingFillet: string | null = null;
	private anchors: Anchor[] = [];
	private dragFrom: Anchor | null = null;
	private cursor: Snap | null = null;
	private drag: Drag | null = null;
	get anchorCount() { return this.anchors.length; }
	get drawing() { return this.anchors.length > 0 || !!this.dragFrom; }
	get dragging() { return !!this.drag?.moved; }
	setTool(tool: SketchTool) { if (tool !== this.tool) { this.tool = tool; this.anchors = []; this.dragFrom = null; this.drag = null; this.pendingFillet = null; this.cursor = null; } }
	private snapAt(at: Vec2, ctx: SessionContext, reference: Vec2 | null = null, exclude?: ReadonlySet<string>): Snap { return snapPoint(at, { entities: ctx.entities, radius: ctx.snapRadius, reference, exclude }); }
	private draft = (sketch: SketchDraft, ctx: SessionContext) => appendDraft({ entities: [...ctx.entities], constraints: [...ctx.constraints] }, sketch);
	private current = (ctx: SessionContext): SketchDraft => ({ entities: [...ctx.entities], constraints: [...ctx.constraints] });
	private refuse = (error: string): SessionResult => ({ changed: true, error });
	down(at: Vec2, ctx: SessionContext): SessionResult {
		const tool = this.tool;
		if (tool === 'select' || tool === 'dimension') {
			const pick = pickEntity(ctx.entities, at, ctx.tolerance);
			if (!pick) { this.selected = ctx.shift ? this.selected : []; this.drag = null; return { changed: true }; }
			if (ctx.shift) this.selected = this.selected.includes(pick.entity) ? this.selected.filter((id) => id !== pick.entity) : [...this.selected, pick.entity];
			else if (!this.selected.includes(pick.entity)) this.selected = [pick.entity];
			if (!ctx.canWrite || ctx.shift) return { changed: true };
			const points = entityPoints(ctx.entities, pick.entity);
			const fixed = points.map((id) => ctx.entities.find((e) => e.id === id)).find((p) => p?.type === 'point' && p.fixed);
			if (fixed) return { changed: true, error: `${entityLabel(ctx.entities, fixed.id)} is fixed in place. Remove its Fix constraint to move it.` };
			const from = new Map(points.map((id) => [id, pointOf(ctx.entities, id)]));
			this.drag = { origin: at, points, single: pick.kind === 'point' ? pick.entity : null, from, current: new Map(from), moved: false, snap: null };
			return { changed: true };
		}
		if (!ctx.canWrite) return this.refuse('This document is read-only.');
		if (tool === 'line') {
			const reference = this.anchors.length ? this.anchors[this.anchors.length - 1].at : null;
			const snap = this.snapAt(at, ctx, reference);
			const anchor: Anchor = { at: snap.at, point: snap.point, kind: snap.kind };
			const first = this.anchors[0];
			if (first && this.anchors.length >= 2 && ((first.point && first.point === anchor.point) || (!first.point && near(first.at, anchor.at, ctx.snapRadius)))) return this.finishChain(ctx, true);
			const last = this.anchors[this.anchors.length - 1];
			if (last && ((last.point && last.point === anchor.point) || near(last.at, anchor.at, 1e-9))) return { changed: false };
			this.anchors.push(anchor);
			return { changed: true };
		}
		if (tool === 'arc') {
			const snap = this.snapAt(at, ctx, null);
			this.anchors.push({ at: snap.at, point: snap.point, kind: snap.kind });
			if (this.anchors.length < 3) return { changed: true };
			const [c, s, e] = this.anchors; this.anchors = [];
			if (near(c.at, s.at, 1e-9)) return this.refuse('Pick the start of the arc away from its center.');
			return { changed: true, commit: { label: 'Draw arc', sketch: this.draft(arcDraft(c, s, e), ctx) } };
		}
		if (tool === 'rectangle' || tool === 'circle' || tool === 'polygon') {
			const snap = this.snapAt(at, ctx, null);
			this.dragFrom = { at: snap.at, point: snap.point, kind: snap.kind };
			this.cursor = snap;
			return { changed: true };
		}
		if (tool === 'trim' || tool === 'extend') {
			const pick = pickEntity(ctx.entities, at, ctx.tolerance, CURVE_KINDS);
			if (!pick) return this.refuse(tool === 'trim' ? 'Click the part of a line, arc or circle to remove.' : 'Click a line near the end to extend.');
			try { return { changed: true, commit: { label: tool === 'trim' ? 'Trim' : 'Extend', sketch: tool === 'trim' ? trimEntity(this.current(ctx), pick.entity, at) : extendEntity(this.current(ctx), pick.entity, at) } }; }
			catch (err) { return this.refuse(err instanceof Error ? err.message : String(err)); }
		}
		if (tool === 'fillet') {
			const pick = pickEntity(ctx.entities, at, ctx.tolerance);
			if (!pick) return this.refuse('Click a corner point, or two lines one after the other, to round the corner.');
			let pair: [string, string] | null = null;
			if (pick.kind === 'point') { const users = pointUsers(ctx.entities, pick.entity).filter((c) => c.type === 'line'); if (users.length !== 2) return this.refuse('Round a corner where exactly two lines meet.'); pair = [users[0].id, users[1].id]; }
			else if (pick.kind !== 'line') return this.refuse('A fillet rounds the corner between two lines.');
			else if (!this.pendingFillet) { this.pendingFillet = pick.entity; this.selected = [pick.entity]; return { changed: true }; }
			else pair = [this.pendingFillet, pick.entity];
			this.pendingFillet = null; this.selected = [];
			try { return { changed: true, commit: { label: 'Fillet corner', sketch: filletCorner(this.current(ctx), pair[0], pair[1], ctx.filletRadius) } }; }
			catch (err) { return this.refuse(err instanceof Error ? err.message : String(err)); }
		}
		return { changed: false };
	}
	move(at: Vec2, ctx: SessionContext): SessionResult {
		const d = this.drag;
		if (d) {
			const dx = at[0] - d.origin[0], dy = at[1] - d.origin[1];
			if (!d.moved && Math.hypot(dx, dy) <= ctx.tolerance) return { changed: false };
			d.moved = true;
			if (d.single) { const snap = this.snapAt(at, ctx, null, new Set([d.single])); d.snap = snap; d.current = new Map([[d.single, snap.at]]); }
			else { d.snap = null; d.current = new Map([...d.from].map(([id, p]) => [id, [p[0] + dx, p[1] + dy] as Vec2])); }
			return { changed: true };
		}
		if (this.tool === 'line') this.cursor = this.snapAt(at, ctx, this.anchors.length ? this.anchors[this.anchors.length - 1].at : null);
		else if (this.tool === 'arc' || ((this.tool === 'rectangle' || this.tool === 'circle' || this.tool === 'polygon') && !this.dragFrom)) this.cursor = this.snapAt(at, ctx, null);
		else if (this.dragFrom) this.cursor = { at, kind: 'none' };
		else this.cursor = null;
		const kinds = this.tool === 'select' || this.tool === 'dimension' || this.tool === 'fillet' ? undefined : this.tool === 'trim' || this.tool === 'extend' ? CURVE_KINDS : null;
		const hovered = kinds === null ? null : pickEntity(ctx.entities, at, ctx.tolerance, kinds)?.entity ?? null;
		const changed = hovered !== this.hovered || this.drawing || this.tool !== 'select';
		this.hovered = hovered;
		return { changed };
	}
	up(at: Vec2, ctx: SessionContext): SessionResult {
		const d = this.drag;
		if (d) {
			this.drag = null;
			if (!d.moved) return { changed: true };
			if (d.single && d.snap?.point && d.snap.point !== d.single) {
				try { return { changed: true, commit: { label: 'Join points', sketch: joinPoints(this.current(ctx), d.single, d.snap.point) } }; }
				catch (err) { return this.refuse(err instanceof Error ? err.message : String(err)); }
			}
			return { changed: true, commit: { label: d.single ? 'Move point' : `Move ${entityLabel(ctx.entities, this.selected[0] ?? '').split(' ')[0].toLowerCase()}`, sketch: movePoints(this.current(ctx), d.current) } };
		}
		const from = this.dragFrom;
		if (from) {
			this.dragFrom = null;
			if (near(from.at, at, ctx.tolerance)) return { changed: true };
			if (this.tool === 'rectangle') { const draft = rectangleEntities(from.at, at); const first = draft.entities[0]; return { changed: true, commit: { label: 'Draw rectangle', sketch: this.draft(from.point ? sharePoint(draft, first.id, from.point) : draft, ctx) } }; }
			const r = Math.hypot(at[0] - from.at[0], at[1] - from.at[1]);
			if (this.tool === 'circle') { const draft = circleEntities(from.at, r); return { changed: true, commit: { label: 'Draw circle', sketch: this.draft(from.point ? sharePoint(draft, draft.entities[0].id, from.point) : draft, ctx) } }; }
			if (this.tool === 'polygon') {
				if (!(Number.isInteger(ctx.polygonSides) && ctx.polygonSides >= 3)) return this.refuse('A polygon needs a whole number of sides, at least 3.');
				return { changed: true, commit: { label: `Draw ${ctx.polygonSides}-sided polygon`, sketch: this.draft(polygonEntities(from.at, at, ctx.polygonSides), ctx) } };
			}
		}
		return { changed: false };
	}
	/** Escape cancels what is in progress (a drag, a chain, a fillet's first pick) and then the selection; Enter ends a line chain; Delete removes the selection. */
	key(key: 'Escape' | 'Enter' | 'Delete', ctx: SessionContext): SessionResult {
		if (key === 'Delete') {
			if (!this.selected.length) return { changed: false };
			if (!ctx.canWrite) return this.refuse('This document is read-only.');
			let next = this.current(ctx); const n = this.selected.length;
			for (const id of this.selected) if (next.entities.some((e) => e.id === id)) next = removeEntity(next, id);
			this.selected = []; this.hovered = null;
			return { changed: true, commit: { label: n === 1 ? 'Delete entity' : `Delete ${n} entities`, sketch: next } };
		}
		if (key === 'Enter') return this.tool === 'line' && this.anchors.length >= 2 ? this.finishChain(ctx, false) : { changed: false };
		if (this.drag) { this.drag = null; return { changed: true }; }
		if (this.dragFrom) { this.dragFrom = null; return { changed: true }; }
		if (this.anchors.length) { const result = this.tool === 'line' && this.anchors.length >= 2 ? this.finishChain(ctx, false) : { changed: true }; this.anchors = []; return result; }
		if (this.pendingFillet) { this.pendingFillet = null; this.selected = []; return { changed: true }; }
		if (this.selected.length) { this.selected = []; return { changed: true }; }
		return { changed: false };
	}
	private finishChain(ctx: SessionContext, closed: boolean): SessionResult {
		const anchors = this.anchors; this.anchors = [];
		if (anchors.length < 2) return { changed: true };
		return { changed: true, commit: { label: closed ? 'Draw closed outline' : `Draw ${anchors.length - 1 === 1 ? 'line' : `${anchors.length - 1} lines`}`, sketch: this.draft(chainDraft(anchors, closed), ctx) } };
	}
	/** What to draw over the sketch right now. */
	preview(ctx: SessionContext): SessionPreview {
		const polylines: Vec2[][] = [], anchors = this.anchors.map((a) => a.at);
		let moved: SessionPreview['moved'] = null;
		const d = this.drag;
		if (d?.moved) { const entities = movePoints(this.current(ctx), d.current).entities; moved = { entities, curves: entities.filter((e) => e.type !== 'point' && entityPoints(entities, e.id).some((p) => d.current.has(p))).map((e) => e.id) }; }
		const cursor = this.cursor;
		if (this.tool === 'line' && anchors.length && cursor) polylines.push([...anchors, cursor.at]);
		if (this.tool === 'arc' && anchors.length && cursor) {
			if (anchors.length === 1) polylines.push([anchors[0], cursor.at]);
			else { const [c, s] = anchors; polylines.push([c, s]); const draft = arcDraft(this.anchors[0], this.anchors[1], { at: cursor.at, kind: 'none' }); const arc = draft.entities.find((e) => e.type === 'arc') as CurveEntity; polylines.push(samples(draft.entities, arc)); polylines.push([c, curvePoint(draft.entities, arc, 1)]); }
		}
		const from = this.dragFrom;
		if (from && cursor) {
			const at = cursor.at, r = Math.hypot(at[0] - from.at[0], at[1] - from.at[1]);
			if (this.tool === 'rectangle') polylines.push([from.at, [at[0], from.at[1]], at, [from.at[0], at[1]], from.at]);
			else if (this.tool === 'circle') polylines.push(circleOutline(from.at, r));
			else if (this.tool === 'polygon' && Number.isInteger(ctx.polygonSides) && ctx.polygonSides >= 3) { const draft = polygonEntities(from.at, at, ctx.polygonSides); const pts = draft.entities.filter((e) => e.type === 'point').map((p) => [p.x, p.y] as Vec2); polylines.push([...pts, pts[0]]); }
		}
		const snap = d?.moved ? d.snap : (this.tool === 'select' || this.tool === 'dimension' || this.tool === 'trim' || this.tool === 'extend' || this.tool === 'fillet') ? null : cursor;
		return { polylines, snap: snap && snap.kind !== 'none' ? snap : null, moved, anchors };
	}
}
