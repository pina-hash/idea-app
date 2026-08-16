// tests/coin-display.test.ts
//
// How a coin figure and a coin transaction RENDER. Pure -- no database, no
// browser, no fixture that agrees with itself.
//
// EVERY GUARANTEE HERE FAILED SILENTLY BEFORE IT WAS FIXED, which is the bar
// for a test in this repo:
//
//   * a +40 balance correction rendered in the award green and a -15 clawback
//     in the fine amber. Both showed the right NUMBER, so nothing looked
//     wrong -- a refund simply read as money earned;
//   * a payout's two stored rows rendered as two unrelated entries with
//     opposite signs, which reads as money leaving and separately arriving;
//   * and the standing constraint the whole model rests on -- physical and
//     digital are separate and are never added into one figure -- is the kind
//     of thing that only breaks once, quietly, in one component.

import { describe, expect, it } from 'vitest';
import { sumBalances, sumBalance } from '../src/lib/coin-balance';
import {
	coinAmountDisplay,
	coinMediumNote,
	coinTxnType,
	collapseCoinTransfers,
	COIN_SYMBOL
} from '../src/lib/coin-format';

const KINDS: Record<string, string> = {
	weekly_wage: 'award',
	disruptive_behavior: 'fine',
	eating_pass: 'purchase',
	balance_correction: 'adjustment',
	coin_payout: 'purchase',
	payout_physical_credit: 'adjustment'
};

let seq = 0;
function txn(over: Partial<Parameters<typeof collapseCoinTransfers>[0][number]> = {}) {
	seq += 1;
	return {
		id: `t${seq}`,
		category_id: 'weekly_wage',
		category_name: 'Weekly Wage',
		amount: 1,
		medium: 'physical' as string | null,
		transfer_id: null as string | null,
		note: null,
		actor_email: null,
		created_at: '2026-08-15T10:00:00.000Z',
		...over
	};
}

describe('the two balances are never conflated', () => {
	it('keeps physical and digital apart, and the total is their sum', () => {
		const rows = [
			{ id: 'a', category_id: 'x', amount: 120, medium: 'physical' as const, quantity: null, note: null, created_at: '', meta: null },
			{ id: 'b', category_id: 'x', amount: 35, medium: 'digital' as const, quantity: null, note: null, created_at: '', meta: null }
		];
		const b = sumBalances(rows);
		expect(b.physical_balance).toBe(120);
		expect(b.digital_balance).toBe(35);
		expect(b.balance).toBe(155);
		// Stated as its own assertion because it is the invariant, not a
		// coincidence of these two numbers.
		expect(b.physical_balance + b.digital_balance).toBe(b.balance);
	});

	it('reports a NEGATIVE physical balance rather than hiding it', () => {
		// Fined past what a student was holding is a real state, and the display
		// that only rendered a positive figure is what these two columns replaced.
		const b = sumBalances([
			{ id: 'a', category_id: 'x', amount: -14, medium: 'physical' as const, quantity: null, note: null, created_at: '', meta: null },
			{ id: 'b', category_id: 'x', amount: -60, medium: 'digital' as const, quantity: null, note: null, created_at: '', meta: null }
		]);
		expect(b.physical_balance).toBe(-14);
		expect(b.digital_balance).toBe(-60);
		expect(b.balance).toBe(-74);
	});

	it('counts a row with no medium as DIGITAL -- the backfill rule, not a guess', () => {
		// Every pre-0096 row meant the digital balance, and this is what keeps a
		// mixed-vintage list agreeing with the coin_balances view.
		const b = sumBalances([
			{ id: 'a', category_id: 'x', amount: 10, quantity: null, note: null, created_at: '', meta: null }
		]);
		expect(b.digital_balance).toBe(10);
		expect(b.physical_balance).toBe(0);
	});

	it('sumBalance is the same arithmetic, so the two can never disagree', () => {
		const rows = [
			{ id: 'a', category_id: 'x', amount: 7, medium: 'physical' as const, quantity: null, note: null, created_at: '', meta: null },
			{ id: 'b', category_id: 'x', amount: -3, medium: 'digital' as const, quantity: null, note: null, created_at: '', meta: null }
		];
		expect(sumBalance(rows)).toBe(sumBalances(rows).balance);
	});
});

