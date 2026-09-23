/**
 * BLENDS AND WALLS: fillet, chamfer and shell, re-expressed as replayable
 * features with persistent names (`naming.ts`: a blend is `<fid>.blend.<A>|<B>`,
 * a bevel `<fid>.bevel.<A>|<B>`, a shell's inner face `<fid>.inner.<source>`).
 *
 * THIS MODULE IS THE BLENDS-AND-FEATURES SURFACE'S, together with `extra.ts`
 * (hole, draft, sweep, loft, rib). Tangent propagation, face-to-all-edges
 * selection, per-face shell thickness and the rest are decided here; the
 * kernel calls available are listed in `kernel/remus.ts`.
 *
 * TANGENT PROPAGATION IS COMPUTED HERE, NOT ASKED OF THE KERNEL. The kernel
 * has no tangency query, so `tangentChain` walks from each selected edge
 * across the vertices it ends at, taking a neighbouring edge when TWO things
 * hold at the shared vertex: the two edge curves' tangents (`evaluateEdgeCurveD1`
 * at the end nearest the vertex) are collinear, and every face beside the
 * new edge has a face beside the old one whose surface normal at that vertex
 * matches (`projectPointOnSurface` then `evaluateSurfaceNormal`, so a
 * cylinder counts as well as a plane). Measured on a box whose four vertical
 * edges were rounded: the eight-edge ring around the top face is one chain,
 * and the straight edge continuing past a sharp corner is not.
 *
 * PER-FACE SHELL THICKNESS IS TWO KERNEL OPERATIONS, because `shell` takes one
 * thickness: the body is shelled uniformly, its inner faces named, and then
 * each inner face with its own thickness is moved by the difference
 * (`moveFacesJournaled`, along the inner face's outward normal, which points
 * into the cavity, so a positive move is a thicker wall). Measured on a 4x3x1
 * box shelled at 0.1 with the bottom set to 0.25: 12 - 3.8 * 2.8 * 0.75, exact.
 * That move is honest for a FLAT inner face; a curved one is refused by name.
 *
 * THE CHAMFER'S ANGLE MODE IS THE KERNEL'S OWN CONVENTION, MEASURED: the
 * distance is set back along one of the edge's two faces and the other leg
 * is distance * tan(angle), and which face takes the distance is the kernel's
 * choice (the first face in its own edge order). A 0.2 by 30 degree bevel on
 * the top-front edge of a 4x3x1 box removed 0.5 * 0.2 * 0.2 tan 30 * 4 exactly.
 */
import type { ExecutorContext } from './context';
import type { BrepKernel } from '../../kernel/remus';
import type { BodyProjection, EdgeProjection, EdgeRef, FaceProjection, Feature, FeatureFix, FeatureHelp, FeatureOf, Selection, Vec3 } from '../types';
import { edgeId, surfaceKey } from '../naming';
import { dot, unit, vector } from '../math';
import { carryBySurface, finite, json, positive } from './core';

/** Two unit vectors are collinear (either sense) when their dot is within this of 1: about 0.26 degrees, far inside the kernel's own tolerance and far outside float noise. */
export const TANGENT_COSINE = 1 - 1e-5;
const SAME_POINT = 1e-7;
const near = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < SAME_POINT * Math.max(1, Math.hypot(...a));

/** The edges of `solid` reached from `seeds` through tangent-continuous vertices, seeds included, deduplicated, in discovery order. */
export function tangentChain(k: BrepKernel, solid: number, seeds: readonly number[]): number[] {
	const edges = [...k.getSolidEdges(solid)];
	const ends = new Map<number, [Vec3, Vec3]>();
	for (const e of edges) { const v = k.getEdgeVertices(e); ends.set(e, [[v[0], v[1], v[2]], [v[3], v[4], v[5]]]); }
	const owners = new Map<number, number[]>();
	for (const f of k.getSolidFaces(solid)) for (const e of k.getFaceEdges(f)) owners.set(e, [...(owners.get(e) ?? []), f]);
	const tangentAt = (e: number, p: Vec3): Vec3 => {
		const [a, b] = k.getEdgeParamSpan(e);
		const t = near(vector(k.evaluateEdgeCurve(e, a)), p) ? a : b;
		const d = k.evaluateEdgeCurveD1(e, t);
		return unit([d[3], d[4], d[5]]);
	};
	const normalAt = (f: number, p: Vec3): Vec3 => { const pr = k.projectPointOnSurface(f, ...p); return unit(vector(k.evaluateSurfaceNormal(f, pr[0], pr[1]))); };
	const facesAgree = (from: number, to: number, p: Vec3) => {
		const a = owners.get(from) ?? [], b = owners.get(to) ?? [];
		return b.every((fb) => a.some((fa) => fa === fb || dot(normalAt(fa, p), normalAt(fb, p)) > TANGENT_COSINE));
	};
	const out: number[] = [], seen = new Set<number>();
	const queue = [...new Set(seeds)];
	while (queue.length) {
		const e = queue.shift()!; if (seen.has(e)) continue; seen.add(e); out.push(e);
		const [p0, p1] = ends.get(e)!;
		/* A closed edge (a full circle) has one vertex and nothing to walk to. */
		if (near(p0, p1)) continue;
		for (const p of [p0, p1]) {
			const te = tangentAt(e, p);
			for (const g of edges) {
				if (seen.has(g) || g === e) continue;
				const [q0, q1] = ends.get(g)!; if (near(q0, q1) || !(near(q0, p) || near(q1, p))) continue;
				if (Math.abs(dot(te, tangentAt(g, p))) < TANGENT_COSINE) continue;
				if (!facesAgree(e, g, p)) continue;
				queue.push(g);
			}
		}
	}
	return out;
}

/* -------------------------------------------------------------------------
 * REFUSALS IN WORDS, AND THE LARGEST SIZE THAT FITS
 * ---------------------------------------------------------------------- */

/**
 * A blend the kernel refused, in the student's words. `help` carries the
 * kernel's own text (shown in development only), the edges it is about, and
 * a one-click way forward. The engine copies `help` onto the feature row;
 * nothing here applies anything.
 */
