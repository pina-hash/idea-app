/**
 * THE WALL WITH NO TIMER (reports R12, R13): the clock is the hero, large,
 * beside the side cards (the hall pass, today's agenda and Coming up), rather
 * than a 32px clock at the top of an empty screen.
 *
 * WHAT IS MEASURED:
 *   - the clock is at least 18vh tall and there is exactly one (the hero, not
 *     a card as well);
 *   - the side cards are there and fit; the wall fits; 8H holds;
 *   - no timer and no ring (the absence, beside `classroom-projector-demo-
 *     timer`, where they are).
 */
import { EIGHT_H, PROJECTOR_READY, WALL_CARDS_FIT, WALL_FITS_ANY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=clock',
	label: 'Class projector: no timer, the clock is the hero (R12, R13)',
	prepare: [PROJECTOR_READY],
	orderResult: [
		{
			label: 'the clock is the hero, at least 18vh',
			evaluate: `() => { if (innerWidth < innerHeight) return ['the clock is large']; const c = document.querySelector('[data-testid="projector-clock"]'); const fs = parseFloat(getComputedStyle(c).fontSize); return [fs >= 0.18 * innerHeight ? 'the clock is large' : 'clock ' + fs + 'px < ' + Math.round(0.18 * innerHeight) + 'px']; }`,
			expected: ['the clock is large']
		},
		{ label: 'every card holds its content', evaluate: WALL_CARDS_FIT, expected: ['every card holds its content', 'the side column holds its cards'] },
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [
		{ selector: '[data-testid="projector-clock"]', label: 'one clock, the hero', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.lp-bigclock', label: 'drawn as the hero', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-agenda"]', label: 'the agenda', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-next"]', label: 'Coming up', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-hall"]', label: 'the hall pass', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-timer"], [data-testid="plate-ring"]', label: 'no timer and no ring', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.lp-clock', label: 'clock', min: 4.5 },
		{ selector: '.lp-line', label: 'agenda and Coming up lines', min: 4.5, all: true }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
