/**
 * THE CLASS TOOLBAR AS A STUDENT (ledger 0396, part 7), at 375 and 1440: the
 * search, the kind filter, the student's own To do, Missing and Done chips and
 * the Videos key in one row, and NO Select all (the teacher spec is the
 * positive control). The chips are items of the row itself, so a phone puts
 * them two to a line beside the Videos key instead of giving Done a line of
 * its own inside a group box and the Videos key another below it.
 */
import { IGNORE, KEY_CONTRAST, MEASURE, READY, ROW, ROW_EXPECTED_STUDENT, STUDENT, TAPS } from './_class-toolbar.mjs';

export default {
	path: STUDENT,
	label: 'The class toolbar as a student: no Select all',
	ignoreConsole: IGNORE,
	prepare: [READY, MEASURE],
	orderResult: [{ label: 'one row, in order, the plate step on both sides, no Select all', evaluate: ROW(false), expected: ROW_EXPECTED_STUDENT }],
	presence: [
		{ selector: '[data-testid="harness-class"] .class-toolbar', label: 'one toolbar row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.class-toolbar [data-testid^="stream-status-"]', label: 'the three status chips, in the row', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '.class-toolbar [data-testid="class-videos-toggle"]', label: 'the Videos key, in the row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-bar"], [data-testid="bulk-select-all"], [data-testid^="row-select-"]', label: 'no bulk bar, no Select all, no row checkboxes', expectPresent: 0, maxPresent: 0 }
	],
	contrast: KEY_CONTRAST,
	tapTargets: TAPS(false)
};
