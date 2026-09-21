/**
 * TOPOLOGICAL NAMING: how a feature written today finds the face it meant after
 * something above it in the tree has changed.
 *
 * This is the hard problem in parametric CAD and it is not solved here or
 * anywhere; what is stated below is a SCHEME, the order its tiers are tried in,
 * and exactly when each one breaks. `docs/IDEACAD.md` repeats it in prose.
 *
 * TIER 1 -- CONSTRUCTION NAMES. Every face is named when it is created, by
 * the feature that created it, deterministically from the feature's own id and
 * the face's construction ROLE:
 *
 *   extrude   <fid>.start / <fid>.end / <fid>.side.<i> / <fid>.hole.<h>.<i>
 *             where <i> is the index of the profile edge that swept the face,
 *             in the sketch's own entity order;
 *   revolve   <fid>.rev.<i> (and .start/.end caps under 360 degrees);
 *   body      <fid>.face.<i> in the kernel's face order of the saved bytes;
 *   fillet    <fid>.blend.<A>|<B>   the two named faces the blend sits between
 *   chamfer   <fid>.bevel.<A>|<B>   (a corner patch: <fid>.corner.<A>|<B>|<C>)
 *   shell     <fid>.inner.<source>  the offset of a source face
 *   pattern/mirror  the copy keeps the source's names (a body id is the copy's)
 *
 * A name is body-unique because it carries the feature id, so a boolean that
 * merges two bodies never collides two names. Names ride through every
 * journaled kernel operation (`propagateAttributesForOp`), which is what makes
 * a face's name survive a push, a cut, a fillet on a neighbouring edge or a
 * boolean. An edge is named by the SORTED pair of faces it joins, a vertex by
 * the sorted set of faces that meet at it.
 *
 * TIER 2 -- ORDINALS. When one name lands on more than one face (a slot cut
 * through the top splits it into two, both carried as <fid>.end), the pieces
 * get `<name>~<k>`, k by the lexicographic order of a stable anchor point
 * (the average of the face's vertices). Two edges joining the same two faces
 * are `edge:<A>|<B>#<k>` by their midpoints, the same way. THIS TIER BREAKS
 * when an upstream edit moves the pieces past each other: the slot dragged
 * from the left half of a plate to the right half swaps which piece is ~0,
 * and a fillet on `<fid>.end~1` silently lands on the other piece. It fails
 * SILENTLY -- the name resolves, to the wrong face -- which is why the hint
 * tier below is recorded for every reference and checked even when the name
 * resolves, and a mismatch is reported as a warning rather than trusted.
 *
 * TIER 3 -- GEOMETRIC HINTS. Every reference stores the surface kind, anchor,
 * normal and area of the face it was made on. When a name no longer resolves
 * (the face was consumed by a later edit, or its role changed: a side face
 * that became two after a profile edge was split), the hint is matched against
 * the current faces within tolerance. A UNIQUE match reattaches the reference
 * and the feature reports a WARNING naming what it did; an ambiguous match
 * (a symmetric part has two faces with one signature) or no match is an ERROR
 * that names the reference, and the feature is skipped rather than guessed.
 * THIS TIER BREAKS when the face genuinely moved: a hint is a picture of the
 * past, so a face pushed 2 inches after the reference was made no longer
 * matches its own hint, and the reference has to be re-picked.
 *
 * TIER 4 -- NOTHING. A face nothing above named -- a face the kernel created
 * without a journal, in an operation whose carrier rules could not place it --
 * is named `<fid>.face.<k>` by anchor order and counted. Every count of these
 * is a place the scheme is leaning on ordinals, and the replay report says how
 * many there were.
 *
 * WHAT IS DELIBERATELY NOT DONE. Names are never rewritten into the stored
 * document when a hint reattaches a reference: a repair that changes a saved
 * feature during a load is a silent edit of somebody's work, and the warning
 * stays visible until the student re-picks the face. The kernel's own
 * `captureSignatureRef` / `resolveRef` were considered for tier 3 and not
 * used: they bind to a kernel session's journal op ids, which do not survive a
 * replay from bytes, so they could stand in for the hint only inside one
 * session and would have to be re-derived on every open anyway.
 */
