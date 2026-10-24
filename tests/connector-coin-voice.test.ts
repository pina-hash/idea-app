// tests/connector-coin-voice.test.ts
//
// The coin tool's decisions from his words (src/lib/server/connector/coin-voice.ts),
// pure. The sentences are his own requests from the saved request list (names
// changed: this repository is public) and Mr. Pina's amount rule of 2026-10-23:
// a listed amount is used; a saved phrase's default is used unless he says a
// number; a new phrase with a number becomes Custom with that number; no number
// and nothing listed asks, and writes nothing.

import { describe, expect, test } from 'vitest';
import { decideCoin, kindIn, numberIn, phraseOf, reasonIn, type VoiceCatalog } from '../src/lib/server/connector/coin-voice';

const CATALOG: VoiceCatalog = {
	categories: [
		{ id: 'off_task_device_use', name: 'Off-Task Device Use', kind: 'fine', pricing_model: 'flat', amount: 2, min_amount: null, max_amount: null },
		{ id: 'disruptive_behavior', name: 'Disruptive Behavior', kind: 'fine', pricing_model: 'flat', amount: 3, min_amount: null, max_amount: null },
		{ id: 'eating_violation', name: 'Eating Violation', kind: 'fine', pricing_model: 'flat', amount: 5, min_amount: null, max_amount: null },
		{ id: 'above_and_beyond', name: 'Above and Beyond', kind: 'award', pricing_model: 'range', amount: null, min_amount: 1, max_amount: 5 },
		{ id: 'correct_answer_in_class', name: 'Correct Answer in Class', kind: 'award', pricing_model: 'flat', amount: 1, min_amount: null, max_amount: null },
		{ id: 'competition_winnings', name: 'Competition Winnings', kind: 'award', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null },
		{ id: 'eating_pass', name: 'Eating Pass', kind: 'purchase', pricing_model: 'flat', amount: 150, min_amount: null, max_amount: null },
		{ id: 'custom_award', name: 'Custom Award', kind: 'award', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null },
		{ id: 'custom_fine', name: 'Custom Fine', kind: 'fine', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null },
		{ id: 'custom_purchase', name: 'Custom Purchase', kind: 'purchase', pricing_model: 'variable', amount: null, min_amount: null, max_amount: null }
	],
	aliases: [
		{ id: 'a1', phrase: 'phone', kind: 'fine', category_id: 'off_task_device_use', amount: null },
		{ id: 'a2', phrase: 'playing games', kind: 'fine', category_id: 'off_task_device_use', amount: null },
		{ id: 'a3', phrase: 'messing around', kind: 'fine', category_id: 'disruptive_behavior', amount: null },
		{ id: 'a4', phrase: 'eating', kind: 'fine', category_id: 'eating_violation', amount: null },
		{ id: 'a5', phrase: 'eating pass', kind: 'purchase', category_id: 'eating_pass', amount: null },
		{ id: 'a6', phrase: 'wearing green', kind: 'award', category_id: 'above_and_beyond', amount: 1 },
		{ id: 'a7', phrase: 'hitting a sick trick shot', kind: 'award', category_id: 'custom_award', amount: 10 }
	]
};
const decide = (said: string, names: string[], amount: number | null = null, catalog = CATALOG) => decideCoin({ said, amount, nameWords: names, catalog });

describe('reading his words', () => {
	test('numbers: figures, words, beside a coin word, and never a version or a block', () => {
		expect(numberIn('give Mateo five coins for helping clean the shop')).toBe(5);
		expect(numberIn('10 idea coins for hitting a sick trick shot')).toBe(10);
		expect(numberIn('give Leo twenty five coins')).toBe(25);
		expect(numberIn('give Mateo a hundred coins')).toBe(100);
		expect(numberIn('fine Daniel, phone out')).toBeNull();
		expect(numberIn('fine Ana in block 2 for eating')).toBeNull();
		expect(numberIn('fine Ana 3 for leaving her station a mess')).toBe(3);
	});
	test('award, fine or purchase from the verb', () => {
		expect(kindIn('fine Daniel R three coins, phone out')).toBe('fine');
		expect(kindIn('give Ana a disruptive fine')).toBe('fine');
		expect(kindIn('Leo bought an eating pass')).toBe('purchase');
		expect(kindIn('give Mateo five coins')).toBe('award');
		expect(kindIn('Farzad, sick trick shot')).toBeNull();
	});
	test('the reason is what it was for, without the name, the number or the verb', () => {
		expect(reasonIn('give Mateo five coins for helping clean the shop', ['Mateo'])).toBe('helping clean the shop');
		expect(reasonIn('A word of Farzad, 10 idea coins for hitting a sick trick shot. Hell yeah!', ['Farzad'])).toBe('hitting a sick trick shot');
		expect(phraseOf(reasonIn('fine Daniel R three coins, phone out', ['Daniel', 'R']))).toBe('phone out');
	});
});

