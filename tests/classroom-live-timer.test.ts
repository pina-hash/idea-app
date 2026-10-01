// tests/classroom-live-timer.test.ts
//
// THE FRONT-OF-ROOM TIMER (ledger 0297, package LIVE), at pinned instants.
//
// Two windows show one timer and neither ticks the other, so the arithmetic in
// `$lib/classroom/live-class/timer` IS the timer: a start instant, a banked
// amount, and whatever `now` each window reads. Every expected value below is a
// figure written by hand from the clock face, never read back from the module.

import { describe, expect, it } from 'vitest';
import {
	clockParts,
	countdown,
	formatDuration,
	formatReadout,
	parseLiveTimer,
	parseTimerMinutes,
	stopwatch,
	tickEachFrame,
	timerDigits,
	timerElapsed,
	timerExtend,
	timerFinal,
	timerHoldMs,
	timerOvertime,
	timerPhase,
	timerReadout,
	timerReset,
	timerTicking,
	timerToggle,
	timerWord,
	wallDateLabel,
	type FrameHost
} from '$lib/classroom/live-class/timer';

// 10:00:00 Pacific on a school day (17:00 UTC in September).
const T0 = Date.parse('2026-09-23T17:00:00Z');
const sec = (n: number) => T0 + n * 1000;

describe('a ten-minute countdown, read the way the wall reads it', () => {
	const t = countdown(10, T0);

	it('reads 10:00 for the whole first second and 9:59 once a full second has gone', () => {
		expect(timerDigits(t, T0)).toBe('10:00');
		expect(timerDigits(t, T0 + 999)).toBe('10:00');
		expect(timerDigits(t, sec(1))).toBe('9:59');
		expect(timerDigits(t, sec(1) + 1)).toBe('9:59');
	});

	it('reaches 0:00 exactly at ten minutes, never a second early, and is done there', () => {
		expect(timerDigits(t, sec(599))).toBe('0:01');
		expect(timerPhase(t, sec(599))).toBe('running');
		expect(timerDigits(t, sec(600))).toBe('0:00');
		expect(timerPhase(t, sec(600))).toBe('done');
		expect(timerWord(t, sec(600))).toBe('Time is up');
	});

	it('counts the overtime once it is past, and says nothing before', () => {
		expect(timerOvertime(t, sec(600))).toBeNull();
		expect(timerOvertime(t, sec(632))).toBe('0:32');
		expect(timerDigits(t, sec(632))).toBe('0:00');
	});

	it('pauses by banking what has run, and resumes from there', () => {
		const paused = timerToggle(t, sec(125));
		expect(paused.startedAt).toBeNull();
		expect(paused.bankedMs).toBe(125_000);
		expect(timerPhase(paused, sec(400))).toBe('paused');
		// Time passing while paused changes nothing on the wall.
		expect(timerDigits(paused, sec(400))).toBe('7:55');
		const resumed = timerToggle(paused, sec(400));
		expect(timerDigits(resumed, sec(410))).toBe('7:45');
	});

	it('resets to its full length, stopped', () => {
		const r = timerReset(timerToggle(t, sec(90)));
		expect(timerPhase(r, sec(500))).toBe('ready');
		expect(timerDigits(r, sec(500))).toBe('10:00');
		expect(timerWord(r, sec(500))).toBe('Ready');
	});

	it('restarts from the top when toggled after running out', () => {
		const again = timerToggle(t, sec(700));
		expect(timerPhase(again, sec(700))).toBe('running');
		expect(timerDigits(again, sec(701))).toBe('9:59');
	});

	it('one more minute is counted from NOW once the time had run out', () => {
		const more = timerExtend(t, sec(640));
		expect(timerDigits(more, sec(640))).toBe('1:00');
		expect(timerPhase(more, sec(640))).toBe('running');
		// And adds a plain minute while there is still time left.
		expect(timerDigits(timerExtend(t, sec(60)), sec(60))).toBe('10:00');
	});
});

