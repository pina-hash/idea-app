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
import type { EdgeRef, FeatureHelp, FeatureOf, Selection, Vec3 } from '../types';
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
/** Down to three significant figures: a size a student can read and type, never above `v`. */
export function floorFigure(v: number): number {
	if (!(v > 0) || !Number.isFinite(v)) return 0;
	const step = 10 ** (Math.floor(Math.log10(v)) - 2), k = Math.floor((v / step) * (1 + 1e-12));
	const r = Number((k * step).toPrecision(3));
	return r > v ? Number(((k - 1) * step).toPrecision(3)) : r;
}
/**
 * The largest size `fits` accepts below `requested`, which failed. `hint` is
 * the kernel's own limit when it named one (a strict bound: measured, a 0.5
 * in plate refuses a 0.5 in round and takes 0.499), tried first at a hair
 * under it. Otherwise a bounded search: a small size first, because a
 * refusal no size can cure (two rounds meeting at a corner) fails there at
 * once, then halving the gap on figures a student could type. Every size
 * returned was tried and fitted; null means none did within `budget`.
 */
export function largestThatFits(fits: (v: number) => boolean, requested: number, hint?: number, budget = FIT_ATTEMPTS): { value: number | null; attempts: number } {
	let attempts = 0, bad = requested;
	const attempt = (v: number) => { attempts++; return fits(v); };
	if (hint !== undefined && hint > 0 && hint < requested) {
		const c = floorFigure(hint * (1 - 1e-9));
		if (c > 0) { if (attempt(c)) return { value: c, attempts }; bad = c; }
	}
	let good = 0;
	for (const lo of [floorFigure(bad / 64), floorFigure(bad / 4096)]) { if (!(lo > 0) || attempts >= budget) break; if (attempt(lo)) { good = lo; break; } bad = lo; }
	if (!good) return { value: null, attempts };
	while (attempts < budget) {
		const mid = floorFigure(bad / good > 4 ? Math.sqrt(good * bad) : (good + bad) / 2);
		if (!(mid > good && mid < bad)) break;
		if (attempt(mid)) good = mid; else bad = mid;
	}
	return { value: good, attempts };
}
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
			return { solid: k.filletVariable(solid, JSON.stringify(handles.map((edge) => ({ edge, law: f.variable!.law ?? 'linear', start: radius, end })))) };
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
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
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
	const detail = raw;
	if (smooth.length) {
		const sharp = handles.filter((e) => !smooth.includes(e));
		const rounded = [...touching(smooth, true).keys()][0];
		const meets = [...touching(sharp, false).keys()];
		const target = meets.map((fid) => ({ fid, m: mergeTarget(ctx, f, fid) })).find((x) => x.m);
		const where = smooth.map(edgeSel);
		if (!sharp.length) return new BlendRefusal(`${plural(smooth.length, 'That edge is', 'Those edges are')} already smooth, so there is no corner to ${word}.`, { where, detail });
		const which = `${smooth.length} of these edges ${plural(smooth.length, 'is', 'are')} already ${rounded ? `rounded by ${nameOf(rounded)}` : 'smooth'}`;
		if (target?.m) return new BlendRefusal(`${which}, and the others meet that ${word} at its corners. ${word === 'round' ? 'Rounds' : 'Bevels'} that share a corner have to be made together.`, { where, detail, fix: { label: `Add ${target.m.edges.length} ${plural(target.m.edges.length, 'edge', 'edges')} to ${target.m.into.name}`, commands: [{ type: 'set-feature', id: target.m.into.id, patch: { edges: [...target.m.into.edges, ...target.m.edges] } }, { type: 'remove-feature', id: f.id }] } });
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
	const fit = issue.kind !== 'boundary' ? largestThatFits(probe, primary, hint).value : null;
	if (fit !== null) {
		const patch = sizedPatch(f, fit) as { radius?: number; distance?: number; distance2?: number; variable?: { end: number } };
		const words = f.type === 'fillet' ? (patch.variable ? `${figure(patch.radius!)} to ${figure(patch.variable.end)}` : figure(patch.radius!)) : patch.distance2 !== undefined ? `${figure(patch.distance!)} by ${figure(patch.distance2)}` : figure(patch.distance!);
		return new BlendRefusal(`That ${f.type === 'fillet' ? 'radius' : 'chamfer'} is too big for ${these}. The largest that fits here is ${words}.`, { where, detail, fix: { label: `Use ${words}`, value: fit, commands: [{ type: 'set-feature', id: f.id, patch }] } });
	}
	const meets = [...touching(handles, false)];
	if (meets.length) {
		const [fid, edges] = meets[0], m = mergeTarget(ctx, f, fid), name = nameOf(fid);
		const own = `${plural(edges.length, 'This edge meets', 'These edges meet')} the ${ctx.manifest.features.find((x) => x.id === fid)?.type === 'chamfer' ? 'bevel' : 'round'} from ${name} at a corner`;
		if (m) return new BlendRefusal(`${own}. ${word === 'round' ? 'Rounds' : 'Bevels'} that share a corner have to be made together.`, { where: edges.map(edgeSel), detail, fix: { label: `Add to ${name}`, commands: [{ type: 'set-feature', id: m.into.id, patch: { edges: [...m.into.edges, ...m.edges] } }, { type: 'remove-feature', id: f.id }] } });
		return new BlendRefusal(`${own}, which cannot be blended here. Pick edges that stop short of it.`, { where: edges.map(edgeSel), detail });
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
	if (f.type === 'fillet') { positive(f.radius, 'radius'); if (f.variable) positive(f.variable.end, 'radius'); }
	else { positive(f.distance, 'distance'); if (f.angle !== undefined) { const a = finite(f.angle, 'angle'); if (!(a > 0 && a < 90)) throw Error('Use a chamfer angle between 0 and 90 degrees.'); } else if (f.distance2 !== undefined) positive(f.distance2, 'distance'); }
	const { body, picked, refs, handles } = blendEdges(ctx, f);
	const t = topology(k, body.solid);
	const smooth = picked.filter((e) => smoothEdge(k, t, e));
	if (smooth.length) throw refuse(ctx, f, body, refs, handles, 'smooth edge picked', smooth);
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
