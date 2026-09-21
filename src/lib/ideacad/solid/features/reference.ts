/**
 * REFERENCE GEOMETRY: planes, axes and points as features, resolved against
 * the model on replay and recorded on the context for every later feature to
 * name (`ctx.resolvePlane` / `resolveAxis` / `resolvePoint` read `ctx.refs`).
 *
 * THIS MODULE IS THE REFERENCE-GEOMETRY SURFACE'S, with `ReferencePanel.svelte`
 * and `viewport/reference-layer.ts`. A new construction is a new `kind` on the
 * definition unions in `types.ts` plus one branch here.
 *
 * TWO HALVES. The EXECUTORS (`plane`, `axis`, `point`) run inside the engine on
 * replay and throw the sentence a feature row shows. The OFFERS
 * (`referenceOffers`) are pure: from the projection and the current selection
 * they answer, for every construction the panel lists, either the feature it
 * would add and the sentence naming what it makes, or the reason the selection
 * does not fit. The panel renders that list and never decides for itself, so
 * the sentence on a button and the feature the button sends cannot drift apart,
 * and both are assertable without a kernel or a mount.
 */
import type { ExecutorContext } from './context';
import type { BrepKernel } from '../../kernel/remus';
import type { AxisRef, BodyProjection, EdgeRef, FaceRef, FeatureOf, ModelProjection, PlaneRef, PointRef, ReferenceProjection, Selection, Vec3, VertexRef } from '../types';
import { faceAnchor, refFromSelection } from '../naming';
import { add, cross, dot, scale, sub, unit, vector } from '../math';
import { applyMatrix, finite, json, rotationAbout } from './core';

/* -------------------------------------------------------------------------
 * THE EXECUTORS
 * ---------------------------------------------------------------------- */

/** A plane from a PlaneRef, refusing a round face in this feature's own words rather than the sketch's. */
function planeOf(ctx: ExecutorContext, ref: PlaneRef) {
	if (ref.kind === 'face' && ctx.k.getSurfaceType(ctx.resolveFace(ref.face).handle) !== 'plane') throw Error('Pick a flat face for a plane. A round face gives an axis.');
	return ctx.resolvePlane(ref);
}
export function plane(ctx: ExecutorContext, f: FeatureOf<'plane'>) {
	const d = f.definition;
	let out;
	if (d.kind === 'offset') { const from = planeOf(ctx, d.from); out = { ...from, origin: add(from.origin, scale(from.normal, finite(d.offset, 'offset'))) }; }
	else if (d.kind === 'point-normal') { const p = ctx.resolvePoint(d.point).point, n = ctx.resolveAxis(d.normal).direction; out = planeThrough(n, p); }
	else if (d.kind === 'through-points') {
		const [a, b, c] = d.points.map((p) => ctx.resolvePoint(p).point);
		const n = cross(sub(b, a), sub(c, a)); if (Math.hypot(...n) < 1e-9) throw Error('The three points are in a line, so they do not define a plane.');
		out = planeThrough(n, a);
	}
	else if (d.kind === 'angle') { const from = planeOf(ctx, d.from), about = ctx.resolveAxis(d.about); const m = rotationAbout(about, finite(d.angle, 'angle')); const n = sub(applyMatrix(m, add(about.origin, from.normal)), applyMatrix(m, about.origin)); out = planeThrough(n, applyMatrix(m, from.origin)); }
	else { const a = planeOf(ctx, d.a), b = planeOf(ctx, d.b); if (Math.abs(dot(a.normal, b.normal)) < 0.999) throw Error('A mid plane needs two parallel planes.'); const nb = dot(a.normal, b.normal) < 0 ? scale(b.normal, -1) : b.normal; out = planeThrough(add(a.normal, nb), scale(add(a.origin, b.origin), 0.5)); }
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
		const a = planeOf(ctx, d.a), b = planeOf(ctx, d.b); const direction = cross(a.normal, b.normal); if (Math.hypot(...direction) < 1e-9) throw Error('Parallel planes do not meet in a line.');
		/* A point on both planes: solve the 2x2 in the plane spanned by the normals. */
		const n1 = a.normal, n2 = b.normal, d1 = dot(n1, a.origin), d2 = dot(n2, b.origin), n1n2 = dot(n1, n2), den = 1 - n1n2 * n1n2;
		const c1 = (d1 - d2 * n1n2) / den, c2 = (d2 - d1 * n1n2) / den;
		out = { origin: add(scale(n1, c1), scale(n2, c2)), direction: unit(direction) };
	}
	else out = { origin: ctx.resolvePoint(d.point).point, direction: unit(ctx.resolveAxis(d.direction).direction) };
	ctx.setRef({ kind: 'axis', axis: out });
}
/**
 * The area-weighted center of a face's triangles: the centroid of a flat face,
 * and a point a student reads as "the middle" of a curved one (the axis, for a
 * full cylinder). `faceAnchor` averages the face's VERTICES, which on a round
 * cap all sit on the rim, so it is an ordinal's anchor and not a center.
 */
