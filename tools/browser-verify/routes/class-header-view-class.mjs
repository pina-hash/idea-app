/**
 * THE REAL CLASS PAGE, NOTHING ARRANGED, AS A STUDENT (ledger 0360, R23 wired
 * onto the R19 header), at 375 and 1440.
 *
 * Every account has no stored layout on the day this ships, so this is the
 * page everybody gets: the header (the tools, the theme key and Next due in
 * its one row), the teacher's notice directly under it, the student's team,
 * then the search row and the posts. No "Hidden on this page" line. The first
 * prepare step prints where the class content starts, the number the R19
 * header was measured by and this wiring must not give back.
 */
import { IGNORE, THEME_READY, VIEW_MEASURE, VIEW_READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?view=class',
	label: 'The real class page under the header, nothing arranged, as a student',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: VIEW_READY, label: 'the real class page has painted', timeoutMs: 30000 }, THEME_READY, { evaluate: VIEW_MEASURE }],
	presence: [
		{ selector: '[data-testid="harness-class"] h1.pane-title', label: 'ONE class title, the page h1', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-header-row"] .ctool-trigger', label: 'the hall pass and music, in the key row', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="class-header-row"] [data-testid="class-theme-toggle"]', label: 'the class theme key, in the row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-posts"] [data-testid="quick-post"]', label: "the teacher's notice", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-team-mine"]', label: "the student's own team", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="stream-find"]', label: 'the search row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="panels-hidden-note"]', label: 'no hidden-panels line when nothing is hidden', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="new-post"]', label: 'New post (a teacher key)', expectPresent: 0, maxPresent: 0 }
	],
	domOrder: [
		{ before: '[data-testid="class-header"]', after: '[data-testid="quick-posts"]', label: 'the notice directly under the header', beforeLabel: 'header', afterLabel: 'notice' },
		{ before: '[data-testid="quick-posts"]', after: '[data-testid="class-teams"]', label: 'the notice before the team', beforeLabel: 'notice', afterLabel: 'teams' },
		{ before: '[data-testid="class-teams"]', after: '[data-testid="stream-find"]', label: 'the team before the search row', beforeLabel: 'teams', afterLabel: 'search' }
	],
	tapTargets: [{ selector: '[data-testid="stream-search"]', label: 'the search field', min: 44 }]
};
