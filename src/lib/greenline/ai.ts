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

import type { Combatant, CombatTuning, WeaponDef, WeaponSlotId } from './combat';
import type { AbilitySlotId } from './abilities';
import type { TrackRuntime } from './track-runtime';
import type { TrackVec2 } from './track-schema';

export interface AiTuning {
	/** Straight-line speed cap, m/s. The main "skill" knob. */
	topSpeed: number;
	/** Lateral acceleration budget for corner speeds, m/s^2. */
	cornerAccel: number;
	/** Assumed deceleration for brake-early planning, m/s^2. */
	brakeAccel: number;
	/** Pure-pursuit steering gain. */
	steerGain: number;
	/** 0..1: how eagerly the AI fires (range used and post-cooldown delay). */
	aggression: number;
}

export const AI_DEFAULTS: AiTuning = {
	topSpeed: 17,
	cornerAccel: 7,
	brakeAccel: 4.5,
	steerGain: 1.3,
	aggression: 0.5
};

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

/** The tools an AI actively chooses to use (ram is passive contact). */
export type AiWeapon = 'emp' | 'oil' | 'tether';

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
	private nextOkMs: Record<AiWeapon, number> = { emp: 0, oil: 0, tether: 0 };
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
		const alts = this.rt.routes.length - 1;
		if (alts < 1) return 0;
		const pBranch = 0.2 + 0.45 * Math.max(0, Math.min(1, aggression));
		const next = rand() < pBranch ? 1 + Math.floor(rand() * alts) : 0;
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
		let allowed = t.topSpeed;
		for (let j = 0; j < 26; j++) {
			const vC = this.cornerSpeed(idx + j, t);
			const d = Math.max(0, j * this.spacing - 2);
			const v = Math.sqrt(vC * vC + 2 * t.brakeAccel * d);
			if (v < allowed) allowed = v;
		}

		// Pure pursuit at a speed-scaled lookahead; when off the ribbon, aim
		// at the nearest centerline point instead to rejoin the track.
		const lookPts = Math.min(12, Math.max(1, Math.round((3 + s.speed * 0.45) / this.spacing)));
		const target = s.onRibbon
			? this.route[(idx + lookPts) % n]
			: this.route[(idx + 2) % n];
		const dx = target.x - s.x;
		const dz = target.z - s.z;
		const cross = s.hx * dz - s.hz * dx;
		const dot = s.hx * dx + s.hz * dz;
		const steer = Math.max(
			-1,
			Math.min(1, -Math.atan2(cross, Math.max(Math.abs(dot), 0.001) * Math.sign(dot || 1)) * t.steerGain)
		);

		const wrongWay = dot < 0;
		let throttle = 0;
		let brake = 0;
		if (wrongWay) {
			throttle = 0.35;
		} else if (s.speed > allowed + 0.8) {
			brake = 1;
		} else if (s.speed < allowed - 0.8) {
			throttle = s.onRibbon ? 1 : 0.55;
		} else {
			throttle = 0.35;
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
	 * Should this vehicle fire now? True when the weapon is off cooldown, the
	 * aggression-scaled extra delay has passed, the shooter is not disrupted
	 * (restraint: disrupted AI concentrates on recovering), and some valid
	 * target sits within the aggression-scaled range and a tightened cone.
	 * The harness then routes the actual shot through the shared fire path.
	 */
	wantsFire(
		self: Combatant,
		others: Combatant[],
		ct: CombatTuning,
		t: AiTuning,
		nowMs: number
	): boolean {
		if (nowMs < this.nextOkMs.emp) return false;
		if (self.combat.isDisrupted(nowMs)) return false;
		if (!self.combat.canUse('emp', nowMs, ct.empCooldownSec)) return false;
		const aggr = Math.max(0, Math.min(1, t.aggression));
		const range = ct.empRange * (0.45 + 0.55 * aggr);
		const cosLimit = Math.cos((((ct.empConeDeg / 2) * 0.8) * Math.PI) / 180);
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
	 * Drop oil when a live rival is close behind and roughly on the AI's
	 * tail (the slick lands right in their path). Same restraint pattern as
	 * wantsFire: never while disrupted, own decision delay per weapon.
	 */
	wantsOil(
		self: Combatant,
		others: Combatant[],
		ct: CombatTuning,
		t: AiTuning,
		nowMs: number
	): boolean {
		if (nowMs < this.nextOkMs.oil) return false;
		if (self.combat.isDisrupted(nowMs)) return false;
		if (!self.combat.canUse('oil', nowMs, ct.oilCooldownSec)) return false;
		const aggr = Math.max(0, Math.min(1, t.aggression));
		const range = 9 + 8 * aggr;
		for (const o of others) {
			if (o.id === self.id || o.combat.eliminated || o.combat.isOut(nowMs)) continue;
			const dx = o.x - self.x;
			const dz = o.z - self.z;
			const dist = Math.hypot(dx, dz);
			if (dist > range || dist < 0.001) continue;
			// Behind: the rival sits opposite the AI's heading.
			if ((dx * self.hx + dz * self.hz) / dist > -0.45) continue;
			return true;
		}
		return false;
	}

	/**
	 * Fire the tether at a target ahead that sits BEYOND comfortable EMP
	 * range but inside tether range: the yank is the long-reach tool.
	 */
	wantsTether(
		self: Combatant,
		others: Combatant[],
		ct: CombatTuning,
		t: AiTuning,
		nowMs: number
	): boolean {
		if (nowMs < this.nextOkMs.tether) return false;
		if (self.combat.isDisrupted(nowMs)) return false;
		if (!self.combat.canUse('tether', nowMs, ct.tetherCooldownSec)) return false;
		const aggr = Math.max(0, Math.min(1, t.aggression));
		const maxRange = ct.tetherRange * (0.55 + 0.45 * aggr);
		const minRange = ct.empRange * 0.8;
		const cosLimit = Math.cos((((ct.tetherConeDeg / 2) * 0.8) * Math.PI) / 180);
		for (const o of others) {
			if (o.id === self.id || o.combat.eliminated || o.combat.isOut(nowMs)) continue;
			const dx = o.x - self.x;
			const dz = o.z - self.z;
			const dist = Math.hypot(dx, dz);
			if (dist > maxRange || dist < minRange) continue;
			if ((dx * self.hx + dz * self.hz) / dist < cosLimit) continue;
			return true;
		}
		return false;
	}

	/** Called after a successful use: cooldown plus aggression-scaled delay. */
	scheduleNextUse(weapon: AiWeapon, nowMs: number, cooldownSec: number, t: AiTuning): void {
		const aggr = Math.max(0, Math.min(1, t.aggression));
		const extraSec = (1.6 - 1.4 * aggr) * (0.6 + 0.8 * Math.random());
		this.nextOkMs[weapon] = nowMs + (cooldownSec + Math.max(0.1, extraSec)) * 1000;
	}

	/**
	 * Should this vehicle fire the equipped weapon in `slot` now? The wantsFire
	 * pattern applied to the weapon's own def: off slot cooldown, past the
	 * aggression-scaled restraint delay, not disrupted, and a valid target
	 * inside the def's aggression-scaled range and tightened cone (kinetic uses
	 * its hit-scan cone, guided its lock cone — the harness additionally
	 * requires a COMPLETE lock before a guided launch actually happens).
	 * Deliberately simple; real weapon tactics are Phase 9.
	 */
	wantsWeaponFire(
		self: Combatant,
		others: Combatant[],
		slot: WeaponSlotId,
		def: WeaponDef,
		t: AiTuning,
		nowMs: number,
		cooldownScale = 1
	): boolean {
		if (nowMs < this.nextSlotOkMs[slot]) return false;
		if (self.combat.isDisrupted(nowMs)) return false;
		if (!self.combat.canUseSlot(slot, nowMs, def.cooldownSec * cooldownScale)) return false;
		const baseRange = def.kinetic?.range ?? def.guided?.lockRange ?? 0;
		const coneDeg = def.kinetic?.coneDeg ?? def.guided?.lockConeDeg ?? 0;
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
		t: AiTuning,
		nowMs: number,
		cooldownScale = 1
	): boolean {
		if (nowMs < this.nextSlotOkMs[slot]) return false;
		if (self.combat.isDisrupted(nowMs)) return false;
		if (!self.combat.canUseSlot(slot, nowMs, def.cooldownSec * cooldownScale)) return false;
		const a = def.area;
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
		t: AiTuning,
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
		t: AiTuning,
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
	scheduleSlotUse(slot: WeaponSlotId, nowMs: number, cooldownSec: number, t: AiTuning): void {
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

	/** Overcharge Repair: pop it once the chassis (the life pool) is bitten
	 * below half. */
	wantsRepair(self: Combatant, _nowMs: number): boolean {
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