export class BlendRefusal extends Error {
	readonly help: FeatureHelp;
	constructor(message: string, help: FeatureHelp) { super(message); this.name = 'BlendRefusal'; this.help = help; }
}
/** The most kernel attempts a refused blend may spend finding a size that fits. A blend that succeeds spends none. */
export const FIT_ATTEMPTS = 8;
/** And the most time: no attempt STARTS once this much has passed, so a search over a long chain of heavy rounds (measured, about 0.8 s an attempt beside a 0.999 in round) answers in a couple of seconds with the best size found so far, never one untried. */
export const FIT_BUDGET_MS = 1500;
/** Down to three significant figures: a size a student can read and type, never above `v`. */
export function floorFigure(v: number): number {
	if (!(v > 0) || !Number.isFinite(v)) return 0;
	const step = 10 ** (Math.floor(Math.log10(v)) - 2), k = Math.floor((v / step) * (1 + 1e-12));
	const r = Number((k * step).toPrecision(3));
	return r > v ? Number(((k - 1) * step).toPrecision(3)) : r;
}
/**
 * The largest size `fits` accepts below `requested`, which failed. `limit` is
 * the kernel's own bound when it named one, and it is STRICT (measured: a
 * 0.5 in plate refuses a 0.5 in round and takes 0.499), so the first try is a
 * hair under it and a size at or above it is never tried again. `guesses` are
 * other likely bounds (the radius of a round these edges run along), tried a
 * hair under each, largest first. Then a bounded search: a small size first,
 * because a refusal no size cures fails there at once, then halving the gap on
 * figures a student could type. Every size returned was tried and fitted;
 * null means none did within the budget. `exact` says the search closed the
 * gap to one figure, so "the largest" is true; otherwise the answer is only
 * the largest it FOUND, and a caller must say so.
 */
export function largestThatFits(fits: (v: number) => boolean, requested: number, limit?: number, budget = FIT_ATTEMPTS, budgetMs = FIT_BUDGET_MS, guesses: number[] = []): { value: number | null; attempts: number; exact: boolean } {
	let attempts = 0, bad = requested, good = 0;
	const started = performance.now(), late = () => attempts > 0 && performance.now() - started > budgetMs;
	const attempt = (v: number) => { attempts++; return fits(v); };
	if (limit !== undefined && limit > 0 && limit < bad) bad = limit;
	const firsts = [...new Set([...(limit !== undefined && limit > 0 && limit <= requested ? [limit] : []), ...guesses.filter((g) => g > 0 && g < bad)].map((g) => floorFigure(g * (1 - 1e-9))))].filter((c) => c > 0 && c < requested).sort((a, b) => b - a);
	for (const c of firsts) { if (c >= bad || attempts >= budget || late()) continue; if (attempt(c)) { good = c; break; } bad = c; }
	if (!good) for (const lo of [floorFigure(bad / 64), floorFigure(bad / 4096)]) { if (!(lo > 0) || attempts >= budget || late()) break; if (attempt(lo)) { good = lo; break; } bad = lo; }
	if (!good) return { value: null, attempts, exact: false };
	const between = () => floorFigure(bad / good > 4 ? Math.sqrt(good * bad) : (good + bad) / 2);
	while (attempts < budget && !late()) {
		const mid = between();
		if (!(mid > good && mid < bad)) break;
		if (attempt(mid)) good = mid; else bad = mid;
	}
	const mid = between();
	return { value: good, attempts, exact: !(mid > good && mid < bad) };
}
/** The last few answers, keyed by the blend and the geometry it was refused on. Small on purpose: it serves a drag or a replay of the same refusal, not a history. */
const fitMemo = new Map<string, { value: number | null; exact: boolean }>();
const FIT_MEMO_SIZE = 32;
/** What the kernel's text says went wrong, and the limit it named when it named one. */
export type KernelBlendIssue = { kind: 'cliff' | 'setback' | 'vertex' | 'trim' | 'curved' | 'boundary' | 'self' | 'partial' | 'other'; limit?: number };
export function readKernelBlendError(text: string): KernelBlendIssue {
	const num = (m: RegExpMatchArray | null) => (m ? Number(m[1]) : undefined);
	const available = num(text.match(/available radius (-?\d+(?:\.\d+)?(?:e-?\d+)?)/i));
	if (available !== undefined && Number.isFinite(available)) return { kind: 'cliff', limit: available };
	const below = num(text.match(/distance below (-?\d+(?:\.\d+)?(?:e-?\d+)?)/i));
	if (below !== undefined && Number.isFinite(below)) return { kind: 'setback', limit: below };
	if (/vertex blend|stripes meet|fillet strips overlap/i.test(text)) return { kind: 'vertex' };
	if (/curved (neighbou?r|face)/i.test(text)) return { kind: 'curved' };
	if (/non-manifold|boundary edges/i.test(text)) return { kind: 'boundary' };
	if (/self-intersection|degenerate/i.test(text)) return { kind: 'self' };
	if (/could not be completed|not blended/i.test(text)) return { kind: 'partial' };
	if (/trimming failure|trim/i.test(text)) return { kind: 'trim' };
	return { kind: 'other' };
}
/** The feature a construction name came from: the id before the first dot (`x1.end~1`, `legacy-a.face.3` alike). */
export const featureOfName = (name: string) => name.split('.')[0];
/** The round or bevel feature a face name was made by, when it is a blend face. */
export const blendFeatureOf = (name: string | undefined) => (name && /^[^.]+\.(blend|bevel|corner)\./.test(name) ? featureOfName(name) : undefined);
const figure = (v: number) => `${floorFigure(v) === v ? v : Number(v.toFixed(4))} in`;

/**
 * THE BRIDGE until the engine copies `help` onto the feature row: the size fix
 * read back out of the one sentence `refuse` writes for it, exactly, because
 * `figure` wrote the numbers. Any other sentence, or a feature that is not the
 * row's blend, is null. Once the row carries `help`, callers read that first.
 */
