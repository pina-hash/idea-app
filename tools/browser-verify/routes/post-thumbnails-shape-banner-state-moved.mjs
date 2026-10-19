/**
 * A BANNER THAT MOVES KEEPS ITS LIVE THUMBNAIL (report 7dfde5e5, ledger 0416).
 * Dragging a post to a new place moves its row's element, and an iframe taken
 * out of the page and put back is a new document under a new window: the
 * bridge was keyed on the old one, so the dragged post's banner never said it
 * was ready again and showed only its glyph. Here the row is moved the way the
 * reorder moves it (the same element, put back elsewhere in its list) and the
 * live banner must come back.
 */
import { LIVE_READY, THUMBS, THUMBS_READY } from './_post-thumbnails.mjs';

const MOVE = `() => {
	const row = document.querySelector('.row-wrap[data-item-id="as-gears"]');
	const list = row?.parentElement;
	if (!row || !list) return 'no row';
	// Taken out and put back where it was, which is what a reorder does to the
	// row it moves: the browser loads the frame inside it again, under a new
	// window, with nothing about the row's place or size changing.
	const next = row.nextSibling;
	const before = row.querySelector('iframe')?.contentWindow ?? null;
	list.insertBefore(row, next);
	window.__movedWindowIsNew = (row.querySelector('iframe')?.contentWindow ?? null) !== before;
	return 'moved';
}`;

export default {
	path: `${THUMBS}?shape=banner&state=moved`,
	label: 'Post thumbnails as banners: a moved post keeps its live banner',
	prepare: [
		THUMBS_READY,
		LIVE_READY,
		{ evaluate: MOVE, waitMs: 1500 },
		{ evaluate: `() => 'settled'`, waitMs: 400 }
	],
	orderResult: [
		{
			label: 'the frame came back under a new window, and the post shows its live banner again',
			evaluate: `() => { const r = document.querySelector('.row-wrap[data-item-id="as-gears"]'); const pt = r?.querySelector('[data-testid="post-thumb"]'); return ['new window ' + window.__movedWindowIsNew, pt?.getAttribute('data-source'), 'ready ' + pt?.getAttribute('data-ready'), 'glyph ' + getComputedStyle(pt.querySelector('.pt-gen')).visibility]; }`,
			expected: ['new window true', 'html', 'ready true', 'glyph hidden']
		}
	],
	presence: [
		{ selector: '[data-testid="html-thumbnail"][data-ready="true"]', label: 'all three live banners ready, the moved one included', expectPresent: 3, maxPresent: 3 },
		{ selector: '.row-banner [data-testid="post-thumb"][data-shape="banner"]', label: 'a banner over each row', expectPresent: 14, maxPresent: 14 }
	]
};
