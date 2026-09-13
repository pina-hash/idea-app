// tests/dom/tournament-rewards-payout-mount.test.ts
//
// LEDGER 0207, FINDING 6a, THE SURFACE HALF: THE PANEL PROMISED COINS THE
// ENGINE NEVER PAID, AND SPELLED THE CURRENCY DIFFERENTLY FROM ITS NEIGHBOUR.
//
// Before 0212 `RewardsPanel.svelte` rendered a heading "Payout history" and
// bare gold numbers (`+40`) while `tournament_reward_ledger` reached
// `coin_transactions` nowhere and a student's balance had not moved.
// `DeleteTournament.svelte` rendered the same total WITH the symbol, and
// `tests/coin-symbol.test.ts` could not catch the disagreement because its
// `COIN_SOURCES` list is explicit and did not name this file. Both halves are
// fixed: the coins genuinely move (see
// `tests/db/tournament-bracket-reward-payout.test.ts`, against real Postgres)
// and the panel is in `COIN_SOURCES`.
//
// WHAT THIS FILE ADDS THAT THE SYMBOL SWEEP CANNOT. That sweep reads SOURCE and
// rejects wrong spellings; it cannot tell whether a figure reaches the screen
// with its unit attached, because a template can hold `COIN_SYMBOL` and still
// render a number without it. This mounts the REAL component and reads the
// rendered text.
//
// AND THE UNPAID STATE IS THE ASSERTION THAT MATTERS MOST, because it fails
// silently in the direction that costs a student: a reward that reached no
// balance rendered identically to one that did would tell somebody they had
// been paid when nobody had paid them.
//
// NO GEOMETRY IS ASSERTED HERE. See `tests/dom/mount.ts` for why.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import RewardsPanel from '$lib/tournaments/RewardsPanel.svelte';
import { COIN_SYMBOL } from '$lib/coin-format';
import { rewardAwards, rewardTotals, rewardUnpaid } from '$lib/tournaments/tournaments';
import type { RewardLedgerRow, TournamentEntry } from '$lib/tournaments/tournaments';
import { mountInto, type Mounted } from './mount';

let m: Mounted | null = null;
afterEach(async () => {
	await m?.stop();
	m = null;
});

const ENTRIES: Record<string, TournamentEntry> = {
	e1: { id: 'e1', display_name: 'Ana Reyes', seed: 1 } as unknown as TournamentEntry,
	e2: { id: 'e2', display_name: 'Kofi Mensah', seed: 2 } as unknown as TournamentEntry
};

const RULES = [
	{ id: 'r1', trigger_type: 'win', trigger_value: null, amount: 10 },
	{ id: 'r2', trigger_type: 'placement', trigger_value: 1, amount: 50 }
] as never[];

/** A ledger row in the shape the detail route's `select('*')` hands over. */
function row(over: Partial<RewardLedgerRow> & { id: number }): RewardLedgerRow {
	return {
		tournament_id: 't1',
		entry_id: 'e1',
		user_id: 'u1',
		amount: 10,
		reason: 'match win',
		match_id: 'm1',
		awarded_at: '2026-09-22T18:00:00.000Z',
		member_id: null,
		coin_transaction_id: 'coin-1',
		...over
	} as RewardLedgerRow;
}

function open(ledger: RewardLedgerRow[]) {
	m = mountInto(RewardsPanel as unknown as Component<Record<string, unknown>>, {
		rules: RULES,
		ledger,
		entries: ENTRIES
	});
	return m;
}

describe('every figure the panel renders carries the coin symbol', () => {
	it('the rule chips, the standings total and the history line all do', () => {
		const v = open([row({ id: 1 })]);
		const text = v.target.textContent ?? '';

		// The rule chip: a configured "+10" is ten IDEA Coins.
		expect(text).toContain(`+10${COIN_SYMBOL}`);
		// The standings total for that entry.
		const totals = v.one('.totals');
		expect(totals.textContent).toContain(`+10${COIN_SYMBOL}`);
		// The history line.
		const history = v.one('.history');
		expect(history.textContent).toContain(`+10${COIN_SYMBOL}`);
		// The placement rule chip, which is a different amount entirely.
		expect(text).toContain(`+50${COIN_SYMBOL}`);
	});

	it('NO bare figure is left behind: this is what the source sweep cannot see', () => {
		// The positive control for the assertion above. A template can hold
		// COIN_SYMBOL and still render one figure without it -- which is exactly
		// what shipped, `+40` beside a neighbour rendering the symbol. Every
		// amount-bearing element is read, and each must end in the symbol.
		const v = open([row({ id: 1 }), row({ id: 2, reason: '1st place', match_id: null, amount: 50 })]);
		const amounts = v.all('.total-amount, .ledger-amount, .rule-chip strong');
		expect(amounts.length).toBeGreaterThanOrEqual(4);
		for (const el of amounts) {
			const t = (el.textContent ?? '').trim();
			expect(t, `"${t}" has no coin symbol`).toContain(COIN_SYMBOL);
			expect(t, `"${t}" is a bare number`).toMatch(/\d/);
		}
	});

	it('a multi-registrant award still reads as the amount EACH, with the symbol', () => {
		// 0192: one row per registrant, each for the full amount. The fold keeps
		// the figure at what one person got and says how many got it.
		const v = open([
			row({ id: 1, member_id: 'mem1' }),
			row({ id: 2, member_id: 'mem2', user_id: 'u2' })
		]);
		const line = v.one('.ledger-amount');
		expect(line.textContent).toContain(`+10${COIN_SYMBOL}`);
		expect(line.textContent).toContain('× 2');
		expect(v.one('.totals').textContent).toContain('2 registrants');
	});
});

