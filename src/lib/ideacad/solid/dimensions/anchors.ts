/**
 * WHERE A NUMBER SITS IN THE VIEWPORT. `model.ts` decides WHICH numbers a
 * student may type (`featureDimensions`, `sketchDimensions`) and which only
 * read (`drivenDimensions`); this module decides where each one is drawn,
 * beside the geometry it controls, as world points the overlay projects.
 * Pure: no kernel, no DOM, no camera. A projector is an optional argument,
 * used only to choose which of several equal sides faces the viewer.
 *
 * THE KEY IS THE DIMENSION'S OWN KEY. An anchor names the `Dimension.key` it
 * places and the feature whose `set-feature` the number patches, so the
 * overlay joins the two lists on `key` and never guesses which box is which.
 * A number with no anchor of its own (a transform's X, a mate's value) still
 * gets one: the centre of what its feature made, and the overlay's collision
 * pass stacks the labels there. A dimension is never dropped for lack of a
 * place to put it.
 *
 * `gap` IS IN INCHES AND COMES FROM THE SCREEN. A witness line sits a fixed
 * number of PIXELS off the geometry, whatever the zoom, so the overlay turns
 * its pixel gap into inches (`pixelsPerInch`) and hands it here. A label is
 * then pushed along `away` by the overlay itself, in pixels.
 */
import { lift, pointOf } from '../sketch/model';
import { circleOfEdge, featureDimensions } from './model';
import type { Feature, FeatureOf, ModelProjection, ResolvedPlane, Selection, SketchConstraint, SketchEntity, SketchProjection, Vec2, Vec3 } from '../types';

export interface DimensionAnchor {
	/** The `Dimension.key` (or `Measured.key`) this places. */
	key: string;
	/** The feature a typed value patches: the sketch for a sketch value, the feature for a parameter. Empty for a measured value. */
	feature: string;
	/** The point the label is pinned to, in world inches. */
	at: Vec3;
	/** A world direction the label is pushed along, away from what it names. Zero length means "no preference". */
	away: Vec3;
	/** The dimension line and its witness lines, world polylines drawn thin. Empty when a leader alone says what the label names. */
	lines: Vec3[][];
	/** The mark before the number: a diameter reads with its sign, a radius with R. */
	prefix?: '⌀' | 'R';
	/** What the stored number is multiplied by to be shown, and a typed one divided by to be stored: a circle stores its radius and is shown, and typed, as its diameter, as SolidWorks shows it. */
	factor?: number;
	/** How many pixels along `away` the label sits, when the default would cover what it names (a small hole). */
	offset?: number;
}
export type Projector = (point: Vec3) => { x: number; y: number };

/* ---------------------------------------------------------------- vectors */
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A unit vector, or zero for a zero one: an anchor never throws for a degenerate shape. */
const norm = (a: Vec3): Vec3 => { const n = Math.hypot(a[0], a[1], a[2]); return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0]; };
const mean = (points: readonly Vec3[]): Vec3 => { if (!points.length) return [0, 0, 0]; const s = points.reduce((acc, p) => add(acc, p), [0, 0, 0] as Vec3); return mul(s, 1 / points.length); };
const u2 = (d: Vec2): Vec2 => { const n = Math.hypot(d[0], d[1]); return n > 1e-12 ? [d[0] / n, d[1] / n] : [0, 0]; };
const at2 = (p: Vec2, d: Vec2, k: number): Vec2 => [p[0] + d[0] * k, p[1] + d[1] * k];
/** A plane direction (u, v) as a world vector. */
const dir3 = (plane: ResolvedPlane, d: Vec2): Vec3 => add(mul(plane.u, d[0]), mul(plane.v, d[1]));

/* ----------------------------------------------------------- sketch values */
/** The middle of every point in a sketch, which the witness lines are pushed away from so a rectangle's dimensions sit outside it. */
function sketchMiddle(entities: readonly SketchEntity[]): Vec2 {
	const pts = entities.filter((e) => e.type === 'point') as Extract<SketchEntity, { type: 'point' }>[];
	if (!pts.length) return [0, 0];
	return [pts.reduce((n, p) => n + p.x, 0) / pts.length, pts.reduce((n, p) => n + p.y, 0) / pts.length];
}
function findPoint(entities: readonly SketchEntity[], id: string): Vec2 | null { const p = entities.find((e) => e.id === id && e.type === 'point'); return p && p.type === 'point' ? [p.x, p.y] : null; }