export function sizeFixFromSentence(row: { id: string; message?: string }, feature: Feature | undefined): FeatureFix | null {
	/* Only the sentence whose headline IS the size: where a size is offered second (after leaving out the edges that run into another round), offering it alone would make it the headline. */
	const m = /^That (?:radius|chamfer) is too big for (?:this edge|these edges)\. The largest (?:found )?that fits here is ((\d+(?:\.\d+)?) in(?: (to|by) (\d+(?:\.\d+)?) in)?)\.$/.exec(row.message ?? '');
	if (!m || !feature || feature.id !== row.id) return null;
	const a = Number(m[2]), b = m[4] !== undefined ? Number(m[4]) : undefined;
	let patch: Record<string, unknown>;
	if (feature.type === 'fillet' && (m[3] === undefined || (m[3] === 'to' && feature.variable))) patch = { radius: a, ...(feature.variable && b !== undefined ? { variable: { ...feature.variable, end: b } } : {}) };
	else if (feature.type === 'chamfer' && (m[3] === undefined || m[3] === 'by')) patch = { distance: a, ...(b !== undefined ? { distance2: b } : {}) };
	else return null;
	return { label: `Use ${m[1]}`, value: a, commands: [{ type: 'set-feature', id: row.id, patch }] };
}

/* Kernel geometry the refusal reads: which faces meet along an edge and at a corner, and whether two of them are tangent there. */
type Vertexed = { ends: Map<number, [Vec3, Vec3]>; owners: Map<number, number[]>; faces: number[] };
function topology(k: BrepKernel, solid: number): Vertexed {
	const ends = new Map<number, [Vec3, Vec3]>(), owners = new Map<number, number[]>(), faces = [...k.getSolidFaces(solid)];
	for (const e of k.getSolidEdges(solid)) { const v = k.getEdgeVertices(e); ends.set(e, [[v[0], v[1], v[2]], [v[3], v[4], v[5]]]); }
	for (const f of faces) for (const e of k.getFaceEdges(f)) { const o = owners.get(e) ?? []; if (!o.includes(f)) o.push(f); owners.set(e, o); }
	return { ends, owners, faces };
}
const surfaceNormal = (k: BrepKernel, f: number, p: Vec3): Vec3 => { const pr = k.projectPointOnSurface(f, ...p); return unit(vector(k.evaluateSurfaceNormal(f, pr[0], pr[1]))); };
/** An edge with no corner along it: one face on both sides (a seam), or two faces tangent at its middle (the edge beside a round). Either sense of normal counts, since a solid has no knife edges. */
function smoothEdge(k: BrepKernel, t: Vertexed, e: number): boolean {
	const f = t.owners.get(e) ?? [];
	if (f.length < 2) return true;
	const [a, b] = k.getEdgeParamSpan(e), mid = vector(k.evaluateEdgeCurve(e, (a + b) / 2));
	try { return Math.abs(dot(surfaceNormal(k, f[0], mid), surfaceNormal(k, f[1], mid))) > TANGENT_COSINE; } catch { return false; }
}
/** Faces with an edge ending at `p`: every face that meets at that corner. */
const facesAt = (t: Vertexed, p: Vec3) => t.faces.filter((f) => [...t.owners].some(([e, fs]) => fs.includes(f) && t.ends.get(e)!.some((q) => near(q, p))));

/** Edges resolved for a blend, deduplicated, grouped by body, widened along tangent chains when the feature asks. Blends cannot cross bodies. `refs` maps each picked kernel edge back to its index in `f.edges`. */
function blendEdges(ctx: ExecutorContext, f: FeatureOf<'fillet'> | FeatureOf<'chamfer'>) {
	if (!f.edges.length) throw Error('Select at least one edge.');
	const resolved = f.edges.map((e) => ctx.resolveEdge(e));
	const bodyIds = new Set(resolved.map((r) => r.body.id));
	if (bodyIds.size !== 1) throw Error('Round or bevel edges on one body at a time.');
	const body = resolved[0].body;
	const picked = [...new Set(resolved.map((r) => r.handle))];
	return { body, picked, refs: resolved.map((r) => r.handle), handles: f.propagate ? tangentChain(ctx.k, body.solid, picked) : picked };
}
type Blend = FeatureOf<'fillet'> | FeatureOf<'chamfer'>;
/** The sizes a blend carries with its primary size set to `v` (the radius, or the distance) and the others scaled with it, so a search moves one number: a variable end, a second distance. An angle is not a size. */
function sizedPatch(f: Blend, v: number): Record<string, unknown> {
	if (f.type === 'fillet') return { radius: v, ...(f.variable ? { variable: { ...f.variable, end: floorFigure(f.variable.end * v / f.radius) } } : {}) };
	return { distance: v, ...(f.distance2 !== undefined && f.angle === undefined ? { distance2: floorFigure(f.distance2 * v / f.distance) } : {}) };
}
/** The kernel call a blend makes, for a feature as stored or as a probe would size it. Returns the raw result for the journaled forms, the solid for the others. */
function blendCall(k: BrepKernel, solid: number, f: Blend, handles: number[]): { journaled: string } | { solid: number } {
	const edges = new Uint32Array(handles);
	if (f.type === 'fillet') {
		const radius = positive(f.radius, 'radius');
		if (f.variable) {
			const end = positive(f.variable.end, 'radius');
			const law = f.variable.law ?? 'linear';
			return { solid: k.filletVariable(solid, JSON.stringify(handles.map((edge) => ({ edge, law, start: radius, end })))) };
		}
		return { journaled: k.filletJournaled(solid, edges, radius) };
	}
	const d1 = positive(f.distance, 'distance');
	if (f.angle !== undefined) {
		const angle = finite(f.angle, 'angle');
		if (!(angle > 0 && angle < 90)) throw Error('Use a chamfer angle between 0 and 90 degrees.');
		return { solid: k.chamferDistanceAngle(solid, edges, d1, angle * Math.PI / 180) };
	}
	const d2 = f.distance2 !== undefined ? positive(f.distance2, 'distance') : d1;
	return { journaled: k.chamferJournaled(solid, edges, d1, d2) };
}
/** Whether a blend of these sizes would make a whole, valid solid. Run on a scratch checkpoint, so it leaves the kernel exactly as it found it. */
function blendFits(ctx: ExecutorContext, solid: number, f: Blend, handles: number[]): boolean {
	return ctx.scratch(() => {
		try {
			const out = blendCall(ctx.k, solid, f, handles);
			let result: number;
			if ('journaled' in out) { const op = json(out.journaled); if (op.isPartial || op.failedEdges?.length) return false; result = op.solid; } else result = out.solid;
			return ctx.k.validateSolid(result) === 0 && json(ctx.k.massProperties(result)).volume > 0;
		} catch { return false; }
	});
}
/** An earlier blend of the same kind these edges could join, and which of the refused feature's own edges can be added to it (a reference to a face made at or after it cannot resolve there). */
function mergeTarget(ctx: ExecutorContext, f: Blend, fid: string): { into: Blend; edges: EdgeRef[] } | null {
	const features = ctx.manifest.features, at = features.findIndex((x) => x.id === fid);
	const into = features[at];
	if (!into || into.type !== f.type || (into.type === 'fillet' && into.variable) || into.suppressed) return null;
	const before = (name: string) => { const i = features.findIndex((x) => x.id === featureOfName(name)); return i >= 0 && i < at; };
	const has = (e: EdgeRef) => (into as Blend).edges.some((x) => JSON.stringify([...x.faces].sort()) === JSON.stringify([...e.faces].sort()) && x.ordinal === e.ordinal);
	const edges = f.edges.filter((e) => e.faces.every(before) && !has(e));
	return edges.length ? { into: into as Blend, edges } : null;
}
function plural(n: number, one: string, many: string) { return n === 1 ? one : many; }
/**
 * THE REFUSAL. Called only after the kernel has refused (or made something
 * that is not a solid). In order: an edge that has no corner to round is
 * named first, because no size cures it; then the largest size that fits is
 * searched for; then an earlier round these edges meet at a corner is named,
 * with the offer to make them together, which is how this kernel can blend a
 * shared corner. The student's own value is never changed here.
 */
