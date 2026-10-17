/**
 * Shared pieces of the /dev/tab-icon specs (ledger 0396). `_`-prefixed, so
 * `routes.mjs` does not load it as a route.
 *
 * WHAT A BROWSER IS FOR HERE. The geometry is held to the design module byte
 * for byte in `tests/tab-icon-geometry.test.ts`, and the painter's rules
 * (priority, the done timer, the title prefix, the repaint budget, reduced
 * motion, a product's own icon) in `tests/dom/tab-icon-live.test.ts`. What only
 * a real browser can say: that every drawing DECODES as an image at 16 and
 * 32 px, that the harness keys drive THIS tab's real icon link (the root
 * layout's painter, not a copy), that error and live are two different
 * pictures and both differ from rest, and that the page holds the 44px floor
 * and its type clears contrast in every theme without scrolling sideways.
 */

const SECTIONS = 15;
const STATES = 11;
const GROUNDS = 6;

const HREF = `document.head.querySelector('link[rel="icon"][type="image/svg+xml"]').href`;
const SHOWING = `document.querySelector('[data-testid="ti-showing"]')?.textContent?.trim()`;

/** Every drawing has decoded (a blob URL that failed would sit at width 0). */
export const READY = `() => document.querySelector('[data-testid="tab-icon-harness"]')?.dataset.ready === 'yes' && [...document.querySelectorAll('.ti-matrix img, .ti-strip img, .ti-app-icon')].every((i) => i.complete && i.naturalWidth > 0) && document.querySelectorAll('.ti-matrix img').length === ${GROUNDS * SECTIONS * STATES * 2}`;

/**
 * `theme` is the site theme the harness forces through `?theme=` (the harness
 * holds no session, so the attribute is set the way /dev/class-videos sets
 * it). The spec waits for the attribute and counts it, so a run whose theme
 * failed to apply cannot pass as a measurement of that theme.
 */
