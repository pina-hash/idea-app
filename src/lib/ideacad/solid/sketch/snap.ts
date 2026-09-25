/**
 * QUICK SNAPPING, AND THE RELATION A SNAP LEAVES BEHIND. Mr. Pina asked on
 * 2026-09-23 for "relations and quick snapping to align sketch entities"
 * (feedback R05), and decision 31 is what sets the default: IdeaCAD is for
 * quick ideas, "extremely quick to use", so a snap that lands ADDS the
 * relation that keeps it there, the way SolidWorks infers one, and holding
 * Ctrl (Command on a Mac) places the point freely with neither. An unwanted
 * relation is one undo away, because it is committed in the same history step
 * as the entity that created it.
 *
 * WHERE A PRESS LANDS, IN ORDER. A target that is a POINT always outranks one
 * that is a LINE, because a line runs through the point and would otherwise
 * make it unreachable -- the rule the original snap already stated as "the
 * smallest target is always reachable":
 *
 *   1. an existing point (the caller SHARES it: no twin, no relation needed),
 *   2. the origin,
 *   3. the midpoint of a line,
 *   4. where two curves cross,
 *   5. on a line, circle or arc -- at the spot where a level, plumb or
 *      alignment guide crosses it when one is also in reach, else the nearest
 *      spot on it,
 *   6. lined up with a point the pointer passed over (a dashed guide), and
 *   7. level or plumb with the previous point of a line chain.
 *
 * THE BRIEF THAT ASKED FOR THIS PUT ON-CURVE ABOVE INTERSECTION, AND THAT
 * ORDER CANNOT WORK: every intersection lies on two curves, so the on-curve
 * snap is always in reach wherever an intersection is and the intersection
 * would never be offered. Intersection is a point, so it goes with the points.
 * Where an alignment guide and the level/plumb guide are both in reach and
 * run the same way, the NEARER one wins; where they cross, the press lands on
 * the crossing and gets both.
 *
 * WHAT IS INFERRED, AND WHAT IS NOT. A point that lands on a midpoint gets a
 * Midpoint relation; on a line, a Distance-to-line of ZERO (the kernel's 2D
 * solver has no point-on-line kind -- its 26 are listed in
 * `remus_wasm_bg.d.ts` -- and the stored vocabulary may not grow here, so
 * zero is how "on the line" is spelled, measured to pull a point onto the
 * line's full length and to count as one freedom, not a redundant one); on a
 * circle or an arc, Point on circle / Point on arc; on a crossing, one of
 * those for each curve. A line STEP that landed level or plumb gets
 * Horizontal or Vertical on the line, which is what the chain always did. An
 * ALIGNMENT with a passed-over point is a guide only, as it is in SolidWorks:
 * two points level with each other have no relation kind of their own, and
 * the one way to say it (a construction line) would draw a line nobody asked
 * for on every aligned press.
 *
 * THE POINT IS NOT SPLIT INTO THE CURVE IT LANDED ON. A line ending on the
 * middle of an edge is held there by its relation, but the edge is not cut, so
 * the closed regions are exactly what they were; Trim is still what makes a
 * T-junction. Cutting the edge would change what a region IS on a press that
 * only meant to line something up.
 */
import { newEntityId } from '../features';
import { crossingsBetween, curveParam, isCurve, pointOf, type CurveEntity } from './model';
import type { SketchConstraint, SketchEntity, Vec2 } from '../types';

