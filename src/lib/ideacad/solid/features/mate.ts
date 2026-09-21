/**
 * MATES. The executor records the mate and the assembly solve moves bodies to
 * satisfy every active mate in tree order after the features have replayed.
 * The solver is `solveMates`; the executor only validates and records.
 *
 * THE SOLVE IS PURE AND THE KERNEL IS TOUCHED TWICE. `mates/solve.ts` takes
 * the bodies' centres and every mate's two entity frames as they stand after
 * replay (the kernel restored to its last checkpoint, so every body is where
 * its features left it and never where the previous solve moved it), and
 * answers with one rigid transform per body that moves. This module reads the
 * frames off the kernel through the context's own resolvers -- a lost or
 * ambiguous reference is that resolver's sentence, reported on the mate's row
 * -- applies each transform with `transformSolid` in place, and hands the
 * body back through `ctx.replaceBody` so the engine's projection cache for
 * that solid handle is dropped: an in-place transform keeps the handle, and a
 * cache keyed by handle would otherwise draw the body where it used to be.
 *
 * WHAT COMES BACK is what the engine reads (`moved`, `errors`, `dof`,
 * `residuals`) plus what the mate panel reads once the engine projects it:
 * `freedom` (the named degrees of freedom per body), `units` (inches or
 * degrees per residual) and `ms` (solver time per mate).
 */
import type { ExecutorContext, LiveBody, MateState } from './context';
import type { EntityRef, FeatureOf, MateKind } from '../types';
import { faceAnchor, lostReference } from '../naming';
import { unit, vector } from '../math';
import { json } from './core';
import { axisFrame, boundsCenter, circleThrough, frameFromSurface, lineFrame, planeFrame, pointFrame, type EntityFrame } from '../mates/frames';
import { solveAssembly, type MateSide } from '../mates/solve';
import type { Freedom } from '../mates/freedom';

export const MATE_KINDS: readonly MateKind[] = ['coincident', 'concentric', 'parallel', 'perpendicular', 'distance', 'angle'];
/** The word each kind carries on a control. */
export const MATE_WORDS: Record<MateKind, string> = { coincident: 'Coincident', concentric: 'Concentric', parallel: 'Parallel', perpendicular: 'Perpendicular', distance: 'Distance', angle: 'Angle' };

export function mate(ctx: ExecutorContext, f: FeatureOf<'mate'>) {
	if (!MATE_KINDS.includes(f.kind)) throw Error('Choose a mate kind.');
	if ((f.kind === 'distance' || f.kind === 'angle') && !Number.isFinite(f.value ?? NaN)) throw Error(`Enter a ${f.kind} for this mate.`);
	if (f.a.kind === 'body' || f.b.kind === 'body') throw Error('Mate a face, edge, corner or reference, not a whole body.');
	const bodyOf = (r: typeof f.a) => (r.kind === 'reference' || r.kind === 'sketch-entity' ? null : r.body);
	const a = bodyOf(f.a), b = bodyOf(f.b);
	if (a && b && a === b) throw Error('Mate two different bodies.');
	if (a) ctx.body(a); if (b) ctx.body(b);
	ctx.setMate({ feature: f.id, kind: f.kind, a: f.a, b: f.b, value: f.value, flip: f.flip, residual: 0 });
}

export interface MateSolveResult {
	moved: string[];
	errors: { feature: string; message: string }[];
	dof: Map<string, number>;
	residuals: Map<string, number>;
	/** Named freedom per mated body: what `dof` counts, in words the panel can show. Optional so the engine's empty report needs no change. */
	freedom?: Map<string, Freedom>;
	units?: Map<string, 'in' | 'deg'>;
	/** Solver time per mate, milliseconds. */
	ms?: Map<string, number>;
}
const EMPTY = (): MateSolveResult => ({ moved: [], errors: [], dof: new Map(), residuals: new Map(), freedom: new Map(), units: new Map(), ms: new Map() });
/**
 * THE SOLIDS THE PREVIOUS SOLVE MOVED, per kernel. The engine restores the
 * kernel to a checkpoint taken BEFORE the mates moved anything and keeps its
 * projection cache keyed by solid handle, which the restore does not change --
 * so a body moved last time and not this time (its mate deleted, suppressed,
 * or now moving the other body) would be drawn where it no longer is. Dropping
 * those entries through `ctx.replaceBody` is this module's own guard until the
 * engine invalidates on restore (requested in the surface's report); once it
 * does, this is one redundant cache miss per moved body and nothing else.
 */
const previouslyMoved = new WeakMap<object, Set<number>>();

