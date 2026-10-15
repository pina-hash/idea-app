/**
 * THE STUDENTS AREA'S PURE LAYER (IDEA Coin V2 session two): one student's
 * telemetry, their history with edited amounts, and the export. Plain types
 * and pure helpers (client-safe, the coin-desk.ts convention); every call is
 * made by a component through `callV2`, so a missing function says
 * V2_UNAVAILABLE in one place.
 *
 * WHAT THE READS ARE, AND WHO MAY MAKE THEM (decision 68):
 *   coin_student_stats(p_email)   0249: balance, series, weeks, categories,
 *                                 events, name, background. Coin staff, over
 *                                 their own students.
 *   coin_admin_lookup(p_email)    0250: the folded history. `can_edit` says
 *                                 whether this caller may edit an amount
 *                                 (a full coin admin only).
 *   coin_export(scope, ...)       0249: raw rows for one student, one class,
 *                                 or (full only) the whole economy.
 *
 * THE CSV IS BUILT HERE, FROM THE RAW ROWS, AND ONLY HERE. The export is
 * meant to be read by a person or handed to Claude, so it is the rows the
 * database returned with nothing summed, folded or renamed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { coins, signedCoins } from '$lib/coin-format';
import { callV2, num, reverseRefusal, V2_UNAVAILABLE, type DeskTxn } from './v2';

// ---------------------------------------------------------------------------
// 1. THE TELEMETRY (coin_student_stats)
// ---------------------------------------------------------------------------

export interface StatsPoint {
	day: string;
	balance: number | string;
}

export interface StatsWeek {
	week_start: string;
	earned: number | string;
	spent: number | string;
}

export interface StatsCategory {
	category_id: string;
	name: string;
	kind: string;
	total: number | string;
	count: number;
}

export interface StatsEvent {
	id: string;
	at: string;
	category_id: string;
	name: string;
	kind: string;
	amount: number | string;
	original_amount?: number | string | null;
	edited?: boolean;
	reversed?: boolean;
}

export interface StatsBackground {
	request_id: string;
	photo_path: string | null;
	approved_at: string | null;
	width: number | null;
	height: number | null;
}

export interface StudentStats {
	email: string;
	name: string | null;
	balance: number | string;
	series: StatsPoint[];
	weeks: StatsWeek[];
	categories: StatsCategory[];
	events: StatsEvent[];
	background: StatsBackground | null;
}

/** One plotted point of the balance line, in SVG units. */
export interface ChartPoint {
	x: number;
	y: number;
	day: string;
	balance: number;
}

export interface BalanceChart {
	points: ChartPoint[];
	/** The polyline's `d`, empty when there is nothing to draw. */
	path: string;
	/** The y of the zero line, or null when zero is outside the plotted range. */
	zeroY: number | null;
	min: number;
	max: number;
	width: number;
	height: number;
}

function dayNumber(day: string): number {
	const t = Date.parse(`${day}T00:00:00Z`);
	return Number.isNaN(t) ? 0 : Math.round(t / 86400000);
}

/**
 * THE BALANCE OVER TIME, as SVG coordinates. X is the calendar day (so a
 * quiet week is a flat stretch, not a skipped one); Y always includes zero,
 * because the line crossing zero is the thing a teacher is looking for. One
 * point draws as a level line across the width rather than nothing.
 */
