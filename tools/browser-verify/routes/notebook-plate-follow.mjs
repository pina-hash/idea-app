/**
 * THE NOTEBOOK'S DEFAULT PLATE FOLLOWING THE SITE THEME (prompt 0119, report
 * 29): nothing chosen in the room, `data-theme="matrix"` on <html>, and the
 * notebook is the site theme's own register -- painted by the cascade from
 * that one attribute, with the picker saying so in words.
 *
 * THE ATTRIBUTE IS WRITTEN BY HAND HERE, AND THAT IS STATED RATHER THAN
 * HIDDEN. `ThemeRoot` writes it only while a session holds, and this harness
 * holds none, so the shipping switch cannot reach this state on a /dev route.
 * What IS the shipping mechanism -- the stylesheet selector and the picker's
 * MutationObserver reading the attribute back -- is exactly what a
 * hand-written attribute exercises. `themes-state-matrix.mjs` is where the
 * switch itself is proven.
 */
export default {
	path: '/dev/notebook?plate=follow',
	label: 'Notebook DEFAULT plate under the site Matrix theme (0119): follows the site, and the picker says so',
	prepare: [
		{
			evaluate: `() => { localStorage.removeItem('idea_notebook_theme'); document.documentElement.setAttribute('data-theme', 'matrix'); }`,
			label: 'no plate chosen in the room; the site attribute ThemeRoot would write, written by hand (no session here)'
		},
		{
			waitFor: `() => document.querySelector('[data-testid="nb-theme-toggle"]')?.getAttribute('data-theme-showing') === 'matrix' && document.querySelector('[data-testid="nb-theme-toggle"]')?.getAttribute('data-theme-state') === 'default'`,
			label: 'the picker read the attribute back: stored default, showing matrix',
			timeoutMs: 10_000
		},
		/* The free-entry pick FIRST: it is a pointerdown outside the menu, and
		   the menu dismisses on one -- opened before it, the rows below would
		   be measured against a closed menu (they were, once). */
		{
			click: '.pick.free',
			until: '() => document.querySelector(".pick.free").getAttribute("aria-pressed") === "true"'
		},
		{
			click: '[data-testid="nb-theme-toggle"]',
			until: `() => (document.querySelector('[data-testid="nb-theme-note-default"]')?.textContent ?? '').includes('Following the site theme')`,
			label: 'open the menu LAST: the Default row explains it is following the site, and the rows stay open to be measured'
		}
	],
	presence: [
		/* The room carries NO attribute of its own: the follow is the cascade's. */
		{ selector: '.nb-root[data-nb-theme]', label: 'a notebook plate attribute (there is none: the default is what follows)', expectPresent: 0 },
		{ selector: 'html[data-theme="matrix"] .nb-root', label: 'the room under the site attribute', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="nb-theme-option-default"][aria-checked="true"]', label: 'Default is the checked row', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: '.entry .row-title', label: 'follow: entry titles (worst is the untitled row: --text-3 on the page ground)', min: 4.5 },
		{ selector: '.entry .stamp', label: 'follow: entry meta stamps (the authored faint tier)', min: 4.5 },
		{ selector: '.bar-note', label: 'follow: privacy note', min: 4.5 },
		{ selector: '.nb-theme-picker .option.current .note', label: 'follow: the "Following the site theme" note on the current row\'s wash', min: 4.5 },
		{ selector: '.nb-theme-picker .option:not(.current) .note', label: 'follow: the other rows\' notes (--text-3 on the menu surface)', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.nb-theme-picker .option', label: 'the four plate rows, menu open', min: 44 }
	],
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
