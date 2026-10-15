/**
 * IDEA COIN CONTRACTS ON THE COIN DESK (IDEA Coin V2 session two, 0248).
 * Plain types and pure helpers (client-safe, the coin-desk.ts convention);
 * this module never talks to Supabase.
 *
 * WHAT CHANGED. A contract carries a PAY TYPE set when it is posted:
 *   hourly   the student reports hours and is paid the contract's rate;
 *   flat     the payout is split between whoever claimed it;
 *   quality  a base the approver adjusts.
 * It may be restricted to one IDEA Classroom class, and it may be a
 * RESTITUTION JOB (`debt_only`): visible to and claimable by only a student
 * whose balance is below zero, and never on the public board.
 *
 * COMPLETION IS NOT A BUTTON HERE ANY MORE. Each claimant marks their part
 * done (coin_contract_mark_done), which puts a `contract` card in the queue
 * with the amount filled in; approving that card pays, and when every
 * claimant is paid the contract completes itself. This area posts, cancels
 * and resets, and shows where each claimant is.
 */

export type ContractPayType = 'hourly' | 'flat' | 'quality';
export type AdminContractStatus = 'open' | 'full' | 'completed' | 'cancelled';

export const CONTRACT_PAY_TYPES: ContractPayType[] = ['flat', 'hourly', 'quality'];

export const PAY_TYPE_LABELS: Record<ContractPayType, string> = {
	flat: 'Flat: one payout, split between the claimants',
	hourly: 'Hourly: the student reports hours, paid at a rate',
	quality: 'Quality: a base you adjust when you approve'
};

export const CONTRACT_STATUS_LABELS: Record<AdminContractStatus, string> = {
	open: 'Open',
	full: 'Full',
	completed: 'Completed',
	cancelled: 'Cancelled'
};

/** One claimant of `coin_contracts_admin()` (0248). */
export interface AdminContractClaimant {
	email: string;
	name: string | null;
	claimed_at: string;
	done_at: string | null;
	hours: number | string | null;
	paid_at: string | null;
	/** The queue card's status: pending, approved or denied; null with no card. */
	request_status: string | null;
}

/** One contract of `coin_contracts_admin()` (0248). */
export interface AdminContract {
	id: string;
	title: string;
	description: string | null;
	pay_type: ContractPayType;
	payout_amount: number | string | null;
	hourly_rate: number | string | null;
	debt_only: boolean;
	max_contractors: number;
	section_id: string | null;
	section: string | null;
	created_at: string;
	completed_at: string | null;
	cancelled_at: string | null;
	cancel_reason: string | null;
	status: AdminContractStatus;
	claimants: AdminContractClaimant[];
}

export type ClaimantState = 'paid' | 'marked_done' | 'claimed';

/**
 * Where one claimant is. A card that was denied hands the work back (0248
 * clears `done_at`), so a denied claimant reads as claimed again, which is
 * the truth: they have the job and have not finished it.
 */
export function claimantState(c: AdminContractClaimant): ClaimantState {
	if (c.paid_at) return 'paid';
	if (c.done_at) return 'marked_done';
	return 'claimed';
}

export const CLAIMANT_STATE_WORDS: Record<ClaimantState, string> = {
	paid: 'Paid',
	marked_done: 'Marked done, waiting in the queue',
	claimed: 'Claimed'
};

export function claimantName(c: Pick<AdminContractClaimant, 'email' | 'name'>): string {
	return c.name?.trim() || c.email;
}

/** How many claimants have a card waiting in the queue. */
export function waitingInQueue(c: AdminContract): number {
	return c.claimants.filter((k) => claimantState(k) === 'marked_done').length;
}

/** What a contract pays, in words. Amounts go through the caller's formatter. */
export function payLine(c: Pick<AdminContract, 'pay_type' | 'payout_amount' | 'hourly_rate'>, fmt: (n: number) => string): string {
	const n = (v: number | string | null) => (v == null || v === '' ? 0 : Number(v));
	if (c.pay_type === 'hourly') return `${fmt(n(c.hourly_rate))} an hour`;
	if (c.pay_type === 'quality') return `${fmt(n(c.payout_amount))} base, adjusted when you approve`;
	return `${fmt(n(c.payout_amount))}, split between the claimants`;
}

/** The post form as typed: every field a string or a flag. */
export interface ContractDraft {
	title: string;
	description: string;
	payType: ContractPayType;
	payout: string;
	hourlyRate: string;
	maxContractors: string;
	sectionId: string;
	debtOnly: boolean;
}

export function emptyContractDraft(): ContractDraft {
	return {
		title: '',
		description: '',
		payType: 'flat',
		payout: '',
		hourlyRate: '',
		maxContractors: '1',
		sectionId: '',
		debtOnly: false
	};
}

/**
 * What still stops a post, in words, or null when it may be sent. Mirrors
 * 0248's `coin_contract_post` refusals so the button can say why it is not
 * ready; the server still decides.
 */
export function contractDraftProblem(d: ContractDraft): string | null {
	if (!d.title.trim()) return 'Give the contract a title.';
	if (d.title.trim().length > 200) return 'A title is at most 200 characters.';
	if (d.payType === 'hourly') {
		const r = Number(d.hourlyRate);
		if (!d.hourlyRate.trim() || !Number.isFinite(r) || r <= 0 || r > 1000) {
			return 'Enter an hourly rate above 0 and up to 1000.';
		}
	} else {
		const p = Number(d.payout);
		if (!d.payout.trim() || !Number.isInteger(p) || p <= 0) return 'Enter the payout as a whole number above 0.';
	}
	const m = Number(d.maxContractors);
	if (!Number.isInteger(m) || m < 1 || m > 50) return 'Allow from 1 to 50 students.';
	return null;
}

/** The parameters for `coin_contract_post`, from a draft that passed the check. */
export function contractPostParams(d: ContractDraft): Record<string, unknown> {
	return {
		p_title: d.title.trim(),
		p_description: d.description.trim() || null,
		p_pay_type: d.payType,
		p_payout_amount: d.payType === 'hourly' ? null : Number(d.payout),
		p_hourly_rate: d.payType === 'hourly' ? Math.round(Number(d.hourlyRate) * 100) / 100 : null,
		p_max_contractors: Number(d.maxContractors),
		p_section_id: d.sectionId || null,
		p_debt_only: d.debtOnly
	};
}

export function contractPostRefusal(reason: string | undefined): string {
	switch (reason) {
		case 'title':
			return 'A title is needed, at most 200 characters.';
		case 'pay_type':
			return 'Choose how the contract pays.';
		case 'hourly_rate':
			return 'An hourly contract needs a rate above 0 and up to 1000.';
		case 'payout':
			return 'A flat or quality contract needs a payout above 0.';
		case 'max_contractors':
			return 'Allow from 1 to 50 students.';
		case 'unknown_class':
			return 'That class is not there any more. Reload the page.';
		default:
			return reason ? `Refused: ${reason}.` : 'Refused by the server.';
	}
}

/** Open and full contracts first (newest first), then the finished ones. */
export function splitContracts(list: AdminContract[]): { live: AdminContract[]; closed: AdminContract[] } {
	const live = list.filter((c) => c.status === 'open' || c.status === 'full');
	const closed = list.filter((c) => c.status === 'completed' || c.status === 'cancelled');
	return { live, closed };
}
