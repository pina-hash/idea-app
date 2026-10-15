/**
 * PAYDAY (IDEA Coin V2, session two, 2.4): plain types, pure helpers and the
 * transports factory for `/coin-desk/payday` (client-safe).
 *
 * A student asks for coins out on their coin page; the coins are held from
 * their balance until payday. On payday the teacher opens one class, hands the
 * coins out, unticks anyone absent and presses Done: `coin_payday_settle`
 * (0246) settles exactly the ticked requests, and every unticked one stays
 * held for the next payday. The same screen takes a debt paid in physical
 * coins (`coin_payday_debt_payment`).
 *
 * NOTHING HERE IS A BOUNDARY: every function re-checks the caller's coin tier
 * and scope in the database.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { coins } from '$lib/coin-format';
import { callV2, cents, coinRefusalWords, formatDay, num, type CoinRefusal, type V2Result } from './v2';

export interface PaydaySection {
	id: string;
	label: string;
	requests: number;
	in_debt: number;
}

export interface PaydayOverview {
	payday: string | null;
	sections: PaydaySection[];
}

export interface PaydayRequest {
	id: string;
	email: string;
	name: string;
	coins: number | string;
	requested_at: string;
	balance: number | string;
}

export interface PaydayDebt {
	email: string;
	name: string;
	balance: number | string;
}

export interface PaydayClass {
	payday: string | null;
	section_id: string;
	label: string;
	requests: PaydayRequest[];
	debts: PaydayDebt[];
}

export interface SettleRow {
	id: string;
	ok: boolean;
	paid?: number | string;
	partial?: boolean;
	reason?: string;
}

export interface SettleResult {
	ok: boolean;
	settled: number;
	results: SettleRow[];
}

export interface DebtPaymentResult extends CoinRefusal {
	ok: boolean;
	amount?: number | string;
}

/** "Next payday: Nov 2, 2026", or the sentence for no payday set. */
export function paydayWords(day: string | null | undefined): string {
	if (!day) return 'No payday is set yet. A full coin admin sets the dates in Settings.';
	return `Next payday: ${formatDay(day)}.`;
}

/** Every request ticked: the default, so nobody is left out by accident. */
export function allTicked(requests: PaydayRequest[]): Record<string, boolean> {
	return Object.fromEntries(requests.map((r) => [r.id, true]));
}

export function tickedIds(requests: PaydayRequest[], ticks: Record<string, boolean>): string[] {
	return requests.filter((r) => ticks[r.id] !== false).map((r) => r.id);
}

/** The ticked requests' coins, which is what is about to be handed out. */
export function tickedCoins(requests: PaydayRequest[], ticks: Record<string, boolean>): number {
	return cents(requests.filter((r) => ticks[r.id] !== false).reduce((s, r) => s + num(r.coins), 0));
}

export interface SettleSummary {
	settled: number;
	partial: number;
	noBalance: number;
	other: number;
	paid: number;
	lines: { id: string; name: string; words: string; ok: boolean }[];
}

/** What Done did, one line per student, plus the counts. */
export function settleSummary(result: SettleResult, requests: PaydayRequest[]): SettleSummary {
	const byId = new Map(requests.map((r) => [r.id, r]));
	const s: SettleSummary = { settled: 0, partial: 0, noBalance: 0, other: 0, paid: 0, lines: [] };
	for (const row of result.results ?? []) {
		const req = byId.get(row.id);
		const name = req?.name ?? 'A student';
		let words: string;
		if (row.ok) {
			s.settled += 1;
			s.paid = cents(s.paid + num(row.paid));
			if (row.partial) {
				s.partial += 1;
				words = `Hand over ${coins(num(row.paid))}, not ${coins(num(req?.coins))}: the balance fell since they asked, so they were paid what it allowed.`;
			} else {
				words = `Hand over ${coins(num(row.paid))}.`;
			}
		} else if (row.reason === 'no_balance') {
			s.noBalance += 1;
			words = 'Nothing to hand over: the balance is below zero now, so the request was cancelled.';
		} else if (row.reason === 'already_closed') {
			s.other += 1;
			words = 'Already settled or cancelled.';
		} else {
			s.other += 1;
			words = 'Not settled: this request is not one of yours any more.';
		}
		s.lines.push({ id: row.id, name, words, ok: !!row.ok });
	}
	return s;
}

export function settleHeadline(s: SettleSummary, left: number): string {
	const parts = [`${s.settled} settled (${coins(s.paid)} out)`];
	if (s.partial) parts.push(`${s.partial} paid only part`);
	if (s.noBalance) parts.push(`${s.noBalance} with nothing to pay`);
	if (s.other) parts.push(`${s.other} not settled`);
	const tail = left
		? ` ${left} unticked request${left === 1 ? '' : 's'} stay${left === 1 ? 's' : ''} held for the next payday.`
		: '';
	return `${parts.join(', ')}.${tail}`;
}

/** A count of physical coins received: positive, at most 100000, to the cent. */
export function parseCoinCount(text: string | number | null | undefined): number | null {
	const t = String(text ?? '').trim();
	if (!t) return null;
	const v = Number(t);
	if (!Number.isFinite(v) || v <= 0 || v > 100000) return null;
	return cents(v);
}

export function debtPaymentWords(r: DebtPaymentResult, name: string): string {
	if (r.ok) {
		return `Recorded ${coins(num(r.amount))} from ${name}. The balance is now ${coins(num(r.balance))}.`;
	}
	if (r.reason === 'coins') return 'Enter a count of coins above zero.';
	return coinRefusalWords(r);
}

export interface PaydayTransports {
	overview: () => Promise<V2Result<PaydayOverview>>;
	open: (sectionId: string) => Promise<V2Result<PaydayClass>>;
	/** Absent removes Done. */
	settle?: (requestIds: string[]) => Promise<V2Result<SettleResult>>;
	/** Absent removes the debt payment. */
	payDebt?: (email: string, coins: number) => Promise<V2Result<DebtPaymentResult>>;
}

export function createPaydayTransports(supabase: SupabaseClient): PaydayTransports {
	return {
		overview: () => callV2<PaydayOverview>(supabase, 'coin_payday', { p_section_id: null }),
		open: (sectionId) => callV2<PaydayClass>(supabase, 'coin_payday', { p_section_id: sectionId }),
		settle: (ids) => callV2<SettleResult>(supabase, 'coin_payday_settle', { p_request_ids: ids }),
		payDebt: (email, amount) =>
			callV2<DebtPaymentResult>(supabase, 'coin_payday_debt_payment', { p_email: email, p_coins: amount })
	};
}
