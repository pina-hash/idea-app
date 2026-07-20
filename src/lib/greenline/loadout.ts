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

import {
	WEAPON_NONE,
	WEAPON_SOCKET_IDS,
	WEAPON_SLOTS,
	weaponById,
	type PoolSplit,
	type WeaponSlotId,
	type WeaponSocketId
} from './combat';
import { ABILITY_NONE, abilityById } from './abilities';

/** The stat surface parts may touch. Multipliers, neutral = 1. */
export type StatKey =
	// Drive / physics (applied over the tuning panel values per vehicle)
	| 'engineForce'
	| 'aeroDrag'
	| 'aeroDown'
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
/** The four bodywork slots, the two weapon-mount slots, and the two ability
 * slots. The weapon slots store WEAPON ids from the combat.ts catalog (or
 * WEAPON_NONE); the ability slots store ABILITY ids from the abilities.ts
 * catalog (or ABILITY_NONE). Neither resolves through partById, and the
 * stat-resolution loop skips them by construction. */
export type PartSlot =
	| 'plating'
	| 'drivetrain'
	| 'tires'
	| 'systems'
	| 'aero'
	| 'weaponPrimary'
	| 'weaponSecondary'
	| 'abilityPrimary'
	| 'abilitySecondary';

export const WEAPON_SLOT_IDS: PartSlot[] = ['weaponPrimary', 'weaponSecondary'];
export const ABILITY_SLOT_IDS: PartSlot[] = ['abilityPrimary', 'abilitySecondary'];

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
	/**
	 * Ability-capacity budget: how many ability points this chassis can power
	 * across its two ability slots. Like mountCapacityBase this is a flat
	 * resolved number, not a multiplier. DELIBERATELY the MIRROR IMAGE of the
	 * mount ordering: VELOCITY highest (5), ARMOR/HANDLING standard (4),
	 * SYSTEMS lowest (2). The missile leans on active abilities; the warlock
	 * leans on weapons.
	 */
	abilityCapacityBase: number;
	/**
	 * The named mount sockets this chassis actually offers, in display order
	 * (Phase 4c). Grounded in each hull's real geometry, NOT uniform: the
	 * VELOCITY dart has no roof — its canopy IS the spine — so it runs
	 * nose + rear only. Which sockets a WEAPON accepts is the weapon's own
	 * compatibleSockets; where a socket sits in 3D is rig-visual.ts's.
	 */
	sockets: WeaponSocketId[];
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
	/**
	 * The player's chosen mount socket per equipped weapon slot (Phase 4c).
	 * DELIBERATELY partial: a missing entry means "auto" — the slot falls to
	 * the first compatible free socket via resolveWeaponSockets — which is
	 * both the sensible default for a freshly equipped weapon and the
	 * backward-compat path for every pre-4c stored build (no socket data at
	 * all). The two slots can never resolve to the same socket; sanitize
	 * enforces it for stored data and the garage blocks it up front.
	 */
	weaponSockets: Partial<Record<WeaponSlotId, WeaponSocketId>>;
	/**
	 * Preset cosmetic livery (Phase 6b): body color, pattern, and car number.
	 * Purely visual — no stat, no physics, no gate. DELIBERATELY optional, the
	 * 4c weaponSockets precedent: a pre-6b stored build has no `cosmetics` key
	 * and loads with the archetype default (no override), and a 6b build rides
	 * the field inside the existing parts jsonb (partsForStorage), so no
	 * migration. All three sub-fields are independently optional; an all-default
	 * livery normalizes to `undefined` so untouched builds round-trip clean.
	 */
	cosmetics?: Cosmetics;
}

/** Preset livery selections. Every field optional: unset = default. */
export interface Cosmetics {
	/** Palette color id (COSMETIC_COLORS), or unset = the archetype's own tone. */
	color?: string;
	/** Pattern id (COSMETIC_PATTERNS); unset / 'none' = no livery pattern. */
	pattern?: string;
	/** Car number 0-99, or unset = none. The way to tell cars apart. */
	number?: number;
	/**
	 * Custom decal REFERENCE (Phase 6c): the storage path of the player's
	 * uploaded decal image (greenline-decals bucket), never image data itself.
	 * The visual layer resolves it through rig-visual's decal-image registry
	 * (the page registers a signed URL); an unresolvable ref simply renders no
	 * decal. Moderation lives entirely in the data layer (0051): the ref is
	 * harmless to carry regardless of review status, because the image object
	 * is unreadable to non-owners until approved.
	 */
	decal?: string;
}

