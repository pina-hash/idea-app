/**
 * THE TOURNAMENT TRANSFER (IDEA Coin V2, session two, 2.9): plain types, the
 * arithmetic and the transports factory for `/coin-desk/tournaments`
 * (client-safe). A full coin admin's area only: both functions refuse anybody
 * else in the database (0248).
 *
 * A concluded tournament's rewards wait here until a full coin admin finishes
 * it one of two ways: TRANSFER posts each listed amount to its student's
 * account, PAID PHYSICALLY posts nothing and records that the prizes were
 * handed out as coins. Either way the tournament leaves the list, and a second
 * call is refused, so nothing is paid twice.
 *
 * THE TWO WAYS TO PAY A TEAM, and the rule each one follows (one function,
 * `tournamentAmounts`, so the screen and the payload cannot disagree):
 *
 *   duplicate  every member gets the entry's whole total. This is the
 *              default, and it is how tournaments always recorded a team's
 *              reward: each member earned it.
 *   split      the total is divided evenly among EVERY listed member, walk-ups
 *              included, to the cent; leftover cents go one each to the first
 *              members listed, so the shares add up to the total exactly. A
 *              walk-up's share is not paid (there is no account to pay), so on
 *              a team with a walk-up the paid shares add up to less than the
 *              total.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { callV2, cents, num, type V2Result } from './v2';

export type TournamentMode = 'split' | 'duplicate';

export const TOURNAMENT_DEFAULT_MODE: TournamentMode = 'duplicate';

export interface TournamentMember {
	user_id: string | null;
	name: string;
	has_account: boolean;
}

export interface TournamentEntry {
	entry_id: string;
	name: string;
	earned: number | string;
	placement: number | null;
	placement_default: number | string;
	members: TournamentMember[];
}

export interface TournamentPending {
	id: string;
	name: string;
	updated_at: string;
	has_placement_rules: boolean;
	entries: TournamentEntry[];
}

export interface MemberAmount {
	key: string;
	user_id: string | null;
	name: string;
	has_account: boolean;
	amount: number;
	/** False for a walk-up: listed, never paid. */
	paid: boolean;
}

/** One member's place in the overrides map. */
export function memberKey(entryId: string, m: TournamentMember, index: number): string {
	return `${entryId}:${m.user_id ?? `walkup-${index}`}`;
}

/** Whether a member can be paid: an account the database can find. */
export function payable(m: TournamentMember): boolean {
	return !!m.user_id && m.has_account;
}

/**
 * An entry's total before anybody edits it: what the tournament recorded the
 * team earning when that is above zero, otherwise the placement default (the
 * setting's 1st, 2nd, 3rd figure for a tournament with no placement rules).
 */
export function entryTotalDefault(entry: TournamentEntry): number {
	const earned = num(entry.earned);
	return cents(earned > 0 ? earned : num(entry.placement_default));
}

/**
 * EVERY MEMBER'S AMOUNT from an entry's total and the mode. `total` defaults
 * to `entryTotalDefault`. Never negative; the database caps each at 10000.
 */
export function tournamentAmounts(
	entry: TournamentEntry,
	mode: TournamentMode,
	total: number = entryTotalDefault(entry)
): MemberAmount[] {
	const members = entry.members ?? [];
	const t = Math.max(0, cents(total));
	const n = members.length;
	const totalCents = Math.round(t * 100);
	const base = n ? Math.floor(totalCents / n) : 0;
	const extra = n ? totalCents - base * n : 0;
	return members.map((m, i) => {
		const amount = mode === 'duplicate' ? t : (base + (i < extra ? 1 : 0)) / 100;
		return {
			key: memberKey(entry.entry_id, m, i),
			user_id: m.user_id,
			name: m.name,
			has_account: m.has_account,
			amount,
			paid: payable(m)
		};
	});
}

/** An edited amount, read: a number between 0 and 10000 to the cent, or null. */
export function parseAmount(text: string | number | null | undefined): number | null {
	const t = String(text ?? '').trim();
	if (!t) return null;
	const v = Number(t);
	if (!Number.isFinite(v) || v < 0 || v > 10000) return null;
	return cents(v);
}

export interface TransferLine {
	user_id: string;
	amount: number;
}

export interface TransferPlan {
	lines: TransferLine[];
	coins: number;
	/** Distinct accounts paid. */
	students: number;
	/** Walk-ups listed and not paid. */
	skipped: number;
	/** A sentence when an edited amount cannot be sent, else null. */
	problem: string | null;
}

/**
 * THE PAYLOAD for a transfer: every payable member with an amount above zero,
 * in the order listed. `overrides` holds an edited amount per member key, as
 * typed; anything not overridden takes `tournamentAmounts`'s figure.
 */
export function transferPlan(
	t: TournamentPending,
	mode: TournamentMode,
	totals: Record<string, number>,
	overrides: Record<string, string>
): TransferPlan {
	const lines: TransferLine[] = [];
	let skipped = 0;
	let problem: string | null = null;
	for (const e of t.entries) {
		const rows = tournamentAmounts(e, mode, totals[e.entry_id] ?? entryTotalDefault(e));
		for (const r of rows) {
			if (!r.paid || !r.user_id) {
				skipped += 1;
				continue;
			}
			let amount = r.amount;
			if (r.key in overrides) {
				const v = parseAmount(overrides[r.key]);
				if (v == null) {
					problem ??= `${r.name}’s amount must be between 0 and 10000 coins.`;
					continue;
				}
				amount = v;
			}
			if (amount > 0) lines.push({ user_id: r.user_id, amount });
		}
	}
	return {
		lines,
		coins: cents(lines.reduce((s, l) => s + l.amount, 0)),
		students: new Set(lines.map((l) => l.user_id)).size,
		skipped,
		problem
	};
}

export function placementWords(p: number | null): string | null {
	if (p === 1) return '1st place';
	if (p === 2) return '2nd place';
	if (p === 3) return '3rd place';
	return null;
}

export interface SettleAnswer {
	ok: boolean;
	reason?: string;
	outcome?: 'transferred' | 'paid_physically';
	paid?: number;
	skipped?: number;
}

export function settleRefusal(reason: string | undefined): string {
	switch (reason) {
		case 'already_settled':
			return 'This tournament was already finished, by someone else or in another tab. Nothing more was paid.';
		case 'not_found':
			return 'This tournament is not complete any more, or it is gone.';
		case 'invalid':
			return 'That request was not understood.';
		default:
			return reason ? `Refused: ${reason}.` : 'Refused by the server.';
	}
}

export interface TournamentTransports {
	load: () => Promise<V2Result<TournamentPending[]>>;
	/** Absent removes both finishes. */
	settle?: (
		tournamentId: string,
		outcome: 'transferred' | 'paid_physically',
		mode: TournamentMode | null,
		amounts: TransferLine[] | null
	) => Promise<V2Result<SettleAnswer>>;
}

export function createTournamentTransports(supabase: SupabaseClient): TournamentTransports {
	return {
		async load() {
			const r = await callV2<TournamentPending[]>(supabase, 'coin_tournament_transfers');
			return r.kind === 'ok' ? { kind: 'ok', data: Array.isArray(r.data) ? r.data : [] } : r;
		},
		settle: (id, outcome, mode, amounts) =>
			callV2<SettleAnswer>(supabase, 'coin_tournament_settle', {
				p_tournament_id: id,
				p_outcome: outcome,
				p_mode: mode,
				p_amounts: amounts
			})
	};
}
