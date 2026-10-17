/**
 * THE INSTALL APP KEY IN THE HOME HEADER (ledger 0396): the steps and probes
 * its specs share. `_`-prefixed, so the route loader skips it (routes.mjs).
 *
 * THE DEVICE IS THE HARNESS'S `?ua=` AND `?display=standalone`. This
 * container's Chromium cannot emulate `display-mode` (a CDP emulation is
 * accepted and does nothing, measured) and a route spec cannot set a user
 * agent, so `/dev/home-order` overrides `navigator.userAgent`,
 * `navigator.maxTouchPoints` and `matchMedia` in its own script, during
 * hydration, before anything under it reads them. `$lib/install-app` then
 * reads them exactly as it would on a real phone.
 *
 * THE BROWSER'S OFFER IS A SYNTHETIC `beforeinstallprompt`, dispatched on
 * `window` the way Chromium dispatches it, with a `prompt()` that counts its
 * calls into `window.__iaPrompts`. It is caught by the one listener there is,
 * the inline script in `src/app.html`, so the spec drives the real capture,
 * the real mailbox and the real key.
 */

/** The harness strip is not the page: fixed over the header, and absent on `/`. */
export const HIDE_STRIP = {
	evaluate: `() => { let t = document.getElementById('ia-hide-strip'); if (!t) { t = document.createElement('style'); t.id = 'ia-hide-strip'; t.textContent = '.harness-strip { display: none !important; }'; document.head.appendChild(t); } return 'harness strip hidden'; }`,
	label: 'hide the harness strip (it is not on /)'
};

/**
 * A signed-out first visit gets the orientation tour, whose backdrop takes
 * every tap. Close it the way a visitor would (its own X), and only call the
 * page settled once the app has hydrated (the install mailbox is wired) and no
 * tour has appeared for a full second, because the tour mounts after paint.
 */
export const CLOSE_TOUR = {
	waitFor: `() => {
		const x = document.querySelector('[data-testid="tour-close"]');
		if (x) { x.click(); window.__iaQuiet = 0; return false; }
		if (typeof window.__ideaInstall?.notify !== 'function') return false;
		window.__iaQuiet = (window.__iaQuiet || 0) + 1;
		return window.__iaQuiet >= 10;
	}`,
	timeoutMs: 30000,
	label: 'the app has hydrated and no orientation tour is over the header'
};

/** Chromium's offer, as Chromium dispatches it. Logs whether the page took it. */
export const OFFER = {
	evaluate: `() => {
		const e = new Event('beforeinstallprompt', { cancelable: true });
		window.__iaPrompts = window.__iaPrompts || 0;
		e.prompt = () => { window.__iaPrompts++; return new Promise((r) => setTimeout(() => r({ outcome: 'dismissed', platform: 'web' }), 120)); };
		e.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
		window.dispatchEvent(e);
		(window.__iaLog = window.__iaLog || []).push(e.defaultPrevented ? 'offer taken by the page' : 'OFFER NOT TAKEN');
		return 'beforeinstallprompt dispatched, defaultPrevented ' + e.defaultPrevented;
	}`,
	label: 'Chromium offers to install (a synthetic beforeinstallprompt)'
};

export const KEY = '.legacy-index header [data-install="key"]';
export const CARD = '[data-install="card"]';

/** Where the key sits against its neighbours, in words, for `orderResult`. */
export const ROW_PROBE = `() => {
	const header = document.querySelector('.legacy-index header');
	const key = document.querySelector('[data-install="key"]');
	if (!key) return ['NO KEY'];
	const k = key.getBoundingClientRect();
	const tour = document.querySelector('.legacy-index .tour-link').getBoundingClientRect();
	const others = [...header.querySelectorAll('.header-left, .header-tools > *, .auth-block')].filter((el) => el !== key && el.getClientRects().length);
	const overlap = others.some((el) => {
		const r = el.getBoundingClientRect();
		return Math.min(k.right, r.right) - Math.max(k.left, r.left) > 0.5 && Math.min(k.bottom, r.bottom) - Math.max(k.top, r.top) > 0.5;
	});
	const hit = document.elementFromPoint(k.x + k.width / 2, k.y + k.height / 2);
	return [
		Math.abs((k.top + k.bottom) / 2 - (tour.top + tour.bottom) / 2) < 2 ? 'on the Take the tour row' : 'ANOTHER ROW',
		overlap ? 'OVERLAPS A NEIGHBOUR' : 'overlaps nothing',
		hit && key.contains(hit) ? 'answers at its centre' : 'COVERED',
		header.scrollWidth - header.clientWidth <= 0 ? 'header does not scroll sideways' : 'HEADER OVERFLOWS'
	];
}`;

