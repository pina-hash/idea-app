/**
 * MASS AND BALANCE, READ OFF THE PROJECTION. Pure: no kernel, no DOM, no
 * worker. Every number here comes from what `engine.ts project()` already
 * hands every panel -- each body's volume, its center of mass, and its inertia
 * tensor -- multiplied by a density only when `bodyMass` (`advisory.ts`) says
 * the density is cited. THE DENSITY RULE IS NOT RESTATED HERE: `bodyMass` is
 * the one predicate, and a body it answers `distributed: false` for blocks the
 * center of gravity, the tip-over angle and the moment of inertia, by name,
 * with the reason. Nothing is ever guessed to fill the gap.
 *
 * WHAT THE KERNEL HANDS OVER, MEASURED RATHER THAN ASSUMED
 * (`tests/ideacad-solid-analysis-kernel.test.ts`): `massProperties` runs at
 * UNIT DENSITY in the model's inches, so `inertia` is in in^5, taken about the
 * body's OWN center of mass along the world axes, ordered
 * `[Ixx, Iyy, Izz, Pxy, Pxz, Pyz]`. The last three are PRODUCTS of inertia,
 * `+integral of x y dV`, not tensor entries: the tensor's off-diagonal is their
 * negative. An L-shaped body read that way reproduces the kernel's own smallest
 * principal moment about its own principal axis, which is the test that pins
 * the sign.
 *
 * UNITS. Lengths in inches (the manifest's only unit), mass in grams (the unit
 * a student types a measured mass in), inertia in g·in² internally and shown
 * in lb·in² (what combat and FRC calculators take) and kg·m² (SI).
 */
import { bodyMass, STOCK_MATERIALS } from '../advisory';
import type { BodyProjection, ModelProjection, Vec3 } from '../types';

export const G_PER_LB = 453.59237;
export const M_PER_IN = 0.0254;
/** g·in² to kg·m²: 1e-3 kg per g, times (0.0254 m per in) squared. */
export const KG_M2_PER_G_IN2 = 1e-3 * M_PER_IN * M_PER_IN;
/** g·in² to lb·in². */
export const LB_IN2_PER_G_IN2 = 1 / G_PER_LB;
/**
 * How far above the lowest point a surface point may sit and still count as
 * touching the ground: the display mesh's own deflection (0.002 in,
 * `engine.ts`). A flat bottom's points all sit at one height; on a round
 * contact such as a wheel the next row of mesh points up the curve sits
 * several deflections higher, so it stays out and the contact reads as the
 * line it is, not a strip.
 */
export const GROUND_TOLERANCE_IN = 0.002;

/**
 * WHY A BODY BLOCKS A NUMBER. Four causes and no others, read from the same
 * `bodyMass` answer the body panel shows:
 *  - `no-material`: nothing is assigned, so there is neither mass nor density;
 *  - `unverified`: a material with no cited density (a grade nobody named);
 *  - `printed`: a printed part with no mass entered (printing has no bulk density);
 *  - `measured`: a mass was entered, which is a total and says nothing about
 *    where inside the body that mass sits, so it gives total mass and no CG.
 */
export type Blocker = 'no-material' | 'unverified' | 'printed' | 'measured';
export const BLOCKER_WORDS: Record<Blocker, string> = {
	'no-material': 'No material',
	unverified: 'Density unverified',
	printed: 'Printed, no mass',
	measured: 'Measured mass only'
};

export interface MassRow {
	id: string;
	name: string;
	/** Grams, or null when the density rule leaves it unknown. */
	grams: number | null;
	/** True when the grams come from a reference density or a slicer estimate. */
	estimated: boolean;
	/** True only when a cited uniform density spreads the mass over the geometry. */
	distributed: boolean;
	/** What stops this body's mass or distribution being known; null when nothing does. */
	blocker: Blocker | null;
	/** This body's fraction of the total, when the total is known. */
	share: number | null;
	volume: number;
	centerOfMass: Vec3;
}

export interface MassReport {
	/** Heaviest first; bodies with no mass follow, in model order. */
	rows: MassRow[];
	/** Grams, or null unless every body has a mass. */
	totalG: number | null;
	/** Bodies whose mass is unknown (they block the total). */
	missing: MassRow[];
	/** The combined center of gravity, or null. */
	cg: Vec3 | null;
	/** Bodies whose mass distribution is unknown (they block the CG, the tip angle and the inertia). */
	blockers: MassRow[];
	/** The lowest Z of any body, the ground a tip-over is measured on. Null with no bodies. */
	groundZ: number | null;
	/** CG height above that ground. */
	cgHeight: number | null;
}

function blockerOf(body: BodyProjection, grams: number | null, distributed: boolean): Blocker | null {
	if (distributed) return null;
	if (grams !== null) return 'measured';
	const material = STOCK_MATERIALS.find((m) => m.id === body.materialId);
	if (!material) return 'no-material';
	return material.printed ? 'printed' : 'unverified';
}

/** One row per body, in model order, with the density rule's own answer. */
export function massRows(bodies: readonly BodyProjection[]): MassRow[] {
	return bodies.map((body) => {
		const m = bodyMass(body);
		return { id: body.id, name: body.name, grams: m.grams, estimated: m.estimated, distributed: m.distributed, blocker: blockerOf(body, m.grams, m.distributed), share: null, volume: body.volume, centerOfMass: [...body.centerOfMass] as Vec3 };
	});
}

