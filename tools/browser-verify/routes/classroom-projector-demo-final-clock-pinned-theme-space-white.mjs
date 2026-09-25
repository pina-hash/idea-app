/**
 * THE WALL TIMER'S LAST TEN SECONDS UNDER SPACE WHITE, ON A WASHED-OUT
 * PROJECTOR (ledger 0298). The same pinned face as the IDEA spec (0:07.42,
 * running), judged by `PROJECTOR_MODEL` (../checks.mjs: a 300:1 projector with
 * ambient light at 10% of white): body copy keeps 4.5 washed, muted copy 3.0,
 * and the warning edge, a boundary, 2.0.
 */
import { EIGHT_H, PROJECTOR_READY, READOUT_PARTS, WALL_FITS } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=final&clock=pinned&theme=space-white',
	label: 'Class projector (Space White): the last ten seconds, measured washed out',
	prepare: [
		PROJECTOR_READY,
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		{ waitFor: `() => !!document.querySelector('[data-testid="projector-timer-pulse"]')`, timeoutMs: 10000 }
	],
	orderResult: [
		{ label: 'the wall reads hundredths in the last ten seconds', evaluate: READOUT_PARTS('[data-testid="projector-timer-digits"]'), expected: ['0:07', '.42'] },
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window', evaluate: WALL_FITS, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="projector-timer"][data-final="true"]', label: 'the timer, in its last seconds', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.lp-digits', label: 'timer digits (washed)', min: 4.5, projector: true },
		{ selector: '.lp-frac', label: 'hundredths (washed)', min: 4.5, projector: true },
		{ selector: '.lp-word', label: 'timer word, muted (washed)', min: 3, projector: true },
		{ selector: '.lp-ring', label: 'the warning edge, a boundary (washed)', min: 2, projector: true }
	],
	motion: [{ selector: '[data-testid="projector-timer"]', label: 'the beat, gated behind no-preference', expect: 'gated' }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
