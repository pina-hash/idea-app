/**
 * THE FIRST TICK (ledger 0396, part 7, review round 2), at 375 and 1440. The
 * filters make way and the selection's tray (the count, Publish, File into,
 * Delete, Clear selection) leads the toolbar row in their places, Select all
 * still the row's last key at its right edge. Nothing under the pointer
 * moves at either width: at 1440 the row keeps its one line, and at 375,
 * where the row needs more lines than it had, the page scrolls by what the
 * row grew so the class and Select all stay where they were in the window.
 * Round 1 held the actions' room open at rest instead, which left Select all
 * alone on a line of its own at Mr. Pina's 1223. Last, Clear selection puts
 * the focus on Select all (review round 3), where a keyboard user's next Tab
 * carries on from, instead of dropping it to the page.
 */
import { CLEARED, CLEARED_EXPECTED, IGNORE, READY, RECORD, RECORD_TICKED, TEACHER, TICK, TICKED, TICKED_EXPECTED } from './_class-toolbar.mjs';

export default {
	path: `${TEACHER}&state=ticked`,
	aliasOf: TEACHER,
	label: 'The class toolbar after the first tick: the tray in the filters\' places, nothing moves under the pointer',
	ignoreConsole: IGNORE,
	prepare: [READY, RECORD, TICK, RECORD_TICKED],
	orderResult: [
		{ label: 'the tray leads the row, the filters made way, Select all is last; nothing moved under the pointer', evaluate: TICKED, expected: TICKED_EXPECTED },
		{ label: 'Clear selection: the tray goes, the filters come back, and the focus lands on Select all', evaluate: CLEARED, expected: CLEARED_EXPECTED }
	],
	presence: [
		{ selector: '[data-testid="bulk-count"]', label: 'the count', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.class-toolbar [data-testid="bulk-publish"]', label: 'Publish, in the row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.class-toolbar [data-testid="stream-search"]', label: 'the search field, kept but out of the way', expectPresent: 1, maxPresent: 1, expectVisible: 0, maxVisible: 0 },
		{ selector: '.class-toolbar [data-testid="class-videos-toggle"]', label: 'the Videos key, still in the row (it is not a filter)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="bulk-count"]', label: 'the count in words', must: ['1 selected'] }],
	contrast: [{ selector: '[data-testid="bulk-count"]', label: 'the selection count', min: 4.5 }],
	tapTargets: [
		{ selector: '.class-toolbar [data-testid="bulk-bar"] :is(.btn, select)', label: 'every control in the bar', min: 44 }
	]
};
