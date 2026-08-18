// tests/coin-desk-prefs.test.ts
//
// Two pure layers of the coin desk's Log area: the `profiles.preferences
// .coinDesk` namespace, and which curriculum sections the "add from
// curriculum" picker offers.
//
// WHY THESE TWO ARE WORTH PINNING, when most of this repo's pure helpers are
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
//   * THE PICKER'S RULE DECIDES WHAT AN OPERATOR IS OFFERED, and both
//     directions are wrong quietly: offering a concluded programme creates a
//     coin section for a class that has finished, and over-filtering leaves
//     the picker empty with nothing to say why.

import { describe, expect, test } from 'vitest';
import {
	coinDefaultMedium,
	coinLogMode,
	readCoinDeskPrefs,
	type CoinDeskPrefs
} from '../src/lib/coin-desk';
import {
	curriculumSectionOptions,
	isOfferableSection,
	termLabel
} from '../src/lib/coin-desk/sections';
import { SECTIONS } from '../src/lib/curriculum';
import { FSP_CONCLUDED } from '../src/lib/fsp/archive';

describe('the coinDesk preferences namespace', () => {
	test('reads a stored mode and medium', () => {
		const prefs = readCoinDeskPrefs({ coinDesk: { mode: 'section', medium: 'digital' } });
		expect(prefs).toEqual({ mode: 'section', medium: 'digital' });
		expect(coinLogMode(prefs)).toBe('section');
		expect(coinDefaultMedium(prefs)).toBe('digital');
	});

	test('the documented defaults apply when nothing is stored', () => {
		const prefs = readCoinDeskPrefs({});
		expect(prefs).toEqual({});
		// Single student, and physical -- physical coins are the primary system.
		expect(coinLogMode(prefs)).toBe('student');
		expect(coinDefaultMedium(prefs)).toBe('physical');
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
		expect(coinDefaultMedium(prefs)).toBe('physical');
	});

	test('keeps the half that is valid when the other half is not', () => {
		expect(readCoinDeskPrefs({ coinDesk: { mode: 'section', medium: 42 } })).toEqual({
			mode: 'section'
		});
		expect(readCoinDeskPrefs({ coinDesk: { mode: null, medium: 'digital' } })).toEqual({
			medium: 'digital'
		});
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
		expect(readCoinDeskPrefs({ mode: 'section', medium: 'digital' })).toEqual({});
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
			coinDesk: { mode: 'student', medium: 'physical' }
		};
		const next: CoinDeskPrefs = { mode: 'section', medium: 'digital' };
		const merged = { ...existing, coinDesk: next };

		expect(readCoinDeskPrefs(merged)).toEqual(next);
		expect(merged.homepage).toEqual(existing.homepage);
		expect(merged.classroomUnits).toEqual(existing.classroomUnits);
		expect(merged.classroomFeed).toEqual(existing.classroomFeed);
	});

	test('a first write into a blob that has no namespace yet adds one', () => {
		const existing = { homepage: { pinned: ['coins'] } };
		const merged = { ...existing, coinDesk: { medium: 'digital' as const } };
		expect(readCoinDeskPrefs(merged)).toEqual({ medium: 'digital' });
		expect(merged.homepage).toEqual({ pinned: ['coins'] });
	});
});

describe('which curriculum sections the picker offers', () => {
	const ids = (existing: string[] = []) => curriculumSectionOptions(existing).map((s) => s.id);

	test('still excludes a class that already has a coin section', () => {
		const all = ids();
		expect(all).toContain('eng1h-sophomore');
		expect(ids(['eng1h-sophomore'])).not.toContain('eng1h-sophomore');
	});

	/**
	 * The rule that was missing, tested against CONSTRUCTED sections.
	 *
	 * The catalog holds no 'planned' entry today, so asserting "nothing offered
	 * is planned" over SECTIONS alone would pass whether or not the rule
	 * existed -- it would be measuring the fixture, not the filter. These three
	 * differ only in status.
	 */
	test('offers live and upcoming classes, and never a planned one', () => {
		const base = {
			id: 'made-up',
			course: 'IDEA 999',
			title: 'Constructed',
			year: 2 as const,
			yearLabel: 'Sophomore',
			instructor: 'Pina',
			term: 'S1' as const
		};
		expect(isOfferableSection({ ...base, status: 'live' })).toBe(true);
		expect(isOfferableSection({ ...base, status: 'upcoming' })).toBe(true);
		expect(isOfferableSection({ ...base, status: 'planned' })).toBe(false);
	});

	test('an upcoming class is still offered by the real picker', () => {
		// The half that would break the picker in the other direction: every
		// 2026-27 section is 'upcoming', and setting a roster up before a class
		// starts is what this picker is for.
		const offered = curriculumSectionOptions([]);
		expect(offered.length).toBeGreaterThan(0);
		expect(offered.some((s) => s.status === 'upcoming')).toBe(true);
	});

	/**
	 * KEYED ON THE CONCLUDED FLAG, NOT ON `term === 'Summer'`. That is the rule
	 * curriculum.ts's own activeCourseCount() applies, for the reason written
	 * down there: a term label says WHEN a course runs, not whether it has
	 * finished. This asserts the behaviour AND that the term was not what
	 * produced it.
	 */
	test('does not offer the concluded summer programme', () => {
		expect(FSP_CONCLUDED).toBe(true);
		expect(ids()).not.toContain('summer-2026');

		// AND THE EXCLUSION IS NOT "Summer". A constructed summer section that
		// is NOT the concluded programme must still be offered -- which is the
		// only assertion that can tell the flag rule from a term rule, since
		// both produce the same answer for every section in the catalog today.
		expect(
			isOfferableSection({
				id: 'summer-2027',
				course: 'IDEA FSP',
				title: 'Next Summer Programme',
				year: 1,
				yearLabel: 'Incoming Freshman',
				instructor: 'Pina',
				term: 'Summer',
				status: 'upcoming'
			})
		).toBe(true);
	});

	test('never offers a section that no longer exists in the catalog', () => {
		const catalog = new Set(SECTIONS.map((s) => s.id));
		expect(ids().every((id) => catalog.has(id))).toBe(true);
	});

	test('the term is surfaced as a label rather than used as a gate', () => {
		const s = SECTIONS.find((x) => x.id === 'intro-100-2')!;
		expect(termLabel(s)).toBe('Term T2');
		expect(termLabel(SECTIONS.find((x) => x.id === 'summer-2026')!)).toBe('Summer');
	});
});
