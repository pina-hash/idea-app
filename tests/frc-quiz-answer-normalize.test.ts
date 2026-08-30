// tests/frc-quiz-answer-normalize.test.ts
//
// `normalizeAnswers` in quiz-service.ts, put directly to every shape a request
// body can carry. It is the ONE place a client value becomes an option index,
// and it exists because two of the three "client values the server does not
// re-derive" found in the quiz audit lived at the call site instead:
//
//   * the endpoint coerced with `Number(a)`, and `Number(null)` is 0 -- so a
//     question LEFT BLANK and a question answered with the first option
//     reached the grader as the same value;
//   * nothing checked integrality, and that is where the canonical TypeScript
//     grader and its hand-written SQL mirror DISAGREE: Postgres rounds a
//     numeric bound into an integer[] (2.7 -> 3) while the TypeScript grader
//     compares 2.7 to an integer and calls it wrong.
//
// Neither opened the gate. Both are closed here, before either grader sees the
// value, which is what makes the mirror safe on this input rather than merely
// untested. `tests/frc-quiz-route.test.ts` puts the same cases to the REAL SQL
// through the real handler; this file is the unit-level statement of the rule.

import { describe, expect, it } from 'vitest';
import { NO_ANSWER, normalizeAnswers } from '../src/lib/server/frc/quiz-service';
import { maxTestLength } from '../src/lib/server/frc/quiz-engine';

describe('a real choice survives', () => {
	it('keeps an integer index, including 0 and an out-of-range one', () => {
		expect(normalizeAnswers([0, 1, 2, 3])).toEqual([0, 1, 2, 3]);
		// Out of range is NOT rejected, and does not need to be: it matches no
		// sealed index and is already wrong on both graders. Refusing it here
		// would be a narrowing with nothing to show for it.
		expect(normalizeAnswers([-5, 999])).toEqual([-5, 999]);
	});

	it('keeps a NUMERIC STRING, which is a real choice a client may send', () => {
		expect(normalizeAnswers(['0', '1', '2', '3'])).toEqual([0, 1, 2, 3]);
		expect(normalizeAnswers(['-1'])).toEqual([-1]);
	});
});

describe('nothing that is not a choice becomes one', () => {
	it('maps every blank shape to NO_ANSWER, not to option 0', () => {
		// THE DEFECT. Every value on this list is `Number()`-coerced to 0, so
		// each of them used to grade as "chose the first option".
		const blanks: unknown[] = [null, undefined, false, '', '   ', '\n\t', []];
		for (const b of blanks)
			expect(normalizeAnswers([b]), JSON.stringify(b) ?? 'undefined').toEqual([NO_ANSWER]);
		// And NO_ANSWER is a value no sealed key can hold: `sealed[i].c` is a
		// position in an option list, so it is never negative.
		expect(NO_ANSWER).toBeLessThan(0);
	});

	it('maps a non-numeric or non-integer value to NO_ANSWER', () => {
		for (const bad of ['nope', {}, [1], true, NaN, Infinity, -Infinity, 2.7, -0.5, '1.5'])
			expect(normalizeAnswers([bad]), JSON.stringify(bad) ?? String(bad)).toEqual([NO_ANSWER]);
		// `true` is the one that would otherwise have become option 1.
		expect(normalizeAnswers([true])).toEqual([NO_ANSWER]);
	});

	it('a hole in the array is a blank, not a shifted answer', () => {
		// eslint-disable-next-line no-sparse-arrays
		expect(normalizeAnswers([0, , 2])).toEqual([0, NO_ANSWER, 2]);
	});
});

describe('the payload is bounded', () => {
	it('truncates at the largest testLength any bank declares', () => {
		const cap = maxTestLength();
		// DERIVED, never a literal: the cap is whatever the banks say. Pinned
		// against the value they say today so a bank growing past it is visible.
		expect(cap).toBe(10);
		const huge = Array.from({ length: 5000 }, () => 1);
		expect(normalizeAnswers(huge).length).toBe(cap);
		// Grading is unaffected: both graders walk `sealed`, so entries past the
		// last question were never read. The cap only stops an unbounded array
		// being pushed through into an integer[] bind.
		expect(normalizeAnswers(huge).every((x) => x === 1)).toBe(true);
	});

	it('anything that is not an array is no answers at all', () => {
		for (const bad of [null, undefined, 'abc', 42, {}, { 0: 1 }])
			expect(normalizeAnswers(bad), JSON.stringify(bad) ?? 'undefined').toEqual([]);
	});
});
