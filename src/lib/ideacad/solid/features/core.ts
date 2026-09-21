/**
 * THE CORE EXECUTORS: everything the 2026-09-15 modeler could already do,
 * re-expressed as replayable features with persistent names. Every executor
 * here is a function of (context, feature) and nothing else.
 */
import type { ExecutorContext } from './context';
import type { EdgeRef, FeatureOf, Vec3, VertexRef } from '../types';
import { faceAnchor, surfaceKey } from '../naming';
import { datumPlane, regionFace, regions, solveSketch, regionOutlines } from '../sketch/model';
import { add, cross, dot, scale, sub, unit, vector } from '../math';

export const json = <T = Record<string, any>>(input: unknown): T => (typeof input === 'string' ? JSON.parse(input) : input) as T;
export const finite = (n: number, what = 'value') => { if (!Number.isFinite(n)) throw Error(`Enter a finite ${what}.`); return n; };
export const positive = (n: number, what = 'value') => { finite(n, what); if (n <= 0) throw Error(`Use a ${what} greater than zero.`); return n; };
export const ON_FACE = 1e-6;
/** The face `point` lies on, among `faces`, or none. */
function faceContaining(ctx: ExecutorContext, faces: readonly number[], point: Vec3): number | undefined {
	for (const f of faces) if (ctx.k.pointToFaceDistance(...point, f)[0] < ON_FACE) return f;
	return undefined;
}
/**
 * Names caps and sides of a swept region. Caps first, because the profile edges
 * lie on the start cap too: the start cap is the planar face COPLANAR with the
 * profile plane, the end cap the planar face parallel to `endNormal` that is
 * not; then a side is whichever face the swept edge's midpoint lies on.
 */
function sweptRoles(ctx: ExecutorContext, solid: number, prefix: string, caps: { plane?: { origin: Vec3; normal: Vec3 }; endNormal?: Vec3 }, mids: { name: string; point: Vec3 }[]) {
	const k = ctx.k;
	const capOf = new Map<number, string>();
	const onFace = (f: number) => mids.some((m) => k.pointToFaceDistance(...m.point, f)[0] < ON_FACE);
	for (const f of k.getSolidFaces(solid)) {
		if (k.getSurfaceType(f) !== 'plane') continue;
		const n = vector(k.getFaceNormal(f));
		/* A 180-degree revolve puts BOTH caps in the profile plane; only the start cap holds the profile edges. */
		if (caps.plane && Math.abs(dot(n, caps.plane.normal)) > 0.999 && Math.abs(dot(sub(faceAnchor(k, f), caps.plane.origin), caps.plane.normal)) < 1e-6 && onFace(f)) capOf.set(f, 'start');
		else if (caps.endNormal && Math.abs(dot(n, caps.endNormal)) > 0.999) capOf.set(f, 'end');
	}
	return (face: number): string | undefined => {
		const cap = capOf.get(face); if (cap) return `${prefix}${cap}`;
		for (const m of mids) if (k.pointToFaceDistance(...m.point, face)[0] < ON_FACE) return `${prefix}${m.name}`;
		return undefined;
	};
}
/** A carrier that finds, for an unnamed face, the source face with the same analytic surface. Used when a tool body's faces land in a result. */
export function carryBySurface(ctx: ExecutorContext, sources: readonly number[]) {
	const keys = new Map<string, string>();
	for (const f of sources) { const n = ctx.faceName(f); if (n) keys.set(surfaceKey(ctx.k, f), n); }
	return (face: number) => keys.get(surfaceKey(ctx.k, face));
}
/** A carrier for a copy: the source face whose transformed anchor lands on this face's anchor. */
export function carryByAnchor(ctx: ExecutorContext, sources: readonly number[], transform: (p: Vec3) => Vec3) {
	const anchors = sources.map((f) => ({ name: ctx.faceName(f), point: transform(faceAnchor(ctx.k, f)) })).filter((a) => a.name);
	return (face: number) => { const a = faceAnchor(ctx.k, face); return anchors.find((s) => Math.hypot(...sub(s.point, a)) < 1e-6 * Math.max(1, Math.hypot(...a)))?.name; };
}

