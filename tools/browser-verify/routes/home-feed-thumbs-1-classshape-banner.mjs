/**
 * A CLASS'S DEFAULT REACHES ITS HOME CARD (ledger 0396, polish round).
 * Period 1's teacher chose Banner; a person who has not chosen sees Period 1's
 * rows with a strip across the top and every other class in Tile. With the
 * person's own Off (./home-feed-thumbs-1-classshape-banner-mine-off.mjs) the
 * class default is beaten and every card is titles only.
 */
import { HOME_LIST_FITS, HOME_ROWS, HOME_THUMBS, HOME_THUMBS_CONSOLE, HOME_THUMBS_READY } from './_home-feed-thumbs.mjs';

export default {
	path: `${HOME_THUMBS}&classShape=banner`,
	label: "Home page class cards: Period 1's Banner default on its card, Tile elsewhere",
	prepare: HOME_THUMBS_READY,
	orderResult: [
		{
			label: "each row's shape and mark",
			evaluate: HOME_ROWS,
			expected: ['banner image', 'banner image', 'banner html', 'banner html', 'banner generated', 'banner generated', 'banner generated', 'banner generated', 'tile glyph']
		},
		{ ...HOME_LIST_FITS, expected: ['fits, 0 of 9 outside, overflow clip', 'fits, 0 of 2 outside, overflow clip', 'fits, 0 of 1 outside, overflow clip'] },
		{
			label: 'each banner spans its row and sits above the title',
			evaluate: `() => [...document.querySelectorAll('.feed-card [data-testid="feed-post-thumb"]')].map((s) => {
				const row = s.closest('.feed-own') ?? s.closest('a.feed-row');
				const name = row.querySelector('.assignment-name').getBoundingClientRect();
				const a = s.getBoundingClientRect();
				const r = row.getBoundingClientRect();
				return (a.bottom <= name.top + 0.5) && a.width >= r.width - 2 * 24.5;
			}).every(Boolean) ? ['every banner above its title, across its row'] : ['a banner out of place']`,
			expected: ['every banner above its title, across its row']
		}
	],
	presence: [
		{ selector: '.feed-card [data-testid="feed-post-thumb"] .pt[data-shape="banner"]', label: "a Banner on each of Period 1's rows", expectPresent: 8, maxPresent: 8, expectVisible: 8 }
	],
	tapTargets: [{ selector: '.legacy-index .assignment-item.linked', label: 'feed rows', min: 44 }],
	ignoreConsole: HOME_THUMBS_CONSOLE
};
