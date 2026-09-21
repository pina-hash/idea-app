/**
 * HOW A SKETCH IS DRAWN IN THE VIEWPORT: its closed regions as translucent
 * fills, every entity as a line, faint once the sketch has been consumed by a
 * feature. Pure: takes the projection, returns objects; `SolidViewport` adds
 * them to its sketch group and to its pick list.
 *
 * THIS MODULE IS THE SKETCHING SURFACE'S. `sketchObjects` is the resting
 * look of every sketch; `editingGuides` is the look of the ONE that is open:
 * a marker on every point, the hovered and the selected entity in their own
 * colour, a glyph beside each constrained entity (an H for horizontal, a V
 * for vertical, witness lines and arrowheads for a distance, an anchor for a
 * fixed point ...), the shape being drawn, the entities being dragged and
 * the snap the pointer has taken. The editing look is polylines rather than
 * objects because the workspace hands a panel exactly one drawing hook,
 * `api.guide`, and it takes a polyline and a colour; `SketchEditor.svelte`
 * clears the guides and redraws these on every change, so the look never
 * outlives the state it shows.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. A selected entity is redrawn in the
 * viewport's own selection green AND named in the panel; a hovered one is
 * pale gold AND the panel says what the press will do; a snap is a marker
 * whose SHAPE says which snap it is (a square on a point, a cross at the
 * origin, a rule for level or plumb) as well as its colour.
 */
import * as THREE from 'three';
import { dot, sub } from '../math';
import { curveParam, curvePoint, lift, pointOf, samples, type CurveEntity } from '../sketch/model';
import type { Snap, SessionPreview } from '../sketch/editor';
import type { ResolvedPlane, Selection, SketchConstraint, SketchEntity, SketchProjection, Vec2, Vec3 } from '../types';
import { polyline } from './shared';

export const SKETCH_COLOUR = '#a5ecff';
export const CONSTRUCTION_COLOUR = '#6d8391';
/** The viewport's own vertex and selection colours, so a sketch point reads as a corner and a selected line as selected. */
export const POINT_COLOUR = '#e7f6ff';
export const SELECTED_COLOUR = '#84d8ac';
export const HOVER_COLOUR = '#fff3b0';
/** Constraint glyphs share the reference-geometry gold: both are callouts about the model rather than the model. */
export const GLYPH_COLOUR = '#d9b96a';
export const SNAP_COLOUR = '#ff9fe0';
export const PREVIEW_COLOUR = '#a5ecff';

/** The objects that draw one sketch. Every object carries `userData.selection`; fills carry `region`, lines carry `entity`. */
export function sketchObjects(sketch: SketchProjection): THREE.Object3D[] {
	const out: THREE.Object3D[] = [];
	const selection: Selection = { bodyId: '', kind: 'sketch', id: sketch.feature }, opacity = sketch.consumed ? 0.35 : 1, color = SKETCH_COLOUR;
	const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...sketch.plane.u), new THREE.Vector3(...sketch.plane.v), new THREE.Vector3(...sketch.plane.normal));
	basis.setPosition(...sketch.plane.origin);
	const local = (p: Vec3) => { const d = sub(p, sketch.plane.origin); return new THREE.Vector2(dot(d, sketch.plane.u), dot(d, sketch.plane.v)); };
	for (const region of sketch.regions) {
		const shape = new THREE.Shape(region.outline.map(local));
		for (const hole of region.holes) shape.holes.push(new THREE.Path(hole.map(local)));
		const fillGeometry = new THREE.ShapeGeometry(shape);
		fillGeometry.applyMatrix4(basis);
		const fill = new THREE.Mesh(fillGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16 * opacity, side: THREE.DoubleSide, depthWrite: false }));
		fill.userData = { selection, normal: sketch.plane.normal, plane: sketch.plane, base: color, region: region.id };
		out.push(fill);
	}
	for (const e of sketch.entities) {
		if (e.type === 'point') continue;
		const pts = samples(sketch.entities, e).map((p) => lift(sketch.plane, p));
		const line = polyline(pts, e.construction ? CONSTRUCTION_COLOUR : color, opacity);
		line.userData = { selection, normal: sketch.plane.normal, plane: sketch.plane, base: color, entity: e.id };
		out.push(line);
	}
	return out;
}

