/**
 * THE QUEUE (IDEA Coin V2, session two, 2.2): plain types, pure helpers and
 * the transports factory for `/coin-desk/queue` (client-safe, the v2.ts
 * convention).
 *
 * ONE LIST FOR EVERYTHING A STUDENT SUBMITS. Every card is one row of
 * `coin_requests` (0245), of one of seven kinds, and every decision goes
 * through one database function, so Approve, Deny and Approve All cannot
 * disagree. Nothing in the queue expires.
 *
 * NOTHING HERE IS A BOUNDARY. `coin_queue`, `coin_queue_decide` and
 * `coin_queue_approve_all` re-check the caller's coin tier and scope inside
 * the database: a section coin staff member only ever sees and decides their
 * own students' cards. Every call goes through `callV2`, so a database the
 * migration has not reached answers `missing` and the surface says
 * V2_UNAVAILABLE.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { coins } from '$lib/coin-format';
import { callV2, cents, formatDay, num, reverseRefusal, type V2Result } from './v2';

// ---------------------------------------------------------------------------
// 1. THE KINDS
// ---------------------------------------------------------------------------

export type QueueKind =
	| 'background'
	| 'donation'
	| 'contract'
	| 'role_day'
	| 'split'
	| 'reported_coins'
	| 'dispute';

/** The order the filter chips are drawn in. */
export const QUEUE_KINDS: QueueKind[] = [
	'background',
	'donation',
	'contract',
	'role_day',
	'split',
	'reported_coins',
	'dispute'
];

/** Each kind in words: one card, several cards. */
export const QUEUE_KIND_WORDS: Record<QueueKind, { one: string; many: string }> = {
	background: { one: 'Desktop background', many: 'Desktop backgrounds' },
	donation: { one: 'Donation', many: 'Donations' },
	contract: { one: 'Contract done', many: 'Contracts done' },
	role_day: { one: 'Role day exception', many: 'Role day exceptions' },
	split: { one: 'Split payment', many: 'Split payments' },
	reported_coins: { one: 'Reported coins', many: 'Reported coins' },
	dispute: { one: 'Fine dispute', many: 'Fine disputes' }
};

export function isQueueKind(v: unknown): v is QueueKind {
	return typeof v === 'string' && (QUEUE_KINDS as string[]).includes(v);
}

// ---------------------------------------------------------------------------
// 2. THE PAYLOAD (0245's _coin_card_json and coin_queue)
// ---------------------------------------------------------------------------

export interface QueueCard {
	id: string;
	kind: QueueKind;
	email: string;
	name: string;
	section_id: string | null;
	section: string | null;
	amount: number | string | null;
	photo_path: string | null;
	payload: Record<string, unknown>;
	note: string | null;
	status: 'pending' | 'approved' | 'denied' | 'cancelled';
	decided_at: string | null;
	decision_note: string | null;
	result: Record<string, unknown> | null;
	created_at: string;
	balance: number | string;
}

export interface QueuePayload {
	pending: QueueCard[];
	counts: Partial<Record<QueueKind, number>>;
	recent: QueueCard[];
}

export interface QueueDecision {
	ok: boolean;
	reason?: string;
	status?: string;
	request_id?: string;
	result?: Record<string, unknown> | null;
	[k: string]: unknown;
}

export interface ApproveAllResult {
	ok: boolean;
	reason?: string;
	kind?: QueueKind;
	total?: number;
	succeeded?: number;
	skipped?: number;
	refused?: number;
	results?: QueueDecision[];
}

const asObject = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function asCard(v: unknown): QueueCard | null {
	const o = asObject(v);
	if (typeof o.id !== 'string' || !isQueueKind(o.kind)) return null;
	return {
		id: o.id,
		kind: o.kind,
		email: String(o.email ?? ''),
		name: String(o.name ?? o.email ?? ''),
		section_id: (o.section_id as string | null) ?? null,
		section: (o.section as string | null) ?? null,
		amount: (o.amount as number | string | null) ?? null,
		photo_path: (o.photo_path as string | null) ?? null,
		payload: asObject(o.payload),
		note: (o.note as string | null) ?? null,
		status: (o.status as QueueCard['status']) ?? 'pending',
		decided_at: (o.decided_at as string | null) ?? null,
		decision_note: (o.decision_note as string | null) ?? null,
		result: o.result ? asObject(o.result) : null,
		created_at: String(o.created_at ?? ''),
		balance: (o.balance as number | string) ?? 0
	};
}