/**
 * Curated livery palette, INDEPENDENT of archetype (a build's color is not
 * locked to its chassis). Rendered as tinted chrome by the metallic hull
 * material, so these read as painted metal, not flat color. Kept clear of the
 * two reserved signal colors: the signature-thread green (`#2ae57e`, still the
 * player's accent regardless of livery) and the status crimson (`#FF3355`) live
 * in different visual channels (emissive thread / UI), so a muted metallic red
 * or green BODY is a distinct read.
 */
export const COSMETIC_COLORS: { id: string; name: string; hex: number }[] = [
	{ id: 'steel', name: 'Steel', hex: 0x93a3b0 },
	{ id: 'gunmetal', name: 'Gunmetal', hex: 0x566472 },
	{ id: 'crimson', name: 'Crimson', hex: 0xb23b3b },
	{ id: 'ember', name: 'Ember', hex: 0xcf7a2a },
	{ id: 'sulfur', name: 'Sulfur', hex: 0xc7b83f },
	{ id: 'viper', name: 'Viper', hex: 0x3aa564 },
	{ id: 'azure', name: 'Azure', hex: 0x3579b8 },
	{ id: 'violet', name: 'Violet', hex: 0x7d55c0 },
	{ id: 'bone', name: 'Bone', hex: 0xd7dce1 },
	{ id: 'copper', name: 'Copper', hex: 0xb06a3c }
];

/** Livery pattern presets (two racing-stripe variants, two geometric). */
export const COSMETIC_PATTERNS: { id: string; name: string }[] = [
	{ id: 'none', name: 'None' },
	{ id: 'stripe', name: 'Center Stripe' },
	{ id: 'twin', name: 'Twin Stripes' },
	{ id: 'wedge', name: 'Wedge' },
	{ id: 'checker', name: 'Checker' }
];

/** Resolve a livery color id to its hex, or null when unset / unknown. */
export function cosmeticColorHex(id: string | undefined): number | null {
	if (!id) return null;
	return COSMETIC_COLORS.find((c) => c.id === id)?.hex ?? null;
}

/**
 * Validate a raw cosmetics blob (from storage) into a clean Cosmetics, dropping
 * unknown color/pattern ids and out-of-range numbers, omitting the 'none'
 * pattern. Returns `undefined` when nothing valid survives, so a default livery
 * is stored as absence (the round-trips-clean contract, like empty sockets).
 */
export function normalizeCosmetics(raw: unknown): Cosmetics | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const r = raw as Record<string, unknown>;
	const out: Cosmetics = {};
	if (typeof r.color === 'string' && COSMETIC_COLORS.some((c) => c.id === r.color)) out.color = r.color;
	if (
		typeof r.pattern === 'string' &&
		r.pattern !== 'none' &&
		COSMETIC_PATTERNS.some((p) => p.id === r.pattern)
	)
		out.pattern = r.pattern;
	if (typeof r.number === 'number' && Number.isInteger(r.number) && r.number >= 0 && r.number <= 99)
		out.number = r.number;
	// Decal ref (6c): a short opaque storage path, never image data (a data: URL
	// would balloon the stored jsonb and bypass the moderated bucket entirely).
	if (typeof r.decal === 'string') {
		const d = r.decal.trim();
		if (d && d.length <= 220 && !/\s/.test(d) && !d.toLowerCase().startsWith('data:'))
			out.decal = d;
	}
	return out.color || out.pattern || out.number != null || out.decal ? out : undefined;
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
		mountCapacityBase: 4,
		// Standard ability budget (the inverted mirror of the mount ordering).
		abilityCapacityBase: 4,
		// The slab has real estate everywhere: forward hood plate, the big
		// flat cab roof, and a full rear deck behind the cab.
		sockets: ['nose', 'roof', 'rear']
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
		mountCapacityBase: 2,
		// HIGHEST ability budget (the mirror of its lowest mount budget): the
		// missile's identity leans on nitro/grip/flip, not firepower.
		abilityCapacityBase: 5,
		// NO roof: the dart's tiny glass canopy IS its spine — nothing mounts
		// on it. One low nose hardpoint, one rear deck hardpoint. Real felt
		// consequence: twin forward guns (both nose-only fits) cannot share
		// the dart; the one nose socket is contested.
		sockets: ['nose', 'rear']
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
		mountCapacityBase: 4,
		// Standard ability budget.
		abilityCapacityBase: 4,
		// Compact but conventional: short hood point, cab roof, rear deck.
		sockets: ['nose', 'roof', 'rear']
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
		mountCapacityBase: 5,
		// LOWEST ability budget (the mirror of its highest mount budget): the
		// warlock's identity is its weapons, so it powers only ONE ability.
		abilityCapacityBase: 2,
		// The weapons platform (biggest budget = most hardware to seat):
		// wedge-nose point, canopy roof, and the rear rack bridging the two
		// sensor pods.
		sockets: ['nose', 'roof', 'rear']
	}
];

