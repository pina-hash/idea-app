// tests/cert-watch-ranges.test.ts
//
// THE PLAYED-RANGE ARITHMETIC, at a pinned corpus (ledger 0391, surface e).
// `src/lib/certifications/watch/ranges.ts` decides which seconds of a training
// video a student is credited for; the server (`cert_watch_report`) merges the
// same shape again as the floor. Every expected value below is written by hand
// from the rule in docs/CERTIFICATIONS.md ("Seeking ahead does not count
// unplayed footage, and a video counts when its played seconds cover at least
// 95% of its length"), never derived from the module under test.
//
// THE POSITIVE CONTROL is the reason ranges exist at all: the same polls fed to
// a plain sum of deltas credit a seek, and fed to the merge they do not. If the
// two ever agree on a seek the merge has stopped doing its job.

import { describe, expect, it } from 'vitest';
import {
	accumulatePlayed,
	clampRate,
	coverage,
	coveragePercentWords,
	coveredSeconds,
	maxPlayedDelta,
	mergeRanges,
	playedSeconds,
	rateOverCap,
	SEEK_TOLERANCE,
	WATCH_COVERAGE,
	WATCH_MAX_RATE,
	watchComplete,
	type Range
} from '$lib/certifications/watch/ranges';
import * as types from '$lib/certifications/types';

describe('mergeRanges', () => {
	const corpus: [string, number[][], Range[]][] = [
		['nothing', [], []],
		['one range', [[0, 5]], [[0, 5]]],
		['touching ranges become one', [[0, 5], [5, 9]], [[0, 9]]],
		['overlapping ranges become one', [[0, 5], [3, 9]], [[0, 9]]],
		['disjoint ranges are sorted', [[10, 12], [0, 5]], [[0, 5], [10, 12]]],
		['a contained range disappears', [[0, 5], [1, 2]], [[0, 5]]],
		['a zero-length range is dropped', [[0, 5], [7, 7]], [[0, 5]]],
		['an inverted range is dropped', [[5, 0]], []],
		['a NaN range is dropped', [[0, NaN], [1, 2]], [[1, 2]]],
		['a chain closes through its middle', [[0, 1], [2, 3], [1, 2]], [[0, 3]]],
		['a malformed entry is dropped', [[0, 1, 2], [3], [4, 6]] as unknown as number[][], [[4, 6]]]
	];
	it.each(corpus)('%s', (_label, input, expected) => {
		expect(mergeRanges(input)).toEqual(expected);
	});

	it('never mutates its input', () => {
		const input: Range[] = [[3, 9], [0, 5]];
		const copy = JSON.stringify(input);
		mergeRanges(input);
		expect(JSON.stringify(input)).toBe(copy);
	});
});

describe('coveredSeconds and coverage', () => {
	it('sums the merged ranges clamped to the video', () => {
		expect(coveredSeconds([[0, 30]], 100)).toBe(30);
		expect(coverage([[0, 30]], 100)).toBeCloseTo(0.3);
		expect(coveredSeconds([[0, 30], [20, 50]], 100)).toBe(50);
	});
	it('clamps a range that starts before 0 or runs past the end', () => {
		expect(coveredSeconds([[-5, 10]], 100)).toBe(10);
		expect(coveredSeconds([[90, 130]], 100)).toBe(10);
		expect(coverage([[-5, 130]], 100)).toBe(1);
	});
	it('covers nothing of a video with no length', () => {
		expect(coveredSeconds([[0, 30]], 0)).toBe(0);
		expect(coverage([[0, 30]], 0)).toBe(0);
		expect(coverage([[0, 30]], NaN)).toBe(0);
	});
	it('counts a watch complete at 95% and not a hair under', () => {
		expect(WATCH_COVERAGE).toBe(0.95);
		expect(watchComplete([[0, 95]], 100)).toBe(true);
		expect(watchComplete([[0, 94.9]], 100)).toBe(false);
		expect(watchComplete([[0, 50], [50, 95]], 100)).toBe(true);
	});
	it('reads the constants from the shared types module (one spelling)', () => {
		expect(WATCH_COVERAGE).toBe(types.WATCH_COVERAGE);
		expect(WATCH_MAX_RATE).toBe(types.WATCH_MAX_RATE);
	});
});

