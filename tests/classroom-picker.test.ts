// tests/classroom-picker.test.ts
//
// THE CLASS PICKER, AND THE TWO PROPERTIES THAT FAIL SILENTLY.
//
//   1. REPRODUCIBILITY. A draw made in front of a class has to survive a
//      re-render, and an unseeded shuffle does not: a poll landing, a resize or
//      a navigation back would quietly re-roll it, and nothing on screen would
//      look wrong -- just different. So the draw is a pure function of (names,
//      seed) and this file pins that a repeat call gives a byte-identical
//      answer. A regression here produces no error, no warning and no visible
//      defect until a teacher notices the teams changed under them.
//   2. NOBODY LEFT ALONE. `ceil(n / size)` teams dealt round-robin, rather
//      than chunks of `size`, because chunking leaves the remainder as a final
//      team -- 13 students in fours gives 4, 4, 4 and ONE PERSON BY THEMSELVES.
//      That happens for most class sizes over a term and reads as a correct
//      draw.
//
// THE EXPECTED VALUES DO NOT COME FROM THE IMPLEMENTATION. The team sizes are
// derived from arithmetic stated here (max and min differ by at most one, and
// the union is the input), never by calling the function twice; the shuffle
// assertions are about invariants (a permutation) plus stability, which a
// broken implementation cannot satisfy by agreeing with itself.

import { describe, expect, test } from 'vitest';
import {
	pickerDrawNote,
	pickerOne,
	pickerPool,
	pickerSeedFrom,
	pickerSeedLabel,
	pickerShuffle,
	pickerTeams,
	type PickerCandidate
} from '../src/lib/classroom/picker';

const NAMES = (n: number): PickerCandidate[] =>
	Array.from({ length: n }, (_, i) => ({
		email: `s${i}@boscotech.net`,
		name: `Student ${i}`
	}));

const emails = (people: readonly PickerCandidate[]) => people.map((p) => p.email).sort();

describe('a draw is reproducible from its seed', () => {
	test('the same names and the same seed give the identical order', () => {
		const roster = NAMES(24);
		const a = pickerShuffle(roster, 0x1234abcd);
		const b = pickerShuffle(roster, 0x1234abcd);
		expect(a.map((p) => p.email)).toEqual(b.map((p) => p.email));
	});

	test('a different seed gives a different order', () => {
		// POSITIVE CONTROL for the test above: a function that returned the
		// input unshuffled would satisfy "same seed, same answer" perfectly.
		const roster = NAMES(24);
		const a = pickerShuffle(roster, 1).map((p) => p.email);
		const b = pickerShuffle(roster, 2).map((p) => p.email);
		expect(a).not.toEqual(b);
		// And neither is simply the roster order.
		expect(a).not.toEqual(roster.map((p) => p.email));
	});

	test('it is a permutation, never a sample', () => {
		const roster = NAMES(37);
		for (const seed of [1, 99, 0xdeadbeef, 0x7fffffff]) {
			expect(emails(pickerShuffle(roster, seed))).toEqual(emails(roster));
		}
	});

	test('it does not mutate the input', () => {
		const roster = NAMES(10);
		const before = roster.map((p) => p.email);
		pickerShuffle(roster, 42);
		expect(roster.map((p) => p.email)).toEqual(before);
	});

	test('teams and the order are reproducible too, not only the shuffle', () => {
		const roster = NAMES(19);
		const t1 = pickerTeams(roster, 4, 7).map(emails);
		const t2 = pickerTeams(roster, 4, 7).map(emails);
		expect(t1).toEqual(t2);
		expect(pickerOne(roster, 7)?.email).toBe(pickerOne(roster, 7)?.email);
	});

	test('the seed is printable and stable', () => {
		expect(pickerSeedLabel(0x0012abcd)).toBe('0012abcd');
		expect(pickerSeedLabel(1)).toBe('00000001');
		// A seed minted from entropy is never zero, which would print as a
		// suspiciously round label and read as "no draw yet".
		for (const e of [0, 0.0000001, 0.5, 0.999999]) {
			expect(pickerSeedFrom(e)).toBeGreaterThan(0);
		}
	});
});

