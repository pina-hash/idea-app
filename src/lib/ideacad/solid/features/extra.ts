/**
 * THE FEATURES THAT COMPLETE FILLETS AND CHAMFERS: hole, draft, sweep, loft,
 * rib. This module is the blends-and-features surface's; the spine registers
 * every type so a document carrying one replays with an honest error rather
 * than an unknown-type crash.
 *
 * WHAT EACH ONE IS, IN KERNEL TERMS, AND WHAT WAS MEASURED (2026-09-21, the
 * pinned `remus-9307e73` build):
 *
 *   hole   a cylinder of the fit diameter (`features/holes.ts`), its axis the
 *          face normal at the given point, cut from the body with
 *          `cutJournaled`. The tool's wall and deep cap are named `<fid>.wall`
 *          and `<fid>.bottom` before the cut and carried across it. A 1/4-20
 *          tapped hole through a 4x3x1 box removed pi * 0.1005^2 * 1, exact.
 *   draft  `draftJournaled` on flat faces, pivoting about the neutral plane,
 *          angle in degrees. THE SIGN IS THE KERNEL'S: with the neutral plane
 *          at the bottom and the pull +Z, +10 degrees on the +X face of a
 *          4x3x1 box tilted it OUTWARD toward the top (volume 12 + 0.5 tan 10
 *          * 1 * 3, exact; -10 tilted it inward). Curved faces are refused by
 *          the kernel ("draft target faces must be planar") and here by name.
 *   sweep  `sweepAlongEdges`: a closed sketch region along a path that is an
 *          open chain of sketch lines and arcs, or model edges. A single
 *          straight segment is exact (measured); anything else is a curve the
 *          kernel FITS through sampled points and the result is faceted
 *          (434 planar faces on a line-plus-arc path, 2% under the analytic
 *          volume), which the feature says on its row as a warning.
 *   loft   `loft` (ruled) through one closed region per sketch, exact on a
 *          square frustum and on a circle-to-circle cone. `loftSmooth` on
 *          three profiles produced a NEGATIVE volume and failed validation
 *          in this build, so a smooth loft is attempted and then checked,
 *          and refused in words rather than shown.
 *   rib    NOT BUILT, deliberately. A rib is an open sketch extended to the
 *          body and thickened, and this kernel has no extend-to-body: doing it
 *          honestly means sectioning the body in the sketch plane and building
 *          the region between the curve and that section, which is a planar
 *          arrangement over arbitrary section curves. The executor says so.
 */
import type { ExecutorContext } from './context';
import type { FeatureOf, SketchEntity, Vec3 } from '../types';
import type { SketchState } from './context';
import { faceAnchor } from '../naming';
import { arcSweep, lift, planeFromNormal, pointOf, regionFace, type CurveEntity } from '../sketch/model';
import { add, cross, dot, scale, sub, unit, vector } from '../math';
import { carryBySurface, finite, json, ON_FACE, positive } from './core';
import { holeDiameter } from './holes';

/** A row-major rigid frame whose local +Z is `z` and whose origin is `origin`. */
function frameMatrix(origin: Vec3, z: Vec3): number[] {
	const n = unit(z), seed: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
	const u = unit(cross(seed, n)), v = cross(n, u);
	return [u[0], v[0], n[0], origin[0], u[1], v[1], n[1], origin[1], u[2], v[2], n[2], origin[2], 0, 0, 0, 1];
}
const onFace = (ctx: ExecutorContext, face: number, p: Vec3) => ctx.k.pointToFaceDistance(...p, face)[0] < ON_FACE;

