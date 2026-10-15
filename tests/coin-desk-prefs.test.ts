// tests/coin-desk-prefs.test.ts
//
// One pure layer of the coin desk's Log area: the `profiles.preferences
// .coinDesk` namespace. (It used to pin a second one, which curriculum
// sections the coin-section picker offered; coin sections are retired in
// IDEA Coin V2 session two and the picker went with them.)
//
// WHY THIS IS WORTH PINNING, when most of this repo's pure helpers are
// verified in a harness instead:
//
//   * A PREFERENCE PARSER FAILS SILENTLY BY DESIGN. Everything about it is
//     fail-soft -- a missing column, a null blob, a garbage value all read as
//     "no preference" -- which is right, and which also means a parser that
//     had stopped reading its namespace entirely would look exactly like a
//     user who has never set one. The assertions that earn their place are
//     the ones about a value that IS there.
//   * THE SPREAD-MERGE IS THE WHOLE SAFETY OF A SHARED JSONB COLUMN. Four
//     namespaces live in `preferences`, and the failure mode of writing one
//     wrongly is that another silently disappears -- a homepage layout, or a
//     class view's folded units, gone with no error anywhere.

import { describe, expect, test } from 'vitest';
import {
	coinLogMode,
	readCoinDeskPrefs,
	type CoinDeskPrefs
} from '../src/lib/coin-desk';

describe('the coinDesk preferences namespace', () => {
	test('reads a stored mode', () => {
		const prefs = readCoinDeskPrefs({ coinDesk: { mode: 'section' } });
		expect(prefs).toEqual({ mode: 'section' });
		expect(coinLogMode(prefs)).toBe('section');
	});

	/**
	 * IDEA COIN V2 (0239): ONE BALANCE. A `medium` stored by a pre-V2 client is
	 * IGNORED ON READ (a preference shape migrates on read, in code), so no
	 * stored value can bring a medium choice back. The mode beside it is kept.
	 */
	test('a stored pre-V2 medium is dropped, and the mode beside it is kept', () => {
		expect(readCoinDeskPrefs({ coinDesk: { mode: 'section', medium: 'digital' } })).toEqual({
			mode: 'section'
		});
		expect(readCoinDeskPrefs({ coinDesk: { medium: 'physical' } })).toEqual({});
	});

	test('the documented default applies when nothing is stored', () => {
		const prefs = readCoinDeskPrefs({});
		expect(prefs).toEqual({});
		expect(coinLogMode(prefs)).toBe('student');
	});

	/**
	 * VALIDATED AGAINST THE UNIONS, not merely type-checked. A value outside the
	 * vocabulary is DROPPED so the form falls back to a documented default,
	 * rather than being passed through into a state no branch renders.
	 */
	test('drops a value outside the vocabulary rather than passing it through', () => {
		const prefs = readCoinDeskPrefs({ coinDesk: { mode: 'everyone', medium: 'crypto' } });
		expect(prefs).toEqual({});
		expect(coinLogMode(prefs)).toBe('student');
	});

	test('keeps the half that is valid when the other half is not', () => {
		expect(readCoinDeskPrefs({ coinDesk: { mode: 'section', medium: 42 } })).toEqual({
			mode: 'section'
		});
		expect(readCoinDeskPrefs({ coinDesk: { mode: null, medium: 'digital' } })).toEqual({});
	});

	test('every shape of missing reads as no preference, and none of them throws', () => {
		for (const input of [
			undefined,
			null,
			0,
			'',
			'coinDesk',
			[],
			{},
			{ coinDesk: null },
			{ coinDesk: 'section' },
			{ coinDesk: [] },
			{ homepage: { pinned: ['x'] } }
		]) {
			expect(readCoinDeskPrefs(input)).toEqual({});
		}
	});

	test('reads only its own namespace', () => {
		// A sibling namespace holding the same key names must not be read as
		// this one's.
		expect(readCoinDeskPrefs({ classroomUnits: { mode: 'section' } })).toEqual({});
		expect(readCoinDeskPrefs({ mode: 'section' })).toEqual({});
	});

	/**
	 * THE WRITE, as every namespace performs it: read the whole blob, replace
	 * one key, put it all back. This asserts the merge rather than the parser,
	 * because the failure it protects against is a sibling namespace vanishing
	 * -- which produces no error and no visible symptom on this page at all.
	 */
	test('the spread-merge replaces its own key and leaves every sibling intact', () => {
		const existing = {
			homepage: { pinned: ['notebook'], sort: 'used' },
			classroomUnits: { collapsed: ['s-1::u-2'] },
			classroomFeed: { collapsed: ['s-9'] },
			coinDesk: { mode: 'student' }
		};
		const next: CoinDeskPrefs = { mode: 'section' };
		const merged = { ...existing, coinDesk: next };

		expect(readCoinDeskPrefs(merged)).toEqual(next);
		expect(merged.homepage).toEqual(existing.homepage);
		expect(merged.classroomUnits).toEqual(existing.classroomUnits);
		expect(merged.classroomFeed).toEqual(existing.classroomFeed);
	});

	test('a first write into a blob that has no namespace yet adds one', () => {
		const existing = { homepage: { pinned: ['coins'] } };
		const merged = { ...existing, coinDesk: { mode: 'section' as const } };
		expect(readCoinDeskPrefs(merged)).toEqual({ mode: 'section' });
		expect(merged.homepage).toEqual({ pinned: ['coins'] });
	});
});
