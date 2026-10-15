// tests/coin-fine.test.ts
//
// THE FINE SCREEN'S PURE HALF (IDEA Coin V2, ledger 0383), and the hall pass's
// warning and fine words (decision 67, 0243). The database decides every
// amount and every refusal; what would regress silently on the way to a
// phone is the ORDER of the tiles (a thumb learns where a name is), the
// buttons that exist (a retired fine must not be offered), where the screen
// lands, and that a refusal is words rather than a code.

import { describe, expect, test } from 'vitest';
import {
	awardButtons,
	fineButtons,
	fineRefusalWords,
	firstNameOf,
	landingSection,
	namesSentence,
	parseFineAmount,
	parseRepairCost,
	postedIds,
	readCoinFinePrefs,
	tileNames,
	tileOrder,
	type FineCategory,
	type FineSection,
	type FineStudent
} from '../src/lib/coin-fine/fine';
import {
	hallPassCloseVerdict,
	hallPassDateLabel,
	hallPassEventRule,
	hallPassEventWords,
	hallPassEventsShown,
	type HallPassEvents
} from '../src/lib/classroom/hall-pass';
import { readFileSync } from 'node:fs';

const st = (display_name: string | null, email: string): FineStudent => ({
	email,
	display_name,
	balance: 0,
	out_on_pass: false,
	no_shop: false
});

describe('tiles: first names, a fixed order, and a tie broken by the last initial', () => {
	test('"Last, First" and "First Last" both give the first name', () => {
		expect(firstNameOf(st('Reyes, Ana', 'a@x')).first).toBe('Ana');
		expect(firstNameOf(st('Ana Reyes', 'a@x')).first).toBe('Ana');
		// A one-word name is what the person is called, never an empty tile.
		expect(firstNameOf(st('Prince', 'p@x')).first).toBe('Prince');
		expect(firstNameOf(st(null, 'jo.lee@x')).first).toBe('jo.lee');
	});

	test('the order is alphabetical by first name, whatever order the roster arrived in', () => {
		const roster = [st('Zed, Ana', 'z@x'), st('Okonkwo, Ben', 'b@x'), st('Abel, Ana', 'a@x'), st('Chen, Carla', 'c@x')];
		const order = tileOrder(roster).map((s) => s.email);
		expect(order).toEqual(['a@x', 'z@x', 'b@x', 'c@x']);
		// The same set in another order lands in the same order: tiles never move.
		expect(tileOrder([...roster].reverse()).map((s) => s.email)).toEqual(order);
	});

	test('a shared first name gets the last initial, and only then', () => {
		const names = tileNames([st('Reyes, Ana', 'a@x'), st('Rios, Ana', 'b@x'), st('Okonkwo, Ben', 'c@x')]);
		expect(names.get('c@x')).toBe('Ben');
		// Both share "Ana R.", so the whole name is the honest label.
		expect(names.get('a@x')).toBe('Ana Reyes');
		const two = tileNames([st('Reyes, Ana', 'a@x'), st('Lopez, Ana', 'b@x')]);
		expect(two.get('a@x')).toBe('Ana R.');
		expect(two.get('b@x')).toBe('Ana L.');
	});
});

const cat = (over: Partial<FineCategory> & Pick<FineCategory, 'id'>): FineCategory => ({
	name: over.id,
	kind: 'fine',
	pricing_model: 'flat',
	amount: 3,
	min_amount: null,
	max_amount: null,
	loggable: true,
	active: true,
	...over
});

describe('the buttons are the settings list, in its order, and only what can post', () => {
	const categories = [
		cat({ id: 'eating_violation', name: 'Eating', amount: '5.00' }),
		cat({ id: 'shop_safety_violation', name: 'Shop Safety', amount: 12 }),
		cat({ id: 'retired_one', active: false }),
		cat({ id: 'helping', kind: 'award', amount: 2, sort_order: 2 }),
		cat({ id: 'cleanup', kind: 'award', pricing_model: 'range', amount: null, min_amount: 1, max_amount: 5, sort_order: 1 }),
		cat({ id: 'extra_credit', kind: 'award', pricing_model: 'formula' }),
		cat({ id: 'perfect_score', kind: 'award', pricing_model: 'formula' })
	];

	test('order kept, property damage drawn from its token, the unknown and the retired left out', () => {
		const b = fineButtons({
			fineButtons: ['shop_safety_violation', 'property_damage', 'nope', 'retired_one', 'eating_violation', 'helping'],
			categories
		});
		expect(b.map((x) => x.id)).toEqual(['shop_safety_violation', 'property_damage', 'eating_violation']);
		expect(b[0]).toMatchObject({ name: 'Shop Safety', amount: 12, ask: 'none' });
		expect(b[1]).toMatchObject({ ask: 'property_damage', amount: null });
		// A numeric that arrived as a string is still a number on the button.
		expect(b[2].amount).toBe(5);
	});

	test('awards: active and loggable, never a formula or extra credit, a range asks', () => {
		const a = awardButtons(categories);
		expect(a.map((x) => x.id)).toEqual(['cleanup', 'helping']);
		expect(a[0]).toMatchObject({ ask: 'amount', min: 1, max: 5 });
		expect(a[1]).toMatchObject({ ask: 'none', amount: 2 });
	});

	test('a typed amount is checked against the bounds before anything is sent', () => {
		expect(parseFineAmount('3', { min: 1, max: 5 })).toEqual({ ok: true, amount: 3 });
		expect(parseFineAmount('2.50', { min: null, max: null })).toEqual({ ok: true, amount: 2.5 });
		expect(parseFineAmount('9', { min: 1, max: 5 }).ok).toBe(false);
		expect(parseFineAmount('abc', { min: null, max: null }).ok).toBe(false);
		expect(parseFineAmount('0', { min: null, max: null }).ok).toBe(false);
		expect(parseRepairCost('$12.50')).toEqual({ ok: true, dollars: 12.5 });
		expect(parseRepairCost('').ok).toBe(false);
	});
});

