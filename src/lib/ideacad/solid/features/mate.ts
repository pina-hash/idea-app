/**
 * MATES. The executor records the mate and the assembly solve moves bodies to
 * satisfy every active mate in tree order after the features have replayed.
 * The solver is `solveMates`; the executor only validates and records.
 *
 * THIS MODULE IS THE MATE SURFACE'S TO FILL. What the spine guarantees: a mate
 * feature replays, appears in the tree and the projection, and reports an
 * error rather than moving anything until `solveMates` implements its kind.
 */
import type { ExecutorContext, LiveBody, MateState } from './context';
import type { FeatureOf, MateKind } from '../types';

export const MATE_KINDS: readonly MateKind[] = ['coincident', 'concentric', 'parallel', 'perpendicular', 'distance', 'angle'];

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

export interface MateSolveResult { moved: string[]; errors: { feature: string; message: string }[]; dof: Map<string, number>; residuals: Map<string, number> }
/**
 * Moves bodies so every mate holds, in tree order. Until the mate surface
 * ships this, every mate is reported as not yet solvable and nothing moves --
 * an honest error in the tree rather than a body that snaps somewhere wrong.
 */
export function solveMates(ctx: ExecutorContext, _bodies: Map<string, LiveBody>): MateSolveResult {
	const errors = ctx.mates.map((m: MateState) => ({ feature: m.feature, message: 'Mates are recorded but not solved yet in this build.' }));
	return { moved: [], errors, dof: new Map(), residuals: new Map() };
}
