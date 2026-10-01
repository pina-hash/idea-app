/**
 * THE STRIPES PATTERN MOVES AND NEVER UNCOVERS ITS BOX (ledger 0360, report R21),
 * at 375 and 1440: the arrival drift is gated behind no-preference, and at every
 * tenth of it the moving layer still covers the whole banner.
 */
import { COVERS, IGNORE, READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?pattern=stripes',
	label: 'Class pattern, stripes: a bounded drift that covers the banner at every frame',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: READY, label: 'the header has painted' }],
	presence: [{ selector: '.ct-banner[data-pattern="stripes"] [data-testid="class-banner-pattern"]', label: 'the stripes layer', expectPresent: 1, maxPresent: 1 }],
	motion: [{ selector: '[data-testid="class-banner-pattern"]', label: 'the stripes drift, gated behind no-preference', expect: 'gated' }],
	orderResult: [{ label: 'the moving layer covers the banner at every tenth of the drift', evaluate: COVERS, expected: ['animated=true', 'moved=true', 'covered=true'] }]
};
