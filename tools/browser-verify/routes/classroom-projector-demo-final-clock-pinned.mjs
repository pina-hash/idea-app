/**
 * THE WALL TIMER IN ITS LAST TEN SECONDS (ledger 0298, R27's tail), on the
 * IDEA theme, with the page's clock PINNED at load so the face holds still.
 *
 * The harness seeds a ten-minute countdown with 7.42 s left and running
 * (`demoTimer('final')`), so the wall reads 0:07.42: hundredths, which it
 * shows only in a countdown's last ten seconds (tenths otherwise, which
 * `classroom-projector-demo-1` holds as the other side of this rule).
 *
 * WHAT IS MEASURED:
 *   - the readout's two drawn parts ("0:07" and ".42") and that the timer
 *     says it is in its last seconds, with the edge in the warning ink;
 *   - the beat: one ring on the timer's edge, animated under no-preference
 *     and resting, painted and untransformed, under reduced motion (the
 *     `motion` check flips the media feature and reads the same elements);
 *   - the ring clears 3:1 against the timer's ground (it is a boundary);
 *   - the 8H rule and the wall fitting its window with the ring drawn.
 */
import { EIGHT_H, PROJECTOR_READY, READOUT_PARTS, WALL_FITS } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=final&clock=pinned',
	label: 'Class projector: the timer in its last ten seconds (hundredths, the beat), clock pinned',
	prepare: [PROJECTOR_READY, { waitFor: `() => !!document.querySelector('[data-testid="projector-timer-pulse"]')`, timeoutMs: 10000 }],
	orderResult: [
		{ label: 'the wall reads hundredths in the last ten seconds, the fraction drawn apart', evaluate: READOUT_PARTS('[data-testid="projector-timer-digits"]'), expected: ['0:07', '.42'] },
		{
			label: 'the timer is running, in its last seconds, with the warning edge',
			evaluate: `() => { const t = document.querySelector('[data-testid="projector-timer"]'); return [t.dataset.phase, t.dataset.final, getComputedStyle(t).borderTopColor === getComputedStyle(t.querySelector('.lp-ring')).outlineColor ? 'edge in the ring ink' : 'edge ' + getComputedStyle(t).borderTopColor]; }`,
			expected: ['running', 'true', 'edge in the ring ink']
		},
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window', evaluate: WALL_FITS, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [
		{ selector: '[data-testid="projector-timer"][data-final="true"]', label: 'the timer, in its last seconds', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-timer-pulse"]', label: 'the beat ring (drawn; it rests faded once its pulse has run, so visibility is not asked)', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '[data-testid="projector-timer-burst"]', label: 'no finish burst before time is up', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.lp-digits', label: 'timer digits', min: 4.5 },
		{ selector: '.lp-frac', label: 'hundredths', min: 4.5 },
		{ selector: '.lp-word', label: 'timer word', min: 4.5 },
		{ selector: '.lp-ring', label: 'the last-seconds ring, a boundary, on the timer ground', min: 3 }
	],
	motion: [{ selector: '[data-testid="projector-timer"]', label: 'the beat, gated behind no-preference', expect: 'gated' }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
