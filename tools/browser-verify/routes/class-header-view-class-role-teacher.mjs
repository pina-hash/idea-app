/**
 * THE REAL CLASS PAGE, NOTHING ARRANGED, AS ITS TEACHER (ledger 0360, R23 on
 * the R19 header), at 375 and 1440. A teacher's header row also carries the
 * teams key and Quick post, New post and Units, all three on one line; the
 * first prepare step prints where the class content starts.
 */
import { IGNORE, POSTING_LINE, THEME_READY, VIEW_MEASURE, VIEW_READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?view=class&role=teacher',
	label: 'The real class page under the header, nothing arranged, as its teacher',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: VIEW_READY, label: 'the real class page has painted', timeoutMs: 30000 }, THEME_READY, { evaluate: VIEW_MEASURE }],
	presence: [
		{ selector: '[data-testid="class-header-row"] [data-testid="quick-post-open"]', label: 'Quick post, in the row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-header-row"] [data-testid="new-post"]', label: "the class view's own New post, in the row", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-header-row"] [data-testid="units-toggle"]', label: 'Units, in the row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-header-row"] [data-testid="class-header-teams"]', label: 'the teams key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="panels-hidden-note"]', label: 'no hidden-panels line', expectPresent: 0, maxPresent: 0 }
	],
	orderResult: [{ label: "a teacher's three posting keys on one line", evaluate: POSTING_LINE, expected: ['posting keys present=true', 'posting keys on one line=true'] }],
	tapTargets: [
		{ selector: '[data-testid="class-header-row"] :is([data-testid="quick-post-open"], [data-testid="new-post"], [data-testid="units-toggle"])', label: 'the posting keys', min: 44 }
	]
};
