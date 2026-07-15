/**
 * GREENLINE combat: health, damage, disruption states, and the disruption
 * weapon. Pure logic (no three.js, no cannon-es, no Svelte), usable by ANY
 * vehicle: the player, the scripted dummy, and future AI each own a
 * `VehicleCombat` and fire through `tryFire` with themselves as the shooter.
 * The harness owns physics and visuals; it turns the facts returned here
 * (fire results, drive modifiers, recovery events) into forces, HUD, and
 * flashes. New weapon types slot in as new fire functions over the same
 * `Combatant` / `VehicleCombat` primitives.
 */

export type GreenlineMode = 'race' | 'elimination';

/** The four disruption tools. Every one cools down per vehicle, per weapon. */
export type WeaponId = 'emp' | 'oil' | 'tether' | 'ram';

export interface CombatTuning {
	maxHealth: number;
	/** EMP burst: damage per hit. */
	empDamage: number;
	/** EMP burst: forward range, world units. */
	empRange: number;
	/** EMP burst: full cone angle, degrees. */
	empConeDeg: number;
	empCooldownSec: number;
	/** How long a hit disrupts the target. */
	disruptionSec: number;
	/** Engine force multiplier while disrupted (boost loss), 0..1. */
	disruptEngineCut: number;
	/** Steering multiplier while disrupted, 0..1. */
	disruptSteerCut: number;
	/** Yaw kick applied on hit (rad/s), the short spin-out. */
	spinKick: number;
	/** RACE mode: immobilize duration at zero health before full-heal. */
	downSec: number;
	/** Oil slick: trigger radius, world units. */
	oilRadius: number;
	/** Oil slick: unconsumed puddle lifetime before it evaporates. */
	oilLifeSec: number;
	/** Oil slick: how long the victim's traction stays cut. */
	oilSlipSec: number;
	/** Oil slick: tire frictionSlip multiplier while oiled, 0..1. */
	oilTractionCut: number;
	oilCooldownSec: number;
	/** Tether: forward latch range, world units. */
	tetherRange: number;
	/** Tether: full latch cone, degrees. */
	tetherConeDeg: number;
	/** Tether: how long the cable holds and pulls. */
	tetherSec: number;
	/** Tether: pull force on the target, newtons. */
	tetherForce: number;
	/** Tether: damage applied once at latch. */
	tetherDamage: number;
	tetherCooldownSec: number;
	/** Ram: minimum closing speed (m/s) for a frontal hit to shockwave. */
	ramMinClosingSpeed: number;
	/** Ram: base damage to BOTH vehicles (scaled up by closing speed). */
	ramDamage: number;
	/** Ram: horizontal knock-apart impulse per vehicle, N*s. */
	ramImpulse: number;
	/** Ram: vertical pop impulse per vehicle, N*s (the violent hop). */
	ramPopUp: number;
	/** Ram: brief stun applied to both vehicles. */
	ramStunSec: number;
	ramCooldownSec: number;
}

export const COMBAT_DEFAULTS: CombatTuning = {
	maxHealth: 100,
	empDamage: 35,
	empRange: 30,
	empConeDeg: 40,
	empCooldownSec: 1.5,
	disruptionSec: 2.5,
	disruptEngineCut: 0.25,
	disruptSteerCut: 0.35,
	spinKick: 2.5,
	downSec: 3,
	oilRadius: 3.2,
	oilLifeSec: 12,
	oilSlipSec: 3,
	oilTractionCut: 0.22,
	oilCooldownSec: 6,
	tetherRange: 42,
	tetherConeDeg: 70,
	tetherSec: 1.25,
	tetherForce: 7000,
	tetherDamage: 12,
	tetherCooldownSec: 5,
	ramMinClosingSpeed: 9,
	ramDamage: 30,
	ramImpulse: 2600,
	ramPopUp: 950,
	ramStunSec: 1.1,
	ramCooldownSec: 2.5
};

