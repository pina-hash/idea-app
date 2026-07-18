/**
 * GREENLINE combat: zoned three-pool health (armor / chassis / mount),
 * damage routing, disruption states, and the disruption weapons. Pure logic
 * (no three.js, no cannon-es, no Svelte), usable by ANY vehicle: the player,
 * the scripted dummy, and future AI each own a `VehicleCombat` and fire
 * through `tryFire` with themselves as the shooter.
 * The harness owns physics and visuals; it turns the facts returned here
 * (fire results, drive modifiers, recovery events) into forces, HUD, and
 * flashes. New weapon types slot in as new fire functions over the same
 * `Combatant` / `VehicleCombat` primitives.
 */

export type GreenlineMode = 'race' | 'elimination';

/** The four disruption tools. Every one cools down per vehicle, per weapon. */
export type WeaponId = 'emp' | 'oil' | 'tether' | 'ram';

export interface CombatTuning {
	/** TOTAL durability budget, split into armor/chassis/mount by the
	 * vehicle's archetype pool split (see splitPools / loadout pools). */
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

// ---------------------------------------------------------------------------
// Hit zones + the three health pools. WHERE a hit lands on the TARGET's own
// body (relative to its facing, never the shooter's aim) decides which pool
// takes it: front/side hits drain ARMOR first, rear hits drain the weapon
// MOUNT first, and overflow from an emptied shield pool carries into CHASSIS
// in the same hit. Chassis is the only "life": chassis zero is the one
// down/elimination trigger, exactly where the flat pool's zero used to be.
// ---------------------------------------------------------------------------

/** Where a hit lands on the target's body, relative to its own facing. */
export type HitZone = 'front' | 'side' | 'rear';

/** cos(60 deg): a 120-degree nose arc classifies as 'front'. */
export const ZONE_FRONT_COS = 0.5;
/** cos(120 deg): a 120-degree tail arc classifies as 'rear'. */
export const ZONE_REAR_COS = -0.5;

/**
 * Zone from dot(target unit heading, unit direction target -> attack source).
 * The ram's frontality values are exactly this dot, so they feed in directly.
 */
export function zoneFromDot(towardSourceDot: number): HitZone {
	if (towardSourceDot >= ZONE_FRONT_COS) return 'front';
	if (towardSourceDot <= ZONE_REAR_COS) return 'rear';
	return 'side';
}

/**
 * Classify a hit from the attack's travel direction (source -> target, any
 * length) and the target's unit heading. Facing-relative by construction:
 * the same shot is front armor on a target facing the shooter and rear
 * mount on one driving away.
 */
export function classifyHitZone(
	travelX: number,
	travelZ: number,
	targetHx: number,
	targetHz: number
): HitZone {
	const len = Math.hypot(travelX, travelZ);
	if (len < 1e-6) return 'side';
	return zoneFromDot(-(travelX * targetHx + travelZ * targetHz) / len);
}

/** Per-pool maximums for one vehicle. */
export interface PoolMaxes {
	armor: number;
	chassis: number;
	mount: number;
}

/** Fractions of a total durability budget, summing to 1 (archetype data). */
export interface PoolSplit {
	armor: number;
	chassis: number;
	mount: number;
}

/** Neutral split (the HANDLING baseline) for pool-less callers. */
export const DEFAULT_POOL_SPLIT: PoolSplit = { armor: 0.3, chassis: 0.55, mount: 0.15 };

/**
 * Divide a total durability budget into the three pools. Chassis absorbs the
 * rounding remainder so the pools always sum to the budget; every pool is at
 * least 1 so a zero max can never divide-by-zero a fraction readout.
 */
export function splitPools(total: number, split: PoolSplit = DEFAULT_POOL_SPLIT): PoolMaxes {
	const budget = Math.max(3, Math.round(total));
	const armor = Math.max(1, Math.round(budget * split.armor));
	const mount = Math.max(1, Math.round(budget * split.mount));
	return { armor, mount, chassis: Math.max(1, budget - armor - mount) };
}

/** What applying damage did to the target. */
export type DamageOutcome = 'damaged' | 'down' | 'eliminated' | 'ignored';

/**
 * Full outcome of one hit: which pool absorbed what, plus one-time edges
 * (a pool crossing zero ON THIS HIT) so the harness can fire strip/disable
 * feedback exactly once instead of polling pool state every frame.
 */
export interface DamageResult {
	outcome: DamageOutcome;
	zone: HitZone;
	/** Damage each pool absorbed this hit (post-resist; overflow included). */
	armor: number;
	mount: number;
	chassis: number;
	/** Armor crossed to zero on this hit (plates gone, front/side now bleed through). */
	armorStripped: boolean;
	/** Mount crossed to zero on this hit (weapon systems offline until full heal). */
	mountDisabled: boolean;
	/** Chassis crossed to zero on this hit (equivalent to outcome down/eliminated). */
	chassisDepleted: boolean;
}

const IGNORED_RESULT = (zone: HitZone): DamageResult => ({
	outcome: 'ignored',
	zone,
	armor: 0,
	mount: 0,
	chassis: 0,
	armorStripped: false,
	mountDisabled: false,
	chassisDepleted: false
});

/**
 * Per-vehicle incoming-effect multipliers, set by the loadout layer (neutral
 * = 1). They live on VehicleCombat because they are per-vehicle combat state:
 * the pure weapon functions consume them without knowing about loadouts.
 * `reset()` deliberately does NOT touch them; the owner (the harness's
 * loadout application) manages their lifecycle.
 */
export interface ResistMods {
	/** Scales every disruption/stun duration received. */
	disruption: number;
	/** Scales the oil slick traction-loss duration received. */
	oilSlip: number;
	/** Scales ram damage received. */
	impactDamage: number;
	/** Scales the EMP spin-out kick received (the harness applies it). */
	spinKick: number;
}

/**
 * Per-vehicle combat state. The three health pools, disruption, and the
 * chassis-zero consequence all live here so every vehicle behaves
 * identically; nothing in this class knows which vehicle is the player.
 */
export class VehicleCombat {
	readonly id: string;
	/** Front/side shield pool: absorbs nose and flank hits until stripped. */
	armorHealth: number;
	maxArmor: number;
	/** The life pool: overflow and bare-zone hits land here; zero = down/out. */
	chassisHealth: number;
	maxChassis: number;
	/** Rear shield pool: absorbs tail hits; zero = weapon systems offline. */
	mountHealth: number;
	maxMount: number;
	/** Incoming-effect multipliers from the equipped build (neutral = 1). */
	resist: ResistMods = { disruption: 1, oilSlip: 1, impactDamage: 1, spinKick: 1 };
	eliminated = false;
	/** RACE-mode temporary setback: immobilized until this time (0 = none). */
	downUntilMs = 0;
	disruptedUntilMs = 0;
	/** Oil slick traction loss: tires stay slicked until this time. */
	oiledUntilMs = 0;
	/** Per-weapon last-use timestamps; every tool cools down independently. */
	lastUseMs: Record<WeaponId, number> = { emp: -Infinity, oil: -Infinity, tether: -Infinity, ram: -Infinity };
	lastDamageFrom: string | null = null;

