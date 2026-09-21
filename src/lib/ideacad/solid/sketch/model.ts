/**
 * THE SKETCH MODEL: entities, constraints, the closed regions they enclose,
 * and the solve. Pure arithmetic except for `solveSketch`, which hands the
 * constraint system to the kernel's 2D solver.
 *
 * DIMENSIONS ARE DRIVING, NOT DRIVEN, and the reason is that the solver was
 * already in the kernel (`gcsNew` .. `gcsSolveDetailed`, 26 constraint types,
 * a DogLeg solver with degrees-of-freedom analysis). A driven readout would
 * have been a fraction of the work and would have bought a number a student
 * can read but not type: "make this 2.500 in" would still mean dragging until
 * the readout says so. What driving costs is the classification the solver
 * reports -- under-constrained, redundant, unsatisfied -- which the sketch
 * shows in words rather than moving something the student did not touch.
 *
 * A PROFILE IS A PROPERTY OF THE GRAPH, NOT A THING A STUDENT DECLARES. Points
 * are shared, so a chain of lines and arcs that returns to its first point is
 * closed. `regions` traces every bounded face of the planar arrangement and
 * nests them by containment: a loop inside a loop is a hole, a loop inside a
 * hole is an island. Crossing entities that do not share a point are NOT
 * split; the Trim tool is what makes that point. Construction entities never
 * bound a region.
 */
import type { BrepKernel } from '../../kernel/remus';
import type { ResolvedPlane, Sketch, SketchConstraint, SketchEntity, SketchSolveReport, Vec2, Vec3 } from '../types';
import { add, cross, dot, scale, sub, unit } from '../math';

export interface SketchDocument { entities: SketchEntity[]; constraints: SketchConstraint[] }
export type PointEntity = Extract<SketchEntity, { type: 'point' }>;
export type CurveEntity = Exclude<SketchEntity, { type: 'point' }>;
export const isPoint = (e: SketchEntity): e is PointEntity => e.type === 'point';
export const isCurve = (e: SketchEntity): e is CurveEntity => e.type !== 'point';

export function entity<T extends SketchEntity['type']>(entities: readonly SketchEntity[], id: string, type?: T): Extract<SketchEntity, { type: T }> {
	const found = entities.find((e) => e.id === id);
	if (!found || (type && found.type !== type)) throw Error(`The sketch names a ${type ?? 'entity'} (${id}) that is not in it.`);
	return found as Extract<SketchEntity, { type: T }>;
}
export const pointOf = (entities: readonly SketchEntity[], id: string): Vec2 => { const p = entity(entities, id, 'point'); return [p.x, p.y]; };

/* ---------------------------------------------------------------- lifting */
export const lift = (plane: ResolvedPlane, p: Vec2): Vec3 => add(plane.origin, add(scale(plane.u, p[0]), scale(plane.v, p[1])));
export const drop = (plane: ResolvedPlane, p: Vec3): Vec2 => { const d = sub(p, plane.origin); return [dot(d, plane.u), dot(d, plane.v)]; };

