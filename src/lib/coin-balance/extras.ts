/**
 * IDEA COIN V2, SESSION TWO: the client half of everything a student does on
 * `/coin-balance` beyond buying (0245 to 0250). PLAIN DATA + pure helpers,
 * client-safe, the `coin-balance.ts` convention: no Supabase, no Svelte.
 *
 * Each read here comes from its own definer function, any of which may be
 * missing on a database that has not applied its migration yet; the route
 * hands a missing read through as NULL and the page then has no section for
 * it, never an error. Every action answers `{ok, reason}` jsonb, and every
 * reason those functions can answer has a sentence here; an unknown one still
 * gets a sentence rather than a code.
 */

import { coinNumber, coins } from '$lib/coin-format';
import type { CoinMyRequest, CoinRequestKind, CoinRequestStatus } from '$lib/coin-balance';

/* ------------------------------------------------------------------ */
/* Small readers (the same shape coin-balance.ts uses).                */
/* ------------------------------------------------------------------ */

function num(v: unknown, fallback = 0): number {
	const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
	return Number.isFinite(n) ? n : fallback;
}
function numOrNull(v: unknown): number | null {
	if (v === null || v === undefined || v === '') return null;
	const n = num(v, NaN);
	return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string {
	return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v);
}
function strOrNull(v: unknown): string | null {
	const s = str(v).trim();
	return s ? s : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function arr(v: unknown): unknown[] {
	return Array.isArray(v) ? v : [];
}

/* ------------------------------------------------------------------ */
/* Dates, on the school's clock, with no weekday.                      */
/* ------------------------------------------------------------------ */

/** 'YYYY-MM-DD' as "Oct 29". The date is a calendar day, so it is read in UTC. */
export function coinDay(day: string | null | undefined): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? '');
	if (!m) return '';
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
}

/** 'YYYY-MM-DD' as "November 2". */
export function coinDayLong(day: string | null | undefined): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? '');
	if (!m) return '';
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' });
}

/** An instant as its Los Angeles calendar day, "Oct 29". */
export function coinDate(iso: string | null | undefined): string {
	const t = Date.parse(iso ?? '');
	if (Number.isNaN(t)) return '';
	return new Date(t).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' });
}

/** A phrase as a sentence: a full stop added unless it already ends in one. */
export function sentence(s: string): string {
	const t = s.trim();
	return /[.!?]$/.test(t) ? t : `${t}.`;
}

/* ------------------------------------------------------------------ */
/* What an action answers.                                             */
/* ------------------------------------------------------------------ */

export type CoinActionResult =
	| { ok: true; data: Record<string, unknown> }
	| { ok: false; reason: string; data: Record<string, unknown>; message?: string };

type RpcAnswer = { data: unknown; error: { code?: string; message?: string } | null };

/** One reader for every session-two action. A missing function is "not available". */
export function readActionAnswer({ data, error }: RpcAnswer): CoinActionResult {
	if (error) {
		if (error.code === 'PGRST202' || error.code === '42883') return { ok: false, reason: 'not_available', data: {} };
		return { ok: false, reason: 'error', data: {}, message: error.message };
	}
	const d = obj(data);
	if (d.ok === true) return { ok: true, data: d };
	return { ok: false, reason: typeof d.reason === 'string' ? d.reason : 'error', data: d };
}

/** The refusals every student action shares (0241's seam). */
function seamWords(reason: string): string | null {
	switch (reason) {
		case 'signed_out':
			return 'You are signed out. Sign in again, then try once more.';
		case 'staff_account':
			return 'This is a student action. A staff account has no coins of its own to spend here.';
		case 'not_in_economy':
			return 'None of your classes is using IDEA Coins right now, so this is closed.';
		case 'rate_limited':
			return 'That is a lot in one minute. Wait a minute, then try again.';
		case 'not_available':
			return 'This is switched off right now.';
		case 'no_upload':
			return 'The picture did not finish uploading. Pick it again and send it once more.';
		default:
			return null;
	}
}

const TRY_AGAIN = 'That did not go through. Try again in a minute.';

/* ------------------------------------------------------------------ */
/* Coins out (2.4).                                                    */
/* ------------------------------------------------------------------ */