export function body(ctx: ExecutorContext, f: FeatureOf<'body'>) {
	const bytes = (ctx as unknown as { artifact(hash: string): Uint8Array }).artifact(f.artifact);
	const roots = ctx.k.deserializeSolids(bytes);
	if (roots.length !== 1) throw Error('A saved body must hold exactly one solid.');
	ctx.addBody(roots[0], { id: f.bodyId, naming: {} });
}

export function sketch(ctx: ExecutorContext, f: FeatureOf<'sketch'>) {
	const plane = ctx.resolvePlane(f.plane);
	const solved = ctx.scratch(() => solveSketch(ctx.k, { entities: f.entities, constraints: f.constraints }));
	if (solved.report.classification === 'unsatisfied') ctx.warn('The sketch constraints cannot all be satisfied at once. Remove or change one of the dimensions marked in the sketch.');
	else if (solved.report.classification === 'redundant') ctx.warn('Two of the sketch constraints say the same thing. One of them can be removed.');
	ctx.setSketch({ feature: f.id, plane, entities: solved.entities, constraints: f.constraints, report: solved.report, regions: regions(solved.entities), consumed: false });
}
/** The regions a sweep uses, in a deterministic order, with a refusal when there is nothing closed. */
function regionsOf(ctx: ExecutorContext, sketchId: string, wanted?: string[]) {
	const sk = ctx.sketch(sketchId);
	const chosen = wanted ? sk.regions.filter((r) => wanted.includes(r.id)) : sk.regions;
	if (!chosen.length) throw Error('This sketch has no closed shape to use. Join the lines into a closed outline first.');
	return { sk, chosen };
}

export function extrude(ctx: ExecutorContext, f: FeatureOf<'extrude'>) {
	const k = ctx.k;
	const distance = finite(f.distance, 'distance');
	if (Math.abs(distance) < 1e-9) throw Error('Pull the sketch to give it depth.');
	const { sk, chosen } = regionsOf(ctx, f.sketch, f.regions);
	const sign = (f.direction === 'reverse' ? -1 : 1) * Math.sign(distance);
	const dir = scale(sk.plane.normal, sign);
	const both = f.direction === 'both';
	const plane = both ? { ...sk.plane, origin: sub(sk.plane.origin, scale(dir, Math.abs(distance))) } : sk.plane;
	const length = Math.abs(distance) * (both ? 2 : 1);
	const target = f.operation === 'new' ? null : ctx.body(f.target ?? '');
	chosen.forEach((region, i) => {
		const { face, mids } = regionFace(k, sk.entities, plane, region);
		const solid = k.extrude(face, ...dir, length);
		const prefix = chosen.length > 1 ? `${region.id}.` : '';
		const role = sweptRoles(ctx, solid, prefix, { plane, endNormal: dir }, mids);
		if (!target) { ctx.addBody(solid, { naming: { role } }); return; }
		/* Name the tool first, so the result can carry its faces by surface. */
		const toolNames = new Map<number, string>();
		for (const tf of k.getSolidFaces(solid)) { const r = role(tf); if (r) { k.setFaceName(tf, `${f.id}.${r}`); toolNames.set(tf, `${f.id}.${r}`); } }
		const toolFaces = [...k.getSolidFaces(solid)];
		const result = ctx.journal(f.operation === 'cut' ? k.cutJournaled(target.solid, solid) : k.fuseJournaled(target.solid, solid));
		ctx.replaceBody(target, result, { carry: carryBySurface(ctx, toolFaces), role: (face) => { const r = role(face); return r ? `${r}` : undefined; } });
	});
	ctx.markConsumed(f.sketch);
}

