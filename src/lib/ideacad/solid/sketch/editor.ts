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
import { pointOf, samples, isCurve, crossings, curveParam, rayHit, curveLength, arcPoint, arcSweepToward, TAU, type CurveEntity } from './model';
import { snapPoint, snapRelations, snapLevel, sameRelation, trivialRelation, withRelations, type Snap } from './snap';
import type { SketchConstraint, SketchEntity, Vec2 } from '../types';

/* Snapping lives in `snap.ts`; these are re-exported so every caller keeps one import. */
export { snapPoint, snapRelations, snapCue, snapSentence, snapLevel, sameRelation, trivialRelation, withRelations, nearestOnCurve, type Snap, type SnapKind, type SnapContext, type SnapCurve, type Level } from './snap';

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
/**
 * An arc AND ITS CHORD from a center, a start and an end direction: the v1
 * drag-draw path, whose one caller is `viewport/drawing.ts`. The chord is the
 * difference from `arcDraft` and is deliberate -- a shape drawn with no sketch
 * open has nothing else to close against, where an arc drawn INSIDE a sketch
 * connects through its shared points.
 *
 * THE THIRD CLICK IS A DIRECTION HERE TOO, AND IT USED TO BE READ AS ONE HALF
 * OF A DIRECTION. The end was projected onto the radius along the click's
 * bearing, which is right, and the arc was then stored `start -> end` always,
 * which is not: a stored arc runs COUNTER-CLOCKWISE from its start to its end,
 * so a clockwise third click committed the reflex complement. Measured on this
 * function before the fix, center (0,0) and start (1,0): a click ten degrees
 * clockwise gave 350.000 degrees and a click 0.01in below the start gave
 * 359.427 -- a near-whole circle for a click a student aimed just under the
 * start. Ledger 0275 fixed the identical defect in the in-sketch arc TOOL and
 * left this one only because its caller sat outside that bundle's files.
 *
 * The repair is `arcDraft`'s, so there is one direction rule rather than two:
 * `arcSweepToward` gives the SIGNED short way round and a clockwise sweep is
 * stored with the two ends SWAPPED, exactly as `arcDraft` and `filletCorner`
 * already do it. The arc entity gains no field, the end POSITION is unchanged
 * (`arcPoint` at the signed sweep is the same projection the old line took),
 * and an arc saved before this reads exactly as it did.
 *
 * Shift for the long way round is the tool's and is NOT plumbed here: this
 * path's press handler reads no modifier, so offering one would mean a preview
 * that cannot show it -- which is the defect 0275 fixed, one surface over.
 */
