/**
 * DIMENSIONAL CONTROL: the numbers a student can type and the numbers a
 * student can only read, decided in one pure module with no kernel and no
 * DOM in it, so every rule below is assertable in a plain test.
 *
 * DRIVING VERSUS DRIVEN, decided here for the whole modeler:
 *
 *   - A FEATURE PARAMETER (an extrude's distance, a fillet's radius, a
 *     pattern's count, a plane's offset) is DRIVING. Typing it rewrites the
 *     feature through `set-feature` and the replay moves the geometry. There
 *     is exactly one number per parameter and `featureDimensions` lists them;
 *     a feature type with no numeric parameter (a boolean, a delete, an axis,
 *     a body held by its bytes) lists nothing, deliberately, rather than an
 *     invented one.
 *   - A SKETCH CONSTRAINT VALUE -- a distance, a point-to-line distance, an
 *     angle, a circle or arc radius, a fixed X or Y; the `DIMENSIONED` kinds
 *     `sketch/model.ts` names -- is DRIVING. Typing it rewrites the sketch
 *     feature's `constraints` array and the kernel's solver moves the points on
 *     the next replay. The stored entities are NOT rewritten: they are the
 *     solver's starting guess, and the solve is what makes the number true.
 *   - A MEASURED VALUE (an edge's length, a face's area, a body's bounding size
 *     and volume, a corner's position, a sketch's enclosed area) is DRIVEN. It
 *     is read off the projection, shown beside the word "measured", and never
 *     editable. Making a driven value editable would mean guessing WHICH
 *     driving value should move to produce it, and that guess is the
 *     student's to make by picking the driving dimension, not a panel's.
 *
 * WHEN A DRIVING DIMENSION IS REFUSED, AND BY WHOM. Nothing here clamps: a
 * student may type any finite number (negative, zero, enormous) and it goes
 * to the document as typed. A value the kernel cannot build with comes back
 * as the feature row's own sentence (`FeatureRow.message`, from the
 * executor's throw), and the row says so in the tree and in the panel. A
 * sketch value the solver cannot satisfy comes back as
 * `SketchSolveReport.classification === 'unsatisfied'`, with the conflicting
 * constraint ids in `trouble`, and the panel names those rows. No input
 * carries a `min`, a `max` or a `step` that would pre-empt either answer with
 * the browser's own; `parseDimension` refuses only what is not a number at
 * all, and its sentence is shown where the student was typing.
 *
 * UNITS. The document is in inches (`SolidManifest.units`), so every length
 * dimension is stored in inches and `parseDimension` converts what a student
 * types -- "25.4mm", "2.54cm", "1 1/2", "3/8", `2"` -- into inches before it
 * is stored. Angles are degrees, as the feature union stores them. A count is
 * a bare number and a scale factor is a bare ratio (or a percentage).
 */
import { DIMENSIONED } from '../sketch/model';
import { circleThrough } from '../mates/frames';
import type { BodyProjection, EdgeProjection, Feature, ModelProjection, Selection, SketchEntity, SketchProjection, Vec3 } from '../types';

/* ------------------------------------------------------------- shapes */
export type DimensionUnit = 'in' | 'deg' | 'count' | 'factor';
export type MeasuredUnit = 'in' | 'in2' | 'in3';
/** A number a student types. `patch(value)` is what `set-feature` carries; the panel never builds one itself. */
export interface Dimension {
	key: string;
	label: string;
	value: number;
	unit: DimensionUnit;
	driving: boolean;
	/** A word or two beside the label: the entities a sketch constraint names. */
	detail?: string;
	patch(value: number): Partial<Feature> & Record<string, unknown>;
}
/** A number a student reads. There is no patch on purpose: see the header. */
export interface Measured { key: string; label: string; value: number; unit: MeasuredUnit; driving: false }
export type ParsedDimension = { ok: true; value: number } | { ok: false; reason: string };