describe('the amount rule (Mr. Pina, 2026-10-23)', () => {
	test('a listed item uses its listed amount, with no number said', () => {
		const d = decide('fine Daniel R, phone out', ['Daniel', 'R']);
		expect(d).toMatchObject({ action: 'log', kind: 'fine', category: { id: 'off_task_device_use' }, amount: 2, amountFrom: 'listed' });
		expect(decide('Leo bought an eating pass', ['Leo'])).toMatchObject({ action: 'log', kind: 'purchase', category: { id: 'eating_pass' }, amount: 150 });
		expect(decide('fine Ana for messing around in the shop', ['Ana'])).toMatchObject({ action: 'log', category: { id: 'disruptive_behavior' }, amount: 3 });
	});
	test('a category named by its own words matches too', () => {
		expect(decide('give Leo a correct answer in class award', ['Leo'])).toMatchObject({ action: 'log', category: { id: 'correct_answer_in_class' }, amount: 1 });
	});
	test('a listed item with a different number asks which, and writes nothing', () => {
		const d = decide('fine Daniel 3 coins for playing games', ['Daniel']);
		expect(d).toMatchObject({ action: 'ask', status: 'needs_choice' });
		expect((d as { question: string }).question).toBe('Off-Task Device Use is set at 2i¢. Log 2i¢, or log 3i¢ as a Custom Fine?');
	});
	test('a saved phrase uses its default; a new number replaces it', () => {
		// No verb, but the phrase he used before says it was an award.
		expect(decide('Farzad, hitting a sick trick shot', ['Farzad'])).toMatchObject({ action: 'log', kind: 'award', amount: 10, amountFrom: 'saved' });
		// His real request of 2026-10-23, word for word.
		expect(decide('A word of Farzad, 10 idea coins for hitting a sick trick shot. Hell yeah!', ['Farzad'])).toMatchObject({ action: 'log', kind: 'award', category: { id: 'custom_award' }, amount: 10, amountFrom: 'said' });
		// No verb and no phrase he used before: one question.
		expect(decide('Farzad, juggling', ['Farzad'])).toMatchObject({ action: 'ask', status: 'needs_kind' });
		expect(decide('give Farzad coins for hitting a sick trick shot', ['Farzad'])).toMatchObject({ action: 'log', category: { id: 'custom_award' }, amount: 10, amountFrom: 'saved', phrase: 'hitting a sick trick shot' });
		expect(decide('give Farzad 6 coins for hitting a sick trick shot', ['Farzad'])).toMatchObject({ action: 'log', amount: 6, amountFrom: 'said', phrase: 'hitting a sick trick shot' });
		expect(decide('give the class coins for wearing green', [])).toMatchObject({ action: 'log', category: { id: 'above_and_beyond' }, amount: 1, amountFrom: 'saved' });
	});
	test('a new phrase with a number is a Custom record with his words, saved for next time', () => {
		const d = decide('give Ana 4 coins for fixing the bandsaw guard', ['Ana']);
		expect(d).toMatchObject({ action: 'log', kind: 'award', category: { id: 'custom_award' }, amount: 4, note: 'fixing the bandsaw guard', phrase: 'fixing the bandsaw guard' });
		expect(decide('fine Leo 2 for throwing scraps', ['Leo'])).toMatchObject({ category: { id: 'custom_fine' }, amount: 2 });
		expect(decide('Leo bought a sticker for 3 coins', ['Leo'])).toMatchObject({ kind: 'purchase', category: { id: 'custom_purchase' }, amount: 3 });
	});
	test('no number and nothing listed asks for the number, and writes nothing', () => {
		expect(decide('give Ana coins for fixing the bandsaw guard', ['Ana'])).toEqual({ action: 'ask', status: 'needs_amount', question: 'How many coins for this award?' });
		expect(decide('give Mateo an above and beyond', ['Mateo'])).toMatchObject({ action: 'ask', status: 'needs_amount' });
		expect(decide('give Ana a competition winnings award', ['Ana'])).toMatchObject({ action: 'ask', status: 'needs_amount', question: 'How many coins for Competition Winnings?' });
	});
	test('a range is held to its range', () => {
		expect(decide('give Mateo 3 coins, above and beyond', ['Mateo'])).toMatchObject({ action: 'log', category: { id: 'above_and_beyond' }, amount: 3 });
		expect(decide('give Mateo 9 coins, above and beyond', ['Mateo'])).toMatchObject({ action: 'ask', status: 'needs_choice' });
	});
	test('an explicit amount argument wins over the words', () => {
		expect(decide('give Ana coins for fixing the bandsaw guard', ['Ana'], 7)).toMatchObject({ action: 'log', amount: 7 });
	});
	test('a fine never matches an award phrase, and a purchase never a fine (control)', () => {
		expect(decide('Leo bought an eating pass', ['Leo'])).not.toMatchObject({ category: { id: 'eating_violation' } });
		expect(decide('fine Leo for eating', ['Leo'])).toMatchObject({ category: { id: 'eating_violation' } });
	});
});