/* ------------------------------------------------------------ 2D helpers */
export const ARC_SAMPLES = 24;
export const CIRCLE_SAMPLES = 64;
/** Counter-clockwise sweep from start to end about center, in (0, 2π]. */
export function arcSweep(center: Vec2, start: Vec2, end: Vec2): number {
	const a0 = Math.atan2(start[1] - center[1], start[0] - center[0]), a1 = Math.atan2(end[1] - center[1], end[0] - center[0]);
	let sweep = a1 - a0; while (sweep <= 1e-12) sweep += Math.PI * 2; while (sweep > Math.PI * 2 + 1e-12) sweep -= Math.PI * 2;
	return sweep;
}
export function arcPoint(center: Vec2, start: Vec2, sweep: number, t: number): Vec2 {
	const r = Math.hypot(start[0] - center[0], start[1] - center[1]), a = Math.atan2(start[1] - center[1], start[0] - center[0]) + sweep * t;
	return [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)];
}
/** Points along a curve entity from its own start toward its own end, ends included. */
export function samples(entities: readonly SketchEntity[], curve: CurveEntity, count?: number): Vec2[] {
	if (curve.type === 'line') return [pointOf(entities, curve.a), pointOf(entities, curve.b)];
	if (curve.type === 'circle') { const c = pointOf(entities, curve.center); const n = count ?? CIRCLE_SAMPLES; return Array.from({ length: n + 1 }, (_, i) => [c[0] + curve.radius * Math.cos(i / n * Math.PI * 2), c[1] + curve.radius * Math.sin(i / n * Math.PI * 2)] as Vec2); }
	const c = pointOf(entities, curve.center), s = pointOf(entities, curve.start), e = pointOf(entities, curve.end), sweep = arcSweep(c, s, e), n = count ?? Math.max(4, Math.ceil(ARC_SAMPLES * sweep / (Math.PI * 2)));
	const out: Vec2[] = []; for (let i = 0; i <= n; i++) out.push(i === n ? e : arcPoint(c, s, sweep, i / n)); return out;
}
export const polygonArea = (points: readonly Vec2[]) => { let a = 0; for (let i = 0; i < points.length; i++) { const p = points[i], r = points[(i + 1) % points.length]; a += p[0] * r[1] - r[0] * p[1]; } return a / 2; };
export function pointInPolygon(points: readonly Vec2[], p: Vec2): boolean {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const a = points[i], b = points[j];
		if (a[1] > p[1] !== b[1] > p[1] && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
	}
	return inside;
}
/** Length of a curve entity. */
export function curveLength(entities: readonly SketchEntity[], curve: CurveEntity): number {
	if (curve.type === 'line') { const a = pointOf(entities, curve.a), b = pointOf(entities, curve.b); return Math.hypot(b[0] - a[0], b[1] - a[1]); }
	if (curve.type === 'circle') return Math.PI * 2 * curve.radius;
	const c = pointOf(entities, curve.center), s = pointOf(entities, curve.start); return Math.hypot(s[0] - c[0], s[1] - c[1]) * arcSweep(c, s, pointOf(entities, curve.end));
}

/* ------------------------------------------------------------------ loops */
/** One traversal of a curve: forward runs start->end, reversed runs end->start. */
export interface LoopStep { entity: CurveEntity; reversed: boolean }
export interface Loop { id: string; steps: LoopStep[]; polyline: Vec2[]; area: number }
export interface Region { id: string; outer: Loop; holes: Loop[]; area: number; centroid: Vec2 }

function endpoints(e: CurveEntity): [string, string] | null { return e.type === 'line' ? [e.a, e.b] : e.type === 'arc' ? [e.start, e.end] : null; }
/** Outgoing tangent direction at one of a curve's endpoints. */
function tangentAt(entities: readonly SketchEntity[], e: CurveEntity, atStart: boolean): Vec2 {
	if (e.type === 'line') { const a = pointOf(entities, e.a), b = pointOf(entities, e.b); const d: Vec2 = atStart ? [b[0] - a[0], b[1] - a[1]] : [a[0] - b[0], a[1] - b[1]]; const n = Math.hypot(...d) || 1; return [d[0] / n, d[1] / n]; }
	if (e.type === 'arc') {
		const c = pointOf(entities, e.center), p = pointOf(entities, atStart ? e.start : e.end); const r: Vec2 = [p[0] - c[0], p[1] - c[1]]; const n = Math.hypot(...r) || 1;
		/* Leaving the start we travel CCW: tangent is the radius rotated +90. Leaving the end we travel CW: rotated -90. */
		return atStart ? [-r[1] / n, r[0] / n] : [r[1] / n, -r[0] / n];
	}
	return [1, 0];
}
function loopPolyline(entities: readonly SketchEntity[], steps: LoopStep[]): Vec2[] {
	const out: Vec2[] = [];
	for (const step of steps) { const s = samples(entities, step.entity); const run = step.reversed ? [...s].reverse() : s; for (let i = 0; i < run.length - 1; i++) out.push(run[i]); }
	return out;
}
/**
 * Every bounded face of the arrangement the non-construction curves form,
 * traced with the interior on the left. A circle is a loop by itself.
 */