export function balanceChart(series: StatsPoint[], width = 600, height = 160, pad = 8): BalanceChart {
	const pts = series
		.map((p) => ({ day: String(p.day).slice(0, 10), balance: num(p.balance) }))
		.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.day));
	const values = pts.map((p) => p.balance);
	const min = Math.min(0, ...values);
	const max = Math.max(0, ...values);
	const span = max - min || 1;
	const y = (v: number) => pad + (height - 2 * pad) * (1 - (v - min) / span);
	if (!pts.length) return { points: [], path: '', zeroY: y(0), min, max, width, height };
	const first = dayNumber(pts[0].day);
	const last = dayNumber(pts[pts.length - 1].day);
	const days = last - first;
	const x = (day: string) =>
		days <= 0 ? width / 2 : pad + ((width - 2 * pad) * (dayNumber(day) - first)) / days;
	const points: ChartPoint[] = pts.map((p) => ({ x: x(p.day), y: y(p.balance), day: p.day, balance: p.balance }));
	const path =
		points.length === 1
			? `M${pad},${points[0].y}H${width - pad}`
			: points.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)},${round(p.y)}`).join('');
	return { points, path, zeroY: y(0), min, max, width, height };
}

function round(n: number): number {
	return Math.round(n * 10) / 10;
}

export interface WeekBar {
	week_start: string;
	earned: number;
	spent: number;
	/** x of the week's pair of bars, and each bar's height and top. */
	x: number;
	barWidth: number;
	earnedY: number;
	earnedH: number;
	spentY: number;
	spentH: number;
}

/** Weekly earning and spending as pairs of bars on one shared scale. */
export function weekBars(weeks: StatsWeek[], width = 600, height = 140, pad = 8): { bars: WeekBar[]; max: number } {
	const rows = weeks.map((w) => ({
		week_start: String(w.week_start).slice(0, 10),
		earned: Math.max(0, num(w.earned)),
		spent: Math.max(0, num(w.spent))
	}));
	const max = Math.max(1, ...rows.map((r) => Math.max(r.earned, r.spent)));
	const slot = rows.length ? (width - 2 * pad) / rows.length : 0;
	const barWidth = Math.max(2, slot * 0.36);
	const base = height - pad;
	const scale = (v: number) => ((height - 2 * pad) * v) / max;
	return {
		max,
		bars: rows.map((r, i) => {
			const x = pad + slot * i + slot * 0.12;
			return {
				...r,
				x,
				barWidth,
				earnedH: scale(r.earned),
				earnedY: base - scale(r.earned),
				spentH: scale(r.spent),
				spentY: base - scale(r.spent)
			};
		})
	};
}

/** `Oct 12`, a calendar day with no weekday and no year. */
export function shortDay(day: string): string {
	const d = new Date(`${String(day).slice(0, 10)}T00:00:00Z`);
	return Number.isNaN(d.getTime())
		? String(day)
		: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * THE CHART'S TEXT ALTERNATIVE, one sentence: where the balance started, where
 * it is, and its lowest and highest. The full numbers sit in a table beside it.
 */
export function balanceSentence(series: StatsPoint[]): string {
	const pts = series.map((p) => ({ day: String(p.day).slice(0, 10), balance: num(p.balance) }));
	if (!pts.length) return 'No coin activity yet, so there is no balance history.';
	const first = pts[0];
	const last = pts[pts.length - 1];
	const low = pts.reduce((a, b) => (b.balance < a.balance ? b : a));
	const high = pts.reduce((a, b) => (b.balance > a.balance ? b : a));
	return `The balance went from ${coins(first.balance)} on ${shortDay(first.day)} to ${coins(last.balance)} on ${shortDay(last.day)}. Lowest ${coins(low.balance)} (${shortDay(low.day)}), highest ${coins(high.balance)} (${shortDay(high.day)}).`;
}

export function weeksSentence(weeks: StatsWeek[]): string {
	if (!weeks.length) return 'Nothing earned or spent in the last twelve weeks.';
	const earned = weeks.reduce((s, w) => s + Math.max(0, num(w.earned)), 0);
	const spent = weeks.reduce((s, w) => s + Math.max(0, num(w.spent)), 0);
	return `Over the last ${weeks.length} week${weeks.length === 1 ? '' : 's'} with activity: ${coins(earned)} earned and ${coins(spent)} spent.`;
}

/** What a stats event is, in a word, for the list of fines, awards and purchases. */
export const EVENT_KIND_WORDS: Record<string, string> = {
	fine: 'Fine',
	award: 'Award',
	purchase: 'Purchase'
};

// ---------------------------------------------------------------------------
// 2. THE HISTORY, WITH EDITED AMOUNTS (coin_admin_lookup, 0250)
// ---------------------------------------------------------------------------

export interface DeskEdit {
	id?: string;
	at: string;
	old: number | string | null;
	new: number | string | null;
	undone: boolean;
}

/** One history row in 0250's folded shape. `amount` is the value NOW. */
export interface DeskHistoryTxn extends DeskTxn {
	at?: string;
	original_amount?: number | string | null;
	edited?: boolean;
	edits?: DeskEdit[];
}

/** `coin_admin_lookup`'s answer since 0250. */
export interface StudentLookup {
	email: string;
	name?: string | null;
	balance: number | string;
	wage_tier: number;
	eating_pass_active: boolean;
	eating_pass_strikes: number;
	no_shop_today?: boolean;
	/** Grams of 3D print spool left (0250). Absent on an older database. */
	spool_grams?: number | string;
	/** Whether this caller may edit an amount (a full coin admin, 0250). */
	can_edit?: boolean;
	recent_transactions: DeskHistoryTxn[];
}

/** The categories `coin_edit_amount` refuses by id (0250). */
export const NOT_EDITABLE_CATEGORIES = new Set(['reversal', 'amount_correction', 'payout_hold']);

/**
 * Whether the desk offers an amount edit on a row, mirroring 0250's
 * `coin_edit_amount` refusals so no control is offered whose only answer is a
 * refusal: a digital row, not part of a transfer, not a reversal, a
 * correction or a held payout, and not undone. The server still decides.
 */
export function isEditable(t: DeskHistoryTxn): boolean {
	if ((t.medium ?? 'digital') !== 'digital') return false;
	if (t.transfer_id) return false;
	if (NOT_EDITABLE_CATEGORIES.has(t.category_id)) return false;
	if (t.reverses) return false;
	return !t.reversed;
}

/** The edits still standing (not undone), oldest first. */
export function liveEdits(t: DeskHistoryTxn): DeskEdit[] {
	return (t.edits ?? []).filter((e) => !e.undone);
}

/** One edit as a line: "Changed from +3i¢ to +5i¢, Oct 12, 3:04 PM". */
export function editLine(e: DeskEdit): string {
	const d = new Date(e.at);
	const when = Number.isNaN(d.getTime())
		? ''
		: `, ${d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
	return `Changed from ${signedCoins(num(e.old))} to ${signedCoins(num(e.new))}${when}${e.undone ? ' (undone)' : ''}`;
}