/** The answer of `coin_queue`, read defensively: an unknown kind is dropped. */
export function normalizeQueue(raw: unknown): QueuePayload {
	const o = asObject(raw);
	const list = (v: unknown) =>
		(Array.isArray(v) ? v : []).map(asCard).filter((c): c is QueueCard => c !== null);
	const counts: Partial<Record<QueueKind, number>> = {};
	for (const [k, n] of Object.entries(asObject(o.counts))) {
		if (isQueueKind(k) && Number(n) > 0) counts[k] = Number(n);
	}
	return { pending: list(o.pending), counts, recent: list(o.recent) };
}

/** Every pending card in scope, whatever the filter. */
export function totalPending(counts: Partial<Record<QueueKind, number>>): number {
	return QUEUE_KINDS.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
}

// ---------------------------------------------------------------------------
// 3. WHAT A CARD SAYS
// ---------------------------------------------------------------------------

/** `shop_steward` -> `Shop steward`: an id read as words. */
export function idWords(id: unknown): string {
	const s = String(id ?? '').replace(/_/g, ' ').trim();
	return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

const ROLE_DAY_REASONS: Record<string, string> = {
	no_photos: 'no photos were taken',
	too_few_photos: 'too few photos',
	outside_window: 'a photo was taken outside the class window',
	gap_too_short: 'the two photos were too close together'
};

const PAY_TYPE_WORDS: Record<string, string> = {
	hourly: 'Hourly',
	flat: 'Flat',
	quality: 'Quality adjusted'
};

function when(iso: unknown): string {
	const s = String(iso ?? '');
	if (!s) return '';
	const d = new Date(s);
	if (Number.isNaN(d.getTime())) return s;
	return d.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZone: 'America/Los_Angeles'
	});
}

/** A card's own date and time, in school time. */
export function cardWhen(iso: string | null | undefined): string {
	return when(iso);
}

/**
 * THE KIND-SPECIFIC LINES of a card, from its payload, in the order they are
 * read. Every value comes from the stored payload; nothing is recomputed.
 */
export function cardDetail(card: QueueCard): string[] {
	const p = card.payload;
	const out: string[] = [];
	switch (card.kind) {
		case 'background': {
			if (p.width != null && p.height != null) out.push(`${num(p.width as number)} x ${num(p.height as number)} pixels`);
			break;
		}
		case 'donation': {
			const qty = num(p.quantity as number) || 1;
			if (p.other) {
				out.push(`Other: ${String(p.item ?? 'not described')}${qty > 1 ? `, ${qty} of them` : ''}`);
				out.push('Not on the want list, so the amount is yours to set.');
			} else {
				const rate = p.rate == null ? 'no listed rate' : `${coins(num(p.rate as number))} each`;
				out.push(`${String(p.item ?? 'Item')} x ${qty} at ${rate}`);
			}
			break;
		}
		case 'contract': {
			if (p.title) out.push(String(p.title));
			const pay = PAY_TYPE_WORDS[String(p.pay_type ?? '')] ?? idWords(p.pay_type);
			const parts = [pay ? `${pay} pay` : ''];
			if (p.pay_type === 'hourly' && p.hours != null) {
				parts.push(`${num(p.hours as number)} hour${num(p.hours as number) === 1 ? '' : 's'}`);
				if (p.hourly_rate != null) parts.push(`at ${coins(num(p.hourly_rate as number))} an hour`);
			} else if (p.payout_amount != null) {
				parts.push(`posted at ${coins(num(p.payout_amount as number))}`);
			}
			out.push(parts.filter(Boolean).join(', '));
			if (p.debt_only) out.push('A restitution job for a student in debt.');
			break;
		}
		case 'role_day': {
			const status = asObject(p.status);
			if (p.day) out.push(`Day: ${formatDay(String(p.day))}`);
			if (p.role_id) out.push(`Role: ${idWords(p.role_id)}`);
			const reason = ROLE_DAY_REASONS[String(status.reason ?? '')];
			const photos = status.photos == null ? '' : ` (${num(status.photos as number)} photo${num(status.photos as number) === 1 ? '' : 's'})`;
			if (reason) out.push(`Why it failed: ${reason}${photos}`);
			break;
		}
		case 'split': {
			out.push(`Item: ${idWords(p.item)}`);
			if (p.price != null) out.push(`Price: ${coins(num(p.price as number))}`);
			if (p.digital != null) out.push(`Digital part already paid: ${coins(num(p.digital as number))}`);
			if (p.physical != null) out.push(`Physical coins to collect: ${coins(num(p.physical as number))}`);
			break;
		}
		case 'reported_coins': {
			out.push(`Counted on hand: ${num(p.count as number)} coin${num(p.count as number) === 1 ? '' : 's'}`);
			out.push('A count only: approving it moves no balance.');
			break;
		}
		case 'dispute': {
			const amount = card.amount == null ? '' : `${coins(num(card.amount))} `;
			out.push(`The fine: ${amount}${idWords(p.category_id)}`.trim());
			if (p.fined_at) out.push(`Fined ${when(p.fined_at)}`);
			out.push('Approving posts an undo of the fine.');
			break;
		}
	}
	return out.filter(Boolean);
}

