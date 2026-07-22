/**
 * GREENLINE AI drivers: competent-but-beatable opponents that follow the
 * track, slow for corners, recover when knocked off course, and decide when
 * to fire the disruption weapon. Pure logic (no three.js, no cannon-es, no
 * Svelte), one `AiDriver` per vehicle; the harness feeds it pose facts and
 * applies the returned controls through the SAME per-vehicle pipeline the
 * player uses.
 *
 * The racing line is derived from the track data, not hand-authored: the
 * ribbon centerline gives the path, its curvature gives per-point corner
 * speeds, and a braking-distance sweep over the upcoming points gives the
 * allowed speed now. Any track in the v1 format gets AI for free.
 */

import type { Combatant, WeaponDef, WeaponSlotId } from './combat';
import type { AbilitySlotId } from './abilities';
import type { TrackRuntime } from './track-runtime';
import type { TrackVec2 } from './track-schema';

/**
 * The RESOLVED driving targets for ONE vehicle. Every field is absolute (m/s,
 * m/s^2, 1/m) and per-vehicle: build an `AiTuning` with `aiTuningFor()` below
 * rather than by hand, so a driver's speed can never be a flat constant that
 * quietly goes stale when the physics is retuned.
 */
export interface AiTuning {
	/**
	 * Straight-line speed target for THIS vehicle, m/s. DERIVED from the
	 * vehicle's own drive force and drag (see `aiTuningFor`), so it tracks the
	 * player's top-speed formula automatically.
	 */
	topSpeed: number;
	/** Lateral acceleration budget for corner speeds, m/s^2. */
	cornerAccel: number;
	/** Assumed MECHANICAL deceleration for brake-early planning, m/s^2. */
	brakeAccel: number;
	/**
	 * Aero deceleration coefficient k (1/m): a coasting or braking vehicle
	 * sheds `k * v^2` m/s^2 ON TOP of `brakeAccel`, so k = dragCoefficient /
	 * mass. Omitted / 0 reproduces the old constant-deceleration planning
	 * exactly.
	 *
	 * This matters far more than `brakeAccel` at speed, and leaving it out is
	 * what made the pre-9d-i braking sweep unusable once the speed range grew:
	 * a car doing 63 m/s sheds ~12 m/s^2 to drag alone, so planning without it
	 * overestimates the braking distance several-fold, and the driver either
	 * crawls or needs a horizon longer than the corner it is braking for.
	 */
	dragDecel?: number;
	/**
	 * Full-throttle drive acceleration at rest, m/s^2 (engineForce / mass).
	 * Paired with `tractionAccel` to cap throttle; omitted = no cap.
	 */
	driveAccel?: number;
	/**
	 * The longitudinal acceleration this vehicle's tires can actually put down,
	 * m/s^2, already scaled by its grip. See `AiSkill.tractionAccel`.
	 */
	tractionAccel?: number;
	/** Pure-pursuit steering gain. */
	steerGain: number;
	/** 0..1: how eagerly the AI fires (range used and post-cooldown delay). */
	aggression: number;
}

/**
 * The FIELD-WIDE driver skill knobs: what every AI shares, as against what its
 * own vehicle can do. There is deliberately no `topSpeed` here. An absolute
 * speed shared across builds is exactly the constant that went stale (a flat
 * 17 m/s survived four phases of physics retuning while the player's derived
 * ceiling climbed past 60), so speed is expressed as a FRACTION of each
 * vehicle's own capability instead.
 */
export interface AiSkill {
	/**
	 * Fraction of the vehicle's OWN drag-limited terminal speed the driver
	 * targets on a straight. 1 = drive it flat out and let the corner sweep be
	 * the only limit (the default: an AI should not self-handicap relative to a
	 * player in the same car). Below 1 is a genuine skill handicap.
	 */
	speedFrac: number;
	/** Lateral acceleration budget for corner speeds, m/s^2, before the
	 * vehicle's own grip multiplier. */
	cornerAccel: number;
	/** Assumed mechanical deceleration for brake-early planning, m/s^2. */
	brakeAccel: number;
	/** Longitudinal acceleration the tires can put down at neutral grip,
	 * m/s^2; caps throttle on cars with more power than traction. */
	tractionAccel: number;
	/** Pure-pursuit steering gain. */
	steerGain: number;
	/** 0..1: how eagerly the AI fires (range used and post-cooldown delay). */
	aggression: number;
}