export function editRefusal(reason: string | undefined): string {
	switch (reason) {
		case 'amount':
			return 'Enter an amount between -100000 and 100000.';
		case 'not_found':
			return 'That row is not in the ledger any more.';
		case 'not_editable':
			return 'Only a digital row that is not an undo, a correction, a held payout or part of a transfer can be edited.';
		case 'reversed':
			return 'That row was undone, so its amount cannot be edited.';
		case 'no_edit':
			return 'That row has no edit left to undo.';
		default:
			return reason ? `Refused: ${reason}.` : 'Refused by the server.';
	}
}

export type DeskWrite = { ok: true } | { ok: false; message: string };

/** Edit one row's amount. A sentence for the person, or ok. */
export async function editAmount(
	supabase: SupabaseClient,
	id: string,
	amount: number,
	note: string | null
): Promise<DeskWrite> {
	const r = await callV2<{ ok: boolean; reason?: string }>(supabase, 'coin_edit_amount', {
		p_transaction_id: id,
		p_new_amount: Math.round(amount * 100) / 100,
		p_note: note
	});
	if (r.kind === 'missing') return { ok: false, message: V2_UNAVAILABLE };
	if (r.kind === 'error') return { ok: false, message: r.message };
	if (!r.data?.ok) return { ok: false, message: editRefusal(r.data?.reason) };
	return { ok: true };
}

/** Undo the newest edit of one row. */
export async function undoEdit(supabase: SupabaseClient, id: string): Promise<DeskWrite> {
	const r = await callV2<{ ok: boolean; reason?: string }>(supabase, 'coin_edit_undo', {
		p_transaction_id: id
	});
	if (r.kind === 'missing') return { ok: false, message: V2_UNAVAILABLE };
	if (r.kind === 'error') return { ok: false, message: r.message };
	if (!r.data?.ok) return { ok: false, message: editRefusal(r.data?.reason) };
	return { ok: true };
}

