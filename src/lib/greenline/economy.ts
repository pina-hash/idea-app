/**
 * GREENLINE economy: Ignition Credits (IC), the unlock catalog, and ownership
 * gating. Pure data + pure functions (the loadout.ts convention) — no Svelte,
 * no Supabase; the persistence seam and the routes wire it to real state.
 *
 * IC is the GREENLINE-only currency, named in the spirit of IDEA Coin ("IC")
 * but entirely separate from it (no coin economy exists in this repo; the
 * schoolwide coin system stays in Google Sheets / Apps Script).
 *
 * AUTHORITY: everything here is the DISPLAY mirror. The server copy in
 * migration 0052 (greenline_item_price + the award constants inside
 * greenline_submit_race_result) governs what is actually charged and credited;
 * if the two drift, the UI shows a stale label but the RPC still charges the
 * real number — a mislabel, never an exploit. Keep both sides in sync in the
 * same change (the tolerance-constant convention).
 *
 * Pricing tiers (rationale lives with the SQL price list too):
 *   - Starter kit FREE: stock parts, Autocannon, Nitro Boost, empty slots,
 *     every archetype, default livery, the car number (identification must
 *     never be paywalled), the custom decal (moderation-gated, not priced).
 *   - Bodywork parts flat 250: all sidegrades by design ("NO strict
 *     upgrades"), so power-pricing within the class would be false precision.
 *   - Weapons off mountCost (the game's own power proxy): 1 -> 300,
 *     2 -> 600, 3 -> 1000.
 *   - Abilities off slotCost the same way: 1 -> 300, 2 -> 600.
 *   - Cosmetics are the cheap early goals: colors 100, patterns 150.
 */

import { ABILITY_NONE, abilityById, ABILITIES } from './abilities';
import { WEAPON_NONE, weaponById, WEAPONS } from './combat';
import {
	COSMETIC_COLORS,
	COSMETIC_PATTERNS,
	PART_SLOTS,
	PARTS,
	partsForSlot,
	sanitizeLoadout,
	STOCK_ABILITY_PRIMARY,
	STOCK_WEAPON_PRIMARY,
	type Loadout,
	type PartSlot
} from './loadout';

export const CURRENCY_NAME = 'Ignition Credits';
export const CURRENCY_SHORT = 'IC';

// --- Price tiers (mirror of greenline_item_price in 0052) ---
export const PART_PRICE = 250;
export const WEAPON_PRICE_BY_MOUNT_COST: Record<number, number> = { 1: 300, 2: 600, 3: 1000 };
export const ABILITY_PRICE_BY_SLOT_COST: Record<number, number> = { 1: 300, 2: 600 };
export const COLOR_PRICE = 100;
export const PATTERN_PRICE = 150;

/**
 * The starter kit: pre-unlocked, never purchasable. A day-one player has a
 * complete usable build (defaultLoadout() is exactly these), so zero currency
 * is required to play.
 */
export const STARTER_ITEMS: ReadonlySet<string> = new Set([
	...PARTS.filter((p) => partsForSlot(p.slot)[0]?.id === p.id).map((p) => p.id),
	STOCK_WEAPON_PRIMARY,
	STOCK_ABILITY_PRIMARY
]);

/** Cosmetic item ids are namespaced so a palette id can never collide with a
 * part/weapon/ability id in the unlock ledger. */
export const colorItemId = (colorId: string): string => `color:${colorId}`;
export const patternItemId = (patternId: string): string => `pattern:${patternId}`;

/**
 * Price of an item, or null when it is not purchasable — which covers BOTH
 * "free" (starter kit, empty slots, the 'none' pattern) and "unknown id".
 * Callers treating null as free is safe: unknown ids never survive
 * normalizeStoredLoadout / sanitizeLoadout, so nothing unknown reaches a build.
 */
export function itemPrice(id: string): number | null {
	if (!id || id === WEAPON_NONE || id === ABILITY_NONE) return null;
	if (STARTER_ITEMS.has(id)) return null;
	const w = weaponById(id);
	if (w) return WEAPON_PRICE_BY_MOUNT_COST[w.mountCost] ?? null;
	const a = abilityById(id);
	if (a) return ABILITY_PRICE_BY_SLOT_COST[a.slotCost] ?? null;
	if (PARTS.some((p) => p.id === id)) return PART_PRICE;
	if (id.startsWith('color:')) {
		const c = id.slice('color:'.length);
		return COSMETIC_COLORS.some((x) => x.id === c) ? COLOR_PRICE : null;
	}
	if (id.startsWith('pattern:')) {
		const p = id.slice('pattern:'.length);
		return p !== 'none' && COSMETIC_PATTERNS.some((x) => x.id === p) ? PATTERN_PRICE : null;
	}
	return null;
}

export type UnlockableKind = 'part' | 'weapon' | 'ability' | 'color' | 'pattern';