/**
 * How much longitudinal acceleration a neutral-grip vehicle's tires can put
 * down before it starts driving itself sideways, m/s^2.
 *
 * This lives here, exported, because it is a VEHICLE trait rather than a
 * driver one, and BOTH the AI's commanded throttle (`drive()` below) and the
 * human player's drive force (the traction limiter in `GreenlineRace.svelte`)
 * resolve their cap from it. One number, two consumers: the two can never
 * drift into a world where an AI feathers a car a player is still allowed to
 * spin.
 *
 * MEASURED, and the measurement is stark. Full throttle from rest on a
 * dead-straight road with ZERO steering input, held 10 s:
 *   ARMOR    (11.9 m/s^2 of drive) -> 2.25 m/s lateral,  2.8 deg of yaw
 *   HANDLING (15.3)                -> 2.67 m/s lateral,  3.1 deg
 *   SYSTEMS  (14.8)                -> 2.78 m/s lateral,  3.4 deg
 *   VELOCITY (21.8)                -> 31.4 m/s lateral, 180 deg: it spins
 *                                     itself out and ends up stationary
 * VELOCITY on part throttle: 0.85 -> 3.65 lateral, 0.7 -> 2.79, 0.55 -> 1.97,
 * and it is FASTER after 10 s on 0.55 (55.2 m/s) than on 1.0 (20.7), because
 * full throttle spends the difference fishtailing.
 *
 * 15.5 is the line those runs draw: it leaves ARMOR / HANDLING / SYSTEMS at
 * full throttle (their caps compute to 1.30 / 1.22 / 1.05, all clamped to 1,
 * so their behavior is untouched) and puts VELOCITY at 0.71, the level it was
 * measured stable at.
 *
 * VELOCITY's instability is NOT a grip deficit to be patched on the balance
 * sheet: its `effects` block carries no `frictionSlip` at all, so it runs
 * baseline grip. The spin comes entirely from `engineForce: 1.15` over
 * `chassisMass: 0.85` — 21.8 m/s^2 of drive against 15.5 of tire — and those
 * two numbers ARE the archetype's identity. The car is not overtuned; it is
 * simply a car that cannot be driven flat out off the line, and both drivers
 * now know it.
 */
export const VEHICLE_TRACTION_ACCEL = 15.5;

export const AI_DEFAULTS: AiSkill = {
	// Flat out. The corner sweep, not an arbitrary ceiling, is what slows an AI
	// down; a car that can do 63 m/s down a straight now does 63 m/s.
	speedFrac: 1,
	/**
	 * The one value here that could NOT be read off the physics, so it was
	 * swept rather than derived.
	 *
	 * What the car can actually hold, MEASURED (steering-step probes on the
	 * Terminal Nine dispatch straight, stock ARMOR build): 28.7 m/s^2 of
	 * lateral acceleration at 12 m/s, rising to ~72 m/s^2 at 54 m/s as
	 * downforce loads the tires. So grip is NOT the binding constraint, the
	 * driver's LINE is. It follows the centerline with pure pursuit, has no
	 * apex or track-out, and on this track corners of 90 to 130 m radius sit
	 * inside an 18 m corridor 13.5 m up in the air, where running wide is a
	 * fall rather than a scrub.
	 *
	 * Swept solo on Terminal Nine (HANDLING, so the effective budget is 1.2x
	 * these numbers), one flying lap each, against a 161 to 171 s pre-9d-i
	 * baseline:
	 *   10 -> 106.7 s, 0 falls, 0 flips, 0 floor scrapes
	 *   13 ->  85.2 s, 1 fall,  0 flips, 6 floor scrapes
	 *   16 ->  77.0 s, 1 fall,  0 flips, 17 floor scrapes
	 *   18 -> DNF, flipped off the elevated deck mid-corner
	 * 12 sits just under the knee: most of the available lap time with the
	 * incident count still near zero, which matters more once eleven other cars
	 * and their weapons are on the same corridor. Raise it alongside a better
	 * racing line (9d-ii / 9d-iii), not on its own.
	 *
	 * For scale here: 12 puts the tightest corner (13.7 m radius rail-yard
	 * switchback) at 12.8 m/s and a 90 m radius deck sweeper at 33 m/s.
	 */
	cornerAccel: 12,
	/**
	 * MEASURED: full brakes hold ~25 m/s^2 of purely mechanical deceleration on
	 * the 243 kg ARMOR build (higher on a lighter chassis, since the brake acts
	 * as a fixed per-wheel impulse). 14 is a deliberate conservative half of
	 * that, and the aero term (`dragDecel`) supplies the rest of the real
	 * stopping power at speed. The old 4.5 was not a margin, it was a
	 * misestimate: it planned braking zones several times longer than the car
	 * needed.
	 */
	brakeAccel: 14,
	/**
	 * How much longitudinal acceleration the tires can put down before the car
	 * starts driving itself sideways, m/s^2 at neutral grip. See
	 * `VEHICLE_TRACTION_ACCEL` above for the measurements behind the number.
	 *
	 * This is a VEHICLE trait, not an AI one: a human holding the same key gets
	 * the same spin, which is why the player's drive force now resolves its own
	 * limit from the SAME constant (Phase 9-fix-e). The AI simply cannot be
	 * asked to drive flat out a car that cannot be driven flat out, so it
	 * feathers instead. See the throttle cap in `drive()` for why this can
	 * never cost a vehicle its top speed.
	 */
	tractionAccel: VEHICLE_TRACTION_ACCEL,
	steerGain: 1.3,
	aggression: 0.5
};