describe('a stopwatch and a think time', () => {
	it('a stopwatch counts up, rounds down, and is never done', () => {
		const w = stopwatch(T0);
		expect(timerDigits(w, T0 + 999)).toBe('0:00');
		expect(timerDigits(w, sec(75))).toBe('1:15');
		expect(timerDigits(w, sec(3725))).toBe('1:02:05');
		expect(timerPhase(w, sec(99999))).toBe('running');
		expect(timerWord(w, sec(10))).toBe('Stopwatch');
	});

	it('a think time names itself, and says to share when it ends', () => {
		const think = countdown(1, T0, true, 'think');
		expect(timerWord(think, sec(10))).toBe('Think time');
		expect(timerWord(think, sec(60))).toBe('Time to share');
	});

	it('elapsed is never negative, even against a clock that went backwards', () => {
		expect(timerElapsed(countdown(5, T0), T0 - 5000)).toBe(0);
	});
});

describe('a custom length, as somebody types it', () => {
	it.each([
		['7', 7],
		['7.5', 7.5],
		['7:30', 7.5],
		['90s', 1.5],
		[' 12 min ', 12],
		[4, 4]
	] as const)('%j is %d minutes', (input, minutes) => {
		expect(parseTimerMinutes(input)).toBe(minutes);
	});

	it.each(['', 'abc', '0', '0:00', '181', '7:75', null, undefined, Number.NaN])('%j is refused', (input) => {
		expect(parseTimerMinutes(input as never)).toBeNull();
	});
});

describe('the wall clock and date read the school zone and name no weekday', () => {
	it('10:00 Pacific, whatever the machine thinks', () => {
		expect(clockParts(T0)).toEqual({ time: '10:00', period: 'AM' });
		// 8pm Pacific is 03:00 UTC the next day: the clock must still say 8.
		expect(clockParts(Date.parse('2026-08-28T03:00:00Z'))).toEqual({ time: '8:00', period: 'PM' });
	});

	it('the date is the school day, with no weekday in it', () => {
		const label = wallDateLabel(Date.parse('2026-08-28T03:00:00Z'));
		expect(label).toBe('Aug 27');
		expect(label).not.toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
	});
});

describe('a timer arriving from another window is data', () => {
	it('keeps a well-formed timer', () => {
		const t = countdown(10, T0);
		expect(parseLiveTimer(JSON.parse(JSON.stringify(t)))).toEqual(t);
	});

	it('drops anything it cannot read, rather than coercing it', () => {
		for (const bad of [
			null,
			'10:00',
			{ mode: 'egg', durationMs: 1, startedAt: null, bankedMs: 0 },
			{ mode: 'countdown', durationMs: -1, startedAt: null, bankedMs: 0 },
			{ mode: 'countdown', durationMs: 60000, startedAt: 'now', bankedMs: 0 },
			{ mode: 'countdown', durationMs: 60000, startedAt: null, bankedMs: Number.POSITIVE_INFINITY }
		]) {
			expect(parseLiveTimer(bad)).toBeNull();
		}
	});

	it('formats never go negative or NaN', () => {
		expect(formatDuration(-5000)).toBe('0:00');
		expect(formatDuration(Number.NaN)).toBe('0:00');
	});
});

// ---------------------------------------------------------------------------
// PARTS OF A SECOND (ledger 0298, R27's tail): hundredths on the control view,
// tenths on the wall, hundredths on the wall in a countdown's last ten seconds.
// ---------------------------------------------------------------------------