/* --------------------------------------------------------- formatting */
export const INCH_DECIMALS = 3;
export const DEGREE_DECIMALS = 1;
const UNIT_WORD: Record<DimensionUnit, string> = { in: 'in', deg: 'deg', count: 'copies', factor: '×' };
/** The word an input shows beside its box, so a student knows what to type before typing it. */
export const unitWord = (unit: DimensionUnit) => UNIT_WORD[unit];
/** The one spelling of a number with its unit, for readouts, rows and measured values alike. */
export function formatDimension(value: number, unit: DimensionUnit | MeasuredUnit): string {
	if (!Number.isFinite(value)) return 'not a number';
	switch (unit) {
		case 'in': return `${value.toFixed(INCH_DECIMALS)} in`;
		case 'in2': return `${value.toFixed(INCH_DECIMALS)} in²`;
		case 'in3': return `${value.toFixed(INCH_DECIMALS)} in³`;
		case 'deg': return `${value.toFixed(DEGREE_DECIMALS)}°`;
		case 'count': return Number.isInteger(value) ? `${value} ${value === 1 ? 'copy' : 'copies'}` : `${value} copies`;
		case 'factor': return `× ${value.toFixed(3)}`;
	}
}
/** What an input is seeded with: the stored number with float noise trimmed and nothing else rounded away. */
export const editText = (value: number) => Number.isFinite(value) ? Number(value.toPrecision(10)).toString() : '';