/**
 * The physics facts about ONE vehicle that its driving targets derive from.
 * All ABSOLUTE (the field baseline already multiplied by the build stats), so
 * this module never needs to know what a loadout is.
 */
export interface AiVehicleSpec {
	/** Total drive force at full throttle, N. */
	engineForce: number;
	/** Quadratic aero drag coefficient (force = coef * v^2). */
	aeroDrag: number;
	/** Chassis mass, kg. */
	mass: number;
	/** Tire grip multiplier over the field baseline (1 = neutral). */
	gripMul: number;
}

/**
 * Resolve one vehicle's driving targets from ITS OWN build.
 *
 * `topSpeed` is the same drag-limited terminal `sqrt(engineForce / aeroDrag)`
 * the player's car actually reaches and the garage's TOP SPEED hero displays:
 * one formula, three consumers, so an AI is fast for exactly the reasons its
 * build is fast, and a future engine / drag / aero change moves all three
 * together instead of leaving the driver behind.
 */
export function aiTuningFor(spec: AiVehicleSpec, skill: AiSkill): AiTuning {
	const mass = Math.max(1, spec.mass);
	const drag = Math.max(0, spec.aeroDrag);
	const engine = Math.max(0, spec.engineForce);
	const grip = Math.max(0.01, spec.gripMul);
	return {
		topSpeed: Math.sqrt(engine / Math.max(0.01, drag)) * skill.speedFrac,
		cornerAccel: skill.cornerAccel * grip,
		brakeAccel: skill.brakeAccel,
		dragDecel: drag / mass,
		driveAccel: engine / mass,
		tractionAccel: skill.tractionAccel * grip,
		steerGain: skill.steerGain,
		aggression: skill.aggression
	};
}

/**
 * The single field the weapon / ability restraint heuristics read. Both
 * `AiSkill` (field-wide) and a resolved `AiTuning` (per vehicle) satisfy it,
 * so a call site passes whichever it already has.
 */
export interface AiAggressionSource {
	/** 0..1: how eagerly the AI fires (range used and post-cooldown delay). */
	aggression: number;
}

export interface AiControls {
	steer: number;
	throttle: number;
	/** Doubles as reverse at standstill (the harness's S-key semantics). */
	brake: number;
}

export interface AiDriveState {
	x: number;
	z: number;
	/** Unit heading on the ground plane. */
	hx: number;
	hz: number;
	speed: number;
	/** Nearest-centerline index from the track runtime's surface query. */
	warmIdx: number;
	onRibbon: boolean;
	nowMs: number;
	dtMs: number;
}

/** Point spacing on a route, the unit the lookahead/braking sweep counts in. */
function routeSpacing(pts: TrackVec2[]): number {
	let total = 0;
	for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
	return Math.max(0.5, total / Math.max(1, pts.length - 1));
}