export function faceCentroid(k: BrepKernel, face: number): Vec3 {
	const mesh = k.tessellateFace(face, 0.002, 0.15);
	try {
		const p = mesh.positions, idx = mesh.indices, c: Vec3 = [0, 0, 0];
		let total = 0;
		for (let i = 0; i + 2 < idx.length; i += 3) {
			const a = vector(p.subarray(idx[i] * 3, idx[i] * 3 + 3)), b = vector(p.subarray(idx[i + 1] * 3, idx[i + 1] * 3 + 3)), d = vector(p.subarray(idx[i + 2] * 3, idx[i + 2] * 3 + 3));
			const area = Math.hypot(...cross(sub(b, a), sub(d, a))) / 2;
			if (!(area > 0)) continue;
			total += area; c[0] += area * (a[0] + b[0] + d[0]) / 3; c[1] += area * (a[1] + b[1] + d[1]) / 3; c[2] += area * (a[2] + b[2] + d[2]) / 3;
		}
		return total > 0 ? scale(c, 1 / total) : faceAnchor(k, face);
	} finally { mesh.free(); }
}
export function point(ctx: ExecutorContext, f: FeatureOf<'point'>) {
	const d = f.definition, k = ctx.k;
	let p: Vec3;
	if (d.kind === 'coordinates') { d.point.forEach((n) => finite(n)); p = d.point; }
	else if (d.kind === 'vertex') p = vector(k.getVertexPosition(ctx.resolveVertex(d.vertex).handle));
	else if (d.kind === 'edge-midpoint') { const r = ctx.resolveEdge(d.edge); const [a, b] = k.getEdgeParamSpan(r.handle); p = vector(k.evaluateEdgeCurve(r.handle, (a + b) / 2)); }
	else if (d.kind === 'face-center') p = faceCentroid(k, ctx.resolveFace(d.face).handle);
	else if (d.kind === 'axis-plane') { const a = ctx.resolveAxis(d.axis), pl = planeOf(ctx, d.plane); const denom = dot(a.direction, pl.normal); if (Math.abs(denom) < 1e-9) throw Error('The axis runs along the plane and never meets it.'); p = add(a.origin, scale(a.direction, dot(sub(pl.origin, a.origin), pl.normal) / denom)); }
	else p = vector(json(k.massProperties(ctx.body(d.body).solid)).centerOfMass);
	ctx.setRef({ kind: 'point', point: { point: p } });
}

/* -------------------------------------------------------------------------
 * THE OFFERS: what the panel can make from what is selected
 * ---------------------------------------------------------------------- */

export type ReferenceFeature = FeatureOf<'plane'> | FeatureOf<'axis'> | FeatureOf<'point'>;
export type Datum = 'XY' | 'XZ' | 'YZ';
export type DatumAxis = 'X' | 'Y' | 'Z';
/** What the panel's own inputs hold: the datum a construction falls back to, the numbers, the typed coordinates. Numbers arrive as typed; nothing here clamps one. */
export interface ReferenceChoices { datum: Datum; axis: DatumAxis; offset: number; angle: number; coordinates: Vec3 }
export interface ReferenceOffer {
	id: string;
	kind: 'plane' | 'axis' | 'point';
	/** `selection`: made from the picked geometry; `construction`: from a picked base plus a number or a datum. */
	group: 'selection' | 'construction';
	/** The button's word. */
	title: string;
	/** In words: what this makes from the current selection, or why it cannot. */
	sentence: string;
	/** The feature to add, or null when the selection does not fit. */
	feature: ReferenceFeature | null;
}
/** A reference selection whose id is `datum:<name>` names a datum plane the viewport drew, never a feature. */
export const DATUM_SELECTION_PREFIX = 'datum:';
export const datumSelection = (datum: Datum): Selection => ({ bodyId: '', kind: 'reference', id: `${DATUM_SELECTION_PREFIX}${datum}` });
const ROUND = ['cylinder', 'cone'];
const fmt = (n: number) => `${Number(n.toFixed(4))}`;

