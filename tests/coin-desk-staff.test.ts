// tests/coin-desk-staff.test.ts
//
// The pure halves of the four IDEA Coin V2 staff areas (queue, payday, digest,
// tournament transfer). Each is arithmetic or a refusal rule whose mistake
// would be silent on screen: a split that pays a cent more than the team
// earned, an Undo offered to somebody the database refuses, an "Other"
// donation approved with no amount.
//
// Expected values are written out by hand from the rule stated in each
// module's header, never computed with the function under test.

import { describe, expect, it } from 'vitest';
import {
	entryTotalDefault,
	tournamentAmounts,
	transferPlan,
	type TournamentEntry,
	type TournamentPending
} from '../src/lib/coin-desk/tournament-transfer';
import {
	amountRequired,
	amountSeed,
	approveAllSkips,
	approveAllWords,
	approveCheck,
	cardDetail,
	normalizeQueue,
	queueRefusal,
	totalPending,
	type QueueCard
} from '../src/lib/coin-desk/queue';
import { parseCoinCount, settleHeadline, settleSummary, tickedCoins, tickedIds, type PaydayRequest } from '../src/lib/coin-desk/payday';
import { COIN_SYMBOL } from '../src/lib/coin-format';
import { digestNet, normalizeDigest, pushBlockedWords } from '../src/lib/coin-desk/digest';

const member = (user_id: string | null, name: string, has_account = user_id !== null) => ({ user_id, name, has_account });

const team = (over: Partial<TournamentEntry> = {}): TournamentEntry => ({
	entry_id: 'e1',
	name: 'Gearheads',
	earned: 10,
	placement: 1,
	placement_default: 3,
	members: [member('u1', 'Ana'), member('u2', 'Ben'), member('u3', 'Cy')],
	...over
});

describe('tournamentAmounts', () => {
	it('duplicate gives every member the whole total', () => {
		expect(tournamentAmounts(team(), 'duplicate').map((m) => m.amount)).toEqual([10, 10, 10]);
	});

	it('split divides to the cent and the shares add up to the total exactly', () => {
		// 10 / 3 = 3.333..., so 1000 cents is 334 + 333 + 333.
		const rows = tournamentAmounts(team(), 'split');
		expect(rows.map((m) => m.amount)).toEqual([3.34, 3.33, 3.33]);
		expect(Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100)).toBe(1000);
	});

	it('split counts a walk-up in the divisor and marks its share unpaid', () => {
		const rows = tournamentAmounts(
			team({ earned: 9, members: [member('u1', 'Ana'), member(null, 'Walk-up'), member('u3', 'Cy')] }),
			'split'
		);
		expect(rows.map((m) => m.amount)).toEqual([3, 3, 3]);
		expect(rows.map((m) => m.paid)).toEqual([true, false, true]);
	});

	it('a member with an id but no account is not payable', () => {
		const rows = tournamentAmounts(team({ members: [member('u9', 'Gone', false)] }), 'duplicate');
		expect(rows[0].paid).toBe(false);
	});

	it('takes an edited total, and never goes below zero', () => {
		expect(tournamentAmounts(team(), 'split', 6).map((m) => m.amount)).toEqual([2, 2, 2]);
		expect(tournamentAmounts(team(), 'duplicate', -5).map((m) => m.amount)).toEqual([0, 0, 0]);
	});

	it('the default total is earned when above zero, else the placement default', () => {
		expect(entryTotalDefault(team({ earned: 7.5 }))).toBe(7.5);
		expect(entryTotalDefault(team({ earned: 0, placement_default: 2 }))).toBe(2);
		expect(entryTotalDefault(team({ earned: '0', placement_default: '0' }))).toBe(0);
	});
});

describe('transferPlan', () => {
	const t: TournamentPending = {
		id: 't1',
		name: 'Fall Cup',
		updated_at: '2026-10-14T00:00:00Z',
		has_placement_rules: false,
		entries: [
			team(),
			team({
				entry_id: 'e2',
				name: 'Solo',
				earned: 0,
				placement: 2,
				placement_default: 2,
				members: [member('u4', 'Dee'), member(null, 'Walk-up')]
			})
		]
	};

	it('duplicate: 3 x 10 plus one payable member of the second team at 2', () => {
		const plan = transferPlan(t, 'duplicate', { e1: 10, e2: 2 }, {});
		expect(plan.lines).toEqual([
			{ user_id: 'u1', amount: 10 },
			{ user_id: 'u2', amount: 10 },
			{ user_id: 'u3', amount: 10 },
			{ user_id: 'u4', amount: 2 }
		]);
		expect(plan.coins).toBe(32);
		expect(plan.students).toBe(4);
		expect(plan.skipped).toBe(1);
		expect(plan.problem).toBeNull();
	});

	it('split: the walk-up keeps its share unpaid, so the second team pays 1 of 2', () => {
		const plan = transferPlan(t, 'split', { e1: 10, e2: 2 }, {});
		expect(plan.lines.map((l) => l.amount)).toEqual([3.34, 3.33, 3.33, 1]);
		expect(plan.coins).toBe(11);
	});

	it('an override wins, a zero drops the line, and a bad one is a problem', () => {
		expect(transferPlan(t, 'duplicate', { e1: 10, e2: 2 }, { 'e1:u2': '4.5' }).lines[1]).toEqual({ user_id: 'u2', amount: 4.5 });
		expect(transferPlan(t, 'duplicate', { e1: 10, e2: 2 }, { 'e1:u2': '0' }).lines.map((l) => l.user_id)).toEqual(['u1', 'u3', 'u4']);
		expect(transferPlan(t, 'duplicate', { e1: 10, e2: 2 }, { 'e1:u2': 'abc' }).problem).toMatch(/Ben/);
	});
});

