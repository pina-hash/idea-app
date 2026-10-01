/**
 * A STUDENT WHO HID THE SEARCH ROW, IN A CLASS THAT OPENS ON TO DO (ledger
 * 0360, R23), on the REAL class page, at 375 and 1440.
 *
 * The list is still narrowed (To do), so the page says so in words with the
 * row's own count and Clear, at the top of the posts: a filtered class must
 * never pass for a class that lost its items. Clear is a 44px key.
 */
import { IGNORE, VIEW_READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?view=class&layout=find-hidden&opens=todo',
	label: 'The real class page with the search row hidden while To do narrows it: the count and Clear stay',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: VIEW_READY, label: 'the real class page has painted', timeoutMs: 30000 }],
	presence: [
		{ selector: '[data-testid="stream-find"]', label: 'the search row, hidden: not rendered', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="stream-find-result"]', label: 'the count and Clear, in the posts', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="panels-hidden-note"]', label: 'the hidden-panels line', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="stream-find-result"]', label: 'the count in words', must: ['shown', 'Clear'], mustNot: ['—'] },
		{ selector: '[data-testid="panels-hidden-note"]', label: 'the line names the search row', must: ['Hidden on this page: Search and filters.'] }
	],
	contrast: [{ selector: '[data-testid="stream-find-result"] span', label: 'the count', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="stream-clear"]', label: 'Clear', min: 44 }]
};