describe('a readout to the tenth and the hundredth, at its boundaries', () => {
	it('10.00 s and 9.99 s: the whole and the fraction are cut from ONE rounding', () => {
		expect(formatReadout(10_000, 'up', 2).text).toBe('0:10.00');
		expect(formatReadout(9_990, 'up', 2).text).toBe('0:09.99');
		// A part of a hundredth left rounds a countdown UP to the next step, and
		// the seconds go with it: never "0:10.99", never "0:09.00".
		expect(formatReadout(9_995, 'up', 2).text).toBe('0:10.00');
		expect(formatReadout(9_991, 'up', 2).text).toBe('0:10.00');
		// A stopwatch rounds down.
		expect(formatReadout(9_999, 'down', 2).text).toBe('0:09.99');
		expect(formatReadout(9_999, 'down', 1).text).toBe('0:09.9');
		expect(formatReadout(9_950, 'up', 1).text).toBe('0:10.0');
		expect(formatReadout(9_900, 'up', 1).text).toBe('0:09.9');
	});

	it('zero, the last hundredth, and nothing below zero', () => {
		expect(formatReadout(0, 'up', 2).text).toBe('0:00.00');
		expect(formatReadout(1, 'up', 2).text).toBe('0:00.01');
		expect(formatReadout(1, 'down', 2).text).toBe('0:00.00');
		expect(formatReadout(-1, 'up', 2).text).toBe('0:00.00');
		expect(formatReadout(-90_000, 'down', 1).text).toBe('0:00.0');
		expect(formatReadout(Number.NaN, 'up', 2).text).toBe('0:00.00');
		expect(formatReadout(Number.NEGATIVE_INFINITY, 'down', 2).text).toBe('0:00.00');
	});

	it('over an hour, including an hour reached by rounding up', () => {
		expect(formatReadout(3_725_340, 'down', 2).text).toBe('1:02:05.34');
		expect(formatReadout(3_725_340, 'down', 1).text).toBe('1:02:05.3');
		expect(formatReadout(3_599_991, 'up', 2).text).toBe('1:00:00.00');
		expect(formatReadout(3_599_991, 'down', 2).text).toBe('59:59.99');
	});

	it('the parts are handed over separately, for a face that draws the fraction smaller', () => {
		expect(formatReadout(517_420, 'up', 2)).toEqual({ whole: '8:37', fraction: '.42', text: '8:37.42' });
		expect(formatReadout(517_420, 'up', 1)).toEqual({ whole: '8:37', fraction: '.5', text: '8:37.5' });
		expect(formatReadout(517_420, 'up', 0)).toEqual({ whole: '8:38', fraction: '', text: '8:38' });
	});
});

describe('which face shows how many places', () => {
	const t = countdown(10, T0);

	it('the control view reads hundredths; the wall reads tenths while more than ten seconds are left', () => {
		expect(timerReadout(t, T0, 'control').text).toBe('10:00.00');
		expect(timerReadout(t, T0, 'wall').text).toBe('10:00.0');
		expect(timerReadout(t, sec(83), 'wall').text).toBe('8:37.0');
		expect(timerReadout(t, sec(83) + 450, 'control').text).toBe('8:36.55');
		expect(timerReadout(t, sec(83) + 450, 'wall').text).toBe('8:36.6');
	});

	it('the wall switches to hundredths where the digits cross 10.00, never showing "0:10.00"', () => {
		// 10.000 s left: still tenths.
		expect(timerFinal(t, sec(590))).toBe(false);
		expect(timerReadout(t, sec(590), 'wall').text).toBe('0:10.0');
		// 9.995 s left reads 10.00 at hundredths, so the wall is still on tenths.
		expect(timerFinal(t, sec(590) + 5)).toBe(false);
		expect(timerReadout(t, sec(590) + 5, 'wall').text).toBe('0:10.0');
		// 9.990 s left: hundredths.
		expect(timerFinal(t, sec(590) + 10)).toBe(true);
		expect(timerReadout(t, sec(590) + 10, 'wall').text).toBe('0:09.99');
		expect(timerReadout(t, sec(592) + 580, 'wall').text).toBe('0:07.42');
	});

	it('a finished countdown holds 0:00.00 on both faces, however far over it runs', () => {
		expect(timerFinal(t, sec(600))).toBe(true);
		expect(timerReadout(t, sec(600), 'wall').text).toBe('0:00.00');
		expect(timerReadout(t, sec(632), 'wall').text).toBe('0:00.00');
		expect(timerReadout(t, sec(632), 'control').text).toBe('0:00.00');
		expect(timerOvertime(t, sec(632))).toBe('0:32');
	});

	it('a paused countdown in its last seconds holds its hundredths', () => {
		const paused = timerToggle(t, sec(592) + 580);
		expect(timerReadout(paused, sec(900), 'wall').text).toBe('0:07.42');
		expect(timerFinal(paused, sec(900))).toBe(true);
	});

	it('a stopwatch is never in its last seconds: tenths on the wall, hundredths on the control view, past the hour', () => {
		const w = stopwatch(T0);
		const at = T0 + 3_725_340;
		expect(timerFinal(w, at)).toBe(false);
		expect(timerReadout(w, at, 'wall').text).toBe('1:02:05.3');
		expect(timerReadout(w, at, 'control').text).toBe('1:02:05.34');
		expect(timerReadout(w, T0 + 5, 'control').text).toBe('0:00.00');
	});
});

