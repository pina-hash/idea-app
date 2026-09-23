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
	parseLiveTimer,
	parseTimerMinutes,
	stopwatch,
	timerDigits,
	timerElapsed,
	timerExtend,
	timerOvertime,
	timerPhase,
	timerReset,
	timerToggle,
	timerWord,
	wallDateLabel
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
