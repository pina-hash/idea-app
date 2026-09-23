/**
 * JOINTS: mates named by what the part should DO. A student wants "this wheel
 * spins on this axle", not "a concentric mate and a coincident mate"; a joint
 * is exactly that pair of geometric mates, picked by behaviour and added as
 * one step (a `batch` command, one undo). Nothing new is solved: every joint
 * is the solver's own mate kinds, so its freedom is the solver's freedom.
 *
 *   Hinge        spins            round + round, flat + flat     1 free
 *   Slider       slides           flat + flat, flat + flat       1 free
 *   Cylindrical  spins and slides round + round                  2 free
 *   Planar       slides flat      flat + flat                    3 free
 *   Fixed        locked           round, flat, flat pairs        0 free
 *   Pin in slot  slides, spins    round + flat wall, flat + flat 2 free
 *
 * Picks are read in PAIRS, in selection order: the first pick of the first
 * pair names the part that stays, the other part moves (the solver's
 * `chooseMover` rule). A pair joins a round face or circular edge to another
 * round one or to an axis (concentric), or a flat face to a flat face or a
 * plane (coincident). A plan is VALID only when the numeric freedom of the
 * proposed mates (`proposedFreedom`, the solver's own Jacobian) matches the
 * joint's promise, so a hinge whose flat faces run along its axis (which would
 * slide, not spin) is refused in words before anything is added.
 */
import type { EntityRef, JointKind, MateKind, ModelProjection, Selection, SolidManifest } from '../types';
import { refFromSelection } from '../naming';
import { describeFreedom, type Freedom } from './freedom';
import { frameFromProjection } from './frames';
import { mateTrouble, proposedFreedom, trialSolve, type ProposedMate } from './solve';
import { selectionWords } from './words';

