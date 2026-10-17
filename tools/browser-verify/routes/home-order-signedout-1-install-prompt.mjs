import { SETTLE_ENTRANCE } from './_shared.mjs';
import { CARD, CLOSE_TOUR, HIDE_STRIP, KEY, OFFER, ROW_PROBE } from './_install-key.mjs';

/**
 * THE INSTALL APP KEY IN CHROME AND EDGE (ledger 0396), on the real home page,
 * signed out.
 *
 * WHAT IS MEASURED: no key until the browser offers; an offer (a synthetic
 * `beforeinstallprompt`, caught by the one listener in src/app.html) puts the
 * key in the header; one press calls the event's `prompt()` exactly once; the
 * dialog declined, the key stays and opens a card pointing at the browser's own
 * install controls; a new offer puts it back on the dialog; two presses at once
 * reach `prompt()` once and open no card under the dialog; and the key, on a
 * third offer, sits on Take the tour's row, overlaps nothing, answers a tap at
 * its centre, is 44px, and leaves the header the height it was. At 375 the key is its icon (the word
 * does not fit beside Take the tour and Sign in); at 1440 it says Install app.
 * And when it arrives, Take the tour and Sign in stay exactly where they were
 * (review round 1: on a phone they slid 14.4px while the narrow-row rules
 * waited for the key; they now hold from the first paint).
 */
export default {
	path: '/dev/home-order?signedout=1&install=prompt',
	label: 'Install app key, Chrome: hidden until the browser offers, one press opens its install dialog once, then the browser menu',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150, label: 'settle the entrance' },
		HIDE_STRIP,
		CLOSE_TOUR,
		{
			evaluate: `() => { (window.__iaLog = window.__iaLog || []).push(document.querySelector('${KEY}') ? 'KEY BEFORE ANY OFFER' : 'no key before an offer'); window.__iaHeader = document.querySelector('.legacy-index header').getBoundingClientRect().height; window.__iaRow = ['.tour-link', '.signin'].map((s) => { const b = document.querySelector('.legacy-index ' + s).getBoundingClientRect(); return [b.left, b.right, b.top]; }); return 'header ' + window.__iaHeader + 'px with no key, Take the tour and Sign in at ' + JSON.stringify(window.__iaRow); }`,
			label: 'before any offer: no key, the header height, and where Take the tour and Sign in sit'
		},
		OFFER,
		{ waitFor: `() => !!document.querySelector('${KEY}')`, timeoutMs: 5000, label: 'the key appears' },
		{
			evaluate: `() => { const now = ['.tour-link', '.signin'].map((s) => { const b = document.querySelector('.legacy-index ' + s).getBoundingClientRect(); return [b.left, b.right, b.top]; }); const moved = Math.max(...now.flatMap((r, i) => r.map((v, j) => Math.abs(v - window.__iaRow[i][j])))); window.__iaLog.push(moved < 0.5 ? 'Take the tour and Sign in did not move when the key arrived' : 'THEY MOVED ' + moved.toFixed(1) + 'px'); return 'moved at most ' + moved.toFixed(2) + 'px'; }`,
			label: 'the key arrived: Take the tour and Sign in are where they were'
		},
		{ click: KEY, until: '() => window.__iaPrompts === 1', attempts: 12, label: 'press the key: the browser dialog opens' },
		{
			waitFor: `() => document.querySelector('${KEY}')?.dataset.installMode === 'menu'`,
			timeoutMs: 3000,
			label: 'declined: the key stays, pointing at the browser menu'
		},
		{
			evaluate: `() => { window.__iaLog.push('one press, prompt() called ' + window.__iaPrompts + ' time(s)'); window.__iaLog.push(document.querySelector('${KEY}')?.dataset.installMode === 'menu' ? 'the key stays, pointing at the browser menu' : 'KEY GONE OR WRONG MODE'); return window.__iaLog.join(' | '); }`
		},
		{ click: KEY, until: `() => !!document.querySelector('${CARD}')`, attempts: 12, label: 'press it again: the browser-menu card' },
		{
			evaluate: `async () => { const c = document.querySelector('${CARD}'); window.__iaLog.push(c && /Your browser can still install IDEA/.test(c.textContent) ? 'the card points at the browser menu' : 'NO MENU CARD'); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await new Promise((r) => setTimeout(r, 250)); window.__iaLog.push(document.querySelector('${CARD}') ? 'ESCAPE LEFT IT OPEN' : 'Escape shut it'); return window.__iaLog.join(' | '); }`,
			label: 'read the card, then Escape'
		},
		OFFER,
		{ waitFor: `() => document.querySelector('${KEY}')?.dataset.installMode === 'prompt'`, timeoutMs: 5000, label: 'a second offer: the key opens the dialog again' },
		{
			evaluate: `async () => { const k = document.querySelector('${KEY}'); const before = window.__iaPrompts; k.click(); k.click(); await new Promise((r) => setTimeout(r, 500)); window.__iaLog.push('two presses, prompt() called ' + (window.__iaPrompts - before) + ' more time(s)'); window.__iaLog.push(document.querySelector('${CARD}') ? 'A CARD OPENED UNDER THE DIALOG' : 'no card under the dialog'); return window.__iaLog.join(' | '); }`,
			label: 'two presses at once'
		},
		OFFER,
		{ waitFor: `() => !!document.querySelector('${KEY}')`, timeoutMs: 5000, label: 'a third offer: the key is back, for the measurements' }
	],
	presence: [
		{ selector: KEY, label: 'the Install app key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${KEY}[data-install-mode="prompt"]`, label: 'it opens the browser dialog (no card)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-install="card"]', label: 'no card while the key offers the dialog', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-install="popup"]', label: 'no phone pop-up on a desktop', expectPresent: 0, maxPresent: 0 },
		{ selector: '.legacy-index .signin', label: 'Sign in, beside it (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: KEY, label: 'the key carries its name at every width (visually hidden as an icon)', must: ['Install app'] }],
	tapTargets: [{ selector: KEY, label: 'the Install app key', min: 44 }],
	contrast: [{ selector: KEY, label: 'the key\'s ink on its face (the word, or the icon at 3:1)', min: 4.5 }],
	orderResult: [
		{
			label: 'the offer, the press, the second press',
			evaluate: '() => window.__iaLog',
			expected: [
				'no key before an offer',
				'offer taken by the page',
				'Take the tour and Sign in did not move when the key arrived',
				'one press, prompt() called 1 time(s)',
				'the key stays, pointing at the browser menu',
				'the card points at the browser menu',
				'Escape shut it',
				'offer taken by the page',
				'two presses, prompt() called 1 more time(s)',
				'no card under the dialog',
				'offer taken by the page'
			]
		},
		{
			label: 'where the key sits',
			evaluate: ROW_PROBE,
			expected: ['on the Take the tour row', 'overlaps nothing', 'answers at its centre', 'header does not scroll sideways']
		},
		{
			label: 'the key does not grow the header',
			evaluate: `() => [Math.abs(document.querySelector('.legacy-index header').getBoundingClientRect().height - window.__iaHeader) < 0.5 ? 'header height unchanged by the key' : 'HEADER ' + window.__iaHeader + ' -> ' + document.querySelector('.legacy-index header').getBoundingClientRect().height]`,
			expected: ['header height unchanged by the key']
		}
	]
};