/**
 * Where one sketch constraint's number sits: a distance on a dimension line
 * outside the shape with a witness line from each point; a point-to-line
 * distance at the middle of the perpendicular; an angle on its bisector; a
 * circle's diameter across the circle at 45 degrees; an arc's radius at the
 * middle of the arc; a fixed X or Y on the line from the sketch's axis. Null
 * for a constraint that carries no number or names something not in the
 * sketch, exactly as the glyphs in `viewport/sketch-layer.ts` answer.
 */
export function sketchConstraintAnchor(sketch: Pick<SketchProjection, 'feature' | 'plane' | 'entities'>, c: SketchConstraint, gap: number, middle: Vec2 = sketchMiddle(sketch.entities)): DimensionAnchor | null {
	const { plane, entities } = sketch, up = (p: Vec2) => lift(plane, p), base = { key: c.id, feature: sketch.feature };
	switch (c.type) {
		case 'distance': {
			const a = findPoint(entities, c.a), b = findPoint(entities, c.b); if (!a || !b) return null;
			const d = u2([b[0] - a[0], b[1] - a[1]]), mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
			let n: Vec2 = [-d[1], d[0]];
			/* Outside the shape: the side of the segment away from the middle of the sketch. A segment through the middle keeps the left side. */
			if ((mid[0] - middle[0]) * n[0] + (mid[1] - middle[1]) * n[1] < -1e-9) n = [-n[0], -n[1]];
			if (d[0] === 0 && d[1] === 0) n = [0, 1];
			const wa = at2(a, n, 2 * gap), wb = at2(b, n, 2 * gap);
			return { ...base, at: up([(wa[0] + wb[0]) / 2, (wa[1] + wb[1]) / 2]), away: dir3(plane, n), lines: [[up(a), up(at2(a, n, 2.4 * gap))], [up(b), up(at2(b, n, 2.4 * gap))], [up(wa), up(wb)]] };
		}
		case 'pointLineDistance': {
			const p = findPoint(entities, c.point), line = entities.find((e) => e.id === c.line && e.type === 'line');
			if (!p || !line || line.type !== 'line') return null;
			const a = findPoint(entities, line.a), b = findPoint(entities, line.b); if (!a || !b) return null;
			const d = u2([b[0] - a[0], b[1] - a[1]]), t = (p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1], f = at2(a, d, t);
			return { ...base, at: up([(p[0] + f[0]) / 2, (p[1] + f[1]) / 2]), away: dir3(plane, d), lines: [[up(p), up(f)]] };
		}
		case 'angle': {
			const l1 = entities.find((e) => e.id === c.l1 && e.type === 'line'), l2 = entities.find((e) => e.id === c.l2 && e.type === 'line');
			if (!l1 || !l2 || l1.type !== 'line' || l2.type !== 'line') return null;
			const a1 = findPoint(entities, l1.a), b1 = findPoint(entities, l1.b), a2 = findPoint(entities, l2.a), b2 = findPoint(entities, l2.b);
			if (!a1 || !b1 || !a2 || !b2) return null;
			const shared = [l1.a, l1.b].find((id) => id === l2.a || id === l2.b);
			const o = shared ? pointOf(entities, shared) : [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2] as Vec2;
			/* Each line's direction pointing AWAY from the vertex, so the arc sits in the angle the two lines make. */
			const away1 = shared === l1.b ? u2([a1[0] - b1[0], a1[1] - b1[1]]) : u2([b1[0] - a1[0], b1[1] - a1[1]]);
			const away2 = shared === l2.b ? u2([a2[0] - b2[0], a2[1] - b2[1]]) : u2([b2[0] - a2[0], b2[1] - a2[1]]);
			const t0 = Math.atan2(away1[1], away1[0]); let sweep = Math.atan2(away2[1], away2[0]) - t0;
			while (sweep > Math.PI) sweep -= Math.PI * 2; while (sweep < -Math.PI) sweep += Math.PI * 2;
			const r = 3 * gap, arc = Array.from({ length: 13 }, (_, i) => up([o[0] + r * Math.cos(t0 + sweep * i / 12), o[1] + r * Math.sin(t0 + sweep * i / 12)]));
			const bis: Vec2 = [Math.cos(t0 + sweep / 2), Math.sin(t0 + sweep / 2)];
			return { ...base, at: up(at2(o, bis, r)), away: dir3(plane, bis), lines: [arc] };
		}
		case 'circleRadius': {
			const circle = entities.find((e) => e.id === c.circle && e.type === 'circle'); if (!circle || circle.type !== 'circle') return null;
			const o = findPoint(entities, circle.center); if (!o) return null;
			const d: Vec2 = [Math.SQRT1_2, Math.SQRT1_2], r = circle.radius;
			/* A diameter line across the circle, and the label just past the rim on its upper-right end. */
			return { ...base, at: up(at2(o, d, Math.abs(r) + gap)), away: dir3(plane, d), lines: [[up(at2(o, d, -r)), up(at2(o, d, r))]], prefix: '⌀', factor: 2 };
		}
		case 'arcRadius': {
			const arc = entities.find((e) => e.id === c.arc && e.type === 'arc'); if (!arc || arc.type !== 'arc') return null;
			const o = findPoint(entities, arc.center), s = findPoint(entities, arc.start), t = findPoint(entities, arc.end); if (!o || !s || !t) return null;
			const a0 = Math.atan2(s[1] - o[1], s[0] - o[0]); let sweep = Math.atan2(t[1] - o[1], t[0] - o[0]) - a0; while (sweep <= 1e-12) sweep += Math.PI * 2;
			const r = Math.hypot(s[0] - o[0], s[1] - o[1]), d: Vec2 = [Math.cos(a0 + sweep / 2), Math.sin(a0 + sweep / 2)], tip = at2(o, d, r);
			return { ...base, at: up(at2(o, d, r + gap)), away: dir3(plane, d), lines: [[up(o), up(tip)]], prefix: 'R' };
		}
		case 'fixX': case 'fixY': {
			const p = findPoint(entities, c.point); if (!p) return null;
			const from: Vec2 = c.type === 'fixX' ? [0, p[1]] : [p[0], 0];
			const n: Vec2 = c.type === 'fixX' ? [0, 1] : [1, 0];
			return { ...base, at: up([(from[0] + p[0]) / 2 + n[0] * gap, (from[1] + p[1]) / 2 + n[1] * gap]), away: dir3(plane, n), lines: [[up(from), up(p)]] };
		}
		default: return null;
	}
}
/** Every numbered constraint of a sketch, anchored. Constraints with no number, or naming what is not there, give nothing. */
export function sketchAnchors(sketch: Pick<SketchProjection, 'feature' | 'plane' | 'entities' | 'constraints'>, gap: number): DimensionAnchor[] {
	const middle = sketchMiddle(sketch.entities), out: DimensionAnchor[] = [];
	for (const c of sketch.constraints) { const a = sketchConstraintAnchor(sketch, c, gap, middle); if (a) out.push(a); }
	return out;
}