const card = (over: Partial<QueueCard> = {}): QueueCard => ({
	id: 'c1',
	kind: 'donation',
	email: 'ana@boscotech.net',
	name: 'Ana Reyes',
	section_id: null,
	section: 'IDEA100 Block 2',
	amount: 4,
	photo_path: null,
	payload: { item: 'Tissue box', rate: 2, quantity: 2, other: false },
	note: null,
	status: 'pending',
	decided_at: null,
	decision_note: null,
	result: null,
	created_at: '2026-10-14T18:00:00Z',
	balance: 10,
	...over
});

describe('the queue', () => {
	it('an Other donation needs an amount and starts empty; a listed one keeps its amount', () => {
		const other = card({ amount: null, payload: { item: 'Glue sticks', quantity: 1, other: true } });
		expect(amountRequired(other)).toBe(true);
		expect(amountSeed(other)).toBe('');
		expect(approveCheck(other, '').ok).toBe(false);
		expect(approveCheck(other, '3')).toEqual({ ok: true, amount: 3 });
		expect(amountRequired(card())).toBe(false);
		expect(approveCheck(card(), '')).toEqual({ ok: true, amount: null });
	});

	it('a kind with no amount box never sends one', () => {
		expect(approveCheck(card({ kind: 'background' }), '99')).toEqual({ ok: true, amount: null });
	});

	it('refuses an amount out of range', () => {
		expect(approveCheck(card(), '-1').ok).toBe(false);
		expect(approveCheck(card(), '100001').ok).toBe(false);
	});

	it('says the kind-specific detail from the payload', () => {
		expect(cardDetail(card())).toEqual([`Tissue box x 2 at 2${COIN_SYMBOL} each`]);
		expect(cardDetail(card({ kind: 'background', payload: { width: 1920, height: 1080 } }))).toEqual(['1920 x 1080 pixels']);
		expect(cardDetail(card({ kind: 'reported_coins', payload: { count: 12 } }))[0]).toBe('Counted on hand: 12 coins');
	});

	it('drops an unknown kind and counts every kind', () => {
		const q = normalizeQueue({
			pending: [card(), { ...card(), id: 'x', kind: 'mystery' }],
			counts: { donation: 2, background: 1, mystery: 4 },
			recent: []
		});
		expect(q.pending.map((c) => c.id)).toEqual(['c1']);
		expect(totalPending(q.counts)).toBe(3);
	});

	it('Approve All counts its skips and says them', () => {
		expect(approveAllSkips([card(), card({ id: 'c2', amount: null })], 'donation')).toBe(1);
		expect(approveAllSkips([card({ kind: 'background', amount: null })], 'background')).toBe(0);
		expect(approveAllWords({ ok: true, total: 5, succeeded: 3, skipped: 1, refused: 1 })).toBe(
			'3 of 5 approved, 1 skipped because it needs an amount from you, 1 refused.'
		);
	});

	it('every documented refusal has its own words', () => {
		for (const reason of ['not_found', 'already_decided', 'amount_required', 'amount', 'pass_already_active', 'tier_changed']) {
			expect(queueRefusal({ reason })).not.toMatch(/^Refused: /);
		}
	});
});

describe('payday', () => {
	const reqs: PaydayRequest[] = [
		{ id: 'r1', email: 'a@x', name: 'Ana', coins: 5, requested_at: '', balance: 5 },
		{ id: 'r2', email: 'b@x', name: 'Ben', coins: '2.5', requested_at: '', balance: 3 },
		{ id: 'r3', email: 'c@x', name: 'Cy', coins: 4, requested_at: '', balance: -1 }
	];

	it('ticked by default; an untick leaves only that one out', () => {
		expect(tickedIds(reqs, {})).toEqual(['r1', 'r2', 'r3']);
		expect(tickedIds(reqs, { r2: false })).toEqual(['r1', 'r3']);
		expect(tickedCoins(reqs, { r3: false })).toBe(7.5);
	});

	it('summarizes settled, partial and no-balance rows', () => {
		const s = settleSummary(
			{
				ok: true,
				settled: 2,
				results: [
					{ id: 'r1', ok: true, paid: 5, partial: false },
					{ id: 'r2', ok: true, paid: 1, partial: true },
					{ id: 'r3', ok: false, reason: 'no_balance' }
				]
			},
			reqs
		);
		expect([s.settled, s.partial, s.noBalance, s.other, s.paid]).toEqual([2, 1, 1, 0, 6]);
		expect(settleHeadline(s, 1)).toMatch(/1 unticked request stays held for the next payday\.$/);
	});

	it('a coin count is positive and at most 100000', () => {
		expect(parseCoinCount('3.456')).toBe(3.46);
		expect(parseCoinCount('0')).toBeNull();
		expect(parseCoinCount('')).toBeNull();
		expect(parseCoinCount('100001')).toBeNull();
	});
});

describe('the digest', () => {
	it('offers Undo only where the row says reversible in so many words', () => {
		const d = normalizeDigest({
			autopay: [
				{ id: 'a', reversible: true, reversed: false },
				{ id: 'b', reversible: 'yes', reversed: false },
				{ id: 'c', reversible: true, reversed: true },
				{ id: 'd' }
			],
			money: { in: '12.5', out: 20 },
			queue: '3'
		});
		expect(d.autopay.map((r) => r.reversible)).toEqual([true, false, false, false]);
		expect(d.queue).toBe(3);
		expect(digestNet(d.money)).toBe(-7.5);
		expect(d.notify).toBe(false);
	});

	it('says why a browser cannot take the notification, and nothing when it can', () => {
		expect(pushBlockedWords('available')).toBeNull();
		for (const a of ['unconfigured', 'unsupported', 'denied'] as const) expect(pushBlockedWords(a)).toBeTruthy();
	});
});