/** The lowest Z of a body: its display mesh when it has one (points ON the surface), else its bounds. */
export function lowestZ(body: BodyProjection): number {
	const p = body.mesh?.positions;
	if (p && p.length >= 3) { let z = Infinity; for (let i = 2; i < p.length; i += 3) if (p[i] < z) z = p[i]; return z; }
	return body.bounds[2];
}

/** Mass-weighted mean of the rows' centers of mass. Null when the rows carry no mass. */
export function centerOfGravity(rows: readonly MassRow[]): Vec3 | null {
	let total = 0; const sum: Vec3 = [0, 0, 0];
	for (const r of rows) { const g = r.grams ?? 0; total += g; for (let d = 0; d < 3; d++) sum[d] += r.centerOfMass[d] * g; }
	return total > 0 ? [sum[0] / total, sum[1] / total, sum[2] / total] : null;
}

export function massReport(model: Pick<ModelProjection, 'bodies'>): MassReport {
	const rows = massRows(model.bodies);
	const missing = rows.filter((r) => r.grams === null), blockers = rows.filter((r) => !r.distributed);
	const totalG = rows.length && !missing.length ? rows.reduce((n, r) => n + r.grams!, 0) : null;
	if (totalG !== null && totalG > 0) for (const r of rows) r.share = r.grams! / totalG;
	const sorted = [...rows.filter((r) => r.grams !== null).sort((a, b) => b.grams! - a.grams!), ...missing];
	const cg = rows.length && !blockers.length ? centerOfGravity(rows) : null;
	const groundZ = model.bodies.length ? model.bodies.reduce((z, b) => (lowestZ(b) < z ? lowestZ(b) : z), Infinity) : null;
	return { rows: sorted, totalG, missing, cg, blockers, groundZ, cgHeight: cg && groundZ !== null ? cg[2] - groundZ : null };
}

/* -------------------------------------------------------------------------
 * INERTIA ABOUT AN AXIS
 * ---------------------------------------------------------------------- */

export interface Axis { origin: Vec3; direction: Vec3 }

/**
 * n^T J n for the kernel's `[Ixx, Iyy, Izz, Pxy, Pxz, Pyz]`, with n a unit
 * vector. The tensor's off-diagonal entries are the NEGATIVE products, hence
 * the minus sign.
 */
export function tensorAbout(j: readonly number[], n: Vec3): number {
	return j[0] * n[0] * n[0] + j[1] * n[1] * n[1] + j[2] * n[2] * n[2] - 2 * (j[3] * n[0] * n[1] + j[4] * n[0] * n[2] + j[5] * n[1] * n[2]);
}
const normalized = (v: Vec3): Vec3 | null => { const l = Math.hypot(v[0], v[1], v[2]); return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : null; };
/** The perpendicular distance from a point to an axis line. */
export function distanceToAxis(p: Vec3, axis: Axis): number {
	const n = normalized(axis.direction); if (!n) return NaN;
	const w: Vec3 = [p[0] - axis.origin[0], p[1] - axis.origin[1], p[2] - axis.origin[2]], t = w[0] * n[0] + w[1] * n[1] + w[2] * n[2];
	return Math.hypot(w[0] - t * n[0], w[1] - t * n[1], w[2] - t * n[2]);
}

export interface InertiaTerm { id: string; name: string; /** rho n^T J n, g·in², about the body's own CG. */ own: number; /** m d², g·in², carrying it to the axis. */ transfer: number; distance: number }
export interface InertiaResult { gIn2: number | null; blockers: MassRow[]; terms: InertiaTerm[] }

/**
 * THE PARALLEL-AXIS THEOREM, summed over bodies: for each, I = rho * n^T J n
 * about its own center of mass plus m * d^2 carrying it to the axis, where
 * rho = grams / volume (g/in³) is the cited density `bodyMass` used and d is
 * the distance from the body's center of mass to the axis line. Unknown, with
 * the blocking bodies, when any body's distribution is unknown.
 */
export function inertiaAbout(bodies: readonly BodyProjection[], axis: Axis): InertiaResult {
	const rows = massRows(bodies), blockers = rows.filter((r) => !r.distributed), n = normalized(axis.direction);
	if (!bodies.length || blockers.length || !n) return { gIn2: null, blockers, terms: [] };
	const terms = bodies.map((body, i): InertiaTerm => {
		const g = rows[i].grams!, rho = body.volume > 0 ? g / body.volume : 0, d = distanceToAxis(body.centerOfMass, { origin: axis.origin, direction: n });
		return { id: body.id, name: body.name, own: rho * tensorAbout(body.inertia, n), transfer: g * d * d, distance: d };
	});
	return { gIn2: terms.reduce((s, t) => s + t.own + t.transfer, 0), blockers, terms };
}

/** The farthest any surface point of these bodies sits from the axis: a spinner's tip radius. Null when a body has no mesh to read. */
export function radiusAbout(bodies: readonly BodyProjection[], axis: Axis): number | null {
	if (!bodies.length) return null;
	let r = 0;
	for (const b of bodies) {
		const p = b.mesh?.positions; if (!p || p.length < 3) return null;
		for (let i = 0; i < p.length; i += 3) { const d = distanceToAxis([p[i], p[i + 1], p[i + 2]], axis); if (d > r) r = d; }
	}
	return r;
}

export const toLbIn2 = (gIn2: number) => gIn2 * LB_IN2_PER_G_IN2;
export const toKgM2 = (gIn2: number) => gIn2 * KG_M2_PER_G_IN2;