/** The frame of a kernel face: a flat face by its outward normal and anchor, a round one by its axis. */
export function faceFrame(ctx: ExecutorContext, handle: number): EntityFrame {
	const k = ctx.k, type = k.getSurfaceType(handle);
	return frameFromSurface(type, json(k.getAnalyticSurfaceParams(handle)), faceAnchor(k, handle), type === 'plane' ? vector(k.getFaceNormal(handle)) : undefined);
}
/** The frame of a kernel edge: a line by its ends, a circle by three points along it. */
export function edgeFrame(ctx: ExecutorContext, handle: number): EntityFrame {
	const k = ctx.k, curve = k.getEdgeCurveType(handle);
	if (curve === 'LINE') { const e = k.getEdgeVertices(handle); return lineFrame([e[0], e[1], e[2]], [e[3], e[4], e[5]]); }
	if (curve === 'CIRCLE') {
		const [t0, t1] = k.getEdgeParamSpan(handle), span = t1 - t0;
		const c = circleThrough(vector(k.evaluateEdgeCurve(handle, t0)), vector(k.evaluateEdgeCurve(handle, t0 + span / 3)), vector(k.evaluateEdgeCurve(handle, t0 + (2 * span) / 3)));
		return axisFrame(c.center, c.normal, c.radius);
	}
	throw Error('Mate a straight or circular edge.');
}
/** One side of a mate, resolved against the live model, or the sentence that says why it could not be. */
function side(ctx: ExecutorContext, ref: EntityRef): MateSide {
	try {
		if (ref.kind === 'body') return { error: 'Mate a face, edge, corner or reference, not a whole body.' };
		if (ref.kind === 'sketch-entity') return { error: 'Mate a face, an edge, a corner or reference geometry, not a sketch entity.' };
		if (ref.kind === 'reference') {
			const r = ctx.refs.get(ref.feature);
			const name = ctx.manifest.features.find((f) => f.id === ref.feature)?.name ?? ref.feature;
			if (!r) return { error: lostReference('plane', name) };
			if (r.kind === 'plane') return { body: null, frame: planeFrame(r.plane.origin, r.plane.normal) };
			if (r.kind === 'axis') return { body: null, frame: axisFrame(r.axis.origin, unit(r.axis.direction)) };
			return { body: null, frame: pointFrame(r.point.point) };
		}
		if (ref.kind === 'face') { const { body, handle } = ctx.resolveFace(ref); return { body: body.id, frame: faceFrame(ctx, handle) }; }
		if (ref.kind === 'edge') { const { body, handle } = ctx.resolveEdge(ref); return { body: body.id, frame: edgeFrame(ctx, handle) }; }
		const { body, handle } = ctx.resolveVertex(ref); return { body: body.id, frame: pointFrame(vector(ctx.k.getVertexPosition(handle))) };
	} catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}

/**
 * Moves bodies so every mate holds, in tree order (`mates/solve.ts` states the
 * rules). A body with `fixed` set never moves; every moved body is returned in
 * `moved` and re-registered through `ctx.replaceBody`.
 */
export function solveMates(ctx: ExecutorContext, bodies: Map<string, LiveBody>): MateSolveResult {
	const k = ctx.k;
	const stale = previouslyMoved.get(k) ?? new Set<number>();
	for (const body of bodies.values()) if (stale.has(body.solid)) ctx.replaceBody(body, body.solid);
	previouslyMoved.set(k, new Set());
	if (!ctx.mates.length) return EMPTY();
	const record = (id: string) => ctx.manifest.bodies.find((b) => b.id === id);
	const nameOf = (id: string) => ctx.manifest.features.find((f) => f.id === id)?.name ?? id;
	const result = solveAssembly({
		bodies: [...bodies.values()].map((b) => ({ id: b.id, name: record(b.id)?.name ?? b.id, fixed: !!record(b.id)?.fixed, center: boundsCenter([...k.boundingBox(b.solid)]) })),
		mates: ctx.mates.map((m: MateState) => ({ feature: m.feature, name: nameOf(m.feature), kind: m.kind, value: m.value, flip: m.flip, a: side(ctx, m.a), b: side(ctx, m.b) }))
	});
	for (const [id, matrix] of result.transforms) {
		const body = bodies.get(id); if (!body) continue;
		k.transformSolid(body.solid, new Float64Array(matrix));
		ctx.replaceBody(body, body.solid);
		previouslyMoved.get(k)!.add(body.solid);
	}
	return { moved: result.moved, errors: result.errors, dof: result.dof, residuals: result.residuals, freedom: result.freedom, units: result.units, ms: result.ms };
}