/** Owner immunity window after dropping a slick (they are driving off it). */
export const OIL_ARM_SEC = 0.9;
/** How far behind the rear bumper a slick lands. */
export const OIL_DROP_BACK = 3.6;
/** Tether snaps if the target gets dragged/escapes beyond range * this. */
export const TETHER_BREAK_FACTOR = 1.4;
/** Inside this distance the cable goes slack: no pull, no slingshot orbit. */
export const TETHER_SLACK_DIST = 7;
/** Ram needs at least one vehicle hitting nose-first: heading dot >= this. */
export const RAM_FRONTAL_COS = 0.45;

/** What applying damage did to the target. */
export type DamageOutcome = 'damaged' | 'down' | 'eliminated' | 'ignored';

/**
 * Per-vehicle combat state. Health, disruption, and the zero-health
 * consequence all live here so every vehicle behaves identically; nothing in
 * this class knows which vehicle is the player.
 */
export class VehicleCombat {
	readonly id: string;
	health: number;
	eliminated = false;
	/** RACE-mode temporary setback: immobilized until this time (0 = none). */
	downUntilMs = 0;
	disruptedUntilMs = 0;
	/** Oil slick traction loss: tires stay slicked until this time. */
	oiledUntilMs = 0;
	/** Per-weapon last-use timestamps; every tool cools down independently. */
	lastUseMs: Record<WeaponId, number> = { emp: -Infinity, oil: -Infinity, tether: -Infinity, ram: -Infinity };
	lastDamageFrom: string | null = null;

	constructor(id: string, maxHealth: number) {
		this.id = id;
		this.health = maxHealth;
	}

	reset(maxHealth: number): void {
		this.health = maxHealth;
		this.eliminated = false;
		this.downUntilMs = 0;
		this.disruptedUntilMs = 0;
		this.oiledUntilMs = 0;
		this.lastUseMs = { emp: -Infinity, oil: -Infinity, tether: -Infinity, ram: -Infinity };
		this.lastDamageFrom = null;
	}

	isDown(nowMs: number): boolean {
		return !this.eliminated && nowMs < this.downUntilMs;
	}

	isDisrupted(nowMs: number): boolean {
		return nowMs < this.disruptedUntilMs;
	}

	isOiled(nowMs: number): boolean {
		return nowMs < this.oiledUntilMs;
	}

	/** Out of the round (ELIMINATION) or in the RACE setback window. */
	isOut(nowMs: number): boolean {
		return this.eliminated || this.isDown(nowMs);
	}

	canUse(weapon: WeaponId, nowMs: number, cooldownSec: number): boolean {
		return !this.isOut(nowMs) && nowMs - this.lastUseMs[weapon] >= cooldownSec * 1000;
	}

	markUsed(weapon: WeaponId, nowMs: number): void {
		this.lastUseMs[weapon] = nowMs;
	}

	/**
	 * Apply damage from a source. THE MODE BRANCH LIVES HERE AND ONLY HERE:
	 * the same damage path runs for both modes, and the single difference is
	 * what zero health means -- RACE: a temporary "down" window (recovered by
	 * `tick`, which restores full health); ELIMINATION: permanent removal.
	 */
	applyDamage(
		amount: number,
		from: string,
		mode: GreenlineMode,
		tuning: CombatTuning,
		nowMs: number
	): DamageOutcome {
		if (this.isOut(nowMs)) return 'ignored';
		this.health = Math.max(0, this.health - amount);
		this.lastDamageFrom = from;
		if (this.health > 0) return 'damaged';
		if (mode === 'race') {
			this.downUntilMs = nowMs + tuning.downSec * 1000;
			return 'down';
		}
		this.eliminated = true;
		return 'eliminated';
	}

	applyDisruption(tuning: CombatTuning, nowMs: number): void {
		this.applyStun(tuning.disruptionSec, nowMs);
	}

	/** Same disruption state, explicit duration (the ram's brief stun). */
	applyStun(seconds: number, nowMs: number): void {
		this.disruptedUntilMs = Math.max(this.disruptedUntilMs, nowMs + seconds * 1000);
	}

	applyOiled(tuning: CombatTuning, nowMs: number): void {
		this.oiledUntilMs = Math.max(this.oiledUntilMs, nowMs + tuning.oilSlipSec * 1000);
	}

