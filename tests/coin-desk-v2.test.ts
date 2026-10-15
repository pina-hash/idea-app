// tests/coin-desk-v2.test.ts
//
// The pure layer of the Coin Desk's IDEA Coin V2 surfaces ($lib/coin-desk/v2).
//
// WHY THESE ARE PINNED rather than left to a harness: each decides what a
// person does NOT see, and that fails silently.
//
//   * `deskHistoryRows` DROPS rows. Folding an undone pair into one line is
//     right; dropping a reversal whose original is not in the list would hide
//     a movement of the balance with nothing on screen to say so.
//   * `isUndoable` decides where no Undo is offered.
//   * `isMissingFunction` decides between "not available yet" and an error.
//   * `categoryPatch` decides which fields a save sends; a field sent when it
//     did not move is an audit row nobody asked for, and one dropped is an
//     edit that silently did not save.

import { describe, expect, test } from 'vitest';
import {
	autopayGroups,
	categoryDraft,
	categoryPatch,
	deskHistoryRows,
	isMissingFunction,
	isMonday,
	isUndoable,
	moveItem,
	sectionsNeverFined,
	semesterProblem,
	sortDebt,
	withNoPayWeek,
	type DeskTxn,
	type SettingsCategory
} from '../src/lib/coin-desk/v2';

function txn(id: string, extra: Partial<DeskTxn> = {}): DeskTxn {
	return {
		id,
		category_id: 'disruptive_behavior',
		category_name: 'Disruptive',
		amount: -3,
		medium: 'digital',
		transfer_id: null,
		created_at: '2026-10-14T18:00:00Z',
		...extra
	};
}

describe('the history the desk shows', () => {
	test('an undone pair is ONE line, marked undone, and nothing else moves', () => {
		const rows = deskHistoryRows([
			txn('r1', { category_id: 'reversal', category_name: 'Reversal (Undo)', amount: 3, reverses: 'a' }),
			txn('a', { reversed: true }),
			txn('b', { amount: -2 })
		]);
		// Present: the original (undone) and the untouched row. Absent: the reversal.
		expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
		expect(rows[0].undone).toBe(true);
		expect(rows[0].undoneBy?.id).toBe('r1');
		expect(rows[1].undone).toBe(false);
	});

	test('a reversal whose original is older than the list is KEPT, so no balance movement is hidden', () => {
		const rows = deskHistoryRows([
			txn('r1', { category_id: 'reversal', amount: 3, reverses: 'not-in-list' }),
			txn('b')
		]);
		expect(rows.map((r) => r.id)).toEqual(['r1', 'b']);
	});

	test('a reversed row whose reversal is not in the list still reads undone', () => {
		const rows = deskHistoryRows([txn('a', { reversed: true })]);
		expect(rows).toHaveLength(1);
		expect(rows[0].undone).toBe(true);
		expect(rows[0].undoneBy).toBeNull();
	});

	test("a payout keeps its digital half and drops its physical credit; a lone physical row stays, uncounted", () => {
		const rows = deskHistoryRows([
			txn('d', { category_id: 'coin_payout', amount: -6, transfer_id: 'x1' }),
			txn('p', { category_id: 'payout_physical_credit', amount: 6, medium: 'physical', transfer_id: 'x1' }),
			txn('cash', { category_id: 'eating_pass', amount: -150, medium: 'physical' })
		]);
		expect(rows.map((r) => r.id)).toEqual(['d', 'cash']);
		expect(rows[0].isPayout).toBe(true);
		expect(rows[0].counted).toBe(true);
		expect(rows[1].counted).toBe(false);
	});
});

describe('where Undo is offered', () => {
	test('offered on an ordinary digital row', () => {
		expect(isUndoable(txn('a'))).toBe(true);
		expect(isUndoable(txn('a', { medium: null }))).toBe(true);
	});
	test('never on a reversal, an undone row, a payout half or a physical row', () => {
		expect(isUndoable(txn('a', { category_id: 'reversal' }))).toBe(false);
		expect(isUndoable(txn('a', { reverses: 'b' }))).toBe(false);
		expect(isUndoable(txn('a', { reversed: true }))).toBe(false);
		expect(isUndoable(txn('a', { transfer_id: 'x' }))).toBe(false);
		expect(isUndoable(txn('a', { medium: 'physical' }))).toBe(false);
	});
});

describe('a missing V2 function', () => {
	test('is recognised by code and by message', () => {
		expect(isMissingFunction({ code: 'PGRST202', message: 'x' })).toBe(true);
		expect(isMissingFunction({ code: '42883', message: 'x' })).toBe(true);
		expect(isMissingFunction({ message: 'function public.coin_debt_list() does not exist' })).toBe(true);
		expect(isMissingFunction({ message: 'Could not find the function public.coin_debt_list' })).toBe(true);
	});
	test('is not every error', () => {
		expect(isMissingFunction({ code: '42501', message: 'permission denied' })).toBe(false);
		expect(isMissingFunction({ code: 'P0001', message: 'Only site admins can read the debt list.' })).toBe(false);
		expect(isMissingFunction(null)).toBe(false);
	});
});