/* ----------------------------------------------------------- feature values */
/** How far, in pixels, a hole's numbers stand off from it. */
export const HOLE_OFFSET = 64;
/** Faces the feature itself named: construction names start with the feature id (`naming.ts`). */
export function facesOf(model: ModelProjection, featureId: string, role = '') {
	const prefix = `${featureId}.${role}`;
	return model.bodies.flatMap((b) => b.faces.filter((f) => f.id.startsWith(prefix)).map((face) => ({ body: b, face }))).sort((a, b) => (a.face.id < b.face.id ? -1 : a.face.id > b.face.id ? 1 : 0));
}
/** The middle of a body's bounding box. */
const boundsMiddle = (bounds: readonly number[]): Vec3 => [(bounds[0] + bounds[3]) / 2, (bounds[1] + bounds[4]) / 2, (bounds[2] + bounds[5]) / 2];
/**
 * The place a number with no better anchor sits: the middle of the faces the
 * feature named, else of the bodies it made or changed, else its reference,
 * else the origin. Never throws and never returns nothing.
 */
export function featureMiddle(feature: Feature, model: ModelProjection): Vec3 {
	const faces = facesOf(model, feature.id);
	if (faces.length) return mean(faces.map((f) => f.face.center));
	const row = model.features.find((r) => r.id === feature.id);
	const bodies = model.bodies.filter((b) => b.createdBy === feature.id || row?.bodies.includes(b.id));
	if (bodies.length) return mean(bodies.map((b) => boundsMiddle(b.bounds)));
	const reference = model.references.find((r) => r.feature === feature.id);
	if (reference) return reference.origin;
	return [0, 0, 0];
}
const at = (key: string, feature: string, point: Vec3, away: Vec3 = [0, 0, 0], lines: Vec3[][] = []): DimensionAnchor => ({ key, feature, at: point, away, lines });

/**
 * THE EXTRUDE'S DEPTH, AT THE MIDDLE OF ITS SIDE: a dimension line parallel to
 * the pull, set one gap out from a corner of the profile, with a witness line
 * at each end. Which corner: with a projector, the one furthest right on
 * screen (then lowest), so the number sits on the side the viewer sees; with
 * none, the one furthest along the plane's u + v, which is deterministic.
 */
