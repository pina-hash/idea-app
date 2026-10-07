/**
 * THE CLOCK FACE ALONE (idea 26033e4b): no timer, no agenda, no hall pass,
 * nothing on the side, so the wall is one centred column and the dial takes
 * it. This is the case the dial's own size rule exists for: a selector that
 * re-pointed the timer's ring size at a higher specificity would have kept two
 * columns here (and forced two columns on a phone), which this measures.
 */
import { DIAL_READS, EIGHT_H, PROJECTOR_READY, WALL_FITS_ANY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=bare&face=dial',
	label: 'Class projector: the clock face alone, one centred column (idea 26033e4b)',
	prepare: [PROJECTOR_READY, { waitFor: `() => !!document.querySelector('[data-testid="projector-dial"] [data-testid="plate-ring"]')`, timeoutMs: 10000 }],
	orderResult: [
		{ label: 'the hands read the digits, the dial fills the hero, the digits sit under it', evaluate: DIAL_READS, expected: ['the hands agree with the digits', 'the dial fills the hero', 'the digits sit under the dial'] },
		{
			label: 'one column, the dial centred in it',
			evaluate: `() => {
				const body = document.querySelector('.lp-body');
				const cols = getComputedStyle(body).gridTemplateColumns.split(' ').length;
				const d = document.querySelector('[data-testid="projector-dial"]').getBoundingClientRect();
				const b = body.getBoundingClientRect();
				const off = Math.abs(d.left + d.width / 2 - (b.left + b.width / 2));
				return ['columns ' + cols, off <= 2 ? 'the dial is centred' : 'the dial is ' + Math.round(off) + 'px off centre'];
			}`,
			expected: ['columns 1', 'the dial is centred']
		},
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [
		{ selector: '[data-testid="projector-dial"]', label: 'one clock face', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-side"]', label: 'no side column', expectPresent: 0 }
	],
	contrast: [{ selector: '.lp-clock', label: 'the digits under the dial', min: 4.5 }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