/* ------------------------------------------------------------ parsing */
const EXAMPLES: Record<DimensionUnit, string> = { in: '1.5, 3/8, 1 1/2 or 25.4mm', deg: '45 or 45deg', count: '3', factor: '1.5 or 150%' };
/** Unit tokens with the DIVISOR that takes them to the stored unit: dividing (25.4 / 25.4) is exact where multiplying by a reciprocal is not. */
const UNIT_TOKENS: { pattern: RegExp; family: DimensionUnit; divisor: number }[] = [
	{ pattern: /(inches|inch|in|"|″|'')$/, family: 'in', divisor: 1 },
	{ pattern: /(millimetres|millimeters|mm)$/, family: 'in', divisor: 25.4 },
	{ pattern: /(centimetres|centimeters|cm)$/, family: 'in', divisor: 2.54 },
	{ pattern: /(degrees|degree|deg|°)$/, family: 'deg', divisor: 1 },
	{ pattern: /(%|percent)$/, family: 'factor', divisor: 100 }
];
const NOT_FINITE = /^-?(infinity|inf|nan)$/;
const DECIMAL = /^-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?$/;
const FRACTION = /^(-?)(\d+)\/(\d+)$/;
const MIXED = /^(-?)(\d+) (\d+)\/(\d+)$/;
/**
 * Text to a number in the dimension's own unit, or a sentence. Accepts a
 * decimal, a fraction, a mixed number, and a unit suffix from the family the
 * dimension belongs to. Refuses text that is not a number, a number that is
 * not finite (`Infinity`, `1/0`), and a unit from the wrong family -- an angle
 * typed into a length is a mistake worth a sentence, not a silent conversion.
 */
export function parseDimension(text: string, unit: DimensionUnit = 'in'): ParsedDimension {
	const example = `Enter a number, like ${EXAMPLES[unit]}.`;
	let s = String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
	if (unit === 'factor') s = s.replace(/^[×x*] ?/, '');
	if (!s) return { ok: false, reason: example };
	let divisor = 1, family: DimensionUnit | null = null;
	for (const token of UNIT_TOKENS) {
		const m = s.match(token.pattern);
		if (m) { family = token.family; divisor = token.divisor; s = s.slice(0, s.length - m[0].length).trim(); break; }
	}
	if (family && family !== unit) {
		if (unit === 'deg') return { ok: false, reason: 'This is an angle. Enter degrees, like 45 or 45deg.' };
		if (unit === 'in') return { ok: false, reason: 'This is a length. Enter inches, like 1.5, 3/8 or 25.4mm.' };
		if (unit === 'count') return { ok: false, reason: 'This is a count. Enter a whole number of copies, like 3.' };
		return { ok: false, reason: 'This is a scale factor. Enter a ratio like 1.5, or a percentage like 150%.' };
	}
	let value: number;
	const mixed = s.match(MIXED), fraction = s.match(FRACTION);
	if (mixed) value = (mixed[1] ? -1 : 1) * (Number(mixed[2]) + Number(mixed[3]) / Number(mixed[4]));
	else if (fraction) value = (fraction[1] ? -1 : 1) * (Number(fraction[2]) / Number(fraction[3]));
	else if (DECIMAL.test(s)) value = Number(s);
	else if (NOT_FINITE.test(s)) return { ok: false, reason: 'Enter a finite number.' };
	else return { ok: false, reason: example };
	value /= divisor;
	if (!Number.isFinite(value)) return { ok: false, reason: 'Enter a finite number.' };
	return { ok: true, value };
}

/* ------------------------------------------------ feature dimensions */
const dim = (key: string, label: string, value: number, unit: DimensionUnit, patch: (v: number) => Partial<Feature> & Record<string, unknown>, detail?: string): Dimension => ({ key, label, value, unit, driving: true, patch, ...(detail ? { detail } : {}) });
const vec = (label: string, v: Vec3, patch: (next: Vec3) => Partial<Feature> & Record<string, unknown>, prefix = ''): Dimension[] =>
	(['X', 'Y', 'Z'] as const).map((axis, i) => dim(`${prefix}${axis.toLowerCase()}`, `${label} ${axis}`, v[i], 'in', (n) => { const next: Vec3 = [v[0], v[1], v[2]]; next[i] = n; return patch(next); }));

/**
 * Every driving number a feature carries, in the order a student would read
 * them. Exhaustive over the union: a new feature type is a compile error here
 * until its numbers, or its deliberate lack of them, are stated.
 */
export function featureDimensions(f: Feature): Dimension[] {
	switch (f.type) {
		case 'body': case 'sketch': case 'boolean': case 'delete': case 'axis': case 'sweep': case 'loft': return [];
		case 'extrude': return [dim('distance', 'Distance', f.distance, 'in', (distance) => ({ distance }))];
		case 'revolve': return [dim('angle', 'Angle', f.angle, 'deg', (angle) => ({ angle }))];
		case 'push': return [dim('value', 'Push', f.value, 'in', (value) => ({ value }))];
		case 'move-selection': return vec('Move', f.delta, (delta) => ({ delta }));
		case 'fillet': {
			const out = [dim('radius', 'Radius', f.radius, 'in', (radius) => ({ radius }))];
			if (f.variable) { const variable = f.variable; out.push(dim('end', 'End radius', variable.end, 'in', (end) => ({ variable: { ...variable, end } }))); }
			return out;
		}
		case 'chamfer': {
			const out = [dim('distance', 'Distance', f.distance, 'in', (distance) => ({ distance }))];
			if (f.distance2 !== undefined) out.push(dim('distance2', 'Second distance', f.distance2, 'in', (distance2) => ({ distance2 })));
			if (f.angle !== undefined) out.push(dim('angle', 'Angle', f.angle, 'deg', (angle) => ({ angle })));
			return out;
		}
		case 'shell': {
			const out = [dim('thickness', 'Thickness', f.thickness, 'in', (thickness) => ({ thickness }))];
			const perFace = f.faceThickness ?? [];
			perFace.forEach((entry, i) => out.push(dim(`face.${i}`, `Face ${i + 1} thickness`, entry.thickness, 'in', (thickness) => ({ faceThickness: perFace.map((e, j) => (j === i ? { ...e, thickness } : e)) }))));
			return out;
		}
		case 'transform': return transformDimensions(f.matrix);
		case 'mirror': return f.plane.kind === 'datum' ? [dim('offset', 'Plane offset', f.plane.offset ?? 0, 'in', (offset) => ({ plane: { ...f.plane, offset } }))] : [];
		case 'pattern': return [
			dim('count', 'Copies', f.count, 'count', (count) => ({ count })),
			f.mode === 'linear' ? dim('spacing', 'Spacing', f.spacing, 'in', (spacing) => ({ spacing })) : dim('spacing', 'Angle between', f.spacing, 'deg', (spacing) => ({ spacing }))
		];
		case 'plane': {
			const d = f.definition;
			if (d.kind === 'offset') return [dim('offset', 'Offset', d.offset, 'in', (offset) => ({ definition: { ...d, offset } }))];
			if (d.kind === 'angle') return [dim('angle', 'Angle', d.angle, 'deg', (angle) => ({ definition: { ...d, angle } }))];
			return [];
		}
		case 'point': { const d = f.definition; return d.kind === 'coordinates' ? vec('Point', d.point, (point) => ({ definition: { ...d, point } })) : []; }
		case 'mate': return f.kind === 'distance' ? [dim('value', 'Distance', f.value ?? 0, 'in', (value) => ({ value }))] : f.kind === 'angle' ? [dim('value', 'Angle', f.value ?? 0, 'deg', (value) => ({ value }))] : [];
		case 'hole': {
			const out: Dimension[] = [];
			if (f.fit === 'custom' || f.diameter !== undefined) out.push(dim('diameter', 'Diameter', f.diameter ?? 0, 'in', (diameter) => ({ diameter })));
			if (typeof f.depth === 'number') out.push(dim('depth', 'Depth', f.depth, 'in', (depth) => ({ depth })));
			return out;
		}
		case 'draft': return [dim('angle', 'Angle', f.angle, 'deg', (angle) => ({ angle }))];
		case 'rib': return [dim('thickness', 'Thickness', f.thickness, 'in', (thickness) => ({ thickness }))];
		default: { const never: never = f; return never; }
	}
}

/* --------------------------------------------------- transform matrix */
/**
 * A transform's matrix is 4x4 ROW-MAJOR (`SolidWorkspace` transposes three's
 * column-major `toArray`; `featureSummary` reads the translation at 3, 7, 11).
 * The three tools write three shapes, and each gets its own dimension: a pure
 * translation shows X, Y, Z; a uniform scale about a centre shows the factor;
 * a rotation about a centre shows the angle. The centre is recovered from the
 * matrix so a retyped factor or angle turns about the same point.
 */
export function decomposeMatrix(m: readonly number[]): { translation: Vec3; scale: number; angle: number; axis: Vec3; rotation: number[] } {
	const translation: Vec3 = [m[3], m[7], m[11]];
	const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
	const scale = Math.cbrt(det);
	const s = Math.abs(scale) > 1e-12 ? scale : 1;
	const r = [m[0] / s, m[1] / s, m[2] / s, m[4] / s, m[5] / s, m[6] / s, m[8] / s, m[9] / s, m[10] / s];
	const trace = r[0] + r[4] + r[8];
	const angle = Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))) * 180 / Math.PI;
	const raw: Vec3 = [r[7] - r[5], r[2] - r[6], r[3] - r[1]];
	const n = Math.hypot(...raw);
	const axis: Vec3 = n > 1e-12 ? [raw[0] / n, raw[1] / n, raw[2] / n] : [0, 0, 1];
	return { translation, scale, angle, axis, rotation: r };
}
const rowMajor = (r: readonly number[], s: number, t: Vec3) => [r[0] * s, r[1] * s, r[2] * s, t[0], r[3] * s, r[4] * s, r[5] * s, t[1], r[6] * s, r[7] * s, r[8] * s, t[2], 0, 0, 0, 1];
const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Rodrigues, row-major 3x3, matching the axis `decomposeMatrix` reads back. */
function rotationRows(axis: Vec3, degrees: number): number[] {
	const t = degrees * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), [x, y, z] = axis, k = 1 - c;
	return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}