export function arcEntities(center: Vec2, start: Vec2, towards: Vec2): SketchDraft {
	const sweep = arcSweepToward(center, start, towards);
	const end = arcPoint(center, start, sweep, 1);
	const c = newEntityId(), s = newEntityId(), e = newEntityId();
	return { entities: [{ id: c, type: 'point', x: center[0], y: center[1] }, { id: s, type: 'point', x: start[0], y: start[1] }, { id: e, type: 'point', x: end[0], y: end[1] }, { id: newEntityId(), type: 'arc', center: c, start: sweep > 0 ? s : e, end: sweep > 0 ? e : s }, { id: newEntityId(), type: 'line', a: e, b: s }], constraints: [] };
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
/**
 * The smallest arc a third click may ask for, in radians. Below it the sweep
 * is zero or a whole turn, neither of which is an arc: the kernel refuses a
 * zero span outright, and a whole turn is a circle, which has its own tool. At
 * a one inch radius this is a twenty-five nanometre chord, so no click a
 * student aims falls under it; what does is a click that lands EXACTLY on the
 * center-to-start ray, which a snap onto an existing point or onto the origin
 * can produce, and which is the case this refuses.
 */
const ARC_MIN_SWEEP = 1e-6;
/**
 * How far an arc's two radii may differ before `movePoints` repairs it. An
 * ABSOLUTE tolerance, and deliberately TIGHTER at every radius than
 * `inconsistentArcs`'s own `1e-7 * max(1, r)`, so the repair can never leave
 * behind a difference the sketch panel's notice would then report. It exists
 * only to make a whole-entity drag a true no-op, where all three points travel
 * by one delta and the two radii agree to within floating-point noise.
 */
const ARC_RADIUS_EPSILON = 1e-9;
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
/**
 * Drop points nothing names (fixed ones stay, as `removeEntity` keeps them),
 * constraints naming anything gone, and relations the graph has made TRIVIAL
 * (`trivialRelation`): a join or a trim can turn a point a snap held on a line
 * into that line's own end, and the solver reads the leftover as a redundant
 * equation, which reads "Over defined" on a sketch that is not.
 */
export function pruneDraft(sketch: SketchDraft): SketchDraft {
	const used = new Set<string>(); for (const e of sketch.entities) if (e.type !== 'point') for (const id of entityPoints(sketch.entities, e.id)) used.add(id);
	const entities = sketch.entities.filter((e) => e.type !== 'point' || used.has(e.id) || e.fixed);
	const ids = new Set(entities.map((e) => e.id));
	return { entities, constraints: sketch.constraints.filter((c) => Object.values(c).every((v) => typeof v !== 'string' || v === c.id || v === c.type || ids.has(v)) && !trivialRelation(entities, c)) };
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
/**
 * THE RADIUS AN ARC KEEPS THROUGH A MOVE: the distance from its center to its
 * START, unless the start is the point that MOVED and the end is not, in which
 * case it is the end's. So the endpoint a student is dragging is the one that
 * gives way, and the one they are not touching is what the radius is read
 * from. Returns null when the question has no answer -- a zero radius, or a
 * bearing taken from a point sitting exactly on the center -- so the caller
 * leaves such an arc alone rather than manufacturing a position for it.
 */
function arcRepairRadius(c: Vec2, s: Vec2, t: Vec2, movedStart: boolean, movedEnd: boolean): number | null {
	const r = Math.hypot((movedStart && !movedEnd ? t : s)[0] - c[0], (movedStart && !movedEnd ? t : s)[1] - c[1]);
	return r > 0 ? r : null;
}
/** A point pulled onto `r` along its own bearing from `c`; null when it sits exactly on the center and has no bearing. */
function ontoRadius(c: Vec2, p: Vec2, r: number): Vec2 | null {
	const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
	return d > 0 ? [c[0] + (p[0] - c[0]) * r / d, c[1] + (p[1] - c[1]) * r / d] : null;
}
/**
 * MOVE: points at new positions. A fixed point is refused before any drag
 * starts, so this never sees one.
 *
 * AN ARC'S TWO ENDS MUST STAY THE SAME DISTANCE FROM ITS CENTER, AND A DRAG
 * USED TO PUT EITHER OF THEM ANYWHERE. Measured through this function before
 * the repair, on a radius-1.000 arc whose end was dragged to (0, 2.5):
 * `rStart` 1.000 against `rEnd` 2.500. That is not a cosmetic state. Ledger
 * 0275 measured the kernel and it is sharp in both directions:
 * `makeCircleArc3d` REFUSES such an edge outright, down to one part in a
 * million (`edge vertices do not agree with its authoritative curve trim`), so
 * the profile cannot be extruded; and `gcsAddArc` contributes exactly ONE
 * equation coupling the two radii, so the moment the sketch carries any
 * constraint the solver TELEPORTS the end back onto the radius, dragging
 * whatever shares that point with it. A drag that silently breaks the extrude
 * is the defect; a drag that silently gets undone by the next solve is the
 * same defect wearing a different hat.
 *
 * SO A DRAGGED ENDPOINT SWEEPS ALONG THE ARC'S OWN CIRCLE: the radius is held
 * and the ANGLE follows the cursor. Decision 31 is what picks it -- "not a
 * technical precision program... quick to use, extremely quick to use" -- and
 * of the three coherent answers it is the only one that needs no explaining.
 * The two rejected alternatives are in this bundle's history entry:
 * RE-RADIUSING the whole arc (both ends move together, so touching one end
 * silently moves the other, which may be shared with a line the student drew
 * first), and REFUSING the drag (which leaves an arc already in the broken
 * state with no way back, and teaches that the tool is arbitrary).
 *
 * A MOVE OF THE CENTER ALONE CARRIES BOTH ENDS WITH IT, so the arc TRAVELS
 * rather than deforming -- the one reading that preserves the sweep as well as
 * the radius, and what a person means by grabbing the middle of something.
 * Every other shape of move falls out of `arcRepairRadius`.
 *
 * THE REPAIR IS SKIPPED FOR AN ARC THE MOVE LEFT CONSISTENT, which is what
 * makes a WHOLE-ENTITY drag a no-op: all three points travel by one delta, the
 * radii still agree, and nothing is recomputed (measured: rStart and rEnd both
 * 1.000 and the sweep still 90.000 after +(1,1)). An arc none of whose points
 * moved is never touched at all, so a document that already carries a broken
 * arc is not rewritten behind the student's back -- but dragging that arc's
 * end DOES repair it, which is exactly what the sketch panel's notice tells
 * them to do.
 *
 * ONE PASS, FIRST REPAIR WINS. Two arcs sharing a point can each ask for it,
 * and a second pass would chase a chain of them around; what is left over is
 * reported by `inconsistentArcs` rather than iterated at.
 *
 * WHAT THIS DOES NOT COVER, DELIBERATELY: a drag that ends ON another point is
 * a JOIN, which goes through `joinPoints` and not through here, and a join
 * onto a point off the circle still leaves the arc inconsistent. Honouring the
 * join AND the radius is impossible, and choosing between them changes what a
 * join means for every arc. The notice is the safety net; the history entry
 * names it for Mr. Pina.
 */
export function movePoints(sketch: SketchDraft, moves: ReadonlyMap<string, Vec2>): SketchDraft {
	const at = new Map<string, Vec2>();
	for (const e of sketch.entities) if (e.type === 'point') at.set(e.id, moves.get(e.id) ?? [e.x, e.y]);
	const repair = new Map<string, Vec2>();
	const put = (id: string, to: Vec2) => { if (!repair.has(id)) repair.set(id, to); };
	for (const e of sketch.entities) {
		if (e.type !== 'arc') continue;
		const movedCenter = moves.has(e.center), movedStart = moves.has(e.start), movedEnd = moves.has(e.end);
		if (!movedCenter && !movedStart && !movedEnd) continue;
		const c = at.get(e.center), s = at.get(e.start), t = at.get(e.end);
		if (!c || !s || !t) continue;
		const rStart = Math.hypot(s[0] - c[0], s[1] - c[1]), rEnd = Math.hypot(t[0] - c[0], t[1] - c[1]);
		if (Math.abs(rStart - rEnd) <= ARC_RADIUS_EPSILON) continue;
		if (movedCenter && !movedStart && !movedEnd) {
			const was = sketch.entities.find((p) => p.id === e.center);
			if (was?.type !== 'point') continue;
			const dx = c[0] - was.x, dy = c[1] - was.y;
			put(e.start, [s[0] + dx, s[1] + dy]); put(e.end, [t[0] + dx, t[1] + dy]);
			continue;
		}
		const r = arcRepairRadius(c, s, t, movedStart, movedEnd);
		if (r === null) continue;
		const slide = movedStart && !movedEnd ? e.start : e.end;
		const to = ontoRadius(c, slide === e.start ? s : t, r);
		if (to) put(slide, to);
	}
	return { entities: sketch.entities.map((e) => { if (e.type !== 'point') return e; const to = repair.get(e.id) ?? moves.get(e.id); return to ? { ...e, x: to[0], y: to[1] } : e; }), constraints: sketch.constraints };
}

/* --------------------------------------------------------- chain drafts */
/**
 * One corner of a line chain, an arc, or the first press of a rectangle or a
 * circle: where it landed and how. When it snapped to an existing point, the
 * point it IS; when it snapped onto a curve, the curves (`snapRelations`
 * turns them into the relation that keeps it there); when the step to it is
 * level or plumb, which.
 */
export type Anchor = Pick<Snap, 'at' | 'point' | 'kind' | 'curves' | 'level'>;
/** The anchor a snap makes: the fields a draft needs and nothing about how the marker is drawn. */
export const anchorOf = (s: Snap): Anchor => ({ at: s.at, kind: s.kind, ...(s.point ? { point: s.point } : {}), ...(s.curves ? { curves: s.curves } : {}), ...(s.level ? { level: s.level } : {}) });
/**
 * A line chain through anchors: new points where none was shared, one line per
 * step, the relation each new point's snap earned (a Midpoint, a point on a
 * line, circle or arc), and a horizontal/vertical constraint where a step
 * snapped level or plumb. Closed chains return to the first anchor. Every
 * inferred relation is in the SAME draft as the lines, so the one history
 * step the panel commits takes them away together on an undo.
 */
export function chainDraft(anchors: readonly Anchor[], closed: boolean): SketchDraft {
	const entities: SketchEntity[] = [], constraints: SketchConstraint[] = [];
	const ids = anchors.map((a) => { if (a.point) return a.point; const id = newEntityId(); entities.push({ id, type: 'point', x: a.at[0], y: a.at[1] }); constraints.push(...snapRelations(a, id)); return id; });
	const steps = closed ? anchors.length : anchors.length - 1;
	for (let i = 0; i < steps; i++) {
		const a = ids[i], b = ids[(i + 1) % ids.length]; if (a === b) continue;
		const id = newEntityId(); entities.push({ id, type: 'line', a, b });
		const level = closed && i === steps - 1 ? undefined : snapLevel(anchors[i + 1]);
		if (level) constraints.push({ id: newEntityId(), type: level, line: id });
	}
	return { entities, constraints };
}
/**
 * AN ARC ALONE (no chord: inside a sketch an arc connects through its points)
 * from a center anchor, a start anchor and the DIRECTION of the end.
 *
 * THE THIRD CLICK IS A DIRECTION AND CANNOT BE A POSITION, WHICH IS WHY IT
 * TAKES A `Vec2` AND NOT AN `Anchor`. The center and the start fix the radius
 * between them, so the only thing a third click can still choose is how far
 * round to go and which way. It used to be read BOTH ways: a click that
 * snapped to an existing point became the end VERBATIM, at whatever distance
 * from the center that point happened to sit, and every other click was
 * projected onto the radius. The kernel refuses the first of those outright --
 * `makeCircleArc3d` throws `edge vertices do not agree with its authoritative
 * curve trim` for a mismatch of one part in a million, measured -- so the
 * branch drew an arc with a radial jump in it that could never be extruded,
 * and the PREVIEW took the other branch and showed a different arc from the
 * one about to be committed. Both of those are gone by construction: the end
 * is always `arcPoint`'s, which carries the start's radius, and a caller has
 * nowhere to put a point id.
 *
 * THE DIRECTION IS THE SIDE THE CLICK FELL ON, and a stored arc still runs
 * counter-clockwise from its start to its end -- a clockwise sweep is stored
 * with the two SWAPPED, exactly as `filletCorner` below already does it. So
 * the arc entity gains no field, the invariant every other reader assumes is
 * unchanged, and an arc saved before this reads as it always did.
 */
export function arcDraft(center: Anchor, start: Anchor, towards: Vec2, major = false): SketchDraft {
	const sweep = arcSweepToward(center.at, start.at, towards, major);
	const end = arcPoint(center.at, start.at, sweep, 1);
	const entities: SketchEntity[] = [], constraints: SketchConstraint[] = [];
	const id = (a: Anchor) => { if (a.point) return a.point; const pid = newEntityId(); entities.push({ id: pid, type: 'point', x: a.at[0], y: a.at[1] }); constraints.push(...snapRelations(a, pid)); return pid; };
	const c = id(center), s = id(start), e = newEntityId();
	entities.push({ id: e, type: 'point', x: end[0], y: end[1] });
	entities.push({ id: newEntityId(), type: 'arc', center: c, start: sweep > 0 ? s : e, end: sweep > 0 ? e : s });
	return { entities, constraints };
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
	/** The constraints to add; `value` is ignored by a relation. Empty for an offer that rewrites the graph instead. */
	build(value?: number): SketchConstraint[];
	/**
	 * An offer that REWRITES THE GRAPH rather than adding constraints alone,
	 * and is applied to the whole sketch: Coincident on two points JOINS them
	 * (the drag-and-drop join, because a coincident constraint over two point
	 * ids would look closed and bound no region), and Horizontal or Vertical
	 * between two points that no line joins draws a CONSTRUCTION line between
	 * them to carry the relation, since the solver's horizontal and vertical
	 * take a line and the stored vocabulary may not grow a point-to-point
	 * kind. May throw a sentence.
	 */
	apply?(sketch: SketchDraft): SketchDraft;
}
const CONSTRAINT_WORDS: Record<SketchConstraint['type'], string> = {
	coincident: 'Coincident', distance: 'Distance', pointLineDistance: 'Distance to line', horizontal: 'Horizontal', vertical: 'Vertical', angle: 'Angle', parallel: 'Parallel', perpendicular: 'Perpendicular',
	equalLength: 'Equal length', circleRadius: 'Radius', arcRadius: 'Radius', equalRadius: 'Equal radius', pointOnCircle: 'Point on circle', pointOnArc: 'Point on arc', tangentLineArc: 'Tangent', tangentArcArc: 'Tangent',
	concentric: 'Concentric', midpoint: 'Midpoint', symmetric: 'Symmetric', fixX: 'Fix X', fixY: 'Fix Y'
};
/** The word for a constraint and the entities it names, for a list row. A distance to a line of exactly zero is the POINT ON LINE relation (`snap.ts` says why it is spelled that way) and is listed as one, with no number to type. */
export function constraintLabel(entities: readonly SketchEntity[], c: SketchConstraint): { word: string; names: string; value?: number; unit?: 'in' | 'deg' } {
	const names = Object.entries(c).filter(([k, v]) => k !== 'id' && k !== 'type' && typeof v === 'string').map(([, v]) => entityLabel(entities, v as string)).join(', ');
	if (isOnLine(c)) return { word: 'Point on line', names };
	return { word: CONSTRAINT_WORDS[c.type], names, ...('value' in c ? { value: c.value, unit: c.type === 'angle' ? 'deg' as const : 'in' as const } : {}) };
}
/** A point held on a line: the zero distance a snap or the Point on line offer writes. */
export const isOnLine = (c: SketchConstraint): c is Extract<SketchConstraint, { type: 'pointLineDistance' }> => c.type === 'pointLineDistance' && c.value === 0;
const lineAngle = (entities: readonly SketchEntity[], l: Extract<SketchEntity, { type: 'line' }>) => { const a = pointOf(entities, l.a), b = pointOf(entities, l.b); return Math.atan2(b[1] - a[1], b[0] - a[0]); };
const radiusOf = (entities: readonly SketchEntity[], e: CurveEntity) => e.type === 'circle' ? e.radius : e.type === 'arc' ? Math.hypot(...([pointOf(entities, e.start)[0] - pointOf(entities, e.center)[0], pointOf(entities, e.start)[1] - pointOf(entities, e.center)[1]] as Vec2)) : 0;
/** The point two curves share at an END of each (never a center): where a tangency between them can be pinned. */
function sharedEnd(a: CurveEntity, b: CurveEntity): string | null {
	const ends = (c: CurveEntity) => (c.type === 'line' ? [c.a, c.b] : c.type === 'arc' ? [c.start, c.end] : []);
	return ends(a).find((id) => ends(b).includes(id)) ?? null;
}
/** Whether two points can be joined: the sentence `joinPoints` would refuse with is the answer. */
function joinable(entities: readonly SketchEntity[], a: string, b: string): boolean {
	try { joinPoints({ entities: [...entities], constraints: [] }, a, b); return true; } catch { return false; }
}
/**
 * What can be constrained from what is selected. Each offer is one button in
 * the panel; those with a `value` also get an input seeded with the measured
 * number, which the student may change to anything finite -- the solver is
 * the only thing that refuses a value.
 *
 * `existing`, when given, is the sketch's own constraint list, and a RELATION
 * it already holds is not offered again: a second Horizontal on a line adds
 * no freedom and the sketch then reads "Over defined".
 *
 * THE KERNEL'S VOCABULARY DECIDES WHAT IS OFFERED FROM WHAT. Tangent is
 * offered only where a line and an arc, or two arcs, SHARE AN END: the
 * kernel's tangent pins the two directions at one named point and does not
 * pull two curves apart onto each other (measured: a line and an arc a unit
 * apart converge with the arc turned parallel and still a unit away). A
 * circle has no ends and is offered no tangent. Collinear is each END of the
 * second line held at zero distance from the first, skipping an end the two
 * already share, which would be an equation that removes nothing.
 */
export function constraintOffers(entities: readonly SketchEntity[], selected: readonly string[], existing?: readonly SketchConstraint[]): ConstraintOffer[] {
	const picked = selected.map((id) => entities.find((e) => e.id === id)).filter((e): e is SketchEntity => !!e);
	const kinds = picked.map((e) => e.type).sort().join('+');
	const out: ConstraintOffer[] = [];
	const id = () => newEntityId();
	const distance = (a: string, b: string, value: number) => out.push({ key: 'distance', label: 'Distance', value, unit: 'in', build: (v) => [{ id: id(), type: 'distance', a, b, value: v ?? value }] });
	const onLine = (point: string, line: string): SketchConstraint => ({ id: id(), type: 'pointLineDistance', point, line, value: 0 });
	type Pt = Extract<SketchEntity, { type: 'point' }>; type Ln = Extract<SketchEntity, { type: 'line' }>;
	if (kinds === 'line') {
		const l = picked[0] as Ln;
		out.push({ key: 'horizontal', label: 'Horizontal', build: () => [{ id: id(), type: 'horizontal', line: l.id }] }, { key: 'vertical', label: 'Vertical', build: () => [{ id: id(), type: 'vertical', line: l.id }] });
		distance(l.a, l.b, curveLength(entities, l));
	} else if (kinds === 'point') {
		const p = picked[0] as Pt;
		out.push({ key: 'fix', label: 'Fix in place', build: () => [{ id: id(), type: 'fixX', point: p.id, value: p.x }, { id: id(), type: 'fixY', point: p.id, value: p.y }] });
	} else if (kinds === 'point+point') {
		const [a, b] = picked as Pt[];
		/* The point that survives a join keeps its place, so a FIXED one survives; otherwise the one picked first. */
		const keep = b.fixed && !a.fixed ? b : a, gone = keep === a ? b : a;
		if (joinable(entities, gone.id, keep.id)) out.push({ key: 'coincident', label: 'Coincident', build: () => [], apply: (sketch) => joinPoints(sketch, gone.id, keep.id) });
		const joining = entities.find((e): e is Ln => e.type === 'line' && ((e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id)));
		for (const level of ['horizontal', 'vertical'] as const) {
			const label = level === 'horizontal' ? 'Horizontal' : 'Vertical';
			if (joining) out.push({ key: level, label, build: () => [{ id: id(), type: level, line: joining.id }] });
			else out.push({ key: level, label, build: () => [], apply: (sketch) => { const line = id(); return { entities: [...sketch.entities, { id: line, type: 'line', a: a.id, b: b.id, construction: true }], constraints: [...sketch.constraints, { id: id(), type: level, line }] }; } });
		}
		distance(a.id, b.id, Math.hypot(b.x - a.x, b.y - a.y));
	} else if (kinds === 'line+point+point') {
		const [a, b] = picked.filter((e): e is Pt => e.type === 'point'), axis = picked.find((e): e is Ln => e.type === 'line')!;
		/* A point ON the axis (one of its ends) mirrors onto itself, so the other would have to be the same point: nothing to offer. */
		if (![axis.a, axis.b].includes(a.id) && ![axis.a, axis.b].includes(b.id)) out.push({ key: 'symmetric', label: 'Symmetric', build: () => [{ id: id(), type: 'symmetric', a: a.id, b: b.id, axis: axis.id }] });
	} else if (kinds === 'circle' || kinds === 'arc') {
		const c = picked[0] as CurveEntity;
		out.push({ key: 'radius', label: 'Radius', value: radiusOf(entities, c), unit: 'in', build: (v) => [c.type === 'circle' ? { id: id(), type: 'circleRadius', circle: c.id, value: v ?? radiusOf(entities, c) } : { id: id(), type: 'arcRadius', arc: c.id, value: v ?? radiusOf(entities, c) }] });
	} else if (kinds === 'line+line') {
		const [l1, l2] = picked as Ln[];
		const angle = ((lineAngle(entities, l2) - lineAngle(entities, l1)) * 180 / Math.PI + 360) % 360;
		const loose = [l2.a, l2.b].filter((p) => p !== l1.a && p !== l1.b);
		out.push({ key: 'parallel', label: 'Parallel', build: () => [{ id: id(), type: 'parallel', l1: l1.id, l2: l2.id }] }, { key: 'perpendicular', label: 'Perpendicular', build: () => [{ id: id(), type: 'perpendicular', l1: l1.id, l2: l2.id }] }, { key: 'equal', label: 'Equal length', build: () => [{ id: id(), type: 'equalLength', l1: l1.id, l2: l2.id }] });
		if (loose.length) out.push({ key: 'collinear', label: 'Collinear', build: () => loose.map((p) => onLine(p, l1.id)) });
		out.push({ key: 'angle', label: 'Angle', value: angle, unit: 'deg', build: (v) => [{ id: id(), type: 'angle', l1: l1.id, l2: l2.id, value: v ?? angle }] });
	} else if (kinds === 'arc+line') {
		const l = picked.find((e): e is Ln => e.type === 'line')!, arc = picked.find((e): e is Extract<SketchEntity, { type: 'arc' }> => e.type === 'arc')!, at = sharedEnd(l, arc);
		if (at) out.push({ key: 'tangent', label: 'Tangent', build: () => [{ id: id(), type: 'tangentLineArc', line: l.id, arc: arc.id, point: at }] });
	} else if (kinds === 'arc+arc' || kinds === 'circle+circle' || kinds === 'arc+circle') {
		const [a, b] = picked as CurveEntity[];
		out.push({ key: 'equalRadius', label: 'Equal radius', build: () => [{ id: id(), type: 'equalRadius', a: a.id, b: b.id }] }, { key: 'concentric', label: 'Concentric', build: () => [{ id: id(), type: 'concentric', a: a.id, b: b.id }] });
		const at = kinds === 'arc+arc' ? sharedEnd(a, b) : null;
		if (at) out.push({ key: 'tangent', label: 'Tangent', build: () => [{ id: id(), type: 'tangentArcArc', arc1: a.id, arc2: b.id, point: at }] });
	} else if (kinds === 'line+point') {
		const p = picked.find((e) => e.type === 'point') as Pt, l = picked.find((e) => e.type === 'line') as Ln;
		const a = pointOf(entities, l.a), b = pointOf(entities, l.b), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
		const gap = Math.abs((b[0] - a[0]) * (a[1] - p.y) - (a[0] - p.x) * (b[1] - a[1])) / len;
		out.push({ key: 'midpoint', label: 'Midpoint', build: () => [{ id: id(), type: 'midpoint', point: p.id, line: l.id }] });
		/* A line's own end is on it already: the relation would be an equation that removes nothing. */
		if (p.id !== l.a && p.id !== l.b) out.push({ key: 'onLine', label: 'Point on line', build: () => [onLine(p.id, l.id)] });
		out.push({ key: 'pointLineDistance', label: 'Distance to line', value: gap, unit: 'in', build: (v) => [{ id: id(), type: 'pointLineDistance', point: p.id, line: l.id, value: v ?? gap }] });
	} else if (kinds === 'circle+point' || kinds === 'arc+point') {
		const p = picked.find((e) => e.type === 'point') as Pt, c = picked.find((e) => e.type !== 'point') as CurveEntity;
		out.push({ key: 'on', label: c.type === 'circle' ? 'Point on circle' : 'Point on arc', build: () => [c.type === 'circle' ? { id: id(), type: 'pointOnCircle', point: p.id, circle: c.id } : { id: id(), type: 'pointOnArc', point: p.id, arc: c.id }] });
	}
	if (!existing?.length) return out;
	/* A relation (no number, no rewrite) the sketch already holds, word for word, is not offered twice. */
	return out.filter((o) => o.value !== undefined || o.apply || !o.build().every((c) => existing.some((e) => sameRelation(e, c))));
}

/* -------------------------------------------------------------- session */
export interface SessionContext {
	entities: readonly SketchEntity[]; constraints: readonly SketchConstraint[];
	/** Pick tolerance and snap radius, in sketch inches (the panel converts from pixels). */
	tolerance: number; snapRadius: number;
	polygonSides: number; filletRadius: number;
	shift?: boolean; canWrite: boolean;
	/** Ctrl or Command held on this event: place freely, with no snap and so no inferred relation. */
	free?: boolean;
}
export interface Commit { label: string; sketch: SketchDraft }
export interface SessionResult { changed: boolean; commit?: Commit; error?: string }
/** What the layer draws over the sketch for the state the session is in. */
/** `moved` is the WHOLE entity list with the drag applied plus the ids of the curves that moved: a curve's points have to be in the list handed to `samples`. */
export interface SessionPreview { polylines: Vec2[][]; snap: Snap | null; moved: { entities: SketchEntity[]; curves: string[] } | null; anchors: Vec2[] }
interface Drag { origin: Vec2; points: string[]; single: string | null; from: Map<string, Vec2>; current: Map<string, Vec2>; moved: boolean; snap: Snap | null }
const CURVE_KINDS: readonly SketchEntity['type'][] = ['line', 'circle', 'arc'];
/** How many points the pointer passed over are remembered as alignment sources. Three is enough to line up with a corner just touched, few enough that the dashed guides do not fire at everything on screen. */
const WOKEN_LIMIT = 3;
/** The tools whose presses are snapped at all. Trim, extend, fillet and dimension pick an entity instead. */
const SNAPPING_TOOLS: readonly SketchTool[] = ['line', 'arc', 'rectangle', 'circle', 'polygon'];
/** A draft whose point `id` gains the relations its first press snapped into. */
const relate = (draft: SketchDraft, id: string, anchor: Anchor): SketchDraft => ({ entities: draft.entities, constraints: [...draft.constraints, ...snapRelations(anchor, id)] });
const circleOutline = (c: Vec2, r: number, n = 64): Vec2[] => Array.from({ length: n + 1 }, (_, i) => [c[0] + r * Math.cos(i / n * TAU), c[1] + r * Math.sin(i / n * TAU)] as Vec2);
export class SketchSession {
	tool: SketchTool = 'select';
	selected: string[] = [];
	hovered: string | null = null;
	/** The line picked first for a fillet, waiting for its partner. */
	pendingFillet: string | null = null;
	/** Shift, as of the last pointer or key event: the arc tool's long-way-round. Held here rather than read from the context inside `preview`, because the panel redraws the preview OUTSIDE a pointer event and so has no modifier to hand it. */
	private major = false;
	/** Ctrl or Command, as of the last pointer or key event: place freely. Held here for the same reason `major` is. */
	private free = false;
	/** Where the pointer last was, in the plane: what a modifier pressed without moving re-snaps from. */
	private pointer: Vec2 | null = null;
	/** Points the pointer passed over, newest first: the alignment guides' sources. */
	private woken: string[] = [];
	private anchors: Anchor[] = [];
	private dragFrom: Anchor | null = null;
	private cursor: Snap | null = null;
	private drag: Drag | null = null;
	get anchorCount() { return this.anchors.length; }
	get drawing() { return this.anchors.length > 0 || !!this.dragFrom; }
	get dragging() { return !!this.drag?.moved; }
	/** The snap a press would take right now, for the cursor cue and the panel's sentence: a dragged point's, or a drawing tool's. Null when nothing is snapped. */
	get liveSnap(): Snap | null {
		const snap = this.drag?.moved ? this.drag.snap : SNAPPING_TOOLS.includes(this.tool) && !this.dragFrom ? this.cursor : null;
		return snap && snap.kind !== 'none' ? snap : null;
	}
	/** Where the pointer is while Ctrl or Command is placing it freely; null when that is not the question (no pointer yet, or nothing that snaps). */
	get freeAt(): Vec2 | null { return this.free && this.pointer && ((this.drag?.moved && this.drag.single) || (SNAPPING_TOOLS.includes(this.tool) && !this.dragFrom && !(this.tool === 'arc' && this.anchors.length === 2))) ? this.pointer : null; }
	/**
	 * What a snap turns into for the tool in hand: the relation that holds a
	 * new point where it landed (`point`), and the step's own level or plumb
	 * (`step`). A polygon's press is its CENTER, which is not a point in the
	 * sketch, so it adds nothing; an arc adds the point's relation to its
	 * center and start; a rectangle's or circle's first press to its corner or
	 * center; only a line chain has a step to level.
	 */
	get infers(): { point: boolean; step: boolean } {
		if (this.drag?.moved) return { point: !!this.drag.single, step: false };
		if (this.tool === 'line') return { point: true, step: true };
		if (this.tool === 'arc') return { point: this.anchors.length < 2, step: false };
		return { point: this.tool === 'rectangle' || this.tool === 'circle', step: false };
	}
	setTool(tool: SketchTool) { if (tool !== this.tool) { this.tool = tool; this.anchors = []; this.dragFrom = null; this.drag = null; this.pendingFillet = null; this.cursor = null; this.major = false; this.woken = []; } }
	/** Shift pressed or released while no pointer event is in flight. Answers whether anything on screen changes, so a key that cannot move the preview costs no redraw. */
	setModifier(shift: boolean): boolean {
		if (shift === this.major) return false;
		this.major = shift;
		return this.tool === 'arc' && this.anchors.length === 2 && !!this.cursor;
	}
	/**
	 * Ctrl or Command pressed or released while no pointer event is in flight:
	 * the snap is taken again from where the pointer already is, so the marker
	 * and the cue change on the key and not on the next nudge of the mouse.
	 * Answers whether anything on screen changed.
	 */
	setFree(free: boolean, ctx: SessionContext): boolean {
		if (free === this.free) return false;
		this.free = free;
		if (!this.pointer) return false;
		const before = this.liveSnap;
		this.move(this.pointer, { ...ctx, free });
		return before !== this.liveSnap || !!this.freeAt;
	}
	/** Where the alignment guides come from: the points passed over that are still in the sketch, and the corners of the chain already placed. */
	private wokenAt(ctx: SessionContext): Vec2[] {
		const out: Vec2[] = [];
		const add = (p: Vec2) => { if (!out.some((q) => near(q, p, 1e-9))) out.push(p); };
		for (const id of this.woken) { const p = ctx.entities.find((e) => e.id === id); if (p?.type === 'point') add([p.x, p.y]); }
		for (const a of this.anchors) add(a.at);
		return out;
	}
	/** A point the pointer passed over joins the alignment sources, newest first. */
	private wake(snap: Snap | null) {
		if (snap?.kind !== 'point' || !snap.point) return;
		this.woken = [snap.point, ...this.woken.filter((id) => id !== snap.point)].slice(0, WOKEN_LIMIT);
	}
	/** `guides` false leaves out every alignment guide as well as the reference: the arc's third click, which is a direction (see `arcSnap`). */
	private snapAt(at: Vec2, ctx: SessionContext, reference: Vec2 | null = null, exclude?: ReadonlySet<string>, guides = true): Snap { return snapPoint(at, { entities: ctx.entities, radius: ctx.snapRadius, reference, exclude, woken: guides ? this.wokenAt(ctx) : [], free: this.free }); }
	/**
	 * Where an arc click lands. THE THIRD ONE IS A DIRECTION, so what comes
	 * back for it is the point on the arc's own circle that the click points
	 * at: the snap mark then sits where the end will actually be, and the
	 * preview and the commit are handed the same position rather than two
	 * readings of one click. Its `kind` is reported as NO SNAP whatever the
	 * raw snap was, because every snap names a POSITION and a third click
	 * cannot reach one -- a mark promising otherwise is the defect one level
	 * down.
	 */
	private arcSnap(at: Vec2, ctx: SessionContext): Snap {
		/*
		 * THE SECOND CLICK IS REFERENCED TO THE CENTER, so a start can be
		 * placed exactly level or plumb with it. THE THIRD IS REFERENCED TO
		 * NOTHING, and that asymmetry is deliberate rather than an oversight.
		 * Level and plumb move a click ONTO an axis, and on the third click
		 * that axis is one the arc reaches from two sides: a click at 170
		 * degrees lands on the 180 ray, where the two half circles are mirror
		 * images and the normalization has to pick one -- so a student aiming
		 * just below the far side got the half bulging the other way, which is
		 * the reported defect in miniature. An exact quarter is worth less
		 * than a direction that always follows the click, and a sketch that
		 * needs the quarter exactly has a dimension for it.
		 *
		 * THE ALIGNMENT GUIDES ARE LEFT OUT OF THE THIRD CLICK FOR THE SAME
		 * REASON, and this is not hypothetical: with them in, a click at 170
		 * degrees on a unit arc sat 0.17 in off the center's own level guide,
		 * inside the snap radius, and committed 180.
		 */
		const snap = this.anchors.length < 2 ? this.snapAt(at, ctx, this.anchors.length === 1 ? this.anchors[0].at : null) : this.snapAt(at, ctx, null, undefined, false);
		if (this.anchors.length < 2) return snap;
		const [c, s] = this.anchors;
		/*
		 * A SNAP MAY NEVER TURN A USABLE CLICK INTO A REFUSAL. A third click
		 * near the origin snaps to the origin, which IS the center whenever
		 * the student drew around it, and a click that snaps to an existing
		 * point can land on the center the same way. Both are ordinary
		 * actions. So the snapped position is used only while it still asks
		 * for an arc, the raw one is used when it does not, and the refusals
		 * in `down` are left for a click that genuinely asks for neither.
		 */
		const end = this.arcEnd(c.at, s.at, snap.at) ?? this.arcEnd(c.at, s.at, at);
		return { at: end ?? snap.at, kind: 'none' };
	}
	/** Where an arc from `c` through `s` ends when a third click points at `towards`, or null when that click asks for no arc at all: on the center, so there is no direction, or along the center-to-start ray, so there is no sweep. */
	private arcEnd(c: Vec2, s: Vec2, towards: Vec2): Vec2 | null {
		if (near(towards, c, 1e-9)) return null;
		const sweep = arcSweepToward(c, s, towards, this.major);
		return Math.abs(sweep) < ARC_MIN_SWEEP || Math.abs(Math.abs(sweep) - TAU) < ARC_MIN_SWEEP ? null : arcPoint(c, s, sweep, 1);
	}
	private draft = (sketch: SketchDraft, ctx: SessionContext) => appendDraft({ entities: [...ctx.entities], constraints: [...ctx.constraints] }, sketch);
	private current = (ctx: SessionContext): SketchDraft => ({ entities: [...ctx.entities], constraints: [...ctx.constraints] });
	private refuse = (error: string): SessionResult => ({ changed: true, error });
	down(at: Vec2, ctx: SessionContext): SessionResult {
		const tool = this.tool;
		this.free = !!ctx.free; this.pointer = at;
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
			const anchor = anchorOf(snap);
			const first = this.anchors[0];
			if (first && this.anchors.length >= 2 && ((first.point && first.point === anchor.point) || (!first.point && near(first.at, anchor.at, ctx.snapRadius)))) return this.finishChain(ctx, true);
			const last = this.anchors[this.anchors.length - 1];
			if (last && ((last.point && last.point === anchor.point) || near(last.at, anchor.at, 1e-9))) return { changed: false };
			this.anchors.push(anchor);
			return { changed: true };
		}
		if (tool === 'arc') {
			this.major = !!ctx.shift;
			const snap = this.arcSnap(at, ctx);
			if (this.anchors.length < 2) {
				/* Refused on the SECOND click rather than after a third: a start on top of its own center has no radius, and finding that out costs one more click than it needs to. */
				if (this.anchors.length === 1 && near(snap.at, this.anchors[0].at, 1e-9)) return this.refuse('Pick the start of the arc away from its center.');
				this.anchors.push(anchorOf(snap));
				return { changed: true };
			}
			const [c, s] = this.anchors;
			if (near(snap.at, c.at, 1e-9)) return this.refuse('Click away from the center to say where the arc ends.');
			const sweep = arcSweepToward(c.at, s.at, snap.at, this.major);
			if (Math.abs(sweep) < ARC_MIN_SWEEP || Math.abs(Math.abs(sweep) - TAU) < ARC_MIN_SWEEP) return this.refuse('Click to one side of the start to say how far the arc goes around.');
			this.anchors = [];
			return { changed: true, commit: { label: 'Draw arc', sketch: this.draft(arcDraft(c, s, snap.at, this.major), ctx) } };
		}
		if (tool === 'rectangle' || tool === 'circle' || tool === 'polygon') {
			const snap = this.snapAt(at, ctx, null);
			this.dragFrom = anchorOf(snap);
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
		this.free = !!ctx.free; this.pointer = at;
		const d = this.drag;
		if (d) {
			const dx = at[0] - d.origin[0], dy = at[1] - d.origin[1];
			if (!d.moved && Math.hypot(dx, dy) <= ctx.tolerance) return { changed: false };
			d.moved = true;
			if (d.single) { const snap = this.snapAt(at, ctx, null, new Set([d.single])); d.snap = snap; d.current = new Map([[d.single, snap.at]]); this.wake(snap); }
			else { d.snap = null; d.current = new Map([...d.from].map(([id, p]) => [id, [p[0] + dx, p[1] + dy] as Vec2])); }
			return { changed: true };
		}
		if (this.tool === 'line') this.cursor = this.snapAt(at, ctx, this.anchors.length ? this.anchors[this.anchors.length - 1].at : null);
		else if (this.tool === 'arc') { this.major = !!ctx.shift; this.cursor = this.arcSnap(at, ctx); }
		else if ((this.tool === 'rectangle' || this.tool === 'circle' || this.tool === 'polygon') && !this.dragFrom) this.cursor = this.snapAt(at, ctx, null);
		else if (this.dragFrom) this.cursor = { at, kind: 'none' };
		else this.cursor = null;
		if (!this.dragFrom) this.wake(this.cursor);
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
			const moved = movePoints(this.current(ctx), d.current);
			/* A point dropped onto a curve or a midpoint keeps the relation that snap earned, in the same step as the move, so one undo takes both. */
			if (d.single && d.snap?.curves?.length) return { changed: true, commit: { label: 'Move point', sketch: { entities: moved.entities, constraints: withRelations(moved.entities, moved.constraints, snapRelations(d.snap, d.single)) } } };
			return { changed: true, commit: { label: d.single ? 'Move point' : `Move ${entityLabel(ctx.entities, this.selected[0] ?? '').split(' ')[0].toLowerCase()}`, sketch: moved } };
		}
		const from = this.dragFrom;
		if (from) {
			this.dragFrom = null;
			if (near(from.at, at, ctx.tolerance)) return { changed: true };
			if (this.tool === 'rectangle') { const draft = rectangleEntities(from.at, at); const first = draft.entities[0]; return { changed: true, commit: { label: 'Draw rectangle', sketch: this.draft(from.point ? sharePoint(draft, first.id, from.point) : relate(draft, first.id, from), ctx) } }; }
			const r = Math.hypot(at[0] - from.at[0], at[1] - from.at[1]);
			if (this.tool === 'circle') { const draft = circleEntities(from.at, r); return { changed: true, commit: { label: 'Draw circle', sketch: this.draft(from.point ? sharePoint(draft, draft.entities[0].id, from.point) : relate(draft, draft.entities[0].id, from), ctx) } }; }
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
			else {
				const [c, s] = anchors; polylines.push([c, s]);
				const draft = arcDraft(this.anchors[0], this.anchors[1], cursor.at, this.major);
				const arc = draft.entities.find((e) => e.type === 'arc') as CurveEntity;
				polylines.push(samples(draft.entities, arc));
				/* The second radius line runs to the NEW end, which is not `curvePoint(arc, 1)`: a clockwise arc is stored with its ends swapped, so the curve's own parameter 1 is the student's START and the guide would double the first line and leave the end unmarked. */
				polylines.push([c, arcPoint(c, s, arcSweepToward(c, s, cursor.at, this.major), 1)]);
			}
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
