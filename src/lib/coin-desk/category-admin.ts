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

/**
 * Reference bands pulled straight from docs/coin-economy/idea_coin_economy_
 * draft_v3.md Parts 2-4 (the same source the Contract Completion guideline
 * in contracts.ts cites) -- shown as GUIDANCE only, never enforced. An admin
 * creating a new fine or award can see roughly where the existing scale
 * sits without opening the doc; nothing here validates or clamps an input.
 */
export const PRICE_BAND_GUIDANCE: Record<CoinKind, string[]> = {
	fine: [
		'Classroom Standards Violation -- 1i¢',
		'Unauthorized Printing / Off-Task Device Use / Long Bathroom Break -- 2i¢',
		'3D Printer Not Reset / Disruptive Behavior -- 3i¢',
		'Classmate Trust Violation / Eating Violation / Leaving Without Permission -- 5i¢',
		'Shop Safety Violation / Shop Not Cleaned Up / Coin Theft / Mint Tampering (Known) -- 12i¢'
	],
	award: [
		'Correct Answer in Class / Highest Grade in Section (Weekly) / Weekly Wage -- 1i¢',
		'Above and Beyond -- 1-3i¢ (range)',
		'Quality Desktop Background -- 3i¢',
		'Weekly Role Stipend -- 2i¢ (209H only)'
	],
	purchase: [
		'Text Printing -- 1i¢ per 4 pages',
		'Song Request -- 3i¢',
		'Platform Cosmetic Unlock -- 15-25i¢ (range)',
		'Eating Pass -- 150i¢'
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
