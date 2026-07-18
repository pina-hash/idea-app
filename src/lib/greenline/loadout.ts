/**
 * GREENLINE loadouts: archetypes, vehicle parts, and stat resolution. Pure
 * data + pure functions (no three.js, no cannon-es, no Svelte), the
 * curriculum.ts convention: this file IS the balance sheet for builds.
 *
 * Model: every effect is a MULTIPLIER over the harness tuning-panel baseline
 * (neutral = 1), so the panel stays the global feel-tuning surface and a
 * build reshapes it per vehicle. A resolved build is archetype effects x one
 * part per slot, multiplied per stat key.
 *
 * Design rule, the whole point of the system: NO strict upgrades. Every
 * non-stock part and every archetype buys its strength with a felt cost --
 * armor costs speed and agility, speed costs hull, grip costs oil
 * vulnerability, firepower costs fragility. Mass is deliberately dual-natured
 * ("character", not good or bad): heavier builds physically shrug tether
 * yanks, ram knockback, and spin-outs (impulse / mass), but pay for it in
 * acceleration and cornering through the same physics.
 */

import { WEAPON_NONE, weaponById, type PoolSplit } from './combat';

/** The stat surface parts may touch. Multipliers, neutral = 1. */
export type StatKey =
	// Drive / physics (applied over the tuning panel values per vehicle)
	| 'engineForce'
	| 'aeroDrag'
	| 'brakeForce'
	| 'maxSteer'
	| 'steerFalloff'
	| 'frictionSlip'
	| 'chassisMass'
	| 'suspensionStiffness'
	| 'grassDrag'
	// Combat: pools and incoming-effect resistances
	| 'maxHealth'
	| 'impactDamageTaken'
	| 'disruptionTaken'
	| 'oilSlipTaken'
	| 'spinKickTaken'
	// Combat: offense
	| 'weaponCooldown'
	| 'damageDealt'
	| 'empRange';

export type StatEffects = Partial<Record<StatKey, number>>;
export type ResolvedStats = Record<StatKey, number>;

export type ArchetypeId = 'armor' | 'velocity' | 'handling' | 'systems';
/** The four bodywork slots plus the two weapon-mount slots. The weapon slots
 * store WEAPON ids from the combat.ts catalog (or WEAPON_NONE for an empty
 * secondary), not VehiclePart ids; partById never resolves them and the
 * stat-resolution loop skips them by construction. */
export type PartSlot =
	| 'plating'
	| 'drivetrain'
	| 'tires'
	| 'systems'
	| 'weaponPrimary'
	| 'weaponSecondary';

export const WEAPON_SLOT_IDS: PartSlot[] = ['weaponPrimary', 'weaponSecondary'];

export interface Archetype {
	id: ArchetypeId;
	name: string;
	/** One-line identity for the garage card. */
	role: string;
	effects: StatEffects;
	/**
	 * How this archetype's TOTAL durability budget (the maxHealth multiplier
	 * over the tuning baseline) splits across the three damage pools: armor
	 * (front/side shield), chassis (the life), mount (rear shield / weapon
	 * systems). Fractions sum to 1; the split is archetype identity, so parts
	 * scale the total but never reshape it.
	 */
	pools: PoolSplit;
	/**
	 * Mount-capacity budget: how many weapon mount points this chassis can
	 * power across its two weapon slots. UNLIKE every StatKey this is a flat
	 * resolved number, not a neutral=1 multiplier — a budget, not a scale.
	 * Locked identity ordering: SYSTEMS highest, ARMOR/HANDLING standard,
	 * VELOCITY lowest (speed pays in firepower).
	 */
	mountCapacityBase: number;
}

export interface VehiclePart {
	id: string;
	slot: PartSlot;
	name: string;
	/** One-line flavor + honest mechanical summary. */
	blurb: string;
	effects: StatEffects;
}

export interface Loadout {
	archetype: ArchetypeId;
	/** Equipped id per slot, always fully populated: bodywork slots hold
	 * VehiclePart ids (stock counts), weapon slots hold combat.ts weapon ids
	 * (weaponSecondary may hold WEAPON_NONE). */
	parts: Record<PartSlot, string>;
}

/**
 * The chassis identity: the big rock of a build. Parts tune within (or
 * against) it. Magnitudes are deliberately bold so a swap is FELT, not read.
 */
