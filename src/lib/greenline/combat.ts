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

/** The four disruption tools. Every one cools down per vehicle, per weapon.
 * These are the FIXED, always-on utility tools every vehicle carries
 * regardless of build; the equippable weapons below are a separate, parallel
 * system (see WeaponDef / WeaponSlotId), not an extension of this union. */
export type WeaponId = 'emp' | 'oil' | 'tether' | 'ram';

// ---------------------------------------------------------------------------
// Equippable weapons: the loadout-chosen firepower occupying the two mount
// slots (weaponPrimary / weaponSecondary in Loadout.parts). The catalog is the
// balance sheet, the loadout.ts convention; loadout.ts imports from here (the
// PoolSplit direction), never the reverse, so this file stays pure and
// dependency-free. Only two entries have real fire logic this pass (Phase 4a);
// the shape is built to hold all six categories as Phase 4b fills them in.
// ---------------------------------------------------------------------------

/** The two equip slots. Cooldowns key on the SLOT (the weapon occupying a
 * slot changes between builds), never the weapon id. */
export type WeaponSlotId = 'weaponPrimary' | 'weaponSecondary';

export const WEAPON_SLOTS: WeaponSlotId[] = ['weaponPrimary', 'weaponSecondary'];

/** "Nothing equipped" sentinel for the secondary slot (a low-capacity build
 * may only afford one weapon). Stored in Loadout.parts like a part id. */
export const WEAPON_NONE = 'weapon-none';

/** The six weapon families the framework must hold (build plan section 5). */
export type WeaponCategory = 'kinetic' | 'guided' | 'turret' | 'defensive' | 'melee' | 'area';

/** Kinetic: instant forward hit-scan cone (the tryFire shape, no disruption). */
export interface KineticWeaponParams {
	damage: number;
	range: number;
	coneDeg: number;
}

/** Guided: lock-on then a real multi-frame projectile that steers to target. */
export interface GuidedWeaponParams {
	damage: number;
	/** Lock acquisition range / full cone, world units / degrees. */
	lockRange: number;
	lockConeDeg: number;
	/** Dwell before the lock completes; breaking the cone resets it. */
	lockTimeSec: number;
	/** Projectile flight, m/s. */
	projectileSpeed: number;
	/** Max steering rate toward the target, rad/s. */
	turnRateRadPerSec: number;
	/** Projectile self-destructs after this long (a dodged rocket expires). */
	lifetimeSec: number;
	/** Contact radius against the locked target. */
	hitRadius: number;
	/**
	 * Area-of-effect payload (Cluster Missile). When set, a direct hit ALSO
	 * splashes `splashDamageFraction` of the hit damage to every OTHER live
	 * vehicle within `splashRadius` of the impact point. Homing Rocket leaves
	 * both undefined and stays strictly single-target (zero behavior change).
	 */
	splashRadius?: number;
	splashDamageFraction?: number;
}

/**
 * Area: a persistent ground hazard dropped behind the deployer (the OilSlick
 * structural pattern — race-level world object owned by the harness — but
 * NOT single-consumption: it can trigger repeatedly, against multiple
 * vehicles or the same vehicle again, over its whole lifetime). Deals small
 * direct puncture damage, never a traction/slip effect (that stays oil's
 * job), with a brief per-vehicle immunity window after each trigger so a
 * stalled car is not shredded in place.
 */
export interface AreaWeaponParams {
	/** Direct puncture damage per trigger. */
	damage: number;
	/** Trigger radius, world units. */
	radius: number;
	/** Field lifetime before it wears away. */
	lifetimeSec: number;
	/** Per-vehicle immunity after a trigger (a stalled car is not shredded). */
	retriggerImmunitySec: number;
	/** How far behind the deployer's rear bumper the field lands. */
	dropBack: number;
	/** Owner immunity while driving off their own field (mirrors OIL_ARM_SEC). */
	armSec: number;
}

export interface WeaponDef {
	id: string;
	name: string;
	/** Compact HUD-cell label. */
	shortName: string;
	category: WeaponCategory;
	/** One-line honest summary for the garage picker. */
	blurb: string;
	/** Mount-capacity points this weapon occupies (1-3 scale; archetype
	 * budgets run 3-5, see Archetype.mountCapacityBase in loadout.ts). */
	mountCost: number;
	cooldownSec: number;
	/** Present iff category === 'kinetic'. */
	kinetic?: KineticWeaponParams;
	/** Present iff category === 'guided'. */
	guided?: GuidedWeaponParams;
	/** Present iff category === 'area'. */
	area?: AreaWeaponParams;
	// Phase 4b continues: turret / defensive / melee entries add their own
	// param blocks here, exactly one block per def matching its category.
}