/** Unsigned curvature (1/radius) at each point of a closed route. */
function curvatureOf(pts: TrackVec2[]): number[] {
	const n = pts.length;
	const out = new Array<number>(n);
	for (let i = 0; i < n; i++) {
		const p0 = pts[(i - 1 + n) % n];
		const p1 = pts[i];
		const p2 = pts[(i + 1) % n];
		const d1x = (p2.x - p0.x) / 2;
		const d1z = (p2.z - p0.z) / 2;
		const d2x = p2.x - 2 * p1.x + p0.x;
		const d2z = p2.z - 2 * p1.z + p0.z;
		const den = Math.pow(d1x * d1x + d1z * d1z, 1.5);
		out[i] = den > 1e-9 ? Math.abs(d1x * d2z - d1z * d2x) / den : 0;
	}
	return out;
}

export class AiDriver {
	private readonly rt: TrackRuntime;
	/**
	 * The lap route this driver is following: `rt.routes[routeIdx]`, a plain
	 * closed polyline. Route 0 is the main line; later routes have a branch
	 * spliced in. Because a route is just points, following a shortcut needs
	 * no path-handoff logic here — only different points.
	 */
	private route: TrackVec2[];
	private routeIdx = 0;
	private curv: number[];
	private spacing: number;
	/**
	 * Nearest-route-point index, tracked internally and ONLY used on tracks
	 * that have branches. On a single-route track the driver keeps using the
	 * caller's `warmIdx` exactly as it always did, so existing tracks run the
	 * unchanged code path rather than a re-derived equivalent of it.
	 */
	private warm = 0;
	private readonly branched: boolean;
	private stuckMs = 0;
	private reverseUntilMs = 0;
	/** Equipped-weapon restraint, keyed by slot (the AI's build decides what
	 * occupies each slot; the schedule belongs to the slot, like cooldowns). */
	private nextSlotOkMs: Record<WeaponSlotId, number> = { weaponPrimary: 0, weaponSecondary: 0 };
	/** Ability restraint, keyed by slot (the meter is the real gate; this just
	 * keeps the AI from spamming the instant it can afford one). */
	private nextAbilitySlotOkMs: Record<AbilitySlotId, number> = {
		abilityPrimary: 0,
		abilitySecondary: 0
	};
	/** Unsigned centerline curvature at the AI's current point, updated each
	 * drive() tick; the Grip Surge heuristic reads it to fire in corners. */
	private lastCurvature = 0;

	constructor(rt: TrackRuntime) {
		this.rt = rt;
		this.branched = rt.routes.length > 1;
		this.route = rt.routes[0];
		this.curv = curvatureOf(this.route);
		this.spacing = routeSpacing(this.route);
	}

	/** Which route this driver is currently following (0 = main line). */
	get currentRoute(): number {
		return this.routeIdx;
	}

	/** Switch routes and rebuild the derived line data. */
	setRoute(index: number): void {
		const i = Math.max(0, Math.min(this.rt.routes.length - 1, Math.round(index)));
		if (i === this.routeIdx && this.route === this.rt.routes[i]) return;
		this.routeIdx = i;
		this.route = this.rt.routes[i];
		this.curv = curvatureOf(this.route);
		this.spacing = routeSpacing(this.route);
		this.warm = 0;
	}

	/**
	 * Per-lap branch decision. Deliberately shallow: real route tactics (is the
	 * shortcut worth it given my hull, who is behind me, is the hazard already
	 * triggered) are Phase 9's job. A bolder driver gambles on the risky line
	 * more often, so a field with mixed aggression splits across both routes.
	 * `rand` is injected so a scripted drive can force a route.
	 */
	chooseRoute(aggression: number, rand: () => number = Math.random): number {
		// Only risk/reward alternatives are eligible for the random branch pick:
		// PIT lanes (Phase 9c) are deliberate slow repair detours, reached only by
		// the harness's "pit when hurt" heuristic (which calls setRoute directly),
		// never gambled onto by a healthy car. On a track whose only alternative is
		// a pit lane (e.g. Proving Ground), that leaves nothing to pick and the
		// driver stays on the main line.
		const pit = new Set(this.rt.pitRoutes);
		const eligible: number[] = [];
		for (let i = 1; i < this.rt.routes.length; i++) if (!pit.has(i)) eligible.push(i);
		if (eligible.length === 0) {
			this.setRoute(0);
			return this.routeIdx;
		}
		const pBranch = 0.2 + 0.45 * Math.max(0, Math.min(1, aggression));
		const next = rand() < pBranch ? eligible[Math.floor(rand() * eligible.length)] : 0;
		this.setRoute(next);
		return this.routeIdx;
	}

