/**
 * IDEA COIN V2 ON THE COIN DESK: plain types and pure helpers (client-safe,
 * the coin-desk.ts convention), plus the ONE wrapper every V2 call goes
 * through so a missing function degrades in one place.
 *
 * WHAT V2 CHANGED FOR THE DESK (migrations 0239-0243):
 *   - ONE BALANCE, AND IT IS DIGITAL. Physical rows stay in a student's
 *     history and no longer count toward anything. Nothing here shows a
 *     physical figure, a digital figure, or debt as its own number: a
 *     negative balance IS the debt.
 *   - Amounts are numeric(12,2), so every figure goes through coin-format's
 *     `coins` / `signedCoins` / `coinNumber`.
 *   - Undo posts a `reversal` row (coin_reverse_transaction). A reversed row
 *     and the reversal that cancels it collapse into one line in a history.
 *   - Settings, the debt list, autopay and coin-paid purchases are new RPCs,
 *     each of which may not exist yet on a database the migrations have not
 *     reached. `callV2` answers `missing` for that case and every surface
 *     says V2_UNAVAILABLE rather than showing an error.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { coins, coinNumber } from '$lib/coin-format';

// ---------------------------------------------------------------------------
// 1. A V2 CALL, AND THE ONE ANSWER FOR "THE FUNCTION IS NOT THERE YET"
// ---------------------------------------------------------------------------

export const V2_UNAVAILABLE = 'Not available until the database update lands.';

export interface RpcErrorLike {
	code?: string | null;
	message?: string | null;
}

/**
 * PGRST202 is PostgREST's "no function with that name and these arguments";
 * 42883 is Postgres's own "function does not exist", which a nested call
 * inside an older function raises. Matched on the code first, the message
 * only as the fallback a proxy that drops the code still leaves behind.
 */
export function isMissingFunction(err: RpcErrorLike | null | undefined): boolean {
	if (!err) return false;
	const code = String(err.code ?? '');
	if (code === 'PGRST202' || code === '42883') return true;
	const msg = String(err.message ?? '');
	return /function .* does not exist/i.test(msg) || /could not find the function/i.test(msg);
}

export type V2Result<T> =
	| { kind: 'ok'; data: T }
	| { kind: 'missing' }
	| { kind: 'error'; message: string };

/**
 * Every V2 RPC the desk makes goes through here. A thrown error (a network
 * drop) is an `error` with its message, never a crash of the surface.
 */
export async function callV2<T>(
	supabase: SupabaseClient,
	fn: string,
	params: Record<string, unknown> = {}
): Promise<V2Result<T>> {
	try {
		const resp = await supabase.rpc(fn, params);
		if (resp.error) {
			if (isMissingFunction(resp.error)) return { kind: 'missing' };
			return { kind: 'error', message: resp.error.message };
		}
		return { kind: 'ok', data: resp.data as T };
	} catch (e) {
		return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
	}
}

/** Coerces a numeric that PostgREST or pg may hand back as a string. */
export function num(v: number | string | null | undefined): number {
	const n = typeof v === 'string' ? Number(v) : (v ?? 0);
	return Number.isFinite(n) ? n : 0;
}

