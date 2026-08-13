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
 * SINCE 0096 A PAYOUT IS A TRANSFER, NOT A DRAIN. It debits the DIGITAL
 * balance and credits the PHYSICAL one by the same amount, atomically, as two
 * linked rows sharing a transfer id -- so the student's TOTAL does not move
 * (the coins did not go anywhere, they changed form) and the candidate list
 * is filtered on the digital balance, not the total. A student holding only
 * physical coins has nothing to pay out: those coins are already in their
 * hand, and there is deliberately no path back the other way.
 *
 * This module is plain types + pure helpers (client-safe, the sections.ts /
 * contracts.ts convention) -- it never talks to Supabase itself.
 */

export interface CoinPayoutCandidate {
	student_email: string;
	/** Total (physical + digital). Shown for context; never what is paid. */
	balance: number;
	/** What a payout actually converts. The list is filtered on THIS since 0096. */
	digital_balance: number;
	physical_balance: number;
	last_activity_at: string | null;
	display_name: string | null;
	full_name: string | null;
}

export interface CoinPayoutResult {
	email: string;
	ok: boolean;
	reason?: string;
	balance?: number;
	digital_balance?: number;
	physical_balance?: number;
	amount?: number;
	/** True when the admin asked for less than the whole digital balance. */
	partial?: boolean;
	transfer_id?: string;
	requested?: number;
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
export function payoutRefusalMessage(r: {
	reason?: string;
	balance?: number;
	digital_balance?: number;
	requested?: number;
	message?: string;
}): string {
	switch (r.reason) {
		case 'no_balance':
			return `Nothing to pay -- digital balance is ${r.digital_balance ?? r.balance ?? 0}i¢ right now.`;
		case 'amount_exceeds_digital':
			return `Blocked: asked for ${r.requested}i¢ but only ${r.digital_balance}i¢ is digital.`;
		case 'debt':
			return `Blocked: balance is negative (${r.balance}i¢).`;
		case 'error':
			return r.message ? `Error: ${r.message}` : 'An unexpected error occurred.';
		default:
			return r.reason ? `Refused: ${r.reason}` : 'Refused by the server.';
	}
}