export type PairShape = 'round' | 'flat' | 'line' | 'tangent';
export type PickShape = PairShape | 'point' | null;
export interface JointSpec {
	word: string;
	/** What the moving part does, in two or three words. */
	does: string;
	/** Degrees of freedom the joint leaves, and how many of them are slides. */
	dof: number;
	slides: number;
	/** Pair shapes that make this joint, any order; the first listed is the one the slots show. */
	recipes: readonly (readonly PairShape[])[];
	/** A 24x24 stroke path for the tile. */
	glyph: string;
}
export const JOINT_KINDS: readonly JointKind[] = ['hinge', 'slider', 'cylindrical', 'planar', 'fixed', 'slot'];
export const JOINTS: Record<JointKind, JointSpec> = {
	hinge: { word: 'Hinge', does: 'spins', dof: 1, slides: 0, recipes: [['round', 'flat']], glyph: 'M12 4a8 8 0 1 1-7.4 5M4.6 4v5h5M12 10v4' },
	slider: { word: 'Slider', does: 'slides', dof: 1, slides: 1, recipes: [['flat', 'flat'], ['line', 'flat']], glyph: 'M3 15h18M6 11h8v8H6zM17 8l3 3-3 3' },
	cylindrical: { word: 'Cylindrical', does: 'spins, slides', dof: 2, slides: 1, recipes: [['round']], glyph: 'M8 5h8v14H8zM12 2v20M17 8l3 3-3 3' },
	planar: { word: 'Planar', does: 'slides flat', dof: 3, slides: 2, recipes: [['flat']], glyph: 'M3 17l6-6h12l-6 6zM12 6v5M9 8l3-3 3 3' },
	fixed: { word: 'Fixed', does: 'locked', dof: 0, slides: 0, recipes: [['round', 'flat', 'flat'], ['flat', 'flat', 'flat']], glyph: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2' },
	/* The pin rides one wall of the slot (a round face held its own radius off a flat one) and sits on a flat; the other wall fits when the slot is as wide as the pin. */
	slot: { word: 'Pin in slot', does: 'slides, spins', dof: 2, slides: 1, recipes: [['tangent', 'flat']], glyph: 'M3 8h18M3 16h18M7 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 12h5' }
};
/** The mate a pair of shapes becomes. */
export const PAIR_MATE: Record<PairShape, MateKind> = { round: 'concentric', flat: 'coincident', line: 'coincident', tangent: 'distance' };
export const SHAPE_WORDS: Record<PairShape, string> = { round: 'Round', flat: 'Flat', line: 'Straight', tangent: 'Pin, wall' };
type Ctx = { model: ModelProjection; manifest: SolidManifest };

/** What a pick can pair as: a round face or circular edge, a flat face or plane, a straight edge or axis, or a corner. */
export function pickShape(model: ModelProjection, s: Selection): PickShape {
	if (s.kind === 'reference') { const r = model.references.find((x) => x.feature === s.id); return r?.kind === 'plane' ? 'flat' : r?.kind === 'axis' ? 'line' : r?.kind === 'point' ? 'point' : null; }
	const body = model.bodies.find((b) => b.id === s.bodyId); if (!body) return null;
	if (s.kind === 'face') { const f = body.faces.find((x) => x.id === s.id); return f?.kind === 'plane' ? 'flat' : f && (f.kind === 'cylinder' || f.kind === 'cone') ? 'round' : null; }
	if (s.kind === 'edge') { const e = body.edges.find((x) => x.id === s.id); return e?.curve === 'CIRCLE' ? 'round' : e?.curve === 'LINE' ? 'line' : null; }
	if (s.kind === 'vertex') return 'point';
	return null;
}
/** Two picks' shapes as one pair, or null when they cannot pair. A round thing pairs with a round thing or an axis. */
export function pairShape(a: PickShape, b: PickShape): PairShape | null {
	if (a === 'flat' && b === 'flat') return 'flat';
	if ((a === 'round' && (b === 'round' || b === 'line')) || (b === 'round' && a === 'line')) return 'round';
	if (a === 'line' && b === 'line') return 'line';
	if ((a === 'round' && b === 'flat') || (a === 'flat' && b === 'round')) return 'tangent';
	return null;
}
/** A pick as the reference a mate stores. */
export function selectionRef(model: ModelProjection, s: Selection): EntityRef {
	if (s.kind === 'reference') return { kind: 'reference', feature: s.id };
	const body = model.bodies.find((b) => b.id === s.bodyId); if (!body) throw Error('Select something on a body.');
	return { kind: s.kind as 'face' | 'edge' | 'vertex', ...refFromSelection(s, body) } as EntityRef;
}
const partOf = (s: Selection) => (s.kind === 'reference' ? null : s.bodyId);
const bodyName = (ctx: Ctx, id: string | null) => (id ? ctx.model.bodies.find((b) => b.id === id)?.name ?? 'A body' : 'A reference');

export interface JointSlot { shape: PairShape; pick?: Selection; words?: string }
export interface JointPlan {
	joint: JointKind;
	/** One slot per pick the joint takes, in pair order, filled as far as the picks go. */
	slots: JointSlot[];
	/** The part that stays and the part that moves, once the first pair names both. */
	stays: string | null;
	moves: string | null;
	/** Why these picks cannot make this joint, with a way forward; null while they still can. */
	reason: string | null;
	/** Every slot is filled and the freedom matches the joint's promise. */
	ready: boolean;
	/** The mates to add, first body first, when ready. */
	mates: ProposedMate[];
	/** The freedom the proposed mates leave the moving part. */
	freedom: Freedom | null;
	/** The freedom sentence for the moving part. */
	sentence: string | null;
}
const recipeWords = (recipe: readonly PairShape[]) => recipe.map((s) => `${SHAPE_WORDS[s].toLowerCase()} to ${s === 'round' ? 'round' : SHAPE_WORDS[s].toLowerCase()}`).join(', ');
/** Does `shapes` fit inside `recipe` as a multiset? */
const fits = (shapes: readonly PairShape[], recipe: readonly PairShape[]) => { const left = [...recipe]; for (const s of shapes) { const i = left.indexOf(s); if (i < 0) return false; left.splice(i, 1); } return true; };

/** Reads the picks as a joint: which slots they fill, what is still wanted, and whether the result is the joint it claims. */
export function planJoint(ctx: Ctx, joint: JointKind, picks: readonly Selection[]): JointPlan {
	const spec = JOINTS[joint];
	/* The slots as picked so far, even when the picks are refused, so a student sees what they picked beside the reason. */
	const picked = (): JointSlot[] => { const slots: JointSlot[] = spec.recipes[0].flatMap((shape) => [{ shape }, { shape }]); picks.slice(0, 6).forEach((p, i) => { const own = pickShape(ctx.model, p); const shape = own === 'round' || own === 'flat' || own === 'line' ? own : slots[i]?.shape ?? 'flat'; slots[i] = { shape, pick: p, words: selectionWords(ctx, p) }; }); return slots; };
	const empty = (reason: string | null, slots: JointSlot[] = picked()): JointPlan => ({ joint, slots, stays: null, moves: null, reason, ready: false, mates: [], freedom: null, sentence: null });
	const shapes = picks.map((p) => pickShape(ctx.model, p));
	const bad = shapes.findIndex((s) => s === null || s === 'point');
	if (bad >= 0) return empty(`${selectionWords(ctx, picks[bad])} cannot hold a ${spec.word.toLowerCase()}. Pick a round face, a flat face or a straight edge.`);
	if (!picks.length) return empty(null);
	/* Pairs, in pick order, oriented so the first part named is always side a. */
	const pairs: { a: Selection; b?: Selection; shape: PairShape | null }[] = [];
	for (let i = 0; i < picks.length; i += 2) pairs.push({ a: picks[i], b: picks[i + 1], shape: picks[i + 1] ? pairShape(shapes[i], shapes[i + 1]) : (shapes[i] as PairShape) });
	const stays = partOf(picks[0]);
	let moves: string | null = picks[1] ? partOf(picks[1]) : null;
	if (picks[1] && stays === moves) return { ...empty(`Both picks are on ${bodyName(ctx, stays)}. Pick one on each part.`), stays };
	if (stays === null && moves === null && picks[1]) return empty('Pick at least one face on a part. Two references cannot move.');
	for (const [index, pair] of pairs.entries()) {
		if (!pair.b) continue;
		const pa = partOf(pair.a), pb = partOf(pair.b);
		if (pa === pb) return { ...empty(`Both picks of pair ${index + 1} are on ${bodyName(ctx, pa)}. Pick one on each part.`), stays, moves };
		const joins = new Set([pa, pb]);
		if (index > 0 && !(joins.has(stays) && joins.has(moves)) && !(pa === null || pb === null)) return { ...empty(`Pair ${index + 1} joins other parts. Every pair joins ${bodyName(ctx, stays)} and ${bodyName(ctx, moves)}.`), stays, moves };
		if (pa === moves || (pa === null && pb === stays)) { const t = pair.a; pair.a = pair.b; pair.b = t; }
		if (!pair.shape) return { ...empty(`A ${SHAPE_WORDS[shapes[index * 2] as PairShape].toLowerCase()} pick pairs with a ${shapes[index * 2] === 'flat' ? 'flat' : 'round'} one. Pick a matching face on ${bodyName(ctx, partOf(pair.b))}.`), stays, moves };
	}
	if (moves === null && stays !== null && picks[1]) moves = stays === partOf(picks[1]) ? null : partOf(picks[1]);
	const done = pairs.filter((p) => p.b).map((p) => p.shape as PairShape), half = pairs.find((p) => !p.b);
	/* A lone pick has no pair yet: a round one may become a round pair or a pin-on-wall pair, a flat one a flat pair or a pin-on-wall pair. */
	const halfFits = (r: readonly PairShape[]) => !half || [half.shape as PairShape, ...(half.shape === 'round' || half.shape === 'flat' ? ['tangent' as const] : [])].some((h) => fits([...done, h], r));
	const recipe = spec.recipes.find((r) => fits(done, r) && halfFits(r)) ?? null;
	if (!recipe) {
		const others = JOINT_KINDS.filter((j) => j !== joint && JOINTS[j].recipes.some((r) => fits(done, r) && halfFits(r))).map((j) => JOINTS[j].word);
		const offer = others.length ? ` These picks make a ${others.length === 1 ? others[0] : `${others.slice(0, -1).join(', ')} or ${others[others.length - 1]}`}.` : '';
		return { ...empty(`A ${spec.word.toLowerCase()} pairs ${recipeWords(spec.recipes[0])}.${offer}`), stays, moves };
	}
	/* Slots: the pairs already made, in pick order, then what the recipe still wants. */
	const left = [...recipe];
	for (const s of done) left.splice(left.indexOf(s), 1);
	if (half) { const own = half.shape as PairShape, i = left.indexOf(own); left.splice(i >= 0 ? i : left.indexOf('tangent'), 1); if (i < 0) half.shape = 'tangent'; }
	const slots: JointSlot[] = [];
	for (const p of pairs) { const shape = p.shape as PairShape; slots.push({ shape, pick: p.a, words: selectionWords(ctx, p.a) }, p.b ? { shape, pick: p.b, words: selectionWords(ctx, p.b) } : { shape }); }
	for (const shape of left) slots.push({ shape }, { shape });
	const base = { joint, slots, stays, moves, mates: [] as ProposedMate[], freedom: null, sentence: null };
	if (left.length || half) return { ...base, reason: null, ready: false };
	let mates: ProposedMate[];
	/* A pin riding a wall is a distance mate of the pin's own radius between its axis and the wall. */
	const radius = (p: { a: Selection; b?: Selection }) => { for (const s of [p.a, p.b!]) { const f = frameFromProjection(ctx.model, selectionRef(ctx.model, s)); if (f?.frame.kind === 'axis' && f.frame.radius !== undefined) return f.frame.radius; } throw Error('Pick the round face of the pin, not an axis, so its radius is known.'); };
	try { mates = pairs.map((p) => ({ kind: PAIR_MATE[p.shape as PairShape], a: selectionRef(ctx.model, p.a), b: selectionRef(ctx.model, p.b!), ...(p.shape === 'tangent' ? { value: radius(p) } : {}) })); }
	catch (error) { return { ...base, reason: error instanceof Error ? error.message : String(error), ready: false }; }
	const proposed = proposedFreedom(ctx.model, mates);
	if ('error' in proposed) return { ...base, reason: proposed.error, ready: false };
	const name = bodyName(ctx, proposed.mover), sentence = describeFreedom(name, proposed.freedom);
	if (proposed.freedom.dof !== spec.dof || proposed.freedom.translations !== spec.slides) return { ...base, freedom: proposed.freedom, sentence, reason: `Not a ${spec.word.toLowerCase()}. ${sentence} ${joint === 'hinge' ? 'Pick flat faces square to the round ones.' : 'Pick flat faces that meet at an angle.'}`, ready: false };
	/* Orientation sense: try the mates as picked, then with every round pair flipped (a pin inserted from the other side). */
	let trial = trialSolve(ctx.model, mates);
	if (trial.errors.length && mates.some((m) => m.kind === 'concentric')) {
		const flipped = mates.map((m) => (m.kind === 'concentric' ? { ...m, flip: true } : m)), again = trialSolve(ctx.model, flipped);
		if (!again.errors.length) { mates = flipped; trial = again; }
	}
	if (trial.errors.length) {
		const e = trial.errors[0], n = Number(e.feature.replace('proposed-', '')) + 1;
		const reason = mateTrouble(e.message) === 'conflict' ? `Pair ${n} cannot hold together with the others. Pick a different face for pair ${n}.` : e.message.replace(/Mate (\d+)/g, 'Pair $1');
		return { ...base, freedom: proposed.freedom, sentence, reason, ready: false };
	}
	return { ...base, mates, freedom: proposed.freedom, sentence, reason: null, ready: true };
}
/** Why one geometric mate cannot take these two picks, or null when it can. The solver's own pairing sentence. */
export function mateFit(ctx: Ctx, kind: MateKind, a: Selection, b: Selection, value?: number, flip?: boolean): string | null {
	if (partOf(a) && partOf(a) === partOf(b)) return `Both picks are on ${bodyName(ctx, partOf(a))}. Pick one on each part.`;
	if (!partOf(a) && !partOf(b)) return 'Pick at least one face on a part. Two references cannot move.';
	let refs: [EntityRef, EntityRef];
	try { refs = [selectionRef(ctx.model, a), selectionRef(ctx.model, b)]; } catch (error) { return error instanceof Error ? error.message : String(error); }
	const proposed = proposedFreedom(ctx.model, [{ kind, a: refs[0], b: refs[1], value: kind === 'distance' || kind === 'angle' ? value ?? 0 : undefined, flip }]);
	return 'error' in proposed ? proposed.error : null;
}
