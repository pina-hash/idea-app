/**
 * THE CLOCK FACE ON THE WALL (idea 26033e4b): with no timer up and the teacher's
 * Clock face on, the hero is an analog dial drawn on the wall's own Plate ring,
 * with the digits under it. `?clock=pinned` holds the page's clock still, so the
 * hands and the digits are read at one instant.
 *
 * WHAT IS MEASURED:
 *   - one dial, one clock reading (the digits), no plain big clock, no timer:
 *     the dial REPLACES the hero rather than joining it;
 *   - the hands agree with the digits within half a degree, and the dial is at
 *     least half the window's height (landscape), with the digits under it;
 *   - the side cards still fit, the wall still fits, 8H still holds;
 *   - the hands' inks on the resolved face stops (WCAG under IDEA), the digits'
 *     contrast, and the arrival sweep gated on reduced motion (`motion`: the
 *     hour and minute hands animate under no-preference, and under reduce they
 *     carry no animation and no transform and are still painted).
 *
 * `classroom-projector-demo-clock` is the same wall with the face off, and is
 * the absence: one `.lp-bigclock`, no dial.
 */
import { DIAL_HANDS_WCAG, DIAL_READS, EIGHT_H, PROJECTOR_READY, WALL_CARDS_FIT, WALL_FITS_ANY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=clock&face=dial&clock=pinned',
	label: 'Class projector: the clock face, the hero when no timer is up (idea 26033e4b)',
	prepare: [PROJECTOR_READY, { waitFor: `() => !!document.querySelector('[data-testid="projector-dial"] [data-testid="plate-ring"]')`, timeoutMs: 10000 }],
	orderResult: [
		{ label: 'the hands read the digits, the dial fills the hero, the digits sit under it', evaluate: DIAL_READS, expected: ['the hands agree with the digits', 'the dial fills the hero', 'the digits sit under the dial'] },
		{ label: 'the hands, the indices and the second hand on the resolved face stops, and on their halos (WCAG)', evaluate: DIAL_HANDS_WCAG, expected: ['hands and indices clear 4.5 WCAG on the face', 'the second hand clears 3 WCAG on the face', 'every hand clears 3 WCAG on its halo'] },
		{ label: 'every card holds its content', evaluate: WALL_CARDS_FIT, expected: ['every card holds its content', 'the side column holds its cards'] },
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [
		{ selector: '[data-testid="projector-dial"]', label: 'one clock face', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-dial"] [data-testid="plate-ring"]', label: 'drawn on the Plate ring', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-clock"]', label: 'one reading, the digits under the dial', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.lp-bigclock', label: 'no plain big clock beside it', expectPresent: 0 },
		{ selector: '[data-testid="projector-timer"]', label: 'no timer', expectPresent: 0 },
		{ selector: '[data-testid="projector-agenda"]', label: 'the agenda still on the side', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.lp-clock', label: 'the digits under the dial', min: 4.5 },
		{ selector: '.lp-line', label: 'agenda and Coming up lines', min: 4.5, all: true }
	],
	motion: [
		{
			selector: '[data-testid="projector-dial"] .wc-hour .wc-arrive, [data-testid="projector-dial"] .wc-min .wc-arrive',
			label: 'the hour and minute hands sweep in once, only under no-preference',
			expect: 'gated'
		}
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
