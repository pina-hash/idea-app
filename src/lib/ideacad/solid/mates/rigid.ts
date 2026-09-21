/**
 * RIGID MOTIONS FOR THE MATE SOLVER: row-major 4x4 matrices, the same shape
 * the `transform` feature stores and `ctx.k.transformSolid` takes. The
 * rotation, translation and point helpers are the executor's own
 * (`features/core.ts`), imported rather than restated, so a mate and a Move
 * agree on what a matrix means. What is added here is composition and the
 * TWIST: a small rotation `omega` (radians, axis times angle) about a point
 * plus a translation `v`, which is the six-parameter step the solver takes.
 */
import type { Vec3 } from '../types';
import { applyMatrix, rotationAbout, translation } from '../features/core';

export type Matrix = number[];
export const IDENTITY: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export { applyMatrix, rotationAbout, translation };

/** `a · b`: apply `b` first, then `a`. */
export function multiply(a: readonly number[], b: readonly number[]): Matrix {
	const out = new Array<number>(16);
	for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
	return out;
}
/** A direction under the matrix's rotation only. */
export const applyDirection = (m: readonly number[], d: Vec3): Vec3 => [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]];
export function isIdentity(m: readonly number[], tolerance = 1e-12): boolean {
	for (let i = 0; i < 16; i++) if (Math.abs(m[i] - IDENTITY[i]) > tolerance) return false;
	return true;
}
/** Translate by `v` after rotating by `omega` (axis times radians) about `center`. */
export function twistMatrix(center: Vec3, omega: Vec3, v: Vec3): Matrix {
	const angle = Math.hypot(...omega);
	const rotation = angle < 1e-15 ? [...IDENTITY] : rotationAbout({ origin: center, direction: [omega[0] / angle, omega[1] / angle, omega[2] / angle] }, angle * 180 / Math.PI);
	return multiply(translation(v), rotation);
}
/** A finite rotation (radians) about the line through `origin` along `direction`. */
export function rotationAboutLine(origin: Vec3, direction: Vec3, radians: number): Matrix {
	return Math.abs(radians) < 1e-15 ? [...IDENTITY] : rotationAbout({ origin, direction }, radians * 180 / Math.PI);
}
