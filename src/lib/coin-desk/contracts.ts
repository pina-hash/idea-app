/**
 * IDEA Coin contracts: post a job, students self-claim it, an admin
 * completes it (splitting the payout evenly across whoever claimed it) or
 * cancels it. Plain types + pure helpers (client-safe, the sections.ts /
 * roles.ts convention). Every write is a call to a migration 0077 RPC --
 * this module never talks to Supabase, and every *Preview helper here is
 * informational only, the coin-desk.ts convention: the RPC response is
 * always the authoritative amount.
 *
 * See supabase/migrations/0077_coin_contracts.sql for the full design
 * rationale -- why the capacity check needs a row lock and not just an
 * RPC-side count, why status is computed rather than stored, and why the
 * student browse read (coin_contracts + coin_contract_status) is a direct
 * table/view read with no RPC while the admin listing is its own RPC
 * (coin_admin_list_contracts) that additionally exposes claimant identities
 * a plain student's RLS never sees.
 */

export type ContractStatus = 'open' | 'full' | 'completed' | 'cancelled';

export interface ContractClaimant {
	student_email: string;
	claimed_at: string;
	display_name: string | null;
	full_name: string | null;
}

/** A row from coin_admin_list_contracts() -- admin-only, claimant identities included. */
export interface CoinContractRow {
	id: string;
	title: string;
	description: string | null;
	payout_amount: number;
	max_contractors: number;
	section_id: string | null;
	created_by: string;
	created_at: string;
	completed_at: string | null;
	cancelled_at: string | null;
	cancel_reason: string | null;
	claimed_count: number;
	status: ContractStatus;
	claimants: ContractClaimant[];
}

/** A row a plain student reads directly: coin_contracts joined with coin_contract_status. No claimant identities. */
export interface PublicContractRow {
	id: string;
	title: string;
	description: string | null;
	payout_amount: number;
	max_contractors: number;
	section_id: string | null;
	created_by: string;
	created_at: string;
	completed_at: string | null;
	cancelled_at: string | null;
	claimed_count: number;
	status: ContractStatus;
}

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
	open: 'Open',
	full: 'Full',
	completed: 'Completed',
	cancelled: 'Cancelled'
};

export function claimantLabel(c: ContractClaimant): string {
	return c.display_name || c.full_name || c.student_email;
}

/**
 * Preview only -- the server (coin_admin_complete_contract) computes the
 * real per-claimant share via Postgres round(), which rounds a half away
 * from zero (the SAME convention 3D Printing / Property Damage already use).
 * JS's Math.round() does the identical thing for a positive input, so this
 * preview and the real charge agree even at exact ties (e.g. 15 / 2 -> 8,
 * not 7).
 */
export function contractSharePreview(payoutAmount: number, claimantCount: number): number {
	if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) return 0;
	if (!Number.isFinite(claimantCount) || claimantCount <= 0) return 0;
	return Math.round(payoutAmount / claimantCount);
}

/**
 * The docs' Contract Completion guideline (~1i¢/hour, +50% for specialized
 * skill) as a client-side HINT for an admin posting a new contract --
 * informational only, never enforced. payout_amount is always a free-entry
 * field; see 0077's migration header.
 */
export function contractPayoutGuideline(hours: number, specialized: boolean): number {
	if (!Number.isFinite(hours) || hours <= 0) return 0;
	const base = hours; // 1i¢/hour
	return Math.round(specialized ? base * 1.5 : base);
}

export function claimRefusalMessage(r: {
	reason?: string;
	max_contractors?: number;
	claimed_count?: number;
	section_id?: string;
}): string {
	switch (r.reason) {
		case 'not_open':
			return 'This contract is no longer open.';
		case 'wrong_section':
			return 'This contract is restricted to a different class section than yours.';
		case 'already_claimed':
			return 'You already claimed this contract.';
		case 'full':
			return `This contract is already full (${r.claimed_count}/${r.max_contractors}).`;
		default:
			return r.reason ? `Refused: ${r.reason}` : 'Refused by the server.';
	}
}