import type { BrepKernel } from '../kernel/remus';
import type { EdgeHint, EdgeRef, FaceHint, FaceRef, Selection, Vec3, VertexHint, VertexRef, BodyProjection } from './types';
import { dot, sub, unit, vector } from './math';

const json = <T = Record<string, any>>(input: unknown): T => (typeof input === 'string' ? JSON.parse(input) : input) as T;
const q = (n: number) => Math.round(n * 1e4) / 1e4;
/** Lexicographic order of anchor points, quantized so float noise cannot swap two of them. */
export const anchorOrder = (a: Vec3, b: Vec3) => q(a[0]) - q(b[0]) || q(a[1]) - q(b[1]) || q(a[2]) - q(b[2]);

/** The average of a face's vertices: not its centroid, but deterministic and cheap, which is what an ordinal needs. */
export function faceAnchor(k: BrepKernel, face: number): Vec3 {
	const vertices = k.getFaceVertices(face);
	const out: Vec3 = [0, 0, 0];
	for (const v of vertices) { const p = k.getVertexPosition(v); out[0] += p[0] / vertices.length; out[1] += p[1] / vertices.length; out[2] += p[2] / vertices.length; }
	return out;
}
/** A quantized string of a face's analytic surface, for matching a tool face to its carried copy. */
export function surfaceKey(k: BrepKernel, face: number): string {
	const kind = k.getSurfaceType(face);
	const params = json(k.getAnalyticSurfaceParams(face));
	if (kind === 'plane') {
		const n = vector(params.normal ?? [0, 0, 1]);
		return `plane|${n.map(q).join(',')}|${q(params.d ?? 0)}`;
	}
	if (kind === 'cylinder' && params.axis && params.origin) {
		const d = unit(vector(params.axis)); const o = vector(params.origin);
		/* The point on the axis closest to the world origin, so two cylinders on one axis key the same wherever their origins sit. */
		const t = -dot(o, d); const c: Vec3 = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
		const sign = d[0] !== 0 ? Math.sign(d[0]) : d[1] !== 0 ? Math.sign(d[1]) : Math.sign(d[2]) || 1;
		return `cylinder|${d.map((x) => q(x * sign)).join(',')}|${c.map(q).join(',')}|${q(params.radius ?? 0)}`;
	}
	return `${kind}|${JSON.stringify(params, (_k, v) => (typeof v === 'number' ? q(v) : v))}`;
}

export interface NamingReport { carried: number; roles: number; matched: number; adjacency: number; ordinals: number; fallback: number }
export interface NamingOptions {
	/** The construction-role namer: returns the suffix after `<fid>.` or nothing. */
	role?: (face: number) => string | undefined;
	/** A carrier: a full name for a face that is a copy of a face named elsewhere (tool faces, pattern copies, shell offsets). */
	carry?: (face: number) => string | undefined;
	/** The infix for a face sitting between named neighbours: `blend`, `bevel`, `inner`. Default `blend`. */
	between?: string;
}
/**
 * Name every unnamed face of `solid` for feature `fid`, in tier order, and
 * disambiguate duplicates. Returns a count per tier so a replay can say how
 * much of the model rests on ordinals.
 */