export const PART_SLOTS: { id: PartSlot; label: string }[] = [
	{ id: 'plating', label: 'PLATING' },
	{ id: 'drivetrain', label: 'DRIVETRAIN' },
	{ id: 'tires', label: 'TIRES' },
	{ id: 'systems', label: 'SYSTEMS' },
	{ id: 'aero', label: 'AERO' }
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
	},
	// ---- AERO ----
	// The downforce slot (Phase 9-fix-a). The BASELINE downforce that keeps
	// every car's nose planted at speed is a global sim constant applied to all
	// builds, so `aero-stock` is the neutral default and is stable unmodified.
	// The rest are a strict downforce-vs-drag TRADE frontier — more downforce
	// buys high-speed grip and stability but costs top speed (drag), and vice
	// versa. Every part sits ON that frontier, so none dominates another (the
	// NO-strict-upgrades doctrine): stock trades speed vs the wing, the wing
	// trades speed vs stock, the cowl trades stability vs stock.
	{ id: 'aero-stock', slot: 'aero', name: 'Stock Underbody', blurb: 'Factory floor + valance. Balanced downforce, keeps the nose down at speed.', effects: {} },
	{
		id: 'aero-splitter',
		slot: 'aero',
		name: 'Front Splitter',
		blurb: 'Blade + dive planes: more downforce and front bite, a little more drag off the top end.',
		effects: { aeroDown: 1.35, aeroDrag: 1.1 }
	},
	{
		id: 'aero-wing',
		slot: 'aero',
		name: 'Adjustable Wing',
		blurb: 'Big rear element: glued through fast corners and over crests, clear top-speed cost.',
		effects: { aeroDown: 1.8, aeroDrag: 1.25 }
	},
	{
		id: 'aero-lowdrag',
		slot: 'aero',
		name: 'Streamliner Cowl',
		blurb: 'Slick low body: the fastest straights on the field, floatier and less planted when pushed.',
		effects: { aeroDown: 0.55, aeroDrag: 0.85 }
	}
];

export const archetypeById = (id: string): Archetype | undefined =>
	ARCHETYPES.find((a) => a.id === id);
export const partById = (id: string): VehiclePart | undefined => PARTS.find((p) => p.id === id);
export const partsForSlot = (slot: PartSlot): VehiclePart[] => PARTS.filter((p) => p.slot === slot);

/** Stock weapon fit: Autocannon (cost 1) primary, empty secondary — sane
 * under ANY archetype's capacity budget. */
export const STOCK_WEAPON_PRIMARY = 'autocannon';

/** Stock ability fit: Nitro Boost (cost 2) primary, empty secondary. Cost 2
 * fits every archetype's ability budget (min is SYSTEMS at 2), the same way
 * the stock weapon fits every mount budget. */
export const STOCK_ABILITY_PRIMARY = 'nitro-boost';

