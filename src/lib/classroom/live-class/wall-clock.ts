/**
 * THE WALL'S CLOCK FACE (idea 26033e4b, "a fancy cool looking clock that
 * matches the theme of the page to appear optionally on the projector view").
 *
 * Plain data and pure arithmetic: no Svelte, no DOM and no clock of its own, so
 * every rule here is assertable in the `node` test project at a pinned instant.
 * `WallClock.svelte` draws it; `ProjectorView` decides when.
 *
 * WHICH FACE IS A CHOICE THE FRAME CARRIES (`ProjectorFrame.clockFace`), made
 * on the teacher's own screen and remembered on that computer
 * (`display.wallClock` in the classroom preference store). `digits` is the
 * wall as it always was; `dial` is an analog face drawn on the wall's own
 * Plate ring, with the digits under it.
 */
import { schoolClockParts } from '$lib/classroom/school-calendar';

export type WallClockFace = 'digits' | 'dial';

/**
 * Every face, the default first. APPEND-ONLY, for the reason `curriculum.ts`'s
 * `SECTIONS` is: an id may be sitting in a browser's stored preference, and a
 * removed one would silently turn somebody's wall back to the default.
 */
export const WALL_CLOCK_FACES: readonly WallClockFace[] = ['digits', 'dial'];

/** The face a stored or received value names, or the default. */
export function wallClockFace(value: unknown): WallClockFace {
	return value === 'dial' ? 'dial' : 'digits';
}

export interface ClockHandAngles {
	/** Degrees clockwise from twelve. */
	hour: number;
	minute: number;
	second: number;
}

/**
 * WHERE THE HANDS POINT AT AN INSTANT, in degrees clockwise from twelve, in
 * the school's own time (never the projector computer's zone).
 *
 * THE HOUR AND MINUTE HANDS STEP ONCE A MINUTE, railway-clock style: the minute
 * hand sits on the whole minute and the hour hand moves a twelfth of an hour
 * each minute. Only the second hand moves every second. So under reduced
 * motion, where the second hand is not drawn, nothing on the dial moves more
 * than once a minute, and the overlay repaints once a minute rather than once a
 * second for the two hands a class reads.
 */
export function clockHandAngles(now: number): ClockHandAngles {
	const { hour, minute, second } = schoolClockParts(now);
	return {
		hour: ((hour % 12) + minute / 60) * 30,
		minute: minute * 6,
		second: second * 6
	};
}
