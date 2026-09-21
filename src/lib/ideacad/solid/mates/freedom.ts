/**
 * DEGREES OF FREEDOM, NAMED. A rigid body has six; the accepted mates on it
 * leave a null space, and this module turns that null space into a count and
 * into words a student can act on: "slides along X and Y, turns about Z".
 *
 * A translation along a world axis is free when the Jacobian's column for it
 * is zero; a turn about a world axis is free when that rotation lies in the
 * projection of the null space onto the rotation coordinates (the body may
 * have to slide a little while it turns -- a spin about a cylinder's axis that
 * does not pass through the body's centre is still a turn about Z). Freedom
 * that lines up with no axis is counted, never hidden.
 */
import { norm, nullSpace, inSpan, rowRank } from './linalg';

export type Axis = 'X' | 'Y' | 'Z';
export interface Freedom {
	dof: number;
	/** How many of the free motions are pure translations. */
	translations: number;
	slides: Axis[];
	turns: Axis[];
	/** Set when other bodies were placed against this one and nothing holds it. */
	ground?: boolean;
}
const AXES: readonly Axis[] = ['X', 'Y', 'Z'];
const FREE: Freedom = { dof: 6, translations: 3, slides: [...AXES], turns: [...AXES] };
export const freeFreedom = (ground = false): Freedom => ({ ...FREE, slides: [...AXES], turns: [...AXES], ...(ground ? { ground } : {}) });

/** Rows are Jacobian rows over the twist (rotation x, y, z, translation x, y, z) about the body's own centre. */
export function freedomOf(rows: readonly (readonly number[])[], tolerance = 1e-6): Freedom {
	const kept = rows.filter((r) => norm(r) > 1e-15);
	if (!kept.length) return freeFreedom();
	const nulls = nullSpace(kept, 6, tolerance), dof = nulls.length;
	const slides = AXES.filter((_, i) => kept.every((r) => Math.abs(r[3 + i]) <= tolerance * Math.max(1, norm(r))));
	const translations = 3 - rowRank(kept.map((r) => r.slice(3)), tolerance);
	const rotations = nulls.map((v) => v.slice(0, 3));
	const turns = AXES.filter((_, i) => dof > 0 && inSpan(rotations, [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0], tolerance));
	return { dof, translations: Math.min(translations, dof), slides, turns };
}
const list = (items: readonly string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** The sentence a body's row in the mate panel carries. */
export function describeFreedom(name: string, freedom: Freedom | undefined, fixed?: boolean): string {
	if (fixed) return `${name}: fixed in place, it never moves.`;
	if (!freedom) return `${name}: not mated, free to move.`;
	if (freedom.ground) return `${name}: nothing holds it; the other bodies are placed against it.`;
	if (freedom.dof === 0) return `${name}: fully placed, 0 degrees of freedom left.`;
	const parts: string[] = [];
	const t = freedom.translations, r = freedom.dof - t;
	if (t > 0) {
		const named = freedom.slides.slice(0, t), rest = t - named.length;
		parts.push(named.length ? `slides along ${list(named)}${rest ? ` and ${plural(rest, 'other direction')}` : ''}` : `slides in ${plural(t, 'direction')}`);
	}
	if (r > 0) {
		const named = freedom.turns.slice(0, r), rest = r - named.length;
		parts.push(named.length ? `turns about ${list(named)}${rest ? ` and ${rest} other ${rest === 1 ? 'axis' : 'axes'}` : ''}` : `turns about ${r} ${r === 1 ? 'axis' : 'axes'}`);
	}
	return `${name}: ${plural(freedom.dof, 'degree')} of freedom left, ${parts.join(', ')}.`;
}
