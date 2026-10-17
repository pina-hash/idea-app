/**
 * POST THUMBNAILS IN THE WIDE SHAPE (ledger 0396): a 16:9 slot over each row's
 * words, the same sources, and the live thumbnails told `wide`.
 */
import { LIVE_READY, SLOTS, SLOT_ORDER, THUMBS, THUMBS_READY, TOLD } from './_post-thumbnails.mjs';

export default {
	path: `${THUMBS}?shape=wide`,
	label: 'Post thumbnails on the class page, Wide',
	prepare: [THUMBS_READY, LIVE_READY, { evaluate: `() => 'settled'`, waitMs: 600 }],
	orderResult: [
		{
			label: 'every row has a wide slot, each showing what its post holds',
			evaluate: `() => (${SLOTS})().map((s) => s.replace(/ wide$/, ''))`,
			expected: SLOT_ORDER
		},
		{
			label: 'each live thumbnail was told it is wide',
			evaluate: TOLD,
			expected: ['thumb-gear wide dark interactive=false', 'thumb-canvas wide dark interactive=false', 'thumb-interactive wide dark interactive=true']
		},
		{
			label: 'every slot is 16:9',
			evaluate: `() => [...new Set([...document.querySelectorAll('[data-testid="post-thumb"]')].map((p) => { const r = p.getBoundingClientRect(); return (r.width / r.height).toFixed(2); }))]`,
			expected: ['1.78']
		}
	],
	presence: [
		{ selector: '.stream[data-thumbs="wide"]', label: 'the list is in Wide', expectPresent: 1, maxPresent: 1 },
		{ selector: '.row-body [data-testid="post-thumb"][data-shape="wide"]', label: 'a wide slot over each row', expectPresent: 14, maxPresent: 14 }
	],
	contrast: [{ selector: '.row-name', label: 'row titles under a wide slot', min: 4.5 }]
};
