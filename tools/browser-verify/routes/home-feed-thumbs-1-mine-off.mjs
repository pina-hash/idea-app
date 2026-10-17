/**
 * THUMBNAILS OFF REACHES THE HOME PAGE (ledger 0396, polish round). A person
 * who chose Off in Display settings gets titles only on the home page's class
 * cards too: no post thumbnail, no body cover, no live frame, the kind glyph
 * on every row. The choice is read from this device's classroom slot, as the
 * real home page reads it. ./home-feed-thumbs-1.mjs is the other direction.
 */
import { HOME_LIST_FITS, HOME_ROWS, HOME_THUMBS, HOME_THUMBS_CONSOLE, HOME_THUMBS_READY } from './_home-feed-thumbs.mjs';

export default {
	path: `${HOME_THUMBS}&mine=off`,
	label: "Home page class cards with the person's Off: titles and the kind glyph only",
	prepare: HOME_THUMBS_READY,
	orderResult: [
		{
			label: "each row's shape and mark",
			evaluate: HOME_ROWS,
			expected: ['off glyph', 'off glyph', 'off glyph', 'off glyph', 'off glyph', 'off glyph', 'off glyph', 'off glyph', 'off glyph']
		},
		{ ...HOME_LIST_FITS, expected: ['fits, 0 of 9 outside, overflow clip', 'fits, 0 of 2 outside, overflow clip', 'fits, 0 of 1 outside, overflow clip'] }
	],
	presence: [
		{ selector: '[data-testid="feed-post-thumb"], [data-testid="post-thumb"]', label: 'no thumbnail slot anywhere', expectPresent: 0 },
		{ selector: '.feed-card img', label: 'no picture of any kind', expectPresent: 0 },
		{ selector: '.feed-card iframe', label: 'no live frame', expectPresent: 0 },
		{ selector: '.feed-row .assignment-icon-thumb svg', label: 'the kind glyph on every row', expectPresent: 9, maxPresent: 9, expectVisible: 9 }
	],
	tapTargets: [{ selector: '.legacy-index .assignment-item.linked', label: 'feed rows', min: 44 }],
	ignoreConsole: HOME_THUMBS_CONSOLE
};
