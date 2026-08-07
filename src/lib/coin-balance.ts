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

export interface EatingPassStatus {
	active: boolean;
	strikes: number;
}

/**
 * Mirrors `coin_eating_pass_active` / `coin_eating_pass_strikes` (0070) in
 * pure TS over an already-fetched transaction list. Those two SQL functions
 * are `revoke all ... from public` with no explicit `grant ... to
 * authenticated` -- only SECURITY DEFINER callers (coin_log_transaction,
 * coin_admin_lookup) can reach them, so a student session cannot call them
 * directly. This is the read-side equivalent, computed from rows the
 * student's own RLS policy already lets them see, not a second privileged
 * code path or an admin RPC.
 *
 * `transactions` MUST be sorted newest-first (created_at desc), matching the
 * page's own query order -- the same order the SQL functions' own `order by
 * created_at desc` produces.
 */
export function eatingPassStatus(transactions: CoinBalanceTransaction[]): EatingPassStatus {
	const passEvents = transactions.filter(
		(t) => t.category_id === 'eating_pass' || t.category_id === 'eating_pass_revoked'
	);
	const active = passEvents[0]?.category_id === 'eating_pass';

	// Strikes count since the most recent Eating Pass PURCHASE (not the
	// revoke event) -- coin_eating_pass_strikes' own coalesce-to-'-infinity'
	// rule, so a student who has never bought a pass counts every strike ever
	// logged (there being nothing to reset against).
	const lastPurchase = transactions.find((t) => t.category_id === 'eating_pass');
	const cutoff = lastPurchase?.created_at ?? null;
	const strikes = transactions.filter(
		(t) =>
			t.category_id === 'eating_violation' &&
			t.meta?.strike === true &&
			(cutoff === null || t.created_at >= cutoff)
	).length;

	return { active, strikes };
}

/**
 * Sum of every row's signed amount -- the same arithmetic `coin_balances`
 * (the derived view) performs, over rows the student's own RLS policy
 * already scoped to their own email.
 */
export function sumBalance(transactions: CoinBalanceTransaction[]): number {
	return transactions.reduce((sum, t) => sum + t.amount, 0);
}