	constructor(id: string, pools: PoolMaxes) {
		this.id = id;
		this.armorHealth = pools.armor;
		this.maxArmor = pools.armor;
		this.chassisHealth = pools.chassis;
		this.maxChassis = pools.chassis;
		this.mountHealth = pools.mount;
		this.maxMount = pools.mount;
	}

	reset(pools: PoolMaxes): void {
		this.armorHealth = pools.armor;
		this.maxArmor = pools.armor;
		this.chassisHealth = pools.chassis;
		this.maxChassis = pools.chassis;
		this.mountHealth = pools.mount;
		this.maxMount = pools.mount;
		this.eliminated = false;
		this.downUntilMs = 0;
		this.disruptedUntilMs = 0;
		this.oiledUntilMs = 0;
		this.lastUseMs = { emp: -Infinity, oil: -Infinity, tether: -Infinity, ram: -Infinity };
		this.lastDamageFrom = null;
	}

	/** Weapon systems offline: the rear mount pool has been destroyed. */
	get mountDown(): boolean {
		return this.mountHealth <= 0;
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
		// A destroyed mount takes the three FIRED tools offline until the next
		// full heal. The passive ram is deliberately exempt: it is nose-first
		// chassis contact, not a mount system, and because tryRam requires
		// canUse from BOTH vehicles, gating it here would make a mount-dead
		// vehicle immune to ram damage.
		if (this.mountDown && weapon !== 'ram') return false;
		return !this.isOut(nowMs) && nowMs - this.lastUseMs[weapon] >= cooldownSec * 1000;
	}

