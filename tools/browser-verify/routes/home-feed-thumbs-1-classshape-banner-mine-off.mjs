/**
 * THE PERSON'S OFF BEATS THE CLASS'S DEFAULT ON THE HOME PAGE TOO (ledger
 * 0396, polish round): Period 1's teacher chose Banner, this person chose Off,
 * and every card is titles and the kind glyph only.
 */
import { HOME_LIST_FITS, HOME_ROWS, HOME_THUMBS, HOME_THUMBS_CONSOLE, HOME_THUMBS_READY } from './_home-feed-thumbs.mjs';

export default {
	path: `${HOME_THUMBS}&classShape=banner&mine=off`,
	label: "Home page class cards: the person's Off over Period 1's Banner default",
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
		{ selector: '.feed-card [data-testid="post-thumb"]', label: 'no thumbnail slot', expectPresent: 0 },
		{ selector: '.feed-card img, .feed-card iframe', label: 'no picture and no live frame', expectPresent: 0 }
	],
	ignoreConsole: HOME_THUMBS_CONSOLE
};
