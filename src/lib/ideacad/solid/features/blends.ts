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
import type { FeatureOf, Vec3 } from '../types';
import { surfaceKey } from '../naming';
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

/** Edges resolved for a blend, deduplicated, grouped by body, widened along tangent chains when the feature asks. Blends cannot cross bodies. */
function blendEdges(ctx: ExecutorContext, f: FeatureOf<'fillet'> | FeatureOf<'chamfer'>) {
	if (!f.edges.length) throw Error('Select at least one edge.');
	const resolved = f.edges.map((e) => ctx.resolveEdge(e));
	const bodyIds = new Set(resolved.map((r) => r.body.id));
	if (bodyIds.size !== 1) throw Error('Round or bevel edges on one body at a time.');
	const body = resolved[0].body;
	const picked = [...new Set(resolved.map((r) => r.handle))];
	return { body, handles: f.propagate ? tangentChain(ctx.k, body.solid, picked) : picked };
}
export function fillet(ctx: ExecutorContext, f: FeatureOf<'fillet'>) {
	const k = ctx.k, radius = positive(f.radius, 'radius');
	const { body, handles } = blendEdges(ctx, f);
	if (f.variable) {
		const end = positive(f.variable.end, 'radius');
		const spec = handles.map((edge) => ({ edge, law: f.variable!.law ?? 'linear', start: radius, end }));
		const sources = [...k.getSolidFaces(body.solid)];
		const solid = k.filletVariable(body.solid, JSON.stringify(spec));
		ctx.replaceBody(body, solid, { carry: carryBySurface(ctx, sources), between: 'blend' });
		return;
	}
	ctx.replaceBody(body, ctx.journal(k.filletJournaled(body.solid, new Uint32Array(handles), radius)), { between: 'blend' });
}
export function chamfer(ctx: ExecutorContext, f: FeatureOf<'chamfer'>) {
	const k = ctx.k, d1 = positive(f.distance, 'distance');
	const { body, handles } = blendEdges(ctx, f);
	if (f.angle !== undefined) {
		const angle = finite(f.angle, 'angle');
		if (!(angle > 0 && angle < 90)) throw Error('Use a chamfer angle between 0 and 90 degrees.');
		const sources = [...k.getSolidFaces(body.solid)];
		const solid = k.chamferDistanceAngle(body.solid, new Uint32Array(handles), d1, angle * Math.PI / 180);
		ctx.replaceBody(body, solid, { carry: carryBySurface(ctx, sources), between: 'bevel' });
		return;
	}
	const d2 = f.distance2 !== undefined ? positive(f.distance2, 'distance') : d1;
	ctx.replaceBody(body, ctx.journal(k.chamferJournaled(body.solid, new Uint32Array(handles), d1, d2)), { between: 'bevel' });
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