	/** Warm-started nearest point on the current route. */
	private updateWarm(x: number, z: number): number {
		const pts = this.route;
		const n = pts.length;
		let bestI = this.warm;
		let bestD = Infinity;
		const probe = (i: number) => {
			const ii = ((i % n) + n) % n;
			const p = pts[ii];
			const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
			if (d < bestD) {
				bestD = d;
				bestI = ii;
			}
		};
		for (let k = -10; k <= 10; k++) probe(this.warm + k);
		if (bestD > 40 * 40) for (let i = 0; i < n; i++) probe(i);
		this.warm = bestI;
		return bestI;
	}

	/** Corner-limited speed at a centerline index. */
	private cornerSpeed(i: number, t: AiTuning): number {
		const k = this.curv[((i % this.curv.length) + this.curv.length) % this.curv.length];
		return Math.min(t.topSpeed, Math.sqrt(t.cornerAccel / Math.max(k, 1e-4)));
	}

	drive(s: AiDriveState, t: AiTuning): AiControls {
		const n = this.route.length;
		// Branched tracks index the driver's OWN route; single-route tracks
		// keep using the caller's warm index, unchanged.
		const idx = this.branched ? this.updateWarm(s.x, s.z) : s.warmIdx;
		this.lastCurvature = this.curv[((idx % n) + n) % n] ?? 0;

		// Un-stick: back out for a moment (brake = reverse at standstill),
		// steering opposite, then resume normal driving.
		if (s.nowMs < this.reverseUntilMs) {
			return { steer: 0, throttle: 0, brake: 1 };
		}

		// Allowed speed now: the tightest constraint among upcoming corner
		// speeds, each relaxed by the distance available to brake for it.
		//
		// Deceleration is `a0 + k*v^2` (mechanical brakes plus quadratic aero),
		// which integrates in closed form, so the entry speed that still reaches
		// vC over distance d is exact rather than a constant-a approximation.
		// The sweep HORIZON is derived from the current speed too: a corner
		// further away than this vehicle's own stopping distance cannot
		// constrain it now, so a slow car pays for a handful of points while a
		// fast one looks as far ahead as it genuinely needs to. Both replaced
		// fixed numbers (a 26-point window, constant deceleration) that were
		// sized for a 17 m/s field and do not survive a 63 m/s one.
		const a0 = Math.max(0.1, t.brakeAccel);
		const k = Math.max(0, t.dragDecel ?? 0);
		const stopDist =
			k > 1e-6
				? Math.log(1 + (k * s.speed * s.speed) / a0) / (2 * k)
				: (s.speed * s.speed) / (2 * a0);
		const steps = Math.min(n, Math.max(8, Math.ceil((stopDist + 4) / this.spacing) + 1));
		let allowed = t.topSpeed;
		for (let j = 0; j < steps; j++) {
			const vC = this.cornerSpeed(idx + j, t);
			const d = Math.max(0, j * this.spacing - 2);
			const v =
				k > 1e-6
					? Math.sqrt(Math.max(0, ((a0 + k * vC * vC) * Math.exp(2 * k * d) - a0) / k))
					: Math.sqrt(vC * vC + 2 * a0 * d);
			if (v < allowed) allowed = v;
		}

		// Pure pursuit at a speed-scaled lookahead; when off the ribbon, aim
		// closer in to rejoin the track.
		//
		// Both distances are in METRES and only then converted to points, so a
		// finely sampled track cannot clip the lookahead the way the old
		// 12-POINT ceiling did (12 points is 48 m at this track's 4 m spacing
		// but only 24 m at 2 m spacing, a step input at 60 m/s).
		//
		// The REJOIN distance is the one that had to stop being fixed: 2 points
		// was 8 m, which is 0.13 s of travel at 60 m/s. Any brief excursion off
		// the ribbon at speed therefore answered with near-full lock, which
		// spins the car rather than recovering it. It is still deliberately
		// SHORTER than the on-ribbon lookahead (rejoining should be decisive),
		// just no longer sharp enough to be its own accident.
		const lookM = Math.min(50, 3 + s.speed * 0.45);
		const lookPts = Math.max(1, Math.round(lookM / this.spacing));
		const rejoinPts = Math.max(2, Math.round((lookM * 0.6) / this.spacing));
		const target = s.onRibbon
			? this.route[(idx + lookPts) % n]
			: this.route[(idx + rejoinPts) % n];
		const dx = target.x - s.x;
		const dz = target.z - s.z;
		const cross = s.hx * dz - s.hz * dx;
		const dot = s.hx * dx + s.hz * dz;
		const steer = Math.max(
			-1,
			Math.min(1, -Math.atan2(cross, Math.max(Math.abs(dot), 0.001) * Math.sign(dot || 1)) * t.steerGain)
		);

		// Hold band around the allowed speed. PROPORTIONAL, not the old flat
		// 0.8 m/s: at 17 m/s that was a 5% deadband, at 63 m/s it is 1%, and
		// full brakes here are ~25 m/s^2, so a fast car sitting on the edge
		// would stutter between hard braking and full throttle rather than
		// cruising.
		const band = Math.max(0.8, allowed * 0.03);
		const wrongWay = dot < 0;
		let throttle = 0;
		let brake = 0;
		if (wrongWay) {
			throttle = 0.35;
		} else if (s.speed > allowed + band) {
			brake = 1;
		} else if (s.speed < allowed - band) {
			throttle = s.onRibbon ? 1 : 0.55;
		} else {
			throttle = 0.35;
		}

		// Traction cap: never ask for more drive force than the tires can put
		// down. `driveAccel * throttle` is the acceleration being demanded and
		// `dragDecel * v^2` is what aero is already absorbing, so the surplus
		// reaching the contact patch has to stay inside the traction budget.
		//
		// Two properties make this safe to apply unconditionally. It CANNOT
		// cost a vehicle its top speed: at terminal, drag alone consumes the
		// whole drive force, so the cap has risen past 1 long before then (a
		// VELOCITY build is back to full throttle above ~44 m/s). And it does
		// nothing at all to a car whose power its tires can already handle:
		// three of the four archetypes compute a cap above 1 even at rest.
		if (t.driveAccel && t.driveAccel > 0 && t.tractionAccel) {
			const cap = (t.tractionAccel + k * s.speed * s.speed) / t.driveAccel;
			if (cap < throttle) throttle = Math.max(0.3, cap);
		}

		// Stuck detection: trying to move but not moving -> reverse briefly.
		if (throttle > 0.3 && s.speed < 0.8) this.stuckMs += s.dtMs;
		else this.stuckMs = 0;
		if (this.stuckMs > 2500) {
			this.stuckMs = 0;
			this.reverseUntilMs = s.nowMs + 1100;
		}

		return { steer, throttle, brake };
	}