function refuse(ctx: ExecutorContext, f: Blend, body: { id: string; solid: number }, refs: number[], handles: number[], raw: string, smooth: number[]): BlendRefusal {
	const k = ctx.k, word = f.type === 'fillet' ? 'round' : 'bevel', t = topology(k, body.solid);
	const nameOf = (id: string) => ctx.manifest.features.find((x) => x.id === id)?.name ?? id;
	const edgeSel = (e: number): Selection => ({ bodyId: body.id, kind: 'edge', id: edgeId((t.owners.get(e) ?? []).map((face) => ctx.faceName(face) ?? String(face))) });
	/* Earlier blends that touch these edges: along an edge (the edge runs beside that round) or at a corner. */
	const touching = (edges: number[], alongOnly: boolean) => {
		const out = new Map<string, number[]>();
		for (const e of edges) {
			const beside = (t.owners.get(e) ?? []).map((face) => blendFeatureOf(ctx.faceName(face)));
			const [p0, p1] = t.ends.get(e) ?? [[0, 0, 0], [0, 0, 0]] as [Vec3, Vec3];
			const corner = alongOnly || near(p0, p1) ? [] : [p0, p1].flatMap((p) => facesAt(t, p).map((face) => blendFeatureOf(ctx.faceName(face))));
			for (const fid of [...beside, ...corner]) if (fid && fid !== f.id) out.set(fid, [...new Set([...(out.get(fid) ?? []), e])]);
		}
		return out;
	};
	/* The kernel's own text, when the kernel was asked at all; an edge refused before any kernel call has none. */
	const detail = raw || undefined;
	if (smooth.length) {
		const sharp = handles.filter((e) => !smooth.includes(e));
		const rounded = [...touching(smooth, true).keys()][0];
		const meets = [...touching(sharp, false).keys()];
		const target = meets.map((fid) => ({ fid, m: mergeTarget(ctx, f, fid) })).find((x) => x.m);
		const where = smooth.map(edgeSel);
		if (!sharp.length) return new BlendRefusal(`${plural(smooth.length, 'That edge is', 'Those edges are')} already smooth, so there is no corner to ${word}.`, { where, detail });
		const which = `${smooth.length} of these edges ${plural(smooth.length, 'is', 'are')} already ${rounded ? `rounded by ${nameOf(rounded)}` : 'smooth'}`;
		if (target?.m) return new BlendRefusal(`${which}, and the others meet that ${word} at its corners, which a separate ${word} cannot blend.`, { where, detail, fix: { label: `Add ${target.m.edges.length} ${plural(target.m.edges.length, 'edge', 'edges')} to ${target.m.into.name}`, commands: [{ type: 'set-feature', id: target.m.into.id, patch: { edges: [...target.m.into.edges, ...target.m.edges] } }, { type: 'remove-feature', id: f.id }] } });
		const keep = f.edges.filter((_, i) => !smooth.includes(refs[i]));
		return new BlendRefusal(`${which}, so ${plural(smooth.length, 'it has', 'they have')} no corner to ${word}.`, { where, detail, fix: { label: `Leave ${plural(smooth.length, 'it', 'them')} out`, commands: [{ type: 'set-feature', id: f.id, patch: { edges: keep } }] } });
	}
	const these = plural(refs.length, 'this edge', 'these edges');
	/* A round cannot stop where its edge runs smoothly on into the next one; carried along the tangent chain it usually can. */
	if (!f.propagate) {
		const chain = tangentChain(k, body.solid, handles);
		if (chain.length > handles.length && blendFits(ctx, body.solid, f, chain)) return new BlendRefusal(`${plural(refs.length, 'This edge runs', 'These edges run')} smoothly on into the next edges, and a ${word} cannot stop partway along them.`, { where: chain.map(edgeSel), detail, fix: { label: `${word === 'round' ? 'Round' : 'Bevel'} the whole chain`, commands: [{ type: 'set-feature', id: f.id, patch: { propagate: true } }] } });
	}
	const issue = readKernelBlendError(raw);
	const primary = f.type === 'fillet' ? f.radius : f.distance;
	/* A kernel limit speaks for the primary size only when nothing else scales with it. */
	const hint = issue.limit !== undefined && (f.type === 'fillet' ? !f.variable && issue.kind === 'cliff' : f.distance2 === undefined && issue.kind === 'setback') ? issue.limit : undefined;
	const probe = (v: number) => blendFits(ctx, body.solid, { ...f, ...sizedPatch(f, v) } as Blend, handles);
	const where = handles.map(edgeSel);
	/* Which of the student's own picks run into an earlier round or bevel: along the run the chain carries them on (the arc down the side of a big round) or at a corner. */
	const runOf = (h: number) => (f.propagate ? tangentChain(k, body.solid, [h]) : [h]);
	const hits = refs.map((h) => [...touching(runOf(h), false).keys()]);
	const struck = refs.map((_, i) => i).filter((i) => hits[i].length);
	/* A round running along an earlier one usually fits just under that one's radius, so each such radius is a first guess. */
	const guesses = f.type === 'fillet' ? [...new Set(struck.flatMap((i) => hits[i]))].map((fid) => ctx.manifest.features.find((x) => x.id === fid)).flatMap((x) => (x?.type === 'fillet' && !x.variable ? [x.radius] : [])) : [];
	/* A drag refuses frame after frame; the search is for the refusal a student stops on, so a preview frame only says what went wrong. */
	/* The same refusal asked again on the same geometry (a drag past the limit, frame after frame, or a replay) reuses its answer instead of probing again: a single-size blend's largest fit does not depend on how far past it the request was. The geometry is keyed by the body's box AND its volume, so an edit upstream that moves a hole without changing the box still misses. */
	const single = f.type === 'fillet' ? !f.variable : f.distance2 === undefined;
	const key = single ? JSON.stringify([f.id, f.type, f.edges, !!f.propagate, f.type === 'chamfer' ? f.angle ?? null : null, [...k.boundingBox(body.solid)].map((x) => Number(x.toFixed(9))), Number(Number(json(k.massProperties(body.solid)).volume).toFixed(9)), issue.kind]) : '';
	const memo = key ? fitMemo.get(key) : undefined;
	const found = memo && (memo.value === null || memo.value < primary) ? memo : issue.kind !== 'boundary' && !ctx.preview ? largestThatFits(probe, primary, hint, FIT_ATTEMPTS, FIT_BUDGET_MS, guesses) : { value: null, exact: false };
	if (key && !ctx.preview && found !== memo) { fitMemo.delete(key); fitMemo.set(key, { value: found.value, exact: found.exact }); if (fitMemo.size > FIT_MEMO_SIZE) fitMemo.delete(fitMemo.keys().next().value!); }
	const fit = found.value;
	let sizeFix: FeatureFix | undefined, sizeWords = '';
	if (fit !== null) {
		const patch = sizedPatch(f, fit) as { radius?: number; distance?: number; distance2?: number; variable?: { end: number } };
		sizeWords = f.type === 'fillet' ? (patch.variable ? `${figure(patch.radius!)} to ${figure(patch.variable.end)}` : figure(patch.radius!)) : patch.distance2 !== undefined ? `${figure(patch.distance!)} by ${figure(patch.distance2)}` : figure(patch.distance!);
		sizeFix = { label: `Use ${sizeWords}`, value: fit, commands: [{ type: 'set-feature', id: f.id, patch }] };
	}
	/* "The largest" only when the search closed the gap; a search the budget cut short says what it found. Honest numbers. */
	const largest = `The largest ${found.exact ? '' : 'found '}that fits here is ${sizeWords}.`;
	/* A size close to what was asked is the answer; one far below it (0.0153 for a 0.2 in round) is a symptom of running into the earlier round, which is the thing to say. */
	if (sizeFix && (fit! >= primary / 2 || !struck.length)) return new BlendRefusal(`That ${f.type === 'fillet' ? 'radius' : 'chamfer'} is too big for ${these}. ${largest}`, { where, detail, fix: sizeFix });
	if (struck.length) {
		const fid = hits[struck[0]][0], name = nameOf(fid), their = ctx.manifest.features.find((x) => x.id === fid)?.type === 'chamfer' ? 'bevel' : 'round';
		const whose = (one: string, many: string) => (struck.length === refs.length ? plural(refs.length, `This edge ${one}`, `These edges ${many}`) : `${struck.length} of these edges ${struck.length === 1 ? one : many}`);
		const into = mergeTarget(ctx, f, fid);
		const sameSize = into && (into.into.type === 'fillet' && f.type === 'fillet' ? into.into.radius === f.radius : into.into.type === 'chamfer' && f.type === 'chamfer' ? into.into.distance === f.distance && into.into.distance2 === f.distance2 && into.into.angle === f.angle : false);
		const fixes: FeatureFix[] = [];
		if (into && sameSize) fixes.push({ label: `Add to ${name}`, commands: [{ type: 'set-feature', id: into.into.id, patch: { edges: [...into.into.edges, ...into.edges] } }, { type: 'remove-feature', id: f.id }] });
		/* Leaving out the picks that run into it, when the rest make the size asked for: one more probe. */
		const keep = refs.map((_, i) => i).filter((i) => !hits[i].length);
		if (keep.length && blendFits(ctx, body.solid, f, [...new Set(keep.flatMap((i) => runOf(refs[i])))])) fixes.push({ label: `Leave out ${struck.length} ${plural(struck.length, 'edge', 'edges')}`, commands: [{ type: 'set-feature', id: f.id, patch: { edges: keep.map((i) => f.edges[i]) } }] });
		if (sizeFix) fixes.push(sizeFix);
		const help: FeatureHelp = { where: struck.map((i) => edgeSel(refs[i])), detail, ...(fixes.length ? { fix: fixes[0] } : {}), ...(fixes.length > 1 ? { more: fixes.slice(1) } : {}) };
		/* Said as what was measured (a SEPARATE one cannot blend that corner), never as a promise that making them together will: on an L bracket it does not (measured, "2 stripes meet" at every radius), and pressing the fix then says so. */
		if (into && sameSize) return new BlendRefusal(`${whose('meets', 'meet')} the ${their} from ${name} at a corner, which a separate ${word} cannot blend.`, help);
		return new BlendRefusal(`${whose('runs', 'run')} into the ${their} from ${name}, where a ${word} this size cannot meet it.${sizeFix ? ` ${largest}` : ''}`, help);
	}
	const sentence: Record<KernelBlendIssue['kind'], string> = {
		cliff: `That ${f.type === 'fillet' ? 'radius' : 'chamfer'} is too big for ${these}, and no smaller size fits either. Try fewer edges at a time.`,
		setback: `That chamfer is too big for ${these}, and no smaller size fits either. Try fewer edges at a time.`,
		vertex: `Several ${word}s meet at one corner here in a way that cannot be blended. Try fewer edges at a time.`,
		trim: `The ${word} could not be trimmed where it meets the next face. Try a smaller size or fewer edges.`,
		curved: `The ${word} reaches a curved face at a corner, which cannot be trimmed here. Pick edges that stop short of the curved face.`,
		boundary: `${plural(refs.length, 'That edge is', 'Those edges are')} on an open boundary, so there is nothing to ${word} against.`,
		self: `That size makes the ${word} run into itself. Try a smaller size.`,
		partial: `This ${word} could not be finished on every edge. Try a smaller size or fewer edges.`,
		other: `This ${word} could not be made on ${these}. Try a smaller size or fewer edges.`
	};
	return new BlendRefusal(sentence[issue.kind], { where, detail });
}
/** Run a blend: the stored sizes exactly as typed, and on a refusal the sentence and the way forward. */
function runBlend(ctx: ExecutorContext, f: Blend) {
	const k = ctx.k;
	/* Sizes are checked first, in the executor's own words, before any geometry is read. */
	/* The kernel turns an unknown law into a constant radius without a word (research section 4), so a stored law it would ignore is refused here instead. */
	if (f.type === 'fillet') { positive(f.radius, 'radius'); if (f.variable) { positive(f.variable.end, 'radius'); const law = f.variable.law ?? 'linear'; if (law !== 'linear' && law !== 'scurve') throw Error('Use a linear or S-curve radius law.'); } }
	else { positive(f.distance, 'distance'); if (f.angle !== undefined) { const a = finite(f.angle, 'angle'); if (!(a > 0 && a < 90)) throw Error('Use a chamfer angle between 0 and 90 degrees.'); } else if (f.distance2 !== undefined) positive(f.distance2, 'distance'); }
	const { body, picked, refs, handles } = blendEdges(ctx, f);
	const t = topology(k, body.solid);
	const smooth = picked.filter((e) => smoothEdge(k, t, e));
	if (smooth.length) throw refuse(ctx, f, body, refs, handles, '', smooth);
	const sources = [...k.getSolidFaces(body.solid)];
	let solid: number;
	try {
		const out = blendCall(k, body.solid, f, handles);
		solid = 'journaled' in out ? ctx.journal(out.journaled) : out.solid;
		if (k.validateSolid(solid) !== 0) throw Error('the result is not a valid solid');
	} catch (error) {
		throw refuse(ctx, f, body, refs, handles, error instanceof Error ? error.message : String(error), []);
	}
	const between = f.type === 'fillet' ? 'blend' : 'bevel';
	const journaled = f.type === 'fillet' ? !f.variable : f.angle === undefined;
	ctx.replaceBody(body, solid, journaled ? { between } : { carry: carryBySurface(ctx, sources), between });
}
export function fillet(ctx: ExecutorContext, f: FeatureOf<'fillet'>) { runBlend(ctx, f); }
export function chamfer(ctx: ExecutorContext, f: FeatureOf<'chamfer'>) { runBlend(ctx, f); }

