/**
 * A LONG NOTICE WITH FILES IN THE LIST PANE BESIDE AN OPEN ITEM (ledger 0368,
 * report R04 meeting report R09). The notices are part of the class page, so
 * when an item is open they sit in the 26rem list pane, which is where a long
 * notice and its files would push the pane sideways or take its height. At
 * 1440 this prints the pane's width, its sideways overflow, the notices region
 * folded and open, and where the picture tiles land; at 375 the item is the
 * only pane on screen and the list (notices included) is hidden, never gone.
 *
 * The REAL ClassView renders here (`view=class`), so the pane holds the stream's
 * own size container and the compact rows, as on the class page.
 * `class-header-posts-1-long-1-files-5.mjs` is the same notice with the list as
 * the page, and carries the contrast, the tap targets and the viewer.
 */
import { IGNORE, VIEW_READY } from './_class-header.mjs';

const MEASURE = `async () => {
	const wait = (ms) => new Promise((r) => setTimeout(r, ms));
	const region = document.querySelector('[data-testid="quick-posts"]');
	if (!region) return (window.__paneNotices = { error: 'no notices region' }).error;
	if (!matchMedia('(min-width: 1024px)').matches) {
		const shown = region.getBoundingClientRect().height > 0;
		window.__paneNotices = { narrow: true, shown };
		return 'below 1024px: the item is the one pane, notices on screen=' + shown;
	}
	const nav = region.closest('[data-testid="class-nav-pane"]') || region.parentElement;
	const key = region.querySelector('[data-post="qp-1"] [data-testid="quick-post-more"]');
	/* PAINT IS NOT INTERACTIVITY: repeat each press until the key says it moved. */
	const press = async (want) => {
		for (let i = 0; i < 40 && key.getAttribute('aria-expanded') !== want; i++) {
			key.click();
			await wait(250);
		}
	};
	const folded = region.getBoundingClientRect().height;
	await press('true');
	const open = region.getBoundingClientRect().height;
	const openOverflow = nav.scrollWidth - nav.clientWidth;
	await press('false');
	const tiles = [...region.querySelectorAll('[data-post="qp-1"] [data-testid="attach-gallery-tile"]')].map((t) => t.getBoundingClientRect());
	const rows = new Set(tiles.map((b) => Math.round(b.top))).size;
	const card = region.querySelector('[data-post="qp-1"]').getBoundingClientRect();
	const inside = tiles.every((b) => b.left >= card.left - 0.5 && b.right <= card.right + 0.5);
	const r = {
		pane: Math.round(nav.getBoundingClientRect().width),
		overflow: Math.round(nav.scrollWidth - nav.clientWidth),
		openOverflow: Math.round(openOverflow),
		folded: +folded.toFixed(1),
		open: +open.toFixed(1),
		tiles: tiles.length,
		tileRows: rows,
		tilesInside: inside,
		key: key.getAttribute('aria-expanded')
	};
	window.__paneNotices = r;
	return 'pane ' + r.pane + 'px, sideways overflow ' + r.overflow + 'px folded and ' + r.openOverflow + 'px open; notices region ' + r.folded + 'px folded, ' + r.open + 'px open; ' + r.tiles + ' tiles on ' + r.tileRows + ' line(s), inside the notice=' + r.tilesInside;
}`;

const VERDICT = `() => {
	const r = window.__paneNotices;
	if (!r || r.error) return ['measured=' + (r ? r.error : 'no')];
	if (r.narrow) {
		const t = r.shown ? 'no-the-list-is-on-screen' : 'yes';
		return ['no sideways overflow:' + t, 'folded shorter than open:' + t, 'three tiles inside the notice:' + t, 'closed again:' + t];
	}
	return [
		'no sideways overflow:' + (r.overflow === 0 && r.openOverflow === 0 ? 'yes' : 'no-' + r.overflow + '-' + r.openOverflow),
		'folded shorter than open:' + (r.folded < r.open ? 'yes' : 'no'),
		'three tiles inside the notice:' + (r.tiles === 3 && r.tilesInside ? 'yes' : 'no-' + r.tiles),
		'closed again:' + (r.key === 'false' ? 'yes' : 'no')
	];
}`;

export default {
	path: '/dev/class-header?view=class&pane=1&posts=1&long=1&files=5',
	label: 'A long notice with files in the list pane beside an open item: folded, no sideways overflow, tiles inside',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: VIEW_READY, label: 'the real class page has painted', timeoutMs: 30000 }, { evaluate: MEASURE }],
	orderResult: [
		{
			label: 'in the 26rem pane the long notice folds, its tiles fit, and nothing pushes the pane sideways',
			evaluate: VERDICT,
			expected: ['no sideways overflow:yes', 'folded shorter than open:yes', 'three tiles inside the notice:yes', 'closed again:yes']
		}
	]
};