export type SnapKind = 'point' | 'origin' | 'midpoint' | 'intersection' | 'onCurve' | 'alignment' | 'horizontal' | 'vertical' | 'none';
/** Level (the same v) or plumb (the same u). */
export type Level = 'horizontal' | 'vertical';
/** A curve a snap landed on, with its type, so the relation it earns can be spelled without the entity list. */
export interface SnapCurve { id: string; type: CurveEntity['type'] }
export interface Snap {
	at: Vec2; kind: SnapKind;
	/** The existing point the press landed ON (kind `point`), which the caller SHARES. */
	point?: string;
	/** The curves it landed on: the line whose middle it is, the curve it is on, the two that cross there. */
	curves?: SnapCurve[];
	/** The previous point, when the step from it is level or plumb (`level`). */
	reference?: Vec2;
	level?: Level;
	/** Points the press is lined up with, each drawn as a dashed guide. Guides only: no relation. */
	aligned?: { from: Vec2; axis: Level }[];
}
export interface SnapContext {
	entities: readonly SketchEntity[]; radius: number;
	/** Points that may not be snapped to -- a dragged point -- and, with them, every curve naming one, since those move too. */
	exclude?: ReadonlySet<string>;
	/** The previous point of a chain: what level and plumb are measured from. */
	reference?: Vec2 | null;
	/** Points recently passed over: what an alignment guide is drawn from. */
	woken?: readonly Vec2[];
	/** Ctrl or Command held: no snap at all, and so no relation. */
	free?: boolean;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const INTERIOR = 1e-9;
const curvePointIds = (c: CurveEntity): string[] => c.type === 'line' ? [c.a, c.b] : c.type === 'circle' ? [c.center] : [c.center, c.start, c.end];
/**
 * The nearest spot ON a curve's own extent to `at`, or null when that spot is
 * one of its ends (an end is a point, and the point snap has already had its
 * turn) or the question has no answer (a press on a circle's center).
 */
export function nearestOnCurve(entities: readonly SketchEntity[], c: CurveEntity, at: Vec2): Vec2 | null {
	if (c.type === 'line') {
		const a = pointOf(entities, c.a), b = pointOf(entities, c.b), dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
		if (!len2) return null;
		const t = ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / len2;
		return t > INTERIOR && t < 1 - INTERIOR ? [a[0] + t * dx, a[1] + t * dy] : null;
	}
	const center = pointOf(entities, c.center), d = dist(at, center);
	if (d < 1e-12) return null;
	const r = c.type === 'circle' ? c.radius : dist(pointOf(entities, c.start), center);
	const p: Vec2 = [center[0] + (at[0] - center[0]) * r / d, center[1] + (at[1] - center[1]) * r / d];
	if (c.type === 'circle') return p;
	const t = curveParam(entities, c, p);
	return t > INTERIOR && t < 1 - INTERIOR ? p : null;
}
/** A level or plumb guide: every point with v = `value` (horizontal) or u = `value` (vertical). */
interface Guide { axis: Level; value: number; from: Vec2; source: 'reference' | number }
/** Where a guide crosses a curve's own extent. */
function guideCrossings(entities: readonly SketchEntity[], c: CurveEntity, g: Guide): Vec2[] {
	/* A level guide fixes v (index 1) and runs along u; a plumb one fixes u and runs along v. */
	const across = g.axis === 'horizontal' ? 1 : 0, along = 1 - across;
	if (c.type === 'line') {
		const a = pointOf(entities, c.a), b = pointOf(entities, c.b), span = b[across] - a[across];
		if (Math.abs(span) < 1e-12) return [];
		const t = (g.value - a[across]) / span;
		if (!(t > INTERIOR && t < 1 - INTERIOR)) return [];
		const p: Vec2 = [0, 0]; p[across] = g.value; p[along] = a[along] + t * (b[along] - a[along]);
		return [p];
	}
	const center = pointOf(entities, c.center), r = c.type === 'circle' ? c.radius : dist(pointOf(entities, c.start), center);
	const off = g.value - center[across];
	if (Math.abs(off) > r) return [];
	const half = Math.sqrt(Math.max(0, r * r - off * off));
	const out: Vec2[] = [];
	for (const s of half < 1e-12 ? [0] : [-half, half]) { const p: Vec2 = [0, 0]; p[across] = g.value; p[along] = center[along] + s; out.push(p); }
	return c.type === 'circle' ? out : out.filter((p) => { const t = curveParam(entities, c, p); return t > INTERIOR && t < 1 - INTERIOR; });
}
/** What a guide contributes to a snap: level/plumb with the reference, or a dashed alignment. */
const guideFields = (g: Guide): Pick<Snap, 'reference' | 'level' | 'aligned'> => g.source === 'reference' ? { reference: g.from, level: g.axis } : { aligned: [{ from: g.from, axis: g.axis }] };
const mergeFields = (a: Pick<Snap, 'reference' | 'level' | 'aligned'>, b: Pick<Snap, 'reference' | 'level' | 'aligned'>) => {
	const aligned = [...(a.aligned ?? []), ...(b.aligned ?? [])];
	return { ...a, ...b, ...(aligned.length ? { aligned } : {}) };
};
const snapCurve = (c: CurveEntity): SnapCurve => ({ id: c.id, type: c.type });

/** Where a press or a drag lands: see the header for the order and why. */
export function snapPoint(at: Vec2, ctx: SnapContext): Snap {
	if (ctx.free) return { at, kind: 'none' };
	const r = ctx.radius, excluded = ctx.exclude ?? new Set<string>();
	let point: { id: string; d: number; at: Vec2 } | null = null;
	for (const e of ctx.entities) {
		if (e.type !== 'point' || excluded.has(e.id)) continue;
		const d = dist([e.x, e.y], at);
		if (d <= r && (!point || d < point.d)) point = { id: e.id, d, at: [e.x, e.y] };
	}
	if (point) return { at: point.at, kind: 'point', point: point.id };
	if (Math.hypot(at[0], at[1]) <= r) return { at: [0, 0], kind: 'origin' };
	/*
	 * A GUIDE CAN LAND EXACTLY ON A POINT THAT IS ALREADY THERE -- two corners'
	 * guides cross at a third corner of a rectangle -- with the pointer too far
	 * from it for the point snap. Landing there as an alignment would put a
	 * TWIN on top of the corner, which is the one thing every tool here is
	 * written never to do, so such a landing is the point itself.
	 */
	const settle = (s: Snap): Snap => {
		const tol = 1e-9 * Math.max(1, Math.abs(s.at[0]), Math.abs(s.at[1]));
		const twin = ctx.entities.find((e) => e.type === 'point' && !excluded.has(e.id) && dist([e.x, e.y], s.at) <= tol);
		return twin?.type === 'point' ? { at: [twin.x, twin.y], kind: 'point', point: twin.id } : s;
	};

	const live = ctx.entities.filter(isCurve).filter((c) => !excluded.has(c.id) && !curvePointIds(c).some((id) => excluded.has(id)));
	let mid: { c: CurveEntity; d: number; at: Vec2 } | null = null;
	for (const c of live) {
		if (c.type !== 'line') continue;
		const a = pointOf(ctx.entities, c.a), b = pointOf(ctx.entities, c.b), m: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = dist(m, at);
		if (d <= r && (!mid || d < mid.d)) mid = { c, d, at: m };
	}
	if (mid) return { at: mid.at, kind: 'midpoint', curves: [snapCurve(mid.c)] };

	const near = live.map((c) => ({ c, p: nearestOnCurve(ctx.entities, c, at) })).filter((x): x is { c: CurveEntity; p: Vec2 } => !!x.p && dist(x.p, at) <= r).sort((x, y) => dist(x.p, at) - dist(y.p, at));
	let cross: { a: CurveEntity; b: CurveEntity; d: number; at: Vec2 } | null = null;
	for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
		for (const p of crossingsBetween(ctx.entities, near[i].c, near[j].c)) {
			const d = dist(p, at);
			if (d <= r && (!cross || d < cross.d)) cross = { a: near[i].c, b: near[j].c, d, at: p };
		}
	}
	if (cross) return { at: cross.at, kind: 'intersection', curves: [snapCurve(cross.a), snapCurve(cross.b)] };

