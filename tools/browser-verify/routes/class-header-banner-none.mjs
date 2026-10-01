/**
 * A CLASS NOBODY HAS VOTED ON (ledger 0360, report R19), at 375 and 1440: the
 * header with no banner around it, no pattern layer and no wash, and still the
 * same one block with the same keys. That is every class on the day this ships.
 */
import { IGNORE, MEASURE, READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?banner=none',
	label: 'Class header with no voted theme: no banner, the same compact block',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: READY, label: 'the header has painted' }, { evaluate: MEASURE }],
	presence: [
		{ selector: '[data-testid="class-banner"]', label: 'a banner (nobody voted)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="class-banner-pattern"]', label: 'a pattern layer', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="harness-class"] h1.pane-title', label: 'the class title (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-next-due"]', label: 'the Next due key', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="harness-class"] .pane-title', label: 'the class name on the room ground', min: 4.5 },
		{ selector: '[data-testid="class-header-meta"]', label: 'the class identity on its chip', min: 4.5 }
	]
};
