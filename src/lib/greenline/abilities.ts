/**
 * GREENLINE abilities: the drift-charged active-utility system that sits
 * PARALLEL to the equippable weapons (combat.ts / WeaponDef), never an
 * extension of them. Abilities are not weapons — they carry no mount cost,
 * occupy their own two loadout slots (abilityPrimary / abilitySecondary), and
 * draw from a shared per-vehicle DRIFT METER instead of per-slot ammo. Pure
 * logic (no three.js, no cannon-es, no Svelte), usable by ANY vehicle: the
 * catalog is the balance sheet (the WeaponDef convention), VehicleAbilities is
 * the per-vehicle state, and the harness owns the physics/visuals each ability
 * turns into (a nitro speed spike, a chassis hop, a re-seat, an instant heal,
 * a friction bump).
 *
 * Dependency direction: this file imports only the VehicleCombat TYPE from
 * combat.ts (Overcharge Repair writes its pools — the shared source of truth,
 * never duplicated here); combat.ts never imports this. loadout.ts imports the
 * catalog/ids for its ability-slot validation, exactly as it imports WeaponDef
 * ids for the weapon slots. No cycles.
 */

import type { VehicleCombat } from './combat';

/** The two ability slots. Cooldowns key on the SLOT (the ability occupying a
 * slot changes between builds), mirroring the weapon slots. */
export type AbilitySlotId = 'abilityPrimary' | 'abilitySecondary';

export const ABILITY_SLOTS: AbilitySlotId[] = ['abilityPrimary', 'abilitySecondary'];

/** "Nothing equipped" sentinel for the secondary ability slot (a
 * low-capacity build may only afford one). Stored in Loadout.parts like a
 * part id, mirroring WEAPON_NONE. */
export const ABILITY_NONE = 'ability-none';

/** The six ability families. One block per def, distinguished by category. */
export type AbilityCategory = 'nitro' | 'jump' | 'flip' | 'repair' | 'grip' | 'aircontrol';

/** Nitro Boost: a temporary engineForce multiplier for a fixed duration. */
export interface NitroAbilityParams {
	/** engineForce multiplier while active. */
	engineMul: number;
	durationSec: number;
}

/** Jump / Hop: a one-shot vertical impulse on the chassis body (N*s). Low
 * value on the current flat track by design — Phase 8's ramps exploit it. */
export interface JumpAbilityParams {
	impulse: number;
}

/** Overcharge Repair: an instant partial heal split across the health pools
 * (the split logic is VehicleCombat.repair). */
export interface RepairAbilityParams {
	amount: number;
}

/** Grip Surge: a temporary frictionSlip multiplier for a short duration. */
export interface GripAbilityParams {
	frictionMul: number;
	durationSec: number;
}

/**
 * Air Correction: ONGOING attitude control while airborne, not a one-shot
 * nudge like Jump. While the window is open AND the vehicle is off the ground,
 * the driver's own steer/throttle input is turned into corrective torque about
 * the chassis axes, so a bad launch off a jump can be rotated into a flat
 * landing. Torques are N*m applied continuously; `durationSec` is only a
 * CEILING — landing closes the window first (that is the normal ending).
 */
export interface AirControlParams {
	/** Torque about the FORWARD axis, driven by steer input (levels a roll). */
	rollTorque: number;
	/** Torque about the RIGHT axis, driven by throttle/brake (nose up/down). */
	pitchTorque: number;
	/** Hard ceiling on the window; landing normally ends it sooner. */
	durationSec: number;
}

export interface AbilityDef {
	id: string;
	name: string;
	/** Compact HUD-cell label. */
	shortName: string;
	category: AbilityCategory;
	/** One-line honest summary for the garage picker. */
	blurb: string;
	/**
	 * Ability-capacity points this ability occupies (1-3 scale). DELIBERATELY
	 * INVERTED from mountCost: the ability-capacity archetype ordering is the
	 * mirror image of weapon capacity (VELOCITY highest, SYSTEMS lowest — see
	 * Archetype.abilityCapacityBase in loadout.ts).
	 */
	slotCost: number;
	/** Fraction of a full drift meter (0..1) spent to activate. The shared
	 * meter is the gate; a per-def cooldown is a secondary throttle. */
	meterCost: number;
	/** Seconds before the SLOT can fire again (0 = meter-only gated). */
	cooldownSec: number;
	/** Present iff category === 'nitro'. */
	nitro?: NitroAbilityParams;
	/** Present iff category === 'jump'. */
	jump?: JumpAbilityParams;
	/** Present iff category === 'repair'. */
	repair?: RepairAbilityParams;
	/** Present iff category === 'grip'. */
	grip?: GripAbilityParams;
	/** Present iff category === 'aircontrol'. */
	air?: AirControlParams;
	// Emergency Flip (category === 'flip') carries no params: the re-seat has
	// no tunable of its own beyond the meter cost.
}

