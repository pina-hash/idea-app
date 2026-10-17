/**
 * THE TOOLBAR UNDER THE CLASS BANNER, AS A TEACHER (ledger 0396, part 7), on
 * the REAL class page Mr. Pina screenshotted on 2026-10-16, at 375 and 1440.
 *
 * "The space between the class banner and the content of the class is too
 * large." The search row, a full-width row for the closed Videos section and
 * a row holding only Select all (21) are ONE row now: the search, the kind
 * filter, the Drafts chip, the Videos key ("Videos 7") and Select all at the
 * right edge, the plate's 12px step from the banner and to the first unit.
 * The first prepare step prints the banner-to-first-unit distance and what
 * each line of the row holds. Measured on this fixture (a teacher with a
 * draft): 188px before at 1440 and 960, 240px at 375; after review round 2,
 * 68px at 1440, 1278, 1223 and 960 (one line), 172px at 375.
 *
 * AT REST SELECT ALL IS THE ONLY BULK CONTROL: no tray, no action held in
 * reserve, nothing inert (review round 2). The tray appears with the first
 * tick, in the filters' places (the ticked spec).
 */
import { IGNORE, KEY_CONTRAST, MEASURE, READY, ROW, ROW_EXPECTED_TEACHER, TAPS, TEACHER } from './_class-toolbar.mjs';

export default {
	path: TEACHER,
	label: 'The class toolbar: search, kinds, Videos and Select all in one row under the banner (teacher)',
	ignoreConsole: IGNORE,
	prepare: [READY, MEASURE],
	orderResult: [{ label: 'one row, in order, Select all at the right edge, the plate step on both sides', evaluate: ROW(true), expected: ROW_EXPECTED_TEACHER }],
	presence: [
		{ selector: '[data-testid="harness-class"] .class-toolbar', label: 'one toolbar row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.class-toolbar[data-testid="stream-find"] [data-testid="stream-search"]', label: 'the search, in the row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.class-toolbar [data-testid="class-videos-toggle"]', label: 'the Videos key, in the row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.class-toolbar [data-testid="bulk-select-all"]', label: 'Select all, in the row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-select-all"]', label: 'Select all, once on the page', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="class-videos-grid"]', label: 'the video list, closed: in the DOM, not painted', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 0 },
		{ selector: '[data-testid="bulk-bar"], [data-testid="bulk-publish"], [data-testid="bulk-delete"], [data-testid="bulk-count"]', label: 'no tray and no bulk action before a tick, not even unpainted', expectPresent: 0, maxPresent: 0 },
		{ selector: '.class-toolbar [inert]', label: 'nothing inert in the row', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="class-videos-toggle"]', label: 'the Videos key says its count and what it does', must: ['Videos 7', 'Show'], mustNot: ['videos videos', '7 videos'] },
		{ selector: '[data-testid="bulk-select-all"]', label: 'Select all names its count', must: ['Select all (21)'] }
	],
	contrast: KEY_CONTRAST,
	tapTargets: TAPS(true)
};