	/**
	 * Per-frame upkeep. Returns 'recovered' once when a RACE down window
	 * expires: health is restored to full and the vehicle may drive again.
	 */
	tick(tuning: CombatTuning, nowMs: number): 'recovered' | null {
		if (!this.eliminated && this.downUntilMs !== 0 && nowMs >= this.downUntilMs) {
			this.downUntilMs = 0;
			this.health = tuning.maxHealth;
			this.disruptedUntilMs = 0;
			this.oiledUntilMs = 0;
			return 'recovered';
		}
		return null;
	}
}

/** How disruption/down/elimination/oil scale a vehicle's driving this frame. */
export interface DriveMods {
	engineScale: number;
	steerScale: number;
	/** Tire frictionSlip multiplier (oil slick traction loss), 0..1. */
	tractionScale: number;
}

export function driveMods(c: VehicleCombat, tuning: CombatTuning, nowMs: number): DriveMods {
	const tractionScale = c.isOiled(nowMs) ? tuning.oilTractionCut : 1;
	if (c.isOut(nowMs)) return { engineScale: 0, steerScale: 0, tractionScale };
	if (c.isDisrupted(nowMs)) {
		return {
			engineScale: tuning.disruptEngineCut,
			steerScale: tuning.disruptSteerCut,
			tractionScale
		};
	}
	return { engineScale: 1, steerScale: 1, tractionScale };
}

/** A vehicle as the weapon system sees it: pose + combat state. */
export interface Combatant {
	id: string;
	x: number;
	z: number;
	/** Unit heading (forward) vector on the ground plane. */
	hx: number;
	hz: number;
	combat: VehicleCombat;
}

export interface FireHit {
	targetId: string;
	damage: number;
	outcome: DamageOutcome;
	/** +1 / -1: which way the spin-out kick turns the target. */
	spinSign: number;
	dist: number;
}

export interface FireResult {
	fired: boolean;
	hits: FireHit[];
}

/**
 * The forward EMP burst: instant short-range cone in front of the shooter.
 * Any combatant may shoot at any list of targets; hits deal damage and apply
 * the disruption state. The caller applies physical feedback (spin kick) via
 * `spinSign`.
 */
export function tryFire(
	shooter: Combatant,
	targets: Combatant[],
	mode: GreenlineMode,
	tuning: CombatTuning,
	nowMs: number
): FireResult {
	if (!shooter.combat.canUse('emp', nowMs, tuning.empCooldownSec)) {
		return { fired: false, hits: [] };
	}
	shooter.combat.markUsed('emp', nowMs);
	const cosHalf = Math.cos(((tuning.empConeDeg / 2) * Math.PI) / 180);
	const hits: FireHit[] = [];
	for (const t of targets) {
		if (t.id === shooter.id || t.combat.eliminated) continue;
		const dx = t.x - shooter.x;
		const dz = t.z - shooter.z;
		const dist = Math.hypot(dx, dz);
		if (dist > tuning.empRange) continue;
		if (dist > 0.001 && (dx * shooter.hx + dz * shooter.hz) / dist < cosHalf) continue;
		const outcome = t.combat.applyDamage(tuning.empDamage, shooter.id, mode, tuning, nowMs);
		if (outcome === 'ignored') continue;
		if (outcome === 'damaged') t.combat.applyDisruption(tuning, nowMs);
		hits.push({
			targetId: t.id,
			damage: tuning.empDamage,
			outcome,
			spinSign: Math.sign(shooter.hx * dz - shooter.hz * dx) || 1,
			dist
		});
	}
	return { fired: true, hits };
}

/** Seconds until a weapon is ready again (0 = ready). */
export function cooldownRemaining(
	c: VehicleCombat,
	weapon: WeaponId,
	cooldownSec: number,
	nowMs: number
): number {
	return Math.max(0, cooldownSec - (nowMs - c.lastUseMs[weapon]) / 1000);
}

