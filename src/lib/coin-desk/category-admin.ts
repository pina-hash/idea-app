/**
 * Admin-managed IDEA Coin categories (0080): create a new flat / range /
 * per_unit / variable category, or retire (never delete) an existing one.
 * Plain types + pure helpers (client-safe, the sections.ts / contracts.ts
 * convention) -- every write is a call to a migration 0080 RPC, this module
 * never talks to Supabase.
 *
 * HARD BOUNDARY, stated here so it can be surfaced in the UI verbatim: this
 * tool can fully define 'flat', 'range', 'per_unit', and 'variable'
 * categories, because those are just data -- a row in coin_categories with a
 * price. It CANNOT define a 'formula' category (Perfect Score's rounding,
 * Pay Raise's tier math, Property Damage's exchange rate, 3D Printing's
 * material+time bands, Extra Credit's semester cap): those need bespoke
 * plpgsql logic, which is code, not configuration, and stays out of scope
 * here. `coin_admin_create_category` refuses 'formula' outright with this
 * same explanation; CREATABLE_PRICING_MODELS is that refusal surfaced
 * before a submit is even attempted.
 */

import type { CoinKind, CoinPricingModel } from '$lib/coin-desk';

export type CreatablePricingModel = Exclude<CoinPricingModel, 'formula'>;

export const CREATABLE_PRICING_MODELS: CreatablePricingModel[] = ['flat', 'range', 'per_unit', 'variable'];

export const PRICING_MODEL_LABELS: Record<CreatablePricingModel, string> = {
	flat: 'Flat -- one fixed price',
	range: 'Range -- admin picks an amount within a min/max',
	per_unit: 'Per unit -- a rate x an admin-entered quantity',
	variable: 'Variable -- admin enters the whole amount at logging time'
};

export const KIND_LABELS_SHORT: Record<CoinKind, string> = {
	fine: 'Fine',
	award: 'Award',
	purchase: 'Purchase',
	adjustment: 'Adjustment'
};

/*
 * There used to be a PRICE_BAND_GUIDANCE table here, copied from the
 * superseded draft v3 of the economy doc. Its bands went stale the day V2's
 * prices moved, and a second copy of the price list is exactly the thing that
 * drifts, so it is gone: the live price list on this same page, and
 * docs/coin-economy/IDEA_COIN_V2.md, are where the current prices are.
 */

/** Slugifies a display name into a valid coin_categories.id (matches the table's own CHECK: lowercase, [a-z0-9_]+). */
export function slugifyCategoryId(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 60);
}