export function hole(ctx: ExecutorContext, f: FeatureOf<'hole'>) {
	const k = ctx.k;
	const { body, handle } = ctx.resolveFace(f.face);
	const radius = holeDiameter(f.standard, f.fit, f.diameter) / 2;
	let point: Vec3, normal: Vec3;
	if (Array.isArray(f.center)) {
		if (k.getSurfaceType(handle) !== 'plane') throw Error('Drill into a flat face. For a curved face, add a reference point on it and drill there.');
		const plane = planeFromNormal(vector(k.getFaceNormal(handle)), faceAnchor(k, handle));
		point = lift(plane, [finite(f.center[0], 'position'), finite(f.center[1], 'position')]); normal = plane.normal;
	} else {
		const p = ctx.resolvePoint(f.center.point).point;
		const pr = k.projectPointOnSurface(handle, ...p);
		point = [pr[2], pr[3], pr[4]]; normal = unit(vector(k.evaluateSurfaceNormal(handle, pr[0], pr[1])));
	}
	const b = k.boundingBox(body.solid), diagonal = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
	const depth = f.depth === 'through' ? diagonal + 1 : positive(f.depth, 'depth');
	/* The tool starts outside the body (one diagonal above the face) so no cap lies in the face itself, and its deep cap is the hole's bottom. */
	const over = Math.max(1, diagonal);
	const tool = k.makeCylinder(radius, depth + over);
	k.transformSolid(tool, new Float64Array(frameMatrix(sub(point, scale(normal, depth)), normal)));
	for (const tf of k.getSolidFaces(tool)) {
		const kind = k.getSurfaceType(tf);
		if (kind === 'cylinder') k.setFaceName(tf, `${f.id}.wall`);
		else if (kind === 'plane' && dot(vector(k.getFaceNormal(tf)), normal) < -0.999) k.setFaceName(tf, `${f.id}.bottom`);
	}
	const toolFaces = [...k.getSolidFaces(tool)];
	const before = ctx.volume(body.solid);
	const result = ctx.journal(k.cutJournaled(body.solid, tool));
	const bottom = sub(point, scale(normal, depth));
	/* Roles name what the carrier might miss: the wall by its axis and radius, the bottom by the point it passes through. */
	const role = (face: number): string | undefined => {
		const kind = k.getSurfaceType(face), p = json(k.getAnalyticSurfaceParams(face));
		if (kind === 'cylinder' && p.axis && p.origin && Math.abs(Math.abs(dot(unit(vector(p.axis)), normal)) - 1) < 1e-6 && Math.abs((p.radius as number) - radius) < 1e-6 && Math.hypot(...cross(sub(point, vector(p.origin)), normal)) < 1e-6) return 'wall';
		if (kind === 'plane' && f.depth !== 'through' && Math.abs(Math.abs(dot(vector(k.getFaceNormal(face)), normal)) - 1) < 1e-6 && onFace(ctx, face, bottom)) return 'bottom';
		return undefined;
	};
	ctx.replaceBody(body, result, { role, carry: carryBySurface(ctx, toolFaces) });
	if (Math.abs(ctx.volume(body.solid) - before) < 1e-12 * Math.max(1, before)) throw Error('This hole does not touch the body. Move it onto the face.');
}

export function draft(ctx: ExecutorContext, f: FeatureOf<'draft'>) {
	const k = ctx.k, angle = finite(f.angle, 'angle');
	if (Math.abs(angle) < 1e-12) throw Error('Use a draft angle other than zero.');
	if (!f.faces.length) throw Error('Select at least one flat face to draft.');
	const resolved = f.faces.map((x) => ctx.resolveFace(x));
	if (new Set(resolved.map((r) => r.body.id)).size !== 1) throw Error('Draft faces on one body at a time.');
	for (const r of resolved) if (k.getSurfaceType(r.handle) !== 'plane') throw Error(`Draft flat faces. ${ctx.faceName(r.handle) ?? 'One of them'} is curved.`);
	const body = resolved[0].body;
	const pull = unit(ctx.resolveAxis(f.pull).direction), neutral = ctx.resolvePlane(f.neutral);
	if (Math.abs(dot(pull, neutral.normal)) < 0.999) ctx.warn('The neutral plane is not square to the pull direction, so the faces pivot about the plane through its origin that is square to the pull.');
	const result = ctx.journal(k.draftJournaled(body.solid, new Uint32Array(resolved.map((r) => r.handle)), new Float64Array(pull), new Float64Array(neutral.origin), angle));
	ctx.replaceBody(body, result);
}