/** The amount line of a card, or null where a kind has no amount. */
export function cardAmountWords(card: QueueCard): string | null {
	if (card.kind === 'reported_coins') return null;
	if (card.amount == null) return 'Amount: not set yet';
	if (card.kind === 'split') return `Collect: ${coins(num(card.amount))}`;
	if (card.kind === 'dispute') return `Refund if approved: ${coins(num(card.amount))}`;
	return `Pays: ${coins(num(card.amount))}`;
}

/** Donation and contract cards take an amount at approval. */
export function amountEditable(card: QueueCard): boolean {
	return card.kind === 'donation' || card.kind === 'contract';
}

/**
 * Whether approving needs a person's number: an "Other" donation (nothing on
 * the want list to price it) or a donation or contract with no amount. Approve
 * All skips exactly these (0245).
 */
export function amountRequired(card: QueueCard): boolean {
	if (!amountEditable(card)) return false;
	return card.amount == null || (card.kind === 'donation' && !!card.payload.other);
}

/** What the amount box starts with: the filled-in amount, or empty. */
export function amountSeed(card: QueueCard): string {
	if (!amountEditable(card) || card.amount == null) return '';
	if (card.kind === 'donation' && card.payload.other) return '';
	return String(cents(num(card.amount)));
}

export type ApproveCheck = { ok: true; amount: number | null } | { ok: false; problem: string };

/**
 * THE ONE PREDICATE behind both the Approve control and its handler. An
 * editable card sends the box's value (or nothing, keeping the filled-in
 * amount, when the box is empty and the card does not need one).
 */
export function approveCheck(card: QueueCard, amountText: string | number | null | undefined): ApproveCheck {
	if (!amountEditable(card)) return { ok: true, amount: null };
	const text = String(amountText ?? '').trim();
	if (!text) {
		if (amountRequired(card)) return { ok: false, problem: 'Enter the amount in coins first.' };
		return { ok: true, amount: null };
	}
	const v = Number(text);
	if (!Number.isFinite(v) || v < 0 || v > 100000) {
		return { ok: false, problem: 'The amount must be between 0 and 100000 coins.' };
	}
	return { ok: true, amount: cents(v) };
}

// ---------------------------------------------------------------------------
// 4. REFUSALS AND RESULTS, IN WORDS
// ---------------------------------------------------------------------------

export function queueRefusal(r: { reason?: string; status?: string; message?: string } | null | undefined): string {
	switch (r?.reason) {
		case 'not_found':
			return 'That card is not in your queue any more. It may belong to a student outside your classes.';
		case 'already_decided':
			return r.status === 'cancelled'
				? 'The student took that card back before it was decided.'
				: `Someone already ${r.status === 'denied' ? 'denied' : 'approved'} that card.`;
		case 'amount_required':
			return 'This card needs an amount before it can be approved.';
		case 'amount':
			return 'The amount must be between 0 and 100000 coins.';
		case 'pass_already_active':
			return 'The student already holds an Eating Pass, so this one cannot be granted. Deny it to refund the digital part.';
		case 'tier_changed':
			return 'The student’s wage tier changed since they asked for this pay raise. Deny it to refund the digital part; they can ask again.';
		case 'invalid':
			return 'That request was not understood.';
		case 'error':
			return r.message ? `Error: ${r.message}` : 'Something went wrong on the server.';
		case 'is_reversal':
		case 'not_reversible':
		case 'already_reversed':
			return reverseRefusal(r.reason);
		default:
			return r?.reason ? `Refused: ${idWords(r.reason).toLowerCase()}.` : 'Refused by the server.';
	}
}

