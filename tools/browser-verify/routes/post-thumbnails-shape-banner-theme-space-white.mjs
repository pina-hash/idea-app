/**
 * POST THUMBNAILS AS BANNERS UNDER SPACE WHITE (ledger 0396): a short strip
 * across each row, and the live thumbnails told the light scheme. The harness
 * holds no session, so the attribute is forced the way /dev/class-videos does.
 */
import { LIVE_READY, SLOTS, SLOT_ORDER, THUMBS, THUMBS_READY, TOLD } from './_post-thumbnails.mjs';

export default {
	path: `${THUMBS}?shape=banner&theme=space-white`,
	label: 'Post thumbnails on the class page, Banner, Space White',
	prepare: [
		THUMBS_READY,
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		LIVE_READY,
		{ evaluate: `() => 'settled'`, waitMs: 800 }
	],
	orderResult: [
		{
			label: 'every row has a banner, each showing what its post holds',
			evaluate: `() => (${SLOTS})().map((s) => s.replace(/ banner$/, ''))`,
			expected: SLOT_ORDER
		},
		{
			label: 'each live thumbnail was told it is a banner on a light page',
			evaluate: TOLD,
			expected: ['thumb-gear banner light interactive=false', 'thumb-canvas banner light interactive=false', 'thumb-interactive banner light interactive=true']
		}
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '.row-banner [data-testid="post-thumb"][data-shape="banner"]', label: 'a banner over each row', expectPresent: 14, maxPresent: 14 }
	],
	contrast: [
		{ selector: '.row-name', label: 'row titles under a banner', min: 4.5 },
		{ selector: '.row-meta', label: 'row meta under a banner', min: 4.5 }
	]
};