/* ------------------------------------------------------------- sweep */
/** The curves of a sketch as ONE open chain, walked from an end, each with the direction it is traversed in. Refuses a closed, branching or scattered sketch. */
export function openChain(entities: readonly SketchEntity[]): { entity: CurveEntity; reversed: boolean }[] {
	const curves = entities.filter((e): e is CurveEntity => e.type !== 'point' && !e.construction);
	if (!curves.length) throw Error('The path sketch has no lines or arcs to follow.');
	if (curves.some((c) => c.type === 'circle')) throw Error('A path is an open chain of lines and arcs; a circle has no start or end.');
	const endsOf = (c: CurveEntity): [string, string] => (c.type === 'line' ? [c.a, c.b] : c.type === 'arc' ? [c.start, c.end] : [c.center, c.center]);
	const degree = new Map<string, number>();
	for (const c of curves) for (const p of endsOf(c)) degree.set(p, (degree.get(p) ?? 0) + 1);
	if ([...degree.values()].some((d) => d > 2)) throw Error('The path branches. Keep one chain of lines and arcs.');
	/* The chain starts at whichever free end the sketch lists first, so the direction a student drew in is the direction the sweep runs. */
	const order = (id: string) => entities.findIndex((e) => e.id === id);
	const starts = [...degree].filter(([, d]) => d === 1).map(([p]) => p).sort((a, b) => order(a) - order(b));
	if (!starts.length) throw Error('The path sketch is closed. Draw the path as an open chain of lines and arcs.');
	let at = starts[0]; const left = new Set(curves); const out: { entity: CurveEntity; reversed: boolean }[] = [];
	while (left.size) {
		const next = [...left].find((c) => endsOf(c).includes(at)); if (!next) break;
		const [a, b] = endsOf(next); const reversed = b === at;
		out.push({ entity: next, reversed }); left.delete(next); at = reversed ? a : b;
	}
	if (left.size) throw Error('The path is in more than one piece. Join the lines and arcs into one chain.');
	return out;
}
/** Kernel edges for an open chain lifted onto the sketch's plane, in walk order. */
function chainEdges(ctx: ExecutorContext, s: SketchState): { edges: number[]; end: Vec3; straight: boolean } {
	const k = ctx.k, chain = openChain(s.entities), edges: number[] = [];
	let end: Vec3 = s.plane.origin;
	for (const { entity: e, reversed } of chain) {
		if (e.type === 'line') {
			const a = lift(s.plane, pointOf(s.entities, reversed ? e.b : e.a)), b = lift(s.plane, pointOf(s.entities, reversed ? e.a : e.b));
			edges.push(k.makeLineEdge(...a, ...b)); end = b;
		} else if (e.type === 'arc') {
			const c2 = pointOf(s.entities, e.center), s2 = pointOf(s.entities, e.start), e2 = pointOf(s.entities, e.end), sweep = arcSweep(c2, s2, e2);
			const c = lift(s.plane, c2), from = lift(s.plane, s2), to = lift(s.plane, e2);
			edges.push(reversed ? k.makeCircleArc3d(...to, ...from, ...c, ...scale(s.plane.normal, -1)) : k.makeCircleArc3d(...from, ...to, ...c, ...s.plane.normal));
			end = reversed ? from : to;
		}
	}
	return { edges, end, straight: chain.length === 1 && chain[0].entity.type === 'line' };
}
/** Caps and sides for a swept or lofted solid: a cap is a planar face coplanar with a profile plane that holds that profile's edge midpoints; a side holds one of the first profile's edge midpoints on its boundary. */
function capsAndSides(ctx: ExecutorContext, solid: number, start: { plane: { origin: Vec3; normal: Vec3 }; mids: { name: string; point: Vec3 }[] }, end?: { plane: { origin: Vec3; normal: Vec3 }; mids: { name: string; point: Vec3 }[] }) {
	const k = ctx.k, capOf = new Map<number, string>();
	const coplanar = (face: number, plane: { origin: Vec3; normal: Vec3 }) => Math.abs(dot(vector(k.getFaceNormal(face)), plane.normal)) > 0.999 && Math.abs(dot(sub(faceAnchor(k, face), plane.origin), plane.normal)) < 1e-6;
	for (const face of k.getSolidFaces(solid)) {
		if (k.getSurfaceType(face) !== 'plane') continue;
		if (coplanar(face, start.plane) && start.mids.some((m) => onFace(ctx, face, m.point))) capOf.set(face, 'start');
		else if (end && coplanar(face, end.plane) && end.mids.some((m) => onFace(ctx, face, m.point))) capOf.set(face, 'end');
	}
	return (face: number): string | undefined => {
		const cap = capOf.get(face); if (cap) return cap;
		for (const m of start.mids) if (onFace(ctx, face, m.point)) return m.name;
		return undefined;
	};
}
/** A profile sketch's one closed region as a kernel face, with its edge midpoints for naming. */
function profileFace(ctx: ExecutorContext, sketchId: string, what: string) {
	const s = ctx.sketch(sketchId);
	if (!s.regions.length) throw Error(`${what} has no closed shape. Join its lines into a closed outline first.`);
	if (s.regions.length > 1) throw Error(`${what} has ${s.regions.length} closed shapes. Keep one.`);
	const { face, mids } = regionFace(ctx.k, s.entities, s.plane, s.regions[0]);
	return { s, face, mids };
}
/** Land a new solid as a body, or fuse or cut it into the target, carrying the tool's names. */
function land(ctx: ExecutorContext, f: { id: string; operation: 'new' | 'add' | 'cut'; target?: string }, solid: number, role: (face: number) => string | undefined) {
	const k = ctx.k;
	if (f.operation === 'new') { ctx.addBody(solid, { naming: { role } }); return; }
	const target = ctx.body(f.target ?? '');
	for (const tf of k.getSolidFaces(solid)) { const r = role(tf); if (r) k.setFaceName(tf, `${f.id}.${r}`); }
	const toolFaces = [...k.getSolidFaces(solid)];
	const result = ctx.journal(f.operation === 'cut' ? k.cutJournaled(target.solid, solid) : k.fuseJournaled(target.solid, solid));
	ctx.replaceBody(target, result, { carry: carryBySurface(ctx, toolFaces), role });
}

