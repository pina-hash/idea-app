/**
 * THE DIGEST (IDEA Coin V2, session two, 2.13): plain types, pure helpers and
 * the transports factory for `/coin-desk/digest` (client-safe).
 *
 * `coin_digest(p_days)` (0249) is one read: everything autopay paid in the
 * window, the students who gained more than the digest threshold, the
 * students in chronic debt, the queue count, and money in against money out.
 * A section coin staff member sees only their own students in every part of
 * it, and an autopay row is `reversible` only for a full coin admin, so the
 * Undo key is offered exactly where the database would accept it.
 *
 * THE FRIDAY NOTIFICATION is two halves, and both are needed: the account goes
 * on the digest list (`coin_digest_notify_set`), and THIS browser must hold a
 * push subscription. The second half reuses the tournament feature's own
 * client helper (`$lib/tournaments/push-client`), never a second copy.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { coins } from '$lib/coin-format';
import type { PushAvailability } from '$lib/tournaments/push-client';
import { callV2, cents, num, reverseTransaction, type V2Result } from './v2';

export interface DigestAutopayRow {
	id: string;
	at: string;
	email: string;
	name: string;
	category_id: string;
	category: string;
	amount: number | string;
	note: string | null;
	reversed: boolean;
	reversible: boolean;
}

export interface DigestStudent {
	email: string;
	name: string;
	balance: number | string;
}

export interface DigestGainer extends DigestStudent {
	gained: number | string;
}

export interface Digest {
	since: string;
	scope: 'full' | 'section';
	autopay: DigestAutopayRow[];
	gainers: DigestGainer[];
	chronic_debt: DigestStudent[];
	queue: number;
	money: { in: number | string; out: number | string };
	notify: boolean;
}

const asObject = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asList = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function normalizeDigest(raw: unknown): Digest {
	const o = asObject(raw);
	const money = asObject(o.money);
	return {
		since: String(o.since ?? ''),
		scope: o.scope === 'full' ? 'full' : 'section',
		autopay: asList<DigestAutopayRow>(o.autopay).map((r) => ({
			...r,
			reversed: !!r.reversed,
			// Never offered unless the database said so in so many words.
			reversible: r.reversible === true && !r.reversed
		})),
		gainers: asList<DigestGainer>(o.gainers),
		chronic_debt: asList<DigestStudent>(o.chronic_debt),
		queue: num(o.queue as number),
		money: { in: (money.in as number) ?? 0, out: (money.out as number) ?? 0 },
		notify: o.notify === true
	};
}

/** Money in minus money out, to the cent. */
export function digestNet(money: Digest['money']): number {
	return cents(num(money.in) - num(money.out));
}

export function moneyWords(money: Digest['money']): string {
	const net = digestNet(money);
	const tail =
		net > 0
			? `${coins(net)} more came in than went out.`
			: net < 0
				? `${coins(-net)} more went out than came in.`
				: 'In and out were even.';
	return `${coins(num(money.in))} in, ${coins(num(money.out))} out. ${tail}`;
}

/** The autopay rows that still count (an undone row moved nothing). */
export function autopayTotal(rows: DigestAutopayRow[]): number {
	return cents(rows.filter((r) => !r.reversed).reduce((s, r) => s + num(r.amount), 0));
}

/** The window the digest covers, as words. */
export function sinceWords(since: string, days: number): string {
	const d = new Date(since);
	if (!since || Number.isNaN(d.getTime())) return `The last ${days} days.`;
	const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
	return `The last ${days} days, since ${day}.`;
}

/** Why this browser cannot take the Friday notification, or null when it can. */
export function pushBlockedWords(a: PushAvailability): string | null {
	switch (a) {
		case 'unconfigured':
			return 'Push notifications are not set up on this site yet, so nothing can be sent to this browser.';
		case 'unsupported':
			return 'This browser cannot receive push notifications. On an iPhone or iPad, add the site to your Home Screen first.';
		case 'denied':
			return 'Notifications are blocked for this site in this browser’s settings. Allow them there, then turn this on again.';
		default:
			return null;
	}
}

export interface PushTransport {
	availability: () => PushAvailability;
	/** Whether this browser already holds a subscription. */
	hasSubscription: () => Promise<boolean>;
	/** Ask permission, subscribe and record it. Safe to call again. */
	enable: () => Promise<{ ok: boolean; error?: string }>;
}

export interface DigestTransports {
	load: (days: number) => Promise<V2Result<Digest>>;
	/** Absent removes every Undo key. */
	reverse?: (id: string, note: string | null) => Promise<{ ok: true } | { ok: false; message: string }>;
	/** Absent removes the notification switch. */
	notify?: (on: boolean) => Promise<V2Result<{ ok: boolean; notify?: boolean; reason?: string }>>;
	/** This browser's push subscription. Absent: the switch only sets the account's choice. */
	push?: PushTransport;
}

export const DIGEST_DAYS = 7;

export function createDigestTransports(supabase: SupabaseClient, push?: PushTransport): DigestTransports {
	return {
		async load(days) {
			const r = await callV2<unknown>(supabase, 'coin_digest', { p_days: days });
			return r.kind === 'ok' ? { kind: 'ok', data: normalizeDigest(r.data) } : r;
		},
		reverse: (id, note) => reverseTransaction(supabase, id, note),
		notify: (on) => callV2<{ ok: boolean; notify?: boolean; reason?: string }>(supabase, 'coin_digest_notify_set', { p_on: on }),
		push
	};
}