	const ref = ctx.reference ?? null, guides: Guide[] = [];
	if (ref) guides.push({ axis: 'horizontal', value: ref[1], from: ref, source: 'reference' }, { axis: 'vertical', value: ref[0], from: ref, source: 'reference' });
	(ctx.woken ?? []).forEach((w, i) => { if (!ref || dist(w, ref) > 1e-9) guides.push({ axis: 'horizontal', value: w[1], from: w, source: i }, { axis: 'vertical', value: w[0], from: w, source: i }); });
	const gap = (g: Guide) => Math.abs((g.axis === 'horizontal' ? at[1] : at[0]) - g.value);
	const reach = guides.filter((g) => gap(g) <= r);

	if (near.length) {
		const on = near[0];
		let combo: { g: Guide; d: number; at: Vec2 } | null = null;
		for (const g of reach) for (const p of guideCrossings(ctx.entities, on.c, g)) { const d = dist(p, at); if (d <= r && (!combo || d < combo.d)) combo = { g, d, at: p }; }
		if (combo) return settle({ at: combo.at, kind: 'onCurve', curves: [snapCurve(on.c)], ...guideFields(combo.g) });
		return { at: on.p, kind: 'onCurve', curves: [snapCurve(on.c)] };
	}
	if (!reach.length) return { at, kind: 'none' };
	/* Two guides running across each other from DIFFERENT points put the press on their crossing, with both. The same point's own two guides meet only at that point, which is a zero-length step, so they never pair. */
	let pair: { h: Guide; v: Guide; d: number } | null = null;
	for (const h of reach) for (const v of reach) {
		if (h.axis !== 'horizontal' || v.axis !== 'vertical' || h.source === v.source) continue;
		const d = dist([v.value, h.value], at);
		if (!pair || d < pair.d) pair = { h, v, d };
	}
	if (pair) {
		const fields = mergeFields(guideFields(pair.h), guideFields(pair.v));
		const kind: SnapKind = pair.h.source === 'reference' ? 'horizontal' : pair.v.source === 'reference' ? 'vertical' : 'alignment';
		return settle({ at: [pair.v.value, pair.h.value], kind, ...fields });
	}
	/* One guide: the nearer, and on a tie the level one first, which is the order the original snap took. */
	const one = [...reach].sort((x, y) => gap(x) - gap(y) || (x.axis === 'horizontal' ? -1 : 1))[0];
	const landed: Vec2 = one.axis === 'horizontal' ? [at[0], one.value] : [one.value, at[1]];
	return settle({ at: landed, kind: one.source === 'reference' ? one.axis : 'alignment', ...guideFields(one) });
}

