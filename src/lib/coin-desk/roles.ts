/**
 * IDEA Coin roles: Shop Steward, Quartermaster, Safety Officer, Lab Tech.
 * Plain types + pure helpers (client-safe, the coin-desk.ts / sections.ts
 * convention). This module never talks to Supabase; every write is a call
 * to a migration 0074 RPC made from RolesManager.svelte directly. See
 * supabase/migrations/0074_coin_roles.sql for the full design rationale --
 * why the ratio cap is checked at approval and not application, why two of
 * the four ratios are a proposed default rather than settled policy, and
 * why Weekly Role Stipend gets its own bulk-log RPC instead of riding
 * coin_bulk_log_section.
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
}

export interface RoleAnswer {
	question: string;
	answer: string;
}

export interface CoinRoleApplicationRow {
	id: string;
	student_email: string;
	display_name: string | null;
	full_name: string | null;
	role_id: string;
	role_name: string;
	section_id: string;
	answers: RoleAnswer[];
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
 * Placeholder free-response prompts, per role. The REAL quiz questions live
 * in the legacy "Role Questions" Google Sheet behind getRoleQuestions /
 * submitRoleApplication (src/lib/server/coin-ledger.ts,
 * src/routes/api/coin-ledger/apply/+server.ts) -- outside this repo, never
 * committed here, and NOT reproduced by this file. This is a functional
 * stand-in so an admin can log a real application today; swap these for the
 * real quiz text (by hand, or by porting it in from the Sheet) whenever
 * that content is available. coin_role_applications.answers stores whatever
 * question text was actually asked, verbatim -- these prompts are never
 * read back from the database, only used to render the entry form.
 */
export const ROLE_APPLICATION_QUESTIONS: Record<string, string[]> = {
	shop_steward: [
		'Why do you want to be Shop Steward?',
		'Describe a time you kept a space safe or organized for other people.'
	],
	quartermaster: [
		'Why do you want to be Quartermaster?',
		'How would you track what tools and materials are checked out, and to whom?'
	],
	safety_officer: [
		'Why do you want to be Safety Officer?',
		'What would you do if you saw a classmate about to make an unsafe call?'
	],
	lab_tech: [
		'Why do you want to be Lab Tech?',
		'What would you check on a shared machine before the next student uses it?'
	]
};

export function questionsFor(roleId: string): string[] {
	return ROLE_APPLICATION_QUESTIONS[roleId] ?? ['Why do you want this role?'];
}
