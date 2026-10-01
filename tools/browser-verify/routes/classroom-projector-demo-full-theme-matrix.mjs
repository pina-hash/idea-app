/**
 * THE FULLEST WALL UNDER MATRIX (reports R12, R13). The same fit stress as
 * `classroom-projector-demo-full`, in the third theme a classroom can wear:
 * one geometry in every theme (the Plate's rule), so it must fit exactly as it
 * fits under IDEA. Matrix is not a projector theme (CLAUDE.md: IDEA and Matrix
 * do not clear every projector floor, by design), so it is judged by WCAG.
 */
import { EIGHT_H, EVERY_CUT_SAID, PROJECTOR_READY, WALL_CARDS_FIT, WALL_FITS_ANY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=full&theme=matrix',
	label: 'Class projector, the fullest wall (Matrix) (R12, R13)',
	prepare: [
		PROJECTOR_READY,
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'matrix'`, timeoutMs: 10000 },
		{ waitFor: `() => !!document.querySelector('[data-testid="projector-activity"]')`, timeoutMs: 10000 }
	],
	orderResult: [
		{ label: 'every card holds its content', evaluate: WALL_CARDS_FIT, expected: ['every card holds its content', 'the side column holds its cards'] },
		{ label: 'every cut is said: shown plus "+N more" is the whole', evaluate: EVERY_CUT_SAID, expected: ['agenda 12', 'next 3', 'every name accounted for'] },
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window (a portrait window may scroll)', evaluate: WALL_FITS_ANY, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [{ selector: 'html[data-theme="matrix"]', label: 'Matrix is on', expectPresent: 1, maxPresent: 1 }],
	contrast: [
		{ selector: '.lp-class', label: 'class name', min: 4.5 },
		{ selector: '.lp-line', label: 'agenda and Coming up lines', min: 4.5, all: true },
		{ selector: '.lp-count', label: 'count numerals', min: 4.5, all: true },
		{ selector: '.lp-name:not(.lp-name-more)', label: 'names', min: 4.5, all: true },
		{ selector: '.lp-label', label: 'labels', min: 4.5, all: true },
		{ selector: '.lp-tile-word', label: 'count words', min: 4.5, all: true },
		{ selector: '.lp-word', label: 'timer word', min: 4.5 }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
