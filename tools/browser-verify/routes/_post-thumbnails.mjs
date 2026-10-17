/**
 * Shared probes for the /dev/post-thumbnails specs (ledger 0396, report
 * a6a037f3): post thumbnails on the REAL class page (ClassView, PostThumbnail,
 * HtmlThumbnailFrame) over a fixture with every source a slot can show, and
 * the REAL composer's thumbnail editor and the class Settings card.
 *
 * `_`-prefixed, so the route loader skips it (routes.mjs).
 */

export const THUMBS = '/dev/post-thumbnails';

/** The page has hydrated (the harness marks `<html>` in onMount). */
export const THUMBS_READY = {
	waitFor: `() => document.documentElement.getAttribute('data-thumb-hydrated') === 'true'`,
	timeoutMs: 60000
};

/** The three live HTML thumbnails have each said they are ready. */
export const LIVE_READY = {
	waitFor: `() => document.querySelectorAll('[data-testid="html-thumbnail"][data-ready="true"]').length >= 3`,
	timeoutMs: 30000
};

/** Every row's slot, in page order: `<item id> <source> <shape>`. */
export const SLOTS = `() => [...document.querySelectorAll('.row-wrap')].map((w) => {
	const pt = w.querySelector('[data-testid="post-thumb"]');
	return (w.getAttribute('data-item-id') ?? 'check-in') + ' ' + (pt ? pt.getAttribute('data-source') + ' ' + pt.getAttribute('data-shape') : 'none');
})`;

/**
 * What each live thumbnail was last told, through the bridge. Read by the POST
 * whose frame sent the report (the harness finds the frame by its window), not
 * by the document id the report names: two posts may show one document, and a
 * read keyed on the document would pass on the other post's report.
 */
export const TOLD = `() => [['as-gears', 'thumb-gear'], ['as-spokes', 'thumb-canvas'], ['as-teeth', 'thumb-interactive']].map(([item, d]) => {
	const s = ((window.__thumbReportsByItem ?? {})[item] ?? []).filter((r) => r.kind === 'state').at(-1)?.state;
	return d + ' ' + (s ? s.shape + ' ' + s.scheme + ' interactive=' + s.interactive : 'nothing');
})`;

export const SLOT_ORDER = [
	'as-bench image',
	'mat-arm image',
	'mat-calipers generated',
	'as-gears html',
	'as-spokes html',
	'as-teeth html',
	'as-badge image',
	'as-plain-gen generated',
	'as-cams generated',
	'post-shop image',
	'mat-gone generated',
	'mat-build generated',
	'check-in generated',
	'post-safety generated'
];