export function assignNames(k: BrepKernel, solid: number, fid: string, options: NamingOptions = {}): NamingReport {
	const report: NamingReport = { carried: 0, roles: 0, matched: 0, adjacency: 0, ordinals: 0, fallback: 0 };
	const faces = [...k.getSolidFaces(solid)];
	const name = (f: number) => k.getFaceName(f) || undefined;
	for (const f of faces) if (name(f)) report.carried++;
	/* Tier 1, construction roles, then carriers. */
	for (const f of faces) {
		if (name(f)) continue;
		const role = options.role?.(f);
		if (role) { k.setFaceName(f, `${fid}.${role}`); report.roles++; continue; }
		const carried = options.carry?.(f);
		if (carried) { k.setFaceName(f, carried); report.matched++; }
	}
	/* Tier 1 still: faces between named neighbours, two passes so a corner patch can name itself from the blends beside it.
	 * Pass 0 names a face from the TWO neighbours it shares the most edge length with (a fillet along a box edge also
	 * touches both end caps, on two short arcs; the faces it sits BETWEEN are the two it runs along). Pass 1 names what is
	 * left from every named neighbour, which is what a corner patch between three blends is. Each pass reads the names as
	 * they stood when it began, so the order faces come back from the kernel cannot change the outcome. */
	const between = options.between ?? 'blend';
	const edgeOwners = new Map<number, number[]>();
	for (const f of faces) for (const e of k.getFaceEdges(f)) edgeOwners.set(e, [...(edgeOwners.get(e) ?? []), f]);
	const sharedLength = (f: number) => { const by = new Map<number, number>(); for (const e of k.getFaceEdges(f)) for (const g of edgeOwners.get(e) ?? []) if (g !== f) by.set(g, (by.get(g) ?? 0) + k.edgeLength(e)); return by; };
	for (let pass = 0; pass < 2; pass++) {
		const snapshot = new Map(faces.map((f) => [f, name(f)]));
		for (const f of faces) {
			if (snapshot.get(f)) continue;
			const shared = [...sharedLength(f)].filter(([g]) => !!snapshot.get(g)).sort((a, b) => b[1] - a[1] || anchorOrder(faceAnchor(k, a[0]), faceAnchor(k, b[0])));
			const chosen = pass === 0 ? shared.slice(0, 2) : shared;
			const neighbours = [...new Set(chosen.map(([g]) => snapshot.get(g)!))].sort();
			if (neighbours.length >= 2) { k.setFaceName(f, `${fid}.${pass === 0 ? between : 'corner'}.${neighbours.join('|')}`); report.adjacency++; }
		}
	}
	/* Tier 4: anything left, by anchor order. */
	const left = faces.filter((f) => !name(f)).map((f) => ({ f, anchor: faceAnchor(k, f) })).sort((a, b) => anchorOrder(a.anchor, b.anchor));
	left.forEach(({ f }, i) => { k.setFaceName(f, `${fid}.face.${i}`); report.fallback++; });
	/* Tier 2: duplicates. */
	const byName = new Map<string, number[]>();
	for (const f of faces) { const n = name(f)!; byName.set(n, [...(byName.get(n) ?? []), f]); }
	for (const [n, group] of byName) {
		if (group.length < 2) continue;
		const base = n.replace(/~\d+$/, '');
		group.map((f) => ({ f, anchor: faceAnchor(k, f) })).sort((a, b) => anchorOrder(a.anchor, b.anchor)).forEach(({ f }, i) => { k.setFaceName(f, `${base}~${i}`); report.ordinals++; });
	}
	return report;
}
/** `<fid>.<role>` for faces a solid was born with when it came from bytes. */
export function nameImportedFaces(k: BrepKernel, solid: number, fid: string) {
	const faces = [...k.getSolidFaces(solid)].map((f) => ({ f, anchor: faceAnchor(k, f) }));
	if (faces.every(({ f }) => k.getFaceName(f))) return;
	faces.sort((a, b) => anchorOrder(a.anchor, b.anchor)).forEach(({ f }, i) => { if (!k.getFaceName(f)) k.setFaceName(f, `${fid}.face.${i}`); });
}

/* -------------------------------------------------------------------------
 * EDGE AND VERTEX IDS, derived from face names, and the hints beside them
 * ---------------------------------------------------------------------- */