/**
 * Undo one row, with 0244's section-staff refusal in words. A section coin
 * staff member may undo a fine or an award a person logged; an automatic row
 * and a purchase are a full coin admin's.
 */
export async function reverseRow(supabase: SupabaseClient, id: string): Promise<DeskWrite> {
	const r = await callV2<{ ok: boolean; reason?: string }>(supabase, 'coin_reverse_transaction', {
		p_transaction_id: id,
		p_note: null
	});
	if (r.kind === 'missing') return { ok: false, message: V2_UNAVAILABLE };
	if (r.kind === 'error') return { ok: false, message: r.message };
	if (!r.data?.ok) {
		if (r.data?.reason === 'full_admin_only') {
			return {
				ok: false,
				message: 'Only a full coin admin can undo this row: it is automatic, or it is not a fine or an award.'
			};
		}
		return { ok: false, message: reverseRefusal(r.data?.reason) };
	}
	return { ok: true };
}

export function spoolRefusal(reason: string | undefined): string {
	switch (reason) {
		case 'email':
			return 'That is not a student email.';
		case 'grams':
			return 'Enter the grams on the spool, up to 10000.';
		case 'below_zero':
			return 'That would take the grams left below zero.';
		default:
			return reason ? `Refused: ${reason}.` : 'Refused by the server.';
	}
}

// ---------------------------------------------------------------------------
// 3. THE EXPORT (coin_export, 0249)
// ---------------------------------------------------------------------------

export type ExportScope = 'student' | 'class' | 'economy';

export interface ExportRow {
	id: string;
	created_at: string;
	email: string;
	name: string | null;
	category_id: string;
	category: string;
	kind: string;
	amount: number | string;
	medium: string | null;
	quantity: number | string | null;
	note: string | null;
	actor: string | null;
	transfer_id: string | null;
	meta: unknown;
}

export interface ExportPayload {
	scope: ExportScope;
	exported_at: string;
	rows: ExportRow[];
}

/** The CSV's columns, in order. One per field of a raw row; meta is its JSON. */
export const EXPORT_COLUMNS: (keyof ExportRow)[] = [
	'created_at',
	'email',
	'name',
	'category_id',
	'category',
	'kind',
	'amount',
	'medium',
	'quantity',
	'note',
	'actor',
	'transfer_id',
	'id',
	'meta'
];

/**
 * Columns a PERSON typed (or a name a person chose). A spreadsheet runs a
 * cell that starts with `=`, `+`, `-` or `@` as a formula, so a note reading
 * `=HYPERLINK(...)` would act when the file is opened; such a cell is given a
 * leading apostrophe. The numeric columns are never touched, so a negative
 * amount stays a number.
 */
const TEXT_COLUMNS = new Set<keyof ExportRow>(['email', 'name', 'category', 'note', 'actor', 'meta']);

function cell(value: unknown, column: keyof ExportRow): string {
	let text: string;
	if (value === null || value === undefined) text = '';
	else if (typeof value === 'object') text = JSON.stringify(value);
	else text = String(value);
	if (TEXT_COLUMNS.has(column) && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The raw rows as CSV: a header line, then one line per row, CRLF-separated. */
export function exportCsv(rows: ExportRow[]): string {
	const lines = [EXPORT_COLUMNS.join(',')];
	for (const r of rows) lines.push(EXPORT_COLUMNS.map((c) => cell(r[c], c)).join(','));
	return lines.join('\r\n') + '\r\n';
}

/** `idea-coins-student-ana-reyes-2026-10-15.csv`: no address in a file name. */
export function exportFileName(scope: ExportScope, label: string, ext: 'csv' | 'json', today: string): string {
	const slug = label
		.toLowerCase()
		.replace(/@.*$/, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
	return `idea-coins-${scope}${slug ? `-${slug}` : ''}-${today}.${ext}`;
}

/** Hands the browser a file to save. The one download path for the export. */
export function saveFile(name: string, body: string, type: string): void {
	const blob = new Blob([body], { type });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
