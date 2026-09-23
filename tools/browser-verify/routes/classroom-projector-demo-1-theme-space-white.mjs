/**
 * THE CLASS PROJECTOR UNDER SPACE WHITE, ON A WASHED-OUT PROJECTOR (ledger
 * 0297). F1a's projector model (`PROJECTOR_MODEL` in ../checks.mjs: a 300:1
 * projector with ambient light at 10% of white) judges each row by its WASHED
 * ratio: body copy keeps 4.5, muted copy and status inks keep 3.0. Run at the
 * projector widths as the IDEA spec says.
 */
import { EIGHT_H, PROJECTOR_READY, ROSTER_ON_WALL, WALL_FITS } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=1&theme=space-white',
	label: 'Class projector view (Space White), measured washed out',
	prepare: [PROJECTOR_READY, { waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 }],
	orderResult: [
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window', evaluate: WALL_FITS, expected: ['no horizontal scroll', 'no vertical scroll'] },
		{ label: 'roster names and addresses on the wall', evaluate: ROSTER_ON_WALL, expected: ['Cruz Delgado', 'no address'] }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="projector-timer"]', label: 'the running timer', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.lp-class', label: 'class name (washed)', min: 4.5, projector: true },
		{ selector: '.lp-line', label: 'agenda line (washed)', min: 4.5, projector: true, all: true },
		{ selector: '.lp-clock', label: 'clock (washed)', min: 4.5, projector: true },
		{ selector: '.lp-digits', label: 'timer digits (washed)', min: 4.5, projector: true },
		{ selector: '.lp-pick-name', label: 'picked name (washed)', min: 4.5, projector: true },
		{ selector: '.lp-label', label: 'labels, muted copy (washed)', min: 3, projector: true, all: true },
		{ selector: '.lp-word', label: 'timer word, muted (washed)', min: 3, projector: true },
		{ selector: '.lp-hall-word', label: 'hall pass word, status ink (washed)', min: 3, projector: true },
		{ selector: '.lp-seed', label: 'seed, muted (washed)', min: 3, projector: true }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
