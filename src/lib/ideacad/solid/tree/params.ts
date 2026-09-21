/**
 * WHAT A FEATURE'S PARAMETERS LOOK LIKE ON A FORM, as plain data. One
 * descriptor per editable value -- a number, a word from a fixed list, a
 * yes/no, a vector -- and one read-only descriptor per reference, with the
 * words a student reads in place of a stored name and whether that reference
 * currently resolves on the model.
 *
 * NOTHING IS CLAMPED HERE. A number field carries no min and no max; the
 * kernel refuses what it refuses and the feature's own row says so. The only
 * refusal this module produces is `patchFor` on a field it does not know.
 *
 * REFERENCES ARE READ-ONLY WORDS. Re-picking a face is a viewport gesture,
 * which is another surface's; what the tree owes is an honest reading of
 * whether the stored reference still finds something, so a student who sees
 * `Lost reference` on the row can tell WHICH reference it means.
 */
import { edgeId, vertexId } from '../naming';
import { TYPE_LABELS } from '../features';
import type { AxisRef, EdgeRef, EntityRef, FaceRef, Feature, FeatureRow, ModelProjection, PlaneRef, PointRef, SolidManifest, VertexRef } from '../types';

export type RefStatus = 'found' | 'missing' | 'reattached';
export const REF_STATUS_WORDS: Record<RefStatus, string> = { found: 'found', missing: 'not on the model', reattached: 'reattached by shape' };
export interface RefWords { words: string; status: RefStatus }

export type Field =
	| { kind: 'number'; id: string; label: string; unit?: string; value: number | undefined; optional?: boolean }
	| { kind: 'enum'; id: string; label: string; value: string; options: readonly { value: string; label: string }[] }
	| { kind: 'boolean'; id: string; label: string; value: boolean }
	| { kind: 'text'; id: string; label: string; value: string }
	| { kind: 'vector'; id: string; label: string; unit?: string; value: number[]; columns: number; names?: string[] }
	| { kind: 'ref'; id: string; label: string; ref: RefWords }
	| { kind: 'refs'; id: string; label: string; refs: RefWords[] };
export interface ParamContext { manifest: SolidManifest; model: ModelProjection; row?: FeatureRow }