/* ------------------------------------------------------------ inference */
/** The relation that holds a point on a curve: Distance to line at zero, Point on circle, Point on arc. */
export function onCurveRelation(point: string, c: SnapCurve): SketchConstraint {
	const id = newEntityId();
	if (c.type === 'line') return { id, type: 'pointLineDistance', point, line: c.id, value: 0 };
	if (c.type === 'circle') return { id, type: 'pointOnCircle', point, circle: c.id };
	return { id, type: 'pointOnArc', point, arc: c.id };
}
/** The relations a point placed by `snap` carries, so the next solve keeps it where it landed. Level and plumb belong to the STEP, not the point, and the chain adds them. */
export function snapRelations(snap: Pick<Snap, 'kind' | 'curves'>, point: string): SketchConstraint[] {
	const curves = snap.curves ?? [];
	if (snap.kind === 'midpoint' && curves[0]?.type === 'line') return [{ id: newEntityId(), type: 'midpoint', point, line: curves[0].id }];
	if (snap.kind === 'onCurve' || snap.kind === 'intersection') return curves.map((c) => onCurveRelation(point, c));
	return [];
}
/** The step's own level or plumb, whichever way the snap said it. */
export const snapLevel = (snap: Pick<Snap, 'kind' | 'level'>): Level | undefined => snap.level ?? (snap.kind === 'horizontal' || snap.kind === 'vertical' ? snap.kind : undefined);
/** Two relations saying the same thing: same kind, same entities, same number. The id is the only field that may differ. */
export function sameRelation(a: SketchConstraint, b: SketchConstraint): boolean {
	if (a.type !== b.type) return false;
	const fields = (c: SketchConstraint) => Object.entries(c).filter(([k]) => k !== 'id').sort(([x], [y]) => x.localeCompare(y));
	return JSON.stringify(fields(a)) === JSON.stringify(fields(b));
}
/**
 * A relation the graph already makes true: a point held at zero distance from
 * a line it is an END of, or on an arc it starts or ends. The solver reads it
 * as an equation that removes no freedom, so a sketch that is otherwise fully
 * defined reads "Over defined" (measured on the kernel: a line with both ends
 * fixed and one of them also on the line answers `redundant`). A join or a
 * trim can make an inferred relation one of these, which is why `pruneDraft`
 * drops them.
 */
export function trivialRelation(entities: readonly SketchEntity[], c: SketchConstraint): boolean {
	if (c.type === 'pointLineDistance' && c.value === 0) { const l = entities.find((e) => e.id === c.line); return l?.type === 'line' && (l.a === c.point || l.b === c.point); }
	if (c.type === 'pointOnArc') { const a = entities.find((e) => e.id === c.arc); return a?.type === 'arc' && (a.start === c.point || a.end === c.point); }
	return false;
}
/**
 * Add inferred relations to a constraint list without saying anything twice:
 * one already there is skipped, one the graph already makes true is skipped,
 * and a point held at zero distance from a line that now gets a Midpoint on
 * the same line loses the zero distance, which the midpoint implies.
 */
