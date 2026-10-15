// tests/cert-watch-tracker.test.ts
//
// A WHOLE WATCH AT A PINNED CLOCK (ledger 0391, surface e). `WatchTracker` is
// everything `YouTubePlayer.svelte` decides, with the clock and the schedule
// injected, so a seek, a check-in, a missed check-in, a seek past one, a rate
// above the cap and a pause are each driven here by hand and the report read
// back. The component is the thin half and is measured in the browser harness.

import { beforeEach, describe, expect, it } from 'vitest';
import { WatchTracker, RATE_BLOCKED_SENTENCE } from '$lib/certifications/watch/tracker';

let ms = 0;
const now = () => ms;
const DUR = 600;

function tracker(timeout = 60, scheduleNext: (p: number) => number = (p) => p + 5) {
	return new WatchTracker({ itemKey: 'yt:abcdefghijk', checkinTimeoutSeconds: timeout, pollSeconds: 1, now, scheduleNext });
}

/** Poll once a second from `from` to `to` at `rate`, advancing the clock. */
function play(t: WatchTracker, from: number, to: number, rate = 1) {
	const actions = [];
	for (let x = from; x <= to; x += rate) {
		ms += 1000;
		actions.push(...t.sample(x, rate, DUR));
	}
	return actions;
}

beforeEach(() => {
	ms = 0;
});

describe('crediting', () => {
	it('credits nothing on the first poll and one second per poll after it', () => {
		const t = tracker();
		expect(t.sample(0, 1, DUR)).toEqual([]);
		expect(t.playedTotal).toBe(0);
		play(t, 1, 3);
		expect(t.playedTotal).toBe(3);
		expect(t.played).toEqual([[0, 3]]);
		expect(t.progress()).toEqual({ covered: 3, duration: DUR, coverage: 3 / DUR });
	});

	it('credits nothing for a seek and opens a new range where the player landed', () => {
		const t = tracker(60, (p) => p + 1000);
		t.sample(0, 1, DUR);
		play(t, 1, 3);
		ms += 1000;
		t.sample(100, 1, DUR);
		expect(t.playedTotal).toBe(3);
		play(t, 101, 102);
		expect(t.played).toEqual([[0, 3], [100, 102]]);
		expect(t.playedTotal).toBe(5);
	});

	it('a stop ends the range at the clock and a resume elsewhere starts a new one', () => {
		const t = tracker(60, (p) => p + 1000);
		t.sample(0, 1, DUR);
		play(t, 1, 2);
		expect(t.stop(2.4, 1, DUR)).toEqual([]);
		expect(t.played).toEqual([[0, 2.4]]);
		// Paused, then seeked to 50 and played from there: the first poll after
		// a stop credits nothing.
		ms += 5000;
		expect(t.sample(50, 1, DUR)).toEqual([]);
		expect(t.playedTotal).toBeCloseTo(2.4);
		play(t, 51, 52);
		expect(t.played).toEqual([[0, 2.4], [50, 52]]);
	});

	it('seeds stored ranges so a resumed watch reads its true coverage', () => {
		const t = tracker();
		t.seed([[0, 300]], DUR);
		expect(t.progress().coverage).toBeCloseTo(0.5);
		expect(t.dirty).toBe(false);
		expect(t.report()).toBeNull();
	});
});

