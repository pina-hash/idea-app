/**
 * THE FRONT-OF-ROOM CLOCK AND TIMERS (ledger 0297, package LIVE): the pure half.
 *
 * A countdown, a stopwatch and the wall clock, as plain data and arithmetic.
 * No Svelte, no DOM and NO CLOCK: every function that needs "now" takes it as a
 * parameter, so each one is assertable at a pinned instant and the two windows
 * that show a timer (the teacher's control view and the projector view) agree
 * because they compute from the same stored numbers rather than from two
 * running counters.
 *
 * WHY A TIMER IS STORED AS A START INSTANT AND NOT AS A NUMBER THAT TICKS. The
 * projector is a SECOND WINDOW, usually on a second display, and nothing ticks
 * it from the control view: a message per second would be a message stream
 * that can stall, arrive late, or pile up behind a busy tab. So a running timer
 * is `{ startedAt, bankedMs }` and every window re-derives what to print from
 * its own `Date.now()`. Both windows run on the same machine, so the same
 * instant prints the same second in both.
 *
 * ClassroomScreen's teachers use the time widgets most (timer, clock,
 * stopwatch), which is the research this set comes from: three presets, a
 * custom length, start, pause, reset, one minute more, and a stopwatch.
 */

import { SCHOOL_LOCALE, SCHOOL_TIME_ZONE } from '$lib/classroom/school-calendar';

export type TimerMode = 'countdown' | 'stopwatch';

/**
 * WHAT THE TIMER IS FOR. `think` is the warm-call pause (discuss with a
 * partner, then the teacher picks): the same countdown, labelled on the wall
 * so the room knows why it is running. Absent means an ordinary work timer.
 */
export type TimerPurpose = 'work' | 'think';

export interface LiveTimer {
	mode: TimerMode;
	/** A countdown's length in ms. Zero for a stopwatch, which has no end. */
	durationMs: number;
	/** Wall-clock ms when the current run began, or null while stopped. */
	startedAt: number | null;
	/** Time already run before `startedAt`, in ms: what a pause banked. */
	bankedMs: number;
	purpose?: TimerPurpose;
}

/** The three one-tap lengths, in minutes. Five, ten and fifteen cover a period. */
export const TIMER_PRESET_MINUTES = [5, 10, 15] as const;

/** How long a warm-call think time runs by default: long enough to turn to a partner. */
export const THINK_TIME_MINUTES = 1;

/** The longest countdown a custom entry may ask for: a double block. */
export const TIMER_MAX_MINUTES = 180;

/** What "one more minute" adds. */
export const TIMER_EXTEND_MS = 60_000;

const MINUTE = 60_000;

/** A countdown of `minutes`, started at `now` (or set and waiting, when `start` is false). */
export function countdown(
	minutes: number,
	now: number,
	start = true,
	purpose: TimerPurpose = 'work'
): LiveTimer {
	const durationMs = Math.round(Math.max(0, minutes) * MINUTE);
	return {
		mode: 'countdown',
		durationMs,
		startedAt: start ? now : null,
		bankedMs: 0,
		...(purpose === 'think' ? { purpose } : {})
	};
}

/** A stopwatch, started at `now`. */
export function stopwatch(now: number): LiveTimer {
	return { mode: 'stopwatch', durationMs: 0, startedAt: now, bankedMs: 0 };
}

/** How long the timer has run in total. Never negative, whatever the clock says. */
export function timerElapsed(t: LiveTimer, now: number): number {
	const running = t.startedAt === null ? 0 : Math.max(0, now - t.startedAt);
	return Math.max(0, t.bankedMs + running);
}

/** A countdown's time left, which goes NEGATIVE once it has run out (that is the overtime). */
export function timerRemaining(t: LiveTimer, now: number): number {
	return t.durationMs - timerElapsed(t, now);
}

export type TimerPhase = 'ready' | 'running' | 'paused' | 'done';

/**
 * WHERE THE TIMER STANDS. `done` is a countdown whose time has run out, whether
 * or not it is still counting the overtime. A stopwatch is never done.
 */
export function timerPhase(t: LiveTimer, now: number): TimerPhase {
	const elapsed = timerElapsed(t, now);
	if (t.mode === 'countdown' && elapsed > 0 && elapsed >= t.durationMs) return 'done';
	if (t.startedAt !== null) return 'running';
	if (t.bankedMs > 0) return 'paused';
	return 'ready';
}

/** Start a stopped timer, or pause a running one. A countdown that has run out starts over. */
export function timerToggle(t: LiveTimer, now: number): LiveTimer {
	if (t.mode === 'countdown' && timerPhase(t, now) === 'done') {
		return { ...t, startedAt: now, bankedMs: 0 };
	}
	if (t.startedAt === null) return { ...t, startedAt: now };
	return { ...t, startedAt: null, bankedMs: timerElapsed(t, now) };
}

/** Back to the start, stopped: a countdown shows its full length again, a stopwatch 0:00. */
export function timerReset(t: LiveTimer): LiveTimer {
	return { ...t, startedAt: null, bankedMs: 0 };
}

/**
 * ONE MORE MINUTE on a countdown, running or not. A countdown that had run out
 * gets its minute counted from NOW rather than from the moment it ended, so the
 * wall reads 1:00 and not whatever is left after the overtime is paid back.
 */