	/**
	 * Should this vehicle fire the equipped weapon in `slot` now? Off slot
	 * cooldown, past the aggression-scaled restraint delay, not disrupted, and a
	 * valid target inside the def's aggression-scaled range and tightened cone.
	 * Handles every FORWARD-AIMED family: kinetic (hit-scan cone), guided (lock
	 * cone; the harness additionally requires a COMPLETE lock before a launch),
	 * disruption (the EMP cone) and tether (the Grappling Hook cone) — the last
	 * two folded in when Phase 8g made those equipment. Deliberately simple;
	 * real weapon tactics are Phase 9.
	 */
	wantsWeaponFire(
		self: Combatant,
		others: Combatant[],
		slot: WeaponSlotId,
		def: WeaponDef,
		t: AiAggressionSource,
		nowMs: number,
		cooldownScale = 1
	): boolean {
		if (nowMs < this.nextSlotOkMs[slot]) return false;
		if (self.combat.isDisrupted(nowMs)) return false;
		if (!self.combat.canUseSlot(slot, nowMs, def.cooldownSec * cooldownScale)) return false;
		const baseRange =
			def.kinetic?.range ?? def.guided?.lockRange ?? def.disruption?.range ?? def.tether?.range ?? 0;
		const coneDeg =
			def.kinetic?.coneDeg ?? def.guided?.lockConeDeg ?? def.disruption?.coneDeg ?? def.tether?.coneDeg ?? 0;
		if (baseRange <= 0 || coneDeg <= 0) return false;
		const aggr = Math.max(0, Math.min(1, t.aggression));
		const range = baseRange * (0.45 + 0.55 * aggr);
		const cosLimit = Math.cos((((coneDeg / 2) * 0.8) * Math.PI) / 180);
		for (const o of others) {
			if (o.id === self.id || o.combat.eliminated || o.combat.isOut(nowMs)) continue;
			const dx = o.x - self.x;
			const dz = o.z - self.z;
			const dist = Math.hypot(dx, dz);
			if (dist > range || dist < 0.001) continue;
			if ((dx * self.hx + dz * self.hz) / dist < cosLimit) continue;
			return true;
		}
		return false;
	}