export const ARCHETYPES: Archetype[] = [
	{
		id: 'armor',
		name: 'ARMOR',
		role: 'Juggernaut: huge hull, shrugs impacts, slow and wide',
		effects: {
			maxHealth: 1.6,
			chassisMass: 1.35,
			impactDamageTaken: 0.75,
			spinKickTaken: 0.8,
			maxSteer: 0.88,
			aeroDrag: 1.08
		},
		// Plating IS the identity: the deepest armor wall on the field over
		// the biggest chassis. Its mount is ordinary, so the rear stays the
		// honest way to hurt a juggernaut.
		pools: { armor: 0.4, chassis: 0.45, mount: 0.15 },
		mountCapacityBase: 4
	},
	{
		id: 'velocity',
		name: 'VELOCITY',
		role: 'Missile: fastest thing on the field, made of glass',
		effects: {
			engineForce: 1.15,
			aeroDrag: 0.8,
			chassisMass: 0.85,
			maxHealth: 0.7,
			impactDamageTaken: 1.15
		},
		// Stripped for speed: token plating and a bare mount; most of its
		// small budget is raw frame, so nearly every hit bleeds real life.
		pools: { armor: 0.2, chassis: 0.65, mount: 0.15 },
		// 2, not the plan's starting 3: with only the 4a weapons (costs 1+2)
		// a floor of 3 would make every budget unreachable — at 2 the missile
		// genuinely carries ONE weapon and the capacity system is live now.
		mountCapacityBase: 2
	},
	{
		id: 'handling',
		name: 'HANDLING',
		role: 'Scalpel: corners on rails, keeps steering at speed',
		effects: {
			frictionSlip: 1.2,
			maxSteer: 1.15,
			steerFalloff: 0.7,
			brakeForce: 1.15,
			suspensionStiffness: 1.15,
			maxHealth: 0.9,
			engineForce: 0.95
		},
		// The baseline split (DEFAULT_POOL_SPLIT mirrors it): no pool bias,
		// character comes from the chassis stats.
		pools: { armor: 0.3, chassis: 0.55, mount: 0.15 },
		mountCapacityBase: 4
	},
	{
		id: 'systems',
		name: 'SYSTEMS',
		role: 'Warlock: faster tools, hardened electronics, weak hull',
		effects: {
			weaponCooldown: 0.8,
			disruptionTaken: 0.65,
			empRange: 1.15,
			damageDealt: 1.1,
			maxHealth: 0.85,
			engineForce: 0.92,
			aeroDrag: 1.05
		},
		// "Systems" reads as a REINFORCED mount, not a fragile one: the role
		// text already says hardened electronics / weak hull, so the warlock
		// protects its weapons above all (hardest vehicle to disarm by rear
		// shots) and pays with thin plating over a brittle frame -- silence
		// it the hard way or just break it.
		pools: { armor: 0.22, chassis: 0.5, mount: 0.28 },
		mountCapacityBase: 5
	}
];

export const PART_SLOTS: { id: PartSlot; label: string }[] = [
	{ id: 'plating', label: 'PLATING' },
	{ id: 'drivetrain', label: 'DRIVETRAIN' },
	{ id: 'tires', label: 'TIRES' },
	{ id: 'systems', label: 'SYSTEMS' }
];

/**
 * The parts pool. First part of each slot is the no-effect stock baseline;
 * everything else trades. All unlocked (the economy layer comes later).
 */