/* -------------------------------------------------------------------------
 * EDGE SETS OVER THE PROJECTION: one pick grown into the edges a round wants
 * ---------------------------------------------------------------------- */

/**
 * PURE, OVER `BodyProjection`, NO KERNEL. These are what a selection
 * accelerator offers after one pick (research section 4): the tangent chain,
 * the face's loop, every edge a feature made, every edge of the body, and the
 * convex or concave ones. They run on the main thread from the projection the
 * viewport already holds, so a hover preview never waits on the worker.
 *
 * A face's normal at a point is read off its OWN display mesh (per-face
 * tessellation keeps sharp normals, which is why it exists), at the mesh
 * vertex nearest the point; the direction INTO a face from an edge is toward
 * the centroid of that face's triangle nearest the edge's middle. Convexity is
 * then the dihedral sign: from an edge, stepping into one face goes below the
 * other face's tangent plane on a convex edge (a box's rim) and above it on a
 * concave one (the inside corner of an L bracket).
 */
export type EdgeSetKind = 'chain' | 'loop' | 'feature' | 'body' | 'convex' | 'concave';
/** `unknown` when the projection carries no geometry to read it from; nothing may treat that as smooth. */
export type EdgeShape = 'convex' | 'concave' | 'smooth' | 'unknown';
type PV = { positions: ArrayLike<number>; normals: ArrayLike<number>; indices: ArrayLike<number> };
const at3 = (a: ArrayLike<number>, i: number): Vec3 => [a[3 * i], a[3 * i + 1], a[3 * i + 2]];
const dist2 = (a: Vec3, b: Vec3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a: Vec3): Vec3 | null => { const n = len3(a); return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : null; };
/** A face's outward normal at the mesh vertex nearest `p`; a plane's own normal when it has no mesh. */
export function faceNormalNear(face: FaceProjection, p: Vec3): Vec3 | null {
	const m = face as PV, n = m.positions.length / 3;
	if (!n) return face.kind === 'plane' ? norm3(face.normal) : null;
	let best = 0, bd = Infinity;
	for (let i = 0; i < n; i++) { const d = dist2(at3(m.positions, i), p); if (d < bd) { bd = d; best = i; } }
	return norm3(at3(m.normals, best));
}
/** The unit direction from `p` on an edge into `face`, square to the edge's tangent `t`: toward the centroid of the face's triangle nearest `p`. */
function intoFace(face: FaceProjection, p: Vec3, t: Vec3): Vec3 | null {
	const m = face as PV;
	let c: Vec3 | null = null, bd = Infinity;
	for (let i = 0; i + 2 < m.indices.length; i += 3) {
		const a = at3(m.positions, m.indices[i]), b = at3(m.positions, m.indices[i + 1]), d = at3(m.positions, m.indices[i + 2]);
		const g: Vec3 = [(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3], q = dist2(g, p);
		if (q < bd) { bd = q; c = g; }
	}
	if (!c) c = face.center;
	const w = sub3(c, p), along = dot(w, t);
	return norm3([w[0] - along * t[0], w[1] - along * t[1], w[2] - along * t[2]]);
}
/** The two ends of an edge's polyline and the tangent at each, pointing along the edge from its first point. */
export function edgeEnds(edge: EdgeProjection): { a: Vec3; b: Vec3; ta: Vec3 | null; tb: Vec3 | null; closed: boolean } {
	const p = edge.points, n = p.length / 3;
	if (n < 2) return { a: edge.mid, b: edge.mid, ta: null, tb: null, closed: true };
	const a = at3(p, 0), b = at3(p, n - 1), scale = Math.max(1e-9, edge.length);
	/* A chord leaves an arc at half its own angle off the tangent (6.6 degrees on a 0.3 in round sampled at 0.002 in), so with three points the one-sided second-order difference is used, which is within about a degree. */
	const end = (i0: number, i1: number, i2: number, sign: number): Vec3 | null => n < 3 ? norm3(sub3(at3(p, i1), at3(p, i0)).map((x) => x * sign) as Vec3) : norm3([0, 1, 2].map((k) => sign * (-3 * p[3 * i0 + k] + 4 * p[3 * i1 + k] - p[3 * i2 + k]) / 2) as Vec3);
	return { a, b, ta: end(0, 1, 2, 1), tb: end(n - 1, n - 2, n - 3, -1), closed: len3(sub3(a, b)) < 1e-6 * Math.max(1, scale) };
}
/** The edge's tangent at its middle, from the polyline segment nearest `mid`. */
function midTangent(edge: EdgeProjection): Vec3 | null {
	const p = edge.points, n = p.length / 3;
	let best: Vec3 | null = null, bd = Infinity;
	for (let i = 0; i + 1 < n; i++) {
		const a = at3(p, i), b = at3(p, i + 1), g: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], d = dist2(g, edge.mid);
		if (d < bd) { const t = norm3(sub3(b, a)); if (t) { bd = d; best = t; } }
	}
	return best;
}
/** Two unit directions within 3 degrees of parallel, either sense: loose enough for a sampled polyline's end, far tighter than any corner a student draws. */
const PARALLEL = Math.cos(3 * Math.PI / 180);
/**
 * The faces beside each edge, read from `FaceProjection.edges` and never from
 * `EdgeProjection.faces`: the projection builds the latter by splitting a
 * joined key on `|`, which also splits a round's own name (`f1.blend.A|B`),
 * so beside a round it lists pieces of names rather than faces.
 */
