/**
 * A PRESS ON A LIVE THUMBNAIL OPENS ITS POST (ledger 0396). The gear fixture
 * is a non-interactive live HTML thumbnail: the frame is `inert` and its tile
 * sits inside the row's own link, so a real mouse press at its middle
 * navigates to the post exactly as a press on the row's title does. (The interactive
 * thumbnail keeping its own clicks is driven inside its frame, which a spec
 * cannot reach; the history entry records that measurement.)
 */
import { LIVE_READY, THUMBS, THUMBS_READY } from './_post-thumbnails.mjs';

export default {
	path: `${THUMBS}?view=click`,
	label: 'A press on a live thumbnail opens its post',
	prepare: [
		THUMBS_READY,
		LIVE_READY,
		{ evaluate: `() => 'settled'`, waitMs: 800 },
		{
			click: '[data-item-id="as-gears"] [data-testid="post-thumb"]',
			until: `() => location.pathname.endsWith('/item/as-gears')`,
			attempts: 10
		}
	],
	orderResult: [
		{
			label: 'the press landed on the post',
			evaluate: `() => [location.pathname]`,
			expected: ['/dev/post-thumbnails/s-thumbs/item/as-gears']
		}
	]
};
