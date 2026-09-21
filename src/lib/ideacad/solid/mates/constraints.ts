/**
 * WHAT EACH MATE KIND MEANS, AS A RESIDUAL: a vector that is zero exactly when
 * the mate holds, written over two entity frames in their STORED order (`a`
 * then `b`) so the meaning of a mate never depends on which body the solver
 * happened to move. The solver differentiates these numerically; the panel
 * reads `residualReport` for the one number a row shows.
 *
 * Orientation targets carry a SIGN. Two flat faces mate outside-to-outside
 * (normals opposed) unless the mate is flipped; a parallel or concentric pair
 * keeps whichever sense it was closer to when the mate was solved, unless
 * flipped -- so adding a mate never turns a part over unasked. The sign is
 * decided once per solve (`orientationSign`) before anything moves.
 */
import type { MateKind, Vec3 } from '../types';
import { dot, scale, sub } from '../math';
import { frameDirection, frameOrigin, type EntityFrame } from './frames';

export type Sign = 1 | -1;
/** The component of `w` perpendicular to the unit direction `d`. */
export const perpendicular = (w: Vec3, d: Vec3): Vec3 => sub(w, scale(d, dot(w, d)));
export const degreesBetween = (a: Vec3, b: Vec3) => (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180) / Math.PI;