export function loops(entities: readonly SketchEntity[]): Loop[] {
	const curves = entities.filter(isCurve).filter((c) => !c.construction);
	const out: Loop[] = [];
	for (const c of curves) if (c.type === 'circle') { const polyline = samples(entities, c).slice(0, -1); out.push({ id: `loop:${c.id}`, steps: [{ entity: c, reversed: false }], polyline, area: Math.abs(polygonArea(polyline)) }); }
	/* Half-edges leaving each point, ordered by angle. */
	type Half = { entity: CurveEntity; reversed: boolean; from: string; to: string; angle: number };
	const leaving = new Map<string, Half[]>();
	const halves: Half[] = [];
	for (const c of curves) {
		const ends = endpoints(c); if (!ends) continue;
		const [a, b] = ends; if (a === b) continue;
		const ta = tangentAt(entities, c, true), tb = tangentAt(entities, c, false);
		const forward: Half = { entity: c, reversed: false, from: a, to: b, angle: Math.atan2(ta[1], ta[0]) };
		const backward: Half = { entity: c, reversed: true, from: b, to: a, angle: Math.atan2(tb[1], tb[0]) };
		halves.push(forward, backward);
		leaving.set(a, [...(leaving.get(a) ?? []), forward]); leaving.set(b, [...(leaving.get(b) ?? []), backward]);
	}
	for (const list of leaving.values()) list.sort((x, y) => x.angle - y.angle);
	const twin = (h: Half) => halves.find((o) => o.entity === h.entity && o.reversed !== h.reversed)!;
	/* next(h): arrive at h.to; the twin leaves h.to; take the half-edge just clockwise of the twin. Interior stays on the left. */
	const next = (h: Half): Half => { const list = leaving.get(h.to)!; const t = twin(h); const i = list.indexOf(t); return list[(i - 1 + list.length) % list.length]; };
	const used = new Set<Half>();
	for (const start of halves) {
		if (used.has(start)) continue;
		const steps: LoopStep[] = []; let h = start; let guard = 0; let closed = false;
		while (guard++ < halves.length + 1) {
			if (used.has(h)) { closed = h === start; break; }
			used.add(h); steps.push({ entity: h.entity, reversed: h.reversed });
			h = next(h);
			if (h === start) { closed = true; break; }
		}
		if (!closed || steps.length < 2) continue;
		/* A dangling chain traversed both ways has zero area; skip it. The unbounded face is clockwise. */
		const polyline = loopPolyline(entities, steps); const area = polygonArea(polyline);
		if (area > 1e-9) out.push({ id: `loop:${steps.map((s) => s.entity.id).join('+')}`, steps, polyline, area });
	}
	return out;
}
const centroidOf = (polyline: Vec2[]): Vec2 => { let x = 0, y = 0; for (const p of polyline) { x += p[0]; y += p[1]; } return [x / polyline.length, y / polyline.length]; };
/** Loops nested by containment: outers at even depth, their immediate children holes. Ids are ordinals by centroid, so a replay produces the same ids. */
export function regions(entities: readonly SketchEntity[]): Region[] {
	const all = loops(entities).sort((a, b) => b.area - a.area);
	const parent = new Map<Loop, Loop | null>();
	for (const l of all) {
		const probe = l.polyline[0]; let p: Loop | null = null;
		for (const candidate of all) { if (candidate === l || candidate.area <= l.area) continue; if (pointInPolygon(candidate.polyline, probe)) { if (!p || candidate.area < p.area) p = candidate; } }
		parent.set(l, p);
	}
	const depth = (l: Loop): number => { let d = 0; let p = parent.get(l) ?? null; while (p) { d++; p = parent.get(p) ?? null; } return d; };
	const out: Region[] = [];
	for (const l of all) {
		if (depth(l) % 2 !== 0) continue;
		const holes = all.filter((h) => parent.get(h) === l);
		out.push({ id: '', outer: l, holes, area: l.area - holes.reduce((n, h) => n + h.area, 0), centroid: centroidOf(l.polyline) });
	}
	out.sort((a, b) => Math.round(a.centroid[0] * 1e4) - Math.round(b.centroid[0] * 1e4) || Math.round(a.centroid[1] * 1e4) - Math.round(b.centroid[1] * 1e4));
	out.forEach((r, i) => (r.id = `r${i}`));
	return out;
}