describe('where the screen lands, and what it remembers', () => {
	const s = (id: string, in_session = false): FineSection => ({ id, label: id, teacher_email: null, in_session, students: 1 });
	const A = 'aaaaaaaa-0000';
	const B = 'bbbbbbbb-0000';
	const C = 'cccccccc-0000';

	test('the class in session wins, then the last used, then the first', () => {
		expect(landingSection([s(A), s(B, true)], A)).toBe(B);
		expect(landingSection([s(A, true), s(B, true)], B)).toBe(B);
		expect(landingSection([s(A), s(B)], B)).toBe(B);
		expect(landingSection([s(A), s(B)], C)).toBe(A);
		expect(landingSection([], A)).toBeNull();
	});

	test('the preference is read, validated, and anything else is dropped', () => {
		expect(readCoinFinePrefs({ coinFine: { lastSection: A } })).toEqual({ lastSection: A });
		expect(readCoinFinePrefs({ coinFine: { lastSection: 42 } })).toEqual({ lastSection: null });
		expect(readCoinFinePrefs({ coinFine: { lastSection: '<script>' } })).toEqual({ lastSection: null });
		expect(readCoinFinePrefs({ coinFine: [] })).toEqual({ lastSection: null });
		expect(readCoinFinePrefs(null)).toEqual({ lastSection: null });
	});
});

describe('a post and a refusal, in words', () => {
	test('a refusal names no code', () => {
		for (const reason of ['cap_reached', 'insufficient', 'too_many', 'error', 'already_reversed', 'something_new']) {
			const w = fineRefusalWords({ reason, message: null });
			expect(w.length).toBeGreaterThan(5);
			expect(w).not.toMatch(/_|PGRST|P0001|coin_/);
		}
		expect(fineRefusalWords({ reason: 'cap_reached', cap_period: 'month' })).toContain('this month');
	});

	test('the undo takes every id the post made and nothing it did not', () => {
		expect(
			postedIds({
				total: 3,
				succeeded: 2,
				refused: 1,
				results: [
					{ email: 'a', ok: true, transaction_id: 't1' },
					{ email: 'b', ok: false, reason: 'cap_reached' },
					{ email: 'c', ok: true, transaction_id: 't2' }
				]
			})
		).toEqual(['t1', 't2']);
	});

	test('names read as a sentence', () => {
		expect(namesSentence(['Ana'])).toBe('Ana');
		expect(namesSentence(['Ana', 'Ben'])).toBe('Ana and Ben');
		expect(namesSentence(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B, C and 3 more');
	});
});

describe('the hall pass warning and fine (decision 67)', () => {
	const payload: HallPassEvents = {
		scope: 'student',
		warn_minutes: 10,
		fine_minutes: '20',
		events: [
			{ pass_id: 'p1', kind: 'fine', minutes: '24.6', created_at: '2026-10-14T18:00:00Z', opened_at: '2026-10-14T17:35:00Z', fine_amount: '2.00' },
			{ pass_id: 'p1', kind: 'warning', minutes: 24.6, created_at: '2026-10-14T18:00:00Z', opened_at: '2026-10-14T17:35:00Z' },
			{ pass_id: 'p0', kind: 'warning', minutes: 12, created_at: '2026-10-13T18:00:00Z', opened_at: '2026-10-13T17:48:00Z' }
		]
	};

	test('a word and a glyph per row, never colour alone', () => {
		expect(hallPassEventWords(payload.events[0])).toMatchObject({ tone: 'fine', word: 'Fined 2i¢: 24 min' });
		expect(hallPassEventWords(payload.events[1])).toMatchObject({ tone: 'warning', word: 'Warning: 24 min' });
		for (const e of payload.events) expect(hallPassEventWords(e).glyph.length).toBeGreaterThan(0);
	});

	test('a fined pass is one row, not a fine and a warning', () => {
		expect(hallPassEventsShown(payload.events).map((e) => `${e.pass_id}:${e.kind}`)).toEqual(['p1:fine', 'p0:warning']);
	});

	test('the rule is said from the payload, so it follows the settings', () => {
		expect(hallPassEventRule(payload)).toContain('10 minutes');
		expect(hallPassEventRule(payload)).toContain('20 minutes');
		expect(hallPassEventRule({ warn_minutes: 7, fine_minutes: 15 })).toContain('15 minutes');
	});

	test('a student is told plainly after signing back in, and only about that pass', () => {
		const fined = hallPassCloseVerdict({ pass_id: 'p1' }, payload);
		expect(fined).toContain('2i¢');
		const warned = hallPassCloseVerdict({ pass_id: 'p0' }, payload);
		expect(warned).toContain('warning');
		expect(hallPassCloseVerdict({ pass_id: 'p9' }, payload)).toBeNull();
		// The close's own flags speak when the events cannot.
		expect(hallPassCloseVerdict({ pass_id: 'p9', fined: true }, null)).toContain('fined');
		expect(hallPassCloseVerdict({ pass_id: 'p9', warned: true }, null)).toContain('warning');
	});

	test('the date is the school day with no weekday name', () => {
		// 01:30 UTC on Oct 15 is still Oct 14 in Los Angeles.
		expect(hallPassDateLabel('2026-10-15T01:30:00Z')).toBe('Oct 14');
	});

	test('the old "no coin link, no warning" sentence is gone from the module', () => {
		const src = readFileSync('src/lib/classroom/hall-pass.ts', 'utf8');
		expect(src).not.toContain('NO WARNING TONE AT ANY DURATION');
		expect(src).toContain('decision 67');
	});
});