export function orientationSign(kind: MateKind, a: EntityFrame, b: EntityFrame, flip?: boolean): Sign {
	const da = frameDirection(a), db = frameDirection(b);
	const closest: Sign = da && db && dot(da, db) < 0 ? -1 : 1;
	let sign: Sign;
	if ((kind === 'coincident' || kind === 'distance') && a.kind === 'plane' && b.kind === 'plane') sign = -1;
	else if (kind === 'angle') sign = 1;
	else sign = closest;
	return flip ? ((-sign) as Sign) : sign;
}
export function pairingError(kind: MateKind): string {
	switch (kind) {
		case 'coincident': return 'A coincident mate needs two flat faces, a corner and a face, two corners, two straight edges or round faces, or an edge lying in a face.';
		case 'concentric': return 'A concentric mate needs two round faces or circular edges.';
		case 'distance': return 'A distance mate needs two flat faces, a corner and a flat face, two corners, or two round faces or edges.';
		case 'angle': return 'An angle mate needs two flat faces, two round faces or two edges. A corner has no direction.';
		default: return `A ${kind} mate needs two flat faces, two round faces or two edges. A corner has no direction.`;
	}
}
interface Parts { orientation: number[]; position: number[] }
function parts(kind: MateKind, a: EntityFrame, b: EntityFrame, value: number | undefined, sign: Sign): Parts | null {
	const da = frameDirection(a), db = frameDirection(b), pa = frameOrigin(a), pb = frameOrigin(b);
	/** `v - s u`: zero when `v` runs along `u` in the chosen sense. */
	const along = (u: Vec3, v: Vec3) => sub(v, scale(u, sign));
	const plane = (x: EntityFrame) => x.kind === 'plane', axis = (x: EntityFrame) => x.kind === 'axis', point = (x: EntityFrame) => x.kind === 'point';
	switch (kind) {
		case 'coincident':
			if (plane(a) && plane(b)) return { orientation: along(da!, db!), position: [dot(sub(pb, pa), da!)] };
			if (point(a) && plane(b)) return { orientation: [], position: [dot(sub(pa, pb), db!)] };
			if (plane(a) && point(b)) return { orientation: [], position: [dot(sub(pb, pa), da!)] };
			if (point(a) && point(b)) return { orientation: [], position: sub(pb, pa) };
			if (axis(a) && axis(b)) return { orientation: along(da!, db!), position: perpendicular(sub(pb, pa), da!) };
			if (axis(a) && plane(b)) return { orientation: [dot(da!, db!)], position: [dot(sub(pa, pb), db!)] };
			if (plane(a) && axis(b)) return { orientation: [dot(da!, db!)], position: [dot(sub(pb, pa), da!)] };
			if (point(a) && axis(b)) return { orientation: [], position: perpendicular(sub(pa, pb), db!) };
			if (axis(a) && point(b)) return { orientation: [], position: perpendicular(sub(pb, pa), da!) };
			return null;
		case 'concentric':
			if (axis(a) && axis(b)) return { orientation: along(da!, db!), position: perpendicular(sub(pb, pa), da!) };
			if (point(a) && axis(b)) return { orientation: [], position: perpendicular(sub(pa, pb), db!) };
			if (axis(a) && point(b)) return { orientation: [], position: perpendicular(sub(pb, pa), da!) };
			return null;
		case 'parallel':
			if (!da || !db) return null;
			return { orientation: a.kind === b.kind ? along(da, db) : [dot(da, db)], position: [] };
		case 'perpendicular':
			if (!da || !db) return null;
			return { orientation: a.kind === b.kind ? [dot(da, db)] : along(da, db), position: [] };
		case 'distance': {
			const v = value ?? 0;
			if (plane(a) && plane(b)) return { orientation: along(da!, db!), position: [dot(sub(pb, pa), da!) - v] };
			if (point(a) && plane(b)) return { orientation: [], position: [dot(sub(pa, pb), db!) - v] };
			if (plane(a) && point(b)) return { orientation: [], position: [dot(sub(pb, pa), da!) - v] };
			if (point(a) && point(b)) return { orientation: [], position: [Math.hypot(...sub(pb, pa)) - v] };
			if (axis(a) && axis(b)) return { orientation: along(da!, db!), position: [Math.hypot(...perpendicular(sub(pb, pa), da!)) - v] };
			if (axis(a) && plane(b)) return { orientation: [dot(da!, db!)], position: [dot(sub(pa, pb), db!) - v] };
			if (plane(a) && axis(b)) return { orientation: [dot(da!, db!)], position: [dot(sub(pb, pa), da!) - v] };
			return null;
		}
		case 'angle': {
			if (!da || !db) return null;
			const radians = ((value ?? 0) * Math.PI) / 180, c = Math.cos(radians);
			/* 0 or 180 degrees is a parallel mate in the sense the angle implies; the dot form has no gradient there. */
			if (Math.abs(Math.sin(radians)) < 1e-9) return { orientation: sub(db, scale(da, sign * (c < 0 ? -1 : 1))), position: [] };
			return { orientation: [dot(da, scale(db, sign)) - c], position: [] };
		}
	}
}
/** The residual of one mate: zero when it holds. Throws the pairing sentence when these two entities cannot take this kind. */
export function residual(kind: MateKind, a: EntityFrame, b: EntityFrame, value: number | undefined, sign: Sign): number[] {
	const p = parts(kind, a, b, value, sign);
	if (!p) throw Error(pairingError(kind));
	return [...p.orientation, ...p.position];
}
export const residualUnit = (kind: MateKind): 'in' | 'deg' => (kind === 'parallel' || kind === 'perpendicular' || kind === 'angle' ? 'deg' : 'in');
/** The one number a mate row shows: how far off it is, in inches for a positional mate and in degrees for an angular one. */
export function residualReport(kind: MateKind, a: EntityFrame, b: EntityFrame, value: number | undefined, sign: Sign): number {
	const p = parts(kind, a, b, value, sign);
	if (!p) return NaN;
	const da = frameDirection(a), db = frameDirection(b);
	if (residualUnit(kind) === 'deg' && da && db) {
		if (kind === 'angle') return Math.abs(degreesBetween(da, scale(db, sign)) - (value ?? 0));
		const same = a.kind === b.kind;
		if (kind === 'parallel') return same ? degreesBetween(scale(da, sign), db) : Math.abs(90 - degreesBetween(da, db));
		return same ? Math.abs(90 - degreesBetween(da, db)) : degreesBetween(scale(da, sign), db);
	}
	if (p.position.length) return Math.max(...p.position.map(Math.abs));
	/* No positional rows: the misalignment, as the chord of the angle between the two directions. */
	return Math.max(0, ...p.orientation.map(Math.abs));
}