/**
 * The equippable-weapon catalog. Phase 4a shipped the rapid kinetic baseline
 * and the guided payoff; Phase 4b-i adds the heavy precision kinetic, the
 * close-range spread kinetic, the area-splash guided missile, and the first
 * `area` hazard, over this same shape.
 */
export const WEAPONS: WeaponDef[] = [
	{
		id: 'autocannon',
		name: 'Autocannon',
		shortName: 'AUTO',
		category: 'kinetic',
		blurb: 'Rapid light cannon: weak per hit, cheap on the mount, always relevant.',
		mountCost: 1,
		cooldownSec: 0.4,
		kinetic: { damage: 8, range: 34, coneDeg: 22 }
	},
	{
		id: 'railgun',
		name: 'Railgun',
		shortName: 'RAIL',
		category: 'kinetic',
		blurb: 'Heavy precision slug: long reach, hits like a truck, but a needle cone and a long recharge.',
		// Cost 3: the first heavy kinetic — a whole slot of a 4-budget chassis,
		// or half of SYSTEMS' 5. VELOCITY (2) literally cannot mount it.
		mountCost: 3,
		cooldownSec: 2.2,
		kinetic: { damage: 42, range: 62, coneDeg: 6 }
	},
	{
		id: 'shotgun-burst',
		name: 'Shotgun Burst',
		shortName: 'SHOT',
		category: 'kinetic',
		blurb: 'Short-range spread: brutal up close, useless at distance. Rewards closing the gap.',
		mountCost: 1,
		cooldownSec: 0.8,
		// Short range + wide cone reads as a shotgun without a distance-falloff
		// field: the tight range IS the falloff, so KineticWeaponParams is reused
		// untouched. Damage sits between Autocannon (8) and Railgun (42).
		kinetic: { damage: 22, range: 16, coneDeg: 64 }
	},
	{
		id: 'homing-rocket',
		name: 'Homing Rocket',
		shortName: 'ROCKET',
		category: 'guided',
		blurb: 'Locks a target ahead, then a live rocket chases them down. Break the cone to deny the lock.',
		mountCost: 2,
		cooldownSec: 5,
		guided: {
			damage: 30,
			lockRange: 55,
			lockConeDeg: 50,
			lockTimeSec: 0.9,
			projectileSpeed: 34,
			turnRateRadPerSec: 2.6,
			lifetimeSec: 4,
			hitRadius: 2.2
		}
	},
	{
		id: 'cluster-missile',
		name: 'Cluster Missile',
		shortName: 'CLUSTER',
		category: 'guided',
		blurb: 'Locks like a rocket, then bursts: full damage to the target, splash to everyone packed around it.',
		// Cost 3: area guided damage is the strongest thing in the batch — it
		// punishes a bunched pack, so it pays a heavy-slot price.
		mountCost: 3,
		cooldownSec: 6,
		guided: {
			damage: 26,
			lockRange: 55,
			lockConeDeg: 50,
			lockTimeSec: 1.1,
			projectileSpeed: 30,
			turnRateRadPerSec: 2.4,
			lifetimeSec: 4,
			hitRadius: 2.4,
			splashRadius: 9,
			splashDamageFraction: 0.5
		}
	},
	{
		id: 'caltrops',
		name: 'Caltrops',
		shortName: 'CALT',
		category: 'area',
		blurb: 'Scatters spikes behind you: a persistent field that punctures anyone who drives over it, again and again.',
		mountCost: 1,
		cooldownSec: 5,
		area: {
			damage: 10,
			radius: 3.4,
			lifetimeSec: 14,
			retriggerImmunitySec: 1.5,
			dropBack: 3.6,
			armSec: 0.9
		}
	}
];

