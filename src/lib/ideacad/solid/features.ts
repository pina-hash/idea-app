/**
 * THE FEATURE LIST AS PLAIN DATA: ids, the v1 -> v2 upgrade, dependencies and
 * the one-line summaries the tree shows. No kernel in here, so every rule about
 * the list is assertable without one.
 *
 * WHY THE LIST IS LINEAR AND NOT A DAG, stated once here and cited from
 * `docs/IDEACAD.md`. Every feature names what it consumed, so the dependencies
 * already form a DAG -- what "linear" decides is the ORDER two independent
 * features are evaluated in and the order a student sees them in. A linear
 * history is the model the owner teaches (SolidWorks), maps one to one onto
 * the kernel's checkpoint stack (a checkpoint after each feature, so an edit
 * replays from the feature that changed and not from the start), and gives a
 * reorder a single well-defined rule: a feature may move anywhere below the
 * last feature it depends on and above the first feature that depends on it.
 * A DAG scheduler would buy parallel evaluation of independent branches that a
 * single-threaded WASM kernel cannot use, and would cost the one thing a tree
 * has to answer instantly: what happened before what.
 */
import { KERNEL_ID, type BodyRecord, type EntityRef, type Feature, type FeatureType, type LegacyManifest, type PlaneRef, type AxisRef, type PointRef, type Sketch, type SolidManifest, type FaceRef, type EdgeRef, type VertexRef } from './types';
import { legacySketchToEntities } from './sketch/model';

/** `f` plus twelve hex characters: readable in a history row, and unique enough that two of them in one document is a 1e-9 event. */
export function newFeatureId(): string {
	const bytes = new Uint8Array(6); crypto.getRandomValues(bytes);
	return 'f' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Sketch entities and constraints share the shape, shorter. */
export function newEntityId(): string {
	const bytes = new Uint8Array(4); crypto.getRandomValues(bytes);
	return 'e' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** The body a feature creates: its own id and the output ordinal. Deterministic, so a replay produces the same id. */
export const bodyIdFor = (featureId: string, k: number) => `${featureId}#${k}`;

/** Which feature types produce bodies from nothing (as opposed to changing one). */
export const CREATING_TYPES: readonly FeatureType[] = ['body', 'extrude', 'revolve', 'mirror', 'pattern', 'sweep', 'loft'];
export const REFERENCE_TYPES: readonly FeatureType[] = ['plane', 'axis', 'point'];
export const TYPE_LABELS: Record<FeatureType, string> = {
	body: 'Body', sketch: 'Sketch', extrude: 'Extrude', revolve: 'Revolve', push: 'Push face', 'move-selection': 'Move edge',
	fillet: 'Fillet', chamfer: 'Chamfer', shell: 'Shell', transform: 'Move', mirror: 'Mirror', pattern: 'Pattern', boolean: 'Combine',
	delete: 'Delete body', plane: 'Plane', axis: 'Axis', point: 'Point', mate: 'Mate', hole: 'Hole', draft: 'Draft', sweep: 'Sweep', loft: 'Loft', rib: 'Rib'
};

const fmt = (n: number, unit = ' in') => `${Number(n.toFixed(4))}${unit}`;
/** The number or word the tree shows beside a feature's name. */
export function featureSummary(f: Feature): string {
	switch (f.type) {
		case 'body': return f.source === 'legacy' ? 'saved geometry' : f.source ?? 'imported';
		case 'sketch': return `${f.entities.filter((e) => e.type !== 'point').length} entities`;
		case 'extrude': return `${f.operation === 'cut' ? 'cut ' : ''}${fmt(f.distance)}`;
		case 'revolve': return `${fmt(f.angle, '°')}`;
		case 'push': return fmt(f.value);
		case 'move-selection': return fmt(Math.hypot(...f.delta));
		case 'fillet': return `R ${fmt(f.radius)}${f.variable ? ` → ${fmt(f.variable.end)}` : ''} · ${f.edges.length} edge${f.edges.length === 1 ? '' : 's'}`;
		case 'chamfer': return f.angle !== undefined ? `${fmt(f.distance)} × ${fmt(f.angle, '°')}` : f.distance2 !== undefined && f.distance2 !== f.distance ? `${fmt(f.distance)} × ${fmt(f.distance2)}` : fmt(f.distance);
		case 'shell': return fmt(f.thickness);
		case 'transform': return matrixSummary(f.matrix);
		case 'mirror': return planeSummary(f.plane);
		case 'pattern': return `${f.count} × ${f.mode === 'linear' ? fmt(f.spacing) : fmt(f.spacing, '°')}`;
		case 'boolean': return f.operation;
		case 'delete': return `${f.bodies.length} bod${f.bodies.length === 1 ? 'y' : 'ies'}`;
		case 'plane': return f.definition.kind === 'offset' ? fmt(f.definition.offset) : f.definition.kind === 'angle' ? fmt(f.definition.angle, '°') : f.definition.kind;
		case 'axis': return f.definition.kind;
		case 'point': return f.definition.kind === 'coordinates' ? f.definition.point.map((n) => Number(n.toFixed(3))).join(', ') : f.definition.kind;
		case 'mate': return f.joint ? f.joint : f.value !== undefined ? `${f.kind} ${fmt(f.value, f.kind === 'angle' ? '°' : ' in')}` : f.kind;
		case 'hole': return `${f.standard} ${f.fit}`;
		case 'draft': return fmt(f.angle, '°');
		case 'sweep': return f.operation;
		case 'loft': return `${f.profiles.length} profiles`;
		case 'rib': return fmt(f.thickness);
	}
}
function matrixSummary(m: number[]): string {
	const t = [m[3], m[7], m[11]];
	const moved = Math.hypot(...t);
	const trace = m[0] + m[5] + m[10];
	const angle = Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))) * 180 / Math.PI;
	const scale = Math.hypot(m[0], m[4], m[8]);
	if (Math.abs(scale - 1) > 1e-6) return `× ${Number(scale.toFixed(3))}`;
	if (angle > 1e-4 && moved < 1e-6) return fmt(angle, '°');
	return fmt(moved);
}
function planeSummary(p: PlaneRef): string { return p.kind === 'datum' ? `${p.datum}${p.offset ? ` ${fmt(p.offset)}` : ''}` : p.kind === 'face' ? 'face' : 'plane'; }

