/**
 * MOVE WITHIN FREEDOM. A drag on a mated body is a request: a translation and
 * a rotation. The body may only take the part of it the accepted mates leave
 * free, which is the null space of their Jacobian rows over the twist about
 * the body's own centre (`mates/freedom.ts` counts the same space). This module
 * projects the request onto that space and answers the motion the body can
 * really take, as the row-major 4x4 the `transform` feature stores.
 *
 * UNITS. A twist mixes radians and inches, so a projection over the raw six
 * numbers would weigh a turn against a slide by an accident of units. The
 * rotation half is scaled by `length` (the body's size, in inches) before the
 * projection and scaled back after, so a quarter turn of a 2 inch part counts
 * like a slide of about 3 inches. A pin whose free motions line up with its
 * axis (slide along it, turn about it) projects exactly at any `length`.
 *
 * Pure: no kernel, no projection. `moveWithinFreedom` reads the rows off a
 * model through `holdOf`, which uses the solver's own `chooseMover`.
 */
import type { ModelProjection, Vec3 } from '../types';
import { add, cross, scale, sub } from '../math';
import { nullSpace, norm } from './linalg';
import { IDENTITY, twistMatrix, type Matrix } from './rigid';
import { holdOf } from './solve';

export interface MotionRequest {
	/** Inches, world axes. */
	translation?: Vec3;
	/** A rotation of `angle` radians about the line through `pivot` (the body centre when absent) along `axis`. */
	rotation?: { axis: Vec3; angle: number; pivot?: Vec3 };
}
export interface Motion {
	/** The twist the body takes, about its centre: `omega` radians (axis times angle), `v` inches. */
	omega: Vec3;
	v: Vec3;
	/** The same motion as a row-major 4x4. */
	matrix: Matrix;
	/** How many degrees of freedom the body had to move in. */
	dof: number;
	/** True when nothing of the request survived: the mates hold the body against every part of it. */
	held: boolean;
}
const TOLERANCE = 1e-9;
/** The request as a twist about `center`: a turn about a pivot elsewhere also carries the centre along. */
export function requestTwist(center: Vec3, request: MotionRequest): { omega: Vec3; v: Vec3 } {
	const t = request.translation ?? [0, 0, 0];
	if (!request.rotation || !Number.isFinite(request.rotation.angle) || norm(request.rotation.axis) < 1e-15) return { omega: [0, 0, 0], v: [...t] as Vec3 };
	const { axis, angle } = request.rotation, n = norm(axis), omega = scale(axis, angle / n);
	const pivot = request.rotation.pivot ?? center;
	return { omega, v: add(t, cross(omega, sub(center, pivot))) };
}
/**
 * Projects a requested motion onto the null space of `rows` (the Jacobian of
 * the mates holding the body, over the twist about `center`). With no rows the
 * body is free and moves as asked; with a full-rank set it does not move.
 */
export function projectMotion(rows: readonly (readonly number[])[], center: Vec3, request: MotionRequest, length = 1): Motion {
	const L = Number.isFinite(length) && length > 1e-9 ? length : 1;
	const { omega, v } = requestTwist(center, request);
	/* Rows are over (omega, v); scaling omega by L makes the column scale 1/L. */
	const scaled = rows.map((r) => [r[0] / L, r[1] / L, r[2] / L, r[3], r[4], r[5]]);
	const basis = rows.length ? nullSpace(scaled, 6, 1e-6) : [[1, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0], [0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 1]];
	const want = [omega[0] * L, omega[1] * L, omega[2] * L, v[0], v[1], v[2]];
	const out = [0, 0, 0, 0, 0, 0];
	for (const b of basis) { const c = b.reduce((sum, x, i) => sum + x * want[i], 0); for (let i = 0; i < 6; i++) out[i] += c * b[i]; }
	const o: Vec3 = [out[0] / L, out[1] / L, out[2] / L], w: Vec3 = [out[3], out[4], out[5]];
	const held = norm(out) <= TOLERANCE * Math.max(1, norm(want));
	return { omega: held ? [0, 0, 0] : o, v: held ? [0, 0, 0] : w, matrix: held ? [...IDENTITY] : twistMatrix(center, o, w), dof: basis.length, held };
}
/**
 * The motion `bodyId` can take for this request, given the model's accepted
 * mates. A fixed body never moves. A body nothing holds (unmated, or only the
 * anchor others were placed against) moves as asked; the bodies mated to an
 * anchor follow it on the next solve.
 */
export function moveWithinFreedom(model: ModelProjection, bodyId: string, request: MotionRequest): Motion {
	const hold = holdOf(model, bodyId);
	const body = model.bodies.find((b) => b.id === bodyId);
	const bounds = body?.bounds ?? [0, 0, 0, 1, 1, 1];
	const length = Math.max(1e-6, Math.hypot(bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]) / 2);
	const center: Vec3 = hold?.center ?? [(bounds[0] + bounds[3]) / 2, (bounds[1] + bounds[4]) / 2, (bounds[2] + bounds[5]) / 2];
	if (hold?.fixed) return { omega: [0, 0, 0], v: [0, 0, 0], matrix: [...IDENTITY], dof: 0, held: true };
	return projectMotion(hold?.rows ?? [], center, request, length);
}