export const weaponById = (id: string): WeaponDef | undefined =>
	id === WEAPON_NONE ? undefined : WEAPONS.find((w) => w.id === id);

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
	/** Equipped-weapon slot cooldowns, keyed by SLOT (not weapon id): the
	 * weapon occupying a slot can change between builds, and a swap must not
	 * inherit or leak another weapon's timer semantics beyond the slot's. */
	lastSlotUseMs: Record<WeaponSlotId, number> = { weaponPrimary: -Infinity, weaponSecondary: -Infinity };
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
		this.lastSlotUseMs = { weaponPrimary: -Infinity, weaponSecondary: -Infinity };
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

	/** canUse for an equipped-weapon slot. Same mount-death rule as the fired
	 * tools: the equipped weapons literally sit ON the mount socket, so a dead
	 * mount takes both slots offline until the next full heal. */
	canUseSlot(slot: WeaponSlotId, nowMs: number, cooldownSec: number): boolean {
		if (this.mountDown) return false;
		return !this.isOut(nowMs) && nowMs - this.lastSlotUseMs[slot] >= cooldownSec * 1000;
	}

	markSlotUsed(slot: WeaponSlotId, nowMs: number): void {
		this.lastSlotUseMs[slot] = nowMs;
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

/** Seconds until an equipped-weapon slot is ready again (0 = ready). */
export function slotCooldownRemaining(
	c: VehicleCombat,
	slot: WeaponSlotId,
	cooldownSec: number,
	nowMs: number
): number {
	return Math.max(0, cooldownSec - (nowMs - c.lastSlotUseMs[slot]) / 1000);
}

/** Per-shooter effective scaling of a weapon def (the ctFor convention:
 * offense scales with the SHOOTER's build; defense lives on the target). */
export interface WeaponFireOpts {
	/** Multiplies the def's damage (buildStats.damageDealt). Default 1. */
	damageScale?: number;
	/** Multiplies the def's cooldown (buildStats.weaponCooldown). Default 1. */
	cooldownScale?: number;
}

/**
 * Kinetic equipped weapon (Autocannon): instant hit-scan cone in front of the
 * shooter, the tryFire shape, but slot-cooldown-gated and with NO disruption
 * applied — kinetic weapons are raw chip damage, not control.
 */
export function tryFireKinetic(
	shooter: Combatant,
	targets: Combatant[],
	slot: WeaponSlotId,
	def: WeaponDef,
	mode: GreenlineMode,
	tuning: CombatTuning,
	nowMs: number,
	opts: WeaponFireOpts = {}
): FireResult {
	const k = def.kinetic;
	if (!k) return { fired: false, hits: [] };
	const cooldown = def.cooldownSec * (opts.cooldownScale ?? 1);
	if (!shooter.combat.canUseSlot(slot, nowMs, cooldown)) {
		return { fired: false, hits: [] };
	}
	shooter.combat.markSlotUsed(slot, nowMs);
	const damage = Math.max(1, Math.round(k.damage * (opts.damageScale ?? 1)));
	const cosHalf = Math.cos(((k.coneDeg / 2) * Math.PI) / 180);
	const hits: FireHit[] = [];
	for (const t of targets) {
		if (t.id === shooter.id || t.combat.eliminated) continue;
		const dx = t.x - shooter.x;
		const dz = t.z - shooter.z;
		const dist = Math.hypot(dx, dz);
		if (dist > k.range) continue;
		if (dist > 0.001 && (dx * shooter.hx + dz * shooter.hz) / dist < cosHalf) continue;
		const zone = classifyHitZone(dx, dz, t.hx, t.hz);
		const result = t.combat.applyDamage(damage, shooter.id, mode, tuning, nowMs, zone);
		if (result.outcome === 'ignored') continue;
		hits.push({
			targetId: t.id,
			damage,
			result,
			spinSign: Math.sign(shooter.hx * dz - shooter.hz * dx) || 1,
			dist
		});
	}
	return { fired: true, hits };
}

// ---------------------------------------------------------------------------
// Guided weapons (Homing Rocket): a two-stage system. Stage 1 is the LOCK, a
// per-shooter per-slot state the harness ticks every frame while the slot is
// ready: the nearest valid target inside the forward lock cone accrues
// progress over the dwell time, and leaving the cone/range (or dying) clears
// it — the counterplay. Stage 2 is a real PROJECTILE: launched only off a
// complete lock, it lives in a race-level array (the OilSlick pattern:
// world object with its own lifecycle, not per-vehicle state) and steers
// toward its target each frame until contact, expiry, or target loss.
// ---------------------------------------------------------------------------

/** A lock in progress (or complete at progress >= 1) for one shooter slot. */
export interface WeaponLock {
	shooterId: string;
	slot: WeaponSlotId;
	targetId: string;
	/** 0..1; 1 = locked, launch permitted. */
	progress: number;
}

/**
 * Tick a slot's lock. Keeps the current target while it stays valid (a nearer
 * rival never steals an acquisition in progress); a target that leaves the
 * cone/range or goes down clears the lock outright, so re-entering starts the
 * dwell from zero. Returns the new lock state (null = nothing acquirable).
 */
export function updateWeaponLock(
	current: WeaponLock | null,
	shooter: Combatant,
	targets: Combatant[],
	slot: WeaponSlotId,
	def: WeaponDef,
	dtSec: number,
	nowMs: number
): WeaponLock | null {
	const g = def.guided;
	if (!g) return null;
	const cosHalf = Math.cos(((g.lockConeDeg / 2) * Math.PI) / 180);
	const inCone = (t: Combatant): boolean => {
		if (t.id === shooter.id || t.combat.eliminated || t.combat.isOut(nowMs)) return false;
		const dx = t.x - shooter.x;
		const dz = t.z - shooter.z;
		const dist = Math.hypot(dx, dz);
		if (dist > g.lockRange || dist < 0.001) return false;
		return (dx * shooter.hx + dz * shooter.hz) / dist >= cosHalf;
	};
	// Current target still valid: the dwell continues.
	if (current) {
		const t = targets.find((c) => c.id === current.targetId);
		if (t && inCone(t)) {
			return {
				...current,
				progress: Math.min(1, current.progress + dtSec / Math.max(0.05, g.lockTimeSec))
			};
		}
	}
	// (Re)acquire: nearest valid target starts a fresh dwell.
	let best: Combatant | null = null;
	let bestDist = Infinity;
	for (const t of targets) {
		if (!inCone(t)) continue;
		const dist = Math.hypot(t.x - shooter.x, t.z - shooter.z);
		if (dist < bestDist) {
			best = t;
			bestDist = dist;
		}
	}
	if (!best) return null;
	return {
		shooterId: shooter.id,
		slot,
		targetId: best.id,
		progress: Math.min(1, dtSec / Math.max(0.05, g.lockTimeSec))
	};
}

/** A live guided projectile. Race-level state: the harness owns the array and
 * its visuals; updateProjectiles owns the flight math and hit resolution. */
export interface Projectile {
	id: number;
	ownerId: string;
	weaponId: string;
	x: number;
	z: number;
	/** Flight height, visual only (combat math is 2D on the ground plane). */
	y: number;
	/** Unit heading on the ground plane. */
	hx: number;
	hz: number;
	speed: number;
	targetId: string;
	/** Pre-resolved (shooter-build-scaled) damage, fixed at launch. */
	damage: number;
	turnRate: number;
	hitRadius: number;
	expiresMs: number;
	/** Area-splash payload, carried from the guided def (Cluster Missile).
	 * Undefined on a single-target rocket. */
	splashRadius?: number;
	splashDamageFraction?: number;
}

/**
 * Launch a guided projectile off a COMPLETE lock. Returns null (and spends
 * nothing) when the lock is missing/incomplete, the target is gone, or the
 * slot is on cooldown — a press without a lock costs nothing.
 */
export function tryLaunchGuided(
	shooter: Combatant,
	targets: Combatant[],
	slot: WeaponSlotId,
	def: WeaponDef,
	lock: WeaponLock | null,
	nowMs: number,
	id: number,
	opts: WeaponFireOpts = {}
): Projectile | null {
	const g = def.guided;
	if (!g) return null;
	if (!lock || lock.progress < 1 || lock.slot !== slot) return null;
	const target = targets.find((t) => t.id === lock.targetId);
	if (!target || target.combat.eliminated || target.combat.isOut(nowMs)) return null;
	const cooldown = def.cooldownSec * (opts.cooldownScale ?? 1);
	if (!shooter.combat.canUseSlot(slot, nowMs, cooldown)) return null;
	shooter.combat.markSlotUsed(slot, nowMs);
	return {
		id,
		ownerId: shooter.id,
		weaponId: def.id,
		x: shooter.x + shooter.hx * 0.6,
		z: shooter.z + shooter.hz * 0.6,
		y: 0.85,
		hx: shooter.hx,
		hz: shooter.hz,
		speed: g.projectileSpeed,
		targetId: lock.targetId,
		damage: Math.max(1, Math.round(g.damage * (opts.damageScale ?? 1))),
		turnRate: g.turnRateRadPerSec,
		hitRadius: g.hitRadius,
		expiresMs: nowMs + g.lifetimeSec * 1000,
		splashRadius: g.splashRadius,
		splashDamageFraction: g.splashDamageFraction
	};
}

/** One vehicle caught in a Cluster Missile's splash (never the direct target
 * or the owner). Reduced damage, already applied. */
export interface SplashHit {
	targetId: string;
	damage: number;
	result: DamageResult;
}

export interface ProjectileHit {
	projectile: Projectile;
	targetId: string;
	damage: number;
	result: DamageResult;
	/** Extra vehicles caught in the area splash (Cluster Missile). Always empty
	 * for a single-target rocket, so its handling is unchanged. */
	splash: SplashHit[];
}

export interface ProjectileUpdate {
	hits: ProjectileHit[];
	/** Missed/expired projectiles removed this frame (fizzle, no damage). */
	expired: Projectile[];
}

/**
 * Per-frame projectile step: steer toward the target's CURRENT position at
 * most turnRate, advance, and resolve contact against the locked target. A
 * projectile whose target goes out of the fight flies straight until it
 * expires. Finished projectiles (hit or expired) are spliced OUT of the array
 * in place; the returned events tell the harness which visuals to burst or
 * fade. If the projectile carries a splash payload (Cluster Missile), a direct
 * hit ALSO damages every other live vehicle within `splashRadius` of the
 * impact point at a reduced fraction — a rocket without the payload stays
 * single-target exactly as before.
 */
export function updateProjectiles(
	projectiles: Projectile[],
	vehicles: Combatant[],
	mode: GreenlineMode,
	tuning: CombatTuning,
	dtSec: number,
	nowMs: number
): ProjectileUpdate {
	const hits: ProjectileHit[] = [];
	const expired: Projectile[] = [];
	for (let i = projectiles.length - 1; i >= 0; i--) {
		const p = projectiles[i];
		if (nowMs >= p.expiresMs) {
			expired.push(p);
			projectiles.splice(i, 1);
			continue;
		}
		const target = vehicles.find((v) => v.id === p.targetId);
		const targetLive = !!target && !target.combat.eliminated && !target.combat.isOut(nowMs);
		if (targetLive && target) {
			// Steer: rotate the heading toward the target, clamped to turnRate.
			const dx = target.x - p.x;
			const dz = target.z - p.z;
			const desired = Math.atan2(dz, dx);
			const cur = Math.atan2(p.hz, p.hx);
			let delta = desired - cur;
			while (delta > Math.PI) delta -= Math.PI * 2;
			while (delta < -Math.PI) delta += Math.PI * 2;
			const maxTurn = p.turnRate * dtSec;
			const turn = Math.max(-maxTurn, Math.min(maxTurn, delta));
			const next = cur + turn;
			p.hx = Math.cos(next);
			p.hz = Math.sin(next);
		}
		p.x += p.hx * p.speed * dtSec;
		p.z += p.hz * p.speed * dtSec;
		if (targetLive && target) {
			const dist = Math.hypot(target.x - p.x, target.z - p.z);
			if (dist <= p.hitRadius) {
				// Impact travels along the rocket's own heading; the zone is
				// whichever face of the TARGET it slammed into.
				const zone = classifyHitZone(p.hx, p.hz, target.hx, target.hz);
				const result = target.combat.applyDamage(p.damage, p.ownerId, mode, tuning, nowMs, zone);
				if (result.outcome !== 'ignored') {
					// Cluster splash: reduced damage to everyone ELSE packed around
					// the impact point (never the direct target, never the owner).
					const splash: SplashHit[] = [];
					if (p.splashRadius && p.splashDamageFraction) {
						const r2 = p.splashRadius * p.splashRadius;
						const splashDamage = Math.max(1, Math.round(p.damage * p.splashDamageFraction));
						for (const other of vehicles) {
							if (other.id === target.id || other.id === p.ownerId) continue;
							if (other.combat.eliminated || other.combat.isOut(nowMs)) continue;
							const sdx = other.x - p.x;
							const sdz = other.z - p.z;
							if (sdx * sdx + sdz * sdz > r2) continue;
							// The blast radiates from the impact point outward, so it
							// lands on the face of `other` turned toward it.
							const szone = classifyHitZone(sdx, sdz, other.hx, other.hz);
							const sres = other.combat.applyDamage(splashDamage, p.ownerId, mode, tuning, nowMs, szone);
							if (sres.outcome !== 'ignored')
								splash.push({ targetId: other.id, damage: splashDamage, result: sres });
						}
					}
					hits.push({ projectile: p, targetId: target.id, damage: p.damage, result, splash });
				} else {
					expired.push(p);
				}
				projectiles.splice(i, 1);
			}
		}
	}
	return { hits, expired };
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
// Caltrops (area weapon): a persistent spike field dropped behind the deployer.
// Structurally the OilSlick pattern (race-level world object, the harness owns
// the array and visuals), but deliberately NOT single-consumption — the field
// stays live for its whole lifetime and can puncture MULTIPLE vehicles, or the
// same vehicle repeatedly, each trigger dealing small direct damage. A brief
// per-vehicle immunity window after each trigger keeps a stalled car from being
// shredded in place; there is no traction effect (that stays oil's job).
// This is an EQUIPPED weapon, so it cools down per SLOT (canUseSlot), not per
// fixed-tool id.
// ---------------------------------------------------------------------------

export interface CaltropField {
	id: number;
	ownerId: string;
	/** Catalog id, so update() can resolve the field's AreaWeaponParams. */
	weaponId: string;
	x: number;
	z: number;
	createdMs: number;
	expiresMs: number;
	/** Puncture damage per trigger, build-scaled at deploy (Projectile.damage
	 * convention: the owner's offense is fixed for the field's life). */
	damage: number;
	/** Per-vehicle next-eligible-trigger timestamps (the immunity windows). */
	nextHitMs: Record<string, number>;
}

/**
 * Deploy a caltrop field behind the shooter. Returns null when the slot is on
 * cooldown or the shooter is out. The `damage` is baked at deploy from the
 * shooter's build scale so repeated triggers stay consistent (a rocket bakes
 * its damage at launch the same way).
 */
export function tryDeployCaltrops(
	shooter: Combatant,
	slot: WeaponSlotId,
	def: WeaponDef,
	nowMs: number,
	id: number,
	opts: WeaponFireOpts = {}
): CaltropField | null {
	const a = def.area;
	if (!a) return null;
	const cooldown = def.cooldownSec * (opts.cooldownScale ?? 1);
	if (!shooter.combat.canUseSlot(slot, nowMs, cooldown)) return null;
	shooter.combat.markSlotUsed(slot, nowMs);
	return {
		id,
		ownerId: shooter.id,
		weaponId: def.id,
		x: shooter.x - shooter.hx * a.dropBack,
		z: shooter.z - shooter.hz * a.dropBack,
		createdMs: nowMs,
		expiresMs: nowMs + a.lifetimeSec * 1000,
		damage: Math.max(1, Math.round(a.damage * (opts.damageScale ?? 1))),
		nextHitMs: {}
	};
}

export interface CaltropTriggerEvent {
	field: CaltropField;
	targetId: string;
	damage: number;
	result: DamageResult;
}

/**
 * Per-frame caltrop check. UNLIKE updateOilSlicks this never consumes a field:
 * every live vehicle inside a live field's radius that is past its own immunity
 * window takes a puncture, and the field keeps going. The owner is immune only
 * during the short arm window while driving off their own drop.
 */
export function updateCaltropFields(
	fields: CaltropField[],
	vehicles: Combatant[],
	mode: GreenlineMode,
	tuning: CombatTuning,
	nowMs: number
): CaltropTriggerEvent[] {
	const events: CaltropTriggerEvent[] = [];
	for (const f of fields) {
		if (nowMs >= f.expiresMs) continue;
		const a = weaponById(f.weaponId)?.area;
		if (!a) continue;
		const r2 = a.radius * a.radius;
		for (const v of vehicles) {
			if (v.combat.eliminated || v.combat.isOut(nowMs)) continue;
			// Owner arm window: immune while driving off their own field.
			if (v.id === f.ownerId && nowMs - f.createdMs < a.armSec * 1000) continue;
			// Per-vehicle immunity: a car sitting on the field is not shredded.
			if (nowMs < (f.nextHitMs[v.id] ?? 0)) continue;
			const dx = v.x - f.x;
			const dz = v.z - f.z;
			if (dx * dx + dz * dz > r2) continue;
			f.nextHitMs[v.id] = nowMs + a.retriggerImmunitySec * 1000;
			const zone = classifyHitZone(dx, dz, v.hx, v.hz);
			const result = v.combat.applyDamage(f.damage, f.ownerId, mode, tuning, nowMs, zone);
			if (result.outcome === 'ignored') continue;
			events.push({ field: f, targetId: v.id, damage: f.damage, result });
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
