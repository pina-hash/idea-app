/**
 * A STUDENT WHO MOVED THE SEARCH ROW ABOVE THE CLASS HEADER (ledger 0360, R23
 * on the R19 header, R22's "obviously see"), on the REAL class page, at 375
 * and 1440.
 *
 * The teacher's notice leads the page then, ahead of the search row: no
 * arrangement may put a notice below anything but the class header. The
 * header still follows the search row, and the student's team still follows
 * the header.
 */
import { IGNORE, VIEW_MEASURE, VIEW_READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?view=class&layout=search-first',
	label: 'The real class page with the search row moved above the header: the notice leads',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: VIEW_READY, label: 'the real class page has painted', timeoutMs: 30000 }, { evaluate: VIEW_MEASURE }],
	presence: [
		{ selector: '[data-testid="quick-posts"]', label: 'the notices, once', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="stream-find"]', label: 'the search row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="harness-class"] h1.pane-title', label: 'the page h1, moved but never hidden', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="panels-hidden-note"]', label: 'nothing hidden, so no line', expectPresent: 0, maxPresent: 0 }
	],
	domOrder: [
		{ before: '[data-testid="quick-posts"]', after: '[data-testid="stream-find"]', label: 'the notice leads the page', beforeLabel: 'notice', afterLabel: 'search' },
		{ before: '[data-testid="stream-find"]', after: '[data-testid="class-header"]', label: 'the search row above the header', beforeLabel: 'search', afterLabel: 'header' },
		{ before: '[data-testid="class-header"]', after: '[data-testid="class-teams"]', label: 'the team after the header', beforeLabel: 'header', afterLabel: 'teams' }
	]
};
