/**
 * THE CLOCK FACE UNDER SPACE WHITE, ON A WASHED-OUT PROJECTOR (idea 26033e4b).
 * Space White is the theme the classroom projects in, so this twin is judged
 * by the projector model (`PROJECTOR_MODEL` in ../checks.mjs: 300:1 native,
 * ambient light at 10% of white): the hands and indices 4.5 washed on the
 * resolved face stops, the second hand 3, every hand 3 on its own halo, and
 * the digits 4.5. Space White is the theme where the Plate's tick colour fails
 * as an index (1.58 washed), which is why the dial does not use it.
 */
import { PROJECTOR_MODEL } from '../checks.mjs';
import { DIAL_HANDS_CONTRAST, DIAL_READS, EIGHT_H, PROJECTOR_READY, WALL_FITS_ANY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=clock&face=dial&clock=pinned&theme=space-white',
	label: 'Class projector (Space White): the clock face, measured washed out (idea 26033e4b)',
	prepare: [
		PROJECTOR_READY,
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		{ waitFor: `() => !!document.querySelector('[data-testid="projector-dial"] [data-testid="plate-ring"]')`, timeoutMs: 10000 }
	],
	orderResult: [
		{ label: 'the hands read the digits, the dial fills the hero, the digits sit under it', evaluate: DIAL_READS, expected: ['the hands agree with the digits', 'the dial fills the hero', 'the digits sit under the dial'] },
		{
			label: 'the hands, the indices and the second hand on the resolved face stops, and on their halos (washed)',
			evaluate: DIAL_HANDS_CONTRAST(PROJECTOR_MODEL.contrast, PROJECTOR_MODEL.ambient),
			expected: ['hands and indices clear 4.5 washed on the face', 'the second hand clears 3 washed on the face', 'every hand clears 3 washed on its halo']
		},
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="projector-dial"]', label: 'one clock face', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.lp-bigclock', label: 'no plain big clock beside it', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.lp-class', label: 'class name (washed)', min: 4.5, projector: true },
		{ selector: '.lp-clock', label: 'the digits under the dial (washed)', min: 4.5, projector: true },
		{ selector: '.lp-line', label: 'agenda and Coming up lines (washed)', min: 4.5, all: true, projector: true }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
