/**
 * THE FRC CHECKS ADD-ON: two closed-form checks an FRC student reaches for
 * while the robot is still a model, fed by the model itself.
 *
 *  - ARM HOLDING TORQUE. The torque gravity puts on a pivot is
 *    tau = m g d, d the HORIZONTAL distance from the pivot axis to the arm's
 *    center of gravity. The model supplies m, the CG and the axis (a selected
 *    shaft bore is the pivot), so the torque at the modeled pose and at the
 *    worst pose (the arm level, d the full distance from the axis to the CG)
 *    come out of the geometry. The density rule binds it exactly as it binds
 *    the CG: a printed arm has no CG here, and says so.
 *  - DRIVETRAIN FREE SPEED. v = pi D n / (60 G): D the wheel diameter, read
 *    off a selected round face; n the motor's free speed and G the gear
 *    reduction, both typed.
 *
 * BOTH ARE ESTIMATES AND SAY SO. Standard statics and kinematics with no
 * friction, no efficiency loss and no current limit -- the same standing
 * ReCalc gives its own calculators ("reference only"). Real drivetrains reach
 * a fraction of free speed. It advises and never restricts: the add-on record
 * carries no function, off by default, and nothing here touches a document.
 */
import type { Vec3 } from '../types';
import type { Addon } from './registry';

export const FRC_ADDON_ID = 'frcChecks';
export const FRC_REFERENCE = { name: 'ReCalc', url: 'https://www.reca.lc/' } as const;
/** Standard gravity, m/s². */
export const G = 9.80665;
/** N·m per in·lbf. */
export const NM_PER_IN_LBF = 0.1129848290276167;
export const M_PER_IN = 0.0254;

/**
 * The lever gravity has about an axis: the horizontal distance from the axis
 * line to the CG, measured square to the axis. It is |(r x down) . n| with r
 * from any point on the axis to the CG and n the axis direction, which is zero
 * for a vertical axis (gravity cannot turn a turntable) and the full distance
 * for a horizontal arm held level.
 */
export function gravityLeverIn(cg: Vec3, axis: { origin: Vec3; direction: Vec3 }): number {
	const l = Math.hypot(axis.direction[0], axis.direction[1], axis.direction[2]);
	if (!(l > 1e-12)) return NaN;
	const n = [axis.direction[0] / l, axis.direction[1] / l, axis.direction[2] / l];
	const r = [cg[0] - axis.origin[0], cg[1] - axis.origin[1], cg[2] - axis.origin[2]];
	/* r x (0, 0, -1) = (-r_y, r_x, 0). */
	return Math.abs(-r[1] * n[0] + r[0] * n[1]);
}
/** The worst lever over the arm's travel about a horizontal axis: the full distance from the axis to the CG. About a tilted axis, the largest horizontal lever any turn reaches is that distance times how horizontal the axis is. */
export function worstLeverIn(cg: Vec3, axis: { origin: Vec3; direction: Vec3 }): number {
	const l = Math.hypot(axis.direction[0], axis.direction[1], axis.direction[2]);
	if (!(l > 1e-12)) return NaN;
	const n = [axis.direction[0] / l, axis.direction[1] / l, axis.direction[2] / l];
	const r = [cg[0] - axis.origin[0], cg[1] - axis.origin[1], cg[2] - axis.origin[2]], t = r[0] * n[0] + r[1] * n[1] + r[2] * n[2];
	const perpendicular = Math.hypot(r[0] - t * n[0], r[1] - t * n[1], r[2] - t * n[2]);
	return perpendicular * Math.hypot(n[0], n[1]);
}
/** tau = m g d, N·m, from kg and inches. */
export const holdingTorqueNm = (massKg: number, leverIn: number) => massKg * G * leverIn * M_PER_IN;
/** v = pi D n / (60 G), ft/s, from inches, RPM and the reduction. */
export const freeSpeedFtPerS = (wheelDiameterIn: number, motorRpm: number, reduction: number) => (Math.PI * wheelDiameterIn * motorRpm) / (60 * reduction) / 12;

export const frcChecks: Addon = {
	id: FRC_ADDON_ID,
	name: 'FRC checks',
	description: "Arm holding torque and drivetrain free speed from your robot's own mass and wheels, in Analysis.",
	tools: [],
	starters: [],
	references: []
};
