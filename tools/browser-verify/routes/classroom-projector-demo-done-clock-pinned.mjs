/**
 * THE WALL TIMER WHEN TIME IS UP (ledger 0298, R27's tail), on the IDEA theme,
 * with the page's clock pinned at load.
 *
 * The harness seeds a ten-minute countdown that ran out 32 s ago
 * (`demoTimer('done')`). The face holds 0:00.00 (a finished countdown counts
 * as its last seconds, so the wall keeps the hundredths it ended on), the word
 * says time is up, and the overtime counts in whole seconds.
 *
 * WHAT IS MEASURED:
 *   - the readout and the overtime line;
 *   - the finish: one burst from the timer's edge and one bump of the digits,
 *     both run once under no-preference and rest, painted and untransformed,
 *     under reduced motion;
 *   - no beat ring once time is up (the absence), beside the burst (its
 *     positive control);
 *   - the warning ink on the warning fill for the digits, the word and the
 *     overtime line, and the burst ring as a boundary on that fill.
 */
import { EIGHT_H, PROJECTOR_READY, READOUT_PARTS, WALL_FITS } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-projector?demo=done&clock=pinned',
	label: 'Class projector: time is up (0:00.00, the finish), clock pinned',
	prepare: [PROJECTOR_READY, { waitFor: `() => !!document.querySelector('[data-testid="projector-timer-burst"]')`, timeoutMs: 10000 }],
	orderResult: [
		{ label: 'the face holds 0:00.00 once time is up', evaluate: READOUT_PARTS('[data-testid="projector-timer-digits"]'), expected: ['0:00', '.00'] },
		{
			label: 'the word and the overtime',
			evaluate: `() => [document.querySelector('.lp-word').textContent.trim(), document.querySelector('.lp-over').textContent.trim()]`,
			expected: ['Time is up', 'Over by 0:32']
		},
		{ label: '8H: the smallest text against 1/50 of the height (a portrait window is not a wall and is not held to it)', evaluate: `() => [(${EIGHT_H})()].map((v) => v.startsWith('portrait') ? 'smallest text clears 1/50 of the height' : v)`, expected: ['smallest text clears 1/50 of the height'] },
		{ label: 'the wall fits the window', evaluate: WALL_FITS, expected: ['no horizontal scroll', 'no vertical scroll'] }
	],
	presence: [
		{ selector: '[data-testid="projector-timer"][data-phase="done"]', label: 'the finished timer', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="projector-timer-burst"]', label: 'the finish burst (drawn; it rests faded once its pulse has run, so visibility is not asked)', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '[data-testid="projector-timer-pulse"]', label: 'no beat once time is up', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.lp-digits', label: 'digits, warning ink on the warning fill', min: 4.5 },
		{ selector: '.lp-frac', label: 'hundredths, warning ink on the warning fill', min: 4.5 },
		{ selector: '.lp-word', label: 'timer word, warning ink on the warning fill', min: 4.5 },
		{ selector: '.lp-over', label: 'overtime line', min: 4.5 },
		{ selector: '.lp-ring', label: 'the finish ring, a boundary, on the warning fill', min: 3 }
	],
	motion: [{ selector: '[data-testid="projector-timer"]', label: 'the finish, gated behind no-preference', expect: 'gated' }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