export const PARTS: VehiclePart[] = [
	// ---- PLATING ----
	{ id: 'plating-stock', slot: 'plating', name: 'Stock Panels', blurb: 'Factory hull. No surprises.', effects: {} },
	{
		id: 'plating-composite',
		slot: 'plating',
		name: 'Composite Plate',
		blurb: 'Thick laminate hull: more health, softer impacts, heavier everything.',
		effects: { maxHealth: 1.25, impactDamageTaken: 0.85, chassisMass: 1.15 }
	},
	{
		id: 'plating-reactive',
		slot: 'plating',
		name: 'Reactive Cage',
		blurb: 'Anti-brawler exoframe: rams and spin-outs barely register, but the cage replaces structure.',
		effects: { impactDamageTaken: 0.6, spinKickTaken: 0.75, maxHealth: 0.9, chassisMass: 1.1 }
	},
	{
		id: 'plating-stripped',
		slot: 'plating',
		name: 'Stripped Chassis',
		blurb: 'Rip the panels off. Featherweight rocket, paper hull.',
		effects: { chassisMass: 0.82, maxHealth: 0.75 }
	},
	// ---- DRIVETRAIN ----
	{ id: 'drive-stock', slot: 'drivetrain', name: 'Stock Drive', blurb: 'Balanced factory power.', effects: {} },
	{
		id: 'drive-overbored',
		slot: 'drivetrain',
		name: 'Overbored Motor',
		blurb: 'Hits like a hammer out of corners; cooling scoops cap the top end.',
		effects: { engineForce: 1.3, aeroDrag: 1.1 }
	},
	{
		id: 'drive-slipstream',
		slot: 'drivetrain',
		name: 'Slipstream Gearing',
		blurb: 'Long gears and clean bodywork: monstrous top speed, lazy pull.',
		effects: { aeroDrag: 0.75, engineForce: 0.88 }
	},
	{
		id: 'drive-hotintake',
		slot: 'drivetrain',
		name: 'Hot Intake',
		blurb: 'Uncapped power with exposed electronics: stuns bite you harder.',
		effects: { engineForce: 1.2, disruptionTaken: 1.15 }
	},
	// ---- TIRES ----
	{ id: 'tires-stock', slot: 'tires', name: 'Stock Rubber', blurb: 'Does everything, excels at nothing.', effects: {} },
	{
		id: 'tires-slick',
		slot: 'tires',
		name: 'Slick Compound',
		blurb: 'Rails through corners, brakes late. Oil turns them into skates.',
		effects: { frictionSlip: 1.25, brakeForce: 1.1, oilSlipTaken: 1.4 }
	},
	{
		id: 'tires-terrain',
		slot: 'tires',
		name: 'All-Terrain Treads',
		blurb: 'The grass is a racing line now. Costs on-track bite.',
		effects: { grassDrag: 0.45, frictionSlip: 0.9 }
	},
	{
		id: 'tires-hardwall',
		slot: 'tires',
		name: 'Hardwall Tires',
		blurb: 'Stability compound: sheds oil fast, resists spin-outs, slightly wooden grip.',
		effects: { oilSlipTaken: 0.6, spinKickTaken: 0.85, frictionSlip: 0.94 }
	},
	// ---- SYSTEMS ----
	{ id: 'sys-stock', slot: 'systems', name: 'Stock Loom', blurb: 'Factory wiring.', effects: {} },
	{
		id: 'sys-capacitor',
		slot: 'systems',
		name: 'Capacitor Bank',
		blurb: 'Tools recharge fast; volatile cells eat into the hull budget.',
		effects: { weaponCooldown: 0.75, maxHealth: 0.9 }
	},
	{
		id: 'sys-faraday',
		slot: 'systems',
		name: 'Faraday Mesh',
		blurb: 'EMP hits glance off, but the shielding chokes your own emitters.',
		effects: { disruptionTaken: 0.5, weaponCooldown: 1.12 }
	},
	{
		id: 'sys-targeting',
		slot: 'systems',
		name: 'Overclocked Targeting',
		blurb: 'Longer reach, harder hits, electronics running hot enough to fry.',
		effects: { empRange: 1.3, damageDealt: 1.15, disruptionTaken: 1.25 }
	}
];

export const archetypeById = (id: string): Archetype | undefined =>
	ARCHETYPES.find((a) => a.id === id);
export const partById = (id: string): VehiclePart | undefined => PARTS.find((p) => p.id === id);
export const partsForSlot = (slot: PartSlot): VehiclePart[] => PARTS.filter((p) => p.slot === slot);

/** Stock weapon fit: Autocannon (cost 1) primary, empty secondary — sane
 * under ANY archetype's capacity budget. */
export const STOCK_WEAPON_PRIMARY = 'autocannon';

const STOCK_PARTS: Record<PartSlot, string> = {
	plating: 'plating-stock',
	drivetrain: 'drive-stock',
	tires: 'tires-stock',
	systems: 'sys-stock',
	weaponPrimary: STOCK_WEAPON_PRIMARY,
	weaponSecondary: WEAPON_NONE
};