/**
 * The ability catalog. Meter costs are all < 1 so a full meter affords any
 * single ability; nitro/repair (the strong ones) cost the most, the utility
 * abilities (jump/flip/grip) are cheap so they can be chained off partial
 * charge. All meter-only gated (cooldownSec 0) — the drift economy is the
 * whole point.
 */
export const ABILITIES: AbilityDef[] = [
	{
		id: 'nitro-boost',
		name: 'Nitro Boost',
		shortName: 'NITRO',
		category: 'nitro',
		blurb: 'Dump the meter for a hard burst of engine power — close a gap or hold a lead.',
		// Cost 2: the headline offensive-mobility ability. VELOCITY (ability cap
		// 5) can pair it with more; SYSTEMS (cap 2) spends its whole budget on it.
		slotCost: 2,
		meterCost: 0.5,
		cooldownSec: 0,
		nitro: { engineMul: 1.8, durationSec: 2.2 }
	},
	{
		id: 'jump-hop',
		name: 'Jump / Hop',
		shortName: 'HOP',
		category: 'jump',
		blurb: 'Kick the chassis into the air. Low on flat ground today — built for the ramps to come.',
		slotCost: 1,
		meterCost: 0.35,
		cooldownSec: 0,
		jump: { impulse: 1400 }
	},
	{
		id: 'emergency-flip',
		name: 'Emergency Flip',
		shortName: 'FLIP',
		category: 'flip',
		blurb: 'Force an immediate re-seat when you land upside down, instead of waiting the watchdog out. No effect right-side up.',
		slotCost: 1,
		meterCost: 0.3,
		cooldownSec: 0
	},
	{
		id: 'overcharge-repair',
		name: 'Overcharge Repair',
		shortName: 'REPAIR',
		category: 'repair',
		blurb: 'Spend a big slice of the meter for an instant patch — pours into whatever pool is hurt worst first.',
		// Cost 2: instant durability is strong, so it prices like nitro.
		slotCost: 2,
		meterCost: 0.6,
		repair: { amount: 45 },
		cooldownSec: 0
	},
	{
		id: 'air-correction',
		name: 'Air Correction',
		shortName: 'AIR',
		category: 'aircontrol',
		blurb: 'Attitude thrusters while you are off the ground: steer to level a roll, throttle and brake to lift or drop the nose. Dead weight on the tarmac.',
		// Cost 1: powerful on a track with real air, worthless without it, so it
		// prices with the other situational utilities rather than with nitro.
		slotCost: 1,
		meterCost: 0.3,
		cooldownSec: 0,
		// Roll is the cheap axis (chassis roll inertia ~53 kg*m^2 against ~226
		// in pitch), so the two torques are deliberately asymmetric to give
		// both axes a comparable feel in the air. Measured in the harness
		// against Terminal Nine's 1.29 s deck jump.
		air: { rollTorque: 260, pitchTorque: 900, durationSec: 3 }
	},
	{
		id: 'grip-surge',
		name: 'Grip Surge',
		shortName: 'GRIP',
		category: 'grip',
		blurb: 'Briefly slam the tires down for extra bite — save a slide, hold a tighter line, shrug off oil.',
		slotCost: 1,
		meterCost: 0.35,
		cooldownSec: 0,
		grip: { frictionMul: 1.5, durationSec: 3 }
	}
];

export const abilityById = (id: string): AbilityDef | undefined =>
	id === ABILITY_NONE ? undefined : ABILITIES.find((a) => a.id === id);

// ---------------------------------------------------------------------------
// The drift meter. There is no pre-existing drift signal, so detection lives
// here as a pure function over lateral slip: a vehicle whose sideways speed
// (velocity perpendicular to its heading) is high while it is genuinely moving
// forward is drifting, and charges the meter continuously at a rate scaled by
// how hard it is sliding. A handbrake slide always counts for something. The
// meter BANKS (no passive decay) — a drift-charged resource you save up.
// ---------------------------------------------------------------------------

/** Full meter from roughly this many seconds of maximum-rate drift (a hard
 * handbrake slide fills it in well under a second; clean cornering banks it
 * over a lap or two). */
export const METER_CHARGE_PER_SEC = 2.2;
/** Below this forward speed (m/s) nothing counts as a drift (a parked spin). */
export const DRIFT_MIN_SPEED = 3;
/**
 * Lateral speed (m/s) at which charging begins. Tuned to the actual grippy
 * RaycastVehicle (measured in the harness): a clean straight sits near ~0.2 m/s
 * of lateral slip so it banks NOTHING, a committed corner runs ~0.9-1.5, and a
 * handbrake slide or oiled break spikes well past FULL — so cornering
 * aggression and slides charge the meter while straight-line cruising does not.
 */