export function revolve(ctx: ExecutorContext, f: FeatureOf<'revolve'>) {
	const k = ctx.k;
	const signed = finite(f.angle, 'angle'), angle = Math.abs(signed);
	if (!(angle > 0 && angle <= 360)) throw Error('Use an angle between 0 and 360 degrees.');
	const { sk, chosen } = regionsOf(ctx, f.sketch);
	const resolved = ctx.resolveAxis(f.axis);
	/* A negative angle turns the other way: the axis is reversed rather than the sweep clamped. */
	const axis = signed < 0 ? { origin: resolved.origin, direction: scale(resolved.direction, -1) } : resolved;
	const target = f.operation === 'new' ? null : ctx.body(f.target ?? '');
	/* A profile crossing its own axis cannot revolve; the kernel refuses it, and this says why in the student's terms. */
	for (const region of chosen) {
		const sides = region.outer.polyline.map((p) => { const w = add(sk.plane.origin, add(scale(sk.plane.u, p[0]), scale(sk.plane.v, p[1]))); return dot(cross(axis.direction, sub(w, axis.origin)), sk.plane.normal); });
		if (sides.some((s) => s > 1e-6) && sides.some((s) => s < -1e-6)) throw Error('The sketch crosses the revolve axis. Move the axis to one side of the shape, or draw the shape on one side of the axis.');
	}
	const rotate = (p: Vec3, degrees: number): Vec3 => {
		const a = degrees * Math.PI / 180, d = unit(axis.direction), r = sub(p, axis.origin);
		const cosA = Math.cos(a), sinA = Math.sin(a);
		const out = add(add(scale(r, cosA), scale(cross(d, r), sinA)), scale(d, dot(d, r) * (1 - cosA)));
		return add(axis.origin, out);
	};
	const endNormal = sub(rotate(add(axis.origin, sk.plane.normal), angle), axis.origin);
	chosen.forEach((region) => {
		const { face, mids } = regionFace(k, sk.entities, sk.plane, region);
		const solid = k.revolve(face, ...axis.origin, ...unit(axis.direction), angle);
		const prefix = chosen.length > 1 ? `${region.id}.` : '';
		const caps = angle < 360 ? { plane: sk.plane, endNormal } : {};
		const role = sweptRoles(ctx, solid, prefix, caps, mids);
		if (!target) { ctx.addBody(solid, { naming: { role } }); return; }
		for (const tf of k.getSolidFaces(solid)) { const r = role(tf); if (r) k.setFaceName(tf, `${f.id}.${r}`); }
		const toolFaces = [...k.getSolidFaces(solid)];
		const result = ctx.journal(f.operation === 'cut' ? k.cutJournaled(target.solid, solid) : k.fuseJournaled(target.solid, solid));
		ctx.replaceBody(target, result, { carry: carryBySurface(ctx, toolFaces) });
	});
	ctx.markConsumed(f.sketch);
}

export function push(ctx: ExecutorContext, f: FeatureOf<'push'>) {
	const k = ctx.k, value = finite(f.value, 'distance');
	if (Math.abs(value) < 1e-9) return;
	const { body, handle } = ctx.resolveFace(f.face);
	const surface = json(k.getAnalyticSurfaceParams(handle));
	const solid = surface.type === 'cylinder'
		? ctx.journal(k.resizeCylindricalFaceJournaled(body.solid, handle, positive(surface.radius + value, 'radius')))
		: ctx.journal(k.moveFacesJournaled(body.solid, new Uint32Array([handle]), value));
	ctx.replaceBody(body, solid);
}