describe('a face runs a frame loop only while the digits move', () => {
	const t = countdown(10, T0);

	it('running: yes; paused, set, finished or absent: no', () => {
		expect(timerTicking(t, sec(10))).toBe(true);
		expect(timerTicking(stopwatch(T0), sec(10))).toBe(true);
		expect(timerTicking(timerToggle(t, sec(10)), sec(20))).toBe(false);
		expect(timerTicking(countdown(10, T0, false), sec(20))).toBe(false);
		expect(timerTicking(t, sec(600))).toBe(false);
		expect(timerTicking(t, sec(632))).toBe(false);
		expect(timerTicking(null, sec(10))).toBe(false);
	});
});

describe('how long a face holds still, so the wall does not re-read the clock sixty times a second for ten changes', () => {
	const t = countdown(10, T0);

	it('the wall at tenths holds until the next tenth; the control view steps every hundredth', () => {
		// 517.420 s left: the wall reads 8:37.5 until 517.400 s left.
		expect(timerHoldMs(t, T0 + 82_580, 'wall')).toBe(20);
		expect(timerHoldMs(t, T0 + 82_600, 'wall')).toBe(100);
		expect(timerHoldMs(t, T0 + 82_580, 'control')).toBe(10);
		expect(timerHoldMs(t, T0 + 82_581, 'control')).toBe(9);
	});

	it('the wall wakes where it switches to hundredths, not a tenth later', () => {
		// 10.000 s left reads 0:10.0 at tenths; the switch is at 9.990 s left.
		expect(timerHoldMs(t, sec(590), 'wall')).toBe(10);
		expect(timerHoldMs(t, sec(590) - 50, 'wall')).toBe(50);
		// Inside the last ten seconds, hundredths.
		expect(timerHoldMs(t, sec(592) + 580, 'wall')).toBe(10);
	});

	it('the last hundredth holds exactly to the end, and nothing is counted after it', () => {
		expect(timerHoldMs(t, sec(600) - 4, 'wall')).toBe(4);
		expect(timerHoldMs(t, sec(600), 'wall')).toBe(Infinity);
		expect(timerHoldMs(timerToggle(t, sec(30)), sec(40), 'wall')).toBe(Infinity);
	});

	it('a stopwatch rounds down, so it holds until the next step up', () => {
		const w = stopwatch(T0);
		expect(timerHoldMs(w, T0 + 3_725_340, 'wall')).toBe(60);
		expect(timerHoldMs(w, T0 + 3_725_340, 'control')).toBe(10);
		expect(timerHoldMs(w, T0, 'wall')).toBe(100);
	});
});

