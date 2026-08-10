/**
 * IDEA Coin roles: Shop Steward, Quartermaster, Safety Officer, Lab Tech.
 * Plain types + pure helpers (client-safe, the coin-desk.ts / sections.ts
 * convention). This module never talks to Supabase; every write is a call
 * to a migration 0074/0076 RPC made from RolesManager.svelte directly. See
 * supabase/migrations/0074_coin_roles.sql for the base design rationale and
 * supabase/migrations/0076_coin_role_quiz_and_expiration.sql for the real
 * question bank, snapshotted answers, and holder expiration -- why the
 * ratio cap is checked at approval and not application, why the question
 * bank is edited by hand outside the normal migration flow (never here),
 * why expiration is a computed condition with no scheduled job, and why MC
 * correctness is informational only.
 */

export interface CoinRoleDefinition {
	id: string;
	name: string;
	description: string | null;
	ratio_kind: 'fixed' | 'per_students';
	ratio_count: number;
	ratio_per_students: number | null;
	ratio_is_default: boolean;
	active: boolean;
	sort_order: number;
	notes: string | null;
	/** Days from approval to a suggested expiration -- a UI pre-fill only, never server-enforced. */
	suggested_duration_days: number | null;
}

export type QuizQuestionType = 'mc' | 'written';

/**
 * A question as read from coin_role_quiz_questions (0076) for rendering the
 * application form. Content is maintained by hand outside this repo's git
 * history -- see the 0076 migration header and CLAUDE.md's Roles section --
 * so this table is commonly empty for a role until someone seeds it.
 */
export interface RoleQuizQuestion {
	id: string;
	role_id: string;
	type: QuizQuestionType;
	question_text: string;
	sequence: number;
	/** 'mc' only. */
	options: string[] | null;
	correct_option_index: number | null;
}

/** A single question/answer pair as returned inside CoinRoleApplicationRow.answers, snapshotted at submission time. */
export interface RoleAnswerRecord {
	question_id: string;
	type: QuizQuestionType;
	question: string;
	options: string[] | null;
	written_answer: string | null;
	selected_option_index: number | null;
	correct_option_index: number | null;
	/** 'mc' only -- computed once, at submission, from the question's answer key at that moment. Informational; never gates review. */
	is_correct: boolean | null;
}

export interface CoinRoleApplicationRow {
	id: string;
	student_email: string;
	display_name: string | null;
	full_name: string | null;
	role_id: string;
	role_name: string;
	section_id: string;
	answers: RoleAnswerRecord[];
	status: 'pending' | 'approved' | 'rejected';
	submitted_by: string;
	submitted_at: string;
	reviewed_by: string | null;
	reviewed_at: string | null;
	review_note: string | null;
}

export interface CoinRoleHolderRow {
	id: string;
	student_email: string;
	display_name: string | null;
	full_name: string | null;
	role_id: string;
	role_name: string;
	section_id: string;
	since: string;
	assigned_by: string;
	expires_at: string | null;
	/** revoked_at is null AND (expires_at is null OR expires_at > now()), computed server-side -- never stored, never scheduled. */
	is_active: boolean;
	revoked_at: string | null;
	revoked_by: string | null;
	revoke_reason: string | null;
}

export interface RoleCapacity {
	role_id: string;
	section_id: string;
	cap: number;
	held: number;
	section_size: number;
}

export interface RoleBulkLogResult {
	email: string;
	ok: boolean;
	reason?: string;
	balance?: number;
	amount?: number;
	message?: string;
	strike?: boolean;
	[key: string]: unknown;
}

export interface RoleBulkLogResponse {
	ok: boolean;
	role_id: string | null;
	section_id: string | null;
	total: number;
	succeeded: number;
	refused: number;
	results: RoleBulkLogResult[];
}

/** Short ratio description for the definitions list. Display only. */
export function ratioDescription(role: CoinRoleDefinition): string {
	if (role.ratio_kind === 'fixed') {
		return `${role.ratio_count} per section`;
	}
	return `${role.ratio_count} per ~${role.ratio_per_students} students (scaled)`;
}

/** `capacityFor()` returns null before the preview has loaded -- render a placeholder, not a false "0 of 0". */
export function capacityLabel(cap: RoleCapacity | null): string {
	if (!cap) return 'checking capacity…';
	return `${cap.held} of ${cap.cap} filled (${cap.section_size} student${cap.section_size === 1 ? '' : 's'} in section)`;
}

/**
 * Whether every currently-active question for a role has a usable answer in
 * `answers` (a written question needs non-empty trimmed text, an MC question
 * needs a selected index). A role with zero configured questions (the 0076
 * migration leaves every role's question bank empty until seeded by hand)
 * trivially passes -- there is nothing to answer yet.
 */
export function questionsAnswered(
	questions: RoleQuizQuestion[],
	answers: Record<string, { written?: string; selected?: number }>
): boolean {
	return questions.every((q) => {
		const a = answers[q.id];
		if (!a) return false;
		if (q.type === 'written') return !!a.written?.trim();
		return typeof a.selected === 'number';
	});
}

/**
 * A YYYY-MM-DD date string (matching <input type="date">) `role.suggested_duration_days`
 * days from `from` (defaults to now), or null when the role has no suggested
 * duration. A pure UI pre-fill -- the approval RPC never applies this on its
 * own; see the 0076 migration header for why.
 */
export function suggestedExpirationDate(
	role: CoinRoleDefinition | undefined,
	from: Date = new Date()
): string | null {
	if (!role?.suggested_duration_days) return null;
	const d = new Date(from);
	d.setDate(d.getDate() + role.suggested_duration_days);
	return d.toISOString().slice(0, 10);
}

/** Converts a <input type="date"> value into an end-of-day ISO timestamp for an expires_at RPC param, or null for "no expiration". */
export function dateInputToExpiresAt(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const d = new Date(`${trimmed}T23:59:59`);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type HolderStatus = 'active' | 'expired' | 'revoked';

/**
 * Single source of truth for how a holder row's state reads in the UI.
 * `is_active` is the server's computed condition; a row can ALSO be
 * revoked_at-null-but-expired (is_active false, revoked_at still null) when
 * nothing has yet lazily finalized it -- see the 0076 migration header --
 * which still reads as "expired" here, not "active".
 */
export function holderStatus(h: CoinRoleHolderRow): HolderStatus {
	if (h.revoked_at) {
		return h.revoked_by === 'system' ? 'expired' : 'revoked';
	}
	return h.is_active ? 'active' : 'expired';
}