export function moveSelection(ctx: ExecutorContext, f: FeatureOf<'move-selection'>) {
	const k = ctx.k;
	f.delta.forEach((n) => finite(n, 'distance'));
	const isVertex = f.entity.faces.length >= 3;
	const { body, handle } = isVertex ? ctx.resolveVertex(f.entity as VertexRef) : ctx.resolveEdge(f.entity as EdgeRef);
	const selected = new Set<number>();
	if (isVertex) selected.add(handle);
	else {
		if (k.getEdgeCurveType(handle) !== 'LINE') throw Error('Move a straight edge, or resize its curved face.');
		const ends = k.getEdgeVertices(handle);
		for (const vertex of k.getSolidVertices(body.solid)) { const p = k.getVertexPosition(vertex); if (Math.hypot(p[0] - ends[0], p[1] - ends[1], p[2] - ends[2]) < 1e-8 || Math.hypot(p[0] - ends[3], p[1] - ends[4], p[2] - ends[5]) < 1e-8) selected.add(vertex); }
	}
	const changes: { name: string; normal: Vec3; d: number }[] = [];
	for (const face of k.getSolidFaces(body.solid)) {
		const vertices = [...k.getFaceVertices(face)]; if (!vertices.some((v) => selected.has(v))) continue;
		if (k.getSurfaceType(face) !== 'plane') throw Error('This corner meets a curved face. Move its face instead.');
		const points = vertices.map((v) => { const p = vector(k.getVertexPosition(v)); return selected.has(v) ? add(p, f.delta) : p; });
		let normal: Vec3 | undefined;
		for (let i = 1; i < points.length - 1; i++) { const n = cross(sub(points[i], points[0]), sub(points[i + 1], points[0])); if (Math.hypot(...n) > 1e-8) { normal = unit(n); break; } }
		if (!normal) throw Error('This move would collapse a face.');
		if (dot(normal, vector(k.getFaceNormal(face))) < 0) normal = scale(normal, -1);
		const d = dot(normal, points[0]); if (points.some((p) => Math.abs(dot(normal!, p) - d) > 1e-7)) throw Error('This move would bend a flat face. Move its edge or face instead.');
		const original = json(k.getAnalyticSurfaceParams(face));
		if (Math.hypot(...sub(normal, vector(original.normal))) < 1e-8 && Math.abs(d - original.d) < 1e-8) continue;
		changes.push({ name: ctx.faceName(face)!, normal, d });
	}
	for (const change of changes) {
		const faces = [...k.getSolidFaces(body.solid)].filter((face) => ctx.faceName(face) === change.name);
		if (faces.length !== 1) throw Error('The adjoining face changed. Select it again.');
		ctx.replaceBody(body, ctx.journal(k.replaceSurfaceJournaled(body.solid, faces[0], JSON.stringify({ type: 'plane', normal: change.normal, d: change.d }))));
	}
}

export function transform(ctx: ExecutorContext, f: FeatureOf<'transform'>) {
	if (f.matrix.length !== 16) throw Error('Invalid transform.');
	f.matrix.forEach((n) => finite(n));
	for (const id of f.bodies) {
		const b = ctx.body(id);
		/* A COPY, never in place: the projection cache is keyed by solid handle, and a replay that restores a checkpoint keeps the handle alive, so an in-place transform left a removed move on screen. A new handle projects afresh. Face names ride the copy. */
		ctx.replaceBody(b, ctx.k.copyAndTransformSolid(b.solid, new Float64Array(f.matrix)));
	}
}
/** The homogeneous transform of a point by a row-major 4x4 matrix. */
export const applyMatrix = (m: number[], p: Vec3): Vec3 => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
export function translation(t: Vec3): number[] { return [1, 0, 0, t[0], 0, 1, 0, t[1], 0, 0, 1, t[2], 0, 0, 0, 1]; }
export function rotationAbout(axis: { origin: Vec3; direction: Vec3 }, degrees: number): number[] {
	const d = unit(axis.direction), a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
	const r = [c + d[0] * d[0] * t, d[0] * d[1] * t - d[2] * s, d[0] * d[2] * t + d[1] * s, d[1] * d[0] * t + d[2] * s, c + d[1] * d[1] * t, d[1] * d[2] * t - d[0] * s, d[2] * d[0] * t - d[1] * s, d[2] * d[1] * t + d[0] * s, c + d[2] * d[2] * t];
	const o = axis.origin, tx = o[0] - (r[0] * o[0] + r[1] * o[1] + r[2] * o[2]), ty = o[1] - (r[3] * o[0] + r[4] * o[1] + r[5] * o[2]), tz = o[2] - (r[6] * o[0] + r[7] * o[1] + r[8] * o[2]);
	return [r[0], r[1], r[2], tx, r[3], r[4], r[5], ty, r[6], r[7], r[8], tz, 0, 0, 0, 1];
}

