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

export interface CombatTuning {
	maxHealth: number;
	/** EMP burst: damage per hit. */
	empDamage: number;
	/** EMP burst: forward range, world units. */
	empRange: number;
	/** EMP burst: full cone angle, degrees. */
	empConeDeg: number;
	weaponCooldownSec: number;
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
}

export const COMBAT_DEFAULTS: CombatTuning = {
	maxHealth: 100,
	empDamage: 35,
	empRange: 30,
	empConeDeg: 40,
	weaponCooldownSec: 1.5,
	disruptionSec: 2.5,
	disruptEngineCut: 0.25,
	disruptSteerCut: 0.35,
	spinKick: 2.5,
	downSec: 3
};

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
	lastFireMs = -Infinity;
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
		this.lastFireMs = -Infinity;
		this.lastDamageFrom = null;
	}

	isDown(nowMs: number): boolean {
		return !this.eliminated && nowMs < this.downUntilMs;
	}

	isDisrupted(nowMs: number): boolean {
		return nowMs < this.disruptedUntilMs;
	}

	/** Out of the round (ELIMINATION) or in the RACE setback window. */
	isOut(nowMs: number): boolean {
		return this.eliminated || this.isDown(nowMs);
	}

	canFire(nowMs: number, cooldownSec: number): boolean {
		return !this.isOut(nowMs) && nowMs - this.lastFireMs >= cooldownSec * 1000;
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
		this.disruptedUntilMs = Math.max(
			this.disruptedUntilMs,
			nowMs + tuning.disruptionSec * 1000
		);
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
			return 'recovered';
		}
		return null;
	}
}

/** How disruption/down/elimination scale a vehicle's driving this frame. */
export interface DriveMods {
	engineScale: number;
	steerScale: number;
}

export function driveMods(c: VehicleCombat, tuning: CombatTuning, nowMs: number): DriveMods {
	if (c.isOut(nowMs)) return { engineScale: 0, steerScale: 0 };
	if (c.isDisrupted(nowMs)) {
		return { engineScale: tuning.disruptEngineCut, steerScale: tuning.disruptSteerCut };
	}
	return { engineScale: 1, steerScale: 1 };
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
	if (!shooter.combat.canFire(nowMs, tuning.weaponCooldownSec)) {
		return { fired: false, hits: [] };
	}
	shooter.combat.lastFireMs = nowMs;
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

/** Seconds until the weapon is ready again (0 = ready). */
export function cooldownRemaining(c: VehicleCombat, cooldownSec: number, nowMs: number): number {
	return Math.max(0, cooldownSec - (nowMs - c.lastFireMs) / 1000);
}
