/**
 * WHAT A PRESS OR A HOVER PICKS, FROM EVERYTHING UNDER THE POINTER. The
 * viewport ray-casts once and hands every hit here; this decides which ONE a
 * press takes (`best`) and lists every candidate in depth order (`all`), which
 * is what Select Other offers. The hover highlight, a press, the right-click
 * menu and Select Other all read the same answer, so what lights up under the
 * pointer is exactly what a press will take.
 *
 * PURE. A hit is a selection, a part, a distance along the ray and the point
 * it landed on; nothing here touches three.js, so the precedence is testable.
 *
 * THE PRECEDENCE, nearest-face first:
 *
 *   1. an open sketch's region lying on or in front of the nearest face
 *   2. a reference (plane, axis, point) on or in front of it, for the tools
 *      that take one
 *   3. with Alt held, the face itself
 *   4. for Fillet and Chamfer, an edge on or in front of it
 *   5. a vertex, then an edge, on or in front of it; then the face
 *   6. a Front, Top or Right plane, lowest of all: a drawing tool takes its
 *      fill, everything else only its outline and name
 *
 * WHAT A TOOL CAN TAKE NARROWS THE LIST (`allowed`), and a hit it cannot take
 * is not a candidate at all, so the press falls through to what is behind
 * it: the Hole tool never takes a sketch (it drills the face under it), a
 * drawing tool never takes an edge (it draws on the face the edge borders),
 * and the pick filter's kinds narrow it further. The nearest face still
 * hides what is behind it whether or not it can be taken.
 */
import type { EntityKind, Selection, Vec3 } from '../types';

export type PickPart = 'face' | 'edge' | 'vertex' | 'sketch' | 'reference' | 'datum';
export interface PickHit<T = unknown> {
	selection: Selection;
	part: PickPart;
	/** Distance along the ray, in world units. */
	distance: number;
	point: Vec3;
	/** For a datum plane: which part was hit. */
	datumPart?: 'fill' | 'outline' | 'label';
	/** Whatever the caller wants back with it (the three.js object). */
	object?: T;
}
export interface PickRules {
	/** The selection kinds a hit may have, or null for anything. */
	allowed: ReadonlySet<EntityKind> | null;
	/** A drawing tool is armed: a datum plane's fill takes the press. */
	drawing: boolean;
	/** Fillet or Chamfer: an edge wins over a vertex. */
	edgesFirst: boolean;
	/** A reference wins over the model under it (Reference, Revolve, Mate, Select, Measure, and drawing). */
	referencesWin: boolean;
	/** Alt held: the face itself, whatever is on it. */
	alt: boolean;
	/** How far behind the nearest face a hit may be and still count as on it, in world units. */
	epsilon: number;
}
export interface PickResult<T = unknown> { best: PickHit<T> | null; all: PickHit<T>[] }
export const selectionKey = (s: Selection) => `${s.kind}|${s.bodyId}|${s.id}`;

export function orderPicks<T>(hits: readonly PickHit<T>[], rules: PickRules): PickResult<T> {
	const sorted = [...hits].sort((a, b) => a.distance - b.distance);
	const faces = sorted.filter((h) => h.part === 'face');
	const front = faces[0]?.distance ?? Infinity;
	const ok = (h: PickHit<T>) => (rules.allowed === null || rules.allowed.has(h.selection.kind)) && (h.part !== 'datum' || rules.drawing || h.datumPart !== 'fill');
	const within = (h: PickHit<T>) => h.distance <= front + rules.epsilon;
	const first = (part: PickPart, near = true) => sorted.find((h) => h.part === part && ok(h) && (!near || within(h))) ?? null;
	let best: PickHit<T> | null = first('sketch');
	if (!best && rules.referencesWin) best = first('reference');
	if (!best && rules.alt) best = first('face', false);
	if (!best && rules.edgesFirst) best = first('edge') ?? first('face', false);
	if (!best) best = first('vertex') ?? first('edge') ?? first('face', false) ?? first('datum', false);
	/* Select Other: every distinct thing under the pointer, nearest first, including a plane's fill (a plane is a thing a student may want). */
	const all: PickHit<T>[] = [], keys = new Set<string>();
	for (const h of sorted) {
		if (rules.allowed !== null && !rules.allowed.has(h.selection.kind)) continue;
		const key = selectionKey(h.selection); if (keys.has(key)) continue;
		keys.add(key); all.push(h);
	}
	return { best, all };
}
