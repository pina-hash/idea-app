/**
 * /coin, the coin home (ledger 0422, feedback d299d864), as a student: the REAL
 * page over in-memory answers shaped by the REAL `coinHomeFrom`. One card per
 * coin page, each one link; the IDEA Coin bar above with the home current and
 * no Coin Desk tab (a student is not coin staff).
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export default {
	path: '/dev/coin-home',
	label: 'Coin home: one preview per coin page, the bar with home current',
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '[data-testid="coin-bar"]', label: 'the coin bar', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="coin-bar"] a[aria-current="page"]', label: 'the current tab', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="coin-bar-home"][aria-current="page"]', label: 'home is the current tab', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="coin-bar"] a', label: 'tabs (home and four pages)', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="coin-bar-desk"]', label: 'no Coin Desk tab for a student', expectPresent: 0, maxPresent: 0 },
		{ selector: '.ch-card', label: 'preview cards', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '.ch-card .ch-open', label: 'one link per card', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="ch-card-desk"]', label: 'no Coin Desk card', expectPresent: 0, maxPresent: 0 },
		{ selector: '.ch-board li', label: 'Ledger top three', expectPresent: 3, maxPresent: 3 }
	],
	orderResult: [
		{
			label: 'no horizontal scroll',
			evaluate: `() => [document.documentElement.scrollWidth === document.documentElement.clientWidth ? 'no overflow' : 'overflow ' + document.documentElement.scrollWidth]`,
			expected: ['no overflow']
		},
		{
			label: 'the bar sits directly under the site header',
			evaluate: `() => { const h = document.querySelector('.app-header'); const b = document.querySelector('[data-testid="coin-bar"]'); return [h && b && Math.abs(b.getBoundingClientRect().top - h.getBoundingClientRect().bottom) < 2 ? 'under header' : 'gap ' + (b.getBoundingClientRect().top - h.getBoundingClientRect().bottom)]; }`,
			expected: ['under header']
		},
		{
			label: 'every tab on one row or wrapped, none past the edge',
			evaluate: `() => [[...document.querySelectorAll('[data-testid="coin-bar"] a')].every((a) => a.getBoundingClientRect().right <= document.documentElement.clientWidth + 0.5) ? 'all inside' : 'past the edge']`,
			expected: ['all inside']
		},
		{
			label: 'a card is one tap: its centre opens its page',
			evaluate: `() => [...document.querySelectorAll('.ch-card')].map((c) => { c.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = c.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height - 8); const a = el && el.closest('a'); return a ? a.getAttribute('href') : 'none'; })`,
			expected: ['/coin-balance', '/coins/index.html', '/market', '/market/stocks']
		}
	],
	contrast: [
		{ selector: '[data-testid="coin-bar"] a:not([aria-current]) span:not(.cb-mark)', label: 'resting tab labels', min: 4.5 },
		{ selector: '[data-testid="coin-bar"] a[aria-current="page"] .cb-mark', label: 'the coin mark', min: 4.5 },
		{ selector: '.ch-head h2 a', label: 'card titles', min: 4.5 },
		{ selector: '.ch-quiet, .ch-dim, dt, .ch-go', label: 'secondary text', min: 4.5 },
		{ selector: '.ch-num, dd, .ch-figure', label: 'figures', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="coin-bar"] a', label: 'every coin bar tab', min: 44 }]
};
