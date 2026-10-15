/**
 * PLAYED RANGES: the arithmetic behind "only time the video actually plays
 * counts" (ledger 0391, docs/CERTIFICATIONS.md "Video watch tracking").
 *
 * A watch is a list of `[start, end]` seconds of the video that were PLAYED.
 * Every function here is pure and takes the list as data, so the rule that
 * decides whether a student watched a video is assertable at a pinned corpus
 * with no player and no browser (`tests/cert-watch-ranges.test.ts`), and the
 * server (`cert_watch_report`, 0261) merges the same shape a second time as the
 * floor: this module decides what the CLIENT credits, the function decides
 * what is STORED, and neither trusts the other.
 *
 * WHY RANGES AND NOT A SUM OF DELTAS. A player reports its position once a
 * second. Summing `now - previous` credits a seek: skip from 0:10 to 9:50 and a
 * plain sum books 580 seconds nobody watched. `accumulatePlayed` treats any
 * jump outside what one poll at the current rate could have played as a seek,
 * credits nothing for it, and starts a NEW range at the landing point; merging
 * the ranges then also stops a re-watch of the same minute counting twice. The
 * positive control in the test file shows the sum over-counting the seek that
 * the merge does not.
 *
 * `WATCH_COVERAGE` (0.95) and `WATCH_MAX_RATE` (2) are Mr. Pina's numbers and
 * live in `../types` beside the other constants; re-exported here so a caller
 * of this module reads them from the module whose arithmetic they bound.
 */
import { WATCH_COVERAGE, WATCH_MAX_RATE } from '../types';

export { WATCH_COVERAGE, WATCH_MAX_RATE };

/** `[start, end]` in seconds of the video, start < end. */
export type Range = [number, number];

/**
 * How far past one poll's worth of playback a delta may land and still count
 * as continuous play. Timers drift and a player's clock is quantized, so a
 * 1 s poll at 1x routinely answers 1.02 s; 1.5 absorbs that and still refuses
 * a two-second skip, which is the smallest seek a finger makes.
 */
export const SEEK_TOLERANCE = 1.5;

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Only well-formed ranges survive: two finite numbers with end after start. */
function sane(ranges: readonly (readonly number[])[]): Range[] {
	const out: Range[] = [];
	for (const r of ranges) {
		if (!Array.isArray(r) || r.length !== 2) continue;
		const [a, b] = r;
		if (!finite(a) || !finite(b) || b <= a) continue;
		out.push([a, b]);
	}
	return out;
}

/**
 * Sorted, non-overlapping ranges covering exactly what the input covered.
 * Touching ranges (`[0, 5]` and `[5, 9]`) become one. Never mutates its input.
 */
export function mergeRanges(ranges: readonly (readonly number[])[]): Range[] {
	const sorted = sane(ranges).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
	const out: Range[] = [];
	for (const [a, b] of sorted) {
		const last = out[out.length - 1];
		if (last && a <= last[1]) {
			if (b > last[1]) last[1] = b;
		} else {
			out.push([a, b]);
		}
	}
	return out;
}

/** Seconds covered by the merged ranges, with no duration clamp. */
export function playedSeconds(ranges: readonly (readonly number[])[]): number {
	let total = 0;
	for (const [a, b] of mergeRanges(ranges)) total += b - a;
	return total;
}

/**
 * Seconds of a `duration`-second video that the ranges cover. Every range is
 * clamped to `[0, duration]` first, so a range the player reported past the
 * end (its clock can overshoot by a frame) cannot push coverage over 100%.
 * A duration that is not a positive number covers nothing.
 */
export function coveredSeconds(ranges: readonly (readonly number[])[], duration: number): number {
	if (!finite(duration) || duration <= 0) return 0;
	let total = 0;
	for (const [a, b] of mergeRanges(ranges)) {
		const lo = Math.max(0, a);
		const hi = Math.min(duration, b);
		if (hi > lo) total += hi - lo;
	}
	return total;
}

/** The covered fraction of the video, in `[0, 1]`. */
export function coverage(ranges: readonly (readonly number[])[], duration: number): number {
	if (!finite(duration) || duration <= 0) return 0;
	return Math.min(1, Math.max(0, coveredSeconds(ranges, duration) / duration));
}

/** Has this watch crossed Mr. Pina's line (95%)? */
export function watchComplete(ranges: readonly (readonly number[])[], duration: number): boolean {
	return coverage(ranges, duration) >= WATCH_COVERAGE;
}

/**
 * The longest delta one poll could have PLAYED: a poll of `pollS` seconds at
 * `rate` times normal speed, with the tolerance above. Anything longer is a
 * seek; anything zero or negative is a pause, a stall or a seek backward.
 */
export function maxPlayedDelta(rate: number, pollS: number): number {
	const r = finite(rate) && rate > 0 ? rate : 1;
	const p = finite(pollS) && pollS > 0 ? pollS : 1;
	return p * r * SEEK_TOLERANCE;
}

/**
 * ONE POLL OF THE PLAYER. `prevT` is where the clock was at the last poll,
 * `nowT` where it is now. A delta inside `(0, pollS * rate * 1.5]` is play and
 * credits `[prevT, nowT]`; any other delta is treated as a seek and credits
 * NOTHING (the next poll then starts a new range from where the player landed,
 * because `nowT` becomes the next call's `prevT`). Returns the merged ranges;
 * never mutates its input.
 */
export function accumulatePlayed(
	ranges: readonly (readonly number[])[],
	prevT: number,
	nowT: number,
	rate: number,
	pollS: number
): Range[] {
	const base = mergeRanges(ranges);
	if (!finite(prevT) || !finite(nowT)) return base;
	const delta = nowT - prevT;
	if (!(delta > 0) || delta > maxPlayedDelta(rate, pollS)) return base;
	return mergeRanges([...base, [prevT, nowT]]);
}

/**
 * The rate time may be credited at: never above `max` (2x), and a rate that
 * is not a positive number reads as 1x (a player that has not answered yet).
 */
export function clampRate(rate: number, max: number = WATCH_MAX_RATE): number {
	if (!finite(rate) || rate <= 0) return 1;
	return Math.min(rate, max);
}

/** Is this a rate the cap refuses? */
export function rateOverCap(rate: number, max: number = WATCH_MAX_RATE): boolean {
	return finite(rate) && rate > max;
}

/** "41% played", the one spelling of the coverage figure in words. */
export function coveragePercentWords(fraction: number): string {
	const pct = Math.floor(Math.min(1, Math.max(0, finite(fraction) ? fraction : 0)) * 100);
	return `${pct}% played`;
}