export const DRIFT_MIN_LATERAL = 0.6;
/** Lateral speed (m/s) at which charging hits full rate. */
export const DRIFT_FULL_LATERAL = 3.0;

/**
 * 0..1 drift intensity from the vehicle's lateral speed, forward speed, and
 * handbrake state. 0 when driving straight or nearly stopped; ramps to 1 as
 * the slide gets wider. A committed handbrake slide floors at 0.5 so a
 * flick-and-hold always banks meter even before the tail fully steps out.
 */
export function driftIntensity(lateralSpeed: number, forwardSpeed: number, handbrake: boolean): number {
	if (forwardSpeed < DRIFT_MIN_SPEED) return 0;
	let i = (lateralSpeed - DRIFT_MIN_LATERAL) / (DRIFT_FULL_LATERAL - DRIFT_MIN_LATERAL);
	i = Math.max(0, Math.min(1, i));
	if (handbrake && forwardSpeed > 4) i = Math.max(i, 0.5);
	return i;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * What activating an ability did, so the harness can turn it into physics and
 * feedback (the tryLaunchGuided convention: the pure layer returns intent, the
 * harness applies the impulse / re-seat / burst).
 */
export type AbilityOutcome =
	| { kind: 'nitro'; durationSec: number; mul: number }
	| { kind: 'jump'; impulse: number }
	| { kind: 'flip' }
	| { kind: 'repair'; applied: { armor: number; chassis: number; mount: number } }
	| { kind: 'grip'; durationSec: number; mul: number }
	| { kind: 'air'; durationSec: number; rollTorque: number; pitchTorque: number };

export interface AbilityResult {
	activated: boolean;
	outcome: AbilityOutcome | null;
	/** Why it did NOT activate (never a cost spent): not enough meter / on
	 * cooldown / out, an Emergency Flip triggered while upright, or an Air
	 * Correction triggered with the wheels still down. */
	reason?: 'not-ready' | 'not-flipped' | 'not-airborne';
}

/**
 * Per-vehicle ability state: the shared drift meter both slots draw from, the
 * per-slot cooldown stamps, and the two timed effect windows (nitro / grip).
 * Nothing here knows which vehicle is the player. The health pools live on
 * VehicleCombat (the shared source of truth); this class never duplicates them.
 */
export class VehicleAbilities {
	readonly id: string;
	/** The drift meter, 0..1. Charges while drifting; abilities spend it. */
	meter = 0;
	/** Per-slot last-activation stamps (the secondary throttle beside meter). */
	lastSlotUseMs: Record<AbilitySlotId, number> = {
		abilityPrimary: -Infinity,
		abilitySecondary: -Infinity
	};
	/** Nitro active window + engineForce multiplier (1 = inactive). */
	nitroUntilMs = 0;
	nitroMul = 1;
	/** Grip Surge active window + frictionSlip multiplier (1 = inactive). */
	gripUntilMs = 0;
	gripMul = 1;
	/**
	 * Air Correction window + the torques it authorizes. Unlike nitro/grip this
	 * window is expected to be cut SHORT: the harness closes it the moment the
	 * wheels are back down, so `airUntilMs` is only the ceiling.
	 */
	airUntilMs = 0;
	airRollTorque = 0;
	airPitchTorque = 0;

	constructor(id: string) {
		this.id = id;
	}

	reset(): void {
		this.meter = 0;
		this.lastSlotUseMs = { abilityPrimary: -Infinity, abilitySecondary: -Infinity };
		this.nitroUntilMs = 0;
		this.nitroMul = 1;
		this.gripUntilMs = 0;
		this.gripMul = 1;
		this.airUntilMs = 0;
		this.airRollTorque = 0;
		this.airPitchTorque = 0;
	}

	/** Bank meter from a 0..1 drift intensity over dt seconds (no-op at 0). */
	charge(intensity01: number, dtSec: number): void {
		if (intensity01 <= 0 || dtSec <= 0) return;
		this.meter = clamp01(this.meter + METER_CHARGE_PER_SEC * clamp01(intensity01) * dtSec);
	}

	/** Enough meter AND off cooldown for this def (does NOT check out/down — the
	 * harness gates that against VehicleCombat, like the weapon fire paths). */
	ready(slot: AbilitySlotId, def: AbilityDef, nowMs: number): boolean {
		if (this.meter < def.meterCost - 1e-6) return false;
		return nowMs - this.lastSlotUseMs[slot] >= def.cooldownSec * 1000;
	}

	/** Seconds until the SLOT is off cooldown (0 = cooldown ready; the meter is
	 * a separate gate the HUD reads from `meter`). */
	cooldownRemaining(slot: AbilitySlotId, def: AbilityDef, nowMs: number): number {
		return Math.max(0, def.cooldownSec - (nowMs - this.lastSlotUseMs[slot]) / 1000);
	}

	/** Deduct the meter cost + stamp the slot cooldown. Public because the
	 * module-level `tryActivateAbility` orchestrates it (the tryFire pattern:
	 * the free function decides, the state object mutates). */
	spend(slot: AbilitySlotId, def: AbilityDef, nowMs: number): void {
		this.meter = Math.max(0, this.meter - def.meterCost);
		this.lastSlotUseMs[slot] = nowMs;
	}

	nitroActive(nowMs: number): boolean {
		return nowMs < this.nitroUntilMs;
	}

	gripActive(nowMs: number): boolean {
		return nowMs < this.gripUntilMs;
	}

	/** engineForce multiplier from an active Nitro (1 when inactive). */
	nitroMulNow(nowMs: number): number {
		return this.nitroActive(nowMs) ? this.nitroMul : 1;
	}

	/** frictionSlip multiplier from an active Grip Surge (1 when inactive). */
	gripMulNow(nowMs: number): number {
		return this.gripActive(nowMs) ? this.gripMul : 1;
	}

	airActive(nowMs: number): boolean {
		return nowMs < this.airUntilMs;
	}

	/**
	 * Close the Air Correction window immediately. The harness calls this on
	 * touchdown: the ability is attitude control for a vehicle in flight, so
	 * leaving it open on the ground would be both useless and a hidden way to
	 * torque a grounded car.
	 */
	endAirControl(): void {
		this.airUntilMs = 0;
	}
}

/**
 * Activate the ability in `slot`. Returns activated=false and spends NOTHING
 * when the vehicle is out, the meter/cooldown is not ready, or an Emergency
 * Flip is triggered while the vehicle is upright (the Homing Rocket "no lock,
 * no launch" rule — a costless no-op right-side up). Otherwise spends the meter,
 * marks the slot, applies the pure effects it owns (nitro/grip timers on this
 * state, the repair heal on the passed VehicleCombat), and hands the physical
 * intent (jump impulse, flip re-seat) back to the harness via `outcome`.
 */
export function tryActivateAbility(
	ab: VehicleAbilities,
	combat: VehicleCombat,
	slot: AbilitySlotId,
	def: AbilityDef,
	nowMs: number,
	opts: { isFlipped?: boolean; isAirborne?: boolean } = {}
): AbilityResult {
	if (combat.isOut(nowMs) || !ab.ready(slot, def, nowMs)) {
		return { activated: false, outcome: null, reason: 'not-ready' };
	}
	// Emergency Flip is inert (and free) unless the vehicle is genuinely flipped.
	if (def.category === 'flip' && !opts.isFlipped) {
		return { activated: false, outcome: null, reason: 'not-flipped' };
	}
	// Air Correction is inert (and free) with the wheels still down — the same
	// no-lock rule: no airtime, no activation, nothing spent.
	if (def.category === 'aircontrol' && !opts.isAirborne) {
		return { activated: false, outcome: null, reason: 'not-airborne' };
	}
	ab.spend(slot, def, nowMs);
	if (def.category === 'nitro' && def.nitro) {
		ab.nitroMul = def.nitro.engineMul;
		ab.nitroUntilMs = nowMs + def.nitro.durationSec * 1000;
		return {
			activated: true,
			outcome: { kind: 'nitro', durationSec: def.nitro.durationSec, mul: def.nitro.engineMul }
		};
	}
	if (def.category === 'grip' && def.grip) {
		ab.gripMul = def.grip.frictionMul;
		ab.gripUntilMs = nowMs + def.grip.durationSec * 1000;
		return {
			activated: true,
			outcome: { kind: 'grip', durationSec: def.grip.durationSec, mul: def.grip.frictionMul }
		};
	}
	if (def.category === 'aircontrol' && def.air) {
		ab.airRollTorque = def.air.rollTorque;
		ab.airPitchTorque = def.air.pitchTorque;
		ab.airUntilMs = nowMs + def.air.durationSec * 1000;
		return {
			activated: true,
			outcome: {
				kind: 'air',
				durationSec: def.air.durationSec,
				rollTorque: def.air.rollTorque,
				pitchTorque: def.air.pitchTorque
			}
		};
	}
	if (def.category === 'jump' && def.jump) {
		return { activated: true, outcome: { kind: 'jump', impulse: def.jump.impulse } };
	}
	if (def.category === 'flip') {
		return { activated: true, outcome: { kind: 'flip' } };
	}
	if (def.category === 'repair' && def.repair) {
		const applied = combat.repair(def.repair.amount);
		return { activated: true, outcome: { kind: 'repair', applied } };
	}
	return { activated: true, outcome: null };
}
