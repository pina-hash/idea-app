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

export interface CoinBalanceTransaction {
	id: string;
	category_id: string;
	amount: number;
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
 * Sum of every row's signed amount -- the same arithmetic `coin_balances`
 * (the derived view) performs, over rows the student's own RLS policy
 * already scoped to their own email.
 */
export function sumBalance(transactions: CoinBalanceTransaction[]): number {
	return transactions.reduce((sum, t) => sum + t.amount, 0);
}
