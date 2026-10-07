/**
 * THE CLOCK FACE UNDER MATRIX (idea 26033e4b): the same dial on Matrix's
 * phosphor Plate ring, judged by WCAG as the other Matrix projector specs are
 * (the projector model judges Space White, the theme the room projects in).
 */
import { DIAL_HANDS_WCAG, DIAL_READS, PROJECTOR_READY, WALL_FITS_ANY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=clock&face=dial&clock=pinned&theme=matrix',
	label: 'Class projector (Matrix): the clock face (idea 26033e4b)',
	prepare: [
		PROJECTOR_READY,
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'matrix'`, timeoutMs: 10000 },
		{ waitFor: `() => !!document.querySelector('[data-testid="projector-dial"] [data-testid="plate-ring"]')`, timeoutMs: 10000 }
	],
	orderResult: [
		{ label: 'the hands read the digits, the dial fills the hero, the digits sit under it', evaluate: DIAL_READS, expected: ['the hands agree with the digits', 'the dial fills the hero', 'the digits sit under the dial'] },
		{ label: 'the hands, the indices and the second hand on the resolved face stops, and on their halos (WCAG)', evaluate: DIAL_HANDS_WCAG, expected: ['hands and indices clear 4.5 WCAG on the face', 'the second hand clears 3 WCAG on the face', 'every hand clears 3 WCAG on its halo'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [
		{ selector: 'html[data-theme="matrix"]', label: 'Matrix is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="projector-dial"]', label: 'one clock face', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.lp-clock', label: 'the digits under the dial', min: 4.5 },
		{ selector: '.lp-class', label: 'class name', min: 4.5 }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
