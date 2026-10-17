/**
 * THE HOME PAGE'S CLASS CARDS IN TILE, the built-in default (ledger 0396): a
 * post's own thumbnail in the row's 34px mark box, a post with a picture in
 * its body keeps its cover, and every other row keeps its kind glyph. The
 * positive control for ./home-feed-thumbs-1-mine-off.mjs, which is the same
 * fixture with the person's Off.
 */
import { HOME_LIST_FITS, HOME_ROWS, HOME_THUMBS, HOME_THUMBS_CONSOLE, HOME_THUMBS_READY } from './_home-feed-thumbs.mjs';

export default {
	path: HOME_THUMBS,
	label: "Home page class cards, Tile: each post's own thumbnail in the mark box",
	prepare: HOME_THUMBS_READY,
	orderResult: [
		{
			label: "each row's shape and mark",
			evaluate: HOME_ROWS,
			expected: ['tile image', 'tile cover', 'tile html', 'tile html', 'tile glyph', 'tile glyph', 'tile glyph', 'tile glyph', 'tile glyph']
		},
		{ ...HOME_LIST_FITS, expected: ['fits, 0 of 9 outside, overflow clip', 'fits, 0 of 2 outside, overflow clip', 'fits, 0 of 1 outside, overflow clip'] }
	],
	presence: [
		{ selector: '[data-testid="feed-post-thumb"]', label: "the three posts' own thumbnails", expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '.feed-row .assignment-icon-thumb img', label: "the one post's body cover", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.feed-row iframe[sandbox][inert]', label: 'the two live thumbnails, inert inside the row link', expectPresent: 2, maxPresent: 2 },
		{ selector: '.feed-row iframe[sandbox*="allow-same-origin"]', label: 'no frame granted allow-same-origin', expectPresent: 0 }
	],
	tapTargets: [{ selector: '.legacy-index .assignment-item.linked', label: 'feed rows', min: 44 }],
	ignoreConsole: HOME_THUMBS_CONSOLE
};
