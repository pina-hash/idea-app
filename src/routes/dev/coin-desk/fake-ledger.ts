import type { CoinCategory, StudentSuggestion } from '$lib/coin-desk';
import type { CoinSectionRow, CoinSectionStudentRow } from '$lib/coin-desk/sections';
import type { CoinRoleDefinition, QuizQuestionType } from '$lib/coin-desk/roles';
import {
	expectedBalance,
	legacyCategoryForType,
	parseContractsPayload,
	parseSummaryCsv,
	parseTransactionsCsv,
	signedAmount,
	isKnownLegacyType,
	buildRawSnapshot,
	type ImportBatchRow,
	type LegacyPull,
	type SavedMappingRow
} from '$lib/coin-desk/migrate';

/**
 * In-memory stand-in for the 0070 Supabase schema, mirroring its actual
 * enforcement (debt lockout, Eating Pass strikes/revoke, Extra Credit's cap,
 * calendar-boundary caps, every formula) closely enough to exercise every
 * refusal shape the real RPCs return. This is a TEST DOUBLE for the dev
 * harness only -- CoinDeskTool.svelte never imports it; the real route talks
 * to the real database.
 */

export const SAMPLE_CATEGORIES: CoinCategory[] = [
	{ id: 'shop_safety_violation', name: 'Shop Safety Violation', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 12, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Real physical injury risk, priced at the top on purpose.' },
	{ id: 'shop_not_cleaned_up', name: 'Shop Not Cleaned Up', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 12, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'coin_theft', name: 'Coin Theft', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 12, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'classmate_trust_violation', name: 'Classmate Trust Violation', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 5, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'eating_violation', name: 'Eating Violation', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 5, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Eating with no pass, or breaking pass conduct rules badly enough to strike. A third strike while holding a pass revokes it.' },
	{ id: 'leaving_without_permission', name: 'Leaving Without Permission', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 5, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'disruptive_behavior', name: 'Disruptive Behavior', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 3, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'printer_not_reset', name: '3D Printer Not Reset', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 3, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'long_bathroom_break', name: 'Long Bathroom Break', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 2, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'off_task_device_use', name: 'Off-Task Device Use', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 2, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'unauthorized_printing', name: 'Unauthorized Printing', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 2, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'classroom_standards_violation', name: 'Classroom Standards Violation', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 1, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'property_damage_careless', name: 'Property Damage (Careless)', kind: 'fine', scope: 'core', pricing_model: 'formula', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: 'property_damage_careless', semester_point_cap: null, cap_period: null, cap_count: null, notes: '3i¢ flat plus 1i¢ per $0.25 of repair/replacement cost.' },
	{ id: 'property_damage_first_accident', name: 'Property Damage (First Accident)', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 0, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'No charge for a first accidental incident in a semester; logged, not billed.' },
	{ id: 'property_damage_repeat_accident', name: 'Property Damage (Repeat Accident)', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 5, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },

	{ id: 'highest_grade_weekly', name: 'Highest Grade in Section (Weekly)', kind: 'award', scope: 'core', pricing_model: 'flat', amount: 1, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'perfect_score_graded_work', name: 'Perfect Score on Graded Work', kind: 'award', scope: 'core', pricing_model: 'formula', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: 'perfect_score', semester_point_cap: null, cap_period: null, cap_count: null, notes: 'round(points / 25)i¢, minimum 1i¢.' },
	{ id: 'quality_desktop_background', name: 'Quality Desktop Background', kind: 'award', scope: 'core', pricing_model: 'flat', amount: 3, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: 'month', cap_count: 1, notes: 'Once per calendar month, resetting on the 1st.' },
	{ id: 'above_and_beyond', name: 'Above and Beyond', kind: 'award', scope: 'core', pricing_model: 'range', amount: null, min_amount: 1, max_amount: 3, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Instructor discretion.' },
	{ id: 'weekly_role_stipend', name: 'Weekly Role Stipend', kind: 'award', scope: '209h', pricing_model: 'flat', amount: 2, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'donate_supplies_small', name: 'Donate Supplies (Small, ~$1-5)', kind: 'award', scope: 'core', pricing_model: 'flat', amount: 1, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'donate_supplies_medium', name: 'Donate Supplies (Medium, ~$5-15)', kind: 'award', scope: 'core', pricing_model: 'flat', amount: 3, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'donate_supplies_large', name: 'Donate Supplies (Large, $15+)', kind: 'award', scope: 'core', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Case-by-case, instructor sign-off.' },
	{ id: 'correct_answer_in_class', name: 'Correct Answer in Class', kind: 'award', scope: 'core', pricing_model: 'flat', amount: 1, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: 'day', cap_count: 1, notes: 'Must be correct AND actually reasoned. Capped once per day.' },
	{ id: 'contract_completion', name: 'Contract Completion', kind: 'award', scope: 'core', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'No fixed price: enter the amount at logging time.' },
	{ id: 'competition_winnings', name: 'Competition Winnings', kind: 'award', scope: 'core', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'weekly_wage', name: 'Weekly Wage', kind: 'award', scope: 'core', pricing_model: 'flat', amount: 1, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'The floor, not the engine: guaranteed just for being enrolled.' },
	{ id: 'physical_coin_submission', name: 'Physical Coin Submission', kind: 'award', scope: 'core', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'debt_payment', name: 'Debt Payment', kind: 'award', scope: 'core', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Debt settlement, logged distinctly from Physical Coin Submission. Not capped at the current debt.' },

	{ id: 'eating_pass', name: 'Eating Pass', kind: 'purchase', scope: 'core', pricing_model: 'flat', amount: 150, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'One tier, conduct rules attached. At most one active pass per student.' },
	{ id: 'extra_credit', name: 'Extra Credit', kind: 'purchase', scope: '209h', pricing_model: 'per_unit', amount: 2, min_amount: null, max_amount: null, unit_label: 'point', formula_key: null, semester_point_cap: 21, cap_period: null, cap_count: null, notes: 'Restricted to Unit Labs, Unit Assignments, and Documentation checks.' },
	{ id: 'platform_cosmetic_unlock', name: 'Platform Cosmetic Unlock', kind: 'purchase', scope: 'core', pricing_model: 'range', amount: null, min_amount: 15, max_amount: 25, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'coin_payout', name: 'Coin Payout', kind: 'purchase', scope: 'core', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Converts digital balance to physical coins handed over.' },
	{ id: 'three_d_printing', name: '3D Printing', kind: 'purchase', scope: 'core', pricing_model: 'formula', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: 'three_d_printing', semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Material 1i¢/10g + a time band.' },
	{ id: 'text_printing', name: 'Text Printing (B&W, per 4 pages)', kind: 'purchase', scope: 'core', pricing_model: 'per_unit', amount: 1, min_amount: null, max_amount: null, unit_label: '4 pages', formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'song_request', name: 'Song Request', kind: 'purchase', scope: 'core', pricing_model: 'flat', amount: 3, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Approval-gated: nothing plays until reviewed.' },
	{ id: 'pay_raise', name: 'Pay Raise', kind: 'purchase', scope: 'core', pricing_model: 'formula', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: 'pay_raise', semester_point_cap: null, cap_period: null, cap_count: null, notes: '40i¢ x the tier being left; permanently raises the wage tier.' },

	{ id: 'balance_correction', name: 'Balance Correction / Refund', kind: 'adjustment', scope: 'core', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Admin-entered, signed amount with a required reason.' }
];

/**
 * Emails match the seeded ledger accounts below exactly, so picking a name
 * from the typeahead lands on a real, meaningful history (healthy balance,
 * debt, an active Eating Pass) rather than a blank stranger. Quinn Patel is
 * deliberately UNSEEDED, landing on stateFor()'s lazy zero-balance default --
 * the "no transactions logged yet" empty state. A plain typed email with no
 * profiles match at all (the "they haven't signed in yet" path) needs no
 * seed row -- any email not in this list demonstrates it.
 */
export const SAMPLE_STUDENTS: StudentSuggestion[] = [
	{ id: 's1', email: 'healthy.student@boscotech.net', full_name: 'Alex Rivera', display_name: null },
	{ id: 's2', email: 'debt.student@boscotech.net', full_name: 'Jordan Kim', display_name: null },
	{ id: 's3', email: 'pass.student@boscotech.net', full_name: 'Samantha Diaz', display_name: 'Sam Diaz' },
	{ id: 's4', email: 'quinn.patel@boscotech.net', full_name: 'Quinn Patel', display_name: null }
];

/**
 * Mirrors 0074's seed exactly (same ids, ratios, and ratio_is_default
 * flags), plus 0076's suggested_duration_days: shop_steward and
 * quartermaster are the two REAL documented ratios, safety_officer and
 * lab_tech are the proposed DEFAULT the source quiz never specified (see
 * roles.ts / 0074's migration header). suggested_duration_days is a UI
 * pre-fill only (roughly one semester, 90 days), matching 0076's seed.
 */
export const SAMPLE_ROLE_DEFINITIONS: CoinRoleDefinition[] = [
	{
		id: 'shop_steward',
		name: 'Shop Steward',
		description: 'Keeps the shop floor safe and organized between classes.',
		ratio_kind: 'per_students',
		ratio_count: 3,
		ratio_per_students: 25,
		ratio_is_default: false,
		active: true,
		sort_order: 10,
		notes: 'Documented ratio: 3 per ~25 students, scaled proportionally.',
		suggested_duration_days: 90
	},
	{
		id: 'quartermaster',
		name: 'Quartermaster',
		description: 'Tracks and issues shared tools and materials.',
		ratio_kind: 'fixed',
		ratio_count: 1,
		ratio_per_students: null,
		ratio_is_default: false,
		active: true,
		sort_order: 20,
		notes: 'Documented ratio: 1 per section, regardless of size.',
		suggested_duration_days: 90
	},
	{
		id: 'safety_officer',
		name: 'Safety Officer',
		description: 'Watches for and flags safety issues during independent work time.',
		ratio_kind: 'fixed',
		ratio_count: 2,
		ratio_per_students: null,
		ratio_is_default: true,
		active: true,
		sort_order: 30,
		notes: 'DEFAULT, not settled: the source quiz never specified a ratio for this role.',
		suggested_duration_days: 90
	},
	{
		id: 'lab_tech',
		name: 'Lab Tech',
		description: 'Keeps shared lab and print equipment running and reset between users.',
		ratio_kind: 'fixed',
		ratio_count: 2,
		ratio_per_students: null,
		ratio_is_default: true,
		active: true,
		sort_order: 40,
		notes: 'DEFAULT, not settled: the source quiz never specified a ratio for this role.',
		suggested_duration_days: 90
	}
];

interface SampleRoleQuestion {
	id: string;
	role_id: string;
	type: QuizQuestionType;
	question_text: string;
	sequence: number;
	options: string[] | null;
	correct_option_index: number | null;
}

/**
 * A dev-only stand-in question bank (this fake ledger's own test content,
 * NOT the real quiz text -- see 0076's migration header: the real content is
 * seeded by hand outside this repo, never committed here). Covers one
 * written and one MC question per role so the dynamic form, submission, and
 * the review screen's correctness indicator are all exercisable. quartermaster
 * is left with ZERO questions on purpose, to drive the "no questions
 * configured yet" empty state a role can genuinely be in before content is
 * seeded.
 */
export const SAMPLE_ROLE_QUESTIONS: SampleRoleQuestion[] = [
	{
		id: 'q-ss-1',
		role_id: 'shop_steward',
		type: 'written',
		question_text: 'Describe a time you kept a space safe or organized for other people.',
		sequence: 1,
		options: null,
		correct_option_index: null
	},
	{
		id: 'q-ss-2',
		role_id: 'shop_steward',
		type: 'mc',
		question_text: 'You see a classmate leave a table saw running unattended. What do you do first?',
		sequence: 2,
		options: [
			'Turn it off and find the instructor.',
			'Leave it -- not your machine.',
			'Wait to see if they come back.',
			'Post about it later.'
		],
		correct_option_index: 0
	},
	{
		id: 'q-so-1',
		role_id: 'safety_officer',
		type: 'written',
		question_text: 'What would you do if you saw a classmate about to make an unsafe call?',
		sequence: 1,
		options: null,
		correct_option_index: null
	},
	{
		id: 'q-so-2',
		role_id: 'safety_officer',
		type: 'mc',
		question_text: 'Which of these is the Safety Officer most responsible for during independent work time?',
		sequence: 2,
		options: [
			'Grading classmates’ work.',
			'Watching for and flagging unsafe behavior.',
			'Assigning weekly wages.',
			'Managing the coin ledger.'
		],
		correct_option_index: 1
	},
	{
		id: 'q-lt-1',
		role_id: 'lab_tech',
		type: 'written',
		question_text: 'What would you check on a shared machine before the next student uses it?',
		sequence: 1,
		options: null,
		correct_option_index: null
	},
	{
		id: 'q-lt-2',
		role_id: 'lab_tech',
		type: 'mc',
		question_text: 'A 3D printer finishes a job and the bed is still covered in filament scraps. What do you do?',
		sequence: 2,
		options: ['Leave it for the next student.', 'Clean the bed and reset it.', 'Unplug the printer.', 'Nothing -- not your job.'],
		correct_option_index: 1
	}
];

function questionsForRole(roleId: string): SampleRoleQuestion[] {
	return SAMPLE_ROLE_QUESTIONS.filter((q) => q.role_id === roleId).sort((a, b) => a.sequence - b.sequence);
}

interface RoleAnswerState {
	question_id: string;
	type: QuizQuestionType;
	question_text: string;
	options: string[] | null;
	written_answer: string | null;
	selected_option_index: number | null;
	correct_option_index: number | null;
	is_correct: boolean | null;
}

interface RoleApplicationState {
	id: string;
	student_email: string;
	role_id: string;
	section_id: string;
	answers: RoleAnswerState[];
	status: 'pending' | 'approved' | 'rejected';
	submitted_by: string;
	submitted_at: string;
	reviewed_by: string | null;
	reviewed_at: string | null;
	review_note: string | null;
}

interface RoleHolderState {
	id: string;
	student_email: string;
	role_id: string;
	section_id: string;
	application_id: string;
	since: string;
	assigned_by: string;
	expires_at: string | null;
	revoked_at: string | null;
	revoked_by: string | null;
	revoke_reason: string | null;
}

/** Mirrors the 0076 "currently active" condition exactly, everywhere it's used. */
function holderIsActive(h: RoleHolderState): boolean {
	if (h.revoked_at) return false;
	if (h.expires_at && new Date(h.expires_at).getTime() <= Date.now()) return false;
	return true;
}

interface Txn {
	id: string;
	category_id: string;
	category_name: string;
	amount: number;
	quantity: number | null;
	note: string | null;
	actor_email: string;
	created_at: string;
	/** Sparse, like the real jsonb: the eating-violation strike flag, and the
	 * legacy import's batch tag (0084). */
	meta?: Record<string, unknown>;
}

interface StudentState {
	balance: number;
	wageTier: number;
	ecUsedPoints: number;
	txns: Txn[];
}

/**
 * Two 0070 categories are `loggable: false` mechanisms (a system-inserted
 * event, a section-wide freeze), so the server load filters them out of the
 * SELECTABLE list -- but they still exist as real coin_categories rows in
 * production, and coin_admin_lookup's join resolves their name from that
 * row regardless. Kept separate from SAMPLE_CATEGORIES (which mirrors the
 * `active and loggable` server filter, i.e. the dropdown contents) so
 * history rows referencing them show a real name instead of a raw id.
 */
const NAME_ONLY_CATEGORIES: Pick<CoinCategory, 'id' | 'name'>[] = [
	{ id: 'eating_pass_revoked', name: 'Eating Pass Revoked (system)' },
	{ id: 'mint_tampering_unknown', name: 'Mint Tampering (Suspect Unknown)' },
	// 0084's legacy categories: loggable = false, active = false in the real
	// schema, so they never enter the dropdown list -- but imported history
	// rows reference them and must resolve a real name.
	{ id: 'legacy_award', name: 'Legacy Award (Sheets)' },
	{ id: 'legacy_fine', name: 'Legacy Fine (Sheets)' },
	{ id: 'legacy_purchase', name: 'Legacy Purchase (Sheets)' },
	{ id: 'legacy_payout', name: 'Legacy Payout (Sheets)' }
];
/**
 * Mutable (unlike SAMPLE_CATEGORIES itself): 0080's coin_admin_create_category
 * / coin_admin_set_category_active RPCs both need somewhere to write a new
 * row or flip `active` on an existing one, and every read path (the logging
 * dropdown, coin_log_transaction, coin_bulk_log_section, category-name
 * resolution) goes through this map so a freshly created or retired category
 * is visible everywhere immediately, mirroring how sections/roles/contracts
 * already work in this fake ledger.
 */
const catById = new Map<string, CoinCategory>(SAMPLE_CATEGORIES.map((c) => [c.id, c]));

function categoryNameFor(id: string): string {
	return catById.get(id)?.name ?? NAME_ONLY_CATEGORIES.find((c) => c.id === id)?.name ?? id;
}

/**
 * Synchronous read of the current loggable category list, for the dev
 * harness to seed CoinDeskTool's initial `categories` prop the way
 * +page.server.ts seeds it from a real `coin_categories` select (loggable
 * regardless of active state -- CategoriesManager needs to see retired rows
 * too, same as coin-desk/+page.server.ts's own query since 0080).
 */
export function listCategories(): CoinCategory[] {
	return Array.from(catById.values());
}

const ledger = new Map<string, StudentState>();
let txnSeq = 0;

/**
 * In-memory mirror of 0073's coin_sections / coin_section_students. Emails
 * match SAMPLE_STUDENTS so a section's roster resolves real display names,
 * the same "seed against the same accounts the single-student flow uses"
 * convention as the rest of this fake ledger.
 */
const sections = new Map<string, CoinSectionRow>();
const sectionStudents = new Map<string, string>(); // student_email -> section_id
const sectionAssignedAt = new Map<string, string>();

/**
 * In-memory mirror of 0074's coin_role_applications / coin_role_holders,
 * keyed the same way the rest of this fake ledger is (Maps by id).
 */
const roleApplications = new Map<string, RoleApplicationState>();
const roleHolders = new Map<string, RoleHolderState>();
let appSeq = 0;
let holderSeq = 0;

/**
 * In-memory mirror of 0077's coin_contracts / coin_contract_claims, mirroring
 * its business logic (refusal shapes, computed status, the even-split
 * arithmetic) closely enough to drive both ContractsManager and ContractsView
 * end to end. The REAL guarantee this migration is actually about --
 * concurrent claims on the last slot never over-claiming a contract -- is
 * proven separately, against genuine concurrent Postgres connections, in
 * tests/coin-contracts.test.ts; this mock is single-threaded JS with no
 * interleaving point between its capacity check and its write, so it cannot
 * meaningfully re-demonstrate that property and does not try to.
 */
interface ContractState {
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
	/** 0084's batch tag; null/absent = a live contract, untouched by rollback. */
	import_batch?: string | null;
}
const contracts = new Map<string, ContractState>();
const contractClaims = new Map<string, Map<string, string>>(); // contract_id -> (student_email -> claimed_at)
let contractSeq = 0;

// ---------------------------------------------------------------------------
// 0084's legacy Sheets import: in-memory mirrors of coin_import_batches /
// coin_import_mappings / coin_students plus the five import RPCs. The fixture
// below is CSV TEXT parsed through the REAL migrate.ts parsers, so the
// harness exercises the same parsing path the pull endpoint runs -- a
// synthetic sheet covering every transaction type (Held / Owed included),
// two profile-matchable names, an eating-pass purchase per real amount
// (40/50/50), two External rows (one a partial name), all three contract
// statuses, and multi-contractor splits.
// ---------------------------------------------------------------------------

const importBatches = new Map<string, ImportBatchRow>();
const importMappings = new Map<string, SavedMappingRow>();
const coinStudents = new Map<
	string,
	{ display_name: string; legacy_section: string | null; source: string }
>();
let importBatchSeq = 0;

const MIGRATE_SUMMARY_CSV = `Name,Section,Wage,Awarded,Fines,Spent,Coin Balance,Paid Out,Bank Balance,Debt
"Rivera, Alex",IDEA-113,1,30,5,0,25,0,0,0
"Kim, Jordan",IDEA-208-1,1,10,12,6,0,0,0,8
"Delgadillo, Seth",IDEA-113,1,80,0,40,36,4,0,0
"Jette-Kouri, Abraham",IDEA-208-2,1,73,0,50,23,0,0,0
"de la Loza, Joseph",IDEA-113,1,8,0,0,8,0,0,0
"Veneziano, Ezio",IDEA-403,1,90,3,50,37,0,0,0
Colin,External,1,15,0,0,15,0,0,0
"Bushman, Henry",External,1,0,0,0,0,0,0,0
`;

const MIGRATE_TRANSACTIONS_CSV = `Date / Time,Name,Amount,Type,Reason,
2026-05-05 12:00,"Rivera, Alex",20,Award,Weekly Wage,
2026-05-06 09:15,"Rivera, Alex",10,Award - Held,Legacy Wealth Declaration,
2026-05-07 10:00,"Rivera, Alex",5,Fine,Unprofessional Conduct,
2026-05-05 12:05,"Kim, Jordan",10,Award,Weekly Wage,
2026-05-08 11:30,"Kim, Jordan",12,Fine,Shop Safety Violation,
2026-05-12 13:10,"Kim, Jordan",6,Purchase,Song Request,
2026-05-05 12:10,"Delgadillo, Seth",60,Award,Contract Completion,
2026-05-06 12:11,"Delgadillo, Seth",20,Award - Held,Held award,
2026-05-18 22:37,"Delgadillo, Seth",40,Purchase,Basic Classroom Eating Pass,
2026-05-27 09:00,"Delgadillo, Seth",4,Payout,Physical coin payout,
2026-05-18 14:21,"Jette-Kouri, Abraham",43,Award,Legacy Wealth Declaration,
2026-05-20 10:00,"Jette-Kouri, Abraham",30,Award,Competition Winnings,
2026-05-18 22:42,"Jette-Kouri, Abraham",50,Purchase,Executive Classroom Eating Pass,
2026-05-19 09:30,"de la Loza, Joseph",8,Award,Above and Beyond,
2026-05-05 12:20,"Veneziano, Ezio",90,Award,Competition Winnings,
2026-05-21 15:00,"Veneziano, Ezio",3,Fine - Owed,Still owes for printing,
2026-05-18 22:43,"Veneziano, Ezio",50,Purchase,Executive Classroom Eating Pass,
2026-05-22 10:30,Colin,15,Award,Guest helper award,
`;

/** Ledger-shaped, exactly what the contracts action answers with (camelCase
 * keys, pipe-separated contractors), so parseContractsPayload runs for real. */
const MIGRATE_CONTRACTS_PAYLOAD = [
	{ row: 2, name: 'Fix Go-Cart', basePayout: 30, rateLabel: '', quantity: 1, totalPayout: 30, status: 'In Progress', contractors: 'Rivera, Alex|Kim, Jordan', split: '', notes: '', dateAdded: '2026-05-20', dateCompleted: '' },
	{ row: 3, name: 'Safety Glasses Storage System', basePayout: 15, rateLabel: '', quantity: 1, totalPayout: 15, status: 'Open', contractors: '', split: '', notes: 'Design and build a storage rack.', dateAdded: '2026-05-20', dateCompleted: '' },
	{ row: 4, name: 'Label 24x Safety Glasses', basePayout: 4, rateLabel: '', quantity: 1, totalPayout: 4, status: 'Completed', contractors: 'Delgadillo, Seth|Veneziano, Ezio', split: '2,2', notes: '', dateAdded: '2026-05-20', dateCompleted: '2026-05-26' }
];

/** The harness's PULL transport parses the fixture through the REAL parsers. */
export function migrateFixturePull(): LegacyPull {
	return buildRawSnapshot({
		summary: parseSummaryCsv(MIGRATE_SUMMARY_CSV),
		transactions: parseTransactionsCsv(MIGRATE_TRANSACTIONS_CSV),
		contracts: parseContractsPayload(MIGRATE_CONTRACTS_PAYLOAD),
		contractHistory: [],
		contractsAvailable: true,
		source: { note: 'dev harness fixture' }
	});
}

/** The way the real route load resumes: the committed batch first, else the
 * most recent pull. */
export function latestImportBatch(): ImportBatchRow | null {
	const all = Array.from(importBatches.values());
	const committed = all.filter((b) => b.committed_at);
	if (committed.length) return committed[committed.length - 1];
	return all.length ? all[all.length - 1] : null;
}

export function listImportMappings(): SavedMappingRow[] {
	return Array.from(importMappings.values()).map((m) => ({ ...m }));
}

/** The fake's stand-in for a naive LA timestamp: the browser's own zone is
 * close enough for display/sorting here -- the REAL America/Los_Angeles
 * interpretation is 0084's, proven against real Postgres in
 * tests/coin-legacy-import.test.ts. */
function legacyDateToIso(naive: string): string {
	const d = new Date(naive.includes(' ') || naive.includes('T') ? naive.replace(' ', 'T') : `${naive}T00:00:00`);
	return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function contractClaimedCount(id: string): number {
	return contractClaims.get(id)?.size ?? 0;
}

/** Mirrors 0077's coin_contract_status view exactly. */
function contractStatus(c: ContractState): 'open' | 'full' | 'completed' | 'cancelled' {
	if (c.completed_at) return 'completed';
	if (c.cancelled_at) return 'cancelled';
	return contractClaimedCount(c.id) >= c.max_contractors ? 'full' : 'open';
}

function contractClaimantRows(id: string): { student_email: string; claimed_at: string; display_name: string | null; full_name: string | null }[] {
	const claims = contractClaims.get(id);
	if (!claims) return [];
	return Array.from(claims.entries())
		.sort((a, b) => new Date(a[1]).getTime() - new Date(b[1]).getTime())
		.map(([email, claimedAt]) => {
			const student = SAMPLE_STUDENTS.find((s) => s.email === email);
			return { student_email: email, claimed_at: claimedAt, display_name: student?.display_name ?? null, full_name: student?.full_name ?? null };
		});
}

function sectionStudentCount(id: string): number {
	let n = 0;
	for (const sid of sectionStudents.values()) if (sid === id) n++;
	return n;
}

function roleById(id: string): CoinRoleDefinition | undefined {
	return SAMPLE_ROLE_DEFINITIONS.find((r) => r.id === id);
}

/** Mirrors 0074's _coin_role_capacity exactly: fixed cap, or floor(count x size / per). */
function roleCapacity(roleId: string, sectionId: string): number {
	const role = roleById(roleId);
	if (!role) return 0;
	if (role.ratio_kind === 'fixed') return role.ratio_count;
	const size = sectionStudentCount(sectionId);
	return Math.floor((role.ratio_count * size) / (role.ratio_per_students ?? 1));
}

/** Mirrors 0076's _coin_role_active_holder_count: revoked_at is null AND not naturally expired. */
function activeHolderCount(roleId: string, sectionId: string): number {
	let n = 0;
	for (const h of roleHolders.values()) {
		if (h.role_id === roleId && h.section_id === sectionId && holderIsActive(h)) n++;
	}
	return n;
}

function studentHoldsRole(email: string, roleId: string): boolean {
	for (const h of roleHolders.values()) {
		if (h.student_email === email && h.role_id === roleId && holderIsActive(h)) return true;
	}
	return false;
}

/**
 * Synchronous read of the current role definitions, for the dev harness to
 * seed CoinDeskTool's initial `roleDefinitions` prop the way +page.server.ts
 * seeds it from a real `coin_role_definitions` select.
 */
export function listRoleDefinitions(): CoinRoleDefinition[] {
	return SAMPLE_ROLE_DEFINITIONS.filter((r) => r.active).slice();
}

/**
 * Synchronous read of the current section list, for the dev harness to seed
 * CoinDeskTool's initial `sections` prop the same way +page.server.ts seeds
 * it via coin_admin_list_sections() -- call AFTER createFakeLedger() so the
 * seed rows above exist.
 */
export function listSections(): CoinSectionRow[] {
	return Array.from(sections.values())
		.map((s) => ({ ...s, student_count: sectionStudentCount(s.id) }))
		.sort((a, b) => (a.active === b.active ? a.id.localeCompare(b.id) : a.active ? -1 : 1));
}

function stateFor(email: string): StudentState {
	let s = ledger.get(email);
	if (!s) {
		s = { balance: 0, wageTier: 1, ecUsedPoints: 0, txns: [] };
		ledger.set(email, s);
	}
	return s;
}

function insert(email: string, categoryId: string, signed: number, quantity: number | null, note: string | null, meta: Record<string, unknown> = {}): Txn {
	const s = stateFor(email);
	const txn: Txn = {
		id: `t${++txnSeq}`,
		category_id: categoryId,
		category_name: categoryNameFor(categoryId),
		amount: signed,
		quantity,
		note,
		actor_email: 'admin@boscotech.edu',
		created_at: new Date().toISOString()
	};
	s.balance += signed;
	s.txns.unshift(txn);
	if (categoryId === 'eating_violation' && meta.strike) (txn as unknown as { meta: unknown }).meta = meta;
	return txn;
}

function eatingPassActive(email: string): boolean {
	const s = stateFor(email);
	const last = s.txns.find((t) => t.category_id === 'eating_pass' || t.category_id === 'eating_pass_revoked');
	return last?.category_id === 'eating_pass';
}

function eatingPassStrikes(email: string): number {
	const s = stateFor(email);
	const lastPurchase = s.txns.find((t) => t.category_id === 'eating_pass');
	const boundary = lastPurchase ? new Date(lastPurchase.created_at).getTime() : -Infinity;
	return s.txns.filter(
		(t) =>
			t.category_id === 'eating_violation' &&
			(t as unknown as { meta?: { strike?: boolean } }).meta?.strike === true &&
			new Date(t.created_at).getTime() >= boundary
	).length;
}

function capReached(email: string, cat: CoinCategory): boolean {
	if (!cat.cap_period || !cat.cap_count) return false;
	const s = stateFor(email);
	const now = new Date();
	const count = s.txns.filter((t) => {
		if (t.category_id !== cat.id) return false;
		const d = new Date(t.created_at);
		if (cat.cap_period === 'day') return d.toDateString() === now.toDateString();
		return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
	}).length;
	return count >= cat.cap_count;
}

function ok(extra: Record<string, unknown>) {
	return { data: { ok: true, ...extra }, error: null };
}
function refused(reason: string, extra: Record<string, unknown> = {}) {
	return { data: { ok: false, reason, ...extra }, error: null };
}
function rpcError(message: string) {
	return { data: null, error: { message } };
}

/**
 * `getCurrentStudentEmail` resolves 0077's `current_user_email()` for
 * coin_contract_self_claim and the coin_contract_claims read -- the two
 * places that act as "whoever is signed in", never an admin-entered email.
 * Defaults to a dummy admin address since /dev/coin-desk's admin-only
 * harness never calls either; /dev/contracts passes a live getter over its
 * own student-identity switcher.
 */
export function createFakeLedger(getCurrentStudentEmail: () => string = () => 'admin@boscotech.edu') {
	// Seed a few students so every refusal path is reachable without setup clicks.
	ledger.set('healthy.student@boscotech.net', {
		balance: 42,
		wageTier: 1,
		ecUsedPoints: 0,
		txns: [
			{
				id: 't0',
				category_id: 'weekly_wage',
				category_name: 'Weekly Wage',
				amount: 1,
				quantity: null,
				note: null,
				actor_email: 'admin@boscotech.edu',
				created_at: new Date(Date.now() - 86400000 * 3).toISOString()
			}
		]
	});
	ledger.set('debt.student@boscotech.net', {
		balance: -8,
		wageTier: 1,
		ecUsedPoints: 0,
		txns: [
			{
				id: 't-1',
				category_id: 'shop_safety_violation',
				category_name: 'Shop Safety Violation',
				amount: -12,
				quantity: null,
				note: null,
				actor_email: 'admin@boscotech.edu',
				created_at: new Date(Date.now() - 86400000).toISOString()
			},
			{
				id: 't-2',
				category_id: 'above_and_beyond',
				category_name: 'Above and Beyond',
				amount: 4,
				quantity: null,
				note: 'helped a classmate debug their sketch',
				actor_email: 'admin@boscotech.edu',
				created_at: new Date(Date.now() - 3600000).toISOString()
			}
		]
	});
	const passTxns: Txn[] = [
		{
			id: 't-p1',
			category_id: 'eating_pass',
			category_name: 'Eating Pass',
			amount: -150,
			quantity: null,
			note: null,
			actor_email: 'admin@boscotech.edu',
			created_at: new Date(Date.now() - 86400000 * 5).toISOString()
		},
		{
			id: 't-p2',
			category_id: 'eating_violation',
			category_name: 'Eating Violation',
			amount: -5,
			quantity: null,
			note: 'left wrapper at the station',
			actor_email: 'admin@boscotech.edu',
			created_at: new Date(Date.now() - 86400000 * 2).toISOString()
		}
	];
	(passTxns[1] as unknown as { meta: unknown }).meta = { strike: true };
	ledger.set('pass.student@boscotech.net', { balance: 195, wageTier: 2, ecUsedPoints: 15, txns: passTxns });

	// Seed two sections: one keyed to a real curriculum.ts Section.id (so
	// sectionDisplayName() resolves it from the curriculum, not the stored
	// label) and one custom group with no curriculum counterpart.
	const now = new Date().toISOString();
	sections.set('eng1h-sophomore', {
		id: 'eng1h-sophomore',
		label: null,
		color: '#00ff41',
		active: true,
		note: null,
		created_by: 'admin@boscotech.edu',
		created_at: now,
		updated_at: now,
		student_count: 0
	});
	sections.set('period-3-makeup', {
		id: 'period-3-makeup',
		label: 'Period 3 Makeup Group',
		color: '#ffb02e',
		active: true,
		note: 'Students finishing labs after school',
		created_by: 'admin@boscotech.edu',
		created_at: now,
		updated_at: now,
		student_count: 0
	});
	sectionStudents.set('healthy.student@boscotech.net', 'eng1h-sophomore');
	sectionAssignedAt.set('healthy.student@boscotech.net', now);
	sectionStudents.set('debt.student@boscotech.net', 'eng1h-sophomore');
	sectionAssignedAt.set('debt.student@boscotech.net', now);
	sectionStudents.set('pass.student@boscotech.net', 'period-3-makeup');
	sectionAssignedAt.set('pass.student@boscotech.net', now);

	// Ratio-cap demo section: 10 bare students (no ledger/profile history
	// needed -- they exist only for the section-size count) so Shop
	// Steward's floor(3 x size / 25) ratio computes a real, non-trivial cap
	// of exactly 1 here: floor(3 x 10 / 25) = 1. Kept SEPARATE from the two
	// sections above so it never disturbs their existing bulk-log demo
	// behavior (2 and 1 students respectively, already exercised).
	sections.set('role-ratio-demo', {
		id: 'role-ratio-demo',
		label: 'Ratio Cap Demo (10 students)',
		color: '#3d7dff',
		active: true,
		note: 'Shop Steward: 3 per ~25 students -> floor(3 x 10 / 25) = 1 here.',
		created_by: 'admin@boscotech.edu',
		created_at: now,
		updated_at: now,
		student_count: 0
	});
	const demoEmails: string[] = [];
	for (let i = 1; i <= 10; i++) {
		const demoEmail = `ratio-demo-${i}@boscotech.net`;
		demoEmails.push(demoEmail);
		sectionStudents.set(demoEmail, 'role-ratio-demo');
		sectionAssignedAt.set(demoEmail, now);
	}

	// Two pending Shop Steward applications for the SAME role + section.
	// Approving the first is "one under the cap" (0 held < cap 1); approving
	// the second right after is "an application at exactly the cap" (1 held
	// >= cap 1), refused with ratio_cap_reached. Revoking the first holder
	// then frees the slot for the still-pending second application.
	roleApplications.set('app-demo-1', {
		id: 'app-demo-1',
		student_email: demoEmails[0],
		role_id: 'shop_steward',
		section_id: 'role-ratio-demo',
		answers: [
			{
				question_id: 'q-ss-1',
				type: 'written',
				question_text: 'Describe a time you kept a space safe or organized for other people.',
				options: null,
				written_answer: 'Relabeled the tool wall so it stayed sorted after group builds.',
				selected_option_index: null,
				correct_option_index: null,
				is_correct: null
			},
			{
				question_id: 'q-ss-2',
				type: 'mc',
				question_text: 'You see a classmate leave a table saw running unattended. What do you do first?',
				options: questionsForRole('shop_steward')[1]?.options ?? null,
				written_answer: null,
				selected_option_index: 0,
				correct_option_index: 0,
				is_correct: true
			}
		],
		status: 'pending',
		submitted_by: 'admin@boscotech.edu',
		submitted_at: new Date(Date.now() - 3600000).toISOString(),
		reviewed_by: null,
		reviewed_at: null,
		review_note: null
	});
	roleApplications.set('app-demo-2', {
		id: 'app-demo-2',
		student_email: demoEmails[1],
		role_id: 'shop_steward',
		section_id: 'role-ratio-demo',
		answers: [
			{
				question_id: 'q-ss-1',
				type: 'written',
				question_text: 'Describe a time you kept a space safe or organized for other people.',
				options: null,
				written_answer: 'Ran a quick cleanup checklist with my group at the end of build days.',
				selected_option_index: null,
				correct_option_index: null,
				is_correct: null
			},
			{
				question_id: 'q-ss-2',
				type: 'mc',
				question_text: 'You see a classmate leave a table saw running unattended. What do you do first?',
				options: questionsForRole('shop_steward')[1]?.options ?? null,
				written_answer: null,
				selected_option_index: 2,
				correct_option_index: 0,
				is_correct: false
			}
		],
		status: 'pending',
		submitted_by: 'admin@boscotech.edu',
		submitted_at: new Date(Date.now() - 1800000).toISOString(),
		reviewed_by: null,
		reviewed_at: null,
		review_note: null
	});
	appSeq = 2;

	// Five seeded contracts covering every status ContractsManager /
	// ContractsView can show: open with room and one existing claimant, full
	// (max reached), section-restricted (only eng1h-sophomore's roster can
	// claim it -- healthy.student and debt.student both are, per the section
	// seed above), completed (real payout already logged), cancelled (a
	// claim survives on it as history, nothing paid).
	const now2 = new Date();
	function daysAgo(n: number): string {
		return new Date(now2.getTime() - n * 86400000).toISOString();
	}
	contracts.set('contract-open', {
		id: 'contract-open',
		title: 'Rewire the LED strip along the shop bench',
		description: 'Route and secure the strip, test every segment lights.',
		payout_amount: 30,
		max_contractors: 3,
		section_id: null,
		created_by: 'admin@boscotech.edu',
		created_at: daysAgo(2),
		completed_at: null,
		cancelled_at: null,
		cancel_reason: null
	});
	contractClaims.set('contract-open', new Map([['healthy.student@boscotech.net', daysAgo(1)]]));

	contracts.set('contract-full', {
		id: 'contract-full',
		title: 'Deep-clean and inventory the fastener bins',
		description: 'Sort by size, relabel, note anything running low.',
		payout_amount: 15,
		max_contractors: 1,
		section_id: null,
		created_by: 'admin@boscotech.edu',
		created_at: daysAgo(3),
		completed_at: null,
		cancelled_at: null,
		cancel_reason: null
	});
	contractClaims.set('contract-full', new Map([['debt.student@boscotech.net', daysAgo(2)]]));

	contracts.set('contract-section', {
		id: 'contract-section',
		title: 'Sophomore section supply restock',
		description: 'Restricted to Engineering I Honors (Sophomore) -- pull the shared cart list.',
		payout_amount: 20,
		max_contractors: 2,
		section_id: 'eng1h-sophomore',
		created_by: 'admin@boscotech.edu',
		created_at: daysAgo(1),
		completed_at: null,
		cancelled_at: null,
		cancel_reason: null
	});
	contractClaims.set('contract-section', new Map([['healthy.student@boscotech.net', daysAgo(1)]]));

	contracts.set('contract-completed', {
		id: 'contract-completed',
		title: 'Label the storage bins',
		description: 'Already finished and paid out -- history only.',
		payout_amount: 18,
		max_contractors: 2,
		section_id: null,
		created_by: 'admin@boscotech.edu',
		created_at: daysAgo(6),
		completed_at: daysAgo(4),
		cancelled_at: null,
		cancel_reason: null
	});
	contractClaims.set(
		'contract-completed',
		new Map([
			['pass.student@boscotech.net', daysAgo(5)],
			['quinn.patel@boscotech.net', daysAgo(5)]
		])
	);
	insert('pass.student@boscotech.net', 'contract_completion', 9, null, 'Contract completion: Label the storage bins', {});
	insert('quinn.patel@boscotech.net', 'contract_completion', 9, null, 'Contract completion: Label the storage bins', {});

	contracts.set('contract-cancelled', {
		id: 'contract-cancelled',
		title: 'Order more filament',
		description: 'Cancelled -- ordered directly instead of contracting it out.',
		payout_amount: 25,
		max_contractors: 1,
		section_id: null,
		created_by: 'admin@boscotech.edu',
		created_at: daysAgo(5),
		completed_at: null,
		cancelled_at: daysAgo(4),
		cancel_reason: 'Ordered directly instead'
	});
	contractClaims.set('contract-cancelled', new Map([['debt.student@boscotech.net', daysAgo(5)]]));

	contractSeq = 5;

	return {
		auth: { getClaims: async () => ({ data: { claims: null }, error: null }) },
		rpc(fn: string, params: Record<string, unknown> = {}) {
			return handleRpc(fn, params, getCurrentStudentEmail);
		},
		from(table: string) {
			if (table === 'profiles') return makeProfilesQuery();
			if (table === 'coin_contracts') {
				return {
					select(_cols: string) {
						const rows = Array.from(contracts.values())
							.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
							.map((c) => ({
								id: c.id,
								title: c.title,
								description: c.description,
								payout_amount: c.payout_amount,
								max_contractors: c.max_contractors,
								section_id: c.section_id,
								created_by: c.created_by,
								created_at: c.created_at,
								completed_at: c.completed_at,
								cancelled_at: c.cancelled_at
							}));
						return contractsQueryResult(rows);
					}
				};
			}
			if (table === 'coin_contract_status') {
				return {
					select(_cols: string) {
						const rows = Array.from(contracts.values()).map((c) => ({
							id: c.id,
							claimed_count: contractClaimedCount(c.id),
							status: contractStatus(c)
						}));
						return contractsQueryResult(rows);
					}
				};
			}
			if (table === 'coin_contract_claims') {
				return {
					select(_cols: string) {
						// Mirrors 0077's RLS exactly: scoped to the CALLER's own rows, no
						// filter needed client-side -- the /coin-balance doctrine.
						const email = getCurrentStudentEmail();
						const rows: { contract_id: string }[] = [];
						for (const [contractId, claims] of contractClaims.entries()) {
							if (claims.has(email)) rows.push({ contract_id: contractId });
						}
						return contractsQueryResult(rows);
					}
				};
			}
			if (table === 'coin_balances') return makeBalancesQuery();
			if (table === 'coin_categories') return makeCategoriesQuery();
			if (table === 'coin_transactions') return makeTransactionsQuery();
			throw new Error(`fake ledger: unexpected table "${table}"`);
		}
	};
}

/**
 * A minimal thenable + `.order()` pass-through, just enough to support the
 * `await supabase.from(table).select(cols)` and `...select(cols).order(col)`
 * shapes ContractsView.svelte / +page.server.ts actually use for the direct
 * table/view reads (no RPC involved for those, mirroring the real 0077 read
 * model). Rows are pre-sorted by the caller above; `.order()` is a no-op
 * pass-through rather than re-sorting, since every seed here is already in
 * the right order.
 */
function contractsQueryResult<T>(rows: T[]) {
	const result = {
		data: rows,
		error: null as { message: string } | null,
		order(_col: string, _opts?: { ascending?: boolean }) {
			return result;
		},
		then<TResult1 = { data: T[]; error: { message: string } | null }, TResult2 = never>(
			onFulfilled?: ((value: { data: T[]; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
			onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return Promise.resolve({ data: result.data, error: result.error }).then(onFulfilled, onRejected);
		}
	};
	return result;
}

async function handleRpc(
	fn: string,
	params: Record<string, unknown>,
	getCurrentStudentEmail: () => string = () => 'admin@boscotech.edu'
): Promise<{ data: unknown; error: { message: string } | null }> {
	const email = String(params.p_email ?? '').toLowerCase().trim();

	if (fn === 'coin_admin_lookup') {
		const s = stateFor(email);
		return Promise.resolve(
			ok({
				email,
				balance: s.balance,
				wage_tier: s.wageTier,
				eating_pass_active: eatingPassActive(email),
				eating_pass_strikes: eatingPassStrikes(email),
				recent_transactions: s.txns.slice(0, 25)
			})
		);
	}

	if (fn === 'coin_log_transaction') {
		const categoryId = String(params.p_category_id);
		const cat = catById.get(categoryId);
		if (!cat) return Promise.resolve(rpcError(`Unknown coin category "${categoryId}".`));
		if (cat.active === false) return Promise.resolve(rpcError(`"${cat.name}" cannot be logged directly.`));
		if (cat.pricing_model === 'formula' || categoryId === 'extra_credit') {
			return Promise.resolve(rpcError(`"${cat.name}" needs its dedicated logging function.`));
		}
		const s = stateFor(email);
		const note = (params.p_note as string | null) ?? null;
		let magnitude: number;
		let signed: number | undefined;
		if (cat.pricing_model === 'flat') {
			magnitude = cat.amount ?? 0;
			// Mirrors 0084: Weekly Wage's stored amount is a BASE rate the
			// student's own wage tier multiplies. Nested here rather than in the
			// bulk handler for the same reason the SQL puts it here -- the bulk
			// handler recurses into this case, so it inherits per-student tiers.
			if (cat.id === 'weekly_wage') {
				magnitude = (cat.amount ?? 0) * Math.max(1, s.wageTier ?? 1);
			}
		} else if (cat.pricing_model === 'range') {
			const amt = Number(params.p_amount);
			if (!Number.isFinite(amt) || amt < (cat.min_amount ?? 0) || amt > (cat.max_amount ?? 0)) {
				return Promise.resolve(rpcError(`"${cat.name}" must be between ${cat.min_amount}i¢ and ${cat.max_amount}i¢.`));
			}
			magnitude = amt;
		} else if (cat.pricing_model === 'per_unit') {
			const qty = Number(params.p_quantity);
			if (!Number.isFinite(qty) || qty <= 0) return Promise.resolve(rpcError(`"${cat.name}" needs a positive quantity.`));
			magnitude = Math.round((cat.amount ?? 0) * qty);
		} else {
			// variable
			const amt = Number(params.p_amount);
			if (cat.kind === 'adjustment') {
				if (!Number.isFinite(amt) || amt === 0) return Promise.resolve(rpcError('A balance adjustment needs a non-zero amount.'));
				if (!note) return Promise.resolve(rpcError('A balance adjustment needs a note explaining why.'));
				signed = amt;
				magnitude = Math.abs(amt);
			} else {
				if (!Number.isFinite(amt) || amt <= 0) return Promise.resolve(rpcError(`"${cat.name}" needs a positive amount.`));
				if (!note) return Promise.resolve(rpcError(`"${cat.name}" needs a note.`));
				magnitude = amt;
			}
		}
		if (signed === undefined) {
			signed = cat.kind === 'fine' || cat.kind === 'purchase' ? -magnitude : magnitude;
		}

		if (capReached(email, cat)) {
			return Promise.resolve(refused('cap_reached', { cap_period: cat.cap_period }));
		}
		if (cat.kind === 'purchase' && s.balance < 0) {
			return Promise.resolve(refused('debt', { balance: s.balance }));
		}

		let strike = false;
		const meta: Record<string, unknown> = {};
		if (categoryId === 'eating_pass') {
			if (eatingPassActive(email)) return Promise.resolve(refused('pass_already_active'));
		} else if (categoryId === 'eating_violation') {
			strike = eatingPassActive(email);
			meta.strike = strike;
		}

		insert(email, categoryId, signed, params.p_quantity as number | null, note, meta);

		if (strike && eatingPassStrikes(email) >= 3) {
			insert(email, 'eating_pass_revoked', 0, null, 'Automatically revoked: third eating-pass violation since this pass was purchased.', {
				strikes: eatingPassStrikes(email)
			});
		}

		return Promise.resolve(
			ok({ transaction_id: `t${txnSeq}`, category_id: categoryId, amount: signed, strike, balance: stateFor(email).balance })
		);
	}

	/**
	 * 0070's admin adjustment, mirrored the way the real one is DEFINED: a
	 * thin wrapper that hands straight off to coin_log_transaction under the
	 * 'balance_correction' adjustment category, so every rule (and every
	 * refusal shape) stays in the one implementation rather than gaining a
	 * second copy here. Drives the balance tool on /coin-desk/students.
	 */
	if (fn === 'coin_admin_adjust_balance') {
		return handleRpc(
			'coin_log_transaction',
			{
				p_email: email,
				p_category_id: 'balance_correction',
				p_amount: params.p_amount,
				p_quantity: null,
				p_note: params.p_note
			},
			getCurrentStudentEmail
		);
	}

	if (fn === 'coin_log_perfect_score') {
		const points = Number(params.p_points);
		if (!Number.isFinite(points) || points <= 0) return Promise.resolve(rpcError('Enter the number of points the graded work was worth.'));
		const amount = Math.max(1, Math.round(points / 25));
		insert(email, 'perfect_score_graded_work', amount, points, (params.p_note as string | null) ?? null, {});
		return Promise.resolve(ok({ amount, balance: stateFor(email).balance }));
	}

	if (fn === 'coin_log_pay_raise') {
		const s = stateFor(email);
		if (s.balance < 0) return Promise.resolve(refused('debt', { balance: s.balance }));
		const previousTier = s.wageTier;
		const newTier = previousTier + 1;
		const cost = 40 * previousTier;
		insert(email, 'pay_raise', -cost, null, (params.p_note as string | null) ?? null, {});
		s.wageTier = newTier;
		return Promise.resolve(ok({ previous_tier: previousTier, new_tier: newTier, cost, balance: s.balance }));
	}

	if (fn === 'coin_log_property_damage_careless') {
		const cost = Number(params.p_cost_dollars);
		const note = (params.p_note as string | null) ?? null;
		if (!Number.isFinite(cost) || cost < 0) return Promise.resolve(rpcError('Enter the repair/replacement cost in dollars (0 if none).'));
		if (!note) return Promise.resolve(rpcError('Property Damage (Careless) needs a note describing the incident.'));
		const base = 3;
		const exchange = Math.round(cost / 0.25);
		const amount = base + exchange;
		insert(email, 'property_damage_careless', -amount, cost, note, {});
		return Promise.resolve(ok({ amount: -amount, base, exchange, balance: stateFor(email).balance }));
	}

	if (fn === 'coin_log_three_d_printing') {
		const grams = Number(params.p_grams);
		const hours = Number(params.p_hours);
		const overnight = params.p_overnight === true;
		if (!Number.isFinite(grams) || grams < 0) return Promise.resolve(rpcError("Enter the slicer's reported weight in grams."));
		if (!Number.isFinite(hours) || hours < 0) return Promise.resolve(rpcError("Enter the slicer's reported print time in hours."));
		const s = stateFor(email);
		if (s.balance < 0) return Promise.resolve(refused('debt', { balance: s.balance }));
		const material = Math.round(grams / 10);
		const time = overnight ? 0 : hours < 1 ? 0 : hours < 3 ? 2 : hours < 6 ? 4 : 6;
		const amount = material + time;
		insert(email, 'three_d_printing', -amount, grams, (params.p_note as string | null) ?? null, {});
		return Promise.resolve(ok({ amount: -amount, material_ic: material, time_ic: time, balance: s.balance }));
	}

	if (fn === 'coin_log_extra_credit') {
		const points = Number(params.p_points);
		const gradingCategory = String(params.p_grading_category ?? '');
		if (!Number.isFinite(points) || points <= 0) return Promise.resolve(rpcError('Enter a positive number of extra credit points.'));
		if (!['unit_labs', 'unit_assignments', 'documentation'].includes(gradingCategory)) {
			return Promise.resolve(rpcError(`Extra Credit only applies to Unit Labs, Unit Assignments, or Documentation checks (got "${gradingCategory}").`));
		}
		const s = stateFor(email);
		const cap = 21;
		if (s.ecUsedPoints + points > cap) {
			return Promise.resolve(
				refused('cap_exceeded', { cap_points: cap, used_points: s.ecUsedPoints, remaining_points: Math.max(cap - s.ecUsedPoints, 0) })
			);
		}
		if (s.balance < 0) return Promise.resolve(refused('debt', { balance: s.balance }));
		const cost = Math.round(2 * points);
		insert(email, 'extra_credit', -cost, points, (params.p_note as string | null) ?? null, {});
		s.ecUsedPoints += points;
		return Promise.resolve(
			ok({
				points,
				cost,
				used_points: s.ecUsedPoints,
				cap_points: cap,
				remaining_points: Math.max(cap - s.ecUsedPoints, 0),
				balance: s.balance
			})
		);
	}

	// -----------------------------------------------------------------------
	// Bulk payout (0079). Mirrors coin_payout_student / coin_bulk_payout: both
	// re-read the target's balance FRESH (from `ledger`, the same source
	// coin_admin_lookup and coin_log_transaction already read) at the moment
	// they run, never a client-supplied amount -- see that migration's header.
	// -----------------------------------------------------------------------

	if (fn === 'coin_payout_student') {
		const s = stateFor(email);
		if (s.balance <= 0) return Promise.resolve(refused('no_balance', { balance: s.balance }));
		const note = (params.p_note as string | null)?.trim() || 'Coin payout.';
		// Reuses the SAME coin_log_transaction path the single-student "Coin
		// Payout" category entry already goes through -- no second write path.
		return handleRpc('coin_log_transaction', {
			p_email: email,
			p_category_id: 'coin_payout',
			p_amount: s.balance,
			p_quantity: null,
			p_note: note
		});
	}

	if (fn === 'coin_bulk_payout') {
		// Roster is read fresh here, at the top of the loop -- but it is
		// coin_payout_student, called once per student BELOW, that re-reads
		// that one student's balance again immediately before writing, so a
		// fine or award landing on a not-yet-reached student mid-loop is
		// still picked up correctly.
		const targets = Array.from(ledger.entries())
			.filter(([, s]) => s.balance > 0)
			.map(([e]) => e)
			.sort();
		const results: Record<string, unknown>[] = [];
		let succeeded = 0;
		for (const studentEmail of targets) {
			const single = await handleRpc('coin_payout_student', { p_email: studentEmail, p_note: params.p_note });
			const data = single.error ? { ok: false, reason: 'error', message: single.error.message } : single.data;
			if ((data as { ok?: boolean }).ok) succeeded += 1;
			results.push({ email: studentEmail, ...(data as Record<string, unknown>) });
		}
		return Promise.resolve(
			ok({ total: results.length, succeeded, refused: results.length - succeeded, results })
		);
	}

	// -----------------------------------------------------------------------
	// Admin-managed categories (0080). Mirrors coin_admin_create_category /
	// coin_admin_set_category_active closely enough to drive the real
	// CategoriesManager UI end to end, including the 'formula' refusal.
	// -----------------------------------------------------------------------

	if (fn === 'coin_admin_create_category') {
		const id = String(params.p_id ?? '')
			.toLowerCase()
			.trim();
		const name = String(params.p_name ?? '').trim();
		const kind = params.p_kind as CoinCategory['kind'];
		const scope = params.p_scope as CoinCategory['scope'];
		const pricingModel = params.p_pricing_model as string;
		if (!id || !/^[a-z0-9_]+$/.test(id)) {
			return Promise.resolve(rpcError('Category id must be lowercase letters, numbers, and underscores only.'));
		}
		if (!name) return Promise.resolve(rpcError('Enter a category name.'));
		if (!['fine', 'award', 'purchase', 'adjustment'].includes(kind)) {
			return Promise.resolve(rpcError('Kind must be fine, award, purchase, or adjustment.'));
		}
		if (!['core', '209h'].includes(scope)) return Promise.resolve(rpcError('Scope must be core or 209h.'));
		if (pricingModel === 'formula') {
			return Promise.resolve(
				rpcError(
					"Formula categories need custom logic (like Perfect Score's rounding or Extra Credit's semester cap) and can't be created here -- that's a code change, not configuration this tool can express."
				)
			);
		}
		if (!['flat', 'range', 'per_unit', 'variable'].includes(pricingModel)) {
			return Promise.resolve(rpcError('Pricing model must be flat, range, per_unit, or variable.'));
		}
		if (catById.has(id)) return Promise.resolve(rpcError(`A category with id "${id}" already exists.`));

		let amount: number | null = null;
		let minAmount: number | null = null;
		let maxAmount: number | null = null;
		let unitLabel: string | null = null;
		if (pricingModel === 'flat') {
			amount = Number(params.p_amount);
			if (!Number.isFinite(amount) || amount < 0) {
				return Promise.resolve(rpcError('A flat category needs a non-negative amount.'));
			}
		} else if (pricingModel === 'range') {
			minAmount = Number(params.p_min_amount);
			maxAmount = Number(params.p_max_amount);
			if (!Number.isFinite(minAmount) || !Number.isFinite(maxAmount) || minAmount > maxAmount) {
				return Promise.resolve(rpcError('A range category needs a min and max amount, with min <= max.'));
			}
		} else if (pricingModel === 'per_unit') {
			amount = Number(params.p_amount);
			unitLabel = (params.p_unit_label as string | null)?.trim() || null;
			if (!Number.isFinite(amount) || amount < 0) {
				return Promise.resolve(rpcError('A per-unit category needs a non-negative rate.'));
			}
			if (!unitLabel) {
				return Promise.resolve(rpcError('A per-unit category needs a unit label (e.g. "point", "4 pages").'));
			}
		}

		catById.set(id, {
			id,
			name,
			kind,
			scope,
			pricing_model: pricingModel as CoinCategory['pricing_model'],
			amount,
			min_amount: minAmount,
			max_amount: maxAmount,
			unit_label: unitLabel,
			formula_key: null,
			semester_point_cap: null,
			cap_period: null,
			cap_count: null,
			notes: (params.p_notes as string | null)?.trim() || null,
			active: true
		});

		return Promise.resolve(ok({ id }));
	}

	if (fn === 'coin_admin_set_category_active') {
		const id = String(params.p_id ?? '')
			.toLowerCase()
			.trim();
		const existing = catById.get(id);
		if (!existing) return Promise.resolve(rpcError(`Unknown coin category "${id}".`));
		const active = params.p_active !== false;
		catById.set(id, { ...existing, active });
		return Promise.resolve(ok({ id, active }));
	}

	// -----------------------------------------------------------------------
	// Sections (0073). Mirrors coin_admin_list_sections / _list_section_students
	// / _upsert_section / _set_student_section / _assign_section_students /
	// coin_bulk_log_section closely enough to drive the real SectionManager +
	// bulk-log UI end to end.
	// -----------------------------------------------------------------------

	if (fn === 'coin_admin_list_sections') {
		const rows = Array.from(sections.values())
			.map((s) => ({ ...s, student_count: sectionStudentCount(s.id) }))
			.sort((a, b) => (a.active === b.active ? a.id.localeCompare(b.id) : a.active ? -1 : 1));
		return Promise.resolve({ data: rows, error: null });
	}

	if (fn === 'coin_admin_list_section_students') {
		const sectionId = String(params.p_section_id ?? '');
		const rows: CoinSectionStudentRow[] = Array.from(sectionStudents.entries())
			.filter(([, sid]) => sid === sectionId)
			.map(([studentEmail]) => {
				const student = SAMPLE_STUDENTS.find((s) => s.email === studentEmail);
				return {
					student_email: studentEmail,
					assigned_at: sectionAssignedAt.get(studentEmail) ?? new Date().toISOString(),
					display_name: student?.display_name ?? null,
					full_name: student?.full_name ?? null
				};
			})
			.sort((a, b) =>
				(a.display_name || a.full_name || a.student_email).localeCompare(
					b.display_name || b.full_name || b.student_email
				)
			);
		return Promise.resolve({ data: rows, error: null });
	}

	if (fn === 'coin_admin_upsert_section') {
		const id = String(params.p_id ?? '')
			.toLowerCase()
			.trim();
		if (!id) return Promise.resolve(rpcError('A section id is required.'));
		const color = (params.p_color as string | null) ?? null;
		if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
			return Promise.resolve(rpcError('Color must be a 6-digit hex value like #00FF41.'));
		}
		const existing = sections.get(id);
		const now = new Date().toISOString();
		sections.set(id, {
			id,
			label: (params.p_label as string | null) ?? null,
			color,
			active: params.p_active !== false,
			note: (params.p_note as string | null) ?? null,
			created_by: existing?.created_by ?? 'admin@boscotech.edu',
			created_at: existing?.created_at ?? now,
			updated_at: now,
			student_count: existing?.student_count ?? 0
		});
		return Promise.resolve(ok({ id }));
	}

	if (fn === 'coin_admin_set_student_section') {
		const studentEmail = String(params.p_email ?? '')
			.toLowerCase()
			.trim();
		const sectionId = params.p_section_id ? String(params.p_section_id) : null;
		if (!studentEmail) return Promise.resolve(rpcError('Enter a valid student email.'));
		if (!sectionId) {
			sectionStudents.delete(studentEmail);
			sectionAssignedAt.delete(studentEmail);
			return Promise.resolve(ok({ email: studentEmail, section_id: null }));
		}
		if (!sections.has(sectionId)) return Promise.resolve(rpcError(`Unknown coin section "${sectionId}".`));
		sectionStudents.set(studentEmail, sectionId);
		sectionAssignedAt.set(studentEmail, new Date().toISOString());
		return Promise.resolve(ok({ email: studentEmail, section_id: sectionId }));
	}

	if (fn === 'coin_admin_assign_section_students') {
		const sectionId = String(params.p_section_id ?? '');
		if (!sections.has(sectionId)) return Promise.resolve(rpcError(`Unknown coin section "${sectionId}".`));
		const emails = (params.p_emails as string[]) ?? [];
		const results = emails.map((raw) => {
			const e = raw.toLowerCase().trim();
			if (!e || !e.includes('@')) return { email: raw, ok: false, reason: 'invalid_email' };
			sectionStudents.set(e, sectionId);
			sectionAssignedAt.set(e, new Date().toISOString());
			return { email: e, ok: true };
		});
		return Promise.resolve(ok({ section_id: sectionId, results }));
	}

	if (fn === 'coin_bulk_log_section') {
		const sectionId = String(params.p_section_id ?? '');
		const categoryId = String(params.p_category_id ?? '');
		const cat = catById.get(categoryId);
		if (!sections.has(sectionId)) return Promise.resolve(rpcError(`Unknown coin section "${sectionId}".`));
		if (!cat) return Promise.resolve(rpcError(`Unknown coin category "${categoryId}".`));
		if (cat.id === 'extra_credit') {
			return Promise.resolve(rpcError('Extra Credit needs a per-student point count; it cannot be bulk-logged yet.'));
		}
		if (!['flat', 'range', 'variable'].includes(cat.pricing_model)) {
			return Promise.resolve(rpcError(`"${cat.name}" needs per-student input and cannot be bulk-logged yet.`));
		}
		// Shape validation up front, mirroring coin_bulk_log_section's own
		// pre-loop checks: a config mistake fails once, clearly, instead of
		// identically for every student.
		const note = (params.p_note as string | null) ?? null;
		if (cat.pricing_model === 'range') {
			const amt = Number(params.p_amount);
			if (!Number.isFinite(amt) || amt < (cat.min_amount ?? 0) || amt > (cat.max_amount ?? 0)) {
				return Promise.resolve(rpcError(`"${cat.name}" must be between ${cat.min_amount}i¢ and ${cat.max_amount}i¢.`));
			}
		} else if (cat.pricing_model === 'variable') {
			const amt = Number(params.p_amount);
			if (cat.kind === 'adjustment') {
				if (!Number.isFinite(amt) || amt === 0) return Promise.resolve(rpcError('A balance adjustment needs a non-zero amount.'));
				if (!note) return Promise.resolve(rpcError('A balance adjustment needs a note explaining why.'));
			} else {
				if (!Number.isFinite(amt) || amt <= 0) return Promise.resolve(rpcError(`"${cat.name}" needs a positive amount.`));
				if (!note) return Promise.resolve(rpcError(`"${cat.name}" needs a note.`));
			}
		}

		const emails = Array.from(sectionStudents.entries())
			.filter(([, sid]) => sid === sectionId)
			.map(([e]) => e)
			.sort();

		const results: Record<string, unknown>[] = [];
		let succeeded = 0;
		for (const studentEmail of emails) {
			// Reuses the SAME coin_log_transaction handling every single-student
			// log goes through -- no duplicated business rule, exactly mirroring
			// how the real coin_bulk_log_section nests the real coin_log_transaction.
			const single = await handleRpc('coin_log_transaction', {
				p_email: studentEmail,
				p_category_id: categoryId,
				p_amount: params.p_amount,
				p_quantity: null,
				p_note: note
			});
			const data = single.error ? { ok: false, reason: 'error', message: single.error.message } : single.data;
			if ((data as { ok?: boolean }).ok) succeeded += 1;
			results.push({ email: studentEmail, ...(data as Record<string, unknown>) });
		}

		return Promise.resolve(
			ok({
				section_id: sectionId,
				category_id: categoryId,
				total: results.length,
				succeeded,
				refused: results.length - succeeded,
				results
			})
		);
	}

	// -----------------------------------------------------------------------
	// Roles (0074, real questions + expiration in 0076). Mirrors
	// coin_role_admin_list_role_questions / coin_role_apply /
	// _admin_list_applications / _admin_review / _admin_list_holders /
	// _admin_revoke / _admin_set_expiration / coin_bulk_log_role_stipend /
	// _admin_capacity closely enough to drive the real RolesManager UI end
	// to end, including the ratio-cap refusal and the lazy-expire-on-approve
	// reconciliation the 0076 migration documents.
	// -----------------------------------------------------------------------

	if (fn === 'coin_role_admin_capacity') {
		const roleId = String(params.p_role_id ?? '');
		const sectionId = String(params.p_section_id ?? '');
		return Promise.resolve({
			data: {
				role_id: roleId,
				section_id: sectionId,
				cap: roleCapacity(roleId, sectionId),
				held: activeHolderCount(roleId, sectionId),
				section_size: sectionStudentCount(sectionId)
			},
			error: null
		});
	}

	if (fn === 'coin_role_admin_list_role_questions') {
		const roleId = String(params.p_role_id ?? '');
		const rows = questionsForRole(roleId).map((q) => ({
			id: q.id,
			role_id: q.role_id,
			type: q.type,
			question_text: q.question_text,
			sequence: q.sequence,
			options: q.options,
			correct_option_index: q.correct_option_index
		}));
		return Promise.resolve({ data: rows, error: null });
	}

	if (fn === 'coin_role_apply') {
		const studentEmail = String(params.p_student_email ?? '')
			.toLowerCase()
			.trim();
		const roleId = String(params.p_role_id ?? '');
		const role = roleById(roleId);
		if (!studentEmail || !studentEmail.includes('@')) {
			return Promise.resolve(rpcError('Enter a valid student email.'));
		}
		if (!role || !role.active) {
			return Promise.resolve(rpcError(`Unknown or inactive coin role "${roleId}".`));
		}
		const sectionId = sectionStudents.get(studentEmail);
		if (!sectionId) {
			return Promise.resolve(
				rpcError(
					'This student has no coin section assigned yet -- assign one above before logging a role application (the ratio cap is checked against their section).'
				)
			);
		}
		if (studentHoldsRole(studentEmail, roleId)) {
			return Promise.resolve(refused('already_holds_role'));
		}

		const rawAnswers =
			(params.p_answers as
				| { question_id?: string; written_answer?: string; selected_option_index?: number }[]
				| undefined) ?? [];
		const byQuestionId = new Map(rawAnswers.map((a) => [String(a.question_id ?? ''), a]));

		const answers: RoleAnswerState[] = [];
		for (const q of questionsForRole(roleId)) {
			const submitted = byQuestionId.get(q.id);
			if (q.type === 'written') {
				const written = String(submitted?.written_answer ?? '').trim();
				if (!written) {
					return Promise.resolve(rpcError(`Missing an answer for "${q.question_text}".`));
				}
				answers.push({
					question_id: q.id,
					type: 'written',
					question_text: q.question_text,
					options: null,
					written_answer: written.slice(0, 4000),
					selected_option_index: null,
					correct_option_index: null,
					is_correct: null
				});
			} else {
				const selected = submitted?.selected_option_index;
				if (typeof selected !== 'number' || selected < 0 || selected >= (q.options?.length ?? 0)) {
					return Promise.resolve(rpcError(`Missing an answer for "${q.question_text}".`));
				}
				answers.push({
					question_id: q.id,
					type: 'mc',
					question_text: q.question_text,
					options: q.options,
					written_answer: null,
					selected_option_index: selected,
					correct_option_index: q.correct_option_index,
					is_correct: selected === q.correct_option_index
				});
			}
		}

		const id = `app${++appSeq}`;
		roleApplications.set(id, {
			id,
			student_email: studentEmail,
			role_id: roleId,
			section_id: sectionId,
			answers,
			status: 'pending',
			submitted_by: 'admin@boscotech.edu',
			submitted_at: new Date().toISOString(),
			reviewed_by: null,
			reviewed_at: null,
			review_note: null
		});

		return Promise.resolve(ok({ application_id: id, section_id: sectionId }));
	}

	if (fn === 'coin_role_admin_list_applications') {
		const status = params.p_status === undefined ? 'pending' : (params.p_status as string | null);
		const rows = Array.from(roleApplications.values())
			.filter((a) => status === null || a.status === status)
			.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
			.map((a) => {
				const student = SAMPLE_STUDENTS.find((s) => s.email === a.student_email);
				const role = roleById(a.role_id);
				return {
					id: a.id,
					student_email: a.student_email,
					display_name: student?.display_name ?? null,
					full_name: student?.full_name ?? null,
					role_id: a.role_id,
					role_name: role?.name ?? a.role_id,
					section_id: a.section_id,
					answers: a.answers.map((ans) => ({
						question_id: ans.question_id,
						type: ans.type,
						question: ans.question_text,
						options: ans.options,
						written_answer: ans.written_answer,
						selected_option_index: ans.selected_option_index,
						correct_option_index: ans.correct_option_index,
						is_correct: ans.is_correct
					})),
					status: a.status,
					submitted_by: a.submitted_by,
					submitted_at: a.submitted_at,
					reviewed_by: a.reviewed_by,
					reviewed_at: a.reviewed_at,
					review_note: a.review_note
				};
			});
		return Promise.resolve({ data: rows, error: null });
	}

	if (fn === 'coin_role_admin_review') {
		const appId = String(params.p_application_id ?? '');
		const decision = String(params.p_decision ?? '');
		const note = (params.p_note as string | null) ?? null;
		const expiresAt = (params.p_expires_at as string | null | undefined) ?? null;
		const app = roleApplications.get(appId);
		if (!app) return Promise.resolve(rpcError('Unknown application.'));
		if (decision !== 'approve' && decision !== 'reject') {
			return Promise.resolve(rpcError('Decision must be "approve" or "reject".'));
		}
		if (app.status !== 'pending') {
			return Promise.resolve(rpcError(`This application was already ${app.status}.`));
		}

		if (decision === 'reject') {
			app.status = 'rejected';
			app.reviewed_by = 'admin@boscotech.edu';
			app.reviewed_at = new Date().toISOString();
			app.review_note = note;
			return Promise.resolve(ok({ status: 'rejected', application_id: appId }));
		}

		// Approve: the ratio cap check, hard-blocked, structured refusal --
		// the exact Extra Credit cap_exceeded shape, checked HERE (approval),
		// never at application time. Both this and the already-holds-role
		// check below use the SAME active condition (holderIsActive /
		// studentHoldsRole) 0076 uses everywhere, so a naturally-expired
		// holder never blocks a fresh approval.
		const cap = roleCapacity(app.role_id, app.section_id);
		const held = activeHolderCount(app.role_id, app.section_id);
		if (held >= cap) {
			return Promise.resolve(
				refused('ratio_cap_reached', {
					role_id: app.role_id,
					section_id: app.section_id,
					cap,
					held
				})
			);
		}
		if (studentHoldsRole(app.student_email, app.role_id)) {
			return Promise.resolve(refused('already_holds_role'));
		}

		// Lazily close out any lapsed-but-never-revoked row for this exact
		// (student, role) so a NEW holder row for them can be created --
		// mirrors the 0076 migration's approve-time UPDATE, since a real
		// partial-unique-index equivalent can't reference "now" either.
		for (const h of roleHolders.values()) {
			if (
				h.student_email === app.student_email &&
				h.role_id === app.role_id &&
				!h.revoked_at &&
				h.expires_at &&
				new Date(h.expires_at).getTime() <= Date.now()
			) {
				h.revoked_at = h.expires_at;
				h.revoked_by = 'system';
				h.revoke_reason = 'Closed automatically: role expired.';
			}
		}

		const holderId = `hold${++holderSeq}`;
		roleHolders.set(holderId, {
			id: holderId,
			student_email: app.student_email,
			role_id: app.role_id,
			section_id: app.section_id,
			application_id: appId,
			since: new Date().toISOString(),
			assigned_by: 'admin@boscotech.edu',
			expires_at: expiresAt,
			revoked_at: null,
			revoked_by: null,
			revoke_reason: null
		});
		app.status = 'approved';
		app.reviewed_by = 'admin@boscotech.edu';
		app.reviewed_at = new Date().toISOString();
		app.review_note = note;

		return Promise.resolve(
			ok({ status: 'approved', application_id: appId, holder_id: holderId, expires_at: expiresAt })
		);
	}

	if (fn === 'coin_role_admin_list_holders') {
		const sectionId = (params.p_section_id as string | null | undefined) ?? null;
		const roleId = (params.p_role_id as string | null | undefined) ?? null;
		const includeRevoked = params.p_include_revoked === true;
		const rows = Array.from(roleHolders.values())
			.filter((h) => sectionId === null || h.section_id === sectionId)
			.filter((h) => roleId === null || h.role_id === roleId)
			.filter((h) => includeRevoked || holderIsActive(h))
			.sort((a, b) => new Date(b.since).getTime() - new Date(a.since).getTime())
			.map((h) => {
				const student = SAMPLE_STUDENTS.find((s) => s.email === h.student_email);
				const role = roleById(h.role_id);
				return {
					id: h.id,
					student_email: h.student_email,
					display_name: student?.display_name ?? null,
					full_name: student?.full_name ?? null,
					role_id: h.role_id,
					role_name: role?.name ?? h.role_id,
					section_id: h.section_id,
					since: h.since,
					assigned_by: h.assigned_by,
					expires_at: h.expires_at,
					is_active: holderIsActive(h),
					revoked_at: h.revoked_at,
					revoked_by: h.revoked_by,
					revoke_reason: h.revoke_reason
				};
			});
		return Promise.resolve({ data: rows, error: null });
	}

	if (fn === 'coin_role_admin_revoke') {
		const holderId = String(params.p_holder_id ?? '');
		const reason = (params.p_reason as string | null) ?? null;
		const holder = roleHolders.get(holderId);
		if (!holder) return Promise.resolve(rpcError('Unknown role holder.'));
		if (holder.revoked_at) return Promise.resolve(rpcError('This role was already revoked.'));
		holder.revoked_at = new Date().toISOString();
		holder.revoked_by = 'admin@boscotech.edu';
		holder.revoke_reason = reason;
		return Promise.resolve(ok({ holder_id: holderId }));
	}

	if (fn === 'coin_role_admin_set_expiration') {
		const holderId = String(params.p_holder_id ?? '');
		const expiresAt = (params.p_expires_at as string | null | undefined) ?? null;
		const holder = roleHolders.get(holderId);
		if (!holder) return Promise.resolve(rpcError('Unknown role holder.'));
		holder.expires_at = expiresAt;
		return Promise.resolve(ok({ holder_id: holderId, expires_at: expiresAt }));
	}

	if (fn === 'coin_bulk_log_role_stipend') {
		const roleId = (params.p_role_id as string | null | undefined) ?? null;
		const sectionId = (params.p_section_id as string | null | undefined) ?? null;
		const note = (params.p_note as string | null) ?? null;

		// distinct by email: a student holding two roles at once is paid the
		// stipend once per run, not once per role -- mirrors 0074's `distinct`.
		// Only ACTIVE holders (0076): a naturally-expired-but-unrevoked row
		// stops being paid the moment its expiration passes.
		const emails = Array.from(
			new Set(
				Array.from(roleHolders.values())
					.filter((h) => holderIsActive(h))
					.filter((h) => roleId === null || h.role_id === roleId)
					.filter((h) => sectionId === null || h.section_id === sectionId)
					.map((h) => h.student_email)
			)
		).sort();

		const results: Record<string, unknown>[] = [];
		let succeeded = 0;
		for (const studentEmail of emails) {
			// The SAME single-student RPC coin_bulk_log_section already nests --
			// no duplicated business rule, exactly mirroring the real
			// coin_bulk_log_role_stipend's nested coin_log_transaction call.
			const single = await handleRpc('coin_log_transaction', {
				p_email: studentEmail,
				p_category_id: 'weekly_role_stipend',
				p_amount: null,
				p_quantity: null,
				p_note: note
			});
			const data = single.error ? { ok: false, reason: 'error', message: single.error.message } : single.data;
			if ((data as { ok?: boolean }).ok) succeeded += 1;
			results.push({ email: studentEmail, ...(data as Record<string, unknown>) });
		}

		return Promise.resolve(
			ok({
				role_id: roleId,
				section_id: sectionId,
				total: results.length,
				succeeded,
				refused: results.length - succeeded,
				results
			})
		);
	}

	// -----------------------------------------------------------------------
	// Contracts (0077). Mirrors coin_contract_self_claim / coin_admin_post_
	// contract / _list_contracts / _complete_contract / _cancel_contract /
	// _reset_contract's business logic and refusal shapes closely enough to
	// drive ContractsManager + ContractsView end to end. See the module doc
	// above `contracts` for why this mock does NOT attempt to re-prove the
	// concurrency guarantee -- that is tests/coin-contracts.test.ts's job,
	// against real concurrent Postgres connections.
	// -----------------------------------------------------------------------

	if (fn === 'coin_contract_self_claim') {
		const contractId = String(params.p_contract_id ?? '');
		const studentEmail = getCurrentStudentEmail();
		const contract = contracts.get(contractId);
		if (!contract) return Promise.resolve(rpcError('Unknown contract.'));

		if (contract.completed_at || contract.cancelled_at) {
			return Promise.resolve(refused('not_open'));
		}
		if (contract.section_id) {
			const studentSection = sectionStudents.get(studentEmail);
			if (studentSection !== contract.section_id) {
				return Promise.resolve(refused('wrong_section', { section_id: contract.section_id }));
			}
		}
		let claims = contractClaims.get(contractId);
		if (!claims) {
			claims = new Map();
			contractClaims.set(contractId, claims);
		}
		if (claims.has(studentEmail)) {
			return Promise.resolve(refused('already_claimed'));
		}
		if (claims.size >= contract.max_contractors) {
			return Promise.resolve(
				refused('full', { max_contractors: contract.max_contractors, claimed_count: claims.size })
			);
		}
		claims.set(studentEmail, new Date().toISOString());
		return Promise.resolve(
			ok({ contract_id: contractId, claimed_count: claims.size, max_contractors: contract.max_contractors })
		);
	}

	if (fn === 'coin_admin_post_contract') {
		const title = String(params.p_title ?? '').trim();
		const payout = Number(params.p_payout_amount);
		const max = Number(params.p_max_contractors ?? 1);
		const sectionId = (params.p_section_id as string | null) || null;
		if (!title) return Promise.resolve(rpcError('A contract needs a title.'));
		if (!Number.isFinite(payout) || payout <= 0) {
			return Promise.resolve(rpcError('A contract needs a positive payout amount.'));
		}
		if (!Number.isFinite(max) || max <= 0) return Promise.resolve(rpcError('Max contractors must be at least 1.'));
		if (sectionId && !sections.has(sectionId)) {
			return Promise.resolve(rpcError(`Unknown coin section "${sectionId}".`));
		}
		const id = `contract-new-${++contractSeq}`;
		contracts.set(id, {
			id,
			title,
			description: (params.p_description as string | null) ?? null,
			payout_amount: Math.round(payout),
			max_contractors: Math.round(max),
			section_id: sectionId,
			created_by: 'admin@boscotech.edu',
			created_at: new Date().toISOString(),
			completed_at: null,
			cancelled_at: null,
			cancel_reason: null
		});
		return Promise.resolve(ok({ id }));
	}

	if (fn === 'coin_admin_list_contracts') {
		const rows = Array.from(contracts.values())
			.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
			.map((c) => ({
				id: c.id,
				title: c.title,
				description: c.description,
				payout_amount: c.payout_amount,
				max_contractors: c.max_contractors,
				section_id: c.section_id,
				created_by: c.created_by,
				created_at: c.created_at,
				completed_at: c.completed_at,
				cancelled_at: c.cancelled_at,
				cancel_reason: c.cancel_reason,
				claimed_count: contractClaimedCount(c.id),
				status: contractStatus(c),
				claimants: contractClaimantRows(c.id)
			}));
		return Promise.resolve({ data: rows, error: null });
	}

	if (fn === 'coin_admin_complete_contract') {
		const contractId = String(params.p_contract_id ?? '');
		const contract = contracts.get(contractId);
		if (!contract) return Promise.resolve(rpcError('Unknown contract.'));
		if (contract.completed_at) return Promise.resolve(rpcError('This contract was already completed.'));
		if (contract.cancelled_at) {
			return Promise.resolve(rpcError('This contract was cancelled and cannot be completed.'));
		}
		const claims = contractClaims.get(contractId);
		const count = claims?.size ?? 0;
		if (count === 0) {
			return Promise.resolve(rpcError('No one has claimed this contract yet -- there is no one to pay.'));
		}
		// Postgres round(): half rounds away from zero. JS Math.round() agrees
		// for every positive input, including the exact-.5 case, so this mock
		// and the real RPC always land on the same share.
		const share = Math.round(contract.payout_amount / count);
		const note = (params.p_note as string | null)?.trim() || `Contract completion: ${contract.title}`;
		const results: Record<string, unknown>[] = [];
		let succeeded = 0;
		for (const studentEmail of Array.from(claims!.keys()).sort()) {
			const single = await handleRpc(
				'coin_log_transaction',
				{ p_email: studentEmail, p_category_id: 'contract_completion', p_amount: share, p_quantity: null, p_note: note },
				getCurrentStudentEmail
			);
			const data = single.error ? { ok: false, reason: 'error', message: single.error.message } : single.data;
			if ((data as { ok?: boolean }).ok) succeeded += 1;
			results.push({ email: studentEmail, ...(data as Record<string, unknown>) });
		}
		contract.completed_at = new Date().toISOString();
		return Promise.resolve(
			ok({ contract_id: contractId, share, claimant_count: count, succeeded, results })
		);
	}

	if (fn === 'coin_admin_cancel_contract') {
		const contractId = String(params.p_contract_id ?? '');
		const contract = contracts.get(contractId);
		if (!contract) return Promise.resolve(rpcError('Unknown contract.'));
		if (contract.completed_at) {
			return Promise.resolve(rpcError('This contract was already completed and cannot be cancelled.'));
		}
		if (contract.cancelled_at) return Promise.resolve(rpcError('This contract was already cancelled.'));
		contract.cancelled_at = new Date().toISOString();
		contract.cancel_reason = (params.p_reason as string | null)?.trim() || null;
		return Promise.resolve(ok({ contract_id: contractId }));
	}

	if (fn === 'coin_admin_reset_contract') {
		const contractId = String(params.p_contract_id ?? '');
		const contract = contracts.get(contractId);
		if (!contract) return Promise.resolve(rpcError('Unknown contract.'));
		if (contract.completed_at || contract.cancelled_at) {
			return Promise.resolve(rpcError('Cannot reset a contract that has already been completed or cancelled.'));
		}
		const cleared = contractClaims.get(contractId)?.size ?? 0;
		contractClaims.set(contractId, new Map());
		return Promise.resolve(ok({ contract_id: contractId, cleared }));
	}

	// -----------------------------------------------------------------------
	// Legacy Sheets import (0084). Mirrors the real RPCs' semantics: refusal
	// shapes, the single-committed-batch idempotency rule, RAW inserts (never
	// the coin_log_transaction handler above -- historical rows must not
	// trigger live rules), batch tagging, and batch-scoped reconciliation.
	// -----------------------------------------------------------------------

	if (fn === 'coin_admin_create_import_batch') {
		const raw = params.p_raw as LegacyPull;
		if (!raw || !Array.isArray(raw.summary) || !Array.isArray(raw.transactions)) {
			return Promise.resolve(rpcError('A pull snapshot needs summary and transactions arrays.'));
		}
		const id = `batch-${++importBatchSeq}`;
		importBatches.set(id, {
			id,
			raw,
			pulled_at: new Date().toISOString(),
			committed_at: null,
			committed_by: null,
			report: null
		});
		return Promise.resolve(ok({ batch_id: id }));
	}

	if (fn === 'coin_admin_save_import_mappings') {
		const arr = (params.p_mappings ?? []) as { legacy_name?: string; email?: string | null; status?: string }[];
		let saved = 0;
		for (const m of arr) {
			const name = (m.legacy_name ?? '').trim();
			if (!name) continue;
			const mail = (m.email ?? '').trim().toLowerCase() || null;
			importMappings.set(name, {
				legacy_name: name,
				email: mail && mail.includes('@') ? mail : null,
				status: m.status ?? 'unmapped'
			});
			saved++;
		}
		return Promise.resolve(ok({ saved }));
	}

	if (fn === 'coin_admin_import_legacy') {
		const batch = importBatches.get(String(params.p_batch_id ?? ''));
		if (!batch) return Promise.resolve(rpcError('Unknown import batch.'));
		if (batch.committed_at) {
			return Promise.resolve(refused('batch_already_committed', { committed_at: batch.committed_at }));
		}
		const other = Array.from(importBatches.values()).find((b) => b.committed_at);
		if (other) return Promise.resolve(refused('another_batch_committed', { batch_id: other.id }));

		const mapIn = (params.p_mappings ?? []) as { legacy_name?: string; email?: string | null }[];
		const map = new Map<string, string>();
		for (const m of mapIn) {
			const name = (m.legacy_name ?? '').trim().toLowerCase();
			const mail = (m.email ?? '').trim().toLowerCase();
			if (!name || !mail) continue;
			map.set(name, mail);
		}
		const byEmail = new Map<string, string[]>();
		for (const [n, e] of map.entries()) byEmail.set(e, [...(byEmail.get(e) ?? []), n]);
		const dupe = Array.from(byEmail.entries()).find(([, names]) => names.length > 1);
		if (dupe) return Promise.resolve(refused('duplicate_email', { email: dupe[0], names: dupe[1] }));

		const everyName = new Set<string>();
		for (const s of batch.raw.summary) everyName.add(s.name.trim());
		for (const t of batch.raw.transactions) everyName.add(t.name.trim());
		for (const c of batch.raw.contracts) for (const n of c.contractors) everyName.add(n.trim());
		const missing = Array.from(everyName).filter((n) => n && !map.has(n.toLowerCase()));
		if (missing.length) return Promise.resolve(refused('unmapped_name', { names: missing.sort() }));

		const badTypes = [
			...new Set(batch.raw.transactions.map((t) => t.type.trim()).filter((t) => !isKnownLegacyType(t)))
		];
		if (badTypes.length) return Promise.resolve(refused('unknown_type', { types: badTypes }));

		const tag = batch.id;
		for (const s of batch.raw.summary) {
			coinStudents.set(map.get(s.name.trim().toLowerCase())!, {
				display_name: s.name.trim(),
				legacy_section: s.section.trim() || null,
				source: `legacy-import:${tag}`
			});
		}

		// RAW inserts, oldest-first appended after any live rows (the seeded
		// recents stay at the top of coin_admin_lookup's newest-first list).
		const ordered = [...batch.raw.transactions].sort(
			(a, b) => new Date(legacyDateToIso(b.date)).getTime() - new Date(legacyDateToIso(a.date)).getTime()
		);
		for (const t of ordered) {
			const email2 = map.get(t.name.trim().toLowerCase())!;
			const s = stateFor(email2);
			const signed = signedAmount(t);
			const categoryId = legacyCategoryForType(t.type);
			s.balance += signed;
			s.txns.push({
				id: `t${++txnSeq}`,
				category_id: categoryId,
				category_name: categoryNameFor(categoryId),
				amount: signed,
				quantity: null,
				note: t.reason.trim() || null,
				actor_email: 'admin@boscotech.edu',
				created_at: legacyDateToIso(t.date),
				meta: { legacy_reason: t.reason, legacy_type: t.type, legacy_row: t.row, import_batch: tag }
			});
		}

		let claimCount = 0;
		for (const c of batch.raw.contracts) {
			const id = `legacy-contract-${++contractSeq}`;
			const added = legacyDateToIso(c.date_added || new Date().toISOString());
			const done = c.date_completed ? legacyDateToIso(c.date_completed) : added;
			const claimants = [
				...new Set(c.contractors.map((n) => map.get(n.trim().toLowerCase())!).filter(Boolean))
			];
			contracts.set(id, {
				id,
				title: c.name,
				description: c.notes.trim() || null,
				payout_amount: Math.round(c.total_payout),
				max_contractors: Math.max(1, claimants.length),
				section_id: null,
				created_by: 'admin@boscotech.edu',
				created_at: added,
				completed_at: c.status === 'Completed' ? done : null,
				cancelled_at: c.status === 'Cancelled' ? done : null,
				cancel_reason: null,
				import_batch: tag
			});
			contractClaims.set(id, new Map(claimants.map((e) => [e, added])));
			claimCount += claimants.length;
		}

		const results = batch.raw.summary
			.map((s) => {
				const email2 = map.get(s.name.trim().toLowerCase())!;
				const mine = stateFor(email2).txns.filter((t) => t.meta?.import_batch === tag);
				return {
					email: email2,
					name: s.name.trim(),
					ok: true,
					transactions: mine.length,
					amount: mine.reduce((acc, t) => acc + t.amount, 0)
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));

		batch.committed_at = new Date().toISOString();
		batch.committed_by = 'admin@boscotech.edu';
		batch.report = {
			mappings: Object.fromEntries(map.entries()),
			students: batch.raw.summary.length,
			transactions: batch.raw.transactions.length,
			contracts: batch.raw.contracts.length,
			claims: claimCount,
			results
		};
		return Promise.resolve(
			ok({
				batch_id: tag,
				students: batch.raw.summary.length,
				transactions: batch.raw.transactions.length,
				contracts: batch.raw.contracts.length,
				claims: claimCount,
				total: batch.raw.summary.length,
				succeeded: batch.raw.summary.length,
				refused: 0,
				results
			})
		);
	}

	if (fn === 'coin_admin_rollback_import') {
		const batch = importBatches.get(String(params.p_batch_id ?? ''));
		if (!batch) return Promise.resolve(rpcError('Unknown import batch.'));
		if (!batch.committed_at) return Promise.resolve(refused('not_committed'));
		const tag = batch.id;
		let txDeleted = 0;
		for (const s of ledger.values()) {
			const keep: Txn[] = [];
			for (const t of s.txns) {
				if (t.meta?.import_batch === tag) {
					s.balance -= t.amount;
					txDeleted++;
				} else {
					keep.push(t);
				}
			}
			s.txns = keep;
		}
		let contractsDeleted = 0;
		let claimsDeleted = 0;
		for (const [id, c] of Array.from(contracts.entries())) {
			if (c.import_batch === tag) {
				claimsDeleted += contractClaims.get(id)?.size ?? 0;
				contracts.delete(id);
				contractClaims.delete(id);
				contractsDeleted++;
			}
		}
		let studentsDeleted = 0;
		for (const [email2, row] of Array.from(coinStudents.entries())) {
			if (row.source === `legacy-import:${tag}`) {
				coinStudents.delete(email2);
				studentsDeleted++;
			}
		}
		batch.committed_at = null;
		batch.committed_by = null;
		batch.report = null;
		return Promise.resolve(
			ok({
				batch_id: tag,
				transactions_deleted: txDeleted,
				contracts_deleted: contractsDeleted,
				claims_deleted: claimsDeleted,
				students_deleted: studentsDeleted
			})
		);
	}

	if (fn === 'coin_admin_import_reconcile') {
		const batch = importBatches.get(String(params.p_batch_id ?? ''));
		if (!batch) return Promise.resolve(rpcError('Unknown import batch.'));
		if (!batch.committed_at || !batch.report) return Promise.resolve(refused('not_committed'));
		const tag = batch.id;
		const map = batch.report.mappings;
		const rows = batch.raw.summary
			.map((s) => {
				const email2 = map[s.name.trim().toLowerCase()] ?? '';
				const state = stateFor(email2);
				const mine = state.txns.filter((t) => t.meta?.import_batch === tag);
				const actual = mine.reduce((acc, t) => acc + t.amount, 0);
				const expected = expectedBalance(s);
				return {
					name: s.name.trim(),
					email: email2,
					expected,
					actual,
					diff: actual - expected,
					live_balance: state.balance
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
		const liveTxns = rows.reduce((acc, r) => acc + stateFor(r.email).txns.length, 0);
		let batchTxns = 0;
		for (const s of ledger.values()) {
			batchTxns += s.txns.filter((t) => t.meta?.import_batch === tag).length;
		}
		const batchClaims = Array.from(contracts.values())
			.filter((c) => c.import_batch === tag)
			.reduce((acc, c) => acc + (contractClaims.get(c.id)?.size ?? 0), 0);
		return Promise.resolve(
			ok({
				batch_id: tag,
				all_zero: rows.every((r) => r.diff === 0),
				rows,
				totals: {
					students: rows.length,
					expected_sum: rows.reduce((acc, r) => acc + r.expected, 0),
					actual_sum: rows.reduce((acc, r) => acc + r.actual, 0),
					mismatches: rows.filter((r) => r.diff !== 0).length,
					batch_transactions: batchTxns,
					batch_contracts: Array.from(contracts.values()).filter((c) => c.import_batch === tag).length,
					batch_claims: batchClaims,
					live_circulation: rows.reduce((acc, r) => acc + Math.max(0, r.live_balance), 0),
					live_debt: rows.reduce((acc, r) => acc + Math.max(0, -r.live_balance), 0),
					live_transactions: liveTxns
				}
			})
		);
	}

	return Promise.resolve(rpcError(`fake ledger: unhandled rpc "${fn}"`));
}

/**
 * Supports both existing callers' `.eq('role', ...).or(...).order(...).limit(n)`
 * shape (the single-student typeahead) AND PayoutManager's
 * `.select(...).in('email', emails)` shape (no `.limit()` at all) -- the
 * builder itself is thenable so a caller that never terminates with
 * `.limit()` still resolves when awaited directly.
 */
function makeProfilesQuery() {
	let eqRole: string | null = null;
	let orExpr: string | null = null;
	let inCol: string | null = null;
	let inValues: string[] | null = null;
	let limitN: number | null = null;

	function compute() {
		// Every sample row is already role='student'; eqRole is captured for
		// shape parity with the real query but has nothing further to filter.
		void eqRole;
		let rows = SAMPLE_STUDENTS.slice();
		if (orExpr) {
			const terms = orExpr
				.split(',')
				.map((clause) => clause.match(/ilike\.%(.*)%$/)?.[1]?.toLowerCase())
				.filter((t): t is string => !!t);
			const term = terms[0] ?? '';
			rows = rows.filter(
				(r) =>
					r.email.toLowerCase().includes(term) ||
					(r.full_name ?? '').toLowerCase().includes(term) ||
					(r.display_name ?? '').toLowerCase().includes(term)
			);
		}
		if (inCol === 'email' && inValues) {
			const wanted = new Set(inValues.map((v) => v.toLowerCase()));
			rows = rows.filter((r) => wanted.has(r.email.toLowerCase()));
		}
		if (limitN !== null) rows = rows.slice(0, limitN);
		return { data: rows, error: null };
	}

	const builder = {
		select(_cols: string) {
			return builder;
		},
		eq(col: string, val: string) {
			if (col === 'role') eqRole = val;
			return builder;
		},
		or(expr: string) {
			orExpr = expr;
			return builder;
		},
		in(col: string, values: string[]) {
			inCol = col;
			inValues = values;
			return builder;
		},
		order(_col: string, _opts?: unknown) {
			return builder;
		},
		limit(n: number) {
			limitN = n;
			return Promise.resolve(compute());
		},
		then<TResult1 = { data: StudentSuggestion[]; error: null }, TResult2 = never>(
			onFulfilled?: ((value: { data: StudentSuggestion[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
			onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return Promise.resolve(compute()).then(onFulfilled, onRejected);
		}
	};
	return builder;
}

/**
 * Mirrors 0070's coin_balances view (a pure sum over coin_transactions),
 * enough to drive PayoutManager's listing read end to end: `.gt('balance',
 * 0)` + `.order('balance', ...)`, no RPC involved, matching the real
 * migration's own "admin already sees every row here" doctrine.
 */
function makeBalancesQuery() {
	let gtVal: number | null = null;
	let orderAsc = true;

	function compute() {
		let rows = Array.from(ledger.entries()).map(([studentEmail, s]) => ({
			student_email: studentEmail,
			balance: s.balance,
			last_activity_at: s.txns[0]?.created_at ?? null,
			transaction_count: s.txns.length
		}));
		if (gtVal !== null) rows = rows.filter((r) => r.balance > (gtVal as number));
		rows.sort((a, b) => (orderAsc ? a.balance - b.balance : b.balance - a.balance));
		return { data: rows, error: null };
	}

	const builder = {
		select(_cols: string) {
			return builder;
		},
		gt(_col: string, val: number) {
			gtVal = val;
			return builder;
		},
		order(_col: string, opts?: { ascending?: boolean }) {
			orderAsc = opts?.ascending !== false;
			return builder;
		},
		then<TResult1 = unknown, TResult2 = never>(
			onFulfilled?: ((value: ReturnType<typeof compute>) => TResult1 | PromiseLike<TResult1>) | null,
			onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return Promise.resolve(compute()).then(onFulfilled, onRejected);
		}
	};
	return builder;
}

/**
 * Just enough of a `coin_transactions` read to drive migrate.ts's
 * loadLoggedRefunds (`.select(...).eq('category_id', ...).in('student_email',
 * [...])`) -- the VERIFY step's already-refunded detection. Admin-scoped in
 * the real schema; the harness is admin-only, so no scoping here.
 */
function makeTransactionsQuery() {
	let eqCategory: string | null = null;
	let inEmails: string[] | null = null;

	function compute() {
		const rows: { student_email: string; amount: number; note: string | null }[] = [];
		for (const [email, s] of ledger.entries()) {
			if (inEmails && !inEmails.includes(email)) continue;
			for (const t of s.txns) {
				if (eqCategory && t.category_id !== eqCategory) continue;
				rows.push({ student_email: email, amount: t.amount, note: t.note });
			}
		}
		return { data: rows, error: null };
	}

	const builder = {
		select(_cols: string) {
			return builder;
		},
		eq(col: string, val: string) {
			if (col === 'category_id') eqCategory = val;
			return builder;
		},
		in(col: string, values: string[]) {
			if (col === 'student_email') inEmails = values;
			return builder;
		},
		then<TResult1 = unknown, TResult2 = never>(
			onFulfilled?: ((value: ReturnType<typeof compute>) => TResult1 | PromiseLike<TResult1>) | null,
			onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return Promise.resolve(compute()).then(onFulfilled, onRejected);
		}
	};
	return builder;
}

/**
 * Mirrors coin-desk/+page.server.ts's own `coin_categories` select
 * (`.eq('loggable', true).order('sort_order')`) so CategoriesManager's
 * `refreshCategories()` reads the SAME live `catById` map every RPC handler
 * above writes to, with no separate refetch wiring.
 */
function makeCategoriesQuery() {
	const builder = {
		select(_cols: string) {
			return builder;
		},
		eq(_col: string, _val: unknown) {
			return builder;
		},
		order(_col: string, _opts?: unknown) {
			return builder;
		},
		then<TResult1 = unknown, TResult2 = never>(
			onFulfilled?: ((value: { data: CoinCategory[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
			onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return Promise.resolve({ data: Array.from(catById.values()), error: null }).then(onFulfilled, onRejected);
		}
	};
	return builder;
}