	/**
	 * Should this vehicle DROP its equipped area weapon (Caltrops) now? The
	 * wantsOil logic applied to a mount slot: an area weapon has no forward
	 * range/cone to aim (wantsWeaponFire returns false for it), so the trigger
	 * is a live rival close behind and roughly on the AI's tail, right where the
	 * dropped field lands. Same restraint pattern (never disrupted, own slot
	 * schedule).
	 */
	wantsAreaDrop(
		self: Combatant,
		others: Combatant[],
		slot: WeaponSlotId,
		def: WeaponDef,
		t: AiAggressionSource,
		nowMs: number,
		cooldownScale = 1
	): boolean {
		if (nowMs < this.nextSlotOkMs[slot]) return false;
		if (self.combat.isDisrupted(nowMs)) return false;
		if (!self.combat.canUseSlot(slot, nowMs, def.cooldownSec * cooldownScale)) return false;
		// Both rear droppers use this: Caltrops (def.area) and the Oil Slick
		// (def.oil, added Phase 8g). Both blocks carry a dropBack.
		const a = def.area ?? def.oil;
		if (!a) return false;
		const aggr = Math.max(0, Math.min(1, t.aggression));
		const range = a.dropBack + 4 + 9 * aggr;
		for (const o of others) {
			if (o.id === self.id || o.combat.eliminated || o.combat.isOut(nowMs)) continue;
			const dx = o.x - self.x;
			const dz = o.z - self.z;
			const dist = Math.hypot(dx, dz);
			if (dist > range || dist < 0.001) continue;
			// Behind: the rival sits opposite the AI's heading (drop in their path).
			if ((dx * self.hx + dz * self.hz) / dist > -0.35) continue;
			return true;
		}
		return false;
	}

	/**
	 * Should this vehicle POP its Energy Shield now? A panic button: raise it
	 * when hurt AND a threat is near, so the fixed absorb pool soaks the incoming
	 * burst. Deliberately NOT gated on isDisrupted — being disrupted (and thus
	 * about to eat follow-up damage) is exactly when you want the bubble up.
	 */
	wantsShield(
		self: Combatant,
		others: Combatant[],
		slot: WeaponSlotId,
		def: WeaponDef,
		t: AiAggressionSource,
		nowMs: number,
		cooldownScale = 1
	): boolean {
		if (nowMs < this.nextSlotOkMs[slot]) return false;
		if (!def.shield) return false;
		if (!self.combat.canUseSlot(slot, nowMs, def.cooldownSec * cooldownScale)) return false;
		// Only worth a slot of cooldown when the chassis is already bitten into.
		const chassisFrac = self.combat.chassisHealth / Math.max(1, self.combat.maxChassis);
		if (chassisFrac > 0.55) return false;
		const aggr = Math.max(0, Math.min(1, t.aggression));
		const threatRange = 22 + 16 * aggr;
		for (const o of others) {
			if (o.id === self.id || o.combat.eliminated || o.combat.isOut(nowMs)) continue;
			const dx = o.x - self.x;
			const dz = o.z - self.z;
			if (dx * dx + dz * dz <= threatRange * threatRange) return true;
		}
		return false;
	}

