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
import { COIN_SYMBOL } from '$lib/coin-format';

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

/**
 * Reference bands pulled straight from docs/coin-economy/idea_coin_economy_
 * draft_v3.md Parts 2-4 (the same source the Contract Completion guideline
 * in contracts.ts cites) -- shown as GUIDANCE only, never enforced. An admin
 * creating a new fine or award can see roughly where the existing scale
 * sits without opening the doc; nothing here validates or clamps an input.
 */
export const PRICE_BAND_GUIDANCE: Record<CoinKind, string[]> = {
	fine: [
		`Classroom Standards Violation -- 1${COIN_SYMBOL}`,
		`Unauthorized Printing / Off-Task Device Use / Long Bathroom Break -- 2${COIN_SYMBOL}`,
		`3D Printer Not Reset / Disruptive Behavior -- 3${COIN_SYMBOL}`,
		`Classmate Trust Violation / Eating Violation / Leaving Without Permission -- 5${COIN_SYMBOL}`,
		`Shop Safety Violation / Shop Not Cleaned Up / Coin Theft / Mint Tampering (Known) -- 12${COIN_SYMBOL}`
	],
	award: [
		`Correct Answer in Class / Highest Grade in Section (Weekly) / Weekly Wage -- 1${COIN_SYMBOL}`,
		`Above and Beyond -- 1-3${COIN_SYMBOL} (range)`,
		`Quality Desktop Background -- 3${COIN_SYMBOL}`,
		`Weekly Role Stipend -- 2${COIN_SYMBOL} (209H only)`
	],
	purchase: [
		`Text Printing -- 1${COIN_SYMBOL} per 4 pages`,
		`Song Request -- 3${COIN_SYMBOL}`,
		`Platform Cosmetic Unlock -- 15-25${COIN_SYMBOL} (range)`,
		`Eating Pass -- 150${COIN_SYMBOL}`
	],
	adjustment: ['Balance Correction / Refund -- admin-entered, signed, a reason is required']
};

/** Slugifies a display name into a valid coin_categories.id (matches the table's own CHECK: lowercase, [a-z0-9_]+). */
export function slugifyCategoryId(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 60);
}