describe('a category save sends only what moved', () => {
	const flat: SettingsCategory = {
		id: 'eating_violation',
		name: 'Eating',
		kind: 'fine',
		pricing_model: 'flat',
		amount: 5,
		min_amount: null,
		max_amount: null,
		unit_label: null,
		cap_period: null,
		cap_count: null,
		loggable: true,
		active: true,
		sort_order: 1,
		explanation: 'Costs 5 coins.'
	};

	test('an untouched draft sends nothing', () => {
		expect(categoryPatch(flat, categoryDraft(flat))).toBeNull();
	});

	test('a moved amount sends the amount and leaves every other field null', () => {
		const d = { ...categoryDraft(flat), amount: '4.5' };
		const out = categoryPatch(flat, d);
		expect(out && 'params' in out ? out.params : null).toEqual({
			p_id: 'eating_violation',
			p_name: null,
			p_amount: 4.5,
			p_min_amount: null,
			p_max_amount: null,
			p_cap_period: null,
			p_cap_count: null,
			p_active: null,
			p_explanation: null
		});
	});

	test('clearing an explanation sends an empty string, never null (null means leave it)', () => {
		const out = categoryPatch(flat, { ...categoryDraft(flat), explanation: '' });
		expect(out && 'params' in out ? out.params.p_explanation : 'x').toBe('');
	});

	test('a cap needs a whole count, and turning a cap off sends none', () => {
		expect(categoryPatch(flat, { ...categoryDraft(flat), cap_period: 'day', cap_count: '' })).toEqual({
			problem: 'A cap needs a whole count of 1 or more.'
		});
		const capped = { ...flat, cap_period: 'day' as const, cap_count: 1 };
		const off = categoryPatch(capped, { ...categoryDraft(capped), cap_period: 'none' });
		expect(off && 'params' in off ? off.params.p_cap_period : null).toBe('none');
	});

	test('a range amount field never moves on a flat category', () => {
		const out = categoryPatch(flat, { ...categoryDraft(flat), min_amount: '9' });
		expect(out).toBeNull();
	});
});

describe('the settings helpers', () => {
	test('a Monday is a Monday', () => {
		expect(isMonday('2026-10-12')).toBe(true);
		expect(isMonday('2026-10-13')).toBe(false);
		expect(isMonday('2026-02-30')).toBe(false);
	});

	test('a no-pay week list stays sorted and free of repeats', () => {
		expect(withNoPayWeek(['2026-12-21', '2026-11-23'], '2026-11-23')).toEqual(['2026-11-23', '2026-12-21']);
	});

	test('a class whose automatic check-in comes before the fine is never fined, and only that class', () => {
		const sections = [
			{ id: 'a', label: 'A', teacher_email: null, economy_on: true, auto_checkin_minutes: 15 },
			{ id: 'b', label: 'B', teacher_email: null, economy_on: true, auto_checkin_minutes: 30 },
			{ id: 'c', label: 'C', teacher_email: null, economy_on: true, auto_checkin_minutes: 20 },
			{ id: 'd', label: 'D', teacher_email: null, economy_on: true, auto_checkin_minutes: null }
		];
		expect(sectionsNeverFined(sections, 20).map((s) => s.id)).toEqual(['a']);
	});

	test('semester rows are checked before they are sent', () => {
		expect(semesterProblem([{ key: '2026-fall', start: '2026-08-17', end: '2026-12-18' }])).toBeNull();
		expect(semesterProblem([{ key: 'Fall 2026', start: '2026-08-17', end: '2026-12-18' }])).toMatch(/lowercase/);
		expect(semesterProblem([{ key: 'x', start: '2026-12-18', end: '2026-08-17' }])).toMatch(/ends before/);
	});

	test('moving a fine button off either end changes nothing', () => {
		expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
		expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
		expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
	});
});

describe('the debt list and autopay', () => {
	test('debt is deepest first, whatever order arrives', () => {
		const out = sortDebt([
			{ email: 'a@x', name: 'A', section: null, balance: '-2.50' },
			{ email: 'b@x', name: 'B', section: null, balance: -10 }
		]);
		expect(out.map((r) => r.email)).toEqual(['b@x', 'a@x']);
	});

	test('rows group under their run; a run that paid nobody is kept; loose rows come last', () => {
		const groups = autopayGroups({
			paused: false,
			runs: [
				{ id: 2, trigger: 'admin', started_at: 't2', finished_at: 't2', result: null },
				{ id: 1, trigger: 'nightly', started_at: 't1', finished_at: 't1', result: null }
			],
			rows: [
				{ id: 'w', at: 't1', email: 'a@x', name: 'A', category_id: 'weekly_wage', category: 'Wage', amount: 1, note: null, run_id: 1, reversed: false },
				{ id: 'h', at: 't0', email: 'a@x', name: 'A', category_id: 'long_bathroom_break', category: 'Long Hall Pass', amount: -2, note: null, run_id: null, reversed: false }
			]
		});
		expect(groups.map((g) => [g.run?.id ?? null, g.rows.map((r) => r.id)])).toEqual([
			[2, []],
			[1, ['w']],
			[null, ['h']]
		]);
	});
});
