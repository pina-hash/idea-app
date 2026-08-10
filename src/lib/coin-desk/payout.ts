/**
 * IDEA Coin bulk payout: pay out every student with a positive balance, one
 * at a time or all at once. This reuses the EXISTING `coin_payout` category
 * (0070, purchase-kind, variable pricing) -- the same mechanism the
 * single-student "Coin Payout" entry in CoinDeskTool's category dropdown
 * already logs through -- rather than inventing a second write path.
 *
 * Every write here is a call to one of migration 0079's two RPCs
 * (`coin_payout_student` / `coin_bulk_payout`). Both re-read the student's
 * CURRENT balance, inside the RPC, immediately before logging the payout --
 * never a balance the client read earlier when the candidate list loaded.
 * That is what makes "someone else's fine or award landed in between" safe:
 * the amount actually paid is always whatever the ledger says at the moment
 * of the write, not a cached number. See
 * supabase/migrations/0079_coin_bulk_payout.sql for the full RPC bodies.
 *
 * This module is plain types + pure helpers (client-safe, the sections.ts /
 * contracts.ts convention) -- it never talks to Supabase itself.
 */

export interface CoinPayoutCandidate {
	student_email: string;
	balance: number;
	last_activity_at: string | null;
	display_name: string | null;
	full_name: string | null;
}

export interface CoinPayoutResult {
	email: string;
	ok: boolean;
	reason?: string;
	balance?: number;
	amount?: number;
	message?: string;
	[key: string]: unknown;
}

export interface CoinBulkPayoutResponse {
	ok: boolean;
	total: number;
	succeeded: number;
	refused: number;
	results: CoinPayoutResult[];
}

export function payoutCandidateLabel(c: {
	display_name: string | null;
	full_name: string | null;
	student_email: string;
}): string {
	return c.display_name || c.full_name || c.student_email;
}

/**
 * Mirrors CoinDeskTool.svelte's own `reasonMessage` for the refusal shapes
 * every category can already return (debt, a cap, etc. -- unreachable here
 * in practice since a payout only ever targets a positive, purchase-kind
 * balance, but coin_log_transaction's shape is still what the RPC returns
 * through), plus the one refusal unique to a payout: nothing left to pay.
 */
export function payoutRefusalMessage(r: { reason?: string; balance?: number; message?: string }): string {
	switch (r.reason) {
		case 'no_balance':
			return `Nothing to pay -- balance is ${r.balance ?? 0}i¢ right now.`;
		case 'debt':
			return `Blocked: balance is negative (${r.balance}i¢).`;
		case 'error':
			return r.message ? `Error: ${r.message}` : 'An unexpected error occurred.';
		default:
			return r.reason ? `Refused: ${r.reason}` : 'Refused by the server.';
	}
}