export function mirror(ctx: ExecutorContext, f: FeatureOf<'mirror'>) {
	const k = ctx.k, plane = ctx.resolvePlane(f.plane);
	const reflect = (p: Vec3): Vec3 => sub(p, scale(plane.normal, 2 * dot(sub(p, plane.origin), plane.normal)));
	f.bodies.forEach((id, i) => {
		const source = ctx.body(id);
		const sourceFaces = [...k.getSolidFaces(source.solid)];
		const solid = k.mirror(source.solid, ...plane.origin, ...plane.normal);
		const naming = { carry: carryByAnchor(ctx, sourceFaces, reflect) };
		if (f.merge) { for (const face of k.getSolidFaces(solid)) { const n = naming.carry(face); if (n) k.setFaceName(face, `${f.id}.m.${n}`); } ctx.replaceBody(source, ctx.journal(k.fuseJournaled(source.solid, solid))); }
		else ctx.addBody(solid, { id: `${f.id}#${i}`, naming });
	});
}

export function pattern(ctx: ExecutorContext, f: FeatureOf<'pattern'>) {
	const k = ctx.k;
	if (!Number.isSafeInteger(f.count) || f.count < 2) throw Error('A pattern needs a whole number of copies, at least two.');
	const spacing = finite(f.spacing, f.mode === 'linear' ? 'spacing' : 'angle');
	if (Math.abs(spacing) < 1e-9) throw Error(f.mode === 'linear' ? 'Give the copies some spacing.' : 'Give the copies some angle between them.');
	const source = ctx.body(f.body);
	const axis = ctx.resolveAxis(f.axis);
	const sourceFaces = [...k.getSolidFaces(source.solid)];
	for (let i = 1; i < f.count; i++) {
		const matrix = f.mode === 'linear' ? translation(scale(unit(axis.direction), spacing * i)) : rotationAbout(axis, spacing * i);
		const solid = k.copyAndTransformSolid(source.solid, new Float64Array(matrix));
		ctx.addBody(solid, { id: `${f.id}#${i - 1}`, naming: { carry: carryByAnchor(ctx, sourceFaces, (p) => applyMatrix(matrix, p)) } });
	}
}

export function boolean(ctx: ExecutorContext, f: FeatureOf<'boolean'>) {
	const k = ctx.k;
	if (f.bodies.length < 2) throw Error('Select two bodies with Shift-click.');
	const target = ctx.body(f.bodies[0]);
	for (const id of f.bodies.slice(1)) {
		const tool = ctx.body(id);
		const toolFaces = [...k.getSolidFaces(tool.solid)];
		const result = ctx.journal(f.operation === 'union' ? k.fuseJournaled(target.solid, tool.solid) : f.operation === 'subtract' ? k.cutJournaled(target.solid, tool.solid) : k.intersectJournaled(target.solid, tool.solid));
		ctx.replaceBody(target, result, { carry: carryBySurface(ctx, toolFaces) });
		ctx.removeBody(tool.id);
	}
}

export function deleteBodies(ctx: ExecutorContext, f: FeatureOf<'delete'>) {
	for (const id of f.bodies) { ctx.body(id); ctx.removeBody(id); }
}

/** The three datum planes as reference projections, for the viewport and the pickers. */
export { datumPlane, regionOutlines };