	markUsed(weapon: WeaponId, nowMs: number): void {
		this.lastUseMs[weapon] = nowMs;
	}

	/**
	 * Apply damage from a source, routed by hit zone: front/side drain armor
	 * first, rear drains the mount first, and overflow past an emptied (or
	 * already-empty) shield pool carries into chassis in the SAME hit, never
	 * wasted. Resist multipliers stay applied to the raw amount at the call
	 * sites (tryRam), before routing. THE MODE BRANCH LIVES HERE AND ONLY
	 * HERE: chassis zero means RACE = a temporary "down" window (recovered by
	 * `tick`, which restores all three pools); ELIMINATION = permanent
	 * removal.
	 */
	applyDamage(
		amount: number,
		from: string,
		mode: GreenlineMode,
		tuning: CombatTuning,
		nowMs: number,
		zone: HitZone = 'front'
	): DamageResult {
		if (this.isOut(nowMs)) return IGNORED_RESULT(zone);
		let remaining = Math.max(0, amount);
		let armorTaken = 0;
		let mountTaken = 0;
		let armorStripped = false;
		let mountDisabled = false;
		if (zone === 'rear') {
			if (this.mountHealth > 0 && remaining > 0) {
				mountTaken = Math.min(this.mountHealth, remaining);
				this.mountHealth -= mountTaken;
				remaining -= mountTaken;
				if (this.mountHealth <= 0) mountDisabled = true;
			}
		} else if (this.armorHealth > 0 && remaining > 0) {
			armorTaken = Math.min(this.armorHealth, remaining);
			this.armorHealth -= armorTaken;
			remaining -= armorTaken;
			if (this.armorHealth <= 0) armorStripped = true;
		}
		const chassisTaken = Math.min(this.chassisHealth, remaining);
		this.chassisHealth -= chassisTaken;
		this.lastDamageFrom = from;
		const base = {
			zone,
			armor: armorTaken,
			mount: mountTaken,
			chassis: chassisTaken,
			armorStripped,
			mountDisabled,
			chassisDepleted: this.chassisHealth <= 0
		};
		if (this.chassisHealth > 0) return { outcome: 'damaged', ...base };
		if (mode === 'race') {
			this.downUntilMs = nowMs + tuning.downSec * 1000;
			return { outcome: 'down', ...base };
		}
		this.eliminated = true;
		return { outcome: 'eliminated', ...base };
	}

	applyDisruption(tuning: CombatTuning, nowMs: number): void {
		this.applyStun(tuning.disruptionSec, nowMs);
	}

	/**
	 * Same disruption state, explicit duration (the ram's brief stun).
	 * Scaled by this vehicle's disruption resistance.
	 */
	applyStun(seconds: number, nowMs: number): void {
		this.disruptedUntilMs = Math.max(
			this.disruptedUntilMs,
			nowMs + seconds * this.resist.disruption * 1000
		);
	}