export function tabIconSpec({ theme = null, label }) {
	const themed = theme
		? [{ waitFor: `() => document.documentElement.getAttribute('data-theme') === '${theme}'`, label: `the ${theme} theme is on`, timeoutMs: 10_000 }]
		: [];
	const themePresence = theme
		? [{ selector: `html[data-theme="${theme}"]`, label: `${theme} is on`, expectPresent: 1, maxPresent: 1 }]
		: [{ selector: 'html[data-theme]', label: 'no site theme forced (the IDEA default)', expectPresent: 0, maxPresent: 0 }];
	return {
		path: '/dev/tab-icon' + (theme ? `?theme=${theme}` : ''),
		label,
		prepare: [
			...themed,
			{ waitFor: READY, label: 'every drawing on the page has decoded', timeoutMs: 30_000 },
			{ evaluate: `() => { window.__ti = { rest: ${HREF} }; return 'resting href ' + window.__ti.rest.slice(0, 40); }`, label: 'record the resting icon link' },
			{
				click: '[data-testid="ti-key-error"]',
				until: `() => ${SHOWING} === 'Error' && ${HREF}.startsWith('data:image/svg+xml,')`,
				label: 'Error: the tab icon link becomes a drawing and the readout says Error'
			},
			{ evaluate: `() => { window.__ti.error = ${HREF}; return 'error href length ' + window.__ti.error.length; }`, label: 'record the error icon link' },
			{
				click: '[data-testid="ti-key-live"]',
				until: `() => document.querySelector('[data-testid="ti-key-live"]').getAttribute('aria-pressed') === 'true' && ${SHOWING} === 'Error'`,
				label: 'Live under Error: Error still shows (priority)'
			},
			{
				click: '[data-testid="ti-key-error"]',
				until: `() => ${SHOWING} === 'Live'`,
				label: 'clear Error: Live shows'
			},
			{ evaluate: `() => { window.__ti.live = ${HREF}; return 'live href length ' + window.__ti.live.length; }`, label: 'record a live frame' },
			{
				click: '[data-testid="ti-key-unread"]',
				until: `() => document.title.startsWith('(3) ')`,
				label: 'Unread: the title gains its count'
			},
			{
				click: '[data-testid="ti-clear-all"]',
				until: `() => ${SHOWING} === 'Resting' && !document.title.startsWith('(') && ${HREF} === window.__ti.rest`,
				label: 'Clear all: resting icon, plain title',
				force: true
			}
		],
		presence: [
			...themePresence,
			{ selector: '.ti-matrix img', label: `every glyph in every state, 16 and 32 px, on six grounds (${GROUNDS}x${SECTIONS}x${STATES}x2)`, expectPresent: GROUNDS * SECTIONS * STATES * 2, maxPresent: GROUNDS * SECTIONS * STATES * 2 },
			{ selector: '.ti-strip img', label: 'every section in a tab on each ground', expectPresent: GROUNDS * SECTIONS, maxPresent: GROUNDS * SECTIONS },
			{ selector: '.ti-app-icon', label: 'the three home-screen icons, shipped and drawn', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
			{ selector: '[data-testid^="ti-key-"]', label: 'a key per status', expectPresent: 8, maxPresent: 8, expectVisible: 8 },
			{ selector: '[data-testid="ti-live-16"]', label: 'the live preview at 16 px', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
			{ selector: '[data-testid="ti-matrix-scroll-note"]', label: 'the line saying a table scrolls sideways', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
		],
		contrast: [
			{ selector: '.ti-head h1', label: 'the page title', min: 4.5 },
			{ selector: '.ti-note', label: 'the notes', min: 4.5 },
			{ selector: '.ti-key', label: 'the status keys', min: 4.5 },
			{ selector: '.ti-facts dd', label: 'the readout', min: 4.5 },
			{ selector: '.ti-matrix tbody th', label: 'section names on every tab ground', min: 4.5 },
			{ selector: '.ti-app figcaption', label: 'captions on the wallpaper', min: 4.5 }
		],
		tapTargets: [
			{ selector: '.ti-key', label: 'the status keys', min: 44 },
			{ selector: '.ti-dial input', label: 'the unread count and the progress slider', min: 44 },
			{ selector: '.ti-jump a', label: 'the jump links', min: 44 }
		],
		orderResult: [
			{
				label: 'error and live are two different pictures, and both differ from resting',
				evaluate: `() => { const t = window.__ti; if (!t) return ['NO PROBE']; return [t.error !== t.rest ? 'error differs from rest' : 'ERROR == REST', t.live !== t.rest ? 'live differs from rest' : 'LIVE == REST', t.error !== t.live ? 'error differs from live' : 'ERROR == LIVE']; }`,
				expected: ['error differs from rest', 'live differs from rest', 'error differs from live']
			},
			{
				// Scrolled to its far end, every table still shows its Section
				// column at its own left edge, on top of the cells it slides
				// over (hit-tested at each name's centre). At a width where a
				// table does not scroll the same reads hold, so the expectation
				// is one at every width; the overflow count says which case ran.
				label: 'the Section column stays in view, on top, when a table is scrolled sideways',
				evaluate: `() => { const boxes = [...document.querySelectorAll('.ti-scroll')]; let pinned = 0, onTop = 0, rows = 0; for (const box of boxes) { box.scrollIntoView({ block: 'center', behavior: 'instant' }); box.scrollLeft = box.scrollWidth; const left = box.getBoundingClientRect().left; for (const th of box.querySelectorAll('tbody th')) { rows++; let r = th.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) { window.scrollBy({ top: r.top - innerHeight / 2, behavior: 'instant' }); r = th.getBoundingClientRect(); } if (Math.abs(r.left - left) < 1.5) pinned++; const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 20), r.top + r.height / 2); if (hit && th.contains(hit)) onTop++; } box.scrollLeft = 0; } return [boxes.length + ' tables', rows === pinned ? 'every section name pinned at the left edge' : 'PINNED ' + pinned + ' OF ' + rows, rows === onTop ? 'every section name on top of the cells' : 'ON TOP ' + onTop + ' OF ' + rows]; }`,
				expected: [GROUNDS + ' tables', 'every section name pinned at the left edge', 'every section name on top of the cells']
			}
		]
	};
}
