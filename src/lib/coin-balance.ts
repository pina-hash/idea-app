/**
 * IDEA Coin economy: student-facing balance page. PLAIN DATA + pure helpers
 * (client-safe, the coin-desk.ts convention). This is the READ-ONLY
 * counterpart to /coin-desk: a signed-in student's own balance, history,
 * wage tier, and Eating Pass status, queried directly against 0070's
 * coin_transactions / coin_wage_tiers tables under the OWN-ROW RLS policies
 * those tables already grant (`student_email = current_user_email() or
 * is_admin()`) -- never coin_admin_lookup or any other is_admin()-gated RPC.
 * There is no write path here at all; /coin-desk is the only place a coin
 * transaction is ever logged.
 *
 * Eating Pass status is NOT derived here. It used to be re-implemented in TS
 * over the transaction list (a second copy of coin_eating_pass_active /
 * coin_eating_pass_strikes' rule, liable to drift from the SQL silently);
 * 0072's `coin_my_eating_pass_status()` RPC now calls those two functions
 * directly and is the one place that rule lives. +page.server.ts calls it
 * and passes the result straight through -- this page trusts the database's
 * answer, it does not recompute it.
 */

import type { CoinBalances, CoinMedium } from '$lib/coin-desk';

export interface CoinBalanceTransaction {
	id: string;
	category_id: string;
	amount: number;
	/**
	 * Which balance this row moved (0096). Optional so a row read from a
	 * pre-0096 backend, or a hand-written fixture that predates the column,
	 * still typechecks -- `undefined` is treated as 'digital' by
	 * `sumBalances` below, which is exactly what the backfill decided every
	 * pre-0096 row meant.
	 */
	medium?: CoinMedium;
	quantity: number | null;
	note: string | null;
	created_at: string;
	meta: Record<string, unknown> | null;
}

export interface DisplayTransaction extends CoinBalanceTransaction {
	category_name: string;
}

/**
 * Attaches each row's coin_categories display name. Falls back to the raw
 * category id for a category that no longer exists (retired or renamed)
 * rather than dropping a real history row over it.
 */
export function withCategoryNames(
	transactions: CoinBalanceTransaction[],
	categories: { id: string; name: string }[]
): DisplayTransaction[] {
	const names = new Map(categories.map((c) => [c.id, c.name]));
	return transactions.map((t) => ({ ...t, category_name: names.get(t.category_id) ?? t.category_id }));
}

/**
 * Shape of `coin_my_eating_pass_status()`'s jsonb result (0072). Not derived
 * here -- see the module doc comment above.
 */
export interface EatingPassStatus {
	active: boolean;
	strikes: number;
}

/**
 * The three numbers, summed the way `coin_balances` (the derived view) sums
 * them since 0096 -- total, physical, digital -- over rows the student's own
 * RLS policy already scoped to their own email.
 *
 * A row with no `medium` counts as DIGITAL, which is the backfill's own rule
 * for every pre-0096 row (the single balance was always the digital one), so
 * this and the view agree on a mixed-vintage list.
 */
export function sumBalances(transactions: CoinBalanceTransaction[]): CoinBalances {
	let physical = 0;
	let digital = 0;
	for (const t of transactions) {
		if (t.medium === 'physical') physical += t.amount;
		else digital += t.amount;
	}
	return { balance: physical + digital, physical_balance: physical, digital_balance: digital };
}

/**
 * The TOTAL alone, for callers that genuinely only want one number. Kept as a
 * thin wrapper over sumBalances rather than a second reduce, so there is one
 * implementation of the arithmetic here and it can never disagree with the
 * per-medium one beside it.
 */
export function sumBalance(transactions: CoinBalanceTransaction[]): number {
	return sumBalances(transactions).balance;
}