const OPERATIONS = [{ value: 'new', label: 'New body' }, { value: 'add', label: 'Add' }, { value: 'cut', label: 'Cut' }] as const;
const DIRECTIONS = [{ value: 'normal', label: 'Normal' }, { value: 'reverse', label: 'Reverse' }, { value: 'both', label: 'Both' }] as const;
const PATTERN_MODES = [{ value: 'linear', label: 'Linear' }, { value: 'circular', label: 'Circular' }] as const;
const BOOLEANS = [{ value: 'union', label: 'Union' }, { value: 'subtract', label: 'Subtract' }, { value: 'intersect', label: 'Intersect' }] as const;
const MATE_KINDS = ['coincident', 'concentric', 'parallel', 'perpendicular', 'distance', 'angle'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const HOLE_FITS = ['tapped', 'close', 'normal', 'custom'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const LAWS = [{ value: 'linear', label: 'Linear' }, { value: 'scurve', label: 'S-curve' }] as const;
const fix = (n: number) => String(Number(n.toFixed(4)));
const triple = (p: readonly number[]) => `(${p.map(fix).join(', ')})`;

/* ------------------------------------------------------------ reference words */
const bodyName = (id: string, ctx: ParamContext) => ctx.model.bodies.find((b) => b.id === id)?.name ?? ctx.manifest.bodies.find((b) => b.id === id)?.name ?? id;
const featureName = (id: string, ctx: ParamContext) => ctx.manifest.features.find((f) => f.id === id)?.name ?? id;
/** The row's own warning names the kind it reattached, so a matching reference reads `reattached by shape` rather than `found`. */
const reattached = (ctx: ParamContext, kind: 'face' | 'edge' | 'corner') => ctx.row?.status === 'warning' && !!ctx.row.message?.startsWith(`Reattached by shape: the ${kind} `);
export function bodyWords(id: string, ctx: ParamContext): RefWords {
	return { words: `body ${bodyName(id, ctx)}`, status: ctx.model.bodies.some((b) => b.id === id) ? 'found' : 'missing' };
}
export function sketchWords(id: string, ctx: ParamContext): RefWords {
	return { words: `sketch ${featureName(id, ctx)}`, status: ctx.model.sketches.some((s) => s.feature === id) ? 'found' : 'missing' };
}
function referenceWords(id: string, kind: 'plane' | 'axis' | 'point', ctx: ParamContext): RefWords {
	return { words: `${kind} ${featureName(id, ctx)}`, status: ctx.model.references.some((r) => r.feature === id) ? 'found' : 'missing' };
}
export function faceWords(ref: FaceRef, ctx: ParamContext): RefWords {
	const body = ctx.model.bodies.find((b) => b.id === ref.body);
	const status: RefStatus = !body ? 'missing' : reattached(ctx, 'face') ? 'reattached' : body.faces.some((f) => f.id === ref.name) ? 'found' : 'missing';
	return { words: `face ${ref.name} on ${bodyName(ref.body, ctx)}`, status };
}
export function edgeWords(ref: EdgeRef, ctx: ParamContext): RefWords {
	const body = ctx.model.bodies.find((b) => b.id === ref.body), id = edgeId(ref.faces, ref.ordinal);
	const status: RefStatus = !body ? 'missing' : reattached(ctx, 'edge') ? 'reattached' : body.edges.some((e) => e.id === id) ? 'found' : 'missing';
	return { words: `edge between ${ref.faces.join(' and ')} on ${bodyName(ref.body, ctx)}`, status };
}
export function vertexWords(ref: VertexRef, ctx: ParamContext): RefWords {
	const body = ctx.model.bodies.find((b) => b.id === ref.body), id = vertexId(ref.faces, ref.ordinal);
	const status: RefStatus = !body ? 'missing' : reattached(ctx, 'corner') ? 'reattached' : body.vertices.some((v) => v.id === id) ? 'found' : 'missing';
	return { words: `corner of ${ref.faces.join(', ')} on ${bodyName(ref.body, ctx)}`, status };
}
export function planeWords(ref: PlaneRef, ctx: ParamContext): RefWords {
	if (ref.kind === 'datum') return { words: `${ref.datum} plane${ref.offset ? ` offset ${fix(ref.offset)} in` : ''}`, status: 'found' };
	if (ref.kind === 'fixed') return { words: `a fixed plane at ${triple(ref.plane.origin)}`, status: 'found' };
	if (ref.kind === 'face') { const f = faceWords(ref.face, ctx); return { words: `plane of ${f.words}`, status: f.status }; }
	return referenceWords(ref.feature, 'plane', ctx);
}
export function axisWords(ref: AxisRef, ctx: ParamContext): RefWords {
	if (ref.kind === 'datum') return { words: `${ref.axis} axis`, status: 'found' };
	if (ref.kind === 'line') return { words: `a line through ${triple(ref.origin)} along ${triple(ref.direction)}`, status: 'found' };
	if (ref.kind === 'sketch') { const s = sketchWords(ref.feature, ctx); return { words: `${s.words}, its ${ref.axis} axis`, status: s.status }; }
	if (ref.kind === 'edge') { const e = edgeWords(ref.edge, ctx); return { words: `along the ${e.words}`, status: e.status }; }
	if (ref.kind === 'face') { const f = faceWords(ref.face, ctx); return { words: `axis of ${f.words}`, status: f.status }; }
	return referenceWords(ref.feature, 'axis', ctx);
}
export function pointWords(ref: PointRef, ctx: ParamContext): RefWords {
	if (ref.kind === 'origin') return { words: 'the origin', status: 'found' };
	if (ref.kind === 'coordinates') return { words: triple(ref.point), status: 'found' };
	if (ref.kind === 'vertex') return vertexWords(ref.vertex, ctx);
	return referenceWords(ref.feature, 'point', ctx);
}
export function entityWords(ref: EntityRef, ctx: ParamContext): RefWords {
	switch (ref.kind) {
		case 'body': return bodyWords(ref.body, ctx);
		case 'face': return faceWords(ref, ctx);
		case 'edge': return edgeWords(ref, ctx);
		case 'vertex': return vertexWords(ref, ctx);
		case 'reference': { const f = ctx.manifest.features.find((x) => x.id === ref.feature); return referenceWords(ref.feature, f?.type === 'axis' ? 'axis' : f?.type === 'point' ? 'point' : 'plane', ctx); }
		case 'sketch-entity': { const s = sketchWords(ref.feature, ctx); return { words: `${s.words}, entity ${ref.entity}`, status: s.status }; }
	}
}

/* ------------------------------------------------------------------ fields */
const num = (id: string, label: string, value: number | undefined, unit?: string, optional = false): Field => ({ kind: 'number', id, label, unit, value, optional });
const en = (id: string, label: string, value: string, options: readonly { value: string; label: string }[]): Field => ({ kind: 'enum', id, label, value, options });
const bool = (id: string, label: string, value: boolean | undefined): Field => ({ kind: 'boolean', id, label, value: !!value });
const text = (id: string, label: string, value: string): Field => ({ kind: 'text', id, label, value });
const ref = (id: string, label: string, ref: RefWords): Field => ({ kind: 'ref', id, label, ref });
const refs = (id: string, label: string, refs: RefWords[]): Field => ({ kind: 'refs', id, label, refs });
const vec = (id: string, label: string, value: readonly number[], columns: number, unit?: string, names?: string[]): Field => ({ kind: 'vector', id, label, unit, value: [...value], columns, names });
const IN = 'in', DEG = '°';
/** An edge joins two faces and a corner three or more; the hint, when there is one, says the same in its own shape. */
export const isVertexRef = (r: EdgeRef | VertexRef): r is VertexRef => (r.hint && 'point' in r.hint) || r.faces.length >= 3;

/** The form for one feature: editable values first, then the references it holds, in the order the type declares them. */
export function fieldsFor(f: Feature, ctx: ParamContext): Field[] {
	const op = (value: string) => en('operation', 'Operation', value, OPERATIONS);
	const target = (id: string | undefined) => id ? [ref('target', 'Target body', bodyWords(id, ctx))] : [];
	switch (f.type) {
		case 'body': return [text('source', 'Source', f.source === 'legacy' ? 'saved geometry' : f.source ?? 'import'), ref('bodyId', 'Body', bodyWords(f.bodyId, ctx)), text('artifact', 'Geometry', `${f.artifact.slice(0, 12)}…`)];
		case 'sketch': return [ref('plane', 'Plane', planeWords(f.plane, ctx)), text('entities', 'Entities', String(f.entities.filter((e) => e.type !== 'point').length)), text('constraints', 'Constraints', String(f.constraints.length))];
		case 'extrude': return [num('distance', 'Distance', f.distance, IN), en('direction', 'Direction', f.direction ?? 'normal', DIRECTIONS), op(f.operation), ref('sketch', 'Sketch', sketchWords(f.sketch, ctx)), ...target(f.target), ...(f.regions?.length ? [text('regions', 'Regions', f.regions.join(', '))] : [])];
		case 'revolve': return [num('angle', 'Angle', f.angle, DEG), op(f.operation), ref('sketch', 'Sketch', sketchWords(f.sketch, ctx)), ref('axis', 'Axis', axisWords(f.axis, ctx)), ...target(f.target)];
		case 'push': return [num('value', 'Distance', f.value, IN), ref('face', 'Face', faceWords(f.face, ctx))];
		case 'move-selection': { const entity = f.entity; return [vec('delta', 'Move by', f.delta, 3, IN, ['x', 'y', 'z']), isVertexRef(entity) ? ref('entity', 'Corner', vertexWords(entity, ctx)) : ref('entity', 'Edge', edgeWords(entity, ctx))]; }
		case 'fillet': return [num('radius', 'Radius', f.radius, IN), bool('propagate', 'Follow tangent edges', f.propagate), num('variable.end', 'Radius at the far end', f.variable?.end, IN, true), ...(f.variable ? [en('variable.law', 'Radius law', f.variable.law ?? 'linear', LAWS)] : []), refs('edges', 'Edges', f.edges.map((e) => edgeWords(e, ctx)))];
		case 'chamfer': return [num('distance', 'Distance', f.distance, IN), num('distance2', 'Second distance', f.distance2, IN, true), num('angle', 'Angle', f.angle, DEG, true), bool('propagate', 'Follow tangent edges', f.propagate), refs('edges', 'Edges', f.edges.map((e) => edgeWords(e, ctx)))];
		case 'shell': return [num('thickness', 'Wall thickness', f.thickness, IN), ref('body', 'Body', bodyWords(f.body, ctx)), refs('openFaces', 'Open faces', f.openFaces.map((x) => faceWords(x, ctx))), ...(f.faceThickness?.length ? [refs('faceThickness', 'Faces with their own thickness', f.faceThickness.map((t) => { const w = faceWords(t.face, ctx); return { ...w, words: `${w.words}: ${fix(t.thickness)} in` }; }))] : [])];
		case 'transform': return [vec('matrix', 'Transform matrix', f.matrix, 4), refs('bodies', 'Bodies', f.bodies.map((b) => bodyWords(b, ctx)))];
		case 'mirror': return [bool('merge', 'Merge with the original', f.merge), ref('plane', 'Mirror plane', planeWords(f.plane, ctx)), refs('bodies', 'Bodies', f.bodies.map((b) => bodyWords(b, ctx)))];
		case 'pattern': return [en('mode', 'Pattern', f.mode, PATTERN_MODES), num('count', 'Count', f.count), num('spacing', f.mode === 'linear' ? 'Spacing' : 'Angle between copies', f.spacing, f.mode === 'linear' ? IN : DEG), ref('body', 'Body', bodyWords(f.body, ctx)), ref('axis', 'Along', axisWords(f.axis, ctx))];
		case 'boolean': return [en('operation', 'Operation', f.operation, BOOLEANS), refs('bodies', 'Bodies', f.bodies.map((b) => bodyWords(b, ctx)))];
		case 'delete': return [refs('bodies', 'Bodies', f.bodies.map((b) => bodyWords(b, ctx)))];
		case 'plane': {
			const d = f.definition, kind = text('definition.kind', 'Defined by', d.kind);
			if (d.kind === 'offset') return [kind, num('definition.offset', 'Offset', d.offset, IN), ref('definition.from', 'From', planeWords(d.from, ctx))];
			if (d.kind === 'angle') return [kind, num('definition.angle', 'Angle', d.angle, DEG), ref('definition.from', 'From', planeWords(d.from, ctx)), ref('definition.about', 'About', axisWords(d.about, ctx))];
			if (d.kind === 'through-points') return [kind, refs('definition.points', 'Through', d.points.map((p) => pointWords(p, ctx)))];
			if (d.kind === 'point-normal') return [kind, ref('definition.point', 'Through', pointWords(d.point, ctx)), ref('definition.normal', 'Normal along', axisWords(d.normal, ctx))];
			return [kind, ref('definition.a', 'Between', planeWords(d.a, ctx)), ref('definition.b', 'And', planeWords(d.b, ctx))];
		}
		case 'axis': {
			const d = f.definition, kind = text('definition.kind', 'Defined by', d.kind);
			if (d.kind === 'datum') return [kind, text('definition.axis', 'Axis', d.axis)];
			if (d.kind === 'two-points') return [kind, ref('definition.a', 'From', pointWords(d.a, ctx)), ref('definition.b', 'To', pointWords(d.b, ctx))];
			if (d.kind === 'cylinder') return [kind, ref('definition.face', 'Round face', faceWords(d.face, ctx))];
			if (d.kind === 'edge') return [kind, ref('definition.edge', 'Edge', edgeWords(d.edge, ctx))];
			if (d.kind === 'plane-plane') return [kind, ref('definition.a', 'Where', planeWords(d.a, ctx)), ref('definition.b', 'Meets', planeWords(d.b, ctx))];
			return [kind, ref('definition.point', 'Through', pointWords(d.point, ctx)), ref('definition.direction', 'Along', axisWords(d.direction, ctx))];
		}
		case 'point': {
			const d = f.definition, kind = text('definition.kind', 'Defined by', d.kind);
			if (d.kind === 'coordinates') return [kind, vec('definition.point', 'At', d.point, 3, IN, ['x', 'y', 'z'])];
			if (d.kind === 'vertex') return [kind, ref('definition.vertex', 'Corner', vertexWords(d.vertex, ctx))];
			if (d.kind === 'edge-midpoint') return [kind, ref('definition.edge', 'Middle of', edgeWords(d.edge, ctx))];
			if (d.kind === 'face-center') return [kind, ref('definition.face', 'Centre of', faceWords(d.face, ctx))];
			if (d.kind === 'axis-plane') return [kind, ref('definition.axis', 'Where', axisWords(d.axis, ctx)), ref('definition.plane', 'Meets', planeWords(d.plane, ctx))];
			return [kind, ref('definition.body', 'Centre of', bodyWords(d.body, ctx))];
		}
		case 'mate': return [en('kind', 'Mate', f.kind, MATE_KINDS), num('value', f.kind === 'angle' ? 'Angle' : 'Distance', f.value, f.kind === 'angle' ? DEG : IN, true), bool('flip', 'Flip', f.flip), ref('a', 'First', entityWords(f.a, ctx)), ref('b', 'Second', entityWords(f.b, ctx))];
		case 'hole': return [text('standard', 'Standard', f.standard), en('fit', 'Fit', f.fit, HOLE_FITS), num('diameter', 'Diameter', f.diameter, IN, true), bool('depth.through', 'Through all', f.depth === 'through'), ...(f.depth === 'through' ? [] : [num('depth', 'Depth', f.depth, IN)]), ref('face', 'Face', faceWords(f.face, ctx)), Array.isArray(f.center) ? vec('center', 'Centre on the face', f.center, 2, IN, ['u', 'v']) : ref('center', 'Centre', pointWords(f.center.point, ctx))];
		case 'draft': return [num('angle', 'Angle', f.angle, DEG), refs('faces', 'Faces', f.faces.map((x) => faceWords(x, ctx))), ref('pull', 'Pull direction', axisWords(f.pull, ctx)), ref('neutral', 'Neutral plane', planeWords(f.neutral, ctx))];
		case 'sweep': return [op(f.operation), ref('profile', 'Profile', sketchWords(f.profile, ctx)), typeof f.path === 'string' ? ref('path', 'Path', sketchWords(f.path, ctx)) : refs('path', 'Path', f.path.map((e) => edgeWords(e, ctx))), ...target(f.target)];
		case 'loft': return [bool('smooth', 'Smooth', f.smooth), op(f.operation), refs('profiles', 'Profiles', f.profiles.map((p) => sketchWords(p, ctx))), ...target(f.target)];
		case 'rib': return [num('thickness', 'Thickness', f.thickness, IN), ref('sketch', 'Sketch', sketchWords(f.sketch, ctx)), ref('target', 'Body', bodyWords(f.target, ctx))];
	}
}
/** The word the form's heading uses for a type. */
export const typeLabel = (type: Feature['type']) => TYPE_LABELS[type];

/**
 * The `set-feature` patch one field edit produces. A dotted id writes inside
 * a nested object (`variable.end`, `definition.offset`) by cloning that
 * object and returning it whole, because the reducer merges top-level keys
 * only. `undefined` clears an optional value; clearing the last value of an
 * optional object (`variable`) clears the object.
 */
export function patchFor(f: Feature, fieldId: string, value: unknown): Record<string, unknown> {
	if (fieldId === 'depth.through') {
		if (f.type !== 'hole') throw Error('Only a hole is through.');
		return { depth: value ? 'through' : typeof f.depth === 'number' ? f.depth : 1 };
	}
	const [top, sub] = fieldId.split('.');
	if (!(top in f) && !['variable', 'distance2', 'angle', 'diameter', 'value', 'direction', 'propagate', 'merge', 'smooth', 'flip', 'regions'].includes(top)) throw Error(`This feature has no ${fieldId} to edit.`);
	if (!sub) return { [top]: value };
	const current = (f as unknown as Record<string, unknown>)[top];
	const object = current && typeof current === 'object' ? { ...(current as Record<string, unknown>) } : {};
	if (value === undefined) delete object[sub]; else object[sub] = value;
	/* A fillet's `variable` is optional as a whole: no end radius means no variable fillet. */
	if (top === 'variable' && object.end === undefined) return { variable: undefined };
	return { [top]: object };
}
