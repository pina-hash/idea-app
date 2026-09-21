/**
 * REFERENCE GEOMETRY: planes, axes and points as features, resolved against
 * the model on replay and recorded on the context for every later feature to
 * name (`ctx.resolvePlane` / `resolveAxis` / `resolvePoint` read `ctx.refs`).
 *
 * THIS MODULE IS THE REFERENCE-GEOMETRY SURFACE'S, with `ReferencePanel.svelte`
 * and `viewport/reference-layer.ts`. A new construction is a new `kind` on the
 * definition unions in `types.ts` plus one branch here.
 */
import type { ExecutorContext } from './context';
import type { FeatureOf, Vec3 } from '../types';
import { faceAnchor } from '../naming';
import { add, cross, dot, scale, sub, unit, vector } from '../math';
import { applyMatrix, finite, json, rotationAbout } from './core';

export function plane(ctx: ExecutorContext, f: FeatureOf<'plane'>) {
	const d = f.definition;
	let out;
	if (d.kind === 'offset') { const from = ctx.resolvePlane(d.from); out = { ...from, origin: add(from.origin, scale(from.normal, finite(d.offset, 'offset'))) }; }
	else if (d.kind === 'point-normal') { const p = ctx.resolvePoint(d.point).point, n = ctx.resolveAxis(d.normal).direction; out = planeThrough(n, p); }
	else if (d.kind === 'through-points') {
		const [a, b, c] = d.points.map((p) => ctx.resolvePoint(p).point);
		const n = cross(sub(b, a), sub(c, a)); if (Math.hypot(...n) < 1e-9) throw Error('The three points are in a line, so they do not define a plane.');
		out = planeThrough(n, a);
	}
	else if (d.kind === 'angle') { const from = ctx.resolvePlane(d.from), about = ctx.resolveAxis(d.about); const m = rotationAbout(about, finite(d.angle, 'angle')); const n = sub(applyMatrix(m, add(about.origin, from.normal)), applyMatrix(m, about.origin)); out = planeThrough(n, applyMatrix(m, from.origin)); }
	else { const a = ctx.resolvePlane(d.a), b = ctx.resolvePlane(d.b); if (Math.abs(dot(a.normal, b.normal)) < 0.999) throw Error('A mid plane needs two parallel planes.'); const nb = dot(a.normal, b.normal) < 0 ? scale(b.normal, -1) : b.normal; out = planeThrough(add(a.normal, nb), scale(add(a.origin, b.origin), 0.5)); }
	ctx.setRef({ kind: 'plane', plane: out });
}
/** A plane with a deterministic basis through a point. */
export function planeThrough(normal: Vec3, through: Vec3) {
	const n = unit(normal), seed: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0], u = unit(cross(seed, n));
	return { origin: through, u, v: cross(n, u), normal: n };
}
export function axis(ctx: ExecutorContext, f: FeatureOf<'axis'>) {
	const d = f.definition, k = ctx.k;
	let out;
	if (d.kind === 'datum') out = { origin: [0, 0, 0] as Vec3, direction: ({ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] } as Record<string, Vec3>)[d.axis] };
	else if (d.kind === 'two-points') { const a = ctx.resolvePoint(d.a).point, b = ctx.resolvePoint(d.b).point; if (Math.hypot(...sub(b, a)) < 1e-9) throw Error('Pick two different points for the axis.'); out = { origin: a, direction: unit(sub(b, a)) }; }
	else if (d.kind === 'cylinder') { const r = ctx.resolveFace(d.face); const p = json(k.getAnalyticSurfaceParams(r.handle)); if (p.type !== 'cylinder' && p.type !== 'cone') throw Error('Pick a round face; its axis is the axis.'); out = { origin: vector(p.origin), direction: unit(vector(p.axis)) }; }
	else if (d.kind === 'edge') { const r = ctx.resolveEdge(d.edge); if (k.getEdgeCurveType(r.handle) !== 'LINE') throw Error('Pick a straight edge for the axis.'); const e = k.getEdgeVertices(r.handle); out = { origin: [e[0], e[1], e[2]] as Vec3, direction: unit([e[3] - e[0], e[4] - e[1], e[5] - e[2]]) }; }
	else if (d.kind === 'plane-plane') {
		const a = ctx.resolvePlane(d.a), b = ctx.resolvePlane(d.b); const direction = cross(a.normal, b.normal); if (Math.hypot(...direction) < 1e-9) throw Error('Parallel planes do not meet in a line.');
		/* A point on both planes: solve the 2x2 in the plane spanned by the normals. */
		const n1 = a.normal, n2 = b.normal, d1 = dot(n1, a.origin), d2 = dot(n2, b.origin), n1n2 = dot(n1, n2), den = 1 - n1n2 * n1n2;
		const c1 = (d1 - d2 * n1n2) / den, c2 = (d2 - d1 * n1n2) / den;
		out = { origin: add(scale(n1, c1), scale(n2, c2)), direction: unit(direction) };
	}
	else out = { origin: ctx.resolvePoint(d.point).point, direction: unit(ctx.resolveAxis(d.direction).direction) };
	ctx.setRef({ kind: 'axis', axis: out });
}
export function point(ctx: ExecutorContext, f: FeatureOf<'point'>) {
	const d = f.definition, k = ctx.k;
	let p: Vec3;
	if (d.kind === 'coordinates') { d.point.forEach((n) => finite(n)); p = d.point; }
	else if (d.kind === 'vertex') p = vector(k.getVertexPosition(ctx.resolveVertex(d.vertex).handle));
	else if (d.kind === 'edge-midpoint') { const r = ctx.resolveEdge(d.edge); const [a, b] = k.getEdgeParamSpan(r.handle); p = vector(k.evaluateEdgeCurve(r.handle, (a + b) / 2)); }
	else if (d.kind === 'face-center') p = faceAnchor(k, ctx.resolveFace(d.face).handle);
	else if (d.kind === 'axis-plane') { const a = ctx.resolveAxis(d.axis), pl = ctx.resolvePlane(d.plane); const denom = dot(a.direction, pl.normal); if (Math.abs(denom) < 1e-9) throw Error('The axis runs along the plane and never meets it.'); p = add(a.origin, scale(a.direction, dot(sub(pl.origin, a.origin), pl.normal) / denom)); }
	else p = vector(json(k.massProperties(ctx.body(d.body).solid)).centerOfMass);
	ctx.setRef({ kind: 'point', point: { point: p } });
}