/* -------------------------------------------------------------------------
 * DEPENDENCIES, which is what makes reorder, suppress and delete answerable.
 * ---------------------------------------------------------------------- */

/** Every id the reference names: feature ids for sketches and references, body ids for topology. */
function refDependencies(ref: EntityRef | FaceRef | EdgeRef | VertexRef | PlaneRef | AxisRef | PointRef | undefined | null, out: Set<string>) {
	if (!ref || typeof ref !== 'object') return;
	const r = ref as Record<string, unknown>;
	if (typeof r.body === 'string') out.add(r.body);
	if (typeof r.feature === 'string') out.add(r.feature);
	for (const key of ['face', 'edge', 'vertex', 'from', 'about', 'a', 'b', 'point', 'normal', 'direction', 'plane', 'axis', 'neutral', 'pull']) if (r[key] && typeof r[key] === 'object') refDependencies(r[key] as EntityRef, out);
	if (Array.isArray(r.points)) for (const p of r.points) refDependencies(p as PointRef, out);
}
/**
 * The feature ids and body ids a feature consumes. A body id maps back to its
 * creating feature through `bodyIdFor`'s shape, so `dependsOnFeatures` answers
 * the reorder question in feature ids alone.
 */
export function featureDependencies(f: Feature): string[] {
	const out = new Set<string>();
	switch (f.type) {
		case 'body': break;
		case 'sketch': refDependencies(f.plane, out); break;
		case 'extrude': out.add(f.sketch); if (f.target) out.add(f.target); break;
		case 'revolve': out.add(f.sketch); if (f.target) out.add(f.target); refDependencies(f.axis, out); break;
		case 'push': refDependencies(f.face, out); break;
		case 'move-selection': refDependencies(f.entity, out); break;
		case 'fillet': case 'chamfer': for (const e of f.edges) refDependencies(e, out); break;
		case 'shell': out.add(f.body); for (const o of f.openFaces) refDependencies(o, out); for (const t of f.faceThickness ?? []) refDependencies(t.face, out); break;
		case 'transform': case 'delete': for (const b of f.bodies) out.add(b); break;
		case 'mirror': for (const b of f.bodies) out.add(b); refDependencies(f.plane, out); break;
		case 'pattern': out.add(f.body); refDependencies(f.axis, out); break;
		case 'boolean': for (const b of f.bodies) out.add(b); break;
		case 'plane': case 'axis': case 'point': refDependencies(f.definition as unknown as EntityRef, out); break;
		case 'mate': refDependencies(f.a, out); refDependencies(f.b, out); break;
		case 'hole': refDependencies(f.face, out); if (typeof f.center === 'object' && !Array.isArray(f.center)) refDependencies(f.center.point, out); break;
		case 'draft': for (const x of f.faces) refDependencies(x, out); refDependencies(f.pull, out); refDependencies(f.neutral, out); break;
		case 'sweep': out.add(f.profile); if (typeof f.path === 'string') out.add(f.path); else for (const e of f.path) refDependencies(e, out); if (f.target) out.add(f.target); break;
		case 'loft': for (const p of f.profiles) out.add(p); if (f.target) out.add(f.target); break;
		case 'rib': out.add(f.sketch); out.add(f.target); break;
	}
	return [...out];
}
/** A body id's creating feature, or the id itself when it is already a feature id. */
export const featureOfId = (id: string) => id.includes('#') ? id.slice(0, id.indexOf('#')) : id;
export function dependsOnFeatures(f: Feature, features: readonly Feature[]): string[] {
	const ids = new Set(features.map((x) => x.id));
	const out = new Set<string>();
	for (const dep of featureDependencies(f)) {
		const fid = featureOfId(dep);
		if (ids.has(fid) && fid !== f.id) out.add(fid);
		/* A legacy body's id is its own record id, which no feature id shape matches. */
		else for (const x of features) if (x.type === 'body' && x.bodyId === dep) out.add(x.id);
	}
	return [...out];
}
/** Features that name this one (or a body it creates), directly. */
export function dependents(id: string, features: readonly Feature[]): Feature[] {
	return features.filter((f) => f.id !== id && dependsOnFeatures(f, features).includes(id));
}
/**
 * Where a feature may legally move. The lowest index is just after the last
 * feature it depends on; the highest is just before the first that depends on
 * it. Both are indices in the list WITH the feature removed.
 */
