/**
 * THE FEATURE REPLAY ENGINE.
 *
 * A document is its ordered feature list (`types.ts`). This engine holds one
 * kernel, replays the list into live bodies, and keeps a KERNEL CHECKPOINT
 * AFTER EVERY FEATURE, so an edit replays from the feature that changed and
 * not from the start:
 *
 *   checkpoints[i]  the kernel exactly as it stood after feature i
 *   states[i]       the body table, reference table and solved sketches then
 *
 * Editing feature k restores checkpoints[k-1], truncates both stacks, and runs
 * k..n. Dragging the last feature therefore costs ONE kernel operation per
 * frame, exactly what the 2026-09-15 modeler paid, and editing a number three
 * features deep in a forty-feature document costs the thirty-seven operations
 * below it. `replayMs` and `replayedFrom` are reported on every projection so
 * the arithmetic in `docs/IDEACAD.md` is a reading and not a claim.
 *
 * THE COST OF A CHECKPOINT IS A CLONE OF THE KERNEL ARENA, measured rather
 * than assumed in `tests/ideacad-solid-features.test.ts`, which reports linear
 * memory against feature count. `CHECKPOINT_WINDOW` bounds the stack: only the
 * newest N features keep a checkpoint, and an edit deeper than that replays
 * from the base. It is the one knob, and the test prints what it costs.
 *
 * A FEATURE THAT FAILS IS SKIPPED, NOT FATAL. Its status and its sentence go
 * on its row in the tree; the kernel is restored to the checkpoint before it;
 * every later feature still runs, and one that depended on the failed one
 * fails in turn with a lost-reference sentence naming what it needed. That is
 * how a document with a broken fillet still opens.
 *
 * WHAT THE ENGINE NEVER DOES: assign a face a name that depends on the order
 * the kernel happened to enumerate it in when a construction role could be
 * found instead (`naming.ts`), or rewrite a stored feature to repair a
 * reference.
 */
import { createKernel, type BrepKernel } from '../kernel/remus';
import { validateManifest } from './validate';
import { dot, sub, unit, vector } from './math';
import { anchorOrder, assignNames, edgeHintMatches, edgeId, faceAnchor, faceHintMatches, lostReference, ambiguousReference, reattachedReference, vertexHintMatches, vertexId, type NamingOptions, type NamingReport } from './naming';
import { dependsOnFeatures, featureSummary, upgradeManifest } from './features';
import { reduce } from './commands';
import { datumPlane, regionOutlines, solveSketch, planeFromNormal } from './sketch/model';
import { EXECUTORS, solveMates } from './features/index';
import type { ExecutorContext, LiveBody, MateState, Resolved, ResolvedRef, SketchState } from './features/context';
import { emptyManifest, type AxisRef, type BodyProjection, type BodyRecord, type EdgeRef, type FaceRef, type Feature, type FeatureRow, type GeometryArtifact, type ModelProjection, type ModelSnapshot, type PlaneRef, type PointRef, type ResolvedAxis, type ResolvedPlane, type ResolvedPoint, type Selection, type SketchConstraint, type SketchEntity, type SolidCommand, type SolidManifest, type Vec3, type VertexRef, type LegacyManifest, type MateProjection, type ReferenceProjection, type SketchProjection } from './types';

const json = <T = Record<string, any>>(input: unknown): T => (typeof input === 'string' ? JSON.parse(input) : input) as T;
const clone = <T>(value: T): T => structuredClone(value);
/** How many of the newest features keep a kernel checkpoint. See the header. */
export const CHECKPOINT_WINDOW = 12;

interface State { bodies: Map<string, LiveBody>; order: string[]; refs: Map<string, ResolvedRef>; sketches: Map<string, SketchState>; mates: MateState[] }
interface Result { status: FeatureRow['status']; message?: string; bodies: string[]; naming?: NamingReport }
interface Pick { body: LiveBody; handle: number; kind: Selection['kind'] }
interface Step { before: SolidManifest; after: SolidManifest }
interface CachedBody { faces: BodyProjection['faces']; edges: BodyProjection['edges']; vertices: BodyProjection['vertices']; mesh: BodyProjection['mesh']; bounds: number[]; volume: number; centerOfMass: Vec3; inertia: number[]; handles: { faces: Map<string, number>; edges: Map<string, number>; vertices: Map<string, number> } }
const cloneState = (s: State): State => ({ bodies: new Map([...s.bodies].map(([k, v]) => [k, { ...v }])), order: [...s.order], refs: new Map(s.refs), sketches: new Map(s.sketches), mates: [...s.mates] });
const emptyState = (): State => ({ bodies: new Map(), order: [], refs: new Map(), sketches: new Map(), mates: [] });

export class SolidEngine {
	private features: Feature[] = [];
	private records: BodyRecord[] = [];
	private addons: SolidManifest['addons'] = { ideaBlade: false };
	private title = 'Untitled document';
	private artifacts = new Map<string, Uint8Array>();
	private live: State = emptyState();
	private states: State[] = [];
	private checkpoints: (number | null)[] = [];
	private results: Result[] = [];
	private base = 0;
	private picks = new Map<string, Pick>();
	private cache = new Map<number, CachedBody>();
	private undoSteps: Step[] = [];
	private redoSteps: Step[] = [];
	private preview: { before: SolidManifest; command?: SolidCommand } | null = null;
	private lastReplay = { ms: 0, from: 0 };
	private mateReport: ReturnType<typeof solveMates> = { moved: [], errors: [], dof: new Map(), residuals: new Map() };
	private constructor(private k: BrepKernel) { this.base = k.checkpoint(); }
	static async create(source?: string | Uint8Array) { return new SolidEngine(await createKernel(source)); }
	destroy() { this.k.free(); }

