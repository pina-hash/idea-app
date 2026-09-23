/**
 * A SHAPE DRAWN WITH A TOP-LEVEL TOOL ARRIVES WITH ITS SIZE AS A NUMBER TO TYPE.
 * Before this, a rectangle drawn on the model was four points and four lines
 * held square by horizontal and vertical relations, and nothing else: the
 * dimension panel said "Sketch 1 has no number to type", and making it 2 in
 * wide meant opening the sketch and adding a dimension by hand (friction
 * F024). SolidWorks' own rectangle comes out undimensioned too, but IdeaCAD's
 * whole point is fewer steps, and a student who drew a plate wants to type the
 * plate's width.
 *
 * `withDrivingSize` adds the DRIVING dimensions a fresh draft needs so its size
 * is typed rather than dragged, each set to what was drawn, so nothing moves:
 *
 *   - a RECTANGLE (lines held by horizontal and vertical relations): its width
 *     and its height, one distance on the first horizontal side and one on
 *     the first vertical side;
 *   - a CIRCLE: its radius, which the viewport shows and takes as a diameter;
 *   - an ARC: its radius;
 *   - a REGULAR POLYGON (a closed loop of equal sides with every corner on one
 *     circle): a construction circle through the corners, each corner held on
 *     it, the sides held equal, and the circle's radius, so one number sizes
 *     the whole polygon and it stays regular;
 *   - any other LINE: its length.
 *
 * WHY THESE AND NOT A FULLY DEFINED SKETCH. Position is left free on purpose:
 * a dimension to the origin is a number the student did not ask to type, and
 * `docs/ideacad/VISION.md` puts speed ahead of rigor. Nothing added here can
 * over-define the draft, because every value is measured off the draft
 * itself and every added relation is one the draft already satisfies.
 *
 * NOTHING IS ADDED TWICE. A draft that already carries a distance between two
 * points, or a radius on a curve, keeps its own and gets no second one, so
 * running this on a draft it has already run on changes nothing.
 */
import type { SketchConstraint, SketchEntity, Vec2 } from '../types';

export interface DrawnDraft { entities: SketchEntity[]; constraints: SketchConstraint[] }
type Point = Extract<SketchEntity, { type: 'point' }>;
type Line = Extract<SketchEntity, { type: 'line' }>;

let counter = 0;
/** A fresh id for an added entity or constraint. `features.ts`'s `newEntityId` is the real one; this module takes an id maker so it stays free of imports and a test can make ids it can read. */
const defaultId = () => `d${Date.now().toString(36)}${(counter++).toString(36)}`;