/* ------------------------------------------------------- kernel wires */
/** The kernel edge handles for a loop, in step order, lifted onto the plane. Returns the edges and the 3D midpoint of each for face-role naming. */
export function loopEdges(k: BrepKernel, entities: readonly SketchEntity[], plane: ResolvedPlane, loop: Loop, hole = false): { edges: number[]; mids: Vec3[]; ids: string[] } {
	const edges: number[] = [], mids: Vec3[] = [], ids: string[] = [];
	const n = scale(plane.normal, hole ? -1 : 1);
	/* The kernel wants a consistent winding: outer CCW about the plane normal, holes CW. Our loops are CCW in (u,v); reverse for holes. */
	const steps = hole ? [...loop.steps].reverse().map((s) => ({ entity: s.entity, reversed: !s.reversed })) : loop.steps;
	for (const step of steps) {
		const e = step.entity;
		if (e.type === 'circle') {
			const c = lift(plane, pointOf(entities, e.center));
			edges.push(k.makeCircleEdge(...c, ...n, e.radius)); mids.push(add(c, scale(plane.u, e.radius))); ids.push(e.id);
		} else if (e.type === 'line') {
			const a = lift(plane, pointOf(entities, step.reversed ? e.b : e.a)), b = lift(plane, pointOf(entities, step.reversed ? e.a : e.b));
			edges.push(k.makeLineEdge(...a, ...b)); mids.push(scale(add(a, b), 0.5)); ids.push(e.id);
		} else {
			const c2 = pointOf(entities, e.center), s2 = pointOf(entities, e.start), e2 = pointOf(entities, e.end), sweep = arcSweep(c2, s2, e2);
			const c = lift(plane, c2), s = lift(plane, s2), t = lift(plane, e2), mid = lift(plane, arcPoint(c2, s2, sweep, 0.5));
			/* A CCW arc from start to end about +normal; traversed reversed it is the same arc from end to start about -normal. */
			edges.push(step.reversed ? k.makeCircleArc3d(...t, ...s, ...c, ...scale(plane.normal, -1)) : k.makeCircleArc3d(...s, ...t, ...c, ...plane.normal));
			mids.push(mid); ids.push(e.id);
		}
	}
	return { edges, mids, ids };
}
/** A planar face for a region: outer wire plus hole wires. */
export function regionFace(k: BrepKernel, entities: readonly SketchEntity[], plane: ResolvedPlane, region: Region): { face: number; mids: { name: string; point: Vec3 }[] } {
	const outer = loopEdges(k, entities, plane, region.outer);
	const wire = k.makeWire(new Uint32Array(outer.edges), true);
	const mids = outer.mids.map((point, i) => ({ name: `side.${i}`, point }));
	const holeWires = region.holes.map((h, hi) => { const built = loopEdges(k, entities, plane, h, true); built.mids.forEach((point, i) => mids.push({ name: `hole.${hi}.${i}`, point })); return k.makeWire(new Uint32Array(built.edges), true); });
	const face = holeWires.length ? k.makeFaceFromWires(wire, new Uint32Array(holeWires)) : k.makePlanarFaceFromWire(wire);
	return { face, mids };
}
/** Regions lifted to 3D for drawing and picking. */
export function regionOutlines(entities: readonly SketchEntity[], plane: ResolvedPlane): { id: string; outline: Vec3[]; holes: Vec3[][]; area: number }[] {
	return regions(entities).map((r) => ({ id: r.id, outline: r.outer.polyline.map((p) => lift(plane, p)), holes: r.holes.map((h) => h.polyline.map((p) => lift(plane, p))), area: r.area }));
}

/* ------------------------------------------------------------ solving */
/** Constraint kinds that carry a driving number. */
export const DIMENSIONED: readonly SketchConstraint['type'][] = ['distance', 'pointLineDistance', 'angle', 'circleRadius', 'arcRadius', 'fixX', 'fixY'];
/**
 * Solve the constraints and return the moved entities. Rebuilds the kernel
 * sketch from scratch every call: a sketch is tens of entities, the build is
 * microseconds, and a persistent solver object would be one more piece of
 * kernel state to keep in step with a checkpoint stack.
 *
 * CALLED INSIDE A SCRATCH CHECKPOINT by every caller, because a gcs sketch is
 * kernel state with no free call: `k.checkpoint()` before and `k.restore()`
 * after leave the kernel exactly as it was.
 */
