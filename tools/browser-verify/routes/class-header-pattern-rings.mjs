/**
 * THE RINGS PATTERN MOVES AND NEVER UNCOVERS ITS BOX (ledger 0360, report R21),
 * at 375 and 1440: the arrival drift is gated behind no-preference, and at every
 * tenth of it the moving layer still covers the whole banner. Since ledger 0368
 * the hover loop is its own paused layer and is sampled at its start, middle
 * and end against every tenth of the arrival.
 */
import { COVERS, COVERS_MARGIN, IGNORE, LOOP_PAUSED, READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?pattern=rings',
	label: 'Class pattern, rings: a bounded drift that covers the banner at every frame',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: READY, label: 'the header has painted' }, { evaluate: COVERS_MARGIN }],
	presence: [{ selector: '.ct-banner[data-pattern="rings"] [data-testid="class-banner-pattern"]', label: 'the rings layer', expectPresent: 1, maxPresent: 1 }],
	motion: [{ selector: '[data-testid="class-banner-pattern"]', label: 'the rings drift, gated behind no-preference', expect: 'gated' }],
	orderResult: [
		{ label: 'the moving layers cover the banner at every tenth of the drift, with the hover loop at its start, middle and end', evaluate: COVERS, expected: ['animated=true', 'moved=true', 'covered=true'] },
		{
			label: 'the hover loop is attached and paused, and a hover only lets it run (never swaps the animation, ledger 0368)',
			evaluate: LOOP_PAUSED,
			expected: ['loop attached=true', 'loop paused=true', 'arrival on the pattern=true', 'hover rules set only play state=true']
		}
	]
};