export function sweep(ctx: ExecutorContext, f: FeatureOf<'sweep'>) {
	const k = ctx.k;
	const profile = profileFace(ctx, f.profile, 'The profile sketch');
	let edges: number[], straight: boolean, end: Vec3 | undefined;
	if (typeof f.path === 'string') {
		const path = ctx.sketch(f.path);
		if (f.path === f.profile) throw Error('Pick a second sketch as the path.');
		if (path.regions.length) throw Error('The path sketch is closed. Draw the path as an open chain of lines and arcs.');
		({ edges, straight, end } = chainEdges(ctx, path));
	} else {
		if (!f.path.length) throw Error('Pick a path: an open sketch of lines and arcs, or edges of the model.');
		edges = f.path.map((e) => ctx.resolveEdge(e).handle);
		straight = edges.length === 1 && k.getEdgeCurveType(edges[0]) === 'LINE';
	}
	const solid = k.sweepAlongEdges(profile.face, new Uint32Array(edges));
	if (!straight) ctx.warn('The path has a curve or more than one segment, so this build fits a curve through it and the swept faces are faceted rather than exact.');
	const endPlane = end && straight ? { origin: end, normal: unit(sub(end, profile.s.plane.origin)) } : undefined;
	land(ctx, f, solid, capsAndSides(ctx, solid, { plane: profile.s.plane, mids: profile.mids }, endPlane ? { plane: endPlane, mids: profile.mids.map((m) => ({ name: m.name, point: add(m.point, sub(end!, profile.s.plane.origin)) })) } : undefined));
	ctx.markConsumed(f.profile);
	if (typeof f.path === 'string') ctx.markConsumed(f.path);
}

export function loft(ctx: ExecutorContext, f: FeatureOf<'loft'>) {
	const k = ctx.k;
	if (f.profiles.length < 2) throw Error('Pick at least two sketches to loft, in order from first to last.');
	if (new Set(f.profiles).size !== f.profiles.length) throw Error('Each loft profile is a different sketch.');
	const profiles = f.profiles.map((id, i) => profileFace(ctx, id, `Profile ${i + 1}`));
	/* The kernel ACCEPTS profiles with different edge counts and returns a solid that fails validation (measured: a circle to a square), so the count is checked here, in words. */
	const counts = profiles.map((p) => p.s.regions[0].outer.steps.length);
	if (new Set(counts).size !== 1) throw Error(`Each profile needs the same number of edges: a four-sided shape lofts to a four-sided shape. These have ${counts.join(', ')}.`);
	const faces = new Uint32Array(profiles.map((p) => p.face));
	let solid: number;
	try {
		if (f.smooth && profiles.length > 2) {
			solid = k.loftSmooth(faces);
			let ok = k.validateSolid(solid) === 0;
			if (ok) { try { ok = json(k.massProperties(solid)).volume > 0; } catch { ok = false; } }
			if (!ok) throw Error('A smooth loft through these profiles could not form a valid solid in this build. Turn Smooth off for a ruled loft.');
		} else solid = k.loft(faces);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/vertex|count/i.test(message)) throw Error('Each profile needs the same number of edges: a four-sided shape lofts to a four-sided shape.');
		throw error instanceof Error ? error : Error(message);
	}
	const first = profiles[0], last = profiles[profiles.length - 1];
	land(ctx, f, solid, capsAndSides(ctx, solid, { plane: first.s.plane, mids: first.mids }, { plane: last.s.plane, mids: last.mids }));
	for (const id of f.profiles) ctx.markConsumed(id);
}

export function rib(_ctx: ExecutorContext, _f: FeatureOf<'rib'>) {
	throw Error('Rib is not built in this build: the kernel cannot extend an open sketch to the body. Draw the rib as a closed shape and extrude it instead.');
}