export function facesByEdge(body: BodyProjection): Map<string, FaceProjection[]> {
	const known = besideCache.get(body); if (known) return known;
	const out = new Map<string, FaceProjection[]>();
	for (const f of body.faces) for (const id of f.edges) out.set(id, [...(out.get(id) ?? []), f]);
	besideCache.set(body, out);
	return out;
}
/* A projection is replaced whole whenever the model changes, so a body object is its own cache key: a new selection on the same model reads these for free, and a new model can never read a stale answer. */
const besideCache = new WeakMap<BodyProjection, Map<string, FaceProjection[]>>();
const shapeCache = new WeakMap<BodyProjection, Map<string, EdgeShape>>();
/** Every edge's shape on a body, computed once per projection (about 0.08 ms an edge, measured warm on a 48-edge plate with 12 holes and four rounded corners). */
export function edgeShapes(body: BodyProjection): Map<string, EdgeShape> {
	const known = shapeCache.get(body); if (known) return known;
	const beside = facesByEdge(body), out = new Map<string, EdgeShape>();
	for (const e of body.edges) out.set(e.id, edgeShape(body, e, beside));
	shapeCache.set(body, out);
	return out;
}
/** One spelling of an edge id whichever way its face names were joined: the pieces between `|`, sorted, and the ordinal. */
export const edgeKey = (id: string) => { const m = /^edge:(.*?)(#\d+)?$/.exec(id); return m ? `${m[1].split('|').sort().join('|')}${m[2] ?? ''}` : id; };
/** Convex, concave, or smooth (the faces meet without a corner, as beside a round). */
export function edgeShape(body: BodyProjection, edge: EdgeProjection, beside: Map<string, FaceProjection[]> = facesByEdge(body)): EdgeShape {
	const [fa, fb] = beside.get(edge.id) ?? [];
	const t = midTangent(edge);
	if (!fa || !fb || !t) return 'unknown';
	const na = faceNormalNear(fa, edge.mid), nb = faceNormalNear(fb, edge.mid), da = intoFace(fa, edge.mid, t), db = intoFace(fb, edge.mid, t);
	if (!na || !nb || !da || !db) return 'unknown';
	if (Math.abs(dot(na, nb)) > PARALLEL) return 'smooth';
	const s = dot(da, nb) + dot(db, na);
	return s < -1e-6 ? 'convex' : s > 1e-6 ? 'concave' : 'smooth';
}
/** Edges reached from `seed` across shared ends where the run carries on smoothly: the edges' tangents line up, and every face beside the next edge is a face beside this one or meets one of them without a crease. The projection's twin of the kernel's `tangentChain`. */
export function tangentChainEdges(body: BodyProjection, seed: string): string[] {
	const byId = new Map(body.edges.map((e) => [e.id, e])), start = byId.get(seed);
	if (!start) return [];
	const ends = new Map(body.edges.map((e) => [e.id, edgeEnds(e)])), beside = facesByEdge(body);
	const out: string[] = [], seen = new Set<string>(), queue = [seed];
	const tol = 1e-5 * Math.max(1, ...body.bounds.map(Math.abs));
	while (queue.length) {
		const id = queue.shift()!; if (seen.has(id)) continue; seen.add(id); out.push(id);
		const en = ends.get(id)!, mine = beside.get(id) ?? [];
		if (en.closed) continue;
		for (const [p, t] of [[en.a, en.ta], [en.b, en.tb]] as [Vec3, Vec3 | null][]) {
			if (!t) continue;
			for (const g of body.edges) {
				if (seen.has(g.id)) continue;
				const gn = ends.get(g.id)!; if (gn.closed) continue;
				const tg = len3(sub3(gn.a, p)) < tol ? gn.ta : len3(sub3(gn.b, p)) < tol ? gn.tb : null;
				if (!tg || Math.abs(dot(t, tg)) < PARALLEL) continue;
				const agree = (beside.get(g.id) ?? []).every((B) => mine.includes(B) || mine.some((A) => { const na = faceNormalNear(A, p), nb = faceNormalNear(B, p); return !!na && !!nb && Math.abs(dot(na, nb)) > PARALLEL; }));
				if (agree) queue.push(g.id);
			}
		}
	}
	return out;
}
/** A face's boundary. With `through`, only the loop that edge is on (a plate's outer rim, not the rim of a hole in it). */
export function faceLoopEdges(body: BodyProjection, faceId: string, through?: string): string[] {
	const f = body.faces.find((x) => x.id === faceId);
	if (!f) return [];
	if (!through || !f.edges.includes(through)) return [...f.edges];
	const edges = f.edges.map((id) => body.edges.find((e) => e.id === id)).filter((e): e is EdgeProjection => !!e);
	const ends = new Map(edges.map((e) => [e.id, edgeEnds(e)]));
	const tol = 1e-5 * Math.max(1, ...body.bounds.map(Math.abs));
	const touch = (x: string, y: string) => { const a = ends.get(x)!, b = ends.get(y)!; return [a.a, a.b].some((p) => [b.a, b.b].some((q) => len3(sub3(p, q)) < tol)); };
	const out = [through], queue = [through];
	while (queue.length) { const id = queue.shift()!; for (const e of edges) if (!out.includes(e.id) && touch(id, e.id)) { out.push(e.id); queue.push(e.id); } }
	return f.edges.filter((id) => out.includes(id));
}
/** Every edge beside a face the feature made. */
export function featureEdges(body: BodyProjection, featureId: string) { const beside = facesByEdge(body); return body.edges.filter((e) => (beside.get(e.id) ?? []).some((f) => featureOfName(f.id) === featureId)).map((e) => e.id); }
export const bodyEdges = (body: BodyProjection) => body.edges.map((e) => e.id);
export function edgesShaped(body: BodyProjection, shape: EdgeShape) { const shapes = edgeShapes(body); return body.edges.filter((e) => shapes.get(e.id) === shape).map((e) => e.id); }
/**
 * THE ONE ENTRY a selection accelerator calls: the edge ids `kind` grows a
 * pick into, on the pick's body. `edge` seeds the chain and the loop; `face`
 * names the loop's face (without one, the loop is the picked edge's first
 * face); `feature` defaults to the feature that made the picked edge's
 * first face. Empty when the seed is missing.
 */
export function edgeSet(body: BodyProjection, kind: EdgeSetKind, seed: { edge?: string; face?: string; feature?: string } = {}): string[] {
	const edge = seed.edge ? body.edges.find((e) => e.id === seed.edge) : undefined;
	switch (kind) {
		case 'chain': return seed.edge ? tangentChainEdges(body, seed.edge) : [];
		case 'loop': { const face = seed.face ?? (edge && facesByEdge(body).get(edge.id)?.[0]?.id); return face ? faceLoopEdges(body, face, seed.edge) : []; }
		case 'feature': { const first = edge && facesByEdge(body).get(edge.id)?.[0]?.id; const fid = seed.feature ?? (first ? featureOfName(first) : seed.face ? featureOfName(seed.face) : undefined); return fid ? featureEdges(body, fid) : []; }
		case 'body': return bodyEdges(body);
		case 'convex': return edgesShaped(body, 'convex');
		case 'concave': return edgesShaped(body, 'concave');
	}
}

export function shell(ctx: ExecutorContext, f: FeatureOf<'shell'>) {
	const k = ctx.k, thickness = positive(f.thickness, 'thickness');
	const body = ctx.body(f.body);
	const open = f.openFaces.map((face) => ctx.resolveFace(face).handle);
	/* Per-face walls are resolved BEFORE the shell, while their source faces still carry the names the inner faces will be derived from. */
	const walls = (f.faceThickness ?? []).map((t) => {
		const { handle } = ctx.resolveFace(t.face);
		const name = ctx.faceName(handle) ?? t.face.name;
		if (open.includes(handle)) throw Error(`${name} is an open face, so it has no wall to give a thickness to. Remove it from one list or the other.`);
		if (k.getSurfaceType(handle) !== 'plane') throw Error(`Per-face thickness works on flat faces. ${name} is curved, so it takes the shell's thickness.`);
		return { name, thickness: positive(t.thickness, 'thickness') };
	});
	const sources = [...k.getSolidFaces(body.solid)].map((face) => ({ face, name: ctx.faceName(face), kind: k.getSurfaceType(face), params: json(k.getAnalyticSurfaceParams(face)), key: surfaceKey(k, face) }));
	const solid = k.shell(body.solid, thickness, new Uint32Array(open));
	/* Outer faces keep their surfaces; an inner face is its source's offset with the normal turned inward. */
	const carry = (face: number): string | undefined => {
		const key = surfaceKey(k, face);
		const same = sources.find((s) => s.key === key); if (same?.name) return same.name;
		const kind = k.getSurfaceType(face), params = json(k.getAnalyticSurfaceParams(face));
		if (kind === 'plane') {
			const n = vector(params.normal), d = params.d as number;
			const src = sources.find((s) => s.kind === 'plane' && dot(vector(s.params.normal), n) < -0.999 && Math.abs(d - (thickness - (s.params.d as number))) < 1e-6);
			if (src?.name) return `${f.id}.inner.${src.name}`;
		}
		if (kind === 'cylinder') {
			const src = sources.find((s) => s.kind === 'cylinder' && Math.abs(Math.abs((s.params.radius as number) - (params.radius as number)) - thickness) < 1e-6);
			if (src?.name) return `${f.id}.inner.${src.name}`;
		}
		return undefined;
	};
	ctx.replaceBody(body, solid, { carry, between: 'inner' });
	/* Then each wall with its own thickness: move its inner face by the difference. The inner face's outward normal points into the cavity, so a positive move thickens the wall. */
	for (const wall of walls) {
		const delta = wall.thickness - thickness;
		if (Math.abs(delta) < 1e-12) continue;
		const inner = [...k.getSolidFaces(body.solid)].filter((face) => ctx.faceName(face) === `${f.id}.inner.${wall.name}`);
		if (inner.length !== 1) throw Error(`The wall under ${wall.name} could not be found after shelling. Pick that face again.`);
		ctx.replaceBody(body, ctx.journal(k.moveFacesJournaled(body.solid, new Uint32Array(inner), delta)));
	}
}