export function solveSketch(k: BrepKernel, doc: SketchDocument, maxIterations = 200, tolerance = 1e-9): { entities: SketchEntity[]; report: SketchSolveReport } {
	const entities = doc.entities.map((e) => ({ ...e }));
	if (!doc.constraints.length) return { entities, report: { converged: true, classification: 'solved', dof: countDof(doc), maxResidual: 0, trouble: [] } };
	const sketch = k.gcsNew();
	const points = new Map<string, number>(), lines = new Map<string, number>(), circles = new Map<string, number>(), arcs = new Map<string, number>();
	for (const e of entities) if (e.type === 'point') points.set(e.id, k.gcsAddPoint(sketch, e.x, e.y, !!e.fixed));
	const point = (id: string) => { const h = points.get(id); if (h === undefined) throw Error(`The sketch names a point (${id}) that is not in it.`); return h; };
	for (const e of entities) {
		if (e.type === 'line') lines.set(e.id, k.gcsAddLine(sketch, point(e.a), point(e.b)));
		else if (e.type === 'circle') circles.set(e.id, k.gcsAddCircle(sketch, point(e.center), e.radius));
		else if (e.type === 'arc') arcs.set(e.id, k.gcsAddArc(sketch, point(e.center), point(e.start), point(e.end)));
	}
	const line = (id: string) => { const h = lines.get(id); if (h === undefined) throw Error(`The sketch names a line (${id}) that is not in it.`); return h; };
	const circle = (id: string) => { const h = circles.get(id); if (h === undefined) throw Error(`The sketch names a circle (${id}) that is not in it.`); return h; };
	const arc = (id: string) => { const h = arcs.get(id); if (h === undefined) throw Error(`The sketch names an arc (${id}) that is not in it.`); return h; };
	const handles = new Map<number, string>();
	for (const c of doc.constraints) {
		let payload: Record<string, unknown>;
		switch (c.type) {
			case 'coincident': payload = { type: 'coincident', a: point(c.a), b: point(c.b) }; break;
			case 'distance': payload = { type: 'distance', a: point(c.a), b: point(c.b), value: c.value }; break;
			case 'pointLineDistance': payload = { type: 'pointLineDistance', point: point(c.point), line: line(c.line), value: c.value }; break;
			case 'horizontal': payload = { type: 'horizontal', line: line(c.line) }; break;
			case 'vertical': payload = { type: 'vertical', line: line(c.line) }; break;
			case 'angle': payload = { type: 'angle', l1: line(c.l1), l2: line(c.l2), value: c.value * Math.PI / 180 }; break;
			case 'parallel': payload = { type: 'parallel', l1: line(c.l1), l2: line(c.l2) }; break;
			case 'perpendicular': payload = { type: 'perpendicular', l1: line(c.l1), l2: line(c.l2) }; break;
			case 'equalLength': payload = { type: 'equalLength', l1: line(c.l1), l2: line(c.l2) }; break;
			case 'circleRadius': payload = { type: 'circleRadius', circle: circle(c.circle), value: c.value }; break;
			case 'arcRadius': { const a = entity(entities, c.arc, 'arc'); payload = { type: 'distance', a: point(a.center), b: point(a.start), value: c.value }; break; }
			case 'equalRadius': {
				const isArcA = arcs.has(c.a), isArcB = arcs.has(c.b);
				payload = isArcA && isArcB ? { type: 'equalRadiusArcArc', arc1: arc(c.a), arc2: arc(c.b) } : !isArcA && !isArcB ? { type: 'equalRadiusCircleCircle', circle1: circle(c.a), circle2: circle(c.b) } : { type: 'equalRadiusArcCircle', arc: arc(isArcA ? c.a : c.b), circle: circle(isArcA ? c.b : c.a) };
				break;
			}
			case 'pointOnCircle': payload = { type: 'pointOnCircle', point: point(c.point), circle: circle(c.circle) }; break;
			case 'pointOnArc': payload = { type: 'pointOnArc', point: point(c.point), arc: arc(c.arc) }; break;
			case 'tangentLineArc': payload = { type: 'tangentLineArc', line: line(c.line), arc: arc(c.arc), point: point(c.point) }; break;
			case 'tangentArcArc': payload = { type: 'tangentArcArc', arc1: arc(c.arc1), arc2: arc(c.arc2), point: point(c.point) }; break;
			case 'concentric': {
				const isArcA = arcs.has(c.a), isArcB = arcs.has(c.b);
				payload = isArcA && isArcB ? { type: 'concentricArcArc', arc1: arc(c.a), arc2: arc(c.b) } : isArcA || isArcB ? { type: 'concentricArcCircle', arc: arc(isArcA ? c.a : c.b), circle: circle(isArcA ? c.b : c.a) } : { type: 'coincident', a: point(entity(entities, c.a, 'circle').center), b: point(entity(entities, c.b, 'circle').center) };
				break;
			}
			case 'midpoint': payload = { type: 'midpoint', point: point(c.point), line: line(c.line) }; break;
			case 'symmetric': payload = { type: 'symmetric', a: point(c.a), b: point(c.b), axis: line(c.axis) }; break;
			case 'fixX': payload = { type: 'fixX', point: point(c.point), value: c.value }; break;
			case 'fixY': payload = { type: 'fixY', point: point(c.point), value: c.value }; break;
		}
		handles.set(k.gcsAddConstraint(sketch, JSON.stringify(payload)), c.id);
	}
	const raw = k.gcsSolveDetailed(sketch, maxIterations, tolerance);
	const result = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { converged: boolean; classification: string; dof: number; maxResidual: number; rolledBack: boolean; constraintResiduals?: { constraint?: number; handle?: number; residual: number }[] };
	if (!result.rolledBack) {
		for (const e of entities) {
			if (e.type === 'point') { const p = k.gcsPointPosition(sketch, points.get(e.id)!); e.x = p[0]; e.y = p[1]; }
			else if (e.type === 'circle') e.radius = k.gcsCircleRadius(sketch, circles.get(e.id)!);
		}
	}
	const trouble = (result.constraintResiduals ?? []).filter((r) => Math.abs(r.residual) > 1e-6).map((r) => handles.get(r.constraint ?? r.handle ?? -1)).filter((id): id is string => !!id);
	const classification = (['solved', 'underConstrained', 'redundant', 'unsatisfied'] as const).find((c) => c === result.classification) ?? 'unsolved';
	return { entities, report: { converged: result.converged, classification, dof: result.dof, maxResidual: result.maxResidual, trouble } };
}
/** The free parameters an unconstrained sketch has: 2 per non-fixed point, 1 per circle. */
export function countDof(doc: SketchDocument): number {
	let dof = 0;
	for (const e of doc.entities) if (e.type === 'point' && !e.fixed) dof += 2; else if (e.type === 'circle') dof += 1;
	return dof;
}

