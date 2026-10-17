/**
 * THE FIRST TICK ON MR. PINA'S OWN CLASS SHAPE (ledger 0396, part 7, review
 * round 2), at 375 and 1440: a teacher with no draft, so no Drafts chip, the
 * toolbar of his 2026-10-16 screenshot. At 375 this is the one shape where
 * the ticked row needs MORE lines than the row at rest (the search and kinds,
 * then the Videos key and Select all: two lines; the tray's two lines, then
 * the Videos key and Select all: three), and before round 2 the class moved
 * 156px under the first tick and the tap meant for the second row's checkbox
 * unticked the first. Now the page scrolls by exactly what the row grew, so
 * the class and Select all stay where they were in the window. The spec with
 * a draft (`...-teams-0-state-ticked`) is the shape where nothing needs to
 * scroll at all.
 */
import { IGNORE, READY, RECORD, RECORD_TICKED, TEACHER, TICK, TICKED, TICKED_EXPECTED } from './_class-toolbar.mjs';

export default {
	path: `${TEACHER}&drafts=0&state=ticked`,
	aliasOf: `${TEACHER}&drafts=0`,
	label: 'The class toolbar after the first tick, no Drafts chip: the class stays under the pointer where the row grows',
	ignoreConsole: IGNORE,
	prepare: [READY, RECORD, TICK, RECORD_TICKED],
	orderResult: [{ label: 'the tray leads the row; nothing moved under the pointer, though the row grew at 375', evaluate: TICKED, expected: TICKED_EXPECTED }],
	presence: [
		{ selector: '[data-testid="bulk-count"]', label: 'the count', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="stream-status-drafts"]', label: 'no Drafts chip in this class', expectPresent: 0, maxPresent: 0 }
	],
	tapTargets: [{ selector: '.class-toolbar :is([data-testid="bulk-bar"] :is(.btn, select), [data-testid="bulk-select-all"])', label: 'every control in the tray, and Select all', min: 44 }]
};