const STOCK_PARTS: Record<PartSlot, string> = {
	plating: 'plating-stock',
	drivetrain: 'drive-stock',
	tires: 'tires-stock',
	systems: 'sys-stock',
	aero: 'aero-stock',
	weaponPrimary: STOCK_WEAPON_PRIMARY,
	weaponSecondary: WEAPON_NONE,
	abilityPrimary: STOCK_ABILITY_PRIMARY,
	abilitySecondary: ABILITY_NONE
};

/** Handling is the closest to the harness's tuned baseline feel. */
export function defaultLoadout(archetype: ArchetypeId = 'handling'): Loadout {
	// Empty weaponSockets = every slot auto-assigns (first compatible free
	// socket), the same contract every pre-4c stored build resolves under.
	return { archetype, parts: { ...STOCK_PARTS }, weaponSockets: {} };
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

// ---------------------------------------------------------------------------
// Ability capacity: the flat ability budget, structurally identical to mount
// capacity but a SEPARATE resolved stat with the INVERTED archetype ordering
// (VELOCITY 5, ARMOR/HANDLING 4, SYSTEMS 2). Same no-duplicate rule; no sockets.
// ---------------------------------------------------------------------------

/** The archetype's flat ability budget (parts never touch it in this pass). */
export function abilityCapacityFor(l: Loadout | ArchetypeId): number {
	const id = typeof l === 'string' ? l : l.archetype;
	return archetypeById(id)?.abilityCapacityBase ?? 4;
}

/** Ability points an ability id occupies (ABILITY_NONE / unknown ids cost 0). */
export function abilitySlotCost(id: string): number {
	return abilityById(id)?.slotCost ?? 0;
}

/** Ability points the build's equipped abilities occupy together. */
export function abilityCostUsed(l: Loadout): number {
	return abilitySlotCost(l.parts.abilityPrimary) + abilitySlotCost(l.parts.abilitySecondary);
}

// --- Mount sockets: where each equipped weapon physically sits. The choice
// lives in Loadout.weaponSockets; resolution (explicit pick > weapon
// preference, two slots never sharing a socket) lives HERE so the garage UI,
// the storage parsers, and rig-visual's placement all agree on one contract.

/** The archetype's real hardpoint set, in display order. */
export function socketsFor(l: Loadout | ArchetypeId): WeaponSocketId[] {
	const id = typeof l === 'string' ? l : l.archetype;
	return archetypeById(id)?.sockets ?? [...WEAPON_SOCKET_IDS];
}

/**
 * Sockets this slot's weapon could occupy on this chassis, IGNORING what the
 * other slot holds: the weapon's compatibility list filtered to the
 * archetype's real hardpoints, kept in the weapon's own preference order.
 * Empty when the slot is empty / unknown. The garage renders these as the
 * socket picker options (disabling the one the other slot resolves to).
 */
export function slotSocketChoices(l: Loadout, slot: WeaponSlotId): WeaponSocketId[] {
	const def = weaponById(l.parts[slot]);
	if (!def) return [];
	const avail = socketsFor(l);
	return def.compatibleSockets.filter((s) => avail.includes(s));
}

/**
 * The EFFECTIVE socket per equipped weapon slot. An explicit weaponSockets
 * pick wins when it is still legal; anything unset/invalid auto-assigns —
 * which is how a freshly equipped weapon gets a sensible default and how
 * every pre-4c stored build (no socket data at all) resolves. When both
 * slots are armed, the few possible assignments are enumerated jointly and
 * scored (honor primary's pick > honor secondary's pick > each weapon's own
 * preference order), so an auto-assigned primary never squats on the only
 * socket the secondary could use. The two slots NEVER share a socket; a pair
 * with no valid assignment resolves the primary only (sanitize sheds the
 * secondary for exactly this case).
 */
export function resolveWeaponSockets(l: Loadout): Partial<Record<WeaponSlotId, WeaponSocketId>> {
	const pChoices = slotSocketChoices(l, 'weaponPrimary');
	const sChoices = slotSocketChoices(l, 'weaponSecondary');
	const pWant = l.weaponSockets?.weaponPrimary;
	const sWant = l.weaponSockets?.weaponSecondary;
	if (!sChoices.length) {
		const p = pWant && pChoices.includes(pWant) ? pWant : pChoices[0];
		return p ? { weaponPrimary: p } : {};
	}
	if (!pChoices.length) {
		const s = sWant && sChoices.includes(sWant) ? sWant : sChoices[0];
		return s ? { weaponSecondary: s } : {};
	}
	let best: { p: WeaponSocketId; s: WeaponSocketId; score: number } | null = null;
	for (let pi = 0; pi < pChoices.length; pi++) {
		for (let si = 0; si < sChoices.length; si++) {
			if (pChoices[pi] === sChoices[si]) continue;
			const score =
				(pWant === pChoices[pi] ? 400 : 0) + (sWant === sChoices[si] ? 200 : 0) - pi * 10 - si;
			if (!best || score > best.score) best = { p: pChoices[pi], s: sChoices[si], score };
		}
	}
	if (!best) {
		const p = pWant && pChoices.includes(pWant) ? pWant : pChoices[0];
		return p ? { weaponPrimary: p } : {};
	}
	return { weaponPrimary: best.p, weaponSecondary: best.s };
}

/** Both slots armed but every assignment collides (e.g. two nose-only guns on
 * the two-socket VELOCITY dart). The reason string doubles as UI copy. */
function socketPairIssue(l: Loadout): string | null {
	const pChoices = slotSocketChoices(l, 'weaponPrimary');
	if (weaponById(l.parts.weaponPrimary) && !pChoices.length)
		return 'no compatible mount socket on this chassis';
	if (l.parts.weaponSecondary === WEAPON_NONE) return null;
	const sChoices = slotSocketChoices(l, 'weaponSecondary');
	if (weaponById(l.parts.weaponSecondary) && !sChoices.length)
		return 'no compatible mount socket on this chassis';
	if (!pChoices.some((p) => sChoices.some((s) => s !== p)))
		return 'both weapons need the same mount socket';
	return null;
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
	return socketPairIssue(l);
}

/** Do two stored socket-choice maps pin the same picks? */
const sameSocketPicks = (
	a: Partial<Record<WeaponSlotId, WeaponSocketId>>,
	b: Partial<Record<WeaponSlotId, WeaponSocketId>>
): boolean => WEAPON_SLOTS.every((slot) => a[slot] === b[slot]);

/**
 * Force a build's weapon slots valid: unknown primary falls back to stock,
 * unknown/duplicate secondary drops to none, an over-budget pair sheds the
 * secondary first (then the primary to stock if somehow still over), and a
 * pair with no non-colliding socket assignment sheds the secondary too. The
 * stored socket picks are then normalized: an entry survives only when it is
 * exactly what the slot resolves to, so a stale pick (archetype swapped under
 * it, weapon changed, socket lost to the other slot) can never silently
 * re-assert later — the slot just returns to auto. Returns the input object
 * untouched when it is already fully valid.
 */
export function sanitizeLoadoutWeapons(l: Loadout): Loadout {
	let out = l;
	if (weaponLoadoutIssue(out)) {
		let primary = weaponById(l.parts.weaponPrimary) ? l.parts.weaponPrimary : STOCK_WEAPON_PRIMARY;
		let secondary = l.parts.weaponSecondary;
		if (!weaponById(secondary) || secondary === primary) secondary = WEAPON_NONE;
		const cap = mountCapacityFor(l);
		if (weaponMountCost(primary) + weaponMountCost(secondary) > cap) secondary = WEAPON_NONE;
		if (weaponMountCost(primary) > cap) primary = STOCK_WEAPON_PRIMARY;
		out = { ...l, parts: { ...l.parts, weaponPrimary: primary, weaponSecondary: secondary } };
		// Socket assignability on the repaired pair: a primary with no socket
		// on this chassis falls to stock (unreachable with today's catalog —
		// every archetype has a nose — but the guard keeps future data
		// honest); a pair that cannot split across sockets sheds the
		// secondary, the capacity-shed convention.
		if (weaponById(out.parts.weaponPrimary) && !slotSocketChoices(out, 'weaponPrimary').length) {
			out = { ...out, parts: { ...out.parts, weaponPrimary: STOCK_WEAPON_PRIMARY } };
		}
		if (out.parts.weaponSecondary !== WEAPON_NONE && socketPairIssue(out)) {
			out = { ...out, parts: { ...out.parts, weaponSecondary: WEAPON_NONE } };
		}
	}
	// Normalize the socket picks even when the weapons themselves were fine
	// (an archetype swap can strand a pick with no repair needed elsewhere).
	const resolved = resolveWeaponSockets(out);
	const cleaned: Partial<Record<WeaponSlotId, WeaponSocketId>> = {};
	for (const slot of WEAPON_SLOTS) {
		const want = out.weaponSockets?.[slot];
		if (want && resolved[slot] === want) cleaned[slot] = want;
	}
	// Also attaches the (possibly empty) map when a caller-supplied object
	// lacked the field entirely (console equips), so every sanitized Loadout
	// honors the type downstream.
	if (!out.weaponSockets || !sameSocketPicks(cleaned, out.weaponSockets))
		out = { ...out, weaponSockets: cleaned };
	return out;
}

/**
 * Why this build's ability fit is invalid, or null when it is fine. The mirror
 * of weaponLoadoutIssue, minus sockets (abilities have none): a primary must be
 * equipped, the secondary is optional (ABILITY_NONE) but must be a real ability
 * if set, the two may not be the same, and the total slot cost must fit the
 * archetype's ability budget. The garage UI blocks these up front;
 * sanitizeLoadoutAbilities is the enforcement for stored data / console equips.
 */
export function abilityLoadoutIssue(l: Loadout): string | null {
	if (!abilityById(l.parts.abilityPrimary)) return 'no primary ability equipped';
	const sec = l.parts.abilitySecondary;
	if (sec !== ABILITY_NONE && !abilityById(sec)) return 'unknown secondary ability';
	if (sec !== ABILITY_NONE && sec === l.parts.abilityPrimary)
		return 'the same ability cannot occupy both slots';
	if (abilityCostUsed(l) > abilityCapacityFor(l))
		return `ability capacity exceeded (${abilityCostUsed(l)}/${abilityCapacityFor(l)})`;
	return null;
}

/**
 * Force a build's ability slots valid (the sanitizeLoadoutWeapons shape, no
 * sockets): unknown primary falls back to stock, unknown/duplicate secondary
 * drops to none, and an over-budget pair sheds the secondary first (then the
 * primary to stock if somehow still over). Returns the input untouched when
 * already valid.
 */
export function sanitizeLoadoutAbilities(l: Loadout): Loadout {
	if (!abilityLoadoutIssue(l)) return l;
	let primary = abilityById(l.parts.abilityPrimary) ? l.parts.abilityPrimary : STOCK_ABILITY_PRIMARY;
	let secondary = l.parts.abilitySecondary;
	if (!abilityById(secondary) || secondary === primary) secondary = ABILITY_NONE;
	const cap = abilityCapacityFor(l);
	if (abilitySlotCost(primary) + abilitySlotCost(secondary) > cap) secondary = ABILITY_NONE;
	if (abilitySlotCost(primary) > cap) primary = STOCK_ABILITY_PRIMARY;
	return { ...l, parts: { ...l.parts, abilityPrimary: primary, abilitySecondary: secondary } };
}

/**
 * The one sanitizer every enforcement layer (garage edit, archetype swap,
 * applyLoadoutToRig, stored-build load) should call: weapons THEN abilities, so
 * an archetype swap that shrinks EITHER budget sheds the offending secondary.
 * The two component sanitizers stay exported for the callers that only touch
 * one system, but this is the default.
 */
export function sanitizeLoadout(l: Loadout): Loadout {
	return sanitizeLoadoutAbilities(sanitizeLoadoutWeapons(l));
}

const STAT_KEYS: StatKey[] = [
	'engineForce',
	'aeroDrag',
	'aeroDown',
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
	aeroDown: { label: 'downforce', better: 'higher' },
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
 * The `parts` object as the DB stores it: the slot map plus the socket picks
 * folded in under one reserved key. Riding inside the existing jsonb column
 * (0049 working build AND 0050 named slots) is deliberate — no migration, no
 * pre-migration select breakage, and a pre-4c client reading a new row simply
 * ignores the extra key (its normalize loop only reads known slot keys),
 * exactly as a 4c client reading an old row auto-assigns. Empty picks are
 * omitted so untouched builds round-trip byte-identical.
 */
export function partsForStorage(l: Loadout): Record<string, unknown> {
	const out: Record<string, unknown> = { ...l.parts };
	if (Object.keys(l.weaponSockets ?? {}).length) out.weaponSockets = l.weaponSockets;
	// The 6b livery rides the same jsonb the same way (omitted when default, so
	// an untouched build round-trips byte-identical; a pre-6b client ignores it).
	const cos = normalizeCosmetics(l.cosmetics);
	if (cos) out.cosmetics = cos;
	return out;
}

/**
 * Validate a stored (archetype, parts[, weaponSockets]) shape into a Loadout,
 * or null on an unknown archetype. Unknown part ids drop to stock; weapon
 * slots accept only catalog weapon ids (secondary also WEAPON_NONE); socket
 * picks accept only known socket ids (missing entirely = pre-4c data = auto);
 * and the result runs through the capacity/duplicate/socket sanitizer, so an
 * invalid stored fit can never reach the sim. Shared by parseLoadout
 * (localStorage, socket picks as their own Loadout field) and persistence.ts
 * (DB rows, socket picks embedded in the parts jsonb — see partsForStorage),
 * the one contract for every storage source.
 */
export function normalizeStoredLoadout(
	archetype: unknown,
	parts: unknown,
	weaponSockets?: unknown,
	cosmetics?: unknown
): Loadout | null {
	if (typeof archetype !== 'string' || !archetypeById(archetype)) return null;
	const out = { ...STOCK_PARTS };
	if (parts && typeof parts === 'object') {
		const p = parts as Record<string, unknown>;
		for (const slot of Object.keys(out) as PartSlot[]) {
			const id = p[slot];
			if (typeof id !== 'string') continue;
			if (slot === 'weaponPrimary' || slot === 'weaponSecondary') {
				if (weaponById(id) || (slot === 'weaponSecondary' && id === WEAPON_NONE)) out[slot] = id;
			} else if (slot === 'abilityPrimary' || slot === 'abilitySecondary') {
				if (abilityById(id) || (slot === 'abilitySecondary' && id === ABILITY_NONE)) out[slot] = id;
			} else {
				const part = partById(id);
				if (part && part.slot === slot) out[slot] = part.id;
			}
		}
	}
	const rawSockets =
		weaponSockets ??
		(parts && typeof parts === 'object'
			? (parts as Record<string, unknown>).weaponSockets
			: undefined);
	const ws: Partial<Record<WeaponSlotId, WeaponSocketId>> = {};
	if (rawSockets && typeof rawSockets === 'object') {
		for (const slot of WEAPON_SLOTS) {
			const v = (rawSockets as Record<string, unknown>)[slot];
			if (typeof v === 'string' && (WEAPON_SOCKET_IDS as string[]).includes(v))
				ws[slot] = v as WeaponSocketId;
		}
	}
	// Livery: prefer the explicit arg (localStorage stores it top-level), else
	// the copy embedded in the parts jsonb (DB rows, via partsForStorage) — the
	// exact dual-source read weaponSockets uses.
	const rawCosmetics =
		cosmetics ??
		(parts && typeof parts === 'object'
			? (parts as Record<string, unknown>).cosmetics
			: undefined);
	return sanitizeLoadout({
		archetype: archetype as ArchetypeId,
		parts: out,
		weaponSockets: ws,
		cosmetics: normalizeCosmetics(rawCosmetics)
	});
}

/** Parse + validate; unknown archetype/part ids fail soft to null. */
export function parseLoadout(raw: string | null): Loadout | null {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw) as Loadout;
		return normalizeStoredLoadout(v?.archetype, v?.parts, v?.weaponSockets, v?.cosmetics);
	} catch {
		return null;
	}
}