	/**
	 * Should this vehicle SPIN UP its Deployable Blades now? Toggle them out when
	 * a rival is close enough that contact is likely, so the active window is not
	 * wasted spinning in open air. Same restraint pattern as the fired tools.
	 */
	wantsBlades(
		self: Combatant,
		others: Combatant[],
		slot: WeaponSlotId,
		def: WeaponDef,
		t: AiAggressionSource,
		nowMs: number,
		cooldownScale = 1
	): boolean {
		if (nowMs < this.nextSlotOkMs[slot]) return false;
		if (self.combat.isDisrupted(nowMs)) return false;
		if (!def.melee) return false;
		if (!self.combat.canUseSlot(slot, nowMs, def.cooldownSec * cooldownScale)) return false;
		const aggr = Math.max(0, Math.min(1, t.aggression));
		const range = 7 + 6 * aggr;
		for (const o of others) {
			if (o.id === self.id || o.combat.eliminated || o.combat.isOut(nowMs)) continue;
			const dx = o.x - self.x;
			const dz = o.z - self.z;
			if (dx * dx + dz * dz <= range * range) return true;
		}
		return false;
	}

	/** Slot twin of scheduleNextUse: cooldown + aggression-scaled delay. */
	scheduleSlotUse(slot: WeaponSlotId, nowMs: number, cooldownSec: number, t: AiAggressionSource): void {
		const aggr = Math.max(0, Math.min(1, t.aggression));
		const extraSec = (1.6 - 1.4 * aggr) * (0.6 + 0.8 * Math.random());
		this.nextSlotOkMs[slot] = nowMs + (cooldownSec + Math.max(0.1, extraSec)) * 1000;
	}

	// ---- Abilities (Phase 5a) --------------------------------------------
	// Intentionally simple triggers, one per ability category; the shared drift
	// METER (checked harness-side against VehicleAbilities.ready) is the real
	// gate, and this restraint schedule just stops the AI from firing the
	// instant it can afford one. Jump has no AI heuristic (no ramps yet), so the
	// harness never asks about it. Real ability tactics are Phase 9.

	/** Past this slot's restraint delay? (The meter gate is the harness's.) */
	abilitySlotReady(slot: AbilitySlotId, nowMs: number): boolean {
		return nowMs >= this.nextAbilitySlotOkMs[slot];
	}

	/**
	 * Overcharge Repair: pop it once the chassis (the life pool) is bitten below
	 * half, OR once the weapon mount has been destroyed.
	 *
	 * The mount clause was added in Phase 9-fix-d. `repair()` fills the
	 * most-depleted pool first and revives a dead mount when the budget reaches
	 * it, so bringing your weapons back online is one of the two things this
	 * ability is FOR -- but keying only on chassis meant an AI whose guns had
	 * been shot off would sit on a full meter and never spend it, and measured
	 * races ended with most of the field disarmed for exactly that reason.
	 */
	wantsRepair(self: Combatant, _nowMs: number): boolean {
		if (self.combat.mountDown) return true;
		const frac = self.combat.chassisHealth / Math.max(1, self.combat.maxChassis);
		return frac < 0.5;
	}

	/** Nitro Boost: spend it when a rival is close (chasing to close the gap, or
	 * chased and wanting to pull away) — either way, near a rival is when the
	 * burst matters. */
	wantsNitro(self: Combatant, others: Combatant[], nowMs: number): boolean {
		const range = 34;
		for (const o of others) {
			if (o.id === self.id || o.combat.eliminated || o.combat.isOut(nowMs)) continue;
			const dx = o.x - self.x;
			const dz = o.z - self.z;
			if (dx * dx + dz * dz <= range * range) return true;
		}
		return false;
	}

	/** Grip Surge: the loosest heuristic — periodic while the AI is in a corner
	 * (curvature from the last drive() tick above a small threshold). */
	wantsGrip(_nowMs: number): boolean {
		return this.lastCurvature > 0.008;
	}

	/**
	 * Air Correction: fire it whenever the vehicle is genuinely airborne and the
	 * meter can afford it — the harness supplies the airborne flag (it owns the
	 * wheel-contact state) and the meter gate is the harness's too, so this is
	 * just "am I flying". Deliberately shallow, like the other five: an AI that
	 * actually flies its landings is Phase 9's problem, and a wasted activation
	 * costs it only meter.
	 */
	wantsAirControl(isAirborne: boolean): boolean {
		return isAirborne;
	}

	/** Ability twin of scheduleSlotUse: a plain restraint delay with jitter (no
	 * per-def cooldown to add — abilities are meter-gated). */
	scheduleAbilitySlot(slot: AbilitySlotId, nowMs: number): void {
		this.nextAbilitySlotOkMs[slot] = nowMs + (1.5 + 2 * Math.random()) * 1000;
	}
}