	applyOiled(tuning: CombatTuning, nowMs: number): void {
		this.oiledUntilMs = Math.max(
			this.oiledUntilMs,
			nowMs + tuning.oilSlipSec * this.resist.oilSlip * 1000
		);
	}

	/**
	 * Per-frame upkeep. Returns 'recovered' once when a RACE down window
	 * expires: ALL THREE pools are restored to this vehicle's own full
	 * values (the full heal is also what brings a destroyed mount back
	 * online) and the vehicle may drive again.
	 */
	tick(nowMs: number): 'recovered' | null {
		if (!this.eliminated && this.downUntilMs !== 0 && nowMs >= this.downUntilMs) {
			this.downUntilMs = 0;
			this.armorHealth = this.maxArmor;
			this.chassisHealth = this.maxChassis;
			this.mountHealth = this.maxMount;
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
	/** Zone-routed pool outcome of this hit (see DamageResult). */
	result: DamageResult;
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
		// The burst lands on whichever face of the TARGET points back at the
		// shooter: classify off the target's own heading, not the aim cone.
		const zone = classifyHitZone(dx, dz, t.hx, t.hz);
		const result = t.combat.applyDamage(tuning.empDamage, shooter.id, mode, tuning, nowMs, zone);
		if (result.outcome === 'ignored') continue;
		if (result.outcome === 'damaged') t.combat.applyDisruption(tuning, nowMs);
		hits.push({
			targetId: t.id,
			damage: tuning.empDamage,
			result,
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
	const dx = best.x - shooter.x;
	const dz = best.z - shooter.z;
	// The hook bites the face of the TARGET nearest the shooter.
	const zone = classifyHitZone(dx, dz, best.hx, best.hz);
	const result = best.combat.applyDamage(
		tuning.tetherDamage,
		shooter.id,
		mode,
		tuning,
		nowMs,
		zone
	);
	return {
		fired: true,
		hit: {
			targetId: best.id,
			damage: tuning.tetherDamage,
			result,
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
	/** Damage dealt to each side (already applied; per-vehicle armor scales it). */
	damageA: number;
	damageB: number;
	resultA: DamageResult;
	resultB: DamageResult;
}

export function tryRam(
	ctx: RamContext,
	mode: GreenlineMode,
	tuning: CombatTuning,
	nowMs: number
): RamResult {
	const none: RamResult = {
		triggered: false,
		damageA: 0,
		damageB: 0,
		resultA: IGNORED_RESULT('front'),
		resultB: IGNORED_RESULT('front')
	};
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
	// Harder hits hurt more: scale from base at threshold up to 1.6x; each
	// side then takes it through its own impact resistance (armor plating).
	const violence = Math.min(1.6, Math.max(0.6, ctx.closingSpeed / (tuning.ramMinClosingSpeed * 2)));
	const damageA = Math.round(tuning.ramDamage * violence * ctx.a.combat.resist.impactDamage);
	const damageB = Math.round(tuning.ramDamage * violence * ctx.b.combat.resist.impactDamage);
	// The frontality dots ARE the toward-source dots each side needs (unit
	// direction to the other vehicle vs own heading), so they classify the
	// zone directly: a nose-first rammer takes it on the armor, the vehicle
	// it punts in the tail takes it on the mount.
	const resultA = ctx.a.combat.applyDamage(
		damageA,
		ctx.b.id,
		mode,
		tuning,
		nowMs,
		zoneFromDot(ctx.frontalityA)
	);
	const resultB = ctx.b.combat.applyDamage(
		damageB,
		ctx.a.id,
		mode,
		tuning,
		nowMs,
		zoneFromDot(ctx.frontalityB)
	);
	if (resultA.outcome === 'damaged') ctx.a.combat.applyStun(tuning.ramStunSec, nowMs);
	if (resultB.outcome === 'damaged') ctx.b.combat.applyStun(tuning.ramStunSec, nowMs);
	return { triggered: true, damageA, damageB, resultA, resultB };
}