export function payoutRefusalWords(r: { reason: string; data?: Record<string, unknown> }): string {
	const d = r.data ?? {};
	switch (r.reason) {
		case 'coins':
			return 'Enter how many coins you want out, more than 0.';
		case 'already_open':
			return 'You already have coins out waiting for payday. Cancel that one first to change the amount.';
		case 'insufficient': {
			const b = numOrNull(d.balance);
			return b === null
				? 'That is more than your balance.'
				: `That is more than your balance, ${coins(b)}. You can take out up to your balance.`;
		}
		case 'none_open':
			return 'There is nothing waiting for payday to cancel.';
		default:
			return seamWords(r.reason) ?? TRY_AGAIN;
	}
}

/* ------------------------------------------------------------------ */
/* Desktop background (2.6).                                           */
/* ------------------------------------------------------------------ */

export function backgroundRefusalWords(r: { reason: string; data?: Record<string, unknown> }): string {
	const d = r.data ?? {};
	switch (r.reason) {
		case 'size_unknown':
			return 'The size of this picture could not be read. Save it as a JPG or PNG and pick it again.';
		case 'not_16_9':
			return `This picture is ${str(d.width)} by ${str(d.height)}, which is not 16:9. Crop it to 16:9 and send it again.`;
		case 'too_small':
			return `This picture is ${str(d.width)} by ${str(d.height)}. It must be at least ${str(d.min_width)} by ${str(d.min_height)}.`;
		case 'low_quality':
			return `This picture is too compressed to look sharp (${str(d.kb)} KB where at least ${str(d.min_kb)} KB is needed). Save it at a higher quality.`;
		case 'too_soon': {
			const when = coinDate(str(d.next_at));
			return when
				? `You sent a background recently. You can send the next one on ${when}.`
				: 'You sent a background recently. Wait two weeks before the next one.';
		}
		case 'not_available':
			return 'Desktop backgrounds are switched off right now.';
		default:
			return seamWords(r.reason) ?? TRY_AGAIN;
	}
}

/* ------------------------------------------------------------------ */
/* Donations (2.7).                                                    */
/* ------------------------------------------------------------------ */

export interface CoinDonationItem {
	id: string;
	name: string;
	/** Coins per item; null means "set by your teacher at approval". */
	rate: number | null;
	photo_path: string | null;
	/** A signed URL the route minted for the photo, or null. */
	photo_url: string | null;
}

/** `coin_donation_items_list()` (0245), active items only. */
export function parseDonationItems(raw: unknown): CoinDonationItem[] {
	return arr(raw)
		.map((x) => {
			const o = obj(x);
			return {
				id: str(o.id),
				name: str(o.name).trim(),
				rate: numOrNull(o.rate),
				photo_path: strOrNull(o.photo_path),
				photo_url: strOrNull(o.photo_url),
				active: o.active !== false
			};
		})
		.filter((i) => i.id && i.name && i.active)
		.map(({ active: _a, ...rest }) => rest);
}

export function donationRefusalWords(r: { reason: string; data?: Record<string, unknown> }): string {
	switch (r.reason) {
		case 'quantity':
			return 'Enter how many you are donating, a whole number from 1 to 100.';
		case 'unknown_item':
			return 'That item is no longer on the want list. Pick another, or choose Other.';
		case 'describe_other':
			return 'Say what you are donating, in 200 characters or fewer.';
		case 'not_available':
			return 'Donations are switched off right now.';
		default:
			return seamWords(r.reason) ?? TRY_AGAIN;
	}
}

/* ------------------------------------------------------------------ */
/* Coins on hand (2.10) and disputes (2.11).                           */
/* ------------------------------------------------------------------ */

export function reportRefusalWords(r: { reason: string }): string {
	switch (r.reason) {
		case 'count':
			return 'Enter a whole number of coins, 0 or more.';
		case 'already_pending':
			return 'You already sent a count that is waiting to be checked. Wait for it first.';
		default:
			return seamWords(r.reason) ?? TRY_AGAIN;
	}
}

export function disputeRefusalWords(r: { reason: string }): string {
	switch (r.reason) {
		case 'reason_required':
			return 'Say why this fine is wrong, in 1000 characters or fewer.';
		case 'not_disputable':
			return 'Only an automatic fine on your own history can be disputed.';
		case 'already_reversed':
			return 'This fine was already undone.';
		case 'already_disputed':
			return 'You already disputed this fine. It is waiting for your teacher.';
		default:
			return seamWords(r.reason) ?? TRY_AGAIN;
	}
}