interface Named<T> { ref: T; word: string }
/** Everything the selection names, sorted into what each construction reads. Stale selections (a body no longer on the model) are dropped. */
function picked(model: ModelProjection, selections: Selection[]) {
	const faces: { body: BodyProjection; face: BodyProjection['faces'][number]; ref: FaceRef }[] = [];
	const edges: { body: BodyProjection; edge: BodyProjection['edges'][number]; ref: EdgeRef }[] = [];
	const vertices: { body: BodyProjection; ref: VertexRef }[] = [];
	const refs: ReferenceProjection[] = [];
	const datums: Datum[] = [];
	const bodies = new Map<string, BodyProjection>();
	for (const s of selections) {
		if (s.kind === 'reference') {
			if (s.id.startsWith(DATUM_SELECTION_PREFIX)) { const d = s.id.slice(DATUM_SELECTION_PREFIX.length) as Datum; if (['XY', 'XZ', 'YZ'].includes(d) && !datums.includes(d)) datums.push(d); }
			else { const r = model.references.find((x) => x.feature === s.id); if (r && !refs.includes(r)) refs.push(r); }
			continue;
		}
		const body = model.bodies.find((b) => b.id === s.bodyId); if (!body) continue;
		bodies.set(body.id, body);
		if (s.kind === 'face') { const face = body.faces.find((f) => f.id === s.id); if (face) faces.push({ body, face, ref: refFromSelection(s, body) as FaceRef }); }
		else if (s.kind === 'edge') { const edge = body.edges.find((e) => e.id === s.id); if (edge) edges.push({ body, edge, ref: refFromSelection(s, body) as EdgeRef }); }
		else if (s.kind === 'vertex') { if (body.vertices.some((v) => v.id === s.id)) vertices.push({ body, ref: refFromSelection(s, body) as VertexRef }); }
	}
	const flat = faces.filter((f) => f.face.kind === 'plane'), round = faces.filter((f) => ROUND.includes(f.face.kind));
	const straight = edges.filter((e) => e.edge.curve === 'LINE');
	/* The bases a construction can read: every plane-like, axis-like and point-like thing selected, each with its word. */
	const planes: Named<PlaneRef>[] = [
		...flat.map((f) => ({ ref: { kind: 'face', face: f.ref } as PlaneRef, word: `the selected flat face of ${f.body.name}` })),
		...refs.filter((r) => r.kind === 'plane').map((r) => ({ ref: { kind: 'reference', feature: r.feature } as PlaneRef, word: r.name })),
		...datums.map((d) => ({ ref: { kind: 'datum', datum: d } as PlaneRef, word: `the ${d} plane` }))
	];
	const axes: Named<AxisRef>[] = [
		...refs.filter((r) => r.kind === 'axis').map((r) => ({ ref: { kind: 'reference', feature: r.feature } as AxisRef, word: r.name })),
		...straight.map((e) => ({ ref: { kind: 'edge', edge: e.ref } as AxisRef, word: `the selected straight edge of ${e.body.name}` })),
		...round.map((f) => ({ ref: { kind: 'face', face: f.ref } as AxisRef, word: `the axis of the selected round face of ${f.body.name}` }))
	];
	const points: Named<PointRef>[] = [
		...vertices.map((v) => ({ ref: { kind: 'vertex', vertex: v.ref } as PointRef, word: `the selected corner of ${v.body.name}` })),
		...refs.filter((r) => r.kind === 'point').map((r) => ({ ref: { kind: 'reference', feature: r.feature } as PointRef, word: r.name }))
	];
	return { faces, flat, round, edges, straight, vertices, refs, bodies: [...bodies.values()], planes, axes, points };
}
/**
 * Every construction the panel lists, in the order it lists them, each ready
 * or not. Pure: no kernel, no mount, so both directions of "this button is
 * offered" are assertable in a plain test against a hand-built projection.
 */
