import type { CoinCategory, StudentSuggestion } from '$lib/coin-desk';
import type { CoinSectionRow, CoinSectionStudentRow } from '$lib/coin-desk/sections';

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

interface Txn {
	id: string;
	category_id: string;
	category_name: string;
	amount: number;
	quantity: number | null;
	note: string | null;
	actor_email: string;
	created_at: string;
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
	{ id: 'mint_tampering_unknown', name: 'Mint Tampering (Suspect Unknown)' }
];
const catById = new Map(SAMPLE_CATEGORIES.map((c) => [c.id, c]));
const nameById = new Map([...SAMPLE_CATEGORIES, ...NAME_ONLY_CATEGORIES].map((c) => [c.id, c.name]));
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

function sectionStudentCount(id: string): number {
	let n = 0;
	for (const sid of sectionStudents.values()) if (sid === id) n++;
	return n;
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
		category_name: nameById.get(categoryId) ?? categoryId,
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

export function createFakeLedger() {
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

	return {
		auth: { getClaims: async () => ({ data: { claims: null }, error: null }) },
		rpc(fn: string, params: Record<string, unknown> = {}) {
			return handleRpc(fn, params);
		},
		from(table: string) {
			if (table !== 'profiles') throw new Error(`fake ledger: unexpected table "${table}"`);
			return makeProfilesQuery();
		}
	};
}

async function handleRpc(fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
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
		if (cat.pricing_model === 'formula' || categoryId === 'extra_credit') {
			return Promise.resolve(rpcError(`"${cat.name}" needs its dedicated logging function.`));
		}
		const s = stateFor(email);
		const note = (params.p_note as string | null) ?? null;
		let magnitude: number;
		let signed: number | undefined;
		if (cat.pricing_model === 'flat') {
			magnitude = cat.amount ?? 0;
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

	return Promise.resolve(rpcError(`fake ledger: unhandled rpc "${fn}"`));
}

function makeProfilesQuery() {
	let eqRole: string | null = null;
	let orExpr: string | null = null;
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
		order(_col: string, _opts?: unknown) {
			return builder;
		},
		limit(n: number) {
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
			return Promise.resolve({ data: rows.slice(0, n), error: null });
		}
	};
	return builder;
}