export interface UnlockableItem {
	id: string;
	kind: UnlockableKind;
	name: string;
	price: number;
}

/** Every purchasable item with its price — the full shop catalog (42 items
 * since Phase 8g added EMP / Oil Slick / Grappling Hook as equipment; the three
 * auto-price off mountCost through itemPrice like every other weapon). */
export function unlockableItems(): UnlockableItem[] {
	const out: UnlockableItem[] = [];
	for (const p of PARTS) {
		const price = itemPrice(p.id);
		if (price != null) out.push({ id: p.id, kind: 'part', name: p.name, price });
	}
	for (const w of WEAPONS) {
		const price = itemPrice(w.id);
		if (price != null) out.push({ id: w.id, kind: 'weapon', name: w.name, price });
	}
	for (const a of ABILITIES) {
		const price = itemPrice(a.id);
		if (price != null) out.push({ id: a.id, kind: 'ability', name: a.name, price });
	}
	for (const c of COSMETIC_COLORS) {
		out.push({ id: colorItemId(c.id), kind: 'color', name: c.name, price: COLOR_PRICE });
	}
	for (const p of COSMETIC_PATTERNS) {
		if (p.id === 'none') continue;
		out.push({ id: patternItemId(p.id), kind: 'pattern', name: p.name, price: PATTERN_PRICE });
	}
	return out;
}

/** Is this item usable? Free items always; otherwise it must be in the set. */
export function isItemUnlocked(id: string, unlocked: ReadonlySet<string>): boolean {
	return itemPrice(id) === null || unlocked.has(id);
}

const BODY_SLOTS: PartSlot[] = PART_SLOTS.map((s) => s.id);

/**
 * Force a build down to what the player actually owns (the
 * sanitizeLoadoutWeapons shape): a locked bodywork part falls to that slot's
 * stock, a locked primary weapon/ability falls to the free starter, a locked
 * secondary drops to empty, a locked livery color/pattern clears to default.
 * The car number and decal are never gated (identification and moderation
 * live outside the economy). Returns the input object untouched when nothing
 * is locked, so callers can cheap-check `result !== input`.
 *
 * Creative mode never calls this — the caller skips it while creative is on
 * (that IS the bypass) — and neither does a pre-0052 / offline session (the
 * fail-soft rule: no unlock data means no gating, the pre-economy behavior).
 */
export function sanitizeLoadoutOwnership(l: Loadout, unlocked: ReadonlySet<string>): Loadout {
	const owned = (id: string) => isItemUnlocked(id, unlocked);
	let parts = l.parts;
	let changed = false;
	const set = (slot: PartSlot, id: string) => {
		if (parts[slot] === id) return;
		parts = { ...parts, [slot]: id };
		changed = true;
	};
	for (const slot of BODY_SLOTS) {
		if (!owned(parts[slot])) set(slot, partsForSlot(slot)[0].id);
	}
	if (!owned(parts.weaponPrimary)) set('weaponPrimary', STOCK_WEAPON_PRIMARY);
	if (parts.weaponSecondary !== WEAPON_NONE && !owned(parts.weaponSecondary))
		set('weaponSecondary', WEAPON_NONE);
	if (!owned(parts.abilityPrimary)) set('abilityPrimary', STOCK_ABILITY_PRIMARY);
	if (parts.abilitySecondary !== ABILITY_NONE && !owned(parts.abilitySecondary))
		set('abilitySecondary', ABILITY_NONE);

	let cosmetics = l.cosmetics;
	if (cosmetics?.color && !owned(colorItemId(cosmetics.color))) {
		cosmetics = { ...cosmetics, color: undefined };
		changed = true;
	}
	if (cosmetics?.pattern && !owned(patternItemId(cosmetics.pattern))) {
		cosmetics = { ...cosmetics, pattern: undefined };
		changed = true;
	}

	if (!changed) return l;
	// Re-run the structural sanitizer: a swap back to stock can strand a socket
	// pick, and the result must honor every existing build invariant.
	return sanitizeLoadout({ ...l, parts, cosmetics });
}

// --- Race award (mirror of the constants in greenline_submit_race_result) ---
export const AWARD_PLACEMENT: Record<number, number> = { 1: 120, 2: 90, 3: 70 };
export const AWARD_FINISH_BASE = 50;
export const AWARD_PB_BONUS = 40;

/** Placement award for a finishing position (0 for a non-finish). */
export function awardForPlacement(pos: number | null | undefined): number {
	if (pos == null || pos < 1) return 0;
	return AWARD_PLACEMENT[pos] ?? AWARD_FINISH_BASE;
}

/** What a submitted race paid out (parsed from the 0052 RPC's jsonb return). */
export interface RaceAward {
	awarded: number;
	placement: number;
	pbBonus: number;
	/** Wallet balance after the credit, when the server reported one. */
	balance: number | null;
	creative: boolean;
}
