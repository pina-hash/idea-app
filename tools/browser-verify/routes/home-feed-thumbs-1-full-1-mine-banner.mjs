/**
 * A FULL CARD IN BANNER FITS WHOLE (review of the polish round): the same
 * full Period 1 card with a strip over every title, which at 375 ran 88px past
 * app.css's 1200px collapse cap and took the Open class link with it.
 */
import { HOME_LIST_FITS, HOME_ROWS, HOME_THUMBS, HOME_THUMBS_CONSOLE, HOME_THUMBS_READY } from './_home-feed-thumbs.mjs';

export default {
	path: `${HOME_THUMBS}&full=1&mine=banner`,
	label: "Home page: a full class card with the person's Banner, whole",
	prepare: HOME_THUMBS_READY,
	orderResult: [
		{
			label: "each row's shape and slot",
			evaluate: HOME_ROWS,
			expected: ['banner image', 'banner image', 'banner html', 'banner html', 'banner generated', 'banner generated', 'banner generated', 'banner generated', 'banner generated', 'banner generated']
		},
		{ ...HOME_LIST_FITS, expected: ['fits, 0 of 10 outside, overflow clip', 'fits, 0 of 2 outside, overflow clip', 'fits, 0 of 1 outside, overflow clip'] }
	],
	presence: [
		{ selector: '.feed-card [data-testid="feed-post-thumb"] .pt[data-shape="banner"]', label: 'a Banner on every row', expectPresent: 10, maxPresent: 10, expectVisible: 10 },
		{ selector: '.feed-card .feed-more', label: "every card's Open class link", expectPresent: 3, maxPresent: 3, expectVisible: 3 }
	],
	tapTargets: [
		{ selector: '.legacy-index .assignment-item.linked', label: 'feed rows', min: 44 },
		{ selector: '.feed-card .feed-more', label: 'Open class', min: 44 }
	],
	ignoreConsole: HOME_THUMBS_CONSOLE
};