export function withRelations(entities: readonly SketchEntity[], constraints: readonly SketchConstraint[], fresh: readonly SketchConstraint[]): SketchConstraint[] {
	let out = [...constraints];
	for (const c of fresh) {
		if (trivialRelation(entities, c) || out.some((e) => sameRelation(e, c))) continue;
		if (c.type === 'pointLineDistance' && c.value === 0 && out.some((e) => e.type === 'midpoint' && e.point === c.point && e.line === c.line)) continue;
		if (c.type === 'midpoint') out = out.filter((e) => !(e.type === 'pointLineDistance' && e.value === 0 && e.point === c.point && e.line === c.line));
		out.push(c);
	}
	return out;
}

/* --------------------------------------------------------------- words */
const CURVE_WORD: Record<SnapCurve['type'], string> = { line: 'line', circle: 'circle', arc: 'arc' };
/** The glyph and the word the cursor cue shows beside the pointer. The viewport marker is the same kind drawn in the plane; the word is what makes it readable without knowing the shapes. */
export function snapCue(snap: Snap): { glyph: string; word: string } {
	const levelWord = snap.level && snap.kind !== 'horizontal' && snap.kind !== 'vertical' ? `, ${snap.level}` : '';
	const alignWord = snap.aligned?.length && snap.kind !== 'alignment' ? ', aligned' : '';
	switch (snap.kind) {
		case 'point': return { glyph: '■', word: 'Point' };
		case 'origin': return { glyph: '+', word: 'Origin' };
		case 'midpoint': return { glyph: '△', word: 'Midpoint' };
		case 'intersection': return { glyph: '×', word: 'Intersection' };
		case 'onCurve': return { glyph: '○', word: `On ${CURVE_WORD[snap.curves?.[0]?.type ?? 'line']}${levelWord}${alignWord}` };
		case 'alignment': return { glyph: '┆', word: 'Aligned' };
		case 'horizontal': return { glyph: '―', word: `Horizontal${alignWord}` };
		case 'vertical': return { glyph: '│', word: `Vertical${alignWord}` };
		default: return { glyph: '', word: '' };
	}
}
const RELATION_WORD: Record<SnapCurve['type'], string> = { line: 'Point on line', circle: 'Point on circle', arc: 'Point on arc' };
/**
 * The sentence the sketch panel shows for the live snap: what it landed on,
 * named the way the panel names entities, and which relations the press will
 * add. `adds` says what THIS tool turns into a relation, because it differs:
 * the line chain adds both kinds, an arc's center and start and a rectangle's
 * first corner add the point's own relation but have no step to level, and a
 * polygon's center is not a point at all and adds nothing.
 */
export function snapSentence(snap: Snap, adds: { point: boolean; step: boolean }, name: (id: string) => string): string {
	const curve = (i: number) => (snap.curves?.[i] ? name(snap.curves[i].id) : 'a curve');
	const relations: string[] = [];
	let where: string;
	switch (snap.kind) {
		case 'point': where = `On ${snap.point ? name(snap.point) : 'a point'}, which it shares`; break;
		case 'origin': where = 'At the origin'; break;
		case 'midpoint': where = `Midpoint of ${curve(0)}`; if (adds.point) relations.push('Midpoint'); break;
		case 'intersection': where = `Where ${curve(0)} crosses ${curve(1)}`; if (adds.point) relations.push(...(snap.curves ?? []).map((c) => RELATION_WORD[c.type])); break;
		case 'onCurve': where = `On ${curve(0)}`; if (adds.point) relations.push(RELATION_WORD[snap.curves?.[0]?.type ?? 'line']); break;
		case 'alignment': where = 'Lined up with a point you passed over'; break;
		case 'horizontal': where = 'Level with the last point'; break;
		case 'vertical': where = 'Plumb with the last point'; break;
		default: return '';
	}
	const level = snapLevel(snap);
	if (level && snap.kind !== 'horizontal' && snap.kind !== 'vertical') where += `, ${level === 'horizontal' ? 'level' : 'plumb'} with the last point`;
	if (level && adds.step) relations.push(level === 'horizontal' ? 'Horizontal' : 'Vertical');
	if (snap.aligned?.length && snap.kind !== 'alignment') where += ', lined up with a point you passed over';
	return relations.length ? `${where}. Adds ${[...new Set(relations)].join(' and ')}.` : `${where}.`;
}