export function timerExtend(t: LiveTimer, now: number, ms = TIMER_EXTEND_MS): LiveTimer {
	if (t.mode !== 'countdown') return t;
	const elapsed = timerElapsed(t, now);
	const base = Math.max(t.durationMs, elapsed);
	return { ...t, durationMs: base + ms };
}

/**
 * A CUSTOM LENGTH AS SOMEBODY TYPED IT: "7", "7.5", "7:30" or "90s". Null for
 * anything else, and for a length outside 1 second to `TIMER_MAX_MINUTES`, so
 * the Start control is offered only when it will start something.
 *
 * `bind:value` on a number input COERCES to a number (the CLAUDE.md trap that
 * bit three times), so this takes either shape and never calls `.trim()` on a
 * number.
 */
export function parseTimerMinutes(input: string | number | null | undefined): number | null {
	if (input === null || input === undefined) return null;
	let minutes: number;
	if (typeof input === 'number') {
		minutes = input;
	} else {
		const text = String(input).trim().toLowerCase();
		if (!text) return null;
		const clock = /^(\d{1,3}):([0-5]\d)$/.exec(text);
		const seconds = /^(\d{1,5})\s*s(ec(onds?)?)?$/.exec(text);
		const plain = /^(\d{1,3}(\.\d{1,2})?)\s*(m|min|mins|minutes?)?$/.exec(text);
		if (clock) minutes = Number(clock[1]) + Number(clock[2]) / 60;
		else if (seconds) minutes = Number(seconds[1]) / 60;
		else if (plain) minutes = Number(plain[1]);
		else return null;
	}
	if (!Number.isFinite(minutes) || minutes * 60 < 1 || minutes > TIMER_MAX_MINUTES) return null;
	return minutes;
}

/**
 * A DURATION AS THE WALL READS IT: `m:ss`, or `h:mm:ss` from an hour up.
 *
 * `round` decides which way a part-second goes, and the two modes want
 * different answers: a countdown ROUNDS UP, so it reads 10:00 for the whole of
 * its first second and reaches 0:00 exactly when time is up, never a second
 * early; a stopwatch rounds down, so it reads 0:00 until a whole second has
 * actually passed.
 */
export function formatDuration(ms: number, round: 'up' | 'down' = 'down'): string {
	const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
	const total = round === 'up' ? Math.ceil(safe / 1000) : Math.floor(safe / 1000);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const ss = String(s).padStart(2, '0');
	return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** What the timer's big digits read at `now`. */
export function timerDigits(t: LiveTimer, now: number): string {
	if (t.mode === 'stopwatch') return formatDuration(timerElapsed(t, now), 'down');
	return formatDuration(Math.max(0, timerRemaining(t, now)), 'up');
}

/** How far past the end a countdown is, as "0:32", or null while it has time left. */
export function timerOvertime(t: LiveTimer, now: number): string | null {
	if (t.mode !== 'countdown') return null;
	const over = -timerRemaining(t, now);
	return over >= 1000 ? formatDuration(over, 'down') : null;
}

/**
 * THE WORD BESIDE THE DIGITS, one per phase, so the state is never carried by
 * colour alone. A think timer names what the pause is for.
 */
export function timerWord(t: LiveTimer, now: number): string {
	const phase = timerPhase(t, now);
	if (phase === 'done') return t.purpose === 'think' ? 'Time to share' : 'Time is up';
	if (t.purpose === 'think') return phase === 'paused' ? 'Think time, paused' : 'Think time';
	if (t.mode === 'stopwatch') return phase === 'paused' ? 'Stopwatch, paused' : 'Stopwatch';
	if (phase === 'paused') return 'Paused';
	if (phase === 'ready') return 'Ready';
	return 'Timer';
}

/**
 * THE WALL CLOCK, split so the digits can be large and the AM/PM small. Always
 * the school's own zone: the projector computer and the teacher's laptop may
 * disagree about where they are, and the class is in one place.
 */
export function clockParts(now: number): { time: string; period: string } {
	const text = new Date(now).toLocaleTimeString(SCHOOL_LOCALE, {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: SCHOOL_TIME_ZONE
	});
	const match = /^(.*?)\s*([AP]M)$/i.exec(text.replace(/ /g, ' '));
	return match ? { time: match[1], period: match[2].toUpperCase() } : { time: text, period: '' };
}

/**
 * THE DATE ON THE WALL, month and day. NO WEEKDAY: student-facing copy names
 * none (the brief's rule), and a projector is the most student-facing surface
 * there is.
 */
export function wallDateLabel(now: number): string {
	return new Date(now).toLocaleDateString(SCHOOL_LOCALE, {
		month: 'short',
		day: 'numeric',
		timeZone: SCHOOL_TIME_ZONE
	});
}

/** Is this value a timer this module can read? Anything else is dropped, never coerced. */
export function parseLiveTimer(value: unknown): LiveTimer | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	if (v.mode !== 'countdown' && v.mode !== 'stopwatch') return null;
	const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
	const durationMs = num(v.durationMs);
	const bankedMs = num(v.bankedMs);
	const startedAt = v.startedAt === null ? null : num(v.startedAt);
	if (durationMs === null || bankedMs === null || durationMs < 0 || bankedMs < 0) return null;
	if (v.startedAt !== null && startedAt === null) return null;
	if (durationMs > TIMER_MAX_MINUTES * MINUTE + 24 * 60 * MINUTE) return null;
	return {
		mode: v.mode,
		durationMs,
		startedAt,
		bankedMs,
		...(v.purpose === 'think' ? { purpose: 'think' as const } : {})
	};
}