const same = (a: number, b: number, scale: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, scale);
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The driving constraints (and, for a polygon, the construction entities) a freshly drawn draft needs so its size can be typed: the ADDITIONS only. */
export function drawnShapeDimensions(draft: DrawnDraft, newId: () => string = defaultId): DrawnDraft {
	const points = new Map<string, Point>(), lines: Line[] = [];
	for (const e of draft.entities) { if (e.type === 'point') points.set(e.id, e); else if (e.type === 'line' && !e.construction) lines.push(e); }
	const at = (id: string): Vec2 | null => { const p = points.get(id); return p ? [p.x, p.y] : null; };
	const length = (l: Line) => { const a = at(l.a), b = at(l.b); return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0; };
	/* What the draft already dimensions, so nothing is added twice. */
	const spanned = new Set<string>(), sized = new Set<string>();
	for (const c of draft.constraints) {
		if (c.type === 'distance') spanned.add(pairKey(c.a, c.b));
		else if (c.type === 'circleRadius') sized.add(c.circle);
		else if (c.type === 'arcRadius') sized.add(c.arc);
	}
	const entities: SketchEntity[] = [], constraints: SketchConstraint[] = [];
	const span = (l: Line) => { const key = pairKey(l.a, l.b), value = length(l); if (spanned.has(key) || !(value > 0)) return; spanned.add(key); constraints.push({ id: newId(), type: 'distance', a: l.a, b: l.b, value }); };

	for (const e of draft.entities) {
		if (e.type === 'circle' && !e.construction && !sized.has(e.id)) { sized.add(e.id); constraints.push({ id: newId(), type: 'circleRadius', circle: e.id, value: e.radius }); }
		if (e.type === 'arc' && !e.construction && !sized.has(e.id)) { const c = at(e.center), s = at(e.start); if (c && s) { sized.add(e.id); constraints.push({ id: newId(), type: 'arcRadius', arc: e.id, value: Math.hypot(s[0] - c[0], s[1] - c[1]) }); } }
	}
	const hasCurves = draft.entities.some((e) => (e.type === 'arc' || e.type === 'circle') && !e.construction);
	const horizontal = new Set<string>(), vertical = new Set<string>();
	for (const c of draft.constraints) { if (c.type === 'horizontal') horizontal.add(c.line); else if (c.type === 'vertical') vertical.add(c.line); }

	if (horizontal.size || vertical.size) {
		/* A rectangle: the relations already hold opposite sides equal, so one width and one height size it. */
		const h = lines.find((l) => horizontal.has(l.id)), v = lines.find((l) => vertical.has(l.id));
		if (h) span(h); if (v) span(v);
		for (const l of lines) if (!horizontal.has(l.id) && !vertical.has(l.id)) span(l);
		return { entities, constraints };
	}
	const polygon = !hasCurves ? regularPolygon(lines, at) : null;
	if (polygon) {
		const center: Point = { id: newId(), type: 'point', x: polygon.center[0], y: polygon.center[1], construction: true };
		const circle: SketchEntity = { id: newId(), type: 'circle', center: center.id, radius: polygon.radius, construction: true };
		entities.push(center, circle);
		for (const id of polygon.corners) constraints.push({ id: newId(), type: 'pointOnCircle', point: id, circle: circle.id });
		for (let i = 1; i < polygon.sides.length; i++) constraints.push({ id: newId(), type: 'equalLength', l1: polygon.sides[0], l2: polygon.sides[i] });
		constraints.push({ id: newId(), type: 'circleRadius', circle: circle.id, value: polygon.radius });
		return { entities, constraints };
	}
	/* Any other drawn line: its length. An arc's closing chord is left to the arc's radius. */
	const chords = new Set(draft.entities.filter((e): e is Extract<SketchEntity, { type: 'arc' }> => e.type === 'arc').map((a) => pairKey(a.start, a.end)));
	for (const l of lines) if (!chords.has(pairKey(l.a, l.b))) span(l);
	return { entities, constraints };
}

/**
 * A closed loop of three or more lines whose sides are equal and whose corners
 * sit on one circle, which is what the Polygon tool draws: its corners in
 * loop order, its sides, its centre and its circumradius. Null for anything
 * else, including a loop that merely closes.
 */
export function regularPolygon(lines: readonly Line[], at: (id: string) => Vec2 | null): { corners: string[]; sides: string[]; center: Vec2; radius: number } | null {
	if (lines.length < 3) return null;
	/* Walk the loop from the first line. Every corner must be shared by exactly two sides. */
	const byPoint = new Map<string, Line[]>();
	for (const l of lines) for (const p of [l.a, l.b]) byPoint.set(p, [...(byPoint.get(p) ?? []), l]);
	if ([...byPoint.values()].some((ls) => ls.length !== 2)) return null;
	const corners: string[] = [], sides: string[] = [];
	let line = lines[0], from = line.a;
	for (let i = 0; i < lines.length; i++) {
		corners.push(from); sides.push(line.id);
		const to = line.a === from ? line.b : line.a;
		const next = byPoint.get(to)!.find((l) => l !== line)!;
		from = to; line = next;
		if (i < lines.length - 1 && from === corners[0]) return null;
	}
	if (from !== corners[0] || new Set(corners).size !== lines.length) return null;
	const pts = corners.map(at); if (pts.some((p) => !p)) return null;
	const xy = pts as Vec2[], center: Vec2 = [xy.reduce((n, p) => n + p[0], 0) / xy.length, xy.reduce((n, p) => n + p[1], 0) / xy.length];
	const radius = Math.hypot(xy[0][0] - center[0], xy[0][1] - center[1]);
	if (!(radius > 0)) return null;
	const side = Math.hypot(xy[1][0] - xy[0][0], xy[1][1] - xy[0][1]);
	for (let i = 0; i < xy.length; i++) {
		const p = xy[i], q = xy[(i + 1) % xy.length];
		if (!same(Math.hypot(p[0] - center[0], p[1] - center[1]), radius, radius)) return null;
		if (!same(Math.hypot(q[0] - p[0], q[1] - p[1]), side, side)) return null;
	}
	return { corners, sides, center, radius };
}
/** The same draft with its size made a driving dimension: what the workspace's `createDraft` hands to `add-feature`. */
export function withDrivingSize(draft: DrawnDraft, newId?: () => string): DrawnDraft {
	const added = drawnShapeDimensions(draft, newId);
	return { entities: [...draft.entities, ...added.entities], constraints: [...draft.constraints, ...added.constraints] };
}