function extrudeAnchor(f: FeatureOf<'extrude'>, model: ModelProjection, gap: number, project?: Projector): DimensionAnchor | null {
	const sketch = model.sketches.find((s) => s.feature === f.sketch); if (!sketch) return null;
	const regions = f.regions ? sketch.regions.filter((r) => f.regions!.includes(r.id)) : sketch.regions;
	const corners = regions.flatMap((r) => r.outline); if (!corners.length) return null;
	const sign = (f.direction === 'reverse' ? -1 : 1) * (Math.sign(f.distance) || 1), dir = mul(sketch.plane.normal, sign), len = Math.abs(f.distance);
	const middle = mean(corners);
	const score = project ? (p: Vec3) => { const s = project(p); return s.x * 1e3 + s.y; } : (p: Vec3) => dot(sub(p, sketch.plane.origin), add(sketch.plane.u, sketch.plane.v));
	let best = corners[0], bestScore = -Infinity;
	for (const c of corners) { const s = score(add(c, mul(dir, len / 2))); if (s > bestScore + 1e-9) { best = c; bestScore = s; } }
	/* Out from the profile, in its plane, so the dimension line does not sit on the edge it measures. */
	const outward = norm(sub(sub(best, middle), mul(sketch.plane.normal, dot(sub(best, middle), sketch.plane.normal))));
	const o = mul(outward, 2 * gap), a = add(best, o), b = add(a, mul(dir, len));
	return at('distance', f.id, add(a, mul(dir, len / 2)), outward, [[best, add(best, mul(outward, 2.4 * gap))], [add(best, mul(dir, len)), add(add(best, mul(dir, len)), mul(outward, 2.4 * gap))], [a, b]]);
}
/** A face's own centre with its normal as the way out: where a blend, a shell wall or a pushed face shows its number. */
function faceAnchor(key: string, feature: string, model: ModelProjection, faceIds: readonly string[], fallback?: Vec3): DimensionAnchor | null {
	for (const id of faceIds) for (const b of model.bodies) { const face = b.faces.find((x) => x.id === id); if (face) return at(key, feature, face.center, norm(face.normal)); }
	return fallback ? at(key, feature, fallback) : null;
}

/**
 * Every number a feature carries, anchored beside the geometry it controls.
 * The keys are `featureDimensions`'s keys, and every key that function lists
 * gets exactly one anchor here: the specific place where there is one, the
 * feature's middle otherwise.
 */