/* ---------------------------------------------------------------- glyphs */
/** A polyline in sketch (u, v) coordinates: one stroke of a glyph, one outline of a preview. */
export type Stroke = Vec2[];
const at = (p: Vec2, d: Vec2, k: number): Vec2 => [p[0] + d[0] * k, p[1] + d[1] * k];
const unit2 = (d: Vec2): Vec2 => { const n = Math.hypot(d[0], d[1]) || 1; return [d[0] / n, d[1] / n]; };
const perp = (d: Vec2): Vec2 => [-d[1], d[0]];
const ring = (c: Vec2, r: number, n = 12): Stroke => Array.from({ length: n + 1 }, (_, i) => [c[0] + r * Math.cos(i / n * Math.PI * 2), c[1] + r * Math.sin(i / n * Math.PI * 2)] as Vec2);
const square = (c: Vec2, half: number): Stroke => [[c[0] - half, c[1] - half], [c[0] + half, c[1] - half], [c[0] + half, c[1] + half], [c[0] - half, c[1] + half], [c[0] - half, c[1] - half]];
const diamond = (c: Vec2, half: number): Stroke => [[c[0], c[1] - half], [c[0] + half, c[1]], [c[0], c[1] + half], [c[0] - half, c[1]], [c[0], c[1] - half]];
const cross = (c: Vec2, half: number): Stroke[] => [[[c[0] - half, c[1]], [c[0] + half, c[1]]], [[c[0], c[1] - half], [c[0], c[1] + half]]];
/** Two strokes making an arrowhead whose tip is at `tip`, pointing along `d`. */
const arrow = (tip: Vec2, d: Vec2, s: number): Stroke[] => { const u = unit2(d), n = perp(u); return [[tip, at(at(tip, u, -s), n, s * 0.45)], [tip, at(at(tip, u, -s), n, -s * 0.45)]]; };
const midOf = (entities: readonly SketchEntity[], l: Extract<SketchEntity, { type: 'line' }>) => { const a = pointOf(entities, l.a), b = pointOf(entities, l.b); return { a, b, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Vec2, d: unit2([b[0] - a[0], b[1] - a[1]]) }; };
/** The strokes for one constraint, or none when it names something not in the sketch. `s` is the glyph size in sketch inches. */
export function constraintGlyph(entities: readonly SketchEntity[], c: SketchConstraint, s: number): Stroke[] {
	const find = <T extends SketchEntity['type']>(id: string, type: T) => entities.find((e): e is Extract<SketchEntity, { type: T }> => e.id === id && e.type === type) ?? null;
	const line = (id: string) => find(id, 'line'), pt = (id: string) => { const p = find(id, 'point'); return p ? ([p.x, p.y] as Vec2) : null; };
	const curve = (id: string) => entities.find((e): e is CurveEntity => e.id === id && e.type !== 'point') ?? null;
	const centerOf = (e: CurveEntity) => (e.type === 'line' ? null : pointOf(entities, e.center));
	switch (c.type) {
		case 'horizontal': { const l = line(c.line); if (!l) return []; const { m, d } = midOf(entities, l); const g = at(m, perp(d), 1.8 * s); return [[[g[0] - s / 2, g[1] - s / 2], [g[0] - s / 2, g[1] + s / 2]], [[g[0] + s / 2, g[1] - s / 2], [g[0] + s / 2, g[1] + s / 2]], [[g[0] - s / 2, g[1]], [g[0] + s / 2, g[1]]]]; }
		case 'vertical': { const l = line(c.line); if (!l) return []; const { m, d } = midOf(entities, l); const g = at(m, perp(d), 1.8 * s); return [[[g[0] - s / 2, g[1] + s / 2], [g[0], g[1] - s / 2], [g[0] + s / 2, g[1] + s / 2]]]; }
		case 'distance': {
			const a = pt(c.a), b = pt(c.b); if (!a || !b) return [];
			const d = unit2([b[0] - a[0], b[1] - a[1]]), n = perp(d), wa = at(a, n, 2 * s), wb = at(b, n, 2 * s);
			return [[a, at(wa, n, 0.4 * s)], [b, at(wb, n, 0.4 * s)], [wa, wb], ...arrow(wa, [-d[0], -d[1]], s), ...arrow(wb, d, s)];
		}
		case 'pointLineDistance': {
			const p = pt(c.point), l = line(c.line); if (!p || !l) return [];
			const { a, d } = midOf(entities, l), t = (p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1], f = at(a, d, t), n = unit2([p[0] - f[0], p[1] - f[1]]);
			return [[p, f], ...arrow(f, [-n[0], -n[1]], s), ...arrow(p, n, s)];
		}
		case 'angle': {
			const l1 = line(c.l1), l2 = line(c.l2); if (!l1 || !l2) return [];
			const shared = [l1.a, l1.b].find((id) => id === l2.a || id === l2.b); const o = shared ? pt(shared) : midOf(entities, l1).m; if (!o) return [];
			const d1 = midOf(entities, l1).d, d2 = midOf(entities, l2).d, a0 = Math.atan2(d1[1], d1[0]); let sweep = Math.atan2(d2[1], d2[0]) - a0; while (sweep < 0) sweep += Math.PI * 2;
			return [Array.from({ length: 9 }, (_, i) => [o[0] + 2.5 * s * Math.cos(a0 + sweep * i / 8), o[1] + 2.5 * s * Math.sin(a0 + sweep * i / 8)] as Vec2)];
		}
		case 'parallel': case 'equalLength': case 'perpendicular': {
			const out: Stroke[] = [];
			for (const id of [c.l1, c.l2]) {
				const l = line(id); if (!l) continue; const { m, d } = midOf(entities, l), n = perp(d), g = at(m, n, 1.5 * s);
				if (c.type === 'parallel') out.push([at(at(g, n, -0.3 * s), d, -0.5 * s), at(at(g, n, -0.3 * s), d, 0.5 * s)], [at(at(g, n, 0.3 * s), d, -0.5 * s), at(at(g, n, 0.3 * s), d, 0.5 * s)]);
				else if (c.type === 'equalLength') out.push([at(at(g, d, -0.3 * s), n, -0.5 * s), at(at(g, d, -0.3 * s), n, 0.5 * s)], [at(at(g, d, 0.3 * s), n, -0.5 * s), at(at(g, d, 0.3 * s), n, 0.5 * s)]);
				else out.push([at(g, d, s), g, at(g, n, s)]);
			}
			return out;
		}
		case 'circleRadius': case 'arcRadius': {
			const e = curve(c.type === 'circleRadius' ? c.circle : c.arc); if (!e || e.type === 'line') return []; const o = centerOf(e)!;
			const tip = e.type === 'circle' ? at(o, [Math.SQRT1_2, Math.SQRT1_2], e.radius) : curvePoint(entities, e, 0.5);
			return [[o, tip], ...arrow(tip, [tip[0] - o[0], tip[1] - o[1]], s)];
		}
		case 'equalRadius': case 'concentric': {
			const out: Stroke[] = [];
			for (const id of [c.a, c.b]) { const e = curve(id); if (!e || e.type === 'line') continue; const o = centerOf(e)!; out.push(...(c.type === 'concentric' ? [ring(o, 0.5 * s, 8), ring(o, s, 8)] : [ring(at(o, [1, 0], 1.5 * s), 0.35 * s, 6), ring(at(o, [1, 0], 2.5 * s), 0.35 * s, 6)])); }
			return out;
		}
		case 'fixX': case 'fixY': { const p = pt(c.point); if (!p) return []; return [square(p, 0.7 * s), c.type === 'fixX' ? [[p[0], p[1] - 0.7 * s], [p[0], p[1] + 0.7 * s]] : [[p[0] - 0.7 * s, p[1]], [p[0] + 0.7 * s, p[1]]]]; }
		case 'coincident': { const out: Stroke[] = []; for (const id of [c.a, c.b]) { const p = pt(id); if (p) out.push(ring(p, 0.6 * s, 8)); } return out; }
		case 'pointOnCircle': case 'pointOnArc': case 'midpoint': { const p = pt(c.point); if (!p) return []; return c.type === 'midpoint' ? [[[p[0], p[1] + s], [p[0] + 0.85 * s, p[1] - 0.5 * s], [p[0] - 0.85 * s, p[1] - 0.5 * s], [p[0], p[1] + s]]] : [ring(p, 0.6 * s, 8)]; }
		case 'tangentLineArc': case 'tangentArcArc': {
			const p = pt(c.point), e = curve(c.type === 'tangentLineArc' ? c.arc : c.arc1); if (!p || !e || e.type === 'line') return [];
			const o = centerOf(e)!, r = unit2([p[0] - o[0], p[1] - o[1]]), t = perp(r), g = at(p, r, 1.2 * s);
			return [[at(g, t, -0.9 * s), at(g, t, 0.9 * s)]];
		}
		case 'symmetric': { const out: Stroke[] = []; for (const id of [c.a, c.b]) { const p = pt(id); if (p) out.push([[p[0] - 0.5 * s, p[1] - 0.5 * s], [p[0] + 0.5 * s, p[1] + 0.5 * s]], [[p[0] - 0.5 * s, p[1] + 0.5 * s], [p[0] + 0.5 * s, p[1] - 0.5 * s]]); } return out; }
	}
}
/** Every constraint's glyph, keyed by the constraint that owns it. */
export const constraintGlyphs = (entities: readonly SketchEntity[], constraints: readonly SketchConstraint[], size: number) => constraints.map((c) => ({ constraint: c.id, strokes: constraintGlyph(entities, c, size) }));
/** The marker for a snap: a square on a point, a cross at the origin, a rule along the alignment. */
export function snapStrokes(snap: Snap, s: number): Stroke[] {
	if (snap.kind === 'point') return [square(snap.at, s)];
	if (snap.kind === 'origin') return cross(snap.at, 1.4 * s);
	if (snap.reference) return [[snap.reference, snap.at], ...cross(snap.at, 0.5 * s)];
	return [];
}

