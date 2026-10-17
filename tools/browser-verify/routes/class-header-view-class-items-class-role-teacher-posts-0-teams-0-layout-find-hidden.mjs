/**
 * THE SEARCH ROW HIDDEN (ledger 0396, part 7, on the R23 page layout), at 375
 * and 1440. The row is the Videos key and Select all, under its own hook
 * (`class-toolbar`), with no search anywhere on the page, and the line naming
 * what this teacher hid.
 */
import { IGNORE, READY, TOOLBAR_BASE } from './_class-toolbar.mjs';

export default {
	path: `${TOOLBAR_BASE}&role=teacher&posts=0&teams=0&layout=find-hidden`,
	label: 'The class toolbar with the search hidden: the Videos key and Select all',
	ignoreConsole: IGNORE,
	prepare: [READY],
	presence: [
		{ selector: '[data-testid="class-toolbar"] [data-testid="class-videos-toggle"]', label: 'the Videos key, in the row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-toolbar"] [data-testid="bulk-select-all"]', label: 'Select all, in the row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="stream-find"], [data-testid="stream-search"]', label: 'no search row, no search field', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="panels-hidden-note"]', label: 'the hidden-panels line', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'one line: the Videos key, then Select all at the right edge',
			evaluate: `() => {
				const row = document.querySelector('[data-testid="class-toolbar"]').getBoundingClientRect();
				const key = document.querySelector('[data-testid="class-videos-toggle"]').getBoundingClientRect();
				const all = document.querySelector('[data-testid="bulk-select-all"]').getBoundingClientRect();
				return ['one line=' + (Math.abs(key.top - all.top) < 4), 'select all at the right edge=' + (Math.abs(row.right - all.right) <= 4)];
			}`,
			expected: ['one line=true', 'select all at the right edge=true']
		}
	],
	textContains: [{ selector: '[data-testid="panels-hidden-note"]', label: 'the line names the search row', must: ['Hidden on this page: Search and filters.'] }]
};