/** Handling is the closest to the harness's tuned baseline feel. */
export function defaultLoadout(archetype: ArchetypeId = 'handling'): Loadout {
	return { archetype, parts: { ...STOCK_PARTS } };
}

// ---------------------------------------------------------------------------
// Mount capacity: the flat weapon budget. Resolution + validation live here so
// the garage UI, the storage parsers, and the race application all agree on
// one set of rules: total mount cost within the archetype's budget, and no
// duplicate weapon across the two slots.
// ---------------------------------------------------------------------------

/** The archetype's flat weapon budget (parts never touch it in this pass). */
export function mountCapacityFor(l: Loadout | ArchetypeId): number {
	const id = typeof l === 'string' ? l : l.archetype;
	return archetypeById(id)?.mountCapacityBase ?? 4;
}

/** Mount points a weapon id occupies (WEAPON_NONE / unknown ids cost 0). */
export function weaponMountCost(id: string): number {
	return weaponById(id)?.mountCost ?? 0;
}

/** Mount points the build's equipped weapons occupy together. */
export function mountCostUsed(l: Loadout): number {
	return weaponMountCost(l.parts.weaponPrimary) + weaponMountCost(l.parts.weaponSecondary);
}

/**
 * Why this build's weapon fit is invalid, or null when it is fine. The
 * garage UI blocks these combinations up front; sanitizeLoadoutWeapons is the
 * enforcement for everything else (stored data, console equips).
 */
export function weaponLoadoutIssue(l: Loadout): string | null {
	if (!weaponById(l.parts.weaponPrimary)) return 'no primary weapon equipped';
	const sec = l.parts.weaponSecondary;
	if (sec !== WEAPON_NONE && !weaponById(sec)) return 'unknown secondary weapon';
	if (sec !== WEAPON_NONE && sec === l.parts.weaponPrimary)
		return 'the same weapon cannot occupy both slots';
	if (mountCostUsed(l) > mountCapacityFor(l))
		return `mount capacity exceeded (${mountCostUsed(l)}/${mountCapacityFor(l)})`;
	return null;
}

/**
 * Force a build's weapon slots valid: unknown primary falls back to stock,
 * unknown/duplicate secondary drops to none, and an over-budget pair sheds
 * the secondary first (then the primary to stock if somehow still over).
 * Returns the input object untouched when it is already valid.
 */
export function sanitizeLoadoutWeapons(l: Loadout): Loadout {
	if (!weaponLoadoutIssue(l)) return l;
	let primary = weaponById(l.parts.weaponPrimary) ? l.parts.weaponPrimary : STOCK_WEAPON_PRIMARY;
	let secondary = l.parts.weaponSecondary;
	if (!weaponById(secondary) || secondary === primary) secondary = WEAPON_NONE;
	const cap = mountCapacityFor(l);
	if (weaponMountCost(primary) + weaponMountCost(secondary) > cap) secondary = WEAPON_NONE;
	if (weaponMountCost(primary) > cap) primary = STOCK_WEAPON_PRIMARY;
	return { ...l, parts: { ...l.parts, weaponPrimary: primary, weaponSecondary: secondary } };
}

const STAT_KEYS: StatKey[] = [
	'engineForce',
	'aeroDrag',
	'brakeForce',
	'maxSteer',
	'steerFalloff',
	'frictionSlip',
	'chassisMass',
	'suspensionStiffness',
	'grassDrag',
	'maxHealth',
	'impactDamageTaken',
	'disruptionTaken',
	'oilSlipTaken',
	'spinKickTaken',
	'weaponCooldown',
	'damageDealt',
	'empRange'
];

export function neutralStats(): ResolvedStats {
	const out = {} as ResolvedStats;
	for (const k of STAT_KEYS) out[k] = 1;
	return out;
}

/** Archetype x equipped parts, multiplied per stat key. */
export function resolveLoadout(l: Loadout): ResolvedStats {
	const out = neutralStats();
	const apply = (e: StatEffects) => {
		for (const k of Object.keys(e) as StatKey[]) out[k] *= e[k]!;
	};
	const arch = archetypeById(l.archetype);
	if (arch) apply(arch.effects);
	for (const slot of Object.keys(l.parts) as PartSlot[]) {
		const part = partById(l.parts[slot]);
		if (part && part.slot === slot) apply(part.effects);
	}
	return out;
}