describe('accumulatePlayed', () => {
	it('credits a poll that moved one poll period at 1x, drift included', () => {
		expect(accumulatePlayed([], 0, 1, 1, 1)).toEqual([[0, 1]]);
		expect(accumulatePlayed([], 0, 1.02, 1, 1)).toEqual([[0, 1.02]]);
		expect(accumulatePlayed([[0, 1]], 1, 2, 1, 1)).toEqual([[0, 2]]);
	});
	it('credits nothing for a seek ahead, and the next poll opens a new range', () => {
		const after = accumulatePlayed([[0, 3]], 3, 100, 1, 1);
		expect(after).toEqual([[0, 3]]);
		expect(accumulatePlayed(after, 100, 101, 1, 1)).toEqual([[0, 3], [100, 101]]);
	});
	it('credits nothing for a seek back or a stalled clock', () => {
		expect(accumulatePlayed([[0, 10]], 10, 5, 1, 1)).toEqual([[0, 10]]);
		expect(accumulatePlayed([[0, 10]], 10, 10, 1, 1)).toEqual([[0, 10]]);
	});
	it('allows a longer delta at a higher rate, up to the tolerance', () => {
		expect(SEEK_TOLERANCE).toBe(1.5);
		expect(maxPlayedDelta(2, 1)).toBe(3);
		expect(accumulatePlayed([], 0, 2.5, 2, 1)).toEqual([[0, 2.5]]);
		expect(accumulatePlayed([], 0, 3.1, 2, 1)).toEqual([]);
		expect(accumulatePlayed([], 0, 1.6, 1, 1)).toEqual([]);
	});
	it('reads a missing or zero rate and poll as 1', () => {
		expect(maxPlayedDelta(0, 1)).toBe(1.5);
		expect(maxPlayedDelta(NaN, NaN)).toBe(1.5);
	});
	it('folds a re-watch of the same minute into the range already there', () => {
		expect(accumulatePlayed([[0, 60]], 20, 21, 1, 1)).toEqual([[0, 60]]);
		expect(playedSeconds(accumulatePlayed([[0, 60]], 20, 21, 1, 1))).toBe(60);
	});
	it('ignores a non-finite position', () => {
		expect(accumulatePlayed([[0, 1]], NaN, 2, 1, 1)).toEqual([[0, 1]]);
		expect(accumulatePlayed([[0, 1]], 1, NaN, 1, 1)).toEqual([[0, 1]]);
	});
});

describe('POSITIVE CONTROL: a plain sum of deltas over-counts a seek; the merge does not', () => {
	const polls = [0, 1, 2, 3, 100, 101, 102];
	it('the sum books the 97 seconds nobody watched', () => {
		let naive = 0;
		for (let i = 1; i < polls.length; i++) naive += Math.max(0, polls[i] - polls[i - 1]);
		expect(naive).toBe(102);
	});
	it('the merge books five', () => {
		let ranges: Range[] = [];
		for (let i = 1; i < polls.length; i++) ranges = accumulatePlayed(ranges, polls[i - 1], polls[i], 1, 1);
		expect(ranges).toEqual([[0, 3], [100, 102]]);
		expect(playedSeconds(ranges)).toBe(5);
		expect(coverage(ranges, 600)).toBeCloseTo(5 / 600);
	});
});

describe('clampRate and rateOverCap', () => {
	it('caps at 2x and reads a missing rate as 1x', () => {
		expect(WATCH_MAX_RATE).toBe(2);
		expect(clampRate(2.5)).toBe(2);
		expect(clampRate(1.5)).toBe(1.5);
		expect(clampRate(2)).toBe(2);
		expect(clampRate(0)).toBe(1);
		expect(clampRate(-1)).toBe(1);
		expect(clampRate(NaN)).toBe(1);
		expect(clampRate(3, 4)).toBe(3);
	});
	it('names the rates the cap refuses', () => {
		expect(rateOverCap(2.5)).toBe(true);
		expect(rateOverCap(2)).toBe(false);
		expect(rateOverCap(NaN)).toBe(false);
	});
});

describe('coveragePercentWords', () => {
	it('floors and writes the figure in words', () => {
		expect(coveragePercentWords(0.419)).toBe('41% played');
		expect(coveragePercentWords(1)).toBe('100% played');
		expect(coveragePercentWords(0)).toBe('0% played');
		expect(coveragePercentWords(NaN)).toBe('0% played');
		expect(coveragePercentWords(1.4)).toBe('100% played');
	});
});
