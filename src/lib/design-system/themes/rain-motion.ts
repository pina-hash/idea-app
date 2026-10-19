/**
 * WHETHER THE MATRIX THEME'S FALLING CODE MOVES (report 551c11e3, ledger
 * 0416: "Matrix theme isn't moving").
 *
 * The rain stands still for two reasons, both by design and both invisible to
 * the person looking at it: the computer asks for less motion (Windows'
 * "Animation effects" off, which many school images ship with, reaches the
 * browser as `prefers-reduced-motion: reduce`), or this computer could not keep
 * up and the rain parked itself (`judgeFrame` in `matrix-rain.ts`). So the
 * theme picker says which it is, and offers the one explicit choice the reader
 * can make: ALWAYS MOVE. The default follows the computer, so nobody who asked
 * for less motion gets more without choosing it; choosing the Matrix theme is
 * not that choice, pressing "Always move" is.
 *
 * PER BROWSER, NOT PER ACCOUNT: it answers a question about this computer.
 * Stored in localStorage, read and written inside try/catch (site data can be
 * blocked), and announced to the painter with one window event.
 */
export type RainMotion = 'system' | 'always';

export const RAIN_MOTION_KEY = 'idea-rain-motion';
export const RAIN_MOTION_EVENT = 'idea:rain-motion';

export function readRainMotion(): RainMotion {
	try {
		return globalThis.localStorage?.getItem(RAIN_MOTION_KEY) === 'always' ? 'always' : 'system';
	} catch {
		return 'system';
	}
}

export function writeRainMotion(next: RainMotion): void {
	try {
		if (next === 'always') globalThis.localStorage?.setItem(RAIN_MOTION_KEY, 'always');
		else globalThis.localStorage?.removeItem(RAIN_MOTION_KEY);
	} catch {
		/* Blocked site data: the choice lasts for this page only. */
	}
	globalThis.dispatchEvent?.(new CustomEvent(RAIN_MOTION_EVENT, { detail: next }));
}

/** What the rain's canvas says it is doing (`data-motion`), in words for the theme picker. */
export function rainStateWords(motion: string | null | undefined): string | null {
	switch (motion) {
		case 'running':
		case 'half':
			return 'The code is falling.';
		case 'reduced':
			return 'Still: this computer asks for less motion.';
		case 'still-slow':
			return 'Still: this computer could not keep up with it.';
		default:
			return null;
	}
}