export function featureAnchors(feature: Feature, model: ModelProjection, gap: number, project?: Projector): DimensionAnchor[] {
	const placed = new Map<string, DimensionAnchor>();
	for (const a of placeFeature(feature, model, gap, project)) if (!placed.has(a.key)) placed.set(a.key, a);
	let middle: Vec3 | null = null;
	/* One anchor per key `featureDimensions` lists, in its order: a number with no place of its own sits at the feature's middle, where the collision pass stacks it. */
	return featureDimensions(feature).map((d) => placed.get(d.key) ?? at(d.key, feature.id, (middle ??= featureMiddle(feature, model))));
}
/** The specific places a feature type has; anything it does not place falls back to the middle in `featureAnchors`. */
function placeFeature(feature: Feature, model: ModelProjection, gap: number, project?: Projector): DimensionAnchor[] {
	const fid = feature.id;
	switch (feature.type) {
		case 'extrude': { const a = extrudeAnchor(feature, model, gap, project); return a ? [a] : []; }
		case 'revolve': {
			const sketch = model.sketches.find((s) => s.feature === feature.sketch);
			const outline = sketch?.regions.flatMap((r) => r.outline) ?? [];
			return outline.length && sketch ? [at('angle', fid, mean(outline), sketch.plane.normal)] : [];
		}
		case 'fillet': case 'chamfer': {
			const blends = facesOf(model, fid, feature.type === 'fillet' ? 'blend' : 'bevel');
			const hint = feature.edges[0]?.hint?.mid;
			const first = blends[0]?.face, last = blends[blends.length - 1]?.face;
			const pin = (face: typeof first, key: string, prefix?: 'R'): DimensionAnchor[] => { const a = face ? at(key, fid, face.center, norm(face.normal)) : hint ? at(key, fid, hint) : null; return a ? [prefix ? { ...a, prefix } : a] : []; };
			if (feature.type === 'fillet') return [...pin(first, 'radius', 'R'), ...pin(last, 'end', 'R')];
			return [...pin(first, 'distance'), ...pin(first, 'distance2'), ...pin(first, 'angle')];
		}
		case 'shell': {
			const inner = facesOf(model, fid, 'inner.')[0]?.face;
			const out = inner ? [at('thickness', fid, inner.center, norm(inner.normal))] : [];
			(feature.faceThickness ?? []).forEach((entry, i) => { const a = faceAnchor(`face.${i}`, fid, model, [`${fid}.inner.${entry.face.name}`, entry.face.name], entry.face.hint?.center); if (a) out.push(a); });
			return out;
		}
		case 'hole': {
			const wall = facesOf(model, fid, 'wall')[0]?.face, bottom = facesOf(model, fid, 'bottom')[0]?.face;
			const up: Vec3 = feature.face.hint ? norm(feature.face.hint.normal) : [0, 0, 1];
			/* A hole is small on screen, so its numbers stand off to the side, out from the axis through the wall, rather than on top of the hole they name. */
			const radial = wall && bottom ? norm(sub(sub(wall.center, bottom.center), mul(up, dot(sub(wall.center, bottom.center), up)))) : [0, 0, 0] as Vec3;
			const away = Math.hypot(...radial) > 0 ? radial : up;
			const out: DimensionAnchor[] = [];
			if (wall) out.push({ ...at('diameter', fid, wall.center, away), prefix: '⌀', offset: HOLE_OFFSET });
			const floor = bottom?.center ?? wall?.center; if (floor) out.push({ ...at('depth', fid, floor, away), offset: HOLE_OFFSET });
			return out;
		}
		case 'pattern': {
			const source = model.bodies.find((b) => b.id === feature.body);
			const copies = model.bodies.filter((b) => b.createdBy === fid).sort((a, b) => (a.id < b.id ? -1 : 1));
			if (!source) return [];
			const c0 = source.centerOfMass, c1 = copies[0]?.centerOfMass;
			return [at('count', fid, mean([c0, ...copies.map((b) => b.centerOfMass)])), ...(c1 ? [at('spacing', fid, mean([c0, c1]), [0, 0, 0], [[c0, c1]])] : [])];
		}
		case 'push': { const a = faceAnchor('value', fid, model, [feature.face.name], feature.face.hint?.center); return a ? [a] : []; }
		case 'draft': { const a = faceAnchor('angle', fid, model, feature.faces.map((f) => f.name), feature.faces[0]?.hint?.center); return a ? [a] : []; }
		case 'plane': {
			const reference = model.references.find((r) => r.feature === fid); if (!reference) return [];
			const way = reference.normal ? norm(reference.normal) : [0, 0, 0] as Vec3;
			return [at('offset', fid, reference.origin, way), at('angle', fid, reference.origin, way)];
		}
		default: return [];
	}
}

/* ----------------------------------------------------------- measured values */
/**
 * Where a measured value sits: an edge's length at the middle of the edge,
 * pushed out from its body, or a round edge's diameter across it. The other
 * measured values (an area, a corner's coordinates, a body's size) stay in
 * the panel, where a list of numbers reads better than numbers floating over
 * a face.
 */
export function measuredAnchors(selection: Selection | null | undefined, model: ModelProjection): DimensionAnchor[] {
	if (!selection || selection.kind !== 'edge') return [];
	const body = model.bodies.find((b) => b.id === selection.bodyId), edge = body?.edges.find((e) => e.id === selection.id);
	if (!body || !edge) return [];
	/* A round edge is read by its diameter, across the circle, as a hole is dimensioned; its length (the circumference) stays in the panel. */
	const circle = circleOfEdge(edge);
	if (circle) {
		const out = norm(sub(edge.mid, circle.center)), far = sub(circle.center, mul(out, circle.radius));
		return [{ key: 'diameter', feature: '', at: edge.mid, away: out, lines: [[far, edge.mid]], prefix: '⌀' }];
	}
	return [{ key: 'length', feature: '', at: edge.mid, away: norm(sub(edge.mid, boundsMiddle(body.bounds))), lines: [] }];
}

/** Inches per screen pixel near a plane, from two projected points: the overlay's gap is a pixel count turned into inches this way. */
export function pixelsPerInch(project: Projector, plane: Pick<ResolvedPlane, 'origin' | 'u' | 'v'>): number {
	const a = project(plane.origin), b = project(add(plane.origin, plane.u)), c = project(add(plane.origin, plane.v));
	return Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y));
}