describe('a correction reads as a correction', () => {
	it('gives an adjustment its own tone at BOTH signs', () => {
		const credit = coinAmountDisplay(40, 'adjustment');
		const clawback = coinAmountDisplay(-15, 'adjustment');
		expect(credit.tone).toBe('adjustment');
		expect(clawback.tone).toBe('adjustment');
		// The defect, stated directly: neither may borrow the award or fine tone.
		expect(credit.tone).not.toBe(coinAmountDisplay(40, 'award').tone);
		expect(clawback.tone).not.toBe(coinAmountDisplay(-15, 'fine').tone);
	});

	it('keeps the LEDGER sign -- a +40 refund is not a -40', () => {
		// The exact old bug: the sign was reconstructed from the type string and
		// the stored one discarded, so a credit rendered as a debit.
		expect(coinAmountDisplay(40, 'adjustment').text).toBe(`+40${COIN_SYMBOL}`);
		expect(coinAmountDisplay(-15, 'adjustment').text).toBe(`-15${COIN_SYMBOL}`);
	});

	it('still tells an ordinary award and fine apart from each other', () => {
		// The control: giving adjustments their own tone must not flatten the
		// two that were already right.
		expect(coinAmountDisplay(3, 'award').tone).toBe('positive');
		expect(coinAmountDisplay(-2, 'fine').tone).toBe('negative');
		expect(coinAmountDisplay(-150, 'purchase').tone).toBe('purchase');
	});

	it('classifies a correction from its category kind', () => {
		expect(coinTxnType({ category_id: 'balance_correction' }, KINDS.balance_correction)).toBe(
			'adjustment'
		);
		expect(coinTxnType({ category_id: 'weekly_wage' }, KINDS.weekly_wage)).toBe('award');
		expect(coinTxnType({ category_id: 'eating_pass' }, KINDS.eating_pass)).toBe('purchase');
		expect(coinTxnType({ category_id: 'disruptive_behavior' }, KINDS.disruptive_behavior)).toBe(
			'fine'
		);
	});

	it('falls back to adjustment, never to award, when the kind is unknown', () => {
		// The safe direction: an award mislabelled a correction is confusing, a
		// correction mislabelled an award is the defect this module exists for.
		expect(coinTxnType({ category_id: 'something_new' })).toBe('adjustment');
		expect(coinTxnType({ category_id: 'something_new' }, '')).toBe('adjustment');
	});
});

describe('a payout is one withdrawal, and distinct payouts stay distinct', () => {
	const pair = (id: string, amount: number, at = '2026-08-09T10:00:00.000Z') => [
		txn({ category_id: 'coin_payout', category_name: 'Coin Payout', amount: -amount, medium: 'digital', transfer_id: id, created_at: at }),
		txn({ category_id: 'payout_physical_credit', category_name: 'Coin Payout (physical credit)', amount, medium: 'physical', transfer_id: id, created_at: at })
	];

	it('collapses the two stored halves into ONE row', () => {
		const rows = collapseCoinTransfers(pair('t-1', 40));
		expect(rows).toHaveLength(1);
		expect(rows[0].isTransfer).toBe(true);
		expect(rows[0].amount).toBe(40);
	});

	it('does NOT merge two different withdrawals, even at the same instant', () => {
		// The discriminator. A single payout renders one row whether the pairing
		// key is right or catastrophically wrong; two at the same timestamp are
		// what tell "collapse the pair" from "collapse everything".
		const rows = collapseCoinTransfers([
			...pair('t-1', 25, '2026-08-10T10:15:00.000Z'),
			...pair('t-2', 15, '2026-08-10T10:15:00.000Z')
		]);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.amount).sort((a, b) => a - b)).toEqual([15, 25]);
	});

	it('names BOTH mediums, as a move between them', () => {
		const [row] = collapseCoinTransfers(pair('t-1', 40));
		expect(coinMediumNote(row)).toBe('Digital → Physical');
		// And never as one medium, which would be the conflation.
		expect(coinMediumNote(row)).not.toBe('Physical');
		expect(coinMediumNote(row)).not.toBe('Digital');
	});

	it('carries NO sign: a withdrawal gained and lost nothing', () => {
		const [row] = collapseCoinTransfers(pair('t-1', 40));
		const shown = coinAmountDisplay(row.amount, 'payout');
		expect(shown.tone).toBe('transfer');
		expect(shown.text).toBe(`40${COIN_SYMBOL}`);
		expect(shown.text).not.toContain('+');
		expect(shown.text).not.toContain('-');
	});

	it('keeps the end it knows when only one half is in the list', () => {
		// A row limit can cut between the halves; that must read as a partly
		// unknown move, not as a wrong one.
		const [debitOnly] = collapseCoinTransfers([pair('t-1', 40)[0]]);
		expect(debitOnly.amount).toBe(40);
		expect(coinMediumNote(debitOnly)).toBe('Digital');
	});

	it('leaves every non-transfer row exactly where it was', () => {
		const award = txn({ amount: 3 });
		const correction = txn({ category_id: 'balance_correction', amount: 40, medium: 'digital' });
		const rows = collapseCoinTransfers([award, ...pair('t-1', 40), correction]);
		expect(rows).toHaveLength(3);
		// Order preserved: the merged row takes the position of the first half.
		expect(rows[0].id).toBe(award.id);
		expect(rows[1].isTransfer).toBe(true);
		expect(rows[2].id).toBe(correction.id);
	});

	it('types a transfer as a payout however its category is configured', () => {
		expect(coinTxnType({ category_id: 'coin_payout', transfer_id: 't-1' }, 'purchase')).toBe(
			'payout'
		);
		// The physical half is an adjustment-kind category, and still a payout.
		expect(
			coinTxnType({ category_id: 'payout_physical_credit', transfer_id: 't-1' }, 'adjustment')
		).toBe('payout');
	});

	it('rows with no transfer id pass through untouched -- a pre-0096 feed', () => {
		const plain = [txn({ amount: 3 }), txn({ amount: -2 })];
		const rows = collapseCoinTransfers(plain);
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => !r.isTransfer)).toBe(true);
	});
});

describe('an ordinary row always says which medium it moved', () => {
	it('labels physical and digital', () => {
		expect(coinMediumNote({ ...txn({ medium: 'physical' }), isTransfer: false })).toBe('Physical');
		expect(coinMediumNote({ ...txn({ medium: 'digital' }), isTransfer: false })).toBe('Digital');
	});
});