/* --------------------------------------------------------- editing look */
export interface Guide { points: Vec3[]; color: string }
export interface EditingLook {
	selected: readonly string[]; hovered: string | null;
	/** Marker size in sketch inches: the panel derives it from pixels through `api.project`. */
	size: number;
	preview?: SessionPreview | null;
}
/** Everything drawn over the open sketch: `api.guide` takes each one. */
export function editingGuides(sketch: { plane: ResolvedPlane; entities: readonly SketchEntity[]; constraints: readonly SketchConstraint[] }, look: EditingLook): Guide[] {
	const out: Guide[] = [], s = look.size, up = (stroke: Stroke): Vec3[] => stroke.map((p) => lift(sketch.plane, p));
	const push = (strokes: Stroke[], color: string) => { for (const stroke of strokes) if (stroke.length >= 2) out.push({ points: up(stroke), color }); };
	const selected = new Set(look.selected);
	for (const e of sketch.entities) {
		if (e.type !== 'point') continue;
		const chosen = selected.has(e.id), hover = look.hovered === e.id;
		push([diamond([e.x, e.y], (chosen || hover ? 1.6 : 1) * 0.5 * s)], chosen ? SELECTED_COLOUR : hover ? HOVER_COLOUR : POINT_COLOUR);
	}
	for (const e of sketch.entities) {
		if (e.type === 'point') continue;
		const chosen = selected.has(e.id), hover = look.hovered === e.id;
		if (chosen || hover) push([samples(sketch.entities, e)], chosen ? SELECTED_COLOUR : HOVER_COLOUR);
	}
	for (const g of constraintGlyphs(sketch.entities, sketch.constraints, s)) push(g.strokes, GLYPH_COLOUR);
	const p = look.preview;
	if (p) {
		push(p.polylines, PREVIEW_COLOUR);
		push(p.anchors.map((a) => square(a, 0.5 * s)), PREVIEW_COLOUR);
		if (p.moved) { const { entities, curves } = p.moved; push(entities.filter((e): e is CurveEntity => e.type !== 'point' && curves.includes(e.id)).map((e) => samples(entities, e)), SELECTED_COLOUR); }
		if (p.snap) push(snapStrokes(p.snap, s), SNAP_COLOUR);
	}
	return out;
}
/** Where along a curve a pointer landed, as the fraction the readout names. Exposed for the panel's hover sentence. */
export const alongCurve = (entities: readonly SketchEntity[], curve: CurveEntity, p: Vec2) => curveParam(entities, curve, p);