/** Display metadata: label + which direction reads as an upgrade. */
export const STAT_META: Record<StatKey, { label: string; better: 'higher' | 'lower' | 'neutral' }> = {
	engineForce: { label: 'accel', better: 'higher' },
	aeroDrag: { label: 'drag', better: 'lower' },
	brakeForce: { label: 'brakes', better: 'higher' },
	maxSteer: { label: 'steering', better: 'higher' },
	steerFalloff: { label: 'steer fade', better: 'lower' },
	frictionSlip: { label: 'grip', better: 'higher' },
	chassisMass: { label: 'mass', better: 'neutral' },
	suspensionStiffness: { label: 'suspension', better: 'neutral' },
	grassDrag: { label: 'off-track drag', better: 'lower' },
	maxHealth: { label: 'hull', better: 'higher' },
	impactDamageTaken: { label: 'ram damage in', better: 'lower' },
	disruptionTaken: { label: 'stun taken', better: 'lower' },
	oilSlipTaken: { label: 'oil taken', better: 'lower' },
	spinKickTaken: { label: 'spin taken', better: 'lower' },
	weaponCooldown: { label: 'cooldowns', better: 'lower' },
	damageDealt: { label: 'damage out', better: 'higher' },
	empRange: { label: 'EMP range', better: 'higher' }
};

export interface EffectChip {
	key: StatKey;
	label: string;
	/** Signed percent vs neutral, e.g. +25 / -18. */
	pct: number;
	tone: 'good' | 'bad' | 'neutral';
}

/** Effects -> render-ready chips (green buff / red cost / amber character). */
export function describeEffects(effects: StatEffects): EffectChip[] {
	const chips: EffectChip[] = [];
	for (const k of Object.keys(effects) as StatKey[]) {
		const v = effects[k]!;
		if (v === 1) continue;
		const meta = STAT_META[k];
		const pct = Math.round((v - 1) * 100);
		const tone =
			meta.better === 'neutral'
				? 'neutral'
				: (meta.better === 'higher') === v > 1
					? 'good'
					: 'bad';
		chips.push({ key: k, label: meta.label, pct, tone });
	}
	// Buffs first, then character, then costs: reads as "what you get / what it costs".
	const rank = { good: 0, neutral: 1, bad: 2 };
	return chips.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/** Resolved stats -> chips for every non-neutral value (the build summary). */
export function describeStats(stats: ResolvedStats): EffectChip[] {
	const effects: StatEffects = {};
	for (const k of STAT_KEYS) {
		if (Math.abs(stats[k] - 1) > 1e-6) effects[k] = stats[k];
	}
	return describeEffects(effects);
}

/** Serialize for localStorage. */
export function serializeLoadout(l: Loadout): string {
	return JSON.stringify(l);
}

/**
 * Validate a stored (archetype, parts) pair into a Loadout, or null on an
 * unknown archetype. Unknown part ids drop to stock; weapon slots accept only
 * catalog weapon ids (secondary also WEAPON_NONE) and the pair is run through
 * the capacity/duplicate sanitizer, so an invalid stored fit can never reach
 * the sim. Shared by parseLoadout (localStorage) and persistence.ts (DB), the
 * one contract for every storage source.
 */
export function normalizeStoredLoadout(archetype: unknown, parts: unknown): Loadout | null {
	if (typeof archetype !== 'string' || !archetypeById(archetype)) return null;
	const out = { ...STOCK_PARTS };
	if (parts && typeof parts === 'object') {
		const p = parts as Record<string, unknown>;
		for (const slot of Object.keys(out) as PartSlot[]) {
			const id = p[slot];
			if (typeof id !== 'string') continue;
			if (slot === 'weaponPrimary' || slot === 'weaponSecondary') {
				if (weaponById(id) || (slot === 'weaponSecondary' && id === WEAPON_NONE)) out[slot] = id;
			} else {
				const part = partById(id);
				if (part && part.slot === slot) out[slot] = part.id;
			}
		}
	}
	return sanitizeLoadoutWeapons({ archetype: archetype as ArchetypeId, parts: out });
}

/** Parse + validate; unknown archetype/part ids fail soft to null. */
export function parseLoadout(raw: string | null): Loadout | null {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw) as Loadout;
		return normalizeStoredLoadout(v?.archetype, v?.parts);
	} catch {
		return null;
	}
}