	/* ------------------------------------------------------------ manifest */
	private manifest(): SolidManifest {
		return { ...emptyManifest(), title: this.title, features: clone(this.features), bodies: clone(this.records), sketches: [], addons: clone(this.addons) };
	}
	/** Reconcile the metadata records with the live bodies: keep what exists, add what is new, drop what is gone. */
	private reconcileRecords() {
		const next: BodyRecord[] = [];
		for (const id of this.live.order) {
			const body = this.live.bodies.get(id)!;
			const existing = this.records.find((r) => r.id === id);
			const feature = this.features.find((f) => f.id === body.createdBy);
			next.push(existing ? { ...existing, artifact: body.artifact } : { id, name: feature?.type === 'body' ? feature.name : `Body ${next.length + 1}`, artifact: body.artifact, materialId: null, role: 'part' });
		}
		this.records = next;
	}

	/* ------------------------------------------------------------- replay */
	private context(feature: Feature, index: number, touched: Set<string>, warnings: string[]): ExecutorContext {
		const engine = this, k = this.k, state = this.live;
		const ctx: ExecutorContext & { artifact(hash: string): Uint8Array } = {
			k, feature, index, manifest: { ...emptyManifest(), title: this.title, features: this.features, bodies: this.records, sketches: [], addons: this.addons },
			bodies: state.bodies, order: state.order, refs: state.refs, sketches: state.sketches, mates: state.mates,
			artifact: (hash) => { const bytes = engine.artifacts.get(hash); if (!bytes) throw Error('A saved body is missing. Reload the document.'); return bytes; },
			body: (id) => { const b = state.bodies.get(id); if (!b) throw Error(lostReference('body', engine.describeBody(id))); return b; },
			addBody: (solid, options = {}) => {
				const id = options.id ?? `${feature.id}#${[...state.bodies.values()].filter((b) => b.createdBy === feature.id).length}`;
				if (state.bodies.has(id)) throw Error('A body with this ID already exists.');
				assignNames(k, solid, feature.id, options.naming ?? {});
				engine.cache.delete(solid);
				const body: LiveBody = { id, solid, createdBy: feature.id, dirty: true, artifact: '' };
				state.bodies.set(id, body); state.order.push(id); touched.add(id);
				return body;
			},
			replaceBody: (body, solid, options = {}) => {
				const report = assignNames(k, solid, feature.id, options);
				/* The cache is keyed by solid handle and an in-place transform keeps the handle, so drop both entries. */
				engine.cache.delete(body.solid); engine.cache.delete(solid);
				body.solid = solid; body.dirty = true; body.artifact = ''; touched.add(body.id);
				return report;
			},
			removeBody: (id) => { state.bodies.delete(id); state.order = state.order.filter((b) => b !== id); touched.add(id); },
			journal: (result) => {
				const operation = json(result);
				if (operation.isPartial || operation.failedEdges?.length) throw Error('This blend could not be completed. Use a smaller size or another edge.');
				k.propagateAttributesForOp(operation.op, false);
				return operation.solid;
			},
			scratch: (fn) => engine.scratch(fn),
			resolveFace: (ref) => engine.resolveFace(ref, warnings),
			resolveEdge: (ref) => engine.resolveEdge(ref, warnings),
			resolveVertex: (ref) => engine.resolveVertex(ref, warnings),
			resolvePlane: (ref) => engine.resolvePlane(ref, warnings),
			resolveAxis: (ref) => engine.resolveAxis(ref, warnings),
			resolvePoint: (ref) => engine.resolvePoint(ref, warnings),
			sketch: (id) => { const s = state.sketches.get(id); if (!s) throw Error(lostReference('sketch', engine.features.find((f) => f.id === id)?.name ?? id)); return s; },
			setSketch: (sketch) => { state.sketches.set(sketch.feature, sketch); },
			setRef: (ref) => { state.refs.set(feature.id, ref); },
			setMate: (mate) => { state.mates = [...state.mates.filter((m) => m.feature !== mate.feature), mate]; },
			markConsumed: (id) => { const s = state.sketches.get(id); if (s) state.sketches.set(id, { ...s, consumed: true }); },
			faceName: (face) => k.getFaceName(face) || undefined,
			warn: (message) => { warnings.push(message); },
			volume: (solid) => engine.volume(solid),
			extent: () => engine.extent()
		};
		return ctx;
	}
	private scratch<T>(fn: () => T): T {
		const cp = this.k.checkpoint();
		try { return fn(); } finally { this.k.restore(cp); this.k.discardCheckpoint(cp); }
	}
	private volume(solid: number): number {
		if (this.k.validateSolid(solid) !== 0) throw Error('This change could not form a valid solid. Try a different size.');
		let volume: number;
		try { volume = json(this.k.massProperties(solid)).volume; } catch { throw Error('This change would remove the whole body. Use Delete to remove it.'); }
		if (!Number.isFinite(volume) || volume <= 0) throw Error('This change would remove the whole body. Use Delete to remove it.');
		return volume;
	}
	private extent(): { min: Vec3; max: Vec3 } | null {
		let out: { min: Vec3; max: Vec3 } | null = null;
		for (const body of this.live.bodies.values()) {
			const b = this.k.boundingBox(body.solid);
			if (!out) out = { min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]] };
			else for (let i = 0; i < 3; i++) { out.min[i] = Math.min(out.min[i], b[i]); out.max[i] = Math.max(out.max[i], b[i + 3]); }
		}
		return out;
	}
	private describeBody(id: string): string { return this.records.find((r) => r.id === id)?.name ?? id; }
	/** The checkpoint standing after feature `i`, or the base for i < 0. Null when the window dropped it. */
	private checkpointAfter(i: number): number | null { return i < 0 ? this.base : this.checkpoints[i] ?? null; }
	private replayFrom(requested: number) {
		const started = performance.now();
		const n = this.features.length;
		let from = Math.max(0, Math.min(requested, n));
		/* COMPACTION. `discardCheckpoint(id)` drops every checkpoint AFTER id as
		   well (measured: discarding the oldest of 26 invalidated the newest 25), so
		   the stack can only shrink from the top or be rebuilt from the base. It is
		   rebuilt whenever it has grown past twice the window, which bounds it. */
		const held = this.checkpoints.filter((c) => c !== null).length;
		if (held > CHECKPOINT_WINDOW * 2) from = 0;
		/* Walk back to the nearest surviving checkpoint. */
		while (from > 0 && this.checkpointAfter(from - 1) === null) from--;
		this.k.restore(this.checkpointAfter(from - 1)!);
		this.live = from > 0 ? cloneState(this.states[from - 1]) : emptyState();
		this.states.length = from; this.checkpoints.length = from; this.results.length = from;
		for (let i = from; i < n; i++) {
			const feature = this.features[i];
			const touched = new Set<string>(), warnings: string[] = [];
			const before = this.checkpointAfter(i - 1);
			/* Without a checkpoint to fall back on, a failed feature needs one taken now. */
			const fallback = before ?? this.k.checkpoint();
			if (feature.suppressed) this.results[i] = { status: 'suppressed', bodies: [] };
			else {
				try {
					const executor = EXECUTORS[feature.type] as (ctx: ExecutorContext, f: Feature) => void;
					executor(this.context(feature, i, touched, warnings), feature);
					for (const id of touched) { const b = this.live.bodies.get(id); if (b) this.volume(b.solid); }
					this.results[i] = { status: warnings.length ? 'warning' : 'ok', message: warnings[0], bodies: [...touched] };
				} catch (error) {
					this.k.restore(fallback);
					this.live = i > 0 ? cloneState(this.states[i - 1]) : emptyState();
					this.results[i] = { status: 'error', message: error instanceof Error ? error.message : String(error), bodies: [] };
				}
			}
			if (before === null) this.k.discardCheckpoint(fallback);
			this.states[i] = cloneState(this.live);
			/* Only the newest features keep a checkpoint; an edit above the window replays from the base. */
			this.checkpoints[i] = i >= n - CHECKPOINT_WINDOW ? this.k.checkpoint() : null;
		}
		this.mateReport = solveMates(this.context({ id: 'assembly', name: 'Assembly', type: 'delete', bodies: [] }, n, new Set(), []), this.live.bodies);
		for (const id of this.mateReport.moved) { const b = this.live.bodies.get(id); if (b) { b.dirty = true; b.artifact = ''; } }
		this.reconcileRecords();
		this.picks.clear();
		this.lastReplay = { ms: performance.now() - started, from };
	}
	/** The feature a command is about, whose own failure refuses the command rather than reddening a row. */
	private commandFeature(command: SolidCommand): string | null {
		if (command.type === 'add-feature') return command.feature.id;
		if (command.type === 'set-feature' || command.type === 'suppress-feature') return command.id;
		return null;
	}
	/** A command whose OWN feature failed is refused with that feature's sentence, and the manifest is put back by the caller. */
	private refuseOwnFailure(command: SolidCommand, next: SolidManifest) {
		const id = this.commandFeature(command);
		if (!id) return;
		const index = next.features.findIndex((f) => f.id === id);
		const result = index >= 0 ? this.results[index] : undefined;
		if (result?.status === 'error') throw Error(result.message ?? 'This change could not be made.');
	}
	/** Replace the whole manifest, replaying only from the first feature that differs. */
	private applyManifest(next: SolidManifest) {
		const a = this.features, b = next.features;
		let from = 0;
		while (from < a.length && from < b.length && JSON.stringify(a[from]) === JSON.stringify(b[from])) from++;
		const changed = from < Math.max(a.length, b.length);
		this.features = clone(b); this.records = clone(next.bodies); this.addons = clone(next.addons); this.title = next.title;
		if (changed) this.replayFrom(from);
		else { this.reconcileRecords(); this.lastReplay = { ms: 0, from: b.length }; }
	}

	/* --------------------------------------------------------- resolution */
	private facesOf(body: LiveBody) { return [...this.k.getSolidFaces(body.solid)]; }
	private faceSignature(face: number) {
		const k = this.k, kind = k.getSurfaceType(face);
		return { kind, center: faceAnchor(k, face), normal: kind === 'plane' ? vector(k.getFaceNormal(face)) : ([0, 0, 0] as Vec3), area: k.faceArea(face, 0.002) };
	}
	private resolveFace(ref: FaceRef, warnings: string[]): Resolved {
		const body = this.live.bodies.get(ref.body); if (!body) throw Error(lostReference('body', this.describeBody(ref.body)));
		const faces = this.facesOf(body);
		const exact = faces.filter((f) => this.k.getFaceName(f) === ref.name);
		if (exact.length === 1) return { body, handle: exact[0] };
		if (!ref.hint) throw Error(lostReference('face', ref.name));
		const candidates = (exact.length ? exact : faces).filter((f) => faceHintMatches(ref.hint!, this.faceSignature(f)));
		if (candidates.length === 1) { warnings.push(reattachedReference('face', ref.name)); return { body, handle: candidates[0], note: 'reattached' }; }
		if (candidates.length > 1) throw Error(ambiguousReference('face', ref.name, candidates.length));
		throw Error(lostReference('face', ref.name));
	}
	private edgeTable(body: LiveBody) {
		const k = this.k, out = new Map<number, string[]>();
		for (const f of this.facesOf(body)) { const n = k.getFaceName(f) || ''; for (const e of k.getFaceEdges(f)) out.set(e, [...(out.get(e) ?? []), n]); }
		return [...out].map(([handle, names]) => ({ handle, faces: [...new Set(names)].sort() })).filter((e) => e.faces.length >= 2);
	}
	private edgeMid(edge: number): Vec3 { const [a, b] = this.k.getEdgeParamSpan(edge); return vector(this.k.evaluateEdgeCurve(edge, (a + b) / 2)); }
	private resolveEdge(ref: EdgeRef, warnings: string[]): Resolved {
		const body = this.live.bodies.get(ref.body); if (!body) throw Error(lostReference('body', this.describeBody(ref.body)));
		const key = [...ref.faces].sort().join('|');
		const edges = this.edgeTable(body);
		const matches = edges.filter((e) => e.faces.join('|') === key);
		if (matches.length === 1) return { body, handle: matches[0].handle };
		if (matches.length > 1) {
			const ordered = matches.map((e) => ({ e, mid: this.edgeMid(e.handle) })).sort((x, y) => anchorOrder(x.mid, y.mid));
			const pick = ordered[ref.ordinal ?? 0];
			if (ref.ordinal !== undefined && pick) return { body, handle: pick.e.handle };
			if (ref.hint) { const byHint = ordered.filter(({ e, mid }) => edgeHintMatches(ref.hint!, { curve: this.k.getEdgeCurveType(e.handle), mid, length: this.k.edgeLength(e.handle) })); if (byHint.length === 1) return { body, handle: byHint[0].e.handle }; }
			throw Error(ambiguousReference('edge', key, matches.length));
		}
		if (ref.hint) {
			const byHint = edges.filter((e) => edgeHintMatches(ref.hint!, { curve: this.k.getEdgeCurveType(e.handle), mid: this.edgeMid(e.handle), length: this.k.edgeLength(e.handle) }));
			if (byHint.length === 1) { warnings.push(reattachedReference('edge', key)); return { body, handle: byHint[0].handle, note: 'reattached' }; }
			if (byHint.length > 1) throw Error(ambiguousReference('edge', key, byHint.length));
		}
		throw Error(lostReference('edge', key));
	}
	private vertexTable(body: LiveBody) {
		const k = this.k, out = new Map<number, string[]>();
		for (const f of this.facesOf(body)) { const n = k.getFaceName(f) || ''; for (const v of k.getFaceVertices(f)) out.set(v, [...(out.get(v) ?? []), n]); }
		return [...out].map(([handle, names]) => ({ handle, faces: [...new Set(names)].sort() })).filter((v) => v.faces.length >= 3);
	}
	private resolveVertex(ref: VertexRef, warnings: string[]): Resolved {
		const body = this.live.bodies.get(ref.body); if (!body) throw Error(lostReference('body', this.describeBody(ref.body)));
		const key = [...ref.faces].sort().join('|');
		const vertices = this.vertexTable(body);
		const matches = vertices.filter((v) => v.faces.join('|') === key);
		if (matches.length === 1) return { body, handle: matches[0].handle };
		if (matches.length > 1) {
			const ordered = matches.map((v) => ({ v, p: vector(this.k.getVertexPosition(v.handle)) })).sort((x, y) => anchorOrder(x.p, y.p));
			const pick = ordered[ref.ordinal ?? 0];
			if (ref.ordinal !== undefined && pick) return { body, handle: pick.v.handle };
			throw Error(ambiguousReference('corner', key, matches.length));
		}
		if (ref.hint) {
			const byHint = vertices.filter((v) => vertexHintMatches(ref.hint!, { point: vector(this.k.getVertexPosition(v.handle)) }));
			if (byHint.length === 1) { warnings.push(reattachedReference('corner', key)); return { body, handle: byHint[0].handle, note: 'reattached' }; }
			if (byHint.length > 1) throw Error(ambiguousReference('corner', key, byHint.length));
		}
		throw Error(lostReference('corner', key));
	}
	private resolvePlane(ref: PlaneRef, warnings: string[]): ResolvedPlane {
		if (ref.kind === 'datum') return datumPlane(ref.datum, ref.offset ?? 0);
		if (ref.kind === 'fixed') return ref.plane;
		if (ref.kind === 'face') {
			const { handle } = this.resolveFace(ref.face, warnings);
			if (this.k.getSurfaceType(handle) !== 'plane') throw Error('Sketch on a flat face, a plane or a reference plane.');
			return planeFromNormal(vector(this.k.getFaceNormal(handle)), faceAnchor(this.k, handle));
		}
		const r = this.live.refs.get(ref.feature);
		if (!r || r.kind !== 'plane') throw Error(lostReference('plane', this.features.find((f) => f.id === ref.feature)?.name ?? ref.feature));
		return r.plane;
	}
	private resolveAxis(ref: AxisRef, warnings: string[]): ResolvedAxis {
		const k = this.k;
		if (ref.kind === 'datum') return { origin: [0, 0, 0], direction: ({ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] } as Record<string, Vec3>)[ref.axis] };
		if (ref.kind === 'line') return { origin: ref.origin, direction: unit(ref.direction) };
		if (ref.kind === 'sketch') {
			const s = this.live.sketches.get(ref.feature); if (!s) throw Error(lostReference('sketch', this.features.find((f) => f.id === ref.feature)?.name ?? ref.feature));
			const through = ref.through ?? [0, 0];
			const origin: Vec3 = [s.plane.origin[0] + s.plane.u[0] * through[0] + s.plane.v[0] * through[1], s.plane.origin[1] + s.plane.u[1] * through[0] + s.plane.v[1] * through[1], s.plane.origin[2] + s.plane.u[2] * through[0] + s.plane.v[2] * through[1]];
			return { origin, direction: ref.axis === 'u' ? s.plane.u : s.plane.v };
		}
		if (ref.kind === 'edge') {
			const { handle } = this.resolveEdge(ref.edge, warnings);
			if (k.getEdgeCurveType(handle) !== 'LINE') throw Error('Pick a straight edge for the axis.');
			const e = k.getEdgeVertices(handle); return { origin: [e[0], e[1], e[2]], direction: unit([e[3] - e[0], e[4] - e[1], e[5] - e[2]]) };
		}
		if (ref.kind === 'face') {
			const { handle } = this.resolveFace(ref.face, warnings);
			const p = json(k.getAnalyticSurfaceParams(handle));
			if (!p.axis || !p.origin) throw Error('Pick a round face; its axis is the axis.');
			return { origin: vector(p.origin), direction: unit(vector(p.axis)) };
		}
		const r = this.live.refs.get(ref.feature);
		if (!r || r.kind !== 'axis') throw Error(lostReference('axis', this.features.find((f) => f.id === ref.feature)?.name ?? ref.feature));
		return r.axis;
	}
	private resolvePoint(ref: PointRef, warnings: string[]): ResolvedPoint {
		if (ref.kind === 'origin') return { point: [0, 0, 0] };
		if (ref.kind === 'coordinates') return { point: ref.point };
		if (ref.kind === 'vertex') return { point: vector(this.k.getVertexPosition(this.resolveVertex(ref.vertex, warnings).handle)) };
		const r = this.live.refs.get(ref.feature);
		if (!r || r.kind !== 'point') throw Error(lostReference('point', this.features.find((f) => f.id === ref.feature)?.name ?? ref.feature));
		return r.point;
	}

	/* ------------------------------------------------------------ public */
	async snapshot(): Promise<ModelSnapshot> {
		for (const body of this.live.bodies.values()) if (body.dirty || !body.artifact) {
			const bytes = this.k.serializeSolids(new Uint32Array([body.solid]));
			const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
			const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
			this.artifacts.set(hash, bytes); body.artifact = hash; body.dirty = false;
		}
		this.reconcileRecords();
		const manifest = this.manifest();
		validateManifest(manifest);
		return { manifest, artifacts: [...this.artifacts].map(([hash, bytes]) => ({ hash, bytes })) };
	}
	private async registerArtifacts(list: GeometryArtifact[]) {
		if (!Array.isArray(list)) throw Error('The model has no artifact list.');
		const next = new Map(this.artifacts);
		for (const artifact of list) {
			if (!artifact || typeof artifact.hash !== 'string' || !/^[0-9a-f]{64}$/.test(artifact.hash) || !(artifact.bytes instanceof Uint8Array)) throw Error('Invalid geometry artifact.');
			const known = next.get(artifact.hash);
			if (known) { if (known.length !== artifact.bytes.length || known.some((n, i) => n !== artifact.bytes[i])) throw Error('The geometry artifact failed its integrity check.'); }
			else { const digest = await crypto.subtle.digest('SHA-256', artifact.bytes as Uint8Array<ArrayBuffer>); if ([...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('') !== artifact.hash) throw Error('The geometry artifact failed its integrity check.'); next.set(artifact.hash, artifact.bytes); }
		}
		return next;
	}
	/**
	 * Open a document. Validates before touching the kernel, upgrades a v1
	 * manifest, then replays from the first feature that differs from what is
	 * live -- which for a fresh engine is the first feature. On any failure
	 * after validation the previous document is put back.
	 */
	/** Opens a saved snapshot. A v1 manifest (bodies with no feature list) is upgraded on the way in, so every document saved before the feature graph opens as it did. */
	async load(snapshot: { manifest: SolidManifest | LegacyManifest; artifacts: ModelSnapshot['artifacts'] }, resetHistory = true): Promise<ModelProjection> {
		validateManifest(snapshot?.manifest);
		const manifest = upgradeManifest(snapshot.manifest as SolidManifest | LegacyManifest);
		const artifacts = await this.registerArtifacts(snapshot.artifacts);
		for (const f of manifest.features) if (f.type === 'body' && !artifacts.has(f.artifact)) throw Error('A saved body is missing. Reload the document.');
		const previous = this.manifest(), previousArtifacts = this.artifacts;
		this.artifacts = artifacts;
		try { this.applyManifest(manifest); }
		catch (error) { this.artifacts = previousArtifacts; this.applyManifest(previous); throw error; }
		if (resetHistory) { this.undoSteps = []; this.redoSteps = []; }
		this.preview = null;
		return this.project();
	}
	/** One edit, one undo step. */
	async apply(command: SolidCommand): Promise<ModelProjection> {
		const before = this.manifest(), start = performance.now();
		try {
			const next = reduce(before, command);
			this.applyManifest(next);
			this.refuseOwnFailure(command, next);
			this.undoSteps.push({ before, after: this.manifest() }); this.redoSteps = [];
			return this.project(performance.now() - start);
		} catch (error) { this.applyManifest(before); throw error; }
	}
	/** A gesture: every update applies the command to the state the gesture started from. */
	async begin() { if (this.preview) await this.cancel(); this.preview = { before: this.manifest() }; return true; }
	async update(command: SolidCommand) {
		if (!this.preview) throw Error('Start the gesture again.');
		const p = this.preview, start = performance.now();
		try { const next = reduce(p.before, command); this.applyManifest(next); this.refuseOwnFailure(command, next); p.command = command; return this.project(performance.now() - start); }
		catch (error) { this.applyManifest(p.before); p.command = undefined; throw error; }
	}
	async commit() {
		const p = this.preview; this.preview = null;
		if (p?.command) { this.undoSteps.push({ before: p.before, after: this.manifest() }); this.redoSteps = []; }
		return this.project();
	}
	async cancel() { const p = this.preview; this.preview = null; if (p) this.applyManifest(p.before); return this.project(); }
	async undo() { const step = this.undoSteps.pop(); if (step) { this.applyManifest(step.before); this.redoSteps.push(step); } return this.project(); }
	async redo() { const step = this.redoSteps.pop(); if (step) { this.applyManifest(step.after); this.undoSteps.push(step); } return this.project(); }
	/** The kernel's checkpoint count, for the tests that pin the window. */
	checkpointCount() { return this.k.checkpointCount(); }
	/** Solve a sketch's constraints without changing the document: the sketch editor's live preview. */
	solveSketch(input: { entities: SketchEntity[]; constraints: SketchConstraint[] }) { return this.scratch(() => solveSketch(this.k, input)); }

	planarProfile(selection: Selection): import('./types').ProfileCurve[] {
		const { kind, handle } = this.pick(selection), k = this.k;
		if (kind !== 'face' || k.getSurfaceType(handle) !== 'plane') throw Error('Select a flat face to export its outline and holes.');
		const n = vector(k.getFaceNormal(handle)), seed: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0], u = unit(cross3(seed, n)), v = cross3(n, u), origin = vector(k.getVertexPosition(k.getFaceVertices(handle)[0]));
		const local = (p: ArrayLike<number>): [number, number] => { const d = sub(vector(p), origin); return [dot(d, u), dot(d, v)]; };
		const curves: import('./types').ProfileCurve[] = [];
		for (const wire of k.getFaceWires(handle)) for (const edge of k.getWireEdges(wire)) {
			const curve = k.getEdgeCurveType(edge), ends = k.getEdgeVertices(edge); if (curve === 'LINE') { curves.push({ type: 'line', start: local(ends.slice(0, 3)), end: local(ends.slice(3, 6)) }); continue; }
			if (curve !== 'CIRCLE') throw Error('This profile includes a curve that DXF export does not yet support.');
			const [a, b] = k.getEdgeParamSpan(edge), full = Math.abs(Math.abs(b - a) - Math.PI * 2) < 1e-7;
			const p = local(k.evaluateEdgeCurve(edge, a)), q = local(k.evaluateEdgeCurve(edge, a + (b - a) * (full ? 1 / 3 : 0.5))), r = local(k.evaluateEdgeCurve(edge, a + (b - a) * (full ? 2 / 3 : 1)));
			const bx = q[0] - p[0], by = q[1] - p[1], cx = r[0] - p[0], cy = r[1] - p[1], d = 2 * (bx * cy - by * cx);
			if (Math.abs(d) < 1e-14) throw Error('This arc is too small to export reliably.');
			const center: [number, number] = [p[0] + (cy * (bx * bx + by * by) - by * (cx * cx + cy * cy)) / d, p[1] + (bx * (cx * cx + cy * cy) - cx * (bx * bx + by * by)) / d], radius = Math.hypot(p[0] - center[0], p[1] - center[1]);
			if (full) curves.push({ type: 'circle', center, radius }); else { const angle = (point: [number, number]) => (Math.atan2(point[1] - center[1], point[0] - center[0]) * 180 / Math.PI + 360) % 360; curves.push({ type: 'arc', center, radius, startAngle: angle(d > 0 ? p : r), endAngle: angle(d > 0 ? r : p) }); }
		}
		return curves;
	}
	private key(pick: Selection) { return `${pick.bodyId}/${pick.kind}/${pick.id}`; }
	private pick(selection: Selection): Pick {
		if (!this.picks.size) this.project();
		const result = this.picks.get(this.key(selection));
		if (!result) throw Error('That selection changed. Select it again.');
		return result;
	}
	/** Measure between two selections: the kernel's distance, or an edge length / face area on one. */
	measure(a: Selection, b?: Selection): { kind: string; value: number; points?: [Vec3, Vec3] } {
		const k = this.k, pa = this.pick(a);
		if (!b) {
			if (pa.kind === 'edge') return { kind: 'length', value: k.edgeLength(pa.handle) };
			if (pa.kind === 'face') return { kind: 'area', value: k.faceArea(pa.handle, 0.002) };
			if (pa.kind === 'body') return { kind: 'volume', value: json(k.massProperties(pa.handle)).volume };
			throw Error('Select an edge, a face or a body to measure it.');
		}
		const pb = this.pick(b);
		if (pa.kind === 'body' && pb.kind === 'body') { const d = k.solidToSolidDistance(pa.handle, pb.handle); return { kind: 'distance', value: d[0], points: [[d[1], d[2], d[3]], [d[4], d[5], d[6]]] }; }
		const point = (p: Pick): Vec3 | null => p.kind === 'vertex' ? vector(k.getVertexPosition(p.handle)) : null;
		const qa = point(pa), qb = point(pb);
		if (qa && qb) return { kind: 'distance', value: Math.hypot(...sub(qa, qb)), points: [qa, qb] };
		if (qa || qb) {
			const q = (qa ?? qb)!, other = qa ? pb : pa;
			const d = other.kind === 'face' ? k.pointToFaceDistance(...q, other.handle) : other.kind === 'edge' ? k.pointToEdgeDistance(...q, other.handle) : k.pointToSolidDistance(...q, other.handle);
			return { kind: 'distance', value: d[0], points: [q, [d[1], d[2], d[3]]] };
		}
		if (pa.kind === 'face' && pb.kind === 'face' && k.getSurfaceType(pa.handle) === 'plane' && k.getSurfaceType(pb.handle) === 'plane') {
			const na = vector(k.getFaceNormal(pa.handle)), nb = vector(k.getFaceNormal(pb.handle));
			const cosine = Math.max(-1, Math.min(1, dot(na, nb)));
			if (Math.abs(Math.abs(cosine) - 1) < 1e-6) { const pb0 = faceAnchor(k, pb.handle); return { kind: 'distance', value: Math.abs(dot(sub(pb0, faceAnchor(k, pa.handle)), na)) }; }
			return { kind: 'angle', value: Math.acos(cosine) * 180 / Math.PI };
		}
		throw Error('Measure two corners, a corner and a face or edge, two flat faces, or two bodies.');
	}

	/* --------------------------------------------------------- projection */
	private bodyCache(body: LiveBody): CachedBody {
		const k = this.k, solid = body.solid;
		const cached = this.cache.get(solid); if (cached) return cached;
		const faceHandles = [...k.getSolidFaces(solid)];
		const faceNames = new Map(faceHandles.map((f) => [f, k.getFaceName(f) || `unnamed:${f}`]));
		const edgeFaces = new Map<number, string[]>(), vertexFaces = new Map<number, string[]>();
		for (const face of faceHandles) { for (const edge of k.getFaceEdges(face)) edgeFaces.set(edge, [...(edgeFaces.get(edge) ?? []), faceNames.get(face)!]); for (const vertex of k.getFaceVertices(face)) vertexFaces.set(vertex, [...(vertexFaces.get(vertex) ?? []), faceNames.get(face)!]); }
		const handles = { faces: new Map<string, number>(), edges: new Map<string, number>(), vertices: new Map<string, number>() };
		/* Edges: grouped by their face pair; a pair with several edges takes ordinals by midpoint. */
		const edgeGroups = new Map<string, { handle: number; mid: Vec3 }[]>();
		for (const [handle, names] of edgeFaces) { const adjacent = [...new Set(names)].sort(); if (adjacent.length < 2) continue; const key = adjacent.join('|'); edgeGroups.set(key, [...(edgeGroups.get(key) ?? []), { handle, mid: this.edgeMid(handle) }]); }
		const edges: BodyProjection['edges'] = [], edgeIdOf = new Map<number, string>();
		for (const [key, group] of edgeGroups) {
			const faces = key.split('|');
			const ordered = group.length > 1 ? [...group].sort((a, b) => anchorOrder(a.mid, b.mid)) : group;
			ordered.forEach(({ handle, mid }, i) => { const id = edgeId(faces, group.length > 1 ? i : undefined); edgeIdOf.set(handle, id); handles.edges.set(id, handle); edges.push({ id, curve: k.getEdgeCurveType(handle), faces, points: new Float32Array(k.sampleEdge(handle, 0.002)), length: k.edgeLength(handle), mid, ordinal: group.length > 1 ? i : undefined }); });
		}
		const vertexGroups = new Map<string, { handle: number; point: Vec3 }[]>();
		for (const [handle, names] of vertexFaces) { const adjacent = [...new Set(names)].sort(); if (adjacent.length < 3) continue; const key = adjacent.join('|'); vertexGroups.set(key, [...(vertexGroups.get(key) ?? []), { handle, point: vector(k.getVertexPosition(handle)) }]); }
		const vertices: BodyProjection['vertices'] = [];
		for (const [key, group] of vertexGroups) {
			const faces = key.split('|');
			const ordered = group.length > 1 ? [...group].sort((a, b) => anchorOrder(a.point, b.point)) : group;
			ordered.forEach(({ handle, point }, i) => { const id = vertexId(faces, group.length > 1 ? i : undefined); handles.vertices.set(id, handle); vertices.push({ id, point, faces, ordinal: group.length > 1 ? i : undefined }); });
		}
		const faces = faceHandles.map((handle) => {
			const id = faceNames.get(handle)!, mesh = k.tessellateFace(handle, 0.002, 0.15), positions = new Float32Array(mesh.positions), normals = new Float32Array(mesh.normals), indices = mesh.indices; mesh.free();
			const surface = json(k.getAnalyticSurfaceParams(handle)), kind = k.getSurfaceType(handle), normal = kind === 'plane' ? vector(k.getFaceNormal(handle)) : ([0, 0, 0] as Vec3);
			const center = faceAnchor(k, handle);
			handles.faces.set(id, handle);
			return { id, kind, center, normal, surface, area: k.faceArea(handle, 0.002), positions, normals, indices, edges: [...k.getFaceEdges(handle)].map((e) => edgeIdOf.get(e)).filter((e): e is string => !!e) };
		});
		const grouped = k.tessellateSolidGroupedBinary(solid, 0.002, 0.15), mesh = { positions: grouped.positions, normals: grouped.normals, indices: grouped.indices }; grouped.free();
		const props = json(k.massProperties(solid));
		const out: CachedBody = { faces, edges, vertices, mesh, bounds: [...k.boundingBox(solid)], volume: props.volume, centerOfMass: props.centerOfMass as Vec3, inertia: props.inertia as number[], handles };
		this.cache.set(solid, out);
		return out;
	}
	project(operationMs = 0): ModelProjection {
		this.picks.clear();
		const liveHandles = new Set([...this.live.bodies.values()].map((b) => b.solid));
		for (const handle of [...this.cache.keys()]) if (!liveHandles.has(handle)) this.cache.delete(handle);
		const bodies: BodyProjection[] = this.live.order.map((id) => {
			const body = this.live.bodies.get(id)!, cached = this.bodyCache(body), record = this.records.find((r) => r.id === id)!;
			this.picks.set(this.key({ bodyId: id, kind: 'body', id }), { body, handle: body.solid, kind: 'body' });
			for (const [fid, handle] of cached.handles.faces) this.picks.set(this.key({ bodyId: id, kind: 'face', id: fid }), { body, handle, kind: 'face' });
			for (const [eid, handle] of cached.handles.edges) this.picks.set(this.key({ bodyId: id, kind: 'edge', id: eid }), { body, handle, kind: 'edge' });
			for (const [vid, handle] of cached.handles.vertices) this.picks.set(this.key({ bodyId: id, kind: 'vertex', id: vid }), { body, handle, kind: 'vertex' });
			const dof = this.mateReport.dof.get(id);
			return { ...record, faces: cached.faces, edges: cached.edges, vertices: cached.vertices, mesh: cached.mesh, bounds: cached.bounds, volume: cached.volume, centerOfMass: cached.centerOfMass, inertia: cached.inertia, createdBy: body.createdBy, ...(dof !== undefined ? { dof } : {}) };
		});
		const ext = this.extent();
		const size = ext ? Math.max(1, ...[0, 1, 2].map((i) => ext.max[i] - ext.min[i])) * 0.6 : 1;
		const references: ReferenceProjection[] = [];
		for (const [feature, ref] of this.live.refs) {
			const f = this.features.find((x) => x.id === feature); if (!f) continue;
			if (ref.kind === 'plane') references.push({ feature, name: f.name, kind: 'plane', origin: ref.plane.origin, normal: ref.plane.normal, u: ref.plane.u, v: ref.plane.v, size });
			else if (ref.kind === 'axis') references.push({ feature, name: f.name, kind: 'axis', origin: ref.axis.origin, direction: ref.axis.direction, size });
			else references.push({ feature, name: f.name, kind: 'point', origin: ref.point.point, size });
		}
		const sketches: SketchProjection[] = [];
		for (const [feature, s] of this.live.sketches) {
			const f = this.features.find((x) => x.id === feature); if (!f) continue;
			sketches.push({ feature, name: f.name, plane: s.plane, planeRef: f.type === 'sketch' ? f.plane : { kind: 'fixed', plane: s.plane }, entities: s.entities, constraints: s.constraints, solve: s.report, regions: regionOutlines(s.entities, s.plane), consumed: s.consumed });
			this.picks.set(this.key({ bodyId: '', kind: 'sketch', id: feature }), { body: { id: '', solid: 0, createdBy: feature, dirty: false, artifact: '' }, handle: 0, kind: 'sketch' });
		}
		const features: FeatureRow[] = this.features.map((f, index) => {
			const r = this.results[index] ?? { status: 'error', message: 'Not replayed.', bodies: [] };
			const mateError = f.type === 'mate' ? this.mateReport.errors.find((e) => e.feature === f.id) : undefined;
			return { id: f.id, index, type: f.type, name: f.name, status: mateError ? 'error' : r.status, message: mateError?.message ?? r.message, summary: featureSummary(f), bodies: r.bodies, dependsOn: dependsOnFeatures(f, this.features), suppressed: !!f.suppressed };
		});
		const mates: MateProjection[] = this.live.mates.map((m) => { const error = this.mateReport.errors.find((e) => e.feature === m.feature); return { feature: m.feature, kind: m.kind, a: m.a, b: m.b, value: m.value, status: error ? 'error' : 'ok', message: error?.message, residual: this.mateReport.residuals.get(m.feature) }; });
		return { bodies, sketches, references, features, mates, addons: clone(this.addons), operationMs, replayMs: this.lastReplay.ms, replayedFrom: this.lastReplay.from, canUndo: !!this.undoSteps.length, canRedo: !!this.redoSteps.length };
	}
}
function cross3(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