/* ------------------------------------------------------- v1 conversion */
/**
 * A saved v1 sketch as entities: polygons and wires become shared points with
 * lines and arcs; circles stay circles. Coordinates are dropped onto
 * `basis`, which defaults to the sketch's own plane held by value -- the one
 * frame that is exactly right for a plane drawn on any face, tilted or not.
 */
export function legacySketchToEntities(sketch: Sketch, basis: ResolvedPlane = sketch.plane): { plane: import('../types').PlaneRef; entities: SketchEntity[]; constraints: SketchConstraint[] } {
	const plane: import('../types').PlaneRef = { kind: 'fixed', plane: basis };
	const entities: SketchEntity[] = [];
	let n = 0;
	const id = (prefix: string) => `${prefix}${n++}`;
	const point = (p: Vec3): string => { const [x, y] = drop(basis, p); const existing = entities.find((e): e is PointEntity => e.type === 'point' && Math.abs(e.x - x) < 1e-9 && Math.abs(e.y - y) < 1e-9); if (existing) return existing.id; const pid = id('p'); entities.push({ id: pid, type: 'point', x, y }); return pid; };
	const profile = (shape: Sketch['profile']) => {
		if (shape.type === 'circle') entities.push({ id: id('c'), type: 'circle', center: point(shape.center), radius: shape.radius });
		else if (shape.type === 'polygon') shape.points.forEach((p, i) => entities.push({ id: id('l'), type: 'line', a: point(p), b: point(shape.points[(i + 1) % shape.points.length]) }));
		else for (const segment of shape.segments) {
			if (segment.type === 'line') entities.push({ id: id('l'), type: 'line', a: point(segment.start), b: point(segment.end) });
			else {
				/* A v1 arc runs start -> end about +normal, which is CCW in (u, v) when the basis normal is the sketch normal. */
				const c = drop(basis, segment.center), s = drop(basis, segment.start), e = drop(basis, segment.end);
				const ccw = dot(basis.normal, sketch.plane.normal) > 0 ? arcSweep(c, s, e) <= Math.PI * 2 : false;
				entities.push(ccw ? { id: id('a'), type: 'arc', center: point(segment.center), start: point(segment.start), end: point(segment.end) } : { id: id('a'), type: 'arc', center: point(segment.center), start: point(segment.end), end: point(segment.start) });
			}
		}
	};
	profile(sketch.profile); for (const hole of sketch.holes ?? []) profile(hole);
	return { plane, entities, constraints: [] };
}
/** The three datum planes, offset along their normals. ONE definition, shared with the engine. */
export function datumPlane(datum: 'XY' | 'XZ' | 'YZ', offset = 0): ResolvedPlane {
	const base: Record<'XY' | 'XZ' | 'YZ', ResolvedPlane> = {
		XY: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] },
		XZ: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], normal: [0, -1, 0] },
		YZ: { origin: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 1], normal: [1, 0, 0] }
	};
	const p = base[datum];
	return { ...p, origin: scale(p.normal, offset) };
}
/** A plane from a normal and a point on it, with a deterministic in-plane basis: the ONE rule for a face plane. */
export function planeFromNormal(normal: Vec3, through: Vec3): ResolvedPlane {
	const n = unit(normal);
	const seed: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
	const u = unit(cross(seed, n)), v = cross(n, u);
	/* The origin is the world origin projected onto the plane, so it depends on the plane alone and not on the face's extent. */
	const d = dot(n, through);
	return { origin: scale(n, d), u, v, normal: n };
}