const apply3 = (r: readonly number[], v: Vec3): Vec3 => [r[0] * v[0] + r[1] * v[1] + r[2] * v[2], r[3] * v[0] + r[4] * v[1] + r[5] * v[2], r[6] * v[0] + r[7] * v[1] + r[8] * v[2]];
function transformDimensions(matrix: number[]): Dimension[] {
	const { translation: t, scale, angle, axis, rotation } = decomposeMatrix(matrix);
	const turned = angle > 1e-6;
	if (!turned && Math.abs(scale - 1) > 1e-9) {
		/* T(c) S T(-c): t = c(1 - s), so c = t / (1 - s). */
		const c: Vec3 = [t[0] / (1 - scale), t[1] / (1 - scale), t[2] / (1 - scale)];
		return [dim('factor', 'Scale', scale, 'factor', (next) => ({ matrix: rowMajor(IDENTITY3, next, [c[0] * (1 - next), c[1] * (1 - next), c[2] * (1 - next)]) }))];
	}
	if (turned) {
		/* T(c) R T(-c): t = (I - R)c, solvable in the plane perpendicular to the axis; the axial part of t is a slide and is kept. */
		const along = t[0] * axis[0] + t[1] * axis[1] + t[2] * axis[2];
		const slide: Vec3 = [axis[0] * along, axis[1] * along, axis[2] * along];
		const perp: Vec3 = [t[0] - slide[0], t[1] - slide[1], t[2] - slide[2]];
		const seed: Vec3 = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
		const e1raw: Vec3 = [seed[1] * axis[2] - seed[2] * axis[1], seed[2] * axis[0] - seed[0] * axis[2], seed[0] * axis[1] - seed[1] * axis[0]];
		const n1 = Math.hypot(...e1raw), e1: Vec3 = [e1raw[0] / n1, e1raw[1] / n1, e1raw[2] / n1];
		const e2: Vec3 = [axis[1] * e1[2] - axis[2] * e1[1], axis[2] * e1[0] - axis[0] * e1[2], axis[0] * e1[1] - axis[1] * e1[0]];
		const th = angle * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th), det = 2 * (1 - cs);
		const p1 = perp[0] * e1[0] + perp[1] * e1[1] + perp[2] * e1[2], p2 = perp[0] * e2[0] + perp[1] * e2[1] + perp[2] * e2[2];
		const c1 = ((1 - cs) * p1 - sn * p2) / det, c2 = (sn * p1 + (1 - cs) * p2) / det;
		const c: Vec3 = [c1 * e1[0] + c2 * e2[0], c1 * e1[1] + c2 * e2[1], c1 * e1[2] + c2 * e2[2]];
		return [dim('angle', 'Angle', angle, 'deg', (next) => {
			const r = rotationRows(axis, next), rc = apply3(r, c);
			return { matrix: rowMajor(r, scale, [c[0] - rc[0] + slide[0], c[1] - rc[1] + slide[1], c[2] - rc[2] + slide[2]]) };
		})];
	}
	return vec('Move', t, (next) => ({ matrix: rowMajor(rotation, scale, next) }));
}