// ---------------------------------------------------------------------------
// Oil slick: a ground trigger volume dropped behind the shooter. It cuts
// traction for a few seconds for WHOEVER drives through it next (single
// consumption); the owner is immune for a short arm window while driving off
// it, then it is fair game for anyone, owner included.
// ---------------------------------------------------------------------------

export interface OilSlick {
	id: number;
	ownerId: string;
	x: number;
	z: number;
	createdMs: number;
	expiresMs: number;
	/** Set once consumed; the puddle is spent (harness fades the visual). */
	consumedBy: string | null;
	consumedMs: number;
}

/**
 * Drop a slick behind the shooter. Returns null when the oil tool is on
 * cooldown (or the shooter is out).
 */
export function tryDeployOil(
	shooter: Combatant,
	tuning: CombatTuning,
	nowMs: number,
	id: number
): OilSlick | null {
	if (!shooter.combat.canUse('oil', nowMs, tuning.oilCooldownSec)) return null;
	shooter.combat.markUsed('oil', nowMs);
	return {
		id,
		ownerId: shooter.id,
		x: shooter.x - shooter.hx * OIL_DROP_BACK,
		z: shooter.z - shooter.hz * OIL_DROP_BACK,
		createdMs: nowMs,
		expiresMs: nowMs + tuning.oilLifeSec * 1000,
		consumedBy: null,
		consumedMs: 0
	};
}

export interface OilTriggerEvent {
	slick: OilSlick;
	targetId: string;
}

/**
 * Per-frame slick check: the first live vehicle inside a live slick consumes
 * it and gets the traction cut. Marks the slick consumed (the harness owns
 * removal, so the visual can fade out on its own clock).
 */
export function updateOilSlicks(
	slicks: OilSlick[],
	vehicles: Combatant[],
	tuning: CombatTuning,
	nowMs: number
): OilTriggerEvent[] {
	const events: OilTriggerEvent[] = [];
	for (const s of slicks) {
		if (s.consumedBy !== null || nowMs >= s.expiresMs) continue;
		for (const v of vehicles) {
			if (v.combat.eliminated || v.combat.isOut(nowMs)) continue;
			if (v.id === s.ownerId && nowMs - s.createdMs < OIL_ARM_SEC * 1000) continue;
			const dx = v.x - s.x;
			const dz = v.z - s.z;
			if (dx * dx + dz * dz > tuning.oilRadius * tuning.oilRadius) continue;
			s.consumedBy = v.id;
			s.consumedMs = nowMs;
			v.combat.applyOiled(tuning, nowMs);
			events.push({ slick: s, targetId: v.id });
			break;
		}
	}
	return events;
}

// ---------------------------------------------------------------------------
// Tether / grapple: fires forward, latches the NEAREST vehicle ahead within
// range and cone, and holds for a duration while the harness applies the pull
// force (trajectory redirect toward the shooter). Damage is a one-time tick
// at latch; the yank is the weapon.
// ---------------------------------------------------------------------------

export interface TetherResult {
	fired: boolean;
	/** Latched target (null = fired into empty air; cooldown still spent). */
	hit: FireHit | null;
}

export function tryTether(
	shooter: Combatant,
	targets: Combatant[],
	mode: GreenlineMode,
	tuning: CombatTuning,
	nowMs: number
): TetherResult {
	if (!shooter.combat.canUse('tether', nowMs, tuning.tetherCooldownSec)) {
		return { fired: false, hit: null };
	}
	shooter.combat.markUsed('tether', nowMs);
	const cosHalf = Math.cos(((tuning.tetherConeDeg / 2) * Math.PI) / 180);
	let best: Combatant | null = null;
	let bestDist = Infinity;
	for (const t of targets) {
		if (t.id === shooter.id || t.combat.eliminated || t.combat.isOut(nowMs)) continue;
		const dx = t.x - shooter.x;
		const dz = t.z - shooter.z;
		const dist = Math.hypot(dx, dz);
		if (dist > tuning.tetherRange || dist < 0.001) continue;
		if ((dx * shooter.hx + dz * shooter.hz) / dist < cosHalf) continue;
		if (dist < bestDist) {
			best = t;
			bestDist = dist;
		}
	}
	if (!best) return { fired: true, hit: null };
	const outcome = best.combat.applyDamage(tuning.tetherDamage, shooter.id, mode, tuning, nowMs);
	const dx = best.x - shooter.x;
	const dz = best.z - shooter.z;
	return {
		fired: true,
		hit: {
			targetId: best.id,
			damage: tuning.tetherDamage,
			outcome,
			spinSign: Math.sign(shooter.hx * dz - shooter.hz * dx) || 1,
			dist: bestDist
		}
	};
}