export function cancelRequestRefusalWords(r: { reason: string }): string {
	switch (r.reason) {
		case 'not_found':
			return 'That submission could not be found. Reload the page.';
		case 'not_cancellable':
			return 'That one was already decided, or cannot be cancelled.';
		default:
			return seamWords(r.reason) ?? TRY_AGAIN;
	}
}

/** The words for a dispute's state. */
export function disputeWords(d: { status: CoinRequestStatus; decision_note: string | null }): string {
	switch (d.status) {
		case 'pending':
			return 'Disputed, waiting for your teacher';
		case 'approved':
			return 'Dispute approved, the fine was undone';
		case 'denied':
			return d.decision_note ? `Dispute denied: ${d.decision_note}` : 'Dispute denied';
		default:
			return 'Dispute cancelled';
	}
}

/* ------------------------------------------------------------------ */
/* The student's own submissions (coin_my_page.requests, 0250).        */
/* ------------------------------------------------------------------ */

const ITEM_NAMES: Record<string, string> = {
	eating_pass: 'Eating Pass',
	pay_raise: 'Pay Raise',
	three_d_printing: '3D print',
	extra_credit: 'Extra credit'
};

/** What a card is, in a student's words. */
export function requestTitle(r: CoinMyRequest): string {
	const kinds: Record<CoinRequestKind, string> = {
		background: 'Desktop background',
		donation: 'Donation',
		contract: 'Contract marked done',
		role_day: 'Role day check',
		split: 'Split payment',
		reported_coins: 'Coins on hand',
		dispute: 'Fine dispute'
	};
	const base = kinds[r.kind];
	if (r.kind === 'donation' && r.item) return `${base}: ${r.item}${r.quantity ? `, ${coinNumber(r.quantity)}` : ''}`;
	if (r.kind === 'split' && r.item) return `${base}: ${ITEM_NAMES[r.item] ?? r.item}`;
	if (r.kind === 'reported_coins' && r.count !== null) return `${base}: ${coinNumber(r.count)}`;
	return base;
}

/** Where a card stands: "Waiting for your teacher", "Approved", "Denied: <reason>". */
export function requestStatusWords(r: CoinMyRequest): string {
	switch (r.status) {
		case 'pending':
			return 'Waiting for your teacher';
		case 'approved': {
			const paid = numOrNull(r.result?.paid ?? null);
			if (paid !== null && paid > 0) {
				return r.result?.capped === true
					? `Approved, paid ${coins(paid)} (up to the donation limit)`
					: `Approved, paid ${coins(paid)}`;
			}
			return 'Approved';
		}
		case 'denied':
			return r.decision_note ? `Denied: ${r.decision_note}` : 'Denied';
		default:
			return 'Cancelled';
	}
}

/** The one word a card's state chip carries; the full sentence sits beside it. */
export function requestStatusShort(r: Pick<CoinMyRequest, 'status'>): string {
	return r.status === 'pending' ? 'Waiting' : r.status === 'approved' ? 'Approved' : r.status === 'denied' ? 'Denied' : 'Cancelled';
}

/** A student may cancel their own pending card, except a split or a contract (0245). */
export function requestCancellable(r: CoinMyRequest): boolean {
	return r.status === 'pending' && r.kind !== 'split' && r.kind !== 'contract';
}


/* ------------------------------------------------------------------ */
/* Stats (2.14).                                                       */
/* ------------------------------------------------------------------ */

export interface CoinStatsEvent {
	id: string;
	at: string;
	name: string;
	kind: string;
	amount: number;
	edited: boolean;
}

export interface CoinStats {
	series: { day: string; balance: number }[];
	weeks: { week_start: string; earned: number; spent: number }[];
	categories: { category_id: string; name: string; kind: string; total: number; count: number }[];
	events: CoinStatsEvent[];
}