/** What a landed decision did, in one sentence. */
export function decisionWords(card: QueueCard, approve: boolean, d: QueueDecision): string {
	const who = card.name;
	if (!approve) return `Denied ${who}’s ${QUEUE_KIND_WORDS[card.kind].one.toLowerCase()}.`;
	const res = asObject(d.result);
	if (card.kind === 'donation' && res.capped) {
		return `Approved. ${who} was paid ${coins(num(res.paid as number))} of ${coins(num(res.asked as number))}: the donation limit for these two weeks left ${coins(num(res.room as number))}.`;
	}
	if (res.paid != null) return `Approved. ${who} was paid ${coins(num(res.paid as number))}.`;
	if (card.kind === 'split') return `Approved. ${who}’s ${idWords(card.payload.item).toLowerCase()} is granted.`;
	if (card.kind === 'dispute') return `Approved. ${who}’s fine was undone.`;
	return `Approved ${who}’s ${QUEUE_KIND_WORDS[card.kind].one.toLowerCase()}.`;
}

/** Approve All's answer as one sentence. */
export function approveAllWords(r: ApproveAllResult): string {
	const total = r.total ?? 0;
	const ok = r.succeeded ?? 0;
	const skipped = r.skipped ?? 0;
	const refused = r.refused ?? 0;
	if (!total) return 'There was nothing of that kind to approve.';
	const parts = [`${ok} of ${total} approved`];
	if (skipped) parts.push(`${skipped} skipped because ${skipped === 1 ? 'it needs' : 'they need'} an amount from you`);
	if (refused) parts.push(`${refused} refused`);
	return `${parts.join(', ')}.`;
}

/** The cards Approve All would skip: the ones that need an amount (0245). */
export function approveAllSkips(cards: QueueCard[], kind: QueueKind): number {
	if (kind !== 'donation' && kind !== 'contract') return 0;
	return cards.filter((c) => c.kind === kind && c.amount == null).length;
}

/** A decided card's outcome, for the recent list. */
export function recentWords(card: QueueCard): string {
	const verdict = card.status === 'approved' ? 'Approved' : card.status === 'denied' ? 'Denied' : idWords(card.status);
	const at = card.decided_at ? ` ${when(card.decided_at)}` : '';
	return `${verdict}${at}`;
}

// ---------------------------------------------------------------------------
// 5. TRANSPORTS
// ---------------------------------------------------------------------------

export interface QueueTransports {
	load: (kind: QueueKind | null) => Promise<V2Result<QueuePayload>>;
	/** Absent removes Approve and Deny. */
	decide?: (id: string, approve: boolean, amount: number | null, note: string | null) => Promise<V2Result<QueueDecision>>;
	/** Absent removes Approve All. */
	approveAll?: (kind: QueueKind) => Promise<V2Result<ApproveAllResult>>;
	/** A short-lived link to a card's photo. Absent shows no thumbnails. */
	photoUrl?: (path: string) => Promise<string | null>;
}

/** The bucket a card's photo lives in (0245, private, signed reads only). */
export const COIN_UPLOAD_BUCKET = 'coin-uploads';
/** How long a photo link lives, in seconds. */
export const COIN_PHOTO_URL_SECONDS = 300;

export function createQueueTransports(supabase: SupabaseClient): QueueTransports {
	return {
		async load(kind) {
			const r = await callV2<unknown>(supabase, 'coin_queue', { p_kind: kind });
			return r.kind === 'ok' ? { kind: 'ok', data: normalizeQueue(r.data) } : r;
		},
		decide: (id, approve, amount, note) =>
			callV2<QueueDecision>(supabase, 'coin_queue_decide', {
				p_request_id: id,
				p_approve: approve,
				p_amount: amount,
				p_note: note
			}),
		approveAll: (kind) => callV2<ApproveAllResult>(supabase, 'coin_queue_approve_all', { p_kind: kind }),
		async photoUrl(path) {
			try {
				const { data, error } = await supabase.storage
					.from(COIN_UPLOAD_BUCKET)
					.createSignedUrl(path, COIN_PHOTO_URL_SECONDS);
				if (error) return null;
				return data?.signedUrl ?? null;
			} catch {
				return null;
			}
		}
	};
}