describe('check-ins', () => {
	it('opens at the scheduled played mark and stops crediting until answered', () => {
		const t = tracker();
		t.sample(0, 1, DUR);
		const actions = play(t, 1, 5);
		expect(actions).toEqual([{ kind: 'checkin' }]);
		expect(t.pending).toEqual({ askedAt: ms, atT: 5, missed: false });
		expect(t.crediting).toBe(false);
		// Polls while it waits credit nothing.
		play(t, 6, 6);
		expect(t.playedTotal).toBe(5);
	});

	it('seeks back a student who skips past an unanswered check-in', () => {
		const t = tracker();
		t.sample(0, 1, DUR);
		play(t, 1, 5);
		ms += 1000;
		expect(t.sample(6.4, 1, DUR)).toEqual([]);
		ms += 1000;
		expect(t.sample(9, 1, DUR)).toEqual([{ kind: 'seek-back', to: 5 }]);
		expect(t.playedTotal).toBe(5);
	});

	it('counts an unanswered check-in missed exactly once at the timeout', () => {
		const t = tracker(60);
		t.sample(0, 1, DUR);
		play(t, 1, 5);
		ms += 59_000;
		expect(t.sample(5, 1, DUR)).toEqual([]);
		ms += 1000;
		expect(t.sample(5, 1, DUR)).toEqual([{ kind: 'missed' }]);
		expect(t.missed).toBe(true);
		ms += 1000;
		expect(t.sample(5, 1, DUR)).toEqual([]);
		expect(t.summary().checkinsMissed).toBe(1);
	});

	it('resumes crediting after Continue and schedules the next check-in from the played mark', () => {
		const t = tracker();
		t.sample(0, 1, DUR);
		play(t, 1, 5);
		t.answerCheckin();
		expect(t.pending).toBeNull();
		expect(t.crediting).toBe(true);
		ms += 1000;
		expect(t.sample(5, 1, DUR)).toEqual([]);
		expect(play(t, 6, 9)).toEqual([]);
		expect(t.playedTotal).toBe(9);
		expect(play(t, 10, 10)).toEqual([{ kind: 'checkin' }]);
		expect(t.played).toEqual([[0, 10]]);
	});

	it('answering with nothing pending is a no-op', () => {
		const t = tracker();
		t.answerCheckin();
		expect(t.pending).toBeNull();
	});
});

describe('the speed cap', () => {
	it('credits nothing at a rate above 2x, asks for the block, and never reports a credited rate above 2', () => {
		const t = tracker(60, (p) => p + 1000);
		t.sample(0, 1, DUR);
		play(t, 1, 2);
		ms += 1000;
		expect(t.sample(4.5, 2.5, DUR)).toEqual([{ kind: 'rate-blocked', rate: 2.5 }]);
		expect(t.playedTotal).toBe(2);
		ms += 1000;
		expect(t.sample(6.5, 2, DUR)).toEqual([]); // first poll after a block: no credit
		ms += 1000;
		expect(t.sample(8.5, 2, DUR)).toEqual([]);
		expect(t.playedTotal).toBe(4);
		const r = t.report();
		expect(r?.maxRate).toBe(2);
		expect(r?.rateBlocks).toBe(1);
		expect(RATE_BLOCKED_SENTENCE).toContain('2x');
	});

	it("takes the player's own rate event between polls", () => {
		const t = tracker();
		t.sample(0, 1, DUR);
		play(t, 1, 2);
		expect(t.blockRate(2.5)).toBe(true);
		expect(t.blockRate(2)).toBe(false);
		ms += 1000;
		expect(t.sample(3, 1, DUR)).toEqual([]); // the position before the block is forgotten
		expect(t.playedTotal).toBe(2);
		expect(t.summary().rateBlocks).toBe(1);
	});
});

describe('reports', () => {
	it('carries cumulative ranges and the figures since the last report, then resets them', () => {
		const t = tracker(60, (p) => p + 1000);
		expect(t.report()).toBeNull();
		t.sample(0, 1, DUR);
		play(t, 1, 3);
		const first = t.report();
		expect(first).toEqual({
			itemKey: 'yt:abcdefghijk',
			duration: DUR,
			ranges: [[0, 3]],
			maxRate: 1,
			checkinsMissed: 0,
			playedSeconds: 3,
			rateBlocks: 0
		});
		expect(t.report()).toBeNull();
		play(t, 4, 5);
		const second = t.report();
		expect(second?.ranges).toEqual([[0, 5]]);
		expect(second?.playedSeconds).toBe(2);
	});

	it('reports a missed check-in once', () => {
		const t = tracker(60);
		t.sample(0, 1, DUR);
		play(t, 1, 5);
		ms += 60_000;
		t.sample(5, 1, DUR);
		expect(t.report()?.checkinsMissed).toBe(1);
		expect(t.report()).toBeNull();
	});

	it('the shape (c) reads by field name is exactly the contract plus rateBlocks', () => {
		const t = tracker();
		t.sample(0, 1, DUR);
		play(t, 1, 1);
		expect(Object.keys(t.report()!).sort()).toEqual(
			['checkinsMissed', 'duration', 'itemKey', 'maxRate', 'playedSeconds', 'rateBlocks', 'ranges'].sort()
		);
	});
});