/* ------------------------------------------------- sketch dimensions */
const CONSTRAINT_WORDS: Partial<Record<SketchProjection['constraints'][number]['type'], string>> = { distance: 'Distance', pointLineDistance: 'Distance', angle: 'Angle', circleRadius: 'Radius', arcRadius: 'Radius', fixX: 'X', fixY: 'Y' };
/**
 * The driving constraints of a sketch, numbered per word ("Distance 1",
 * "Distance 2", "Radius 1") with the entities they name as the detail. The
 * patch rewrites the whole `constraints` array with one value moved, which is
 * what `set-feature` on the sketch feature carries.
 */
export function sketchDimensions(sketch: Pick<SketchProjection, 'feature' | 'constraints'> & { entities?: readonly SketchEntity[] }): Dimension[] {
	const out: Dimension[] = [], counts = new Map<string, number>();
	for (const c of sketch.constraints) {
		if (!DIMENSIONED.includes(c.type) || !('value' in c)) continue;
		/* A distance to a line of exactly zero is the Point on line RELATION a snap writes (`sketch/snap.ts`), not a size: listing it would put a "0.000 in" on the model beside every snapped point. */
		if (c.type === 'pointLineDistance' && c.value === 0) continue;
		const word = CONSTRAINT_WORDS[c.type] ?? c.type;
		const n = (counts.get(word) ?? 0) + 1; counts.set(word, n);
		/* With the entities to hand the detail says what the number measures in words a student reads ("horizontal", "circle"); without them, the entity ids, which is all there is. */
		const detail = (sketch.entities ? detailWord(sketch.entities, c) : null) ?? (c.type === 'distance' ? `${c.a} to ${c.b}` : c.type === 'pointLineDistance' ? `${c.point} to ${c.line}` : c.type === 'angle' ? `${c.l1} to ${c.l2}` : c.type === 'circleRadius' ? c.circle : c.type === 'arcRadius' ? c.arc : c.point);
		out.push(dim(c.id, `${word} ${n}`, c.value, c.type === 'angle' ? 'deg' : 'in', (value) => ({ constraints: sketch.constraints.map((k) => (k.id === c.id ? { ...k, value } : k)) }), detail));
	}
	return out;
}

/* ------------------------------------------------- which feature */
/**
 * The feature whose numbers a selection offers: a feature, sketch or
 * reference by its own id; a FACE by the feature that made that face (its
 * construction name starts with the feature id, `naming.ts`), so pressing a
 * fillet's round face offers the fillet's radius and a hole's wall its
 * diameter, as SolidWorks shows a face's own feature; anything else on a body
 * (a body, an edge, a corner, a face whose name no longer names a feature in
 * the list, or a face a copy carried over from its source) by the feature
 * that created the body. The Dimensions panel and
 * the viewport's numbers ask this one question the same way.
 */
export function featureForSelection(selection: Selection | null | undefined, model: Pick<ModelProjection, 'bodies' | 'features'>, features: readonly Pick<Feature, 'id'>[]): string | null {
	if (!selection) return null;
	if (selection.kind === 'feature' || selection.kind === 'sketch' || selection.kind === 'reference') return selection.id;
	const creator = model.bodies.find((b) => b.id === selection.bodyId)?.createdBy ?? null;
	if (selection.kind === 'face') {
		/* The naming feature counts only if it made or changed THIS body: a patterned or mirrored copy keeps its source's face names, and its numbers are the pattern's. */
		const made = selection.id.split('.')[0], row = model.features.find((r) => r.id === made);
		if (made && features.some((f) => f.id === made) && (made === creator || !!row?.bodies.includes(selection.bodyId))) return made;
	}
	return creator;
}

