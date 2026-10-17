/**
 * A FULL CARD IN WIDE FITS WHOLE (review of the polish round). Period 1 holds
 * the most a home card ever shows (six rows to act on and three reference
 * rows); in Wide each row is a 16:9 slot over its title, about 250px at 375,
 * and app.css's 1200px collapse cap used to clip the card's last rows and its
 * Open class link with no way to reach them. Every row and the link sit inside
 * the list at every width, the list cannot scroll (`clip`), and focusing the
 * Open class link moves nothing inside it.
 */
import { HOME_LIST_FITS, HOME_ROWS, HOME_THUMBS, HOME_THUMBS_CONSOLE, HOME_THUMBS_READY, HOME_WIDE_MARKS } from './_home-feed-thumbs.mjs';

export default {
	path: `${HOME_THUMBS}&full=1&mine=wide`,
	label: "Home page: a full class card with the person's Wide, whole",
	prepare: HOME_THUMBS_READY,
	orderResult: [
		{
			label: "each row's shape and slot",
			evaluate: HOME_ROWS,
			expected: ['wide image', 'wide image', 'wide html', 'wide html', 'wide generated', 'wide generated', 'wide generated', 'wide generated', 'wide generated', 'wide generated']
		},
		{ ...HOME_LIST_FITS, expected: ['fits, 0 of 10 outside, overflow clip', 'fits, 0 of 2 outside, overflow clip', 'fits, 0 of 1 outside, overflow clip'] },
		{
			label: "focusing the full card's Open class link scrolls nothing inside its list",
			evaluate: `() => {
				const l = document.querySelector('.feed-card .assignment-list');
				const first = l.querySelector(':scope > .feed-row, :scope > .feed-own');
				const before = first.getBoundingClientRect().top - l.getBoundingClientRect().top;
				const more = l.querySelector(':scope > .feed-more');
				more.focus();
				more.scrollIntoView({ block: 'nearest', behavior: 'instant' });
				const after = first.getBoundingClientRect().top - l.getBoundingClientRect().top;
				const m = more.getBoundingClientRect();
				const hit = document.elementFromPoint(m.left + 20, m.top + m.height / 2);
				return ['list scrollTop ' + l.scrollTop, 'first row moved ' + Math.round(after - before) + 'px', 'Open class takes a press ' + (hit === more || more.contains(hit))];
			}`,
			expected: ['list scrollTop 0', 'first row moved 0px', 'Open class takes a press true']
		},
		{
			...HOME_WIDE_MARKS,
			expected: [
				'overdue 4px from its slot, down the slot and the title, row none, marker drawn',
				'imminent 4px from its slot, down the slot and the title, row none, marker drawn',
				'imminent 4px from its slot, down the slot and the title, row none, marker drawn'
			]
		}
	],
	presence: [
		{ selector: '.feed-card [data-testid="feed-post-thumb"] .pt[data-shape="wide"]', label: 'a Wide slot on every row', expectPresent: 10, maxPresent: 10, expectVisible: 10 },
		{ selector: '.feed-card .feed-more', label: "every card's Open class link", expectPresent: 3, maxPresent: 3, expectVisible: 3 }
	],
	tapTargets: [
		{ selector: '.legacy-index .assignment-item.linked', label: 'feed rows', min: 44 },
		{ selector: '.feed-card .feed-more', label: 'Open class', min: 44 }
	],
	ignoreConsole: HOME_THUMBS_CONSOLE
};