describe('the tick is scheduled on an animation frame OR a timeout, never a frame alone', () => {
	/** A scheduler whose frames and timeouts fire only when the test says so. */
	function fakeHost(withFrames: boolean) {
		let next = 1;
		const frames = new Map<number, () => void>();
		const timeouts = new Map<number, { cb: () => void; ms: number }>();
		const host: FrameHost = {
			requestAnimationFrame: withFrames
				? (cb) => {
						const id = next++;
						frames.set(id, cb);
						return id;
					}
				: null,
			cancelAnimationFrame: withFrames ? (id) => void frames.delete(id) : null,
			setTimeout: (cb, ms) => {
				const id = next++;
				timeouts.set(id, { cb, ms });
				return id;
			},
			clearTimeout: (id) => void timeouts.delete(id as number)
		};
		const fireFrame = () => {
			const [id, cb] = [...frames][0];
			frames.delete(id);
			cb();
		};
		const fireTimeout = () => {
			const [id, { cb }] = [...timeouts][0];
			timeouts.delete(id);
			cb();
		};
		return { host, frames, timeouts, fireFrame, fireTimeout };
	}

	it('asks for both at once, and runs nothing until one of them fires', () => {
		const f = fakeHost(true);
		let ticks = 0;
		tickEachFrame(() => ticks++, f.host, 50);
		expect(ticks).toBe(0);
		expect(f.frames.size).toBe(1);
		expect(f.timeouts.size).toBe(1);
		expect([...f.timeouts.values()][0].ms).toBe(50);
	});

	it('a painting window ticks on its frames, and each frame cancels the pending timeout', () => {
		const f = fakeHost(true);
		let ticks = 0;
		tickEachFrame(() => ticks++, f.host, 50);
		for (let i = 0; i < 5; i++) f.fireFrame();
		expect(ticks).toBe(5);
		// One of each pending, never a pile of timeouts left behind.
		expect(f.frames.size).toBe(1);
		expect(f.timeouts.size).toBe(1);
	});

	it('A WINDOW THAT PAINTS NO FRAMES STILL TICKS, on the timeout, which cancels the frame it was waiting for', () => {
		const f = fakeHost(true);
		let ticks = 0;
		tickEachFrame(() => ticks++, f.host, 50);
		for (let i = 0; i < 4; i++) f.fireTimeout();
		expect(ticks).toBe(4);
		expect(f.frames.size).toBe(1);
		expect(f.timeouts.size).toBe(1);
	});

	it('with no animation frame at all, the timeout alone keeps time', () => {
		const f = fakeHost(false);
		let ticks = 0;
		tickEachFrame(() => ticks++, f.host, 50);
		f.fireTimeout();
		f.fireTimeout();
		expect(ticks).toBe(2);
		expect(f.timeouts.size).toBe(1);
	});

	it('a face that will hold still SLEEPS on a timeout, then paints on the next frame-or-timeout', () => {
		const f = fakeHost(true);
		let ticks = 0;
		const stop = tickEachFrame(() => {
			ticks++;
			return 90;
		}, f.host, 50);
		f.fireFrame();
		expect(ticks).toBe(1);
		// Asleep: no frame asked for, one 90 ms timeout.
		expect(f.frames.size).toBe(0);
		expect([...f.timeouts.values()].map((x) => x.ms)).toEqual([90]);
		f.fireTimeout();
		expect(ticks).toBe(1);
		// Awake: the next paint is a frame OR the floor, like any other.
		expect(f.frames.size).toBe(1);
		expect([...f.timeouts.values()].map((x) => x.ms)).toEqual([50]);
		f.fireFrame();
		expect(ticks).toBe(2);
		stop();
		expect(f.frames.size + f.timeouts.size).toBe(0);
	});

	it('a hold no longer than the floor, or none at all, runs every frame', () => {
		const f = fakeHost(true);
		let ticks = 0;
		tickEachFrame(() => {
			ticks++;
			return ticks === 1 ? 10 : Infinity;
		}, f.host, 50);
		f.fireFrame();
		f.fireFrame();
		f.fireFrame();
		expect(ticks).toBe(3);
		expect(f.frames.size).toBe(1);
	});

	it('stopping cancels both and nothing ticks afterwards, including from inside a tick', () => {
		const f = fakeHost(true);
		let ticks = 0;
		const stop = tickEachFrame(() => ticks++, f.host, 50);
		f.fireFrame();
		stop();
		expect(f.frames.size).toBe(0);
		expect(f.timeouts.size).toBe(0);
		expect(ticks).toBe(1);

		const g = fakeHost(true);
		let inner = 0;
		const stopInner: () => void = tickEachFrame(() => {
			inner++;
			stopInner();
		}, g.host, 50);
		g.fireFrame();
		expect(inner).toBe(1);
		expect(g.frames.size + g.timeouts.size).toBe(0);
	});
});
