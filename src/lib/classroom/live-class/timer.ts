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
 *
 * PARTS OF A SECOND (ledger 0298, R27's tail). The control view reads to the
 * hundredth always; the wall reads to the tenth, and to the hundredth in a
 * countdown's last ten seconds (`timerReadout`, `timerFinal`). The digits are
 * still DERIVED from the clock at every paint, never counted by ticks, so a
 * late or skipped tick shows the right time a moment later rather than a wrong
 * one. The one thing here that is not arithmetic is `tickEachFrame`, which
 * schedules those paints on an animation frame OR a timeout, never a frame
 * alone; it reads no clock and takes its scheduler as a parameter, so it is as
 * assertable as the rest.
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

/** How many decimal places of a second a readout shows: none, tenths or hundredths. */
export type TimerPlaces = 0 | 1 | 2;

/** A readout's step in ms, per number of places. */
const PLACE_MS: Record<TimerPlaces, number> = { 0: 1000, 1: 100, 2: 10 };

/**
 * A READOUT IN TWO PARTS: `whole` is `m:ss` (or `h:mm:ss` from an hour up),
 * the part a class reads from the back of the room, and `fraction` is `.d` or
 * `.dd` (empty at no places), which a face draws smaller beside it. `text` is
 * the two together.
 */
export interface TimerReadout {
	whole: string;
	fraction: string;
	text: string;
}

/**
 * A DURATION AS A FACE READS IT, to `places` decimal places of a second.
 *
 * `round` decides which way the part below the last place goes, and the two
 * modes want different answers: a countdown ROUNDS UP, so it reads 10:00.00
 * until a whole hundredth has gone and reaches 0:00.00 exactly when time is
 * up, never a step early; a stopwatch rounds down, so it reads 0:00.00 until a
 * hundredth has actually passed. The rounding happens ONCE, in whole steps of
 * the last place shown, and the whole and the fraction are both cut from that
 * one number -- which is what stops a countdown reading "0:10.99" (a rounded-up
 * whole beside a separately rounded fraction).
 *
 * Negative, infinite and NaN inputs read as zero: a face never shows a minus.
 */
export function formatReadout(ms: number, round: 'up' | 'down', places: TimerPlaces): TimerReadout {
	const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
	const step = PLACE_MS[places];
	const perSecond = 1000 / step;
	const steps = round === 'up' ? Math.ceil(safe / step) : Math.floor(safe / step);
	const total = Math.floor(steps / perSecond);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const ss = String(total % 60).padStart(2, '0');
	const whole = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
	const fraction = places === 0 ? '' : `.${String(steps % perSecond).padStart(places, '0')}`;
	return { whole, fraction, text: whole + fraction };
}

/**
 * A DURATION IN WHOLE SECONDS: `m:ss`, or `h:mm:ss` from an hour up. The
 * overtime line and the whole-second face read this; it is `formatReadout` at
 * no places, so there is one formatter.
 */
export function formatDuration(ms: number, round: 'up' | 'down' = 'down'): string {
	return formatReadout(ms, round, 0).whole;
}

/** What the timer's big digits read at `now`, to the whole second. */
export function timerDigits(t: LiveTimer, now: number): string {
	if (t.mode === 'stopwatch') return formatDuration(timerElapsed(t, now), 'down');
	return formatDuration(Math.max(0, timerRemaining(t, now)), 'up');
}

/**
 * WHICH FACE IS READING. The teacher's control view is a laptop at arm's
 * length; the wall is read from the back of the room.
 */
export type TimerFace = 'control' | 'wall';

/**
 * A COUNTDOWN'S LAST STRETCH, in ms. R27 asked for "counting milliseconds";
 * the 2026-09-25 triage's default for decision owed (6), taken overnight, is
 * hundredths on the control view always and on the wall only in this stretch,
 * tenths otherwise. A wall of hundredths for ten minutes is a blur the back row
 * cannot read, and the last ten seconds is when a class is watching the clock.
 */
export const TIMER_FINAL_MS = 10_000;

/**
 * IS A COUNTDOWN IN ITS LAST TEN SECONDS? Judged on the face at hundredths, so
 * the wall switches exactly where the digits cross 10.00 and never shows
 * "0:10.00": at 10.000 s left it reads 0:10.0, at 9.990 s it reads 0:09.99. A
 * countdown that has run out counts (its face holds 0:00.00); a stopwatch
 * never does.
 */
export function timerFinal(t: LiveTimer, now: number): boolean {
	if (t.mode !== 'countdown') return false;
	const step = PLACE_MS[2];
	return Math.ceil(Math.max(0, timerRemaining(t, now)) / step) < TIMER_FINAL_MS / step;
}

/** How many places a face shows at `now`: hundredths on the control view, the wall's rule above. */
export function timerPlaces(t: LiveTimer, now: number, face: TimerFace): TimerPlaces {
	if (face === 'control') return 2;
	return timerFinal(t, now) ? 2 : 1;
}

/** What a face's big digits read at `now`, with the parts of a second that face shows. */
export function timerReadout(t: LiveTimer, now: number, face: TimerFace): TimerReadout {
	const places = timerPlaces(t, now, face);
	if (t.mode === 'stopwatch') return formatReadout(timerElapsed(t, now), 'down', places);
	return formatReadout(Math.max(0, timerRemaining(t, now)), 'up', places);
}

/**
 * HOW LONG A FACE WILL HOLD STILL from `now`, in ms: the time until the last
 * place it shows next steps, or until the wall switches from tenths to
 * hundredths, whichever comes first. The wall at tenths changes ten times a
 * second, so its frame loop sleeps between those rather than re-reading the
 * clock sixty times a second for nothing; the control view's hundredths step
 * faster than a frame, so it reads every frame. Infinity for a timer that is
 * not counting (stopped, or a countdown that has run out and holds 0:00.00).
 */
export function timerHoldMs(t: LiveTimer, now: number, face: TimerFace): number {
	if (t.startedAt === null) return Infinity;
	const step = PLACE_MS[timerPlaces(t, now, face)];
	if (t.mode === 'stopwatch') return step - (timerElapsed(t, now) % step);
	const remaining = timerRemaining(t, now);
	if (remaining <= 0) return Infinity;
	// A countdown rounds up, so its face steps as `remaining` falls onto a
	// multiple of the step: from 7420 at tenths ("7.5") it holds 20 ms.
	const toStep = ((remaining - 1) % step) + 1;
	const final = TIMER_FINAL_MS - PLACE_MS[2];
	return face === 'wall' && remaining > final ? Math.min(toStep, remaining - final) : toStep;
}

/**
 * DOES A FACE NEED A FRESH READING EVERY FRAME? Only while its digits move: a
 * timer that is running and has not run out. A ready, paused or finished one
 * shows the same digits until somebody presses something (the overtime line
 * counts whole seconds, which the page's own slower clock covers), so no frame
 * loop runs for a timer left on the wall all period.
 */
export function timerTicking(t: LiveTimer | null, now: number): boolean {
	return t !== null && t.startedAt !== null && timerPhase(t, now) !== 'done';
}

/**
 * THE FLOOR UNDER A FRAME THAT NEVER COMES, in ms. A window the browser has
 * stopped painting (hidden, minimised, covered) runs no animation frame at all,
 * so every tick is also scheduled as a timeout. The browser may stretch that
 * further in a hidden window, which costs nothing: the digits are derived from
 * the clock, so a late tick shows the right time, just later.
 */
export const TIMER_TICK_FLOOR_MS = 50;

/** What `tickEachFrame` schedules with, injected so a test can hand it fakes. */
export interface FrameHost {
	requestAnimationFrame?: ((callback: () => void) => number) | null;
	cancelAnimationFrame?: ((handle: number) => void) | null;
	setTimeout: (callback: () => void, ms: number) => unknown;
	clearTimeout: (handle: unknown) => void;
}

/** This page's own scheduler. No animation frame where there is none (a server render, a worker). */
export function browserFrameHost(): FrameHost {
	const g = globalThis as typeof globalThis & {
		requestAnimationFrame?: (cb: () => void) => number;
		cancelAnimationFrame?: (handle: number) => void;
	};
	return {
		requestAnimationFrame:
			typeof g.requestAnimationFrame === 'function' ? (cb) => g.requestAnimationFrame!(cb) : null,
		cancelAnimationFrame: typeof g.cancelAnimationFrame === 'function' ? (h) => g.cancelAnimationFrame!(h) : null,
		setTimeout: (cb, ms) => g.setTimeout(cb, ms),
		clearTimeout: (h) => g.clearTimeout(h as ReturnType<typeof setTimeout>)
	};
}

/**
 * CALL `tick` ON EVERY FRAME, OR EVERY `floorMs` WHERE NO FRAME COMES, until
 * the returned function is called. RAF-OR-TIMEOUT, NEVER RAF ALONE (CLAUDE.md,
 * DOM): each tick is scheduled BOTH ways, whichever fires first runs it and
 * cancels the other, so a painting window ticks on its frames and a window the
 * browser stopped painting still ticks on the timeout. Nothing runs
 * synchronously: the first tick is the first frame or timeout after the call.
 *
 * A tick may answer how long its face will hold still (`timerHoldMs`). Longer
 * than `floorMs`, the loop SLEEPS on a timeout for that long and then asks for
 * the next frame-or-timeout, so the paint still lands on the first frame after
 * the digits change; shorter, or no answer, and it simply runs every frame.
 */
export function tickEachFrame(
	tick: () => number | void,
	host: FrameHost = browserFrameHost(),
	floorMs = TIMER_TICK_FLOOR_MS
): () => void {
	let stopped = false;
	let frame: number | null = null;
	let timeout: unknown = null;
	const cancel = () => {
		if (frame !== null) host.cancelAnimationFrame?.(frame);
		if (timeout !== null) host.clearTimeout(timeout);
		frame = null;
		timeout = null;
	};
	const run = () => {
		cancel();
		if (stopped) return;
		const hold = tick();
		if (stopped) return;
		if (typeof hold === 'number' && hold > floorMs && Number.isFinite(hold)) {
			timeout = host.setTimeout(() => {
				timeout = null;
				if (!stopped) schedule();
			}, hold);
		} else {
			schedule();
		}
	};
	const schedule = () => {
		if (host.requestAnimationFrame) frame = host.requestAnimationFrame(run);
		timeout = host.setTimeout(run, floorMs);
	};
	schedule();
	return () => {
		stopped = true;
		cancel();
	};
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