export const edgeId = (faces: readonly string[], ordinal?: number) => `edge:${[...faces].sort().join('|')}${ordinal !== undefined ? `#${ordinal}` : ''}`;
export const vertexId = (faces: readonly string[], ordinal?: number) => `vertex:${[...faces].sort().join('|')}${ordinal !== undefined ? `#${ordinal}` : ''}`;

/** Build the reference a feature stores from what the viewport selected, hint included. */
export function refFromSelection(selection: Selection, body: BodyProjection): FaceRef | EdgeRef | VertexRef {
	if (selection.kind === 'face') {
		const face = body.faces.find((f) => f.id === selection.id);
		if (!face) throw Error('That face is no longer on the model. Select it again.');
		return { body: body.id, name: face.id, hint: { kind: face.kind, center: face.center, normal: face.normal, area: face.area } };
	}
	if (selection.kind === 'edge') {
		const edge = body.edges.find((e) => e.id === selection.id);
		if (!edge) throw Error('That edge is no longer on the model. Select it again.');
		return { body: body.id, faces: edge.faces, ordinal: edge.ordinal, hint: { curve: edge.curve, mid: edge.mid, length: edge.length } };
	}
	if (selection.kind === 'vertex') {
		const vertex = body.vertices.find((v) => v.id === selection.id);
		if (!vertex) throw Error('That corner is no longer on the model. Select it again.');
		return { body: body.id, faces: vertex.faces, ordinal: vertex.ordinal, hint: { point: vertex.point } };
	}
	throw Error('Select a face, edge or corner.');
}

/** Tolerances for the hint tier. Inches; the kernel's own linear tolerance is 0.002 in the tessellation calls. */
export const HINT_DISTANCE = 1e-3;
export const HINT_AREA_RELATIVE = 0.02;
export function faceHintMatches(hint: FaceHint, face: { kind: string; center: Vec3; normal: Vec3; area: number }): boolean {
	if (hint.kind !== face.kind) return false;
	if (Math.hypot(...sub(hint.center, face.center)) > HINT_DISTANCE * Math.max(1, Math.hypot(...hint.center))) return false;
	if (face.kind === 'plane' && dot(hint.normal, face.normal) < 0.999) return false;
	return Math.abs(hint.area - face.area) <= HINT_AREA_RELATIVE * Math.max(hint.area, face.area, 1e-9);
}
export function edgeHintMatches(hint: EdgeHint, edge: { curve: string; mid: Vec3; length: number }): boolean {
	return hint.curve === edge.curve && Math.hypot(...sub(hint.mid, edge.mid)) <= HINT_DISTANCE * Math.max(1, Math.hypot(...hint.mid)) && Math.abs(hint.length - edge.length) <= HINT_AREA_RELATIVE * Math.max(hint.length, edge.length, 1e-9);
}
export function vertexHintMatches(hint: VertexHint, vertex: { point: Vec3 }): boolean {
	return Math.hypot(...sub(hint.point, vertex.point)) <= HINT_DISTANCE * Math.max(1, Math.hypot(...hint.point));
}

/** The sentence a feature shows when a reference is gone. It names what was referenced, in the student's terms. */
export function lostReference(kind: 'face' | 'edge' | 'corner' | 'body' | 'sketch' | 'plane' | 'axis' | 'point', what: string): string {
	return `Lost reference: the ${kind} this feature used (${what}) is no longer on the model. Edit the feature and pick it again.`;
}
export function ambiguousReference(kind: 'face' | 'edge' | 'corner', what: string, count: number): string {
	return `Lost reference: the ${kind} this feature used (${what}) is gone and ${count} others look the same. Edit the feature and pick the one you mean.`;
}
export function reattachedReference(kind: 'face' | 'edge' | 'corner', what: string): string {
	return `Reattached by shape: the ${kind} this feature used (${what}) was renamed by an earlier edit and a matching one was used instead. Pick it again to make that permanent.`;
}