export function reorderRange(id: string, features: readonly Feature[]): { min: number; max: number } | null {
	const index = features.findIndex((f) => f.id === id);
	if (index < 0) return null;
	const without = features.filter((f) => f.id !== id);
	const deps = new Set(dependsOnFeatures(features[index], features));
	let min = 0;
	without.forEach((f, i) => { if (deps.has(f.id)) min = i + 1; });
	let max = without.length;
	without.forEach((f, i) => { if (max === without.length && dependsOnFeatures(f, features).includes(id)) max = i; });
	return { min, max };
}

/* -------------------------------------------------------------------------
 * THE v1 -> v2 UPGRADE. A document with no history is a valid document.
 * ---------------------------------------------------------------------- */

export function isLegacyManifest(m: unknown): m is LegacyManifest {
	return !!m && typeof m === 'object' && (m as { format?: string }).format === 'ideacad-solid-v1';
}
/**
 * Every v1 body becomes a `body` feature whose parameter is the artifact; every
 * unconsumed v1 sketch becomes a `sketch` feature. The body ids are KEPT, so
 * the metadata records, the history rows that name `/bodies/k` and any
 * reference a future feature makes to them all still resolve. The name says
 * "Saved body" and the summary says "saved geometry", so the tree is honest
 * about what it knows: the shape, and not how it was made.
 */
export function upgradeManifest(m: LegacyManifest | SolidManifest): SolidManifest {
	if (!isLegacyManifest(m)) return m;
	const features: Feature[] = [];
	m.bodies.forEach((body, i) => features.push({ id: `legacy-${body.id}`, name: `Saved body ${i + 1}`, type: 'body', bodyId: body.id, artifact: body.artifact, source: 'legacy' }));
	for (const sketch of m.sketches) features.push(legacySketchFeature(sketch));
	return { format: 'ideacad-solid-v2', kernel: KERNEL_ID, units: 'in', title: m.title, features, bodies: m.bodies.map((b) => ({ ...b })), sketches: [], addons: { ...m.addons } };
}
export function legacySketchFeature(sketch: Sketch): Feature {
	const converted = legacySketchToEntities(sketch);
	return { id: `legacy-${sketch.id}`, name: sketch.name, type: 'sketch', plane: converted.plane, entities: converted.entities, constraints: converted.constraints };
}
/** A metadata record for a body id, from the manifest's cache or fresh. */
export function bodyRecordFor(m: SolidManifest, id: string, name: string, createdBy?: Feature): BodyRecord {
	return m.bodies.find((b) => b.id === id) ?? { id, name, artifact: '', materialId: null, role: 'part', ...(createdBy?.type === 'body' && createdBy.source === 'addon' ? {} : {}) };
}
export const isKernelId = (value: unknown): value is typeof KERNEL_ID => value === KERNEL_ID;
