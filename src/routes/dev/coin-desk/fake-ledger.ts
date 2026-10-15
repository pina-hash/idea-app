import type { CoinCategory, CoinMedium, StudentSuggestion } from '$lib/coin-desk';
import type { QuizQuestionType } from '$lib/coin-desk/roles';
import { COIN_SYMBOL } from '$lib/coin-format';

/**
 * IN-MEMORY STAND-IN FOR THE COIN DESK'S DATABASE, for `/dev/coin-desk` only.
 *
 * It answers every RPC the areas this harness mounts call (Log, Students,
 * Contracts, Roles, Economy, Settings), in the shapes IDEA Coin V2 session
 * two returns (0244 through 0251): one balance, digital; classes are IDEA
 * Classroom sections; the history folds undone pairs and edited amounts; the
 * pre-V2 coin sections, the Sheets import, the bulk payout and the old
 * contract and role list functions are GONE here exactly as 0251 drops them,
 * so a component that still named one would hit "unhandled rpc" and say so.
 *
 * It mirrors enough of each rule to reach every refusal a surface words (the
 * purchase rule, caps, the Eating Pass strikes, a full class, a missing class,
 * an uneditable row, the spool floor). It is a TEST DOUBLE: the real routes
 * talk to the real database.
 */

export const SAMPLE_CATEGORIES: CoinCategory[] = [
	{ id: 'shop_safety_violation', name: 'Shop Safety Violation', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 12, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Real physical injury risk, priced at the top on purpose.' },
	{ id: 'shop_not_cleaned_up', name: 'Shop Not Cleaned Up', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 12, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null, active: false },
	{ id: 'coin_theft', name: 'Coin Theft', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 12, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'classmate_trust_violation', name: 'Classmate Trust Violation', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 5, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'eating_violation', name: 'Eating Violation', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 5, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Eating with no pass, or breaking pass conduct rules badly enough to strike. A third strike while holding a pass revokes it.' },
	{ id: 'leaving_without_permission', name: 'Leaving Without Permission', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 5, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'disruptive_behavior', name: 'Disruptive Behavior', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 3, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'printer_not_reset', name: '3D Printer Not Reset', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 3, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'long_bathroom_break', name: 'Long Bathroom Break', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 2, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'off_task_device_use', name: 'Off-Task Device Use', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 2, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'unauthorized_printing', name: 'Unauthorized Printing', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 2, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null, active: false },
	{ id: 'classroom_standards_violation', name: 'Classroom Standards Violation', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 1, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'inappropriate_screen_content', name: 'Inappropriate Screen Content', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 2, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'property_damage_careless', name: 'Property Damage (Careless)', kind: 'fine', scope: 'core', pricing_model: 'formula', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: 'property_damage_careless', semester_point_cap: null, cap_period: null, cap_count: null, notes: `3${COIN_SYMBOL} flat plus 1${COIN_SYMBOL} per $0.25 of repair/replacement cost.` },
	{ id: 'property_damage_first_accident', name: 'Property Damage (First Accident)', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 0, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'No charge for a first accidental incident in a semester; logged, not billed.' },
	{ id: 'property_damage_repeat_accident', name: 'Property Damage (Repeat Accident)', kind: 'fine', scope: 'core', pricing_model: 'flat', amount: 5, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },

	{ id: 'highest_grade_weekly', name: 'Highest Grade in Section (Weekly)', kind: 'award', scope: 'core', pricing_model: 'flat', amount: 1, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null },
	{ id: 'perfect_score_graded_work', name: 'Perfect Score on Graded Work', kind: 'award', scope: 'core', pricing_model: 'formula', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: 'perfect_score', semester_point_cap: null, cap_period: null, cap_count: null, notes: `round(points / 25)${COIN_SYMBOL}, minimum 1${COIN_SYMBOL}.` },
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
	{ id: 'physical_coin_submission', name: 'Physical Coin Submission', kind: 'award', scope: 'core', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null, active: false },
	{ id: 'debt_payment', name: 'Debt Payment', kind: 'award', scope: 'core', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Debt settlement, logged distinctly from Physical Coin Submission. Not capped at the current debt.' },

	{ id: 'eating_pass', name: 'Eating Pass', kind: 'purchase', scope: 'core', pricing_model: 'flat', amount: 150, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'One tier, conduct rules attached. At most one active pass per student.' },
	{ id: 'extra_credit', name: 'Extra Credit', kind: 'purchase', scope: '209h', pricing_model: 'per_unit', amount: 2, min_amount: null, max_amount: null, unit_label: 'point', formula_key: null, semester_point_cap: 21, cap_period: null, cap_count: null, notes: 'Restricted to Unit Labs, Unit Assignments, and Documentation checks.' },
	{ id: 'platform_cosmetic_unlock', name: 'Platform Cosmetic Unlock', kind: 'purchase', scope: 'core', pricing_model: 'range', amount: null, min_amount: 15, max_amount: 25, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null, active: false },
	{ id: 'coin_payout', name: 'Coin Payout', kind: 'purchase', scope: 'core', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Converts digital balance to physical coins handed over.' },
	{ id: 'three_d_printing', name: '3D Printing', kind: 'purchase', scope: 'core', pricing_model: 'formula', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: 'three_d_printing', semester_point_cap: null, cap_period: null, cap_count: null, notes: `1${COIN_SYMBOL} per 10 g, by weight only.` },
	{ id: 'text_printing', name: 'Text Printing (B&W, per 4 pages)', kind: 'purchase', scope: 'core', pricing_model: 'per_unit', amount: 1, min_amount: null, max_amount: null, unit_label: '4 pages', formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: null, active: false },
	{ id: 'song_request', name: 'Song Request', kind: 'purchase', scope: 'core', pricing_model: 'flat', amount: 3, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Approval-gated: nothing plays until reviewed.' },
	{ id: 'pay_raise', name: 'Pay Raise', kind: 'purchase', scope: 'core', pricing_model: 'formula', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: 'pay_raise', semester_point_cap: null, cap_period: null, cap_count: null, notes: `100${COIN_SYMBOL} x the tier being left; permanently raises the wage tier.` },

	{ id: 'reversal', name: 'Reversal (Undo)', kind: 'adjustment', scope: 'core', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'System only: posted by Undo.' },
	{ id: 'balance_correction', name: 'Balance Correction / Refund', kind: 'adjustment', scope: 'core', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null, unit_label: null, formula_key: null, semester_point_cap: null, cap_period: null, cap_count: null, notes: 'Admin-entered, signed amount with a required reason.' }
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
 * A dev-only question bank (never the real quiz text, which is seeded by hand
 * outside this repo). Quartermaster has none, the "nothing to answer" state.
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


// ---------------------------------------------------------------------------
// PEOPLE AND CLASSES
// ---------------------------------------------------------------------------

/**
 * The seeded students. Emails match the ledger below, so picking a name lands
 * on a meaningful history (healthy, in debt, an Eating Pass with a strike).
 * Quinn Patel is deliberately unseeded: the "nothing logged yet" state.
 */
export const SAMPLE_STUDENTS: StudentSuggestion[] = [
	{ id: 's1', email: 'healthy.student@boscotech.net', full_name: 'Alex Rivera', display_name: null },
	{ id: 's2', email: 'debt.student@boscotech.net', full_name: 'Jordan Kim', display_name: null },
	{ id: 's3', email: 'pass.student@boscotech.net', full_name: 'Samantha Diaz', display_name: 'Sam Diaz' },
	{ id: 's4', email: 'quinn.patel@boscotech.net', full_name: 'Quinn Patel', display_name: null }
];

/** The harness admin's own id: the folder a want-list photo uploads into. */
export const HARNESS_USER_ID = '00000000-0000-4000-8000-0000000000aa';

/** IDEA Classroom sections with the economy on (coin_staff_scope's `sections`). */
export const HARNESS_CLASSES: { id: string; label: string }[] = [
	{ id: '11111111-1111-4111-8111-000000000001', label: 'IDEA 100 Block 3' },
	{ id: '11111111-1111-4111-8111-000000000002', label: 'IDEA 209H Block 5' },
	{ id: '11111111-1111-4111-8111-000000000004', label: 'Full Class (44 students)' }
];
const [CLASS_100, CLASS_209, CLASS_FULL] = HARNESS_CLASSES.map((c) => c.id);
const CLASS_OFF = '11111111-1111-4111-8111-000000000003';

/** email -> class id: the economy-on enrollments coin_fine_roster reads. */
const enrollment = new Map<string, string>([
	['healthy.student@boscotech.net', CLASS_100],
	['debt.student@boscotech.net', CLASS_100],
	['quinn.patel@boscotech.net', CLASS_100],
	['pass.student@boscotech.net', CLASS_209]
]);

function studentName(email: string): string {
	const s = SAMPLE_STUDENTS.find((x) => x.email === email);
	return s?.display_name || s?.full_name || email;
}

// ---------------------------------------------------------------------------
// THE LEDGER
// ---------------------------------------------------------------------------

interface Txn {
	id: string;
	category_id: string;
	amount: number;
	medium: CoinMedium;
	quantity: number | null;
	note: string | null;
	actor_email: string;
	created_at: string;
	transfer_id: string | null;
	meta: Record<string, unknown>;
}

interface StudentState {
	wageTier: number;
	ecUsedPoints: number;
	txns: Txn[];
}

const ledger = new Map<string, StudentState>();
let txnSeq = 0;

/** Names for the rows no picker offers but a history still shows. */
const NAME_ONLY: Record<string, string> = {
	eating_pass_revoked: 'Eating Pass Revoked (system)',
	reversal: 'Reversal (Undo)',
	amount_correction: 'Amount Correction',
	payout_physical_credit: 'Coin Payout (physical credit)',
	debt_relief: 'Debt Relief',
	split_payment: 'Split Payment (digital part)',
	payout_hold: 'Coins Out (held for payday)'
};

/** Category ids coin_log_transaction refuses by name (loggable = false). */
const NON_LOGGABLE = new Set([
	'eating_pass_revoked',
	'payout_physical_credit',
	'coin_payout',
	'reversal',
	'amount_correction',
	'payout_hold',
	'split_payment',
	'debt_relief'
]);

/** Mutable, so a created or retired category is visible everywhere at once. */
const catById = new Map<string, CoinCategory>(SAMPLE_CATEGORIES.map((c) => [c.id, c]));

function categoryName(id: string): string {
	return catById.get(id)?.name ?? NAME_ONLY[id] ?? id;
}

function categoryKind(id: string): string {
	if (id === 'amount_correction' || id === 'reversal' || id === 'payout_hold') return 'adjustment';
	if (id === 'debt_relief') return 'award';
	return catById.get(id)?.kind ?? 'adjustment';
}

/** The loggable category list, as the Log and Economy loads read it. */
export function listCategories(): CoinCategory[] {
	return Array.from(catById.values());
}

function stateFor(email: string): StudentState {
	let s = ledger.get(email);
	if (!s) {
		s = { wageTier: 1, ecUsedPoints: 0, txns: [] };
		ledger.set(email, s);
	}
	return s;
}

function money(n: number): number {
	return Math.round(n * 100) / 100;
}

function daysAgo(n: number): string {
	return new Date(Date.now() - n * 86400000).toISOString();
}

function insert(
	email: string,
	categoryId: string,
	amount: number,
	quantity: number | null,
	note: string | null,
	meta: Record<string, unknown> = {},
	medium: CoinMedium = 'digital',
	actor = 'admin@boscotech.edu',
	at = new Date().toISOString()
): Txn {
	const t: Txn = {
		id: `t${++txnSeq}`,
		category_id: categoryId,
		amount: money(amount),
		medium,
		quantity,
		note,
		actor_email: actor,
		created_at: at,
		transfer_id: (meta.transfer_id as string | undefined) ?? null,
		meta
	};
	stateFor(email).txns.unshift(t);
	return t;
}

function allTxns(): { email: string; t: Txn }[] {
	const out: { email: string; t: Txn }[] = [];
	for (const [email, s] of ledger) for (const t of s.txns) out.push({ email, t });
	return out;
}

function findTxn(id: string): { email: string; t: Txn } | null {
	return allTxns().find((x) => x.t.id === id) ?? null;
}

function isReversed(id: string): boolean {
	return allTxns().some((x) => x.t.category_id === 'reversal' && x.t.meta.reverses === id);
}

/** 0250's _coin_effective_amount: 0 when undone, else plus its live corrections. */
function effectiveAmount(t: Txn): number {
	if (isReversed(t.id)) return 0;
	const corr = allTxns()
		.filter((x) => x.t.category_id === 'amount_correction' && x.t.meta.edits === t.id && !isReversed(x.t.id))
		.reduce((s, x) => s + x.t.amount, 0);
	return money(t.amount + corr);
}

/** The one balance: the digital sum (0239). */
function balanceOf(email: string): number {
	return money(stateFor(email).txns.filter((t) => t.medium === 'digital').reduce((s, t) => s + t.amount, 0));
}

function editsOf(id: string) {
	return allTxns()
		.filter((x) => x.t.category_id === 'amount_correction' && x.t.meta.edits === id)
		.sort((a, b) => a.t.created_at.localeCompare(b.t.created_at))
		.map((x) => ({
			id: x.t.id,
			at: x.t.created_at,
			old: x.t.meta.old,
			new: x.t.meta.new,
			undone: isReversed(x.t.id)
		}));
}

/** 0250's _coin_listed: never a correction, never the undo of one. */
function listed(t: Txn): boolean {
	return t.category_id !== 'amount_correction' && !(t.category_id === 'reversal' && t.meta.reversed_category === 'amount_correction');
}

/** 0250's _coin_history_row. */
function historyRow(t: Txn) {
	const reversed = isReversed(t.id);
	return {
		id: t.id,
		at: t.created_at,
		created_at: t.created_at,
		amount: money(effectiveAmount(t) + (reversed ? t.amount : 0)),
		original_amount: t.amount,
		edited: editsOf(t.id).some((e) => !e.undone),
		edits: editsOf(t.id),
		category_id: t.category_id,
		name: categoryName(t.category_id),
		category_name: categoryName(t.category_id),
		kind: categoryKind(t.category_id),
		note: t.note,
		medium: t.medium,
		transfer_id: t.transfer_id,
		quantity: t.quantity,
		actor_email: t.actor_email,
		reverses: (t.meta.reverses as string | undefined) ?? null,
		reversed,
		automatic: t.actor_email === 'system'
	};
}

function eatingPassActive(email: string): boolean {
	const last = stateFor(email).txns.find((t) => t.category_id === 'eating_pass' || t.category_id === 'eating_pass_revoked');
	return last?.category_id === 'eating_pass';
}

function eatingPassStrikes(email: string): number {
	const s = stateFor(email);
	const bought = s.txns.find((t) => t.category_id === 'eating_pass');
	const since = bought ? bought.created_at : '';
	return s.txns.filter((t) => t.category_id === 'eating_violation' && t.meta.strike === true && t.created_at >= since).length;
}

function capReached(email: string, cat: CoinCategory): boolean {
	if (!cat.cap_period || !cat.cap_count) return false;
	const now = new Date();
	const n = stateFor(email).txns.filter((t) => {
		if (t.category_id !== cat.id) return false;
		const d = new Date(t.created_at);
		if (cat.cap_period === 'day') return d.toDateString() === now.toDateString();
		return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
	}).length;
	return n >= cat.cap_count;
}

// ---------------------------------------------------------------------------
// SETTINGS (0240 and 0245's seeded defaults)
// ---------------------------------------------------------------------------

const settings: Record<string, unknown> = {
	autopay_paused: false,
	autopay_start: '2026-10-12',
	highest_grade_weeks: 2,
	highest_grade_anchor: '2026-10-12',
	semesters: [
		{ key: '2026-fall', start: '2026-08-17', end: '2026-12-18' },
		{ key: '2027-spring', start: '2027-01-05', end: '2027-06-03' }
	],
	no_pay_weeks: ['2026-11-23', '2026-12-21', '2026-12-28', '2027-03-29'],
	no_pay_after: '2027-06-04',
	hall_pass_warn_minutes: 10,
	hall_pass_fine_minutes: 20,
	fine_buttons: ['shop_safety_violation', 'coin_theft', 'eating_violation', 'property_damage', 'disruptive_behavior'],
	extra_credit_cap_percent: 2,
	pay_raise_cost_per_tier: 100,
	print_grams_per_coin: 10,
	property_damage_careless_base: 3,
	property_damage_dollars_per_coin: 0.25,
	student_actions_per_minute: 10,
	background_guidance:
		'Your background must be 16:9, at least 1920 by 1080 pixels, sharp and high quality. It must pass the parent and tour test.',
	background_prompt: 'A cinematic, ultra high resolution 16:9 desktop wallpaper of [your idea], no text, no logos.',
	background_min_width: 1920,
	background_min_height: 1080,
	background_min_kb_per_megapixel: 100,
	background_days_between: 14,
	donation_cap_coins: 10,
	donation_cap_days: 14,
	payday_dates: [],
	no_class_days: ['2026-11-11', '2027-01-04', '2027-01-18'],
	role_min_gap_minutes: 45,
	role_photos_per_day: 2,
	role_window_start: '07:00',
	role_window_end: '16:00',
	role_stipend_anchor: '2026-10-12',
	role_stipend_weeks: 2,
	role_instructions: {
		shop_steward: 'At the start of class, photograph the whole shop from the doorway. At the end, photograph the same spot again.',
		quartermaster: 'At the start of class, photograph the tool wall. At the end, photograph it again, every tool back.'
	},
	quarter_ends: ['2026-12-18', '2027-03-12', '2027-06-03'],
	debt_relief_fines_since: '2026-10-15',
	chronic_debt_threshold: -20,
	chronic_debt_weeks: 3,
	digest_gain_threshold: 10,
	tournament_placement_defaults: [3, 2, 1]
};

const settingsAudit: { key: string; old_value: unknown; new_value: unknown; changed_by: string; changed_at: string }[] = [];

function audit(key: string, oldValue: unknown, newValue: unknown) {
	settingsAudit.unshift({
		key,
		old_value: oldValue ?? null,
		new_value: newValue,
		changed_by: 'admin@boscotech.edu',
		changed_at: new Date().toISOString()
	});
}

/** A loose mirror of `_coin_setting_ok`: enough to reach the 'invalid' refusal for every key. */
function settingOk(key: string, v: unknown): boolean {
	const date = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
	const time = (x: unknown) => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
	const between = (x: unknown, lo: number, hi: number) => typeof x === 'number' && x >= lo && x <= hi;
	const whole = (x: unknown, lo: number, hi: number) => between(x, lo, hi) && Number.isInteger(x);
	switch (key) {
		case 'autopay_paused':
			return typeof v === 'boolean';
		case 'autopay_start':
		case 'highest_grade_anchor':
		case 'no_pay_after':
		case 'role_stipend_anchor':
		case 'debt_relief_fines_since':
			return date(v);
		case 'highest_grade_weeks':
			return whole(v, 1, 20);
		case 'hall_pass_warn_minutes':
		case 'hall_pass_fine_minutes':
			return between(v, 1, 240);
		case 'extra_credit_cap_percent':
			return between(v, 0, 100);
		case 'pay_raise_cost_per_tier':
		case 'print_grams_per_coin':
		case 'property_damage_careless_base':
		case 'property_damage_dollars_per_coin':
			return between(v, 0.01, 100000);
		case 'student_actions_per_minute':
			return between(v, 1, 120);
		case 'background_guidance':
		case 'background_prompt':
			return typeof v === 'string' && v.length <= 4000;
		case 'background_min_width':
		case 'background_min_height':
			return whole(v, 100, 20000);
		case 'background_min_kb_per_megapixel':
			return between(v, 0, 10000);
		case 'background_days_between':
		case 'donation_cap_days':
		case 'chronic_debt_weeks':
		case 'role_stipend_weeks':
			return whole(v, 1, 120);
		case 'donation_cap_coins':
		case 'digest_gain_threshold':
			return between(v, 0, 100000);
		case 'chronic_debt_threshold':
			return between(v, -100000, 0);
		case 'role_min_gap_minutes':
			return between(v, 0, 600);
		case 'role_photos_per_day':
			return whole(v, 2, 10);
		case 'role_window_start':
		case 'role_window_end':
			return time(v);
		case 'role_instructions':
			return !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string' && x.length <= 4000);
		case 'tournament_placement_defaults':
			return Array.isArray(v) && v.length === 3 && v.every((x) => between(x, 0, 1000));
		case 'no_class_days':
		case 'quarter_ends':
		case 'payday_dates':
			return Array.isArray(v) && v.length <= 300 && v.every(date);
		case 'no_pay_weeks':
			return Array.isArray(v) && v.every((d) => date(d) && new Date(`${d}T00:00:00Z`).getUTCDay() === 1);
		case 'semesters':
			return (
				Array.isArray(v) &&
				v.every((x) => x && typeof x === 'object' && /^[a-z0-9-]{1,30}$/.test(String(x.key)) && date(x.start) && date(x.end) && x.end >= x.start)
			);
		case 'fine_buttons':
			return Array.isArray(v) && v.length <= 30 && v.every((x) => typeof x === 'string' && /^[a-z0-9_]+$/.test(x));
		default:
			return false;
	}
}

const settingsSections = [
	{ id: CLASS_100, label: 'IDEA 100 Block 3', teacher_email: 'apina@boscotech.edu', economy_on: true, auto_checkin_minutes: 30 as number | null },
	{ id: CLASS_209, label: 'IDEA 209H Block 5', teacher_email: 'apina@boscotech.edu', economy_on: true, auto_checkin_minutes: 15 as number | null },
	{ id: CLASS_FULL, label: 'Full Class (44 students)', teacher_email: 'apina@boscotech.edu', economy_on: true, auto_checkin_minutes: null as number | null },
	{ id: CLASS_OFF, label: 'IDEA 300 Block 1', teacher_email: 'other.teacher@boscotech.edu', economy_on: false, auto_checkin_minutes: null as number | null }
];

const explanations = new Map<string, string>([
	['shop_safety_violation', 'Breaking a shop safety rule. Costs 12 coins, and no shop for the rest of that school day.'],
	['eating_pass', 'Lets you eat in class following the Eating Pass rules. A third eating strike cancels it.']
]);

const noShop = new Set<string>();
const autopayRuns: { id: number; trigger: string; started_at: string; finished_at: string | null; result: { wages: number; highest_grade: number; perfect_score: number } | null }[] = [];
let wagesPaidThisWeek = false;

// ---------------------------------------------------------------------------
// SPOOLS, AUDITORS, FULL ADMINS, THE WANT LIST (0244, 0245, 0250)
// ---------------------------------------------------------------------------

const spoolGrams = new Map<string, number>([['pass.student@boscotech.net', 640]]);
const auditors = new Map<string, string>([['pass.student@boscotech.net', daysAgo(10)]]);
const fullAdmins: { email: string; added_by: string; added_at: string; note: string | null }[] = [
	{ email: 'co.teacher@boscotech.edu', added_by: 'apina@boscotech.edu', added_at: daysAgo(30), note: 'Runs the 209H economy' },
	{ email: 'former.admin@boscotech.edu', added_by: 'apina@boscotech.edu', added_at: daysAgo(60), note: null }
];
const siteAdmins = ['apina@boscotech.edu', 'co.teacher@boscotech.edu'];

interface DonationItem {
	id: string;
	name: string;
	rate: number | null;
	photo_path: string | null;
	active: boolean;
	sort_order: number;
}
const donationItems: DonationItem[] = [
	{ id: 'd-1', name: 'Tissue box, small square', rate: 1, photo_path: null, active: true, sort_order: 10 },
	{ id: 'd-2', name: 'Tissue box, large rectangle', rate: 2, photo_path: `${HARNESS_USER_ID}/seed-tissues.png`, active: true, sort_order: 20 },
	{ id: 'd-3', name: 'Other', rate: null, photo_path: null, active: true, sort_order: 90 },
	{ id: 'd-4', name: 'Hand sanitizer', rate: 1, photo_path: null, active: false, sort_order: 30 }
];
let donationSeq = 4;

// ---------------------------------------------------------------------------
// CONTRACTS (0248)
// ---------------------------------------------------------------------------

interface Claim {
	email: string;
	claimed_at: string;
	done_at: string | null;
	hours: number | null;
	paid_at: string | null;
	request_status: string | null;
}
interface Contract {
	id: string;
	title: string;
	description: string | null;
	pay_type: 'hourly' | 'flat' | 'quality';
	payout_amount: number | null;
	hourly_rate: number | null;
	debt_only: boolean;
	max_contractors: number;
	section_id: string | null;
	created_at: string;
	completed_at: string | null;
	cancelled_at: string | null;
	cancel_reason: string | null;
	claims: Claim[];
}
const contracts: Contract[] = [];
let contractSeq = 0;

function contractStatus(c: Contract): 'open' | 'full' | 'completed' | 'cancelled' {
	if (c.completed_at) return 'completed';
	if (c.cancelled_at) return 'cancelled';
	return c.claims.length >= c.max_contractors ? 'full' : 'open';
}

function sectionLabel(id: string | null): string | null {
	if (!id) return null;
	return settingsSections.find((s) => s.id === id)?.label ?? null;
}

// ---------------------------------------------------------------------------
// ROLES (0247)
// ---------------------------------------------------------------------------

const ROLE_DEFS = [
	{ id: 'shop_steward', name: 'Shop Steward', description: 'Keeps the shop floor safe and organized between classes.', active: true, suggested_duration_days: 90 },
	{ id: 'quartermaster', name: 'Quartermaster', description: 'Tracks and issues shared tools and materials.', active: true, suggested_duration_days: 90 },
	{ id: 'safety_officer', name: 'Safety Officer', description: 'Watches for and flags safety issues during independent work.', active: true, suggested_duration_days: 90 },
	{ id: 'lab_tech', name: 'Lab Tech', description: 'Keeps shared lab and print equipment running.', active: true, suggested_duration_days: 90 }
];

/** (role, class) -> cap and switch; no entry reads as on, cap 1. */
const roleClass = new Map<string, { cap: number; enabled: boolean }>([
	[`quartermaster:${CLASS_209}`, { cap: 2, enabled: true }],
	[`lab_tech:${CLASS_100}`, { cap: 1, enabled: false }]
]);

interface Application {
	id: string;
	email: string;
	role_id: string;
	section_id: string | null;
	submitted_at: string;
	status: 'pending' | 'approved' | 'rejected';
	answers: { question: string; type: QuizQuestionType; options: string[] | null; written_answer: string | null; selected_option_index: number | null; is_correct: boolean | null }[];
}
interface Holder {
	id: string;
	email: string;
	role_id: string;
	section_id: string | null;
	since: string;
	expires_at: string | null;
	revoked_at: string | null;
	rules: Record<string, unknown> | null;
	evidence: { day: string; path: string; taken_at: string }[];
	overrides: Map<string, 'accepted' | 'rejected'>;
}
const applications: Application[] = [];
const holders: Holder[] = [];
let appSeq = 0;
let holderSeq = 0;

function roleCap(roleId: string, sectionId: string): { cap: number; enabled: boolean } {
	return roleClass.get(`${roleId}:${sectionId}`) ?? { cap: 1, enabled: true };
}

function holderActive(h: Holder): boolean {
	return !h.revoked_at && (!h.expires_at || new Date(h.expires_at).getTime() > Date.now());
}

function roleHeld(roleId: string, sectionId: string): number {
	return holders.filter((h) => holderActive(h) && h.role_id === roleId && h.section_id === sectionId).length;
}

function holderRules(h: Holder) {
	const r = h.rules ?? {};
	return {
		min_gap_minutes: (r.min_gap_minutes as number | undefined) ?? (settings.role_min_gap_minutes as number),
		photos_per_day: (r.photos_per_day as number | undefined) ?? (settings.role_photos_per_day as number),
		window_start: (r.window_start as string | undefined) ?? (settings.role_window_start as string),
		window_end: (r.window_end as string | undefined) ?? (settings.role_window_end as string),
		own: h.rules !== null
	};
}

function isoDay(offset: number): string {
	return new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
}

function laTime(iso: string): string {
	return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles' });
}

/** 0247's _coin_role_day_status plus class_day and photo_paths. */
function roleDay(h: Holder, day: string) {
	const rules = holderRules(h);
	const ev = h.evidence.filter((e) => e.day === day).sort((a, b) => a.taken_at.localeCompare(b.taken_at));
	const n = ev.length;
	const gap = n > 1 ? Math.round((new Date(ev[n - 1].taken_at).getTime() - new Date(ev[0].taken_at).getTime()) / 60000) : null;
	const outside = ev.filter((e) => laTime(e.taken_at) < rules.window_start || laTime(e.taken_at) > rules.window_end).length;
	let reason: string | null = null;
	if (n === 0) reason = 'no_photos';
	else if (n < rules.photos_per_day) reason = 'too_few_photos';
	else if (outside > 0) reason = 'outside_window';
	else if ((gap ?? 0) < rules.min_gap_minutes) reason = 'gap_too_short';
	const override = h.overrides.get(day) ?? null;
	const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
	return {
		day,
		photos: n,
		gap_minutes: gap,
		rules_pass: reason === null,
		reason,
		override,
		valid: override ? override === 'accepted' : reason === null,
		status: override === 'accepted' ? 'accepted' : override === 'rejected' ? 'rejected' : reason === null ? 'passed' : n === 0 ? 'none' : 'failed',
		class_day: dow !== 0 && dow !== 6 && !(settings.no_class_days as string[]).includes(day),
		photo_paths: ev.map((e) => ({ path: e.path, taken_at: e.taken_at }))
	};
}

function roleDays(h: Holder) {
	const out = [];
	const since = h.since.slice(0, 10);
	for (let i = 13; i >= 0; i--) {
		const day = isoDay(i);
		if (day >= since) out.push(roleDay(h, day));
	}
	return out;
}

// ---------------------------------------------------------------------------
// THE V2 TOGGLE
// ---------------------------------------------------------------------------

/** The functions V2 adds or reshapes. While the toggle is off they answer PGRST202. */
const V2_FUNCTIONS = new Set([
	'coin_reverse_transaction',
	'coin_record_cash_purchase',
	'coin_no_shop_set',
	'coin_autopay_recent',
	'coin_autopay_run',
	'coin_settings_get',
	'coin_settings_set',
	'coin_settings_set_category',
	'coin_settings_set_section_economy',
	'coin_fine_sections',
	'coin_fine_roster',
	'coin_student_stats',
	'coin_export',
	'coin_edit_amount',
	'coin_edit_undo',
	'coin_record_spool',
	'coin_auditor_list',
	'coin_auditor_set',
	'coin_full_admin_list',
	'coin_full_admin_set',
	'coin_donation_items_list',
	'coin_donation_item_save',
	'coin_contracts_admin',
	'coin_contract_post',
	'coin_roles_admin',
	'coin_role_class_set',
	'coin_role_set_class',
	'coin_role_day_set',
	'coin_role_holder_rules_set',
	'coin_role_stipend_manual'
]);

let v2Applied = true;

/** The harness's "V2 database update applied" toggle. */
export function setV2Applied(on: boolean): void {
	v2Applied = on;
}

/**
 * Which coin tier the harness is (decision 68). A section coin staff member's
 * lookup answers `can_edit: false`, which is what removes every amount edit.
 */
let harnessScope: 'full' | 'section' = 'full';
export function setHarnessScope(scope: 'full' | 'section'): void {
	harnessScope = scope;
}

// ---------------------------------------------------------------------------
// SEEDING
// ---------------------------------------------------------------------------

function seed() {
	ledger.clear();
	txnSeq = 0;
	contracts.length = 0;
	applications.length = 0;
	holders.length = 0;
	autopayRuns.length = 0;
	settingsAudit.length = 0;
	noShop.clear();
	wagesPaidThisWeek = false;
	v2Applied = true;

	// healthy.student: positive, a varied history over three weeks, one edited row.
	const h = 'healthy.student@boscotech.net';
	insert(h, 'balance_correction', 26, null, 'opening balance', {}, 'digital', 'admin@boscotech.edu', daysAgo(20));
	insert(h, 'weekly_wage', 1, null, 'Paid automatically', { autopay_run: 1 }, 'digital', 'system', daysAgo(16));
	insert(h, 'above_and_beyond', 3, null, 'stayed late to reset the printers', {}, 'digital', 'admin@boscotech.edu', daysAgo(13));
	insert(h, 'off_task_device_use', -2, null, null, {}, 'digital', 'admin@boscotech.edu', daysAgo(11));
	insert(h, 'song_request', -3, null, null, {}, 'digital', 'admin@boscotech.edu', daysAgo(9));
	const edited = insert(h, 'correct_answer_in_class', 1, null, null, {}, 'digital', 'admin@boscotech.edu', daysAgo(6));
	insert(h, 'amount_correction', 1, null, 'Two answers, not one', { edits: edited.id, old: 1, new: 2, original: 1 }, 'digital', 'admin@boscotech.edu', daysAgo(5));
	insert(h, 'weekly_wage', 1, null, 'Paid automatically', { autopay_run: 1 }, 'digital', 'system', daysAgo(2));
	insert(h, 'highest_grade_weekly', 2, null, 'Paid automatically', { autopay_run: 1 }, 'digital', 'system', daysAgo(2));
	insert(h, 'balance_correction', 15, null, 'coins already in hand', {}, 'physical', 'admin@boscotech.edu', daysAgo(20));

	// debt.student: below zero, with one undone pair.
	const d = 'debt.student@boscotech.net';
	insert(d, 'above_and_beyond', 4, null, 'helped a classmate debug a sketch', {}, 'digital', 'admin@boscotech.edu', daysAgo(8));
	insert(d, 'shop_safety_violation', -12, null, null, {}, 'digital', 'admin@boscotech.edu', daysAgo(3));
	const undone = insert(d, 'disruptive_behavior', -3, null, 'talking over a demo', {}, 'digital', 'admin@boscotech.edu', daysAgo(1));
	insert(d, 'reversal', 3, null, 'Logged against the wrong student', { reverses: undone.id, reversed_category: 'disruptive_behavior' }, 'digital', 'admin@boscotech.edu', daysAgo(0.5));

	// pass.student: an Eating Pass with one strike, wage tier 2, a spool.
	const p = 'pass.student@boscotech.net';
	insert(p, 'balance_correction', 300, null, 'opening balance', {}, 'digital', 'admin@boscotech.edu', daysAgo(6));
	insert(p, 'eating_pass', -150, null, null, {}, 'digital', 'admin@boscotech.edu', daysAgo(5));
	insert(p, 'eating_violation', -5, null, 'left wrapper at the station', { strike: true }, 'digital', 'admin@boscotech.edu', daysAgo(2));
	insert(p, 'weekly_wage', 2, null, 'Paid automatically', { autopay_run: 1 }, 'digital', 'system', daysAgo(2));
	stateFor(p).wageTier = 2;
	stateFor(p).ecUsedPoints = 15;

	// A full class, for the roster's no-scroll rule.
	const FIRST = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Faye', 'Gus', 'Hana', 'Ivan', 'Jo', 'Kai'];
	const LAST = ['Alvarez', 'Bakker', 'Chen', 'Delgado'];
	for (let i = 0; i < 44; i++) {
		const first = FIRST[i % FIRST.length];
		const last = LAST[Math.floor(i / FIRST.length) % LAST.length];
		const email = `${first.toLowerCase()}.${last.toLowerCase()}@boscotech.net`;
		enrollment.set(email, CLASS_FULL);
		if (!SAMPLE_STUDENTS.some((s) => s.email === email)) {
			SAMPLE_STUDENTS.push({ id: `full-${i}`, email, full_name: `${first} ${last}`, display_name: `${last}, ${first}` });
		}
	}

	autopayRuns.push({ id: 1, trigger: 'nightly', started_at: daysAgo(2), finished_at: daysAgo(2), result: { wages: 2, highest_grade: 1, perfect_score: 0 } });
	settingsAudit.push({ key: 'hall_pass_fine_minutes', old_value: 25, new_value: 20, changed_by: 'apina@boscotech.edu', changed_at: daysAgo(3) });

	// Contracts: open (one claimant marked done), full hourly, a restitution job, a completed and a cancelled one.
	contractSeq = 0;
	const add = (c: Omit<Contract, 'id'>) => contracts.push({ ...c, id: `contract-${++contractSeq}` });
	add({
		title: 'Rewire the LED strip along the shop bench',
		description: 'Route and secure the strip, test every segment.',
		pay_type: 'flat', payout_amount: 30, hourly_rate: null, debt_only: false, max_contractors: 3, section_id: null,
		created_at: daysAgo(2), completed_at: null, cancelled_at: null, cancel_reason: null,
		claims: [
			{ email: h, claimed_at: daysAgo(1.5), done_at: daysAgo(0.2), hours: null, paid_at: null, request_status: 'pending' },
			{ email: 'quinn.patel@boscotech.net', claimed_at: daysAgo(1), done_at: null, hours: null, paid_at: null, request_status: null }
		]
	});
	add({
		title: 'Inventory the fastener bins',
		description: 'Sort by size, relabel, note anything running low.',
		pay_type: 'hourly', payout_amount: 1, hourly_rate: 1.5, debt_only: false, max_contractors: 1, section_id: CLASS_100,
		created_at: daysAgo(3), completed_at: null, cancelled_at: null, cancel_reason: null,
		claims: [{ email: 'pass.student@boscotech.net', claimed_at: daysAgo(2), done_at: null, hours: null, paid_at: null, request_status: null }]
	});
	add({
		title: 'Sweep and mop the shop floor',
		description: 'A restitution job for a student in debt.',
		pay_type: 'quality', payout_amount: 5, hourly_rate: null, debt_only: true, max_contractors: 2, section_id: null,
		created_at: daysAgo(1), completed_at: null, cancelled_at: null, cancel_reason: null,
		claims: [{ email: d, claimed_at: daysAgo(0.8), done_at: null, hours: null, paid_at: null, request_status: null }]
	});
	add({
		title: 'Label the storage bins',
		description: 'Finished and paid.',
		pay_type: 'flat', payout_amount: 18, hourly_rate: null, debt_only: false, max_contractors: 2, section_id: null,
		created_at: daysAgo(9), completed_at: daysAgo(6), cancelled_at: null, cancel_reason: null,
		claims: [{ email: p, claimed_at: daysAgo(8), done_at: daysAgo(7), hours: null, paid_at: daysAgo(6), request_status: 'approved' }]
	});
	add({
		title: 'Order more filament',
		description: 'Cancelled: ordered directly.',
		pay_type: 'flat', payout_amount: 25, hourly_rate: null, debt_only: false, max_contractors: 1, section_id: null,
		created_at: daysAgo(7), completed_at: null, cancelled_at: daysAgo(6), cancel_reason: 'Ordered directly instead',
		claims: [{ email: d, claimed_at: daysAgo(7), done_at: null, hours: null, paid_at: null, request_status: null }]
	});

	// Roles: two applications for one Shop Steward seat in IDEA 100 (the
	// second refuses as full once the first is accepted), one with no class;
	// two holders with two weeks of evidence.
	appSeq = 0;
	applications.push(
		{
			id: `app-${++appSeq}`, email: 'quinn.patel@boscotech.net', role_id: 'shop_steward', section_id: CLASS_100, submitted_at: daysAgo(1), status: 'pending',
			answers: [
				{ question: 'Describe a time you kept a space safe or organized for other people.', type: 'written', options: null, written_answer: 'Relabeled the tool wall so it stayed sorted.', selected_option_index: null, is_correct: null },
				{ question: 'You see a classmate leave a table saw running unattended. What do you do first?', type: 'mc', options: ['Turn it off and find the instructor.', 'Leave it.', 'Wait.', 'Post about it later.'], written_answer: null, selected_option_index: 0, is_correct: true }
			]
		},
		{
			id: `app-${++appSeq}`, email: 'debt.student@boscotech.net', role_id: 'shop_steward', section_id: CLASS_100, submitted_at: daysAgo(0.5), status: 'pending',
			answers: [
				{ question: 'Describe a time you kept a space safe or organized for other people.', type: 'written', options: null, written_answer: 'Ran a cleanup checklist with my group.', selected_option_index: null, is_correct: null },
				{ question: 'You see a classmate leave a table saw running unattended. What do you do first?', type: 'mc', options: ['Turn it off and find the instructor.', 'Leave it.', 'Wait.', 'Post about it later.'], written_answer: null, selected_option_index: 2, is_correct: false }
			]
		},
		{ id: `app-${++appSeq}`, email: 'ada.alvarez@boscotech.net', role_id: 'lab_tech', section_id: null, submitted_at: daysAgo(2), status: 'pending', answers: [] }
	);
	holderSeq = 0;
	const evidenceFor = (key: string, pattern: number[]) => {
		const out: Holder['evidence'] = [];
		for (let i = 13; i >= 0; i--) {
			const day = isoDay(i);
			const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
			if (dow === 0 || dow === 6) continue;
			const kind = pattern[i % pattern.length];
			if (kind === 0) continue;
			const start = new Date(`${day}T15:30:00Z`); // 8:30 in Los Angeles
			const end = new Date(start.getTime() + (kind === 2 ? 20 : 70) * 60000);
			out.push({ day, path: `${HARNESS_USER_ID}/${key}-${day}-a.jpg`, taken_at: start.toISOString() });
			if (kind !== 3) out.push({ day, path: `${HARNESS_USER_ID}/${key}-${day}-b.jpg`, taken_at: end.toISOString() });
		}
		return out;
	};
	holders.push(
		{
			id: `holder-${++holderSeq}`, email: 'pass.student@boscotech.net', role_id: 'quartermaster', section_id: CLASS_209, since: daysAgo(30), expires_at: daysAgo(-60), revoked_at: null,
			rules: null, evidence: evidenceFor('qm', [1, 1, 2, 1, 0, 1, 3]), overrides: new Map([[isoDay(4), 'accepted']])
		},
		{
			id: `holder-${++holderSeq}`, email: 'healthy.student@boscotech.net', role_id: 'safety_officer', section_id: null, since: daysAgo(9), expires_at: null, revoked_at: null,
			rules: { min_gap_minutes: 30, photos_per_day: 2, window_start: '07:30', window_end: '15:30' }, evidence: evidenceFor('so', [1, 0, 1]), overrides: new Map()
		}
	);
}

// ---------------------------------------------------------------------------
// THE CLIENT
// ---------------------------------------------------------------------------

type Answer = { data: unknown; error: { message: string; code?: string } | null };

function ok(extra: Record<string, unknown> = {}): Answer {
	return { data: { ok: true, ...extra }, error: null };
}
function refused(reason: string, extra: Record<string, unknown> = {}): Answer {
	return { data: { ok: false, reason, ...extra }, error: null };
}
function rpcError(message: string): Answer {
	return { data: null, error: { message } };
}
function data(d: unknown): Answer {
	return { data: d, error: null };
}

/** A tiny placeholder picture for every signed link, so a thumbnail draws. */
function placeholderUrl(path: string): string {
	const hue = [...path].reduce((s, c) => s + c.charCodeAt(0), 0) % 360;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="hsl(${hue},35%,30%)"/><text x="80" y="52" font-size="14" text-anchor="middle" fill="#ddd">photo</text></svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createFakeLedger() {
	seed();
	return {
		auth: {
			getClaims: async () => ({ data: { claims: { sub: HARNESS_USER_ID } }, error: null })
		},
		rpc(fn: string, params: Record<string, unknown> = {}) {
			return Promise.resolve(handleRpc(fn, params));
		},
		storage: {
			from(_bucket: string) {
				return {
					createSignedUrl: async (path: string) => ({ data: { signedUrl: placeholderUrl(path) }, error: null }),
					createSignedUrls: async (paths: string[]) => ({
						data: paths.map((p) => ({ path: p, signedUrl: placeholderUrl(p), error: null })),
						error: null
					}),
					upload: async (path: string) => ({ data: { path }, error: null })
				};
			}
		},
		from(table: string) {
			if (table === 'profiles') return makeProfilesQuery();
			if (table === 'coin_categories') return makeCategoriesQuery();
			throw new Error(`fake ledger: unexpected table "${table}"`);
		}
	};
}

function handleRpc(fn: string, params: Record<string, unknown>): Answer | Promise<Answer> {
	if (V2_FUNCTIONS.has(fn) && !v2Applied) {
		return { data: null, error: { message: `Could not find the function public.${fn} in the schema cache`, code: 'PGRST202' } };
	}
	if ('p_medium' in params) {
		// 0251 dropped the parameter; a client that still sends it would miss
		// the function on the real database.
		return { data: null, error: { message: `Could not find the function public.${fn}(p_medium, ...) in the schema cache`, code: 'PGRST202' } };
	}
	const email = String(params.p_email ?? '').toLowerCase().trim();

	switch (fn) {
		// --- classes and rosters (0244) ---------------------------------------
		case 'coin_fine_sections':
			return data(
				HARNESS_CLASSES.map((c) => ({
					id: c.id,
					label: c.label,
					teacher_email: 'apina@boscotech.edu',
					in_session: false,
					students: [...enrollment.values()].filter((s) => s === c.id).length
				}))
			);
		case 'coin_fine_roster': {
			const sid = String(params.p_section_id ?? '');
			if (!HARNESS_CLASSES.some((c) => c.id === sid)) return rpcError('That class is not one of yours.');
			const students = [...enrollment.entries()]
				.filter(([, s]) => s === sid)
				.map(([e]) => ({
					email: e,
					display_name: studentName(e) === e ? null : studentName(e),
					balance: balanceOf(e),
					out_on_pass: false,
					no_shop: noShop.has(e),
					eating_pass: eatingPassActive(e)
				}))
				.sort((a, b) => (a.display_name ?? a.email).localeCompare(b.display_name ?? b.email));
			return data({ section_id: sid, label: sectionLabel(sid), students });
		}

		// --- one student (0249, 0250) ----------------------------------------
		case 'coin_admin_lookup': {
			if (!email.includes('@')) return rpcError('Enter a valid email.');
			const s = stateFor(email);
			return data({
				email,
				name: studentName(email),
				balance: balanceOf(email),
				wage_tier: s.wageTier,
				eating_pass_active: eatingPassActive(email),
				eating_pass_strikes: eatingPassStrikes(email),
				no_shop_today: noShop.has(email),
				spool_grams: spoolGrams.get(email) ?? 0,
				can_edit: harnessScope === 'full',
				recent_transactions: [...s.txns]
					.filter(listed)
					.sort((a, b) => b.created_at.localeCompare(a.created_at))
					.slice(0, 50)
					.map(historyRow)
			});
		}
		case 'coin_student_stats':
			return data(statsFor(email));
		case 'coin_export': {
			const scope = String(params.p_scope ?? '');
			let rows = allTxns();
			if (scope === 'student') rows = rows.filter((x) => x.email === email);
			else if (scope === 'class') rows = rows.filter((x) => enrollment.get(x.email) === params.p_section_id);
			else if (scope !== 'economy') return rpcError('Choose student, class or economy.');
			rows.sort((a, b) => a.t.created_at.localeCompare(b.t.created_at));
			return data({
				scope,
				exported_at: new Date().toISOString(),
				rows: rows.map(({ email: e, t }) => ({
					id: t.id,
					created_at: t.created_at,
					email: e,
					name: studentName(e),
					category_id: t.category_id,
					category: categoryName(t.category_id),
					kind: categoryKind(t.category_id),
					amount: t.amount,
					medium: t.medium,
					quantity: t.quantity,
					note: t.note,
					actor: t.actor_email,
					transfer_id: t.transfer_id,
					meta: t.meta
				}))
			});
		}
		case 'coin_edit_amount': {
			const found = findTxn(String(params.p_transaction_id ?? ''));
			const v = Number(params.p_new_amount);
			if (!Number.isFinite(v) || Math.abs(v) > 100000) return refused('amount');
			if (!found) return refused('not_found');
			const t = found.t;
			if (t.medium !== 'digital' || t.transfer_id || ['reversal', 'amount_correction', 'payout_hold'].includes(t.category_id)) return refused('not_editable');
			if (isReversed(t.id)) return refused('reversed');
			const now = effectiveAmount(t);
			if (now === money(v)) return ok({ changed: false, amount: now });
			const corr = insert(found.email, 'amount_correction', money(v) - now, null, (params.p_note as string | null)?.trim() || 'Amount edited.', { edits: t.id, old: now, new: money(v), original: t.amount });
			return ok({ changed: true, amount: money(v), correction_id: corr.id, balance: balanceOf(found.email) });
		}
		case 'coin_edit_undo': {
			const id = String(params.p_transaction_id ?? '');
			const corr = allTxns()
				.filter((x) => x.t.category_id === 'amount_correction' && x.t.meta.edits === id && !isReversed(x.t.id))
				.sort((a, b) => b.t.created_at.localeCompare(a.t.created_at) || b.t.id.localeCompare(a.t.id))[0];
			if (!corr) return refused('no_edit');
			insert(corr.email, 'reversal', -corr.t.amount, null, 'Edit undone.', { reverses: corr.t.id, reversed_category: 'amount_correction' });
			const orig = findTxn(id);
			return ok({ amount: orig ? effectiveAmount(orig.t) : null, balance: balanceOf(corr.email) });
		}
		case 'coin_record_spool': {
			const g = Number(params.p_grams ?? 1000);
			if (!email.includes('@')) return refused('email');
			if (!Number.isFinite(g) || g === 0 || Math.abs(g) > 10000) return refused('grams');
			const left = (spoolGrams.get(email) ?? 0) + g;
			if (left < 0) return refused('below_zero');
			spoolGrams.set(email, money(left));
			return ok({ grams_left: money(left) });
		}
		case 'coin_auditor_list':
			return data([...auditors.entries()].map(([e, at]) => ({ email: e, name: studentName(e), assigned_at: at, assigned_by: 'apina@boscotech.edu' })));
		case 'coin_auditor_set': {
			if (!email.includes('@') || typeof params.p_on !== 'boolean') return refused('invalid');
			if (params.p_on) auditors.set(email, new Date().toISOString());
			else auditors.delete(email);
			return ok({ email, auditor: auditors.has(email) });
		}

		// --- logging (0251's writers, no p_medium) ---------------------------
		case 'coin_log_transaction':
			return logTransaction(email, String(params.p_category_id ?? ''), params.p_amount, params.p_quantity, (params.p_note as string | null) ?? null);
		case 'coin_admin_adjust_balance':
			return logTransaction(email, 'balance_correction', params.p_amount, null, (params.p_note as string | null) ?? null);
		case 'coin_log_perfect_score': {
			const points = Number(params.p_points);
			if (!Number.isFinite(points) || points <= 0) return rpcError('Enter the number of points the graded work was worth.');
			const amount = Math.max(1, Math.round(points / 25));
			insert(email, 'perfect_score_graded_work', amount, points, (params.p_note as string | null) ?? null);
			return ok({ amount, balance: balanceOf(email) });
		}
		case 'coin_log_pay_raise': {
			const s = stateFor(email);
			const cost = Number(settings.pay_raise_cost_per_tier) * s.wageTier;
			const balance = balanceOf(email);
			if (balance - cost < 0) return refused('insufficient', { balance, cost });
			insert(email, 'pay_raise', -cost, null, (params.p_note as string | null) ?? null, { previous_tier: s.wageTier, new_tier: s.wageTier + 1 });
			s.wageTier += 1;
			return ok({ previous_tier: s.wageTier - 1, new_tier: s.wageTier, cost, balance: balanceOf(email) });
		}
		case 'coin_log_property_damage_careless': {
			const cost = Number(params.p_cost_dollars);
			const note = (params.p_note as string | null) ?? null;
			if (!Number.isFinite(cost) || cost < 0) return rpcError('Enter the repair or replacement cost in dollars (0 if none).');
			if (!note) return rpcError('Property Damage (Careless) needs a note describing the incident.');
			const base = Number(settings.property_damage_careless_base);
			const exchange = Math.round(cost / Number(settings.property_damage_dollars_per_coin));
			insert(email, 'property_damage_careless', -(base + exchange), cost, note);
			return ok({ amount: -(base + exchange), base, exchange, balance: balanceOf(email) });
		}
		case 'coin_log_three_d_printing': {
			if (!('p_hours' in params) || !('p_overnight' in params)) {
				return { data: null, error: { message: 'Could not find the function public.coin_log_three_d_printing without p_hours', code: 'PGRST202' } };
			}
			const grams = Number(params.p_grams);
			if (!Number.isFinite(grams) || grams < 0) return rpcError("Enter the slicer's reported weight in grams.");
			const amount = Math.round(grams / Number(settings.print_grams_per_coin));
			const balance = balanceOf(email);
			if (balance - amount < 0) return refused('insufficient', { balance, cost: amount });
			insert(email, 'three_d_printing', -amount, grams, (params.p_note as string | null) ?? null);
			return ok({ amount: -amount, balance: balanceOf(email) });
		}
		case 'coin_log_extra_credit': {
			const points = Number(params.p_points);
			if (!Number.isFinite(points) || points <= 0) return rpcError('Enter a positive number of extra credit points.');
			if (!['unit_labs', 'unit_assignments', 'documentation'].includes(String(params.p_grading_category ?? ''))) {
				return rpcError('Extra Credit only applies to Unit Labs, Unit Assignments, or Documentation checks.');
			}
			const s = stateFor(email);
			if (s.ecUsedPoints + points > 21) return refused('cap_exceeded', { cap_points: 21, used_points: s.ecUsedPoints, remaining_points: Math.max(21 - s.ecUsedPoints, 0) });
			const cost = Math.round(2 * points);
			const balance = balanceOf(email);
			if (balance - cost < 0) return refused('insufficient', { balance, cost });
			insert(email, 'extra_credit', -cost, points, (params.p_note as string | null) ?? null);
			s.ecUsedPoints += points;
			return ok({ points, cost, balance: balanceOf(email) });
		}
		case 'coin_bulk_log_students': {
			const cat = catById.get(String(params.p_category_id ?? ''));
			if (!cat) return rpcError('Unknown coin category.');
			if (!['flat', 'range', 'variable'].includes(cat.pricing_model) || cat.id === 'extra_credit') {
				return rpcError(`"${cat.name}" needs per-student input and cannot be bulk-logged.`);
			}
			const emails = [...new Set(((params.p_emails as string[]) ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))].sort();
			const results = emails.map((e) => {
				const r = logTransaction(e, cat.id, params.p_amount, null, (params.p_note as string | null) ?? null);
				const d = r.error ? { ok: false, reason: 'error', message: r.error.message } : (r.data as Record<string, unknown>);
				return { email: e, ...d } as Record<string, unknown> & { ok?: boolean };
			});
			const succeeded = results.filter((r) => r.ok).length;
			return ok({ category_id: cat.id, total: results.length, succeeded, refused: results.length - succeeded, results });
		}

		// --- undo, standing, cash (0240, 0244) -------------------------------
		case 'coin_reverse_transaction': {
			const found = findTxn(String(params.p_transaction_id ?? ''));
			if (!found) return refused('not_found');
			const t = found.t;
			if (t.category_id === 'reversal') return refused('is_reversal');
			if (t.medium === 'physical' || t.transfer_id) return refused('not_reversible');
			if (isReversed(t.id)) return refused('already_reversed');
			const rev = insert(found.email, 'reversal', -effectiveAmount(t), null, (params.p_note as string | null)?.trim() || 'Undo', { reverses: t.id, reversed_category: t.category_id });
			if (t.category_id === 'shop_safety_violation') noShop.delete(found.email);
			return ok({ transaction_id: rev.id, reverses: t.id, amount: rev.amount, balance: balanceOf(found.email) });
		}
		case 'coin_record_cash_purchase': {
			const balance = balanceOf(email);
			if (balance < 0) return refused('in_debt', { balance });
			const cat = catById.get(String(params.p_category_id ?? ''));
			if (!cat || cat.kind !== 'purchase' || cat.active === false || ['coin_payout', 'extra_credit'].includes(cat.id)) return refused('not_purchasable');
			const qty = params.p_quantity == null ? null : Number(params.p_quantity);
			let price: number;
			if (cat.id === 'pay_raise') price = Number(settings.pay_raise_cost_per_tier) * stateFor(email).wageTier;
			else if (cat.id === 'three_d_printing') {
				if (qty == null || !(qty > 0)) return refused('grams_required');
				price = Math.round(qty / Number(settings.print_grams_per_coin));
			} else if (cat.pricing_model === 'flat') price = Number(cat.amount ?? 0);
			else if (cat.pricing_model === 'per_unit') {
				if (qty == null || !(qty > 0)) return refused('quantity_required');
				price = money(Number(cat.amount ?? 0) * qty);
			} else if (cat.pricing_model === 'variable' || cat.pricing_model === 'range') {
				if (qty == null || !(qty > 0)) return refused('amount_required');
				price = money(qty);
			} else return refused('not_purchasable');
			if (cat.id === 'eating_pass' && eatingPassActive(email)) return refused('pass_already_active');
			const row = insert(email, cat.id, -price, qty, (params.p_note as string | null)?.trim() || 'Paid in physical coins.', { paid_in: 'physical_coins' }, 'physical');
			if (cat.id === 'pay_raise') stateFor(email).wageTier += 1;
			return ok({ transaction_id: row.id, price, balance: balanceOf(email) });
		}
		case 'coin_no_shop_set':
			if (!email.includes('@') || typeof params.p_on !== 'boolean') return refused('invalid');
			if (params.p_on) noShop.add(email);
			else noShop.delete(email);
			return ok({ email, no_shop: params.p_on });

		// --- autopay (0242) ---------------------------------------------------
		case 'coin_autopay_recent': {
			const rows = allTxns()
				.filter((x) => x.t.actor_email === 'system' && x.t.category_id !== 'reversal')
				.map(({ email: e, t }) => ({
					id: t.id, at: t.created_at, email: e, name: studentName(e), category_id: t.category_id,
					category: categoryName(t.category_id), amount: t.amount, note: t.note,
					run_id: (t.meta.autopay_run as number | undefined) ?? null, reversed: isReversed(t.id)
				}))
				.sort((a, b) => b.at.localeCompare(a.at));
			return data({ paused: settings.autopay_paused === true, runs: [...autopayRuns].reverse(), rows });
		}
		case 'coin_autopay_run': {
			if (settings.autopay_paused === true) return ok({ ran: false, reason: 'paused' });
			const id = autopayRuns.length + 1;
			let wages = 0;
			if (!wagesPaidThisWeek) {
				wagesPaidThisWeek = true;
				for (const e of ['healthy.student@boscotech.net', 'pass.student@boscotech.net', 'debt.student@boscotech.net']) {
					insert(e, 'weekly_wage', Math.max(1, stateFor(e).wageTier), null, 'Weekly wage, this week', { autopay_run: id }, 'digital', 'system');
					wages += 1;
				}
			}
			const at = new Date().toISOString();
			autopayRuns.push({ id, trigger: String(params.p_trigger ?? 'page'), started_at: at, finished_at: at, result: { wages, highest_grade: 0, perfect_score: 0 } });
			return ok({ ran: true, run_id: id, wages, highest_grade: 0, perfect_score: 0 });
		}

		// --- settings (0240, 0244, 0245) --------------------------------------
		case 'coin_settings_get':
			return data({
				settings: { ...settings },
				categories: Array.from(catById.values()).map((c, i) => ({
					id: c.id, name: c.name, kind: c.kind, pricing_model: c.pricing_model, amount: c.amount,
					min_amount: c.min_amount, max_amount: c.max_amount, unit_label: c.unit_label,
					cap_period: c.cap_period, cap_count: c.cap_count, loggable: !NON_LOGGABLE.has(c.id),
					active: c.active !== false, sort_order: i, explanation: explanations.get(c.id) ?? null
				})),
				sections: settingsSections.map((x) => ({ ...x })),
				audit: [...settingsAudit]
			});
		case 'coin_settings_set': {
			const key = String(params.p_key ?? '');
			if (!settingOk(key, params.p_value)) return refused('invalid', { key });
			const old = settings[key];
			if (JSON.stringify(old) === JSON.stringify(params.p_value)) return ok({ changed: false, key, value: params.p_value });
			settings[key] = params.p_value;
			audit(key, old, params.p_value);
			return ok({ changed: true, key, value: params.p_value });
		}
		case 'coin_settings_set_category':
			return setCategory(params);
		case 'coin_settings_set_section_economy': {
			const sec = settingsSections.find((x) => x.id === params.p_section_id);
			if (typeof params.p_on !== 'boolean') return refused('invalid');
			if (!sec) return refused('not_found');
			if (sec.economy_on !== params.p_on) {
				audit(`section_economy:${sec.id}`, sec.economy_on, params.p_on);
				sec.economy_on = params.p_on;
			}
			return ok({ section_id: sec.id, economy_on: sec.economy_on });
		}
		case 'coin_full_admin_list':
			return data({
				owner: 'apina@boscotech.edu',
				full_admins: fullAdmins.map((f) => ({ ...f, is_site_admin: siteAdmins.includes(f.email) })),
				site_admins: [...siteAdmins]
			});
		case 'coin_full_admin_set': {
			if (typeof params.p_on !== 'boolean' || !/^[^@\s]+@boscotech\.edu$/.test(email)) return refused('invalid');
			if (email === 'apina@boscotech.edu') return refused('owner');
			const at = fullAdmins.findIndex((f) => f.email === email);
			if (params.p_on && at < 0) fullAdmins.push({ email, added_by: 'apina@boscotech.edu', added_at: new Date().toISOString(), note: (params.p_note as string | null) ?? null });
			if (!params.p_on && at >= 0) fullAdmins.splice(at, 1);
			return ok({ email, full: params.p_on, is_site_admin: siteAdmins.includes(email) });
		}
		case 'coin_donation_items_list':
			return data([...donationItems].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
		case 'coin_donation_item_save': {
			const name = String(params.p_name ?? '').trim();
			if (!name || name.length > 120) return refused('name');
			const rate = params.p_rate == null ? null : Number(params.p_rate);
			if (rate !== null && (rate < 0 || rate > 1000)) return refused('rate');
			const photo = (params.p_photo_path as string | null) ?? null;
			if (params.p_id == null) {
				const item = { id: `d-${++donationSeq}`, name, rate, photo_path: photo, active: params.p_active !== false, sort_order: Number(params.p_sort_order ?? 0) };
				donationItems.push(item);
				return ok({ item });
			}
			const item = donationItems.find((x) => x.id === params.p_id);
			if (!item) return refused('not_found');
			Object.assign(item, { name, rate, photo_path: photo, active: params.p_active !== false, sort_order: Number(params.p_sort_order ?? item.sort_order) });
			return ok({ item });
		}

		// --- categories (0080) -------------------------------------------------
		case 'coin_admin_create_category':
			return createCategory(params);
		case 'coin_admin_set_category_active': {
			const id = String(params.p_id ?? '').toLowerCase().trim();
			const c = catById.get(id);
			if (!c) return rpcError(`Unknown coin category "${id}".`);
			catById.set(id, { ...c, active: params.p_active !== false });
			return ok({ id, active: params.p_active !== false });
		}

		// --- contracts (0077, 0248) --------------------------------------------
		case 'coin_contracts_admin':
			return data(
				[...contracts]
					.sort((a, b) => b.created_at.localeCompare(a.created_at))
					.map((c) => ({
						id: c.id, title: c.title, description: c.description, pay_type: c.pay_type,
						payout_amount: c.payout_amount, hourly_rate: c.hourly_rate, debt_only: c.debt_only,
						max_contractors: c.max_contractors, section_id: c.section_id, section: sectionLabel(c.section_id),
						created_at: c.created_at, completed_at: c.completed_at, cancelled_at: c.cancelled_at,
						cancel_reason: c.cancel_reason, status: contractStatus(c),
						claimants: c.claims.map((k) => ({ ...k, name: studentName(k.email) }))
					}))
			);
		case 'coin_contract_post': {
			const title = String(params.p_title ?? '').trim();
			const pay = String(params.p_pay_type ?? '');
			if (!title || title.length > 200) return refused('title');
			if (!['hourly', 'flat', 'quality'].includes(pay)) return refused('pay_type');
			const rate = params.p_hourly_rate == null ? null : Number(params.p_hourly_rate);
			const payout = params.p_payout_amount == null ? null : Number(params.p_payout_amount);
			if (pay === 'hourly' && (rate == null || rate <= 0 || rate > 1000)) return refused('hourly_rate');
			if (pay !== 'hourly' && (payout == null || payout <= 0)) return refused('payout');
			const max = Number(params.p_max_contractors);
			if (!Number.isInteger(max) || max < 1 || max > 50) return refused('max_contractors');
			const sid = (params.p_section_id as string | null) ?? null;
			if (sid && !settingsSections.some((s) => s.id === sid)) return refused('unknown_class');
			const id = `contract-${++contractSeq}`;
			contracts.push({
				id, title, description: ((params.p_description as string | null) ?? '').trim() || null,
				pay_type: pay as Contract['pay_type'], payout_amount: pay === 'hourly' ? (payout ?? 1) : payout,
				hourly_rate: pay === 'hourly' ? rate : null, debt_only: params.p_debt_only === true, max_contractors: max,
				section_id: sid, created_at: new Date().toISOString(), completed_at: null, cancelled_at: null, cancel_reason: null, claims: []
			});
			return ok({ id });
		}
		case 'coin_admin_cancel_contract': {
			const c = contracts.find((x) => x.id === params.p_contract_id);
			if (!c) return rpcError('Unknown contract.');
			if (c.completed_at) return rpcError('This contract was already completed and cannot be cancelled.');
			if (c.cancelled_at) return rpcError('This contract was already cancelled.');
			c.cancelled_at = new Date().toISOString();
			c.cancel_reason = ((params.p_reason as string | null) ?? '').trim() || null;
			return ok({ contract_id: c.id });
		}
		case 'coin_admin_reset_contract': {
			const c = contracts.find((x) => x.id === params.p_contract_id);
			if (!c) return rpcError('Unknown contract.');
			if (c.completed_at || c.cancelled_at) return rpcError('Cannot reset a contract that has already been completed or cancelled.');
			const cleared = c.claims.length;
			c.claims = [];
			return ok({ contract_id: c.id, cleared });
		}

		// --- roles (0076, 0247, 0251) ------------------------------------------
		case 'coin_roles_admin':
			return data({
				roles: ROLE_DEFS.map((r) => ({ ...r, instructions: (settings.role_instructions as Record<string, string>)[r.id] ?? null })),
				classes: HARNESS_CLASSES.map((c) => ({
					id: c.id,
					label: c.label,
					roles: ROLE_DEFS.map((r) => ({ role_id: r.id, ...roleCap(r.id, c.id), held: roleHeld(r.id, c.id) }))
				})),
				applications: applications
					.filter((a) => a.status === 'pending')
					.map((a) => ({
						id: a.id, email: a.email, name: studentName(a.email), role_id: a.role_id,
						role: ROLE_DEFS.find((r) => r.id === a.role_id)?.name ?? a.role_id,
						section_id: a.section_id, section: sectionLabel(a.section_id), submitted_at: a.submitted_at, answers: a.answers
					})),
				holders: holders.filter(holderActive).map((h) => ({
					id: h.id, email: h.email, name: studentName(h.email), role_id: h.role_id,
					role: ROLE_DEFS.find((r) => r.id === h.role_id)?.name ?? h.role_id,
					section_id: h.section_id, section: sectionLabel(h.section_id), since: h.since, expires_at: h.expires_at,
					rules: holderRules(h), days: roleDays(h)
				}))
			});
		case 'coin_role_class_set': {
			const rid = String(params.p_role_id ?? '');
			const sid = String(params.p_section_id ?? '');
			if (!ROLE_DEFS.some((r) => r.id === rid) || !HARNESS_CLASSES.some((c) => c.id === sid)) return refused('not_found');
			const cap = params.p_cap == null ? null : Number(params.p_cap);
			if (cap !== null && (cap < 0 || cap > 20)) return refused('cap');
			const cur = roleCap(rid, sid);
			roleClass.set(`${rid}:${sid}`, { cap: cap ?? cur.cap, enabled: typeof params.p_enabled === 'boolean' ? params.p_enabled : cur.enabled });
			return ok();
		}
		case 'coin_role_admin_review': {
			const a = applications.find((x) => x.id === params.p_application_id);
			if (!a) return rpcError('Unknown application.');
			if (a.status !== 'pending') return rpcError(`This application was already ${a.status}.`);
			if (params.p_decision === 'reject') {
				a.status = 'rejected';
				return ok({ status: 'rejected', application_id: a.id });
			}
			if (!a.section_id) return refused('no_class');
			const { cap } = roleCap(a.role_id, a.section_id);
			const held = roleHeld(a.role_id, a.section_id);
			if (held >= cap) return refused('ratio_cap_reached', { role_id: a.role_id, section_id: a.section_id, cap, held });
			if (holders.some((h) => holderActive(h) && h.email === a.email && h.role_id === a.role_id)) return refused('already_holds_role');
			const id = `holder-${++holderSeq}`;
			holders.push({ id, email: a.email, role_id: a.role_id, section_id: a.section_id, since: new Date().toISOString(), expires_at: (params.p_expires_at as string | null) ?? null, revoked_at: null, rules: null, evidence: [], overrides: new Map() });
			a.status = 'approved';
			return ok({ status: 'approved', application_id: a.id, holder_id: id });
		}
		case 'coin_role_set_class': {
			const sid = String(params.p_section_id ?? '');
			if (!HARNESS_CLASSES.some((c) => c.id === sid)) return refused('unknown_class');
			const h = holders.find((x) => x.id === params.p_holder_id);
			if (h) h.section_id = sid;
			const a = applications.find((x) => x.id === params.p_application_id);
			if (a) a.section_id = sid;
			return ok();
		}
		case 'coin_role_day_set': {
			const h = holders.find((x) => x.id === params.p_holder_id);
			const day = String(params.p_day ?? '');
			if (!h || !day) return refused('not_found');
			if (params.p_verdict == null) h.overrides.delete(day);
			else if (params.p_verdict === 'accepted' || params.p_verdict === 'rejected') h.overrides.set(day, params.p_verdict);
			else return refused('invalid');
			return ok({ status: roleDay(h, day) });
		}
		case 'coin_role_holder_rules_set': {
			const h = holders.find((x) => x.id === params.p_holder_id);
			if (!h) return refused('not_found');
			const r = (params.p_rules ?? {}) as Record<string, unknown>;
			if (!Object.keys(r).length) {
				h.rules = null;
				return ok({ rules: holderRules(h) });
			}
			const okKeys = Object.entries(r).every(([k, v]) => {
				if (k === 'min_gap_minutes') return settingOk('role_min_gap_minutes', v);
				if (k === 'photos_per_day') return settingOk('role_photos_per_day', v);
				if (k === 'window_start') return settingOk('role_window_start', v);
				if (k === 'window_end') return settingOk('role_window_end', v);
				return false;
			});
			if (!okKeys) return refused('invalid');
			h.rules = { ...r };
			return ok({ rules: holderRules(h) });
		}
		case 'coin_role_admin_revoke': {
			const h = holders.find((x) => x.id === params.p_holder_id);
			if (!h) return rpcError('Unknown role holder.');
			if (h.revoked_at) return rpcError('This role was already revoked.');
			h.revoked_at = new Date().toISOString();
			return ok({ holder_id: h.id });
		}
		case 'coin_role_admin_set_expiration': {
			const h = holders.find((x) => x.id === params.p_holder_id);
			if (!h) return rpcError('Unknown role holder.');
			h.expires_at = (params.p_expires_at as string | null) ?? null;
			return ok({ holder_id: h.id, expires_at: h.expires_at });
		}
		case 'coin_role_admin_list_role_questions':
			return data(SAMPLE_ROLE_QUESTIONS.filter((q) => q.role_id === params.p_role_id).sort((a, b) => a.sequence - b.sequence));
		case 'coin_role_apply': {
			const target = String(params.p_student_email ?? '').toLowerCase().trim();
			const rid = String(params.p_role_id ?? '');
			if (!ROLE_DEFS.some((r) => r.id === rid)) return refused('unknown_role');
			const sid = enrollment.get(target);
			if (!sid) return refused('no_section');
			const qs = SAMPLE_ROLE_QUESTIONS.filter((q) => q.role_id === rid);
			const given = (params.p_answers as { question_id: string; written_answer?: string; selected_option_index?: number }[]) ?? [];
			const answers: Application['answers'] = [];
			for (const q of qs) {
				const a = given.find((x) => x.question_id === q.id);
				if (q.type === 'written') {
					if (!a?.written_answer?.trim()) return rpcError(`Missing an answer for "${q.question_text}".`);
					answers.push({ question: q.question_text, type: 'written', options: null, written_answer: a.written_answer.trim(), selected_option_index: null, is_correct: null });
				} else {
					if (a?.selected_option_index == null) return rpcError(`Missing an answer for "${q.question_text}".`);
					answers.push({ question: q.question_text, type: 'mc', options: q.options, written_answer: null, selected_option_index: a.selected_option_index, is_correct: a.selected_option_index === q.correct_option_index });
				}
			}
			const id = `app-${++appSeq}`;
			applications.push({ id, email: target, role_id: rid, section_id: sid, submitted_at: new Date().toISOString(), status: 'pending', answers });
			return ok({ application_id: id });
		}
		case 'coin_role_stipend_manual': {
			if (!String(params.p_note ?? '').trim()) return refused('note_required');
			const targets = [...new Set(holders.filter((h) => holderActive(h) && (!params.p_role_id || h.role_id === params.p_role_id) && (!params.p_section_id || h.section_id === params.p_section_id)).map((h) => h.email))].sort();
			const results = targets.map((e) => {
				const r = logTransaction(e, 'weekly_role_stipend', null, null, String(params.p_note));
				return { email: e, ...(r.data as Record<string, unknown>) } as Record<string, unknown> & { ok?: boolean };
			});
			const succeeded = results.filter((r) => r.ok).length;
			return ok({ total: results.length, succeeded, refused: results.length - succeeded, results });
		}
	}
	return rpcError(`fake ledger: unhandled rpc "${fn}"`);
}

function logTransaction(email: string, categoryId: string, rawAmount: unknown, rawQuantity: unknown, note: string | null): Answer {
	const cat = catById.get(categoryId);
	if (!cat) return rpcError(`Unknown coin category "${categoryId}".`);
	if (cat.active === false || NON_LOGGABLE.has(categoryId)) return rpcError(`"${cat.name}" cannot be logged directly.`);
	if (cat.pricing_model === 'formula' || categoryId === 'extra_credit') return rpcError(`"${cat.name}" needs its dedicated logging function.`);
	if (!email.includes('@')) return rpcError('Enter a valid student email.');
	const s = stateFor(email);
	let magnitude: number;
	let signed: number | undefined;
	if (cat.pricing_model === 'flat') {
		magnitude = Number(cat.amount ?? 0) * (cat.id === 'weekly_wage' ? Math.max(1, s.wageTier) : 1);
	} else if (cat.pricing_model === 'range') {
		const v = Number(rawAmount);
		if (!Number.isFinite(v) || v < Number(cat.min_amount ?? 0) || v > Number(cat.max_amount ?? 0)) {
			return rpcError(`"${cat.name}" must be between ${cat.min_amount}${COIN_SYMBOL} and ${cat.max_amount}${COIN_SYMBOL}.`);
		}
		magnitude = v;
	} else if (cat.pricing_model === 'per_unit') {
		const q = Number(rawQuantity);
		if (!Number.isFinite(q) || q <= 0) return rpcError(`"${cat.name}" needs a positive quantity.`);
		magnitude = money(Number(cat.amount ?? 0) * q);
	} else {
		const v = Number(rawAmount);
		if (cat.kind === 'adjustment') {
			if (!Number.isFinite(v) || v === 0) return rpcError('A balance adjustment needs a non-zero amount.');
			if (!note) return rpcError('A balance adjustment needs a note explaining why.');
			signed = v;
			magnitude = Math.abs(v);
		} else {
			if (!Number.isFinite(v) || v <= 0) return rpcError(`"${cat.name}" needs a positive amount.`);
			if (!note) return rpcError(`"${cat.name}" needs a note.`);
			magnitude = v;
		}
	}
	if (signed === undefined) signed = cat.kind === 'fine' || cat.kind === 'purchase' ? -magnitude : magnitude;
	signed = money(signed);
	if (capReached(email, cat)) return refused('cap_reached', { cap_period: cat.cap_period });
	const balance = balanceOf(email);
	if (cat.kind === 'purchase' && balance + signed < 0) return refused('insufficient', { balance, cost: -signed });
	let strike = false;
	const meta: Record<string, unknown> = {};
	if (categoryId === 'eating_pass' && eatingPassActive(email)) return refused('pass_already_active');
	if (categoryId === 'eating_violation') {
		strike = eatingPassActive(email);
		meta.strike = strike;
	}
	const row = insert(email, categoryId, signed, rawQuantity == null ? null : Number(rawQuantity), note, meta);
	if (categoryId === 'shop_safety_violation') noShop.add(email);
	if (strike && eatingPassStrikes(email) >= 3) insert(email, 'eating_pass_revoked', 0, null, 'Automatically revoked: third eating-pass violation since this pass was purchased.');
	return ok({ transaction_id: row.id, category_id: categoryId, amount: signed, strike, balance: balanceOf(email) });
}

/** 0249's _coin_stats over the effective rows, plus 0249's email, name and background. */
function statsFor(email: string) {
	const rows = stateFor(email)
		.txns.filter((t) => t.medium === 'digital' && t.category_id !== 'amount_correction')
		.filter((t) => !(t.category_id === 'reversal'))
		.map((t) => ({ t, amount: effectiveAmount(t), reversed: isReversed(t.id) }))
		.sort((a, b) => a.t.created_at.localeCompare(b.t.created_at));
	const byDay = new Map<string, number>();
	for (const r of rows) {
		const day = r.t.created_at.slice(0, 10);
		byDay.set(day, (byDay.get(day) ?? 0) + r.amount);
	}
	let running = 0;
	const series = [...byDay.entries()].sort().map(([day, net]) => ({ day, balance: money((running += net)) }));
	const weekStart = (iso: string) => {
		const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
		return d.toISOString().slice(0, 10);
	};
	const weeks = new Map<string, { earned: number; spent: number }>();
	for (const r of rows) {
		if (r.amount === 0 || Date.now() - new Date(r.t.created_at).getTime() > 84 * 86400000) continue;
		const w = weekStart(r.t.created_at);
		const cur = weeks.get(w) ?? { earned: 0, spent: 0 };
		if (r.amount > 0) cur.earned += r.amount;
		else cur.spent -= r.amount;
		weeks.set(w, cur);
	}
	const cats = new Map<string, { total: number; count: number }>();
	for (const r of rows) {
		const cur = cats.get(r.t.category_id) ?? { total: 0, count: 0 };
		cur.total += r.amount;
		if (!r.reversed) cur.count += 1;
		cats.set(r.t.category_id, cur);
	}
	return {
		email,
		name: studentName(email),
		balance: balanceOf(email),
		series,
		weeks: [...weeks.entries()].sort().map(([week_start, w]) => ({ week_start, earned: money(w.earned), spent: money(w.spent) })),
		categories: [...cats.entries()].map(([category_id, c]) => ({ category_id, name: categoryName(category_id), kind: categoryKind(category_id), total: money(c.total), count: c.count })),
		events: rows
			.filter((r) => !r.reversed && ['fine', 'award', 'purchase'].includes(categoryKind(r.t.category_id)))
			.reverse()
			.map((r) => ({
				id: r.t.id, at: r.t.created_at, category_id: r.t.category_id, name: categoryName(r.t.category_id),
				kind: categoryKind(r.t.category_id), amount: r.amount, original_amount: r.t.amount,
				edited: r.amount !== r.t.amount, reversed: false
			})),
		background:
			email === 'healthy.student@boscotech.net'
				? { request_id: 'bg-1', photo_path: `${HARNESS_USER_ID}/background.png`, approved_at: daysAgo(4), width: 1920, height: 1080 }
				: null
	};
}

function setCategory(params: Record<string, unknown>): Answer {
	const id = String(params.p_id ?? '');
	const cat = catById.get(id);
	if (!cat) return refused('not_found');
	const n = (k: string) => (params[k] == null ? null : Number(params[k]));
	if ([n('p_amount'), n('p_min_amount'), n('p_max_amount')].some((v) => v != null && v < 0)) return refused('negative');
	const name = params.p_name == null ? null : String(params.p_name).trim();
	if (name !== null && (name.length < 1 || name.length > 120)) return refused('name');
	const explanation = params.p_explanation == null ? null : String(params.p_explanation);
	if (explanation !== null && explanation.length > 1500) return refused('explanation_too_long');
	const before = { ...cat, explanation: explanations.get(id) ?? null };
	const next: CoinCategory = { ...cat };
	if (name) next.name = name;
	if (['flat', 'per_unit'].includes(cat.pricing_model) && n('p_amount') != null) next.amount = money(n('p_amount')!);
	if (cat.pricing_model === 'range') {
		if (n('p_min_amount') != null) next.min_amount = money(n('p_min_amount')!);
		if (n('p_max_amount') != null) next.max_amount = money(n('p_max_amount')!);
		if (Number(next.min_amount) > Number(next.max_amount)) return refused('shape');
	}
	if (params.p_cap_period === 'none') {
		next.cap_period = null;
		next.cap_count = null;
	} else if (params.p_cap_period === 'day' || params.p_cap_period === 'month') {
		next.cap_period = params.p_cap_period;
		if (params.p_cap_count != null) next.cap_count = Number(params.p_cap_count);
		if (!next.cap_count) return refused('shape');
	}
	if (typeof params.p_active === 'boolean') next.active = params.p_active;
	catById.set(id, next);
	if (explanation !== null) {
		if (explanation.trim()) explanations.set(id, explanation.trim());
		else explanations.delete(id);
	}
	const after = { ...next, explanation: explanations.get(id) ?? null };
	if (JSON.stringify(before) !== JSON.stringify(after)) audit(`category:${id}`, before, after);
	return ok({ category: after });
}

function createCategory(params: Record<string, unknown>): Answer {
	const id = String(params.p_id ?? '').toLowerCase().trim();
	const name = String(params.p_name ?? '').trim();
	const kind = params.p_kind as CoinCategory['kind'];
	const pricing = String(params.p_pricing_model ?? '');
	if (!id || !/^[a-z0-9_]+$/.test(id)) return rpcError('Category id must be lowercase letters, numbers, and underscores only.');
	if (!name) return rpcError('Enter a category name.');
	if (!['fine', 'award', 'purchase', 'adjustment'].includes(kind)) return rpcError('Kind must be fine, award, purchase, or adjustment.');
	if (pricing === 'formula') return rpcError("Formula categories need custom logic and can't be created here.");
	if (!['flat', 'range', 'per_unit', 'variable'].includes(pricing)) return rpcError('Pricing model must be flat, range, per_unit, or variable.');
	if (catById.has(id)) return rpcError(`A category with id "${id}" already exists.`);
	let amount: number | null = null;
	let min: number | null = null;
	let max: number | null = null;
	let unit: string | null = null;
	if (pricing === 'flat' || pricing === 'per_unit') {
		amount = Number(params.p_amount);
		if (!Number.isFinite(amount) || amount < 0) return rpcError('A flat or per-unit category needs a non-negative amount.');
		if (pricing === 'per_unit') {
			unit = (params.p_unit_label as string | null)?.trim() || null;
			if (!unit) return rpcError('A per-unit category needs a unit label.');
		}
	} else if (pricing === 'range') {
		min = Number(params.p_min_amount);
		max = Number(params.p_max_amount);
		if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return rpcError('A range category needs a min and max amount, with min <= max.');
	}
	catById.set(id, {
		id, name, kind, scope: params.p_scope as CoinCategory['scope'], pricing_model: pricing as CoinCategory['pricing_model'],
		amount, min_amount: min, max_amount: max, unit_label: unit, formula_key: null, semester_point_cap: null,
		cap_period: null, cap_count: null, notes: (params.p_notes as string | null)?.trim() || null, active: true
	});
	return ok({ id });
}

/** The typeahead's `profiles` read: `.eq().or().order().limit()`. */
function makeProfilesQuery() {
	let term = '';
	let limitN: number | null = null;
	const compute = () => {
		let rows = SAMPLE_STUDENTS.slice();
		if (term) {
			rows = rows.filter((r) => [r.email, r.full_name ?? '', r.display_name ?? ''].some((x) => x.toLowerCase().includes(term)));
		}
		if (limitN !== null) rows = rows.slice(0, limitN);
		return { data: rows, error: null };
	};
	const builder = {
		select: () => builder,
		eq: () => builder,
		in: () => builder,
		order: () => builder,
		or(expr: string) {
			term = (expr.match(/ilike\.%(.*?)%/)?.[1] ?? '').toLowerCase();
			return builder;
		},
		limit(n: number) {
			limitN = n;
			return Promise.resolve(compute());
		},
		then<A = unknown, B = never>(f?: ((v: ReturnType<typeof compute>) => A | PromiseLike<A>) | null, r?: ((e: unknown) => B | PromiseLike<B>) | null) {
			return Promise.resolve(compute()).then(f, r);
		}
	};
	return builder;
}

/** CategoriesManager's refresh read: the live map. */
function makeCategoriesQuery() {
	const builder = {
		select: () => builder,
		eq: () => builder,
		order: () => builder,
		then<A = unknown, B = never>(f?: ((v: { data: CoinCategory[]; error: null }) => A | PromiseLike<A>) | null, r?: ((e: unknown) => B | PromiseLike<B>) | null) {
			return Promise.resolve({ data: Array.from(catById.values()), error: null as null }).then(f, r);
		}
	};
	return builder;
}