describe('a reward that reached no balance is marked, in words', () => {
	it('an unpaid reward is marked in BOTH the standings and the history', () => {
		// SCOPED TO EACH REGION ON PURPOSE. An unscoped `.unpaid` sweep passes
		// while either mark alone is present -- measured: disabling the history
		// mark left all eleven assertions green because the standings mark was
		// still there. A student reading the history is the one being told they
		// were paid.
		const v = open([row({ id: 1, coin_transaction_id: null })]);
		const inTotals = v.all('.totals .unpaid');
		const inHistory = v.all('.history .unpaid');
		expect(inTotals.length, 'standings').toBeGreaterThanOrEqual(1);
		expect(inHistory.length, 'history').toBeGreaterThanOrEqual(1);
		// COLOUR IS NEVER THE ONLY SIGNAL: the mark has to say it, in both.
		expect(inTotals.map((e) => e.textContent ?? '').join(' ')).toContain('not paid');
		expect(inHistory.map((e) => e.textContent ?? '').join(' ')).toContain('not paid');
	});

	it('a PAID row carries none: the positive control for the mark', () => {
		// Without this, "the mark appears" is compatible with the mark always
		// appearing, which would be a warning on every reward ever paid.
		const v = open([row({ id: 1, coin_transaction_id: 'coin-1' })]);
		expect(v.all('.totals .unpaid')).toHaveLength(0);
		expect(v.all('.history .unpaid')).toHaveLength(0);
	});

	it('a partly paid team award says how many of them are unpaid', () => {
		const v = open([
			row({ id: 1, member_id: 'mem1', coin_transaction_id: 'coin-1' }),
			row({ id: 2, member_id: 'mem2', user_id: null, coin_transaction_id: null })
		]);
		expect(
			v
				.all('.history .unpaid')
				.map((e) => (e.textContent ?? '').trim())
				.join(' | ')
		).toContain('1 not paid');
		expect(
			v
				.all('.totals .unpaid')
				.map((e) => (e.textContent ?? '').trim())
				.join(' | ')
		).toContain('1 not paid');
	});

	it('A PRE-0212 LEDGER IS MARKED NOTHING: cannot-tell is not unpaid', () => {
		// The column does not exist on a deployment without 0212, so the field is
		// UNDEFINED rather than null. Rendering those as unpaid would put a
		// warning across an entire tournament's history on the strength of a
		// missing column.
		const legacy = row({ id: 1 });
		delete (legacy as { coin_transaction_id?: unknown }).coin_transaction_id;
		const v = open([legacy]);
		expect(v.all('.totals .unpaid')).toHaveLength(0);
		expect(v.all('.history .unpaid')).toHaveLength(0);
		// And the figure still renders, symbol and all.
		expect(v.one('.ledger-amount').textContent).toContain(COIN_SYMBOL);
	});
});

describe('the fold that feeds the panel agrees with what it renders', () => {
	it('rewardUnpaid keys on null and not on falsiness', () => {
		expect(rewardUnpaid({ coin_transaction_id: null })).toBe(true);
		expect(rewardUnpaid({ coin_transaction_id: 'coin-1' })).toBe(false);
		expect(rewardUnpaid({})).toBe(false);
		expect(rewardUnpaid({ coin_transaction_id: undefined })).toBe(false);
	});

	it('the award fold counts unpaid recipients, not unpaid awards', () => {
		const awards = rewardAwards([
			row({ id: 1, member_id: 'mem1', coin_transaction_id: 'coin-1' }),
			row({ id: 2, member_id: 'mem2', coin_transaction_id: null }),
			row({ id: 3, member_id: 'mem3', coin_transaction_id: null })
		]);
		expect(awards).toHaveLength(1);
		expect(awards[0].recipients).toBe(3);
		expect(awards[0].unpaid).toBe(2);
		// The figure is still what EACH registrant got.
		expect(awards[0].amount).toBe(10);
	});

	it('the totals fold sums unpaid across a whole entry', () => {
		const totals = rewardTotals([
			row({ id: 1, coin_transaction_id: null }),
			row({ id: 2, reason: '1st place', match_id: null, amount: 50, coin_transaction_id: null })
		]);
		expect(totals).toHaveLength(1);
		expect(totals[0].total).toBe(60);
		expect(totals[0].unpaid).toBe(2);
	});
});

describe('the empty state says where the coins go', () => {
	it('names the balance rather than only a ledger', () => {
		const v = open([]);
		// Whitespace-normalised: the template wraps, so the rendered text carries
		// a newline mid-sentence and a raw `toContain` would fail on prose that
		// is perfectly correct on screen.
		const note = (v.one('.note').textContent ?? '').replace(/\s+/g, ' ').trim();
		expect(note).toContain('No payouts yet');
		expect(note).toContain("paid onto the winner's IDEA Coin balance");
	});
});
