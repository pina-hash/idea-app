/**
 * NO VIDEOS SECTION BESIDE AN OPEN ITEM (ledger 0298, R08).
 *
 * The class layout mounts ClassView as the NAVIGATION column (`asPane`, with
 * the open item's id) whenever an item is open beside it, and there the list
 * is how a reader moves between items, so the Videos section is not drawn.
 * This is the same fixture as the student spec, which draws three cards over
 * it and is the positive control; here the rows are all present, the open
 * item is marked, and the pane is the class list, so the section's absence is
 * the gate and not a page that never painted.
 */
import { ROW_NAMES, VIDEOS_READY } from './_class-videos.mjs';

export default {
	path: '/dev/class-videos?state=pane',
	label: 'Videos in a class: no section while the class list is the column beside an open item',
	prepare: [VIDEOS_READY],
	orderResult: [
		{
			label: 'every item is still a row in the column',
			evaluate: ROW_NAMES,
			expected: ['Day 3: calipers', 'Gear ratio worksheet', 'Reminder: the caliper video', 'Shop safety rules', 'Shop tour']
		}
	],
	presence: [
		{ selector: '[data-testid="videos-class"] section[aria-label="Class content"]', label: 'the class list is mounted as a pane', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="videos-class"] [data-testid="item-row"][data-selected="true"]', label: 'the open item is marked', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="videos-class"] [data-testid="stream-find"]', label: 'the search row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-videos"]', label: 'no Videos section beside an open item', expectPresent: 0 },
		{ selector: '[data-testid="class-video"]', label: 'no card', expectPresent: 0 }
	]
};
