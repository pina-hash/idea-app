/**
 * IDEA Coin economy entry tool: plain data + pure helpers (client-safe, the
 * curriculum.ts convention). This is the day-to-day admin tool for logging
 * fines, awards, and purchases against migration 0070's real Supabase ledger,
 * which is the sole system of record. It replaced a Google Sheets / Apps
 * Script ledger, retired in August 2026 and archived unchanged under
 * docs/coin-economy/archive/legacy-system/.
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

import { COIN_SYMBOL, coinNumber } from '$lib/coin-format';

export type CoinKind = 'fine' | 'award' | 'purchase' | 'adjustment';
export type CoinPricingModel = 'flat' | 'range' | 'per_unit' | 'variable' | 'formula';

/**
 * IDEA COIN V2 (0239): ONE BALANCE, AND IT IS DIGITAL. Every row the desk
 * writes is digital and no call names `p_medium` any more; physical rows stay
 * in a student's history and count toward nothing. The medium type survives
 * only because a history row still carries the column (and
 * `$lib/coin-balance` reads it); there is no choice of medium anywhere on the
 * desk, no default, and no preference for one.
 */
export type CoinMedium = 'physical' | 'digital';

/**
 * The pre-V2 balance triple. NOTHING ON THE DESK READS IT: it stays only
 * because `$lib/coin-balance` (`sumBalances`) still imports it, and goes the
 * day that module stops. The desk reads `balance`, the one digital sum.
 */
export interface CoinBalances {
	balance: number;
	physical_balance: number;
	digital_balance: number;
}

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
	/**
	 * Optional so every pre-0080 literal in this codebase (the dev harness's
	 * SAMPLE_CATEGORIES chief among them) keeps compiling untouched --
	 * `undefined` reads as active everywhere this is checked (`c.active !==
	 * false`), the same convention as leaving it off in a hand-written seed
	 * row. Only migration 0080's CategoriesManager reads/writes it for real:
	 * a retired category (`active: false`) drops out of every loggable list
	 * but stays a fully valid `category_id` on its historical transactions
	 * (coin_transactions.category_id references coin_categories(id), never
	 * cascaded or nulled).
	 */
	active?: boolean;
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
			return `round(points / 25)${COIN_SYMBOL}, min 1${COIN_SYMBOL}`;
		case 'pay_raise':
			return `${payRaisePreview(1)}${COIN_SYMBOL} x current tier`;
		case 'property_damage_careless':
			return `3${COIN_SYMBOL} + 1${COIN_SYMBOL} per $0.25 of cost`;
		case 'three_d_printing':
			return `1${COIN_SYMBOL} per 10 g, by weight`;
		default:
			return 'computed';
	}
}

