/**
 * THE WALL WITH A TIMER AND NOTHING ELSE (reports R12, R13): the screenshot
 * Mr. Pina filed, a 48px timer and a 32px clock at the top of a 1440x982 wall
 * with the rest of the screen empty.
 *
 * The cause was structural: with no agenda the time column was a shrink-to-fit
 * grid item that was also its own size container, so it collapsed to 0px wide
 * and every size measured against it fell to its clamp floor. No spec caught
 * it because every demo seeded four agenda lines; this one seeds none.
 *
 * WHAT IS MEASURED:
 *   - the Plate progress ring is drawn inside the timer, at least 60% of the
 *     window's height, and the digits in its middle are at least 8vh;
 *   - the wall fits its window and the 8H rule holds;
 *   - the clock still shows, beside the ring (a card in the side column);
 *   - the digits on the ring's face, read off the face's own resolved
 *     gradient stops (the contrast walk cannot see an SVG face), and the arc on
 *     its track; under IDEA these are WCAG-judged in the prepare step's
 *     printout (IDEA is not a projector theme, CLAUDE.md), and the Space White
 *     spec judges them washed.
 */
import { EIGHT_H, PROJECTOR_READY, RING_FILLS, WALL_FITS_ANY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=timer',
	label: 'Class projector: a timer and nothing else, the ring fills the wall (R12)',
	prepare: [PROJECTOR_READY, { waitFor: `() => !!document.querySelector('[data-testid="projector-timer"] [data-testid="plate-ring"]')`, timeoutMs: 10000 }],
	orderResult: [
		{ label: 'the ring is the timer and fills the wall; the digits read from the back', evaluate: RING_FILLS(0.6, 0.08), expected: ['a ring drawn', 'the ring fills the wall', 'the digits read from the back'] },
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] },
		{
			label: 'the wall reads tenths with more than ten seconds left',
			evaluate: `() => { const t = document.querySelector('[data-testid="projector-timer-digits"]').textContent; return [/^\\d+:\\d\\d\\.\\d$/.test(t) ? 'tenths' : t]; }`,
			expected: ['tenths']
		}
	],
	presence: [
		{ selector: '[data-testid="projector-timer"] [data-testid="plate-ring"]', label: 'the Plate ring, inside the timer', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-clock"]', label: 'the clock, beside the ring', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-agenda"], [data-testid="projector-pick"], [data-testid="projector-hall"], [data-testid="projector-activity"]', label: 'nothing else: no agenda, pick, hall pass or activity', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.lp-class', label: 'class name', min: 4.5 },
		{ selector: '.lp-clock', label: 'clock', min: 4.5 },
		{ selector: '.lp-word', label: 'timer word', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="projector-strip"] button', label: 'strip controls' }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