export function referenceOffers(model: ModelProjection, selections: Selection[], choices: ReferenceChoices): ReferenceOffer[] {
	const p = picked(model, selections);
	const out: ReferenceOffer[] = [];
	const offer = (id: string, kind: ReferenceOffer['kind'], group: ReferenceOffer['group'], title: string, sentence: string, definition: ReferenceFeature['definition'] | null) => {
		out.push({ id, kind, group, title, sentence, feature: definition ? ({ id: '', name: '', type: kind, definition } as ReferenceFeature) : null });
	};
	const datumPlane: Named<PlaneRef> = { ref: { kind: 'datum', datum: choices.datum }, word: `the ${choices.datum} plane` };
	const datumAxis: Named<AxisRef> = { ref: { kind: 'datum', axis: choices.axis }, word: `the ${choices.axis} axis` };
	const pointWords = (n: Named<PointRef>[]) => n.every((x) => x.ref.kind === 'vertex') ? 'corners' : n.every((x) => x.ref.kind === 'reference') ? 'points' : 'corners and points';

	/* From the selection. */
	if (p.flat.length === 1) offer('plane-face', 'plane', 'selection', 'Plane on flat face', `Plane on the selected flat face of ${p.flat[0].body.name}.`, { kind: 'offset', from: { kind: 'face', face: p.flat[0].ref }, offset: 0 });
	else offer('plane-face', 'plane', 'selection', 'Plane on flat face', p.flat.length ? `Select one flat face, not ${p.flat.length}.` : p.round.length ? 'The selected face is round. A round face gives an axis; pick a flat face for a plane.' : 'Select one flat face.', null);
	if (p.round.length === 1) offer('axis-face', 'axis', 'selection', 'Axis of round face', `Axis through the middle of the selected round face of ${p.round[0].body.name}.`, { kind: 'cylinder', face: p.round[0].ref });
	else offer('axis-face', 'axis', 'selection', 'Axis of round face', p.round.length ? `Select one round face, not ${p.round.length}.` : p.flat.length ? 'The selected face is flat. A flat face gives a plane; pick a round face (a hole or a shaft) for its axis.' : 'Select one round face (a hole or a shaft).', null);
	if (p.straight.length === 1) offer('axis-edge', 'axis', 'selection', 'Axis along edge', `Axis along the selected straight edge of ${p.straight[0].body.name}.`, { kind: 'edge', edge: p.straight[0].ref });
	else offer('axis-edge', 'axis', 'selection', 'Axis along edge', p.straight.length ? `Select one straight edge, not ${p.straight.length}.` : p.edges.length ? 'The selected edge is curved. Pick a straight edge for an axis.' : 'Select one straight edge.', null);
	if (p.points.length === 2) offer('axis-points', 'axis', 'selection', 'Axis through two points', `Axis through the two selected ${pointWords(p.points)}.`, { kind: 'two-points', a: p.points[0].ref, b: p.points[1].ref });
	else offer('axis-points', 'axis', 'selection', 'Axis through two points', `Select two corners or points (${p.points.length} selected).`, null);
	if (p.vertices.length === 1) offer('point-vertex', 'point', 'selection', 'Point at corner', `Point at the selected corner of ${p.vertices[0].body.name}.`, { kind: 'vertex', vertex: p.vertices[0].ref });
	else offer('point-vertex', 'point', 'selection', 'Point at corner', p.vertices.length ? `Select one corner, not ${p.vertices.length}.` : 'Select one corner.', null);
	if (p.edges.length === 1) offer('point-edge', 'point', 'selection', 'Point at edge middle', `Point at the middle of the selected edge of ${p.edges[0].body.name}.`, { kind: 'edge-midpoint', edge: p.edges[0].ref });
	else offer('point-edge', 'point', 'selection', 'Point at edge middle', p.edges.length ? `Select one edge, not ${p.edges.length}.` : 'Select one edge.', null);
	if (p.faces.length === 1) offer('point-face', 'point', 'selection', 'Point at face center', `Point at the center of the selected face of ${p.faces[0].body.name}.`, { kind: 'face-center', face: p.faces[0].ref });
	else offer('point-face', 'point', 'selection', 'Point at face center', p.faces.length ? `Select one face, not ${p.faces.length}.` : 'Select one face.', null);
	if (p.bodies.length === 1) offer('point-body', 'point', 'selection', 'Point at body center', `Point at the center of mass of ${p.bodies[0].name}.`, { kind: 'body-center', body: p.bodies[0].id });
	else offer('point-body', 'point', 'selection', 'Point at body center', p.bodies.length ? `Select one body, not ${p.bodies.length}.` : 'Select a body, or anything on it.', null);

	/* By construction: a picked base, or the chosen datum standing in for one. */
	const tooMany = (what: string, n: number) => `Select one ${what}, not ${n}.`;
	const base = p.planes.length === 1 ? p.planes[0] : p.planes.length === 0 ? datumPlane : null;
	const about = p.axes.length === 1 ? p.axes[0] : p.axes.length === 0 ? datumAxis : null;
	/* A typed number that is not a number is refused here in the executor's own words (`finite`), so the button never reads "NaN". Nothing else about a number is judged: the kernel's answer is the feature row's. */
	const offsetOk = Number.isFinite(choices.offset), angleOk = Number.isFinite(choices.angle), coordsOk = choices.coordinates.length === 3 && choices.coordinates.every(Number.isFinite);
	if (!base) offer('plane-offset', 'plane', 'construction', 'Offset plane', tooMany('plane or flat face to offset from', p.planes.length), null);
	else if (!offsetOk) offer('plane-offset', 'plane', 'construction', 'Offset plane', 'Enter a finite offset.', null);
	else offer('plane-offset', 'plane', 'construction', 'Offset plane', `Plane ${fmt(choices.offset)} in from ${base.word}.`, { kind: 'offset', from: base.ref, offset: choices.offset });
	if (!base || !about) offer('plane-angle', 'plane', 'construction', 'Plane at an angle', !base ? tooMany('plane or flat face to turn', p.planes.length) : tooMany('axis to turn about', p.axes.length), null);
	else if (!angleOk) offer('plane-angle', 'plane', 'construction', 'Plane at an angle', 'Enter a finite angle.', null);
	else offer('plane-angle', 'plane', 'construction', 'Plane at an angle', `Plane at ${fmt(choices.angle)}° from ${base.word}, turned about ${about.word}.`, { kind: 'angle', from: base.ref, about: about.ref, angle: choices.angle });
	const pair = p.planes.length === 2 ? [p.planes[0], p.planes[1]] : p.planes.length === 1 ? [p.planes[0], datumPlane] : null;
	if (pair) offer('plane-mid', 'plane', 'construction', 'Mid plane', `Plane midway between ${pair[0].word} and ${pair[1].word}.`, { kind: 'mid', a: pair[0].ref, b: pair[1].ref });
	else offer('plane-mid', 'plane', 'construction', 'Mid plane', p.planes.length ? `Select two planes or flat faces, not ${p.planes.length}.` : `Select two planes or flat faces, or one to pair with the ${choices.datum} plane.`, null);
	if (p.points.length === 3) offer('plane-points', 'plane', 'construction', 'Plane through three points', `Plane through the three selected ${pointWords(p.points)}.`, { kind: 'through-points', points: [p.points[0].ref, p.points[1].ref, p.points[2].ref] });
	else offer('plane-points', 'plane', 'construction', 'Plane through three points', `Select three corners or points (${p.points.length} selected).`, null);
	if (pair) offer('axis-planes', 'axis', 'construction', 'Axis where planes meet', `Axis where ${pair[0].word} meets ${pair[1].word}.`, { kind: 'plane-plane', a: pair[0].ref, b: pair[1].ref });
	else offer('axis-planes', 'axis', 'construction', 'Axis where planes meet', p.planes.length ? `Select two planes or flat faces, not ${p.planes.length}.` : `Select two planes or flat faces, or one to pair with the ${choices.datum} plane.`, null);
	if (base && about && p.planes.length + p.axes.length >= 1) offer('point-axis-plane', 'point', 'construction', 'Point where axis meets plane', `Point where ${about.word} meets ${base.word}.`, { kind: 'axis-plane', axis: about.ref, plane: base.ref });
	else offer('point-axis-plane', 'point', 'construction', 'Point where axis meets plane', !base ? tooMany('plane or flat face', p.planes.length) : !about ? tooMany('axis', p.axes.length) : `Select an axis (a straight edge, a round face or an axis) or a plane (a flat face or a plane); the ${choices.datum} plane and the ${choices.axis} axis stand in for whichever is not selected.`, null);
	offer('axis-datum', 'axis', 'construction', 'Datum axis', `Axis along the ${choices.axis} axis, through the origin.`, { kind: 'datum', axis: choices.axis });
	if (coordsOk) offer('point-coordinates', 'point', 'construction', 'Point at coordinates', `Point at ${choices.coordinates.map(fmt).join(', ')} in.`, { kind: 'coordinates', point: choices.coordinates });
	else offer('point-coordinates', 'point', 'construction', 'Point at coordinates', 'Enter x, y, z as three finite numbers.', null);
	return out;
}