/** What a sketch number measures, in a word: a distance is horizontal, vertical or aligned by where its two points sit; a radius is a circle's or an arc's. Null when the entities do not say. */
function detailWord(entities: readonly SketchEntity[], c: SketchProjection['constraints'][number]): string | null {
	const at = (id: string) => { const p = entities.find((e) => e.id === id); return p && p.type === 'point' ? p : null; };
	switch (c.type) {
		case 'distance': {
			const a = at(c.a), b = at(c.b); if (!a || !b) return null;
			const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), tol = 1e-9 * Math.max(1, dx, dy);
			return dy <= tol && dx > tol ? 'horizontal' : dx <= tol && dy > tol ? 'vertical' : 'aligned';
		}
		case 'pointLineDistance': return 'point to line';
		case 'angle': return 'between lines';
		case 'circleRadius': return 'circle';
		case 'arcRadius': return 'arc';
		case 'fixX': return 'from the vertical axis';
		case 'fixY': return 'from the horizontal axis';
		default: return null;
	}
}

/* ------------------------------------------------- measured values */
/**
 * The circle a CIRCLE edge lies on, read through three of its sampled points
 * (the mate frames' own `circleThrough`), or null for any other curve or a
 * polyline too short to say.
 */
export function circleOfEdge(edge: Pick<EdgeProjection, 'curve' | 'points'>): { center: Vec3; normal: Vec3; radius: number } | null {
	const n = Math.floor(edge.points.length / 3);
	if (edge.curve !== 'CIRCLE' || n < 3) return null;
	const at = (i: number): Vec3 => [edge.points[3 * i], edge.points[3 * i + 1], edge.points[3 * i + 2]];
	try { return circleThrough(at(0), at(Math.floor(n / 3)), at(Math.floor((2 * n) / 3))); } catch { return null; }
}
const measured = (key: string, label: string, value: number, unit: MeasuredUnit): Measured => ({ key, label, value, unit, driving: false });
/** `bounds` is the kernel's `[min x, min y, min z, max x, max y, max z]`. */
export const boundsSize = (bounds: readonly number[]): Vec3 => [bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]];
/**
 * What the selection measures, read off the projection: never typed, never
 * patched. An empty list is the ordinary answer for a feature or reference
 * selection, which has nothing to measure.
 */
export function drivenDimensions(selection: Selection | null | undefined, model: ModelProjection): Measured[] {
	if (!selection) return [];
	const body: BodyProjection | undefined = model.bodies.find((b) => b.id === selection.bodyId);
	switch (selection.kind) {
		case 'edge': {
			const edge = body?.edges.find((e) => e.id === selection.id); if (!edge) return [];
			/* A round edge (a hole's rim, a boss's top) also reads as its diameter, which is the number a student checks a hole against. */
			const circle = circleOfEdge(edge);
			return [measured('length', 'Length', edge.length, 'in'), ...(circle ? [measured('diameter', 'Diameter', 2 * circle.radius, 'in')] : [])];
		}
		case 'face': { const face = body?.faces.find((f) => f.id === selection.id); return face ? [measured('area', 'Area', face.area, 'in2')] : []; }
		case 'vertex': { const v = body?.vertices.find((x) => x.id === selection.id); return v ? (['X', 'Y', 'Z'] as const).map((axis, i) => measured(`at.${axis.toLowerCase()}`, `At ${axis}`, v.point[i], 'in')) : []; }
		case 'body': {
			if (!body) return [];
			const size = boundsSize(body.bounds);
			return [...(['X', 'Y', 'Z'] as const).map((axis, i) => measured(`size.${axis.toLowerCase()}`, `Size ${axis}`, size[i], 'in')), measured('volume', 'Volume', body.volume, 'in3')];
		}
		case 'sketch': { const sketch = model.sketches.find((s) => s.feature === selection.id); return sketch?.regions.length ? [measured('area', 'Enclosed area', sketch.regions.reduce((n, r) => n + r.area, 0), 'in2')] : []; }
		default: return [];
	}
}
