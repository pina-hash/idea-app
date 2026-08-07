/**
 * IDEA Coin economy entry tool: plain data + pure helpers (client-safe, the
 * curriculum.ts convention). This is the day-to-day admin tool for logging
 * fines, awards, and purchases against migration 0070's real Supabase ledger
 * -- a NEW route (/coin-desk), separate from the legacy Sheets-backed
 * /coin-entry and its coin-ledger API, which this never touches.
 *
 * ENFORCEMENT LIVES ENTIRELY IN THE RPCs, NOT A TRIGGER. 0070 puts no
 * trigger on coin_transactions and grants no client insert/update/delete on
 * it at all (`revoke all ... from anon, authenticated; grant select`) -- the
 * debt lockout, the Eating Pass strike/revoke logic, Extra Credit's cap and
 * category allowlist, the calendar-boundary caps, and every formula are all
 * inline plpgsql inside coin_log_transaction and the five dedicated RPCs
 * below. That means this tool's writes MUST go through those RPCs (there is
 * no other write path to go through) -- every helper here is about routing
 * a category to the right one and shaping its params, never about
 * re-deriving what the server already enforces. Preview numbers in this
 * file (priceHint, the *Amount helpers) are informational only; the RPC
 * response is always the real, authoritative answer.
 */

export type CoinKind = 'fine' | 'award' | 'purchase' | 'adjustment';
export type CoinPricingModel = 'flat' | 'range' | 'per_unit' | 'variable' | 'formula';

export interface CoinCategory {
	id: string;
	name: string;
	kind: CoinKind;
	scope: 'core' | '209h';
	pricing_model: CoinPricingModel;
	amount: number | null;
	min_amount: number | null;
	max_amount: number | null;
	unit_label: string | null;
	formula_key: string | null;
	semester_point_cap: number | null;
	cap_period: 'day' | 'month' | null;
	cap_count: number | null;
	notes: string | null;
}

export const KIND_ORDER: CoinKind[] = ['fine', 'award', 'purchase', 'adjustment'];

export const KIND_LABELS: Record<CoinKind, string> = {
	fine: 'Fines',
	award: 'Awards',
	purchase: 'Purchases',
	adjustment: 'Adjustments'
};

/**
 * Category ids whose write goes through a DEDICATED RPC instead of the
 * generic coin_log_transaction. Four are 0070's true 'formula' categories;
 * extra_credit is priced 'per_unit' but coin_log_transaction refuses it by
 * name (it needs the semester cap check coin_log_extra_credit does). Keep
 * this in step with 0070 -- it is the one place that migration's routing
 * rule is duplicated, and only as a lookup table, never as re-implemented
 * business logic.
 */
export const DEDICATED_RPC: Record<string, string> = {
	perfect_score_graded_work: 'coin_log_perfect_score',
	pay_raise: 'coin_log_pay_raise',
	property_damage_careless: 'coin_log_property_damage_careless',
	three_d_printing: 'coin_log_three_d_printing',
	extra_credit: 'coin_log_extra_credit'
};

export const EXTRA_CREDIT_GRADING_CATEGORIES: { id: string; label: string }[] = [
	{ id: 'unit_labs', label: 'Unit Labs' },
	{ id: 'unit_assignments', label: 'Unit Assignments' },
	{ id: 'documentation', label: 'Documentation' }
];

function formulaHint(key: string | null): string {
	switch (key) {
		case 'perfect_score':
			return 'round(points / 25)i¢, min 1i¢';
		case 'pay_raise':
			return '40i¢ x current tier';
		case 'property_damage_careless':
			return '3i¢ + 1i¢ per $0.25 of cost';
		case 'three_d_printing':
			return 'material + time band';
		default:
			return 'computed';
	}
}

/** Short price description for the category dropdown. Display only. */
export function priceHint(cat: CoinCategory): string {
	if (cat.id === 'extra_credit') {
		return `${cat.amount}i¢/${cat.unit_label ?? 'unit'}, capped ${cat.semester_point_cap ?? '?'}pt/semester`;
	}
	switch (cat.pricing_model) {
		case 'flat':
			return `${cat.amount}i¢`;
		case 'range':
			return `${cat.min_amount}-${cat.max_amount}i¢`;
		case 'per_unit':
			return `${cat.amount}i¢/${cat.unit_label ?? 'unit'}`;
		case 'variable':
			return 'amount you enter';
		case 'formula':
			return formulaHint(cat.formula_key);
	}
}

/** Preview only -- the server (coin_log_perfect_score) computes the real amount. */
export function perfectScorePreview(points: number): number {
	if (!Number.isFinite(points) || points <= 0) return 0;
	return Math.max(1, Math.round(points / 25));
}

/** Preview only -- the server (coin_log_property_damage_careless) computes the real amount. */
export function propertyDamagePreview(costDollars: number): number {
	if (!Number.isFinite(costDollars) || costDollars < 0) return 3;
	return 3 + Math.round(costDollars / 0.25);
}

/** Preview only -- the server (coin_log_three_d_printing) computes the real amount. */
export function threeDPrintingPreview(
	grams: number,
	hours: number,
	overnight: boolean
): { material: number; time: number; total: number } {
	const material = Number.isFinite(grams) && grams > 0 ? Math.round(grams / 10) : 0;
	const time = overnight
		? 0
		: !Number.isFinite(hours) || hours < 1
			? 0
			: hours < 3
				? 2
				: hours < 6
					? 4
					: 6;
	return { material, time, total: material + time };
}

/** Preview only -- the server (coin_log_pay_raise) computes the real cost and re-reads the tier under a row lock. */
export function payRaisePreview(currentTier: number): number {
	return 40 * currentTier;
}

export interface StudentSuggestion {
	id: string;
	email: string;
	full_name: string | null;
	display_name: string | null;
}

/** Best available label for a suggestion row: what the portal shows elsewhere, never a fabricated name. */
export function studentLabel(s: StudentSuggestion): string {
	return s.display_name || s.full_name || s.email;
}

/**
 * PostgREST's `.or()` filter string is comma/paren-delimited, so a raw search
 * term could break the query syntax (or, worse, be read as unintended
 * filter clauses). Strip the characters that matter to that mini-language;
 * the search is a convenience lookup, not a place that needs full ILIKE
 * wildcard support from the admin's typed text.
 */
export function sanitizeSearchTerm(term: string): string {
	return term.replace(/[%*,()]/g, '').trim();
}