/** A live cable. The harness owns the list and applies the pull force. */
export interface ActiveTether {
	shooterId: string;
	targetId: string;
	untilMs: number;
}

/**
 * Is this cable still holding? 'broken' when the pair separates past the
 * break distance or either end goes out of the fight; 'done' at duration end.
 */
export function tetherStatus(
	tether: ActiveTether,
	shooter: Combatant,
	target: Combatant,
	tuning: CombatTuning,
	nowMs: number
): 'active' | 'done' | 'broken' {
	if (nowMs >= tether.untilMs) return 'done';
	if (shooter.combat.isOut(nowMs) || target.combat.isOut(nowMs)) return 'broken';
	const dist = Math.hypot(target.x - shooter.x, target.z - shooter.z);
	if (dist > tuning.tetherRange * TETHER_BREAK_FACTOR) return 'broken';
	return 'active';
}

// ---------------------------------------------------------------------------
// Shockwave ram: not fired -- it TRIGGERS on a frontal vehicle-vehicle
// collision above the closing-speed threshold. Both vehicles take damage and
// a brief stun; the harness applies the knock-apart + pop-up impulses. The
// per-vehicle ram cooldown is what keeps a grinding contact from
// machine-gunning damage.
// ---------------------------------------------------------------------------

export interface RamContext {
	a: Combatant;
	b: Combatant;
	/** Closing speed along the center line, m/s (positive = approaching). */
	closingSpeed: number;
	/** dot(heading of A, unit direction A->B): 1 = nose-first. */
	frontalityA: number;
	/** dot(heading of B, unit direction B->A). */
	frontalityB: number;
}

export interface RamResult {
	triggered: boolean;
	/** Damage dealt to EACH vehicle (already applied). */
	damage: number;
	outcomeA: DamageOutcome;
	outcomeB: DamageOutcome;
}

export function tryRam(
	ctx: RamContext,
	mode: GreenlineMode,
	tuning: CombatTuning,
	nowMs: number
): RamResult {
	const none: RamResult = { triggered: false, damage: 0, outcomeA: 'ignored', outcomeB: 'ignored' };
	if (ctx.closingSpeed < tuning.ramMinClosingSpeed) return none;
	if (Math.max(ctx.frontalityA, ctx.frontalityB) < RAM_FRONTAL_COS) return none;
	if (
		!ctx.a.combat.canUse('ram', nowMs, tuning.ramCooldownSec) ||
		!ctx.b.combat.canUse('ram', nowMs, tuning.ramCooldownSec)
	) {
		return none;
	}
	ctx.a.combat.markUsed('ram', nowMs);
	ctx.b.combat.markUsed('ram', nowMs);
	// Harder hits hurt more: scale from base at threshold up to 1.6x.
	const violence = Math.min(1.6, Math.max(0.6, ctx.closingSpeed / (tuning.ramMinClosingSpeed * 2)));
	const damage = Math.round(tuning.ramDamage * violence);
	const outcomeA = ctx.a.combat.applyDamage(damage, ctx.b.id, mode, tuning, nowMs);
	const outcomeB = ctx.b.combat.applyDamage(damage, ctx.a.id, mode, tuning, nowMs);
	if (outcomeA === 'damaged') ctx.a.combat.applyStun(tuning.ramStunSec, nowMs);
	if (outcomeB === 'damaged') ctx.b.combat.applyStun(tuning.ramStunSec, nowMs);
	return { triggered: true, damage, outcomeA, outcomeB };
}