/** Short price description for the category dropdown. Display only. */
export function priceHint(cat: CoinCategory): string {
	if (cat.id === 'extra_credit') {
		return `${coinNumber(cat.amount)}${COIN_SYMBOL}/${cat.unit_label ?? 'unit'}, capped per class`;
	}
	switch (cat.pricing_model) {
		case 'flat':
			return `${coinNumber(cat.amount)}${COIN_SYMBOL}`;
		case 'range':
			return `${coinNumber(cat.min_amount)}-${coinNumber(cat.max_amount)}${COIN_SYMBOL}`;
		case 'per_unit':
			return `${coinNumber(cat.amount)}${COIN_SYMBOL}/${cat.unit_label ?? 'unit'}`;
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
	// IDEA Coin V2: a print is charged by weight only (round half up of grams
	// divided by 10). Print time is never charged; the two time arguments stay
	// so existing callers compile, and are ignored.
	void hours;
	void overnight;
	const material = Number.isFinite(grams) && grams > 0 ? Math.round(grams / 10) : 0;
	return { material, time: 0, total: material };
}

/** Preview only -- the server (coin_log_pay_raise) computes the real cost and re-reads the tier under a row lock. */
export function payRaisePreview(currentTier: number): number {
	return 100 * currentTier;
}

/**
 * The one category id whose flat `amount` is a BASE rate rather than the whole
 * price: Weekly Wage pays base x the student's own wage tier, which is what a
 * Pay Raise buys (0084). Named here so the UI and the fake ledger both branch
 * on one constant instead of a loose string.
 */
export const WEEKLY_WAGE_CATEGORY_ID = 'weekly_wage';

/**
 * Preview only -- coin_log_transaction (0084) reads the tier itself and its
 * answer is always the authoritative one. A student with no coin_wage_tiers
 * row is tier 1, so this floors at 1 exactly like the SQL does.
 */
export function weeklyWagePreview(
	baseAmount: number | null | undefined,
	tier: number | null | undefined
): number {
	return (baseAmount ?? 0) * Math.max(1, tier ?? 1);
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

// ---------------------------------------------------------------------------
// Per-user coin desk preferences: `profiles.preferences.coinDesk`
//
// The FOURTH namespace in the same free-form JSONB the launcher keeps its
// homepage layout in (`homepage`), the class view keeps its folded units in
// (`classroomUnits`) and the home feed keeps its collapsed class cards in
// (`classroomFeed`). Each one owns its own parser in its own feature module;
// this is the coin desk's. That is why it needed no migration -- the column
// already exists and the namespaces do not know about each other.
//
// THE WRITE IS A WHOLE-BLOB SPREAD-MERGE at the call site
// (`{ ...(preferences ?? {}), coinDesk: next }`), never a targeted jsonb
// update, so writing one namespace can never clobber a sibling.
//
// WHAT BELONGS HERE, and it is a narrow list on purpose: the one choice an
// operator makes once and then wants to stop making, which TARGET they log
// against (one student or a whole class). It is not data and changes
// nothing any RPC enforces.
//
// A STORED `medium` FROM BEFORE V2 IS IGNORED ON READ. It used to pick which
// balance an entry moved; since 0239 there is one balance, so the key is
// dropped rather than read (a preference shape migrates on read, in code).
//
// WHAT DELIBERATELY DOES NOT: the last student, the last category, the last
// amount. Those are the entry itself, and remembering them across sessions is
// how the wrong student gets charged.
// ---------------------------------------------------------------------------

/**
 * Log against one student, or against a whole class's roster. The stored
 * value stays 'section' (a stored id is append-only); a class is an IDEA
 * Classroom section since V2 session two, so the word still fits.
 */
export type CoinLogMode = 'student' | 'section';

export const COIN_LOG_MODES: CoinLogMode[] = ['student', 'section'];

export interface CoinDeskPrefs {
	/** Which target the entry form opens on. Absent reads as 'student'. */
	mode?: CoinLogMode;
}

/**
 * Read the stored coin desk preferences out of a profile's `preferences` blob.
 *
 * VALUES ARE VALIDATED AGAINST THE UNIONS, not merely type-checked: an
 * unrecognised mode is DROPPED rather than passed through, so a
 * hand-edited row (or a value written by an older client whose vocabulary has
 * since changed) degrades to the documented default instead of putting the
 * form into a state no branch renders. Everything here fails soft: a missing
 * column, a null blob, a non-object namespace and a garbage value all read as
 * "no preference".
 */
export function readCoinDeskPrefs(preferences: unknown): CoinDeskPrefs {
	if (!preferences || typeof preferences !== 'object') return {};
	const raw = (preferences as Record<string, unknown>).coinDesk;
	if (!raw || typeof raw !== 'object') return {};
	const src = raw as Record<string, unknown>;
	const out: CoinDeskPrefs = {};
	if (src.mode === 'student' || src.mode === 'section') out.mode = src.mode;
	return out;
}

/** The mode the form opens on, with the documented default applied. */
export function coinLogMode(prefs: CoinDeskPrefs): CoinLogMode {
	return prefs.mode ?? 'student';
}
