/**
 * THUMBNAILS OFF (ledger 0396): the list as it was, kind glyph and all, with
 * no slot and no live frame anywhere. The other direction of every spec above.
 */
import { THUMBS, THUMBS_READY } from './_post-thumbnails.mjs';

export default {
	path: `${THUMBS}?shape=off`,
	label: 'Post thumbnails Off: the class page as it was',
	prepare: [THUMBS_READY, { evaluate: `() => 'settled'`, waitMs: 1500 }],
	presence: [
		{ selector: '.stream[data-thumbs]', label: 'no thumbnail shape on the list', expectPresent: 0 },
		{ selector: '[data-testid="post-thumb"]', label: 'no slot', expectPresent: 0 },
		{ selector: 'iframe', label: 'no live frame', expectPresent: 0 },
		{ selector: '.row-wrap .kind-glyph', label: 'the kind glyph on every row', expectPresent: 14, maxPresent: 14, expectVisible: 14 }
	]
};
