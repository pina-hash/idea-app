/**
 * THE FULLEST WALL, ON THE IDEA THEME (reports R12, R13): the fit stress.
 * Twelve agenda lines (the most a frame carries, some long), three Coming up
 * lines, the hall pass, a shown pick, and a class of thirty with names on, all
 * beside the ring timer.
 *
 * THE SIDE IS FITTED, NEVER CLIPPED (`wallFit` in live-class/wall-layout.ts):
 * the largest type that fits the side's measured box, never below the 8H floor,
 * and only at the floor a cut, in a fixed order (names, then the agenda's tail
 * down to four, then Coming up down to one), each said on the wall as "+N
 * more". A pane that hid its overflow would pass "does the page scroll" by
 * hiding what does not fit, so this reads every card's own content height.
 *
 * Run it at the projector widths too: `npm run verify:browser -- --route
 * classroom-projector-demo-full --width 1280 --width 1440 --width 1920` (the
 * harness height is 900; the 1280x800 and 1920x1080 readings were taken with a
 * script at those sizes and are in the lane report).
 *
 * WHAT IS MEASURED:
 *   - the wall fits, every card holds its content, the side holds its cards,
 *     and 8H holds;
 *   - EVERY CUT IS SAID: the agenda lines shown plus the "+N more" figure is
 *     all twelve, Coming up shown plus its figure is all three, and every
 *     named group's names shown plus its figure is that group's count;
 *   - the ring still fills the wall beside a full side.
 */
import { EIGHT_H, EVERY_CUT_SAID, PROJECTOR_READY, RING_FILLS, WALL_CARDS_FIT, WALL_FITS_ANY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=full',
	label: 'Class projector, the fullest wall (IDEA): twelve lines, Coming up, a class of thirty named (R12, R13)',
	prepare: [
		PROJECTOR_READY,
		{ waitFor: `() => !!document.querySelector('[data-testid="projector-activity"]')`, timeoutMs: 10000 },
		{
			evaluate: `() => { const s = document.querySelector('[data-testid="projector-side"]'); return 'side ' + Math.round(s.clientWidth) + 'x' + Math.round(s.clientHeight) + ' at body ' + getComputedStyle(s).fontSize + '; agenda shown ' + document.querySelectorAll('[data-testid="projector-agenda-line"]').length + '; names shown ' + document.querySelectorAll('.lp-name:not(.lp-name-more)').length; }`
		}
	],
	orderResult: [
		{ label: 'every card holds its content', evaluate: WALL_CARDS_FIT, expected: ['every card holds its content', 'the side column holds its cards'] },
		{ label: 'every cut is said: shown plus "+N more" is the whole', evaluate: EVERY_CUT_SAID, expected: ['agenda 12', 'next 3', 'every name accounted for'] },
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] },
		{ label: 'the ring still fills the wall', evaluate: RING_FILLS(0.6, 0.08), expected: ['a ring drawn', 'the ring fills the wall', 'the digits read from the back'] }
	],
	presence: [
		{ selector: '[data-testid="projector-agenda"]', label: 'the agenda', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-next"]', label: 'Coming up', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-activity"]', label: 'student activity', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-pick"]', label: 'the shown pick', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-hall"]', label: 'the hall pass', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-names"][data-key="working"]', label: 'no names under Working', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.lp-class', label: 'class name', min: 4.5 },
		{ selector: '.lp-line', label: 'agenda and Coming up lines', min: 4.5, all: true },
		{ selector: '.lp-count', label: 'count numerals', min: 4.5, all: true },
		{ selector: '.lp-pick-name', label: 'picked name', min: 4.5 },
		{ selector: '.lp-name', label: 'names', min: 4.5, all: true },
		{ selector: '.lp-label', label: 'labels', min: 4.5, all: true }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