/** `coin_my_stats()` (0249). Null for a signed-out answer. */
export function parseMyStats(raw: unknown): CoinStats | null {
	const r = obj(raw);
	if (r.signed_in === false) return null;
	if (!Array.isArray(r.series) && !Array.isArray(r.weeks)) return null;
	return {
		series: arr(r.series)
			.map((x) => {
				const o = obj(x);
				return { day: str(o.day).slice(0, 10), balance: num(o.balance) };
			})
			.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.day)),
		weeks: arr(r.weeks)
			.map((x) => {
				const o = obj(x);
				return { week_start: str(o.week_start).slice(0, 10), earned: Math.max(0, num(o.earned)), spent: Math.max(0, num(o.spent)) };
			})
			.filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.week_start)),
		categories: arr(r.categories)
			.map((x) => {
				const o = obj(x);
				return {
					category_id: str(o.category_id),
					name: str(o.name) || str(o.category_id),
					kind: str(o.kind),
					total: num(o.total),
					count: Math.max(0, Math.trunc(num(o.count)))
				};
			})
			.filter((c) => c.category_id),
		events: arr(r.events)
			.map((x) => {
				const o = obj(x);
				return {
					id: str(o.id),
					at: str(o.at),
					name: str(o.name) || str(o.category_id),
					kind: str(o.kind),
					amount: num(o.amount),
					edited: o.edited === true
				};
			})
			.filter((e) => e.id)
	};
}

/** The one sentence a balance chart is read as. */
export function balanceSeriesWords(series: CoinStats['series']): string {
	if (!series.length) return 'No coins have moved yet, so there is nothing to chart.';
	const first = series[0];
	const last = series[series.length - 1];
	let hi = first;
	let lo = first;
	for (const p of series) {
		if (p.balance > hi.balance) hi = p;
		if (p.balance < lo.balance) lo = p;
	}
	if (series.length === 1) return `Your balance was ${coins(first.balance)} on ${coinDay(first.day)}.`;
	return `Your balance went from ${coins(first.balance)} on ${coinDay(first.day)} to ${coins(last.balance)} on ${coinDay(last.day)}. Highest ${coins(hi.balance)} on ${coinDay(hi.day)}, lowest ${coins(lo.balance)} on ${coinDay(lo.day)}.`;
}

/** The one sentence the weekly bars are read as. */
export function weeksWords(weeks: CoinStats['weeks']): string {
	if (!weeks.length) return 'Nothing was earned or spent in the last twelve weeks.';
	const earned = weeks.reduce((s, w) => s + w.earned, 0);
	const spent = weeks.reduce((s, w) => s + w.spent, 0);
	return `Over the last ${weeks.length} week${weeks.length === 1 ? '' : 's'} with any coins moving, you earned ${coins(Math.round(earned * 100) / 100)} and spent or lost ${coins(Math.round(spent * 100) / 100)}.`;
}

/* ------------------------------------------------------------------ */
/* The Student Auditor (2.10).                                         */
/* ------------------------------------------------------------------ */

export interface CoinAuditorPending {
	id: string;
	name: string;
	count: number;
	created_at: string;
}

/** `coin_auditor_queue()` (0245): null unless the caller is an auditor. */
export function parseAuditorQueue(raw: unknown): CoinAuditorPending[] | null {
	const r = obj(raw);
	if (r.auditor !== true) return null;
	return arr(r.pending)
		.map((x) => {
			const o = obj(x);
			return { id: str(o.id), name: str(o.name).trim() || 'A classmate', count: num(o.count), created_at: str(o.created_at) };
		})
		.filter((p) => p.id);
}

export function auditorRefusalWords(r: { reason: string; message?: string }): string {
	switch (r.reason) {
		case 'own_report':
			return 'You can never check your own count. Another auditor or your teacher will.';
		case 'not_found':
			return 'That count is not one you can check. Reload the page.';
		case 'already_decided':
			return 'Someone already checked this count.';
		case 'invalid':
			return 'Choose Approve or Deny.';
		default:
			return seamWords(r.reason) ?? TRY_AGAIN;
	}
}

/* ------------------------------------------------------------------ */
/* What the route hands the page beside coin_my_page.                  */
/* ------------------------------------------------------------------ */

/**
 * The session-two reads, each from its own function. NULL (or absent) means
 * the function is missing on this database or answered nothing usable, and
 * the page draws no section for it.
 */
export interface CoinPageExtras {
	stats?: CoinStats | null;
	donationItems?: CoinDonationItem[] | null;
	/** The auditor's queue; null unless the caller is a Student Auditor. */
	auditor?: CoinAuditorPending[] | null;
	/** The caller holds at least one class role (coin_my_role, 0247). */
	hasRole?: boolean;
	/** A signed URL for the approved background, minted by the route. */
	backgroundUrl?: string | null;
}
