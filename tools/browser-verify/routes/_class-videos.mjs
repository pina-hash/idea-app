/**
 * Shared probes for the /dev/class-videos specs (ledger 0298, R08): the
 * Videos section on the REAL class page (ClassView), over the harness's
 * fixture of YouTube links in a material's body (ending a sentence, and bare
 * in a list item), in the middle of an assignment's sentence, again in an
 * announcement's Links list, a non-YouTube page carrying `?v=`, a Vimeo link,
 * a YouTube channel page, and an item with no link.
 *
 * `_`-prefixed, so the route loader skips it (routes.mjs).
 */

export const VIDEOS = '/dev/class-videos';

/** The class page has painted its search row, which every state has. */
export const VIDEOS_READY = {
	waitFor: `() => !!document.querySelector('[data-testid="videos-class"] [data-testid="stream-find"]')`,
	timeoutMs: 20000
};

/**
 * THE CLOSED STATE, RECORDED BEFORE ANYTHING IS PRESSED: how many stills are
 * in the DOM, how many carry no-referrer, and whether the region is hidden.
 * Every request off loopback is ABORTED in this harness, and an aborted still
 * fires `onerror`, which removes the <img> (the broken-still rule). So stills
 * still present here were never requested: the closed section asked YouTube
 * for nothing. The open state below is the positive control.
 */
export const RECORD_CLOSED = {
	evaluate: `() => {
		const grid = document.querySelector('[data-testid="class-videos-grid"]');
		const imgs = [...document.querySelectorAll('[data-testid="class-videos-grid"] img')];
		const region = grid?.closest('.disc-body');
		window.__cvClosed = [
			'stills ' + imgs.length,
			'no-referrer ' + imgs.filter((i) => i.getAttribute('referrerpolicy') === 'no-referrer').length,
			'lazy ' + imgs.filter((i) => i.getAttribute('loading') === 'lazy').length,
			'region ' + (region ? getComputedStyle(region).display : 'absent')
		];
		return window.__cvClosed.join(', ');
	}`
};

/**
 * Open the section. The predicate is something only the press produces.
 * MORE ATTEMPTS THAN THE DEFAULT, measured: the first route of a run visits a
 * cold vite, and a press landing before hydration does nothing, so the
 * teacher state at 375 took 8 presses on one run and did not open inside the
 * default 12 on the next. The attempt count is still reported.
 */
export const OPEN_VIDEOS = {
	click: '[data-testid="class-videos-toggle"]',
	until: `() => document.querySelector('[data-testid="class-videos-toggle"]')?.getAttribute('aria-expanded') === 'true'`,
	attempts: 40,
	waitMs: 300
};

/** Once open, the stills are requested -- and aborted here, so they drop out. */
export const STILLS_REQUESTED = {
	waitFor: `() => document.querySelectorAll('[data-testid="class-videos-grid"] img').length < (window.__cvClosed ? Number(window.__cvClosed[0].split(' ')[1]) : 0)`,
	timeoutMs: 10000
};

/** The grid's measured geometry at this width, printed as the step's return value. */
export const GRID_GEOMETRY = {
	evaluate: `() => {
		const grid = document.querySelector('[data-testid="class-videos-grid"]');
		const cards = [...document.querySelectorAll('[data-testid="class-video"]')];
		if (!grid || !cards.length) return 'no grid';
		const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
		const g = grid.getBoundingClientRect();
		const c = cards[0].getBoundingClientRect();
		const frame = cards[0].querySelector('.cvid-frame').getBoundingClientRect();
		const tops = new Set(cards.map((k) => Math.round(k.getBoundingClientRect().top)));
		return 'grid ' + g.width.toFixed(1) + 'px, ' + cols + ' track(s), ' + tops.size + ' row(s) of ' + cards.length + ' card(s); card ' + c.width.toFixed(1) + 'x' + c.height.toFixed(1) + ', still ' + frame.width.toFixed(1) + 'x' + frame.height.toFixed(1);
	}`
};

/** Every card as "<video id> | <title> | <posted in> | <also in>", in page order. */
export const CARDS = `() => [...document.querySelectorAll('[data-testid="class-video"]')].map((c) => [
	c.getAttribute('data-video'),
	c.querySelector('.cvid-label')?.textContent.trim(),
	c.querySelector('[data-testid="class-video-item"] .cvid-from-title')?.textContent.trim(),
	[...c.querySelectorAll('[data-testid="class-video-also"]')].map((a) => a.textContent.trim()).join(', ') || '-'
].join(' | '))`;

/** Where the two kinds of link on a card go. */
export const ITEM_HREFS = `() => [...document.querySelectorAll('[data-testid="class-video-item"], [data-testid="class-video-also"]')].map((a) => a.getAttribute('href'))`;
export const WATCH_LINKS = `() => [...document.querySelectorAll('[data-testid="class-video-watch"]')].map((a) => [a.getAttribute('target'), a.getAttribute('rel'), new URL(a.href).hostname].join(' '))`;

/** The class's rows, by name, sorted: the positive control that every item is on the page. */
export const ROW_NAMES = `() => [...document.querySelectorAll('[data-testid="videos-class"] [data-testid="item-row"] .row-name')].map((r) => r.textContent.trim()).sort()`;