describe('teams leave nobody on their own', () => {
	// Every remainder class against a spread of team sizes -- the sizes are
	// stated here, not read back off the function.
	const CASES: [number, number][] = [];
	for (let n = 1; n <= 34; n++) for (const size of [2, 3, 4, 5]) CASES.push([n, size]);

	test.each(CASES)('%i students in teams of %i', (n, size) => {
		const roster = NAMES(n);
		const teams = pickerTeams(roster, size, 12345);
		// Everybody is in exactly one team.
		expect(teams.flatMap(emails).sort()).toEqual(emails(roster));
		expect(teams.reduce((sum, t) => sum + t.length, 0)).toBe(n);
		// The count is what `size` asked for.
		expect(teams.length).toBe(Math.ceil(n / size));
		// AND THE SIZES ARE BALANCED. This is the assertion a chunking
		// implementation fails: it would put the remainder in a final team,
		// which for n = 13, size = 4 is one person alone.
		const sizes = teams.map((t) => t.length);
		expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
	});

	test('the case chunking gets wrong, spelled out', () => {
		// 13 in fours. A slice-based implementation gives [4, 4, 4, 1].
		expect(pickerTeams(NAMES(13), 4, 99).map((t) => t.length)).toEqual([4, 3, 3, 3]);
		// And the smallest class that shows it: 5 in fours is not 4 and 1.
		expect(pickerTeams(NAMES(5), 4, 99).map((t) => t.length)).toEqual([3, 2]);
	});

	test('a team size larger than the class is one team', () => {
		expect(pickerTeams(NAMES(6), 20, 1)).toHaveLength(1);
	});

	test('an empty class or a nonsense size is no teams, not a throw', () => {
		expect(pickerTeams([], 3, 1)).toEqual([]);
		expect(pickerTeams(NAMES(5), 0, 1)).toEqual([]);
		expect(pickerTeams(NAMES(5), -2, 1)).toEqual([]);
		expect(pickerTeams(NAMES(5), Number.NaN, 1)).toEqual([]);
	});
});

describe('absences are excluded and said out loud', () => {
	test('the pool splits, and neither half is invented', () => {
		const roster = NAMES(6);
		const pool = pickerPool(roster, new Set(['s1@boscotech.net', 's4@boscotech.net']));
		expect(emails(pool.included)).toEqual(
			emails(roster.filter((p) => !['s1@boscotech.net', 's4@boscotech.net'].includes(p.email)))
		);
		expect(emails(pool.excluded)).toEqual(['s1@boscotech.net', 's4@boscotech.net']);
	});

	test('an absent student appears in no draw of any kind', () => {
		const roster = NAMES(12);
		const pool = pickerPool(roster, new Set(['s3@boscotech.net']));
		expect(emails(pickerShuffle(pool.included, 5))).not.toContain('s3@boscotech.net');
		expect(pickerTeams(pool.included, 3, 5).flatMap(emails)).not.toContain('s3@boscotech.net');
		// Over every seed the picker can be handed for "one student", the absent
		// one is never it -- a single-seed check would pass by luck.
		for (let seed = 1; seed <= 200; seed++) {
			expect(pickerOne(pool.included, seed)?.email).not.toBe('s3@boscotech.net');
		}
		// POSITIVE CONTROL: with nobody marked absent, that student IS drawn for
		// at least one of those seeds, so the absence above is the exclusion
		// working and not the draw never reaching them.
		const everyone = pickerPool(roster, new Set());
		const reachable = Array.from({ length: 200 }, (_, i) => pickerOne(everyone.included, i + 1));
		expect(reachable.some((p) => p?.email === 's3@boscotech.net')).toBe(true);
	});

	test('the whole class absent is an empty draw, not a throw', () => {
		const roster = NAMES(4);
		const pool = pickerPool(roster, new Set(roster.map((p) => p.email)));
		expect(pool.included).toEqual([]);
		expect(pickerOne(pool.included, 1)).toBeNull();
		expect(pickerTeams(pool.included, 3, 1)).toEqual([]);
	});
});

describe('the draw says it was a draw', () => {
	test('the note names the seed and the count, and claims reproducibility', () => {
		const pool = pickerPool(NAMES(20), new Set());
		const note = pickerDrawNote(0x00c0ffee, pool);
		expect(note).toContain('Random draw of 20 students');
		expect(note).toContain('seed 00c0ffee');
		// THE SENTENCE THAT MAKES IT CHECKABLE BY THE ROOM. Without it a
		// shuffled list is indistinguishable from an arranged one.
		expect(note).toContain('this same result');
	});

	test('exclusions are named, never silently dropped', () => {
		const pool = pickerPool(NAMES(5), new Set(['s0@boscotech.net', 's2@boscotech.net']));
		const note = pickerDrawNote(1, pool);
		expect(note).toContain('2 marked absent');
		expect(note).toContain('Student 0');
		expect(note).toContain('Student 2');
		// With nobody out, the sentence does not appear at all -- a permanent
		// "0 absent" is noise on the ordinary day.
		expect(pickerDrawNote(1, pickerPool(NAMES(5), new Set()))).not.toContain('absent');
	});

	test('one student reads as a singular', () => {
		expect(pickerDrawNote(1, pickerPool(NAMES(1), new Set()))).toContain('1 student,');
	});
});
