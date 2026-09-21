/**
 * THE SKETCH EDITOR STATE MACHINE: what a press, a move and a release mean
 * while a sketch is open for editing, in the sketch's own 2D coordinates.
 * Pure: it takes plane coordinates and returns entity edits, so the viewport
 * only translates pointer events into (u, v) and draws what comes back.
 *
 * THIS MODULE IS THE SKETCHING SURFACE'S TO FILL. The spine version carries
 * the contract and the two operations the workspace already needs -- placing
 * a rectangle or a circle as entities, and finding what is under the cursor --
 * so the design tree can reopen a sketch and the viewport can draw it.
 */
import { newEntityId } from '../features';
import { pointOf, samples, isCurve } from './model';
import type { SketchConstraint, SketchEntity, Vec2 } from '../types';

export interface SketchDraft { entities: SketchEntity[]; constraints: SketchConstraint[] }
export type SketchTool = 'select' | 'line' | 'rectangle' | 'circle' | 'arc' | 'polygon' | 'trim' | 'extend' | 'fillet' | 'dimension';
/** What the cursor is over, with the distance it was found at. */
export interface SketchPick { entity: string; kind: SketchEntity['type']; distance: number }

/** A rectangle from two corners: four shared points, four lines, and the horizontal/vertical constraints that keep it one. */
export function rectangleEntities(a: Vec2, b: Vec2): SketchDraft {
	const p = [newEntityId(), newEntityId(), newEntityId(), newEntityId()], l = [newEntityId(), newEntityId(), newEntityId(), newEntityId()];
	return {
		entities: [
			{ id: p[0], type: 'point', x: a[0], y: a[1] }, { id: p[1], type: 'point', x: b[0], y: a[1] }, { id: p[2], type: 'point', x: b[0], y: b[1] }, { id: p[3], type: 'point', x: a[0], y: b[1] },
			{ id: l[0], type: 'line', a: p[0], b: p[1] }, { id: l[1], type: 'line', a: p[1], b: p[2] }, { id: l[2], type: 'line', a: p[2], b: p[3] }, { id: l[3], type: 'line', a: p[3], b: p[0] }
		],
		constraints: [
			{ id: newEntityId(), type: 'horizontal', line: l[0] }, { id: newEntityId(), type: 'vertical', line: l[1] },
			{ id: newEntityId(), type: 'horizontal', line: l[2] }, { id: newEntityId(), type: 'vertical', line: l[3] }
		]
	};
}
export function circleEntities(center: Vec2, radius: number): SketchDraft {
	const c = newEntityId();
	return { entities: [{ id: c, type: 'point', x: center[0], y: center[1] }, { id: newEntityId(), type: 'circle', center: c, radius }], constraints: [] };
}
/** A regular polygon: `sides` shared points and lines, first corner at `first`. */
export function polygonEntities(center: Vec2, first: Vec2, sides: number): SketchDraft {
	const n = Math.max(3, Math.floor(sides)), r = Math.hypot(first[0] - center[0], first[1] - center[1]), a0 = Math.atan2(first[1] - center[1], first[0] - center[0]);
	const points = Array.from({ length: n }, (_, i) => ({ id: newEntityId(), type: 'point' as const, x: center[0] + r * Math.cos(a0 + i * Math.PI * 2 / n), y: center[1] + r * Math.sin(a0 + i * Math.PI * 2 / n) }));
	const lines = points.map((p, i) => ({ id: newEntityId(), type: 'line' as const, a: p.id, b: points[(i + 1) % n].id }));
	return { entities: [...points, ...lines], constraints: [] };
}
/** A closed polyline from ordered corners, sharing the first point when the last returns to it. */
export function polylineEntities(corners: Vec2[]): SketchDraft {
	const points = corners.map((c) => ({ id: newEntityId(), type: 'point' as const, x: c[0], y: c[1] }));
	const lines = points.map((p, i) => ({ id: newEntityId(), type: 'line' as const, a: p.id, b: points[(i + 1) % points.length].id }));
	return { entities: [...points, ...lines], constraints: [] };
}
/** An arc and its chord from a center, a start and an end direction. */
export function arcEntities(center: Vec2, start: Vec2, towards: Vec2): SketchDraft {
	const r = Math.hypot(start[0] - center[0], start[1] - center[1]), d = Math.hypot(towards[0] - center[0], towards[1] - center[1]) || 1;
	const end: Vec2 = [center[0] + (towards[0] - center[0]) * r / d, center[1] + (towards[1] - center[1]) * r / d];
	const c = newEntityId(), s = newEntityId(), e = newEntityId();
	return { entities: [{ id: c, type: 'point', x: center[0], y: center[1] }, { id: s, type: 'point', x: start[0], y: start[1] }, { id: e, type: 'point', x: end[0], y: end[1] }, { id: newEntityId(), type: 'arc', center: c, start: s, end: e }, { id: newEntityId(), type: 'line', a: e, b: s }], constraints: [] };
}
/** Merge a draft into a sketch's entity list. */
export function appendDraft(sketch: SketchDraft, draft: SketchDraft): SketchDraft {
	return { entities: [...sketch.entities, ...draft.entities], constraints: [...sketch.constraints, ...draft.constraints] };
}
/** The nearest entity to a plane point within `radius`, points first because they are the smallest target. */
export function pickEntity(entities: readonly SketchEntity[], at: Vec2, radius: number): SketchPick | null {
	let best: SketchPick | null = null;
	const consider = (entity: string, kind: SketchEntity['type'], distance: number, weight = 1) => { const d = distance * weight; if (d <= radius && (!best || d < best.distance)) best = { entity, kind, distance: d }; };
	for (const e of entities) {
		if (e.type === 'point') { consider(e.id, 'point', Math.hypot(e.x - at[0], e.y - at[1]), 0.6); continue; }
		if (!isCurve(e)) continue;
		if (e.type === 'circle') { const c = pointOf(entities, e.center); consider(e.id, 'circle', Math.abs(Math.hypot(at[0] - c[0], at[1] - c[1]) - e.radius)); continue; }
		const pts = samples(entities, e);
		let d = Infinity;
		for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segmentDistance(pts[i], pts[i + 1], at));
		consider(e.id, e.type, d);
	}
	return best;
}
export function segmentDistance(a: Vec2, b: Vec2, p: Vec2): number {
	const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
	const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
	return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}
/** Remove an entity and everything that names it (a line's points stay; a point takes its lines and arcs). */
export function removeEntity(sketch: SketchDraft, id: string): SketchDraft {
	const gone = new Set([id]);
	for (const e of sketch.entities) if (e.type !== 'point' && Object.values(e).some((v) => typeof v === 'string' && gone.has(v)) && e.id !== id && (e.type === 'line' ? e.a === id || e.b === id : e.type === 'circle' ? e.center === id : e.center === id || e.start === id || e.end === id)) gone.add(e.id);
	const entities = sketch.entities.filter((e) => !gone.has(e.id));
	const used = new Set<string>(); for (const e of entities) if (e.type !== 'point') for (const v of Object.values(e)) if (typeof v === 'string') used.add(v);
	const kept = entities.filter((e) => e.type !== 'point' || used.has(e.id) || e.fixed);
	const ids = new Set(kept.map((e) => e.id));
	return { entities: kept, constraints: sketch.constraints.filter((c) => Object.values(c).every((v) => typeof v !== 'string' || v === c.id || v === c.type || ids.has(v))) };
}