/* ------------------------------------------------- 2D curve arithmetic */
/**
 * WHERE A POINT SITS ALONG A CURVE, in the curve's own parameter: a line's
 * 0..1 from `a` to `b`, a circle's angle in [0, 2π) from +u, an arc's 0..1 of
 * its counter-clockwise sweep. The trim tool orders crossings by this, so one
 * definition serves every curve type and a segment "between crossings" is
 * a parameter interval whatever the curve is.
 */
export const TAU = Math.PI * 2;
const angleOf = (c: Vec2, p: Vec2) => { let a = Math.atan2(p[1] - c[1], p[0] - c[0]); if (a < 0) a += TAU; return a; };
export function curveParam(entities: readonly SketchEntity[], curve: CurveEntity, p: Vec2): number {
	if (curve.type === 'line') { const a = pointOf(entities, curve.a), b = pointOf(entities, curve.b); const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy; return len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0; }
	if (curve.type === 'circle') return angleOf(pointOf(entities, curve.center), p);
	const c = pointOf(entities, curve.center), s = pointOf(entities, curve.start), sweep = arcSweep(c, s, pointOf(entities, curve.end));
	let rel = angleOf(c, p) - angleOf(c, s); if (rel < -1e-9) rel += TAU;
	return rel / sweep;
}
/** The point at a curve parameter (see `curveParam`). */
export function curvePoint(entities: readonly SketchEntity[], curve: CurveEntity, t: number): Vec2 {
	if (curve.type === 'line') { const a = pointOf(entities, curve.a), b = pointOf(entities, curve.b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
	if (curve.type === 'circle') { const c = pointOf(entities, curve.center); return [c[0] + curve.radius * Math.cos(t), c[1] + curve.radius * Math.sin(t)]; }
	const c = pointOf(entities, curve.center), s = pointOf(entities, curve.start); return arcPoint(c, s, arcSweep(c, s, pointOf(entities, curve.end)), t);
}
/** Whether a parameter lies on the curve's own extent: always for a circle, 0..1 for a line or an arc. */
const withinExtent = (curve: CurveEntity, t: number, eps: number) => curve.type === 'circle' || (t >= -eps && t <= 1 + eps);
/** A point on a curve's supporting line or circle, as that curve's parameter, or null when it is off the finite extent. */
function paramIfOn(entities: readonly SketchEntity[], curve: CurveEntity, p: Vec2, eps: number): number | null {
	const t = curveParam(entities, curve, p);
	return withinExtent(curve, t, eps) ? t : null;
}
export interface Crossing { t: number; point: Vec2; other: string; tOther: number }
/** The support of a curve: a line through two points, or a circle. */
type Support = { kind: 'line'; a: Vec2; d: Vec2 } | { kind: 'circle'; c: Vec2; r: number };
function support(entities: readonly SketchEntity[], curve: CurveEntity): Support {
	if (curve.type === 'line') { const a = pointOf(entities, curve.a), b = pointOf(entities, curve.b); return { kind: 'line', a, d: [b[0] - a[0], b[1] - a[1]] }; }
	const c = pointOf(entities, curve.center);
	return { kind: 'circle', c, r: curve.type === 'circle' ? curve.radius : Math.hypot(...([pointOf(entities, curve.start)[0] - c[0], pointOf(entities, curve.start)[1] - c[1]] as Vec2)) };
}
/** Every point where two supports meet, ignoring extent. Parallel lines and coincident circles meet nowhere. */
function supportCrossings(p: Support, q: Support): Vec2[] {
	if (p.kind === 'line' && q.kind === 'line') {
		const det = p.d[0] * q.d[1] - p.d[1] * q.d[0]; if (Math.abs(det) < 1e-12) return [];
		const w: Vec2 = [q.a[0] - p.a[0], q.a[1] - p.a[1]]; const t = (w[0] * q.d[1] - w[1] * q.d[0]) / det;
		return [[p.a[0] + p.d[0] * t, p.a[1] + p.d[1] * t]];
	}
	if (p.kind === 'line' || q.kind === 'line') {
		const line = (p.kind === 'line' ? p : q) as Extract<Support, { kind: 'line' }>, circle = (p.kind === 'circle' ? p : q) as Extract<Support, { kind: 'circle' }>;
		const f: Vec2 = [line.a[0] - circle.c[0], line.a[1] - circle.c[1]], A = line.d[0] * line.d[0] + line.d[1] * line.d[1], B = 2 * (f[0] * line.d[0] + f[1] * line.d[1]), C = f[0] * f[0] + f[1] * f[1] - circle.r * circle.r;
		if (A < 1e-18) return [];
		let disc = B * B - 4 * A * C; if (disc < -1e-9 * A) return []; disc = Math.max(0, disc);
		const roots = disc < 1e-18 ? [-B / (2 * A)] : [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)];
		return roots.map((t) => [line.a[0] + line.d[0] * t, line.a[1] + line.d[1] * t] as Vec2);
	}
	const d = Math.hypot(q.c[0] - p.c[0], q.c[1] - p.c[1]); if (d < 1e-12 || d > p.r + q.r + 1e-9 || d < Math.abs(p.r - q.r) - 1e-9) return [];
	const a = (p.r * p.r - q.r * q.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, p.r * p.r - a * a)), u: Vec2 = [(q.c[0] - p.c[0]) / d, (q.c[1] - p.c[1]) / d], m: Vec2 = [p.c[0] + u[0] * a, p.c[1] + u[1] * a];
	return h < 1e-12 ? [m] : [[m[0] - u[1] * h, m[1] + u[0] * h], [m[0] + u[1] * h, m[1] - u[0] * h]];
}
/**
 * Where a curve crosses every other curve in the sketch, on both finite
 * extents, as parameters along `curve`. Construction geometry counts: a
 * construction line is a trim boundary, exactly as it is on the drawing
 * board. A crossing at a shared point comes back too; callers that want the
 * interior drop `t` near 0 and 1 themselves.
 */
