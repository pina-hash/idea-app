/**
 * THE CLASS PROJECTOR, ON THE IDEA THEME (ledger 0297, package LIVE).
 *
 * Run it at the projector widths: `npm run verify:browser -- --route
 * classroom-projector --width 1280 --width 1920` (the harness height is its
 * own 900; the 1280x800 and 1920x1080 readings in the package report were
 * taken with a script at those exact sizes). At 375 and 1440 it is measured
 * too, and a portrait phone stacks the columns.
 *
 * WHAT IS MEASURED:
 *   - the 8H rule: the smallest text on the wall is at least 1/50 of the
 *     window's height;
 *   - the wall fits its window, no scroll either way;
 *   - the frame was built from a MANAGER hall-pass state naming who is out,
 *     and the wall says only "Taken"; the one roster name on the wall is the
 *     pick the teacher chose to show, and no address appears;
 *   - the relocated report control is in the strip, and the shell's floating
 *     one is not on the page;
 *   - (ledger 0298) the running timer reads TENTHS with more than ten seconds
 *     left, and ticks: watched for a second on every animation frame, the face
 *     showed at least eight different readings (the sample and this machine's
 *     frame pacing are printed by the prepare step, and not gated).
 *     `classroom-projector-demo-final-clock-pinned` is the other side of the
 *     rule, hundredths in the last ten seconds.
 */
import { EIGHT_H, PROJECTOR_READY, ROSTER_ON_WALL, WALL_FITS, sampleTimer, timerTicked } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=1',
	label: 'Class projector view (IDEA): agenda, clock, timer, hall pass, shown pick',
	prepare: [PROJECTOR_READY, { evaluate: sampleTimer('[data-testid="projector-timer-digits"]', 1000) }],
	orderResult: [
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window', evaluate: WALL_FITS, expected: ['no horizontal scroll', 'no vertical scroll'] },
		{ label: 'roster names and addresses on the wall', evaluate: ROSTER_ON_WALL, expected: ['Cruz Delgado', 'no address'] },
		{
			label: 'the wall timer reads tenths while more than ten seconds are left',
			evaluate: `() => { const t = document.querySelector('[data-testid="projector-timer-digits"]').textContent; return [/^\\d+:\\d\\d\\.\\d$/.test(t) ? 'tenths' : t]; }`,
			expected: ['tenths']
		},
		{ label: 'the wall timer ticks: different readings in one second, watched on every frame', evaluate: timerTicked(8), expected: ['at least 8 distinct readings'] },
		{
			label: 'the hall pass in the student word',
			evaluate: `() => [document.querySelector('[data-testid="projector-hall"]').textContent.replace(/\\s+/g, ' ').trim()]`,
			expected: ['Hall pass ◐ Taken']
		}
	],
	presence: [
		{ selector: '[data-testid="projector"]', label: 'the projector view', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-agenda-line"]', label: 'agenda lines', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="projector-timer"]', label: 'the running timer', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-timer"][data-final="true"], [data-testid="projector-timer-pulse"]', label: 'not in its last seconds: no warning edge, no beat', expectPresent: 0 },
		{ selector: '[data-testid="projector-pick"]', label: 'the shown pick', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.cr-header, .cr-root', label: 'no classroom chrome (header, room)', expectPresent: 0 },
		{ selector: '[data-testid="projector-strip"] .sfb-trigger', label: 'the relocated report control, in the strip', expectPresent: 1, maxPresent: 1 },
		{ selector: '.sfb-trigger', label: 'exactly one report control on the page', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: '.lp-class', label: 'class name', min: 4.5 },
		{ selector: '.lp-line', label: 'agenda line', min: 4.5, all: true },
		{ selector: '.lp-clock', label: 'clock', min: 4.5 },
		{ selector: '.lp-digits', label: 'timer digits', min: 4.5 },
		{ selector: '.lp-frac', label: 'tenths', min: 4.5 },
		{ selector: '.lp-word', label: 'timer word', min: 4.5 },
		{ selector: '.lp-hall-word', label: 'hall pass word', min: 4.5 },
		{ selector: '.lp-pick-name', label: 'picked name', min: 4.5 },
		{ selector: '.lp-label', label: 'labels', min: 4.5, all: true }
	],
	tapTargets: [{ selector: '[data-testid="projector-strip"] button', label: 'strip controls' }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
