// tests/ideacad-solid-tree-playback.test.ts
//
// THE HISTORY SLIDER'S CLOCK, PURE (`tree/playback.ts`).
//
// WHY THIS IS AUTOMATED. A time-lapse that skips steps to catch up, plays
// past its end, keeps running after a pause, or eases under reduced motion
// looks fine in a two-second glance at the harness and is wrong for the
// student who watches it all the way through. Every expectation here is
// counted from the stated default (one step per 600 ms at 1x), not read off
// the module under test.
import { describe, expect, it } from 'vitest';
import { RATES, STEP_MS, createPlayback, isRate, motion, pause, play, seek, setRate, stepBy, stepInterval, stop, sync, tick, waitFor, type Playback } from '../src/lib/ideacad/solid/tree/playback';

/** Run the clock from `from` in `ms` increments until it stops or `limit` passes; returns every step shown, and when. */
function runFor(p: Playback, from: number, limit: number, every = 10) {
	const shown: { step: number; at: number }[] = [];
	for (let t = from; t <= from + limit; t += every) { const next = tick(p, t); if (next.step !== p.step) shown.push({ step: next.step, at: t - from }); p = next; if (!p.playing) break; }
	return { p, shown };
}

describe('rate', () => {
	it('is one step every 600 ms at 1x, twice as fast at 2x and half as fast at 0.5x', () => {
		expect(STEP_MS).toBe(600);
		expect(RATES).toEqual([0.5, 1, 2]);
		expect(RATES.map(stepInterval)).toEqual([1200, 600, 300]);
		for (const rate of RATES) {
			const { shown } = runFor(play(createPlayback(5, 0, rate), 0), 0, 10_000);
			expect(shown.map((s) => s.step)).toEqual([1, 2, 3, 4, 5]);
			shown.forEach((s, i) => expect(s.at, `${rate}x step ${s.step}`).toBe(stepInterval(rate) * (i + 1)));
		}
	});
	it('changing the rate mid-play re-times the next step from now', () => {
		let p = play(createPlayback(10, 0), 0);
		p = tick(p, 600);
		expect(p.step).toBe(1);
		p = setRate(p, 2, 700);
		expect(waitFor(p, 700)).toBe(300);
		expect(tick(p, 999).step).toBe(1);
		expect(tick(p, 1000).step).toBe(2);
		expect(isRate(2)).toBe(true);
		expect(isRate(3)).toBe(false);
	});
});
describe('the end', () => {
	it('stops by itself on the last step and never goes past it', () => {
		const { p, shown } = runFor(play(createPlayback(3, 0), 0), 0, 60_000);
		expect(shown.map((s) => s.step)).toEqual([1, 2, 3]);
		expect(p).toMatchObject({ step: 3, playing: false, due: null });
		expect(tick(p, 1e9)).toBe(p);
	});
	it('Play on a finished model starts over from nothing; Play with nothing to play does nothing', () => {
		const done = createPlayback(4);
		expect(done.step).toBe(4);
		expect(play(done, 0)).toMatchObject({ step: 0, playing: true, due: 600 });
		expect(play(createPlayback(0), 0)).toMatchObject({ step: 0, playing: false, due: null });
	});
	it('one step per tick even when the tick is late: a throttled tab never skips a feature', () => {
		const p = play(createPlayback(10, 0), 0);
		const late = tick(p, 5_000);
		expect(late.step).toBe(1);
		expect(late.due).toBe(5_600);
	});
});
describe('pause and stop', () => {
	it('Pause holds the step and advances nothing however long it waits; Play resumes from there', () => {
		let p = tick(play(createPlayback(10, 0), 0), 600);
		p = pause(p);
		expect(p).toMatchObject({ step: 1, playing: false, due: null });
		expect(tick(p, 1e9)).toBe(p);
		expect(waitFor(p, 0)).toBeNull();
		expect(play(p, 2_000)).toMatchObject({ step: 1, playing: true, due: 2_600 });
	});
	it('Stop ends playback and shows the whole model', () => {
		const p = stop(tick(play(createPlayback(10, 0), 0), 600));
		expect(p).toMatchObject({ step: 10, playing: false, due: null });
	});
	it('a scrub or a step pauses, and lands inside the steps', () => {
		const p = play(createPlayback(10, 2), 0);
		expect(seek(p, 7)).toMatchObject({ step: 7, playing: false });
		expect(seek(p, 99).step).toBe(10);
		expect(seek(p, -3).step).toBe(0);
		expect(stepBy(p, 1)).toMatchObject({ step: 3, playing: false });
		expect(stepBy(seek(p, 0), -1).step).toBe(0);
	});
});
describe('the owner\'s changes', () => {
	it('a feature added mid-play keeps playing; a position moved by the owner pauses', () => {
		const p = play(createPlayback(5, 1), 0);
		expect(sync(p, 5, 1)).toBe(p);
		expect(sync(p, 6, 1)).toMatchObject({ steps: 6, step: 1, playing: true, due: 600 });
		expect(sync(p, 5, 3)).toMatchObject({ step: 3, playing: false, due: null });
		expect(sync(createPlayback(5), 2, 5)).toMatchObject({ steps: 2, step: 2 });
	});
});
describe('reduced motion', () => {
	it('changes how a step arrives, never when: a cut instead of an ease, at the same rate', () => {
		for (const rate of RATES) {
			expect(motion(true, rate)).toEqual({ animate: false, easeMs: 0 });
			const full = motion(false, rate);
			expect(full.animate).toBe(true);
			expect(full.easeMs).toBeGreaterThan(0);
			expect(full.easeMs).toBeLessThan(stepInterval(rate));
		}
		/* The clock itself takes no motion setting at all, so the steps come on the same ticks either way. */
		expect(tick.length).toBe(2);
		expect(play.length).toBe(2);
	});
});