export function crossings(entities: readonly SketchEntity[], curve: CurveEntity, eps = 1e-7): Crossing[] {
	const out: Crossing[] = [], mine = support(entities, curve);
	for (const other of entities) {
		if (!isCurve(other) || other.id === curve.id) continue;
		for (const point of supportCrossings(mine, support(entities, other))) {
			const t = paramIfOn(entities, curve, point, eps), tOther = paramIfOn(entities, other, point, eps);
			if (t === null || tOther === null) continue;
			out.push({ t, point, other: other.id, tOther });
		}
	}
	return out.sort((x, y) => x.t - y.t);
}
/** Where a ray from `from` along `direction` first meets any curve other than `except`, as the distance along the ray and the curve it met. */
export function rayHit(entities: readonly SketchEntity[], from: Vec2, direction: Vec2, except: string, eps = 1e-7): { distance: number; point: Vec2; other: string } | null {
	const n = Math.hypot(direction[0], direction[1]); if (n < 1e-12) return null;
	const ray: Support = { kind: 'line', a: from, d: [direction[0] / n, direction[1] / n] };
	let best: { distance: number; point: Vec2; other: string } | null = null;
	for (const other of entities) {
		if (!isCurve(other) || other.id === except) continue;
		for (const point of supportCrossings(ray, support(entities, other))) {
			const distance = (point[0] - from[0]) * ray.d[0] + (point[1] - from[1]) * ray.d[1];
			if (distance <= eps || paramIfOn(entities, other, point, eps) === null) continue;
			if (!best || distance < best.distance) best = { distance, point, other: other.id };
		}
	}
	return best;
}