/** Two decimals, half up, the way numeric(12,2) stores an amount. */
export function cents(v: number): number {
	return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// 2. A STUDENT'S HISTORY, WITH UNDO
// ---------------------------------------------------------------------------

/** One row of `coin_admin_lookup().recent_transactions`, V2 shape. */
export interface DeskTxn {
	id: string;
	category_id: string;
	category_name: string;
	amount: number | string;
	/** 'physical' rows are history and do not count. Absent reads as digital. */
	medium?: string | null;
	transfer_id?: string | null;
	quantity?: number | string | null;
	note?: string | null;
	actor_email?: string | null;
	created_at: string;
	/** Set on a `reversal` row: the id of the row it cancels. */
	reverses?: string | null;
	/** True when a reversal row cancels this one. */
	reversed?: boolean | null;
}

export interface DeskHistoryRow extends DeskTxn {
	/** This row was undone. Its reversal row is folded into it. */
	undone: boolean;
	/** The reversal row that undid it, when that row is in the same list. */
	undoneBy: DeskTxn | null;
	/** False for a physical row: history only, it moved no balance. */
	counted: boolean;
	/** One half of a payout transfer. */
	isPayout: boolean;
}

export const REVERSAL_CATEGORY_ID = 'reversal';

/**
 * Whether the desk offers Undo on a row, mirroring the refusals of
 * `_coin_reverse` (0240) so no control is offered whose only answer is a
 * refusal: a digital row, not part of a payout transfer, not itself an undo,
 * and not already undone. The server still decides.
 */
export function isUndoable(t: DeskTxn): boolean {
	if (t.category_id === REVERSAL_CATEGORY_ID || t.reverses) return false;
	if (t.reversed) return false;
	if (t.transfer_id) return false;
	return (t.medium ?? 'digital') !== 'physical';
}

/**
 * THE HISTORY AS THE DESK SHOWS IT.
 *
 *   - A reversal row whose original is in the list is dropped, and the
 *     original is marked undone: one line for the pair, not two figures that
 *     cancel. A reversal whose original is older than the list is kept as
 *     its own row, so no movement of the balance is ever hidden.
 *   - A payout's physical credit is dropped when its digital debit is in the
 *     list: the debit is the half that moved the balance.
 */
export function deskHistoryRows(txns: DeskTxn[]): DeskHistoryRow[] {
	const ids = new Set(txns.map((t) => t.id));
	const reversalOf = new Map<string, DeskTxn>();
	for (const t of txns) {
		if (t.reverses && ids.has(String(t.reverses))) reversalOf.set(String(t.reverses), t);
	}
	const digitalTransfers = new Set(
		txns
			.filter((t) => t.transfer_id && (t.medium ?? 'digital') !== 'physical')
			.map((t) => String(t.transfer_id))
	);
	const out: DeskHistoryRow[] = [];
	for (const t of txns) {
		if (t.reverses && ids.has(String(t.reverses))) continue;
		const physical = (t.medium ?? 'digital') === 'physical';
		if (t.transfer_id && physical && digitalTransfers.has(String(t.transfer_id))) continue;
		const by = reversalOf.get(t.id) ?? null;
		out.push({
			...t,
			undone: !!t.reversed || !!by,
			undoneBy: by,
			counted: !physical,
			isPayout: !!t.transfer_id
		});
	}
	return out;
}

export function reverseRefusal(reason: string | undefined): string {
	switch (reason) {
		case 'not_found':
			return 'That row is not in the ledger any more.';
		case 'is_reversal':
			return 'That row is itself an undo, so it cannot be undone.';
		case 'not_reversible':
			return 'Only a row that moved the balance, and is not part of a payout, can be undone.';
		case 'already_reversed':
			return 'That row was already undone.';
		default:
			return reason ? `Refused: ${reason}.` : 'Refused by the server.';
	}
}

/** Undo one row. Answers a sentence for the person, or null on success. */
export async function reverseTransaction(
	supabase: SupabaseClient,
	id: string,
	note: string | null = null
): Promise<{ ok: true } | { ok: false; message: string }> {
	const r = await callV2<{ ok: boolean; reason?: string }>(supabase, 'coin_reverse_transaction', {
		p_transaction_id: id,
		p_note: note
	});
	if (r.kind === 'missing') return { ok: false, message: V2_UNAVAILABLE };
	if (r.kind === 'error') return { ok: false, message: r.message };
	if (!r.data?.ok) return { ok: false, message: reverseRefusal(r.data?.reason) };
	return { ok: true };
}

// ---------------------------------------------------------------------------
// 3. REFUSALS FROM THE LOGGERS, IN WORDS
// ---------------------------------------------------------------------------

export interface CoinRefusal {
	reason?: string;
	balance?: number | string;
	cost?: number | string;
	cap_period?: string;
	used_points?: number;
	cap_points?: number;
	remaining_points?: number;
	message?: string;
	[k: string]: unknown;
}

export function coinRefusalWords(r: CoinRefusal): string {
	switch (r.reason) {
		case 'insufficient':
			return `Refused: this costs ${coins(num(r.cost))} and the balance is ${coins(num(r.balance))}. A purchase may not take a balance below zero.`;
		case 'debt':
			return `Refused: the balance is negative (${coins(num(r.balance))}), so purchases are locked until it clears.`;
		case 'cap_reached':
			return `Refused: already logged the most allowed this ${r.cap_period === 'day' ? 'day' : 'calendar month'}.`;
		case 'pass_already_active':
			return 'Refused: this student already holds an Eating Pass.';
		case 'cap_exceeded':
			return `Refused: the Extra Credit cap is reached (${r.used_points} of ${r.cap_points} points used this semester, ${r.remaining_points} left).`;
		case 'below_minimum':
			return `Refused: a deposit is at least ${coins(num(r.minimum as number | string | undefined))}. Nothing was recorded.`;
		case 'deposit_amount':
			return 'Refused: a deposit is a whole number of coins.';
		case 'error':
			return r.message ? `Error: ${r.message}` : 'Something went wrong on the server.';
		default:
			return r.reason ? `Refused: ${r.reason}.` : 'Refused by the server.';
	}
}

/** `coin_record_cash_purchase` refusals. */
export function cashPurchaseRefusal(r: CoinRefusal): string {
	switch (r.reason) {
		case 'in_debt':
			return `Refused: the balance is ${coins(num(r.balance))}. Physical coins pay down a debt first, so log them as a debt payment instead.`;
		case 'not_purchasable':
			return 'That category cannot be recorded as a purchase paid in coins.';
		case 'grams_required':
			return 'Enter the weight in grams.';
		case 'quantity_required':
			return 'Enter how many.';
		case 'amount_required':
			return 'Enter the price in coins.';
		case 'pass_already_active':
			return 'This student already holds an Eating Pass.';
		default:
			return coinRefusalWords(r);
	}
}

/** Categories a coin-paid purchase can never be recorded under (0240's own refusal list). */
export const NOT_CASH_PURCHASABLE = new Set(['coin_payout', 'extra_credit', 'payout_physical_credit']);

/**
 * Categories the Log picker never offers, whatever the load returned. Since
 * 0239 `coin_payout` is not loggable (the payout transfer on Economy is the
 * only way to pay out), `reversal` is posted by Undo only, and the physical
 * half of a payout was never a thing a person logs. The server refuses all
 * three; this keeps a database that has not taken 0239 yet from offering one.
 */
export const NEVER_IN_LOG_PICKER = new Set(['coin_payout', 'reversal', 'payout_physical_credit']);

// ---------------------------------------------------------------------------
// 4. SETTINGS (0240's coin_settings_get / _set / _set_category / _set_section_economy)
// ---------------------------------------------------------------------------

export interface Semester {
	key: string;
	start: string;
	end: string;
}

export interface CoinSettingsValues {
	autopay_paused: boolean;
	autopay_start: string;
	highest_grade_weeks: number;
	highest_grade_anchor: string;
	semesters: Semester[];
	no_pay_weeks: string[];
	no_pay_after: string;
	hall_pass_warn_minutes: number;
	hall_pass_fine_minutes: number;
	fine_buttons: string[];
	extra_credit_cap_percent: number;
	pay_raise_cost_per_tier: number;
	print_grams_per_coin: number;
	property_damage_careless_base: number;
	property_damage_dollars_per_coin: number;
	student_actions_per_minute: number;
}

export type CoinSettingKey = keyof CoinSettingsValues;

export interface SettingsCategory {
	id: string;
	name: string;
	kind: 'fine' | 'award' | 'purchase' | 'adjustment';
	pricing_model: 'flat' | 'range' | 'per_unit' | 'variable' | 'formula';
	amount: number | string | null;
	min_amount: number | string | null;
	max_amount: number | string | null;
	unit_label: string | null;
	cap_period: 'day' | 'month' | null;
	cap_count: number | null;
	loggable: boolean;
	active: boolean;
	sort_order: number;
	explanation: string | null;
}

export interface SettingsSection {
	id: string;
	label: string;
	teacher_email: string | null;
	economy_on: boolean;
	auto_checkin_minutes: number | null;
}

export interface SettingsAudit {
	key: string;
	old_value: unknown;
	new_value: unknown;
	changed_by: string;
	changed_at: string;
}

export interface CoinSettingsPayload {
	settings: Partial<CoinSettingsValues> & Record<string, unknown>;
	categories: SettingsCategory[];
	sections: SettingsSection[];
	audit: SettingsAudit[];
}

/** 0239's seeded defaults, used only to fill a key a database has not seeded. */
export const SETTING_DEFAULTS: CoinSettingsValues = {
	autopay_paused: false,
	autopay_start: '2026-10-12',
	highest_grade_weeks: 2,
	highest_grade_anchor: '2026-10-12',
	semesters: [],
	no_pay_weeks: [],
	no_pay_after: '2027-06-04',
	hall_pass_warn_minutes: 10,
	hall_pass_fine_minutes: 20,
	fine_buttons: [],
	extra_credit_cap_percent: 2,
	pay_raise_cost_per_tier: 100,
	print_grams_per_coin: 10,
	property_damage_careless_base: 3,
	property_damage_dollars_per_coin: 0.25,
	student_actions_per_minute: 10
};

export function settingsValues(raw: Record<string, unknown> | null | undefined): CoinSettingsValues {
	const s = { ...SETTING_DEFAULTS, ...(raw ?? {}) } as CoinSettingsValues;
	return {
		...s,
		semesters: Array.isArray(s.semesters) ? s.semesters : [],
		no_pay_weeks: Array.isArray(s.no_pay_weeks) ? [...s.no_pay_weeks].sort() : [],
		fine_buttons: Array.isArray(s.fine_buttons) ? s.fine_buttons : []
	};
}

/**
 * THE NUMERIC SETTINGS, with the range 0240's `_coin_setting_ok` accepts. The
 * input's own min/max/step come from here, and so does the sentence a refusal
 * shows, so the form and its refusal say the same thing.
 */
export interface NumberSetting {
	key: CoinSettingKey;
	label: string;
	help: string;
	min: number;
	max: number;
	step: number;
	whole?: boolean;
}

export const NUMBER_SETTINGS: NumberSetting[] = [
	{ key: 'extra_credit_cap_percent', label: 'Extra credit cap (percent of a class total)', help: 'Each class caps bought extra credit at this share of its points this semester.', min: 0, max: 100, step: 0.01 },
	{ key: 'pay_raise_cost_per_tier', label: 'Pay raise cost per tier (coins)', help: 'A pay raise costs this times the current tier.', min: 0.01, max: 100000, step: 0.01 },
	{ key: 'print_grams_per_coin', label: '3D printing grams per coin', help: 'A print costs one coin for every this many grams, rounded.', min: 0.01, max: 100000, step: 0.01 },
	{ key: 'property_damage_careless_base', label: 'Careless property damage base (coins)', help: 'The flat part of a careless damage fine.', min: 0.01, max: 100000, step: 0.01 },
	{ key: 'property_damage_dollars_per_coin', label: 'Careless property damage dollars per coin', help: 'One more coin for every this many dollars of repair cost.', min: 0.01, max: 100000, step: 0.01 },
	{ key: 'student_actions_per_minute', label: 'Student actions per minute', help: 'How many purchases a student may make in one minute.', min: 1, max: 120, step: 1 }
];

export const HALL_PASS_RANGE = { min: 1, max: 240 };
export const HIGHEST_GRADE_WEEKS_RANGE = { min: 1, max: 20 };

export function isIsoDate(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A Monday, read as a calendar date (no clock, no zone). */
export function isMonday(s: string): boolean {
	return isIsoDate(s) && new Date(`${s}T00:00:00Z`).getUTCDay() === 1;
}

/** `Oct 12, 2026`, a date with no weekday, read as a calendar date. */
export function formatDay(s: string): string {
	if (!isIsoDate(s)) return s;
	return new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

export function semesterProblem(rows: Semester[]): string | null {
	const keys = new Set<string>();
	for (const [i, r] of rows.entries()) {
		const n = i + 1;
		if (!/^[a-z0-9-]{1,30}$/.test(r.key)) {
			return `Row ${n}: the key may use only lowercase letters, numbers and hyphens, 30 at most (like 2026-fall).`;
		}
		if (keys.has(r.key)) return `Row ${n}: the key ${r.key} is used twice.`;
		keys.add(r.key);
		if (!isIsoDate(r.start) || !isIsoDate(r.end)) return `Row ${n}: both dates are needed.`;
		if (r.end < r.start) return `Row ${n}: the semester ends before it starts.`;
	}
	if (rows.length > 20) return 'At most 20 semesters.';
	return null;
}

/** Adds a no-pay week, keeping the list sorted and free of repeats. */
export function withNoPayWeek(list: string[], day: string): string[] {
	return [...new Set([...list, day])].sort();
}

/**
 * The sections a long hall pass can never fine: a class whose automatic
 * check-in ends a pass before the fine threshold is reached.
 */
export function sectionsNeverFined(sections: SettingsSection[], fineMinutes: number): SettingsSection[] {
	return sections.filter(
		(s) => s.auto_checkin_minutes != null && Number(s.auto_checkin_minutes) < fineMinutes
	);
}

/** The one special token in the fine button list. */
export const PROPERTY_DAMAGE_TOKEN = 'property_damage';

export function fineButtonLabel(id: string, categories: Pick<SettingsCategory, 'id' | 'name'>[]): string {
	if (id === PROPERTY_DAMAGE_TOKEN) return 'Property Damage';
	return categories.find((c) => c.id === id)?.name ?? id;
}

/** Moves one item, returning a new list; a move off either end changes nothing. */
export function moveItem<T>(list: T[], index: number, delta: number): T[] {
	const to = index + delta;
	if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
	const next = [...list];
	const [item] = next.splice(index, 1);
	next.splice(to, 0, item);
	return next;
}

export function settingRefusal(reason: string | undefined, rule: string): string {
	if (reason === 'invalid') return `That value was refused. ${rule}`;
	if (reason === 'not_found') return 'That item is not there any more. Reload the page.';
	if (reason === 'negative') return 'Amounts may not be negative.';
	if (reason === 'name') return 'A name needs 1 to 120 characters.';
	if (reason === 'explanation_too_long') return 'The explanation may be at most 1500 characters.';
	if (reason === 'shape') return 'Those values do not fit this category (for example a minimum above the maximum, or a cap with no count).';
	return reason ? `Refused: ${reason}.` : 'Refused by the server.';
}

/** A category as the settings form edits it: every field a string. */
export interface CategoryDraft {
	name: string;
	amount: string;
	min_amount: string;
	max_amount: string;
	cap_period: 'day' | 'month' | 'none';
	cap_count: string;
	active: boolean;
	explanation: string;
}

export function categoryDraft(c: SettingsCategory): CategoryDraft {
	const n = (v: number | string | null) => (v == null || v === '' ? '' : coinNumber(v));
	return {
		name: c.name,
		amount: n(c.amount),
		min_amount: n(c.min_amount),
		max_amount: n(c.max_amount),
		cap_period: c.cap_period ?? 'none',
		cap_count: c.cap_count == null ? '' : String(c.cap_count),
		active: c.active,
		explanation: c.explanation ?? ''
	};
}

/** Which money fields a pricing model has. */
export function categoryAmountFields(model: SettingsCategory['pricing_model']): ('amount' | 'min_amount' | 'max_amount')[] {
	if (model === 'flat' || model === 'per_unit') return ['amount'];
	if (model === 'range') return ['min_amount', 'max_amount'];
	return [];
}

/**
 * The parameters for `coin_settings_set_category`, sending ONLY what moved
 * (null leaves a field alone). Null when nothing moved, or a sentence when a
 * field cannot be sent.
 */
export function categoryPatch(
	c: SettingsCategory,
	d: CategoryDraft
): { params: Record<string, unknown> } | { problem: string } | null {
	const base = categoryDraft(c);
	const params: Record<string, unknown> = {
		p_id: c.id,
		p_name: null,
		p_amount: null,
		p_min_amount: null,
		p_max_amount: null,
		p_cap_period: null,
		p_cap_count: null,
		p_active: null,
		p_explanation: null
	};
	let moved = false;
	if (d.name.trim() !== base.name) {
		if (!d.name.trim()) return { problem: 'A category needs a name.' };
		params.p_name = d.name.trim();
		moved = true;
	}
	for (const f of categoryAmountFields(c.pricing_model)) {
		if (d[f].trim() === base[f]) continue;
		const v = Number(d[f]);
		if (d[f].trim() === '' || !Number.isFinite(v) || v < 0) return { problem: 'Amounts must be zero or more.' };
		params[`p_${f}`] = cents(v);
		moved = true;
	}
	if (d.cap_period !== base.cap_period || d.cap_count.trim() !== base.cap_count) {
		if (d.cap_period === 'none') {
			params.p_cap_period = 'none';
		} else {
			const k = Number(d.cap_count);
			if (!Number.isInteger(k) || k < 1) return { problem: 'A cap needs a whole count of 1 or more.' };
			params.p_cap_period = d.cap_period;
			params.p_cap_count = k;
		}
		moved = true;
	}
	if (d.active !== base.active) {
		params.p_active = d.active;
		moved = true;
	}
	if (d.explanation !== base.explanation) {
		if (d.explanation.length > 1500) return { problem: 'The explanation may be at most 1500 characters.' };
		// An empty string clears it; null would leave it alone.
		params.p_explanation = d.explanation;
		moved = true;
	}
	return moved ? { params } : null;
}

const AUDIT_LABELS: Record<string, string> = {
	autopay_paused: 'Autopay paused',
	autopay_start: 'Autopay start date',
	highest_grade_weeks: 'Highest Grade period (weeks)',
	highest_grade_anchor: 'Highest Grade anchor',
	semesters: 'Semesters',
	no_pay_weeks: 'No-pay weeks',
	no_pay_after: 'No pay after',
	hall_pass_warn_minutes: 'Hall pass warning minutes',
	hall_pass_fine_minutes: 'Hall pass fine minutes',
	fine_buttons: 'Fine buttons'
};

function shortValue(v: unknown): string {
	if (v === null || v === undefined) return 'none';
	if (typeof v === 'string') return v;
	if (typeof v === 'number' || typeof v === 'boolean') return String(v);
	const text = JSON.stringify(v);
	return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

/** One audit entry as a line: what moved, from what, to what. */
export function auditLine(a: SettingsAudit, categories: Pick<SettingsCategory, 'id' | 'name'>[] = []): string {
	if (a.key.startsWith('category:')) {
		const id = a.key.slice('category:'.length);
		const name = categories.find((c) => c.id === id)?.name ?? id;
		const o = (a.old_value ?? {}) as Record<string, unknown>;
		const n = (a.new_value ?? {}) as Record<string, unknown>;
		const moved = Object.keys(n).filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]));
		const parts = moved.map((k) => `${k.replace(/_/g, ' ')} ${shortValue(o[k])} to ${shortValue(n[k])}`);
		return `Category ${name}: ${parts.join('; ') || 'saved'}`;
	}
	if (a.key.startsWith('section_economy:')) {
		return `Economy for a class turned ${a.new_value === true ? 'on' : 'off'}`;
	}
	const label = AUDIT_LABELS[a.key] ?? a.key.replace(/_/g, ' ');
	return `${label}: ${shortValue(a.old_value)} to ${shortValue(a.new_value)}`;
}

// ---------------------------------------------------------------------------
// 5. DEBT LIST AND AUTOPAY
// ---------------------------------------------------------------------------

export interface DebtRow {
	email: string;
	name: string;
	section: string | null;
	balance: number | string;
}

/** Deepest first, then by name: the server's own order, kept if it is not. */
export function sortDebt(rows: DebtRow[]): DebtRow[] {
	return [...rows].sort((a, b) => num(a.balance) - num(b.balance) || a.name.localeCompare(b.name));
}

export interface AutopayRun {
	id: number | string;
	trigger: string;
	started_at: string;
	finished_at: string | null;
	result: { wages?: number; highest_grade?: number; perfect_score?: number } | null;
}

export interface AutopayRow {
	id: string;
	at: string;
	email: string;
	name: string;
	category_id: string;
	category: string;
	amount: number | string;
	note: string | null;
	run_id: number | string | null;
	reversed: boolean;
}

export interface AutopayRecent {
	paused: boolean;
	runs: AutopayRun[];
	rows: AutopayRow[];
}

export interface AutopayGroup {
	run: AutopayRun | null;
	rows: AutopayRow[];
}

/**
 * Rows grouped under the run that paid them, newest run first. A run that paid
 * nobody is kept (it says it ran); automatic rows with no run (a hall pass
 * fine, an older system row) go in one group at the end.
 */
export function autopayGroups(recent: AutopayRecent): AutopayGroup[] {
	const byRun = new Map<string, AutopayRow[]>();
	const loose: AutopayRow[] = [];
	for (const r of recent.rows) {
		if (r.run_id == null) loose.push(r);
		else {
			const k = String(r.run_id);
			byRun.set(k, [...(byRun.get(k) ?? []), r]);
		}
	}
	const groups: AutopayGroup[] = recent.runs.map((run) => ({
		run,
		rows: byRun.get(String(run.id)) ?? []
	}));
	const known = new Set(recent.runs.map((r) => String(r.id)));
	for (const [k, rows] of byRun) {
		if (!known.has(k)) loose.push(...rows);
	}
	if (loose.length) groups.push({ run: null, rows: loose });
	return groups;
}

export function autopayRunSentence(r: {
	ran?: boolean;
	reason?: string;
	wages?: number;
	highest_grade?: number;
	perfect_score?: number;
}): string {
	if (!r.ran) {
		if (r.reason === 'paused') return 'Autopay is paused, so nothing was paid. Turn it back on in Settings.';
		if (r.reason === 'busy') return 'Another run is in progress. Try again in a moment.';
		if (r.reason === 'recent') return 'A run finished in the last two minutes, so this one was skipped.';
		return 'Autopay did not run.';
	}
	const w = r.wages ?? 0;
	const h = r.highest_grade ?? 0;
	const p = r.perfect_score ?? 0;
	if (w + h + p === 0) return 'Autopay ran. Everything owed was already paid.';
	return `Autopay ran: ${w} wage payment${w === 1 ? '' : 's'}, ${h} Highest Grade award${h === 1 ? '' : 's'}, ${p} Perfect Score award${p === 1 ? '' : 's'}.`;
}

export function triggerLabel(t: string): string {
	if (t === 'admin') return 'Run by an admin';
	if (t === 'nightly') return 'Nightly';
	return 'On a page visit';
}
