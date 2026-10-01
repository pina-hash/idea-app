/**
 * Shared hit tests for a class-list row's edit layer (report R06 on the class
 * page, ledger 0360). `_`-prefixed, so `routes.mjs` does not load it as a route.
 *
 * WHY HIT TESTS AND NEVER A Z-INDEX READ. The layer's own computed z-index
 * reads 60 the whole time it is covered: what decides paint order is the
 * nearest stacking context it is ranked inside, and the only read that tells a
 * covered control from a reachable one is `elementFromPoint` at its centre.
 */

/** The layer's Close, its title and the middle of its form, each hit as the layer or named as what covers it. */
export const LAYER_HITS = `() => {
	const layer = document.querySelector('.composer-screen');
	if (!layer) return ['no layer'];
	const describe = (hit) => {
		if (!hit) return 'nothing';
		if (hit.closest('.cr-split-sep')) return 'the separator';
		if (hit.closest('.app-header, .cr-header')) return 'the masthead';
		if (hit.closest('.cr-detail, [data-testid="item-detail"]')) return 'the open item';
		return typeof hit.className === 'string' && hit.className ? hit.className.split(' ')[0] : hit.tagName.toLowerCase();
	};
	const at = (el, word) => {
		if (!el) return 'no ' + word;
		const b = el.getBoundingClientRect();
		const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
		return hit && layer.contains(hit) ? word + ' reachable' : word + ' covered by ' + describe(hit);
	};
	const body = document.querySelector('.composer-screen-body') ?? layer;
	const b = body.getBoundingClientRect();
	const hit = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height, innerHeight - b.top) / 2);
	return [
		at(document.querySelector('[data-testid="composer-screen-close"]'), 'close'),
		at(document.querySelector('.composer-screen-title'), 'title'),
		hit && layer.contains(hit) ? 'form on top' : 'form under ' + describe(hit)
	];
}`;

/** Close the layer and read the page back: its root keeps its stacking context again. */
export const CLOSE_AND_READ_BACK = `async () => {
	document.querySelector('[data-testid="composer-screen-close"]')?.click();
	for (let i = 0; i < 20 && document.querySelector('.composer-screen'); i++) await new Promise((r) => setTimeout(r, 100));
	const root = document.querySelector('.cr-nav .classroom-page, .classroom-page');
	return [
		document.querySelector('.composer-screen') ? 'layer still open' : 'layer closed',
		root && !root.classList.contains('edit-layer-open') ? 'page class cleared' : 'page class still on'
	];
}`;
