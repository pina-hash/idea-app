/**
 * THE FULLEST WALL UNDER SPACE WHITE, ON A WASHED-OUT PROJECTOR (reports R12,
 * R13). The same fit stress as `classroom-projector-demo-full`, judged by the
 * projector model (`PROJECTOR_MODEL` in ../checks.mjs): body copy, the clock,
 * the counts and the picked name keep 4.5 washed; labels, "+N more", the "As
 * of" line, the seed and the count words keep 3 washed (muted copy); the ring
 * face and the arc are read off the resolved SVG stops (`RING_FACE_CONTRAST`).
 */
import { PROJECTOR_MODEL } from '../checks.mjs';
import { EIGHT_H, EVERY_CUT_SAID, PROJECTOR_READY, RING_FACE_CONTRAST, WALL_CARDS_FIT, WALL_FITS_ANY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=full&theme=space-white',
	label: 'Class projector, the fullest wall (Space White), measured washed out (R12, R13)',
	prepare: [
		PROJECTOR_READY,
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		{ waitFor: `() => !!document.querySelector('[data-testid="projector-activity"]')`, timeoutMs: 10000 }
	],
	orderResult: [
		{ label: 'every card holds its content', evaluate: WALL_CARDS_FIT, expected: ['every card holds its content', 'the side column holds its cards'] },
		{ label: 'every cut is said: shown plus "+N more" is the whole', evaluate: EVERY_CUT_SAID, expected: ['agenda 12', 'next 3', 'every name accounted for'] },
		{
			label: 'the digits on the ring face (4.5 washed) and the arc on its track (2 washed)',
			evaluate: RING_FACE_CONTRAST(PROJECTOR_MODEL.contrast, PROJECTOR_MODEL.ambient),
			expected: ['digits clear 4.5 washed on the ring face', 'the arc clears 2 washed on its track']
		},
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 }],
	contrast: [
		{ selector: '.lp-class', label: 'class name (washed)', min: 4.5, projector: true },
		{ selector: '.lp-clock', label: 'clock (washed)', min: 4.5, projector: true, all: true },
		{ selector: '.lp-line', label: 'agenda and Coming up lines (washed)', min: 4.5, projector: true, all: true },
		{ selector: '.lp-count', label: 'count numerals (washed)', min: 4.5, projector: true, all: true },
		{ selector: '.lp-pick-name', label: 'picked name (washed)', min: 4.5, projector: true },
		{ selector: '.lp-name:not(.lp-name-more)', label: 'names (washed)', min: 4.5, projector: true, all: true },
		{ selector: '.lp-act-item', label: 'the item counted (washed)', min: 4.5, projector: true },
		{ selector: '.lp-label', label: 'labels, muted (washed)', min: 3, projector: true, all: true },
		{ selector: '.lp-tile-word', label: 'count words, muted (washed)', min: 3, projector: true, all: true },
		{ selector: '.lp-namegroup-word', label: 'group words, muted (washed)', min: 3, projector: true, all: true },
		{ selector: '.lp-asof', label: 'as of, muted (washed)', min: 3, projector: true },
		{ selector: '.lp-seed', label: 'seed, muted (washed)', min: 3, projector: true },
		{ selector: '.lp-word', label: 'timer word, muted (washed)', min: 3, projector: true },
		{ selector: '.lp-hall-word', label: 'hall pass word, status ink (washed)', min: 3, projector: true }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