/**
 * THE KEY AND ITS CARD UNDER EACH SITE THEME, signed in (a theme applies only
 * to a session): a student with one class, on an iPhone, so the header carries
 * the class chip, the key, Take the tour, the quick note and the profile menu,
 * and the card can be opened. The theme is reached through the profile menu's
 * own rows (`reach` in ./_home-theme.mjs), so the application put it on <html>.
 * Every text row is gated at 4.5:1 on a monitor in all three themes: the key
 * and the card are new, so there is no look to leave as it was.
 */
export const installThemeSpec = (theme, reach, SETTLE_ENTRANCE) => ({
	path: `/dev/home-order?role=student&classes=1&rows=3&ua=iphone&theme=${theme}`,
	label: `Install app key and its card under the ${theme} theme, signed in, on an iPhone`,
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150, label: 'settle the entrance' },
		HIDE_STRIP,
		CLOSE_TOUR,
		...reach(theme),
		{ waitFor: `() => document.querySelector('${KEY}')?.dataset.installMode === 'ios'`, timeoutMs: 5000, label: 'the key is there, in its iPhone mode' },
		{ click: KEY, until: `() => !!document.querySelector('${CARD}')`, attempts: 12, label: 'press the key: the card opens' }
	],
	presence: [
		theme === 'idea'
			? { selector: 'html[data-theme]', label: 'no theme attribute on <html>', expectPresent: 0, maxPresent: 0 }
			: { selector: `html[data-theme="${theme}"]`, label: `the ${theme} attribute is on <html>`, expectPresent: 1, maxPresent: 1 },
		{ selector: KEY, label: 'the Install app key', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: CARD, label: 'the Share card, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.legacy-index .class-chip', label: 'the class chip beside it (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [
		{ selector: KEY, label: 'the Install app key', min: 44 },
		{ selector: `${CARD} .ia-close`, label: 'the card\'s Close key', min: 44 }
	],
	contrast: [
		{ selector: KEY, label: 'the key\'s ink on its face', min: 4.5 },
		{ selector: '.legacy-index .class-chip', label: 'the class chip beside it', min: 4.5 },
		{ selector: `${CARD} .ia-card-title`, label: 'card title', min: 4.5 },
		{ selector: `${CARD} .ia-card-body`, label: 'card sentence', min: 4.5 },
		{ selector: `${CARD} .ia-close`, label: 'card Close key', min: 4.5 },
		/* ON THE WALL (PROJECTOR_MODEL in ../checks.mjs), gated for Space White,
		   the theme that exists for the projector, and recorded for the other
		   two, the rule ./_home-theme.mjs states. The sentence and the keys are
		   body copy (4.5 washed); the card's title is an accent label (3.0). */
		{ selector: `${KEY}, ${CARD} .ia-card-body, ${CARD} .ia-close`, label: `on the wall: the key, the sentence, Close (4.5 washed)${theme === 'space-white' ? '' : ' [recorded, not gated]'}`, min: theme === 'space-white' ? 4.5 : 0, projector: true },
		{ selector: `${CARD} .ia-card-title`, label: `on the wall: the card title (3.0 washed)${theme === 'space-white' ? '' : ' [recorded, not gated]'}`, min: theme === 'space-white' ? 3 : 0, projector: true }
	],
	orderResult: [
		{ label: 'where the key sits', evaluate: ROW_PROBE, expected: ['on the Take the tour row', 'overlaps nothing', 'answers at its centre', 'header does not scroll sideways'] },
		{
			label: 'the card is inside the window, under the key',
			evaluate: `() => { const c = document.querySelector('${CARD}').getBoundingClientRect(); const k = document.querySelector('${KEY}').getBoundingClientRect(); return [c.left >= 0 && c.right <= innerWidth + 0.5 ? 'card inside the window' : 'CARD OFF SCREEN', c.top >= k.bottom ? 'card below the key' : 'CARD NOT BELOW THE KEY']; }`,
			expected: ['card inside the window', 'card below the key']
		},
		{
			label: 'the class chip is cut with an ellipsis, never run under its neighbour',
			evaluate: `() => { const t = document.querySelector('.legacy-index .class-chip-text'); const cs = getComputedStyle(t); return [cs.textOverflow === 'ellipsis' && cs.overflow === 'hidden' ? 'chip ends in an ellipsis when short of room' : 'CHIP NOT ELLIPSIZED', document.querySelector('.legacy-index .class-chip').getAttribute('title') ? 'its whole name in title' : 'NO TITLE']; }`,
			expected: ['chip ends in an ellipsis when short of room', 'its whole name in title']
		}
	]
});
