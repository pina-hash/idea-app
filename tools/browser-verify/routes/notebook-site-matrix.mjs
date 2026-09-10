/**
 * THE NOTEBOOK'S DEFAULT PLATE, FOLLOWING THE SITE THEME (prompt 0119,
 * report 29). This is the route that answers the brief's own sentence: "a
 * student who picks matrix on the site does not get it in the notebook".
 *
 * `?site=matrix` writes the SITE theme's attribute onto <html> (the dev page
 * does it; ThemeRoot gates the real write on a session this page has none of)
 * and leaves the notebook on its DEFAULT plate -- no `data-nb-theme` on
 * `.nb-root` at all. Everything that changes colour on this route therefore
 * changes through ONE CSS rule, `:root[data-theme='matrix'] .nb-root:not
 * ([data-nb-theme])` in notebook-theme.css, with no JavaScript in the
 * notebook having read the site theme. The picker trigger's `data-plate`
 * reads `matrix` while its `data-theme-state` reads `default`: painted one
 * way, chosen the other, and both are asserted.
 *
 * THE CONTRAST ROWS ARE THE SAME SELECTORS AS `notebook-plate-matrix.mjs`.
 * A reader compares the two routes' numbers row for row; the claim is that
 * they are identical, because the two selectors share one declaration block.
 */
export default {
	path: '/dev/notebook?site=matrix',
	label: 'Notebook default plate under the SITE Matrix theme (data-theme on html, no data-nb-theme)',
	prepare: [
		{
			waitFor: '() => !!document.querySelector(\'.pick:not(.free)[aria-pressed="true"]\')',
			timeoutMs: 15_000
		},
		/* The attribute is written by the page's own effect after ThemeRoot's;
		   wait for it rather than assuming the order held. */
		{
			waitFor: '() => document.documentElement.getAttribute("data-theme") === "matrix"',
			timeoutMs: 5_000
		}
	],
	presence: [
		{ selector: 'html[data-theme="matrix"]', label: 'the site theme attribute is on <html>', expectPresent: 1, maxPresent: 1 },
		{ selector: '.nb-root:not([data-nb-theme])', label: 'the notebook is on its DEFAULT plate (no data-nb-theme)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.nb-root[data-nb-theme]', label: 'no explicit notebook plate (must be absent)', expectPresent: 0 },
		{ selector: '[data-testid="nb-theme-toggle"][data-plate="matrix"]', label: 'the picker reports MATRIX as painted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="nb-theme-toggle"][data-theme-state="default"]', label: 'the picker reports DEFAULT as chosen', expectPresent: 1, maxPresent: 1 },
		/* THE NAME CARRIES THE PAINTED PLATE, and this row is what proves the
		   picker is reading `<html data-theme>` rather than the preference
		   store. The two are different questions -- the store is what a student
		   chose, the attribute is what ThemeRoot's session gate decided -- and
		   a store-fed picker told a student "Following the site theme: the same
		   surfaces as your classes" against a black notebook (measured in
		   Chromium with the attribute set and the store untouched, which is
		   what a signed-out page is). `data-plate` above says the same thing to
		   a machine; this says it to a person. */
		{ selector: '[data-testid="nb-theme-toggle"][aria-label="Appearance: Default, showing Matrix"]', label: 'the picker NAMES the painted plate to a reader', expectPresent: 1, maxPresent: 1 },
		/* No rain in this room: the classroom hides the shell's `.bg-fx` and so
		   does the notebook, and the room is opaque. A canvas here would be the
		   site theme reaching into a room it does not own. */
		{ selector: '.bg-fx canvas', label: 'matrix rain canvas (must be absent in the notebook)', expectPresent: 0 }
	],
	contrast: [
		{ selector: '[data-testid="nb-privacy"]', label: 'head privacy line (--text-2)', min: 4.5 },
		{ selector: '.nb-head .chip-meta', label: 'head chip meta words (--text-2 on card)', min: 4.5 },
		{ selector: '.nb-head .chip-key', label: 'head chip key word (brass on card)', min: 4.5 },
		{ selector: '.nb-head h1', label: 'title (--text-1)', min: 4.5 },
		{ selector: '.result-count', label: 'toolbar result count (--text-3)', min: 4.5 },
		{ selector: '.group-head', label: 'date group heading (--text-3)', min: 4.5 },
		{ selector: '.tools .tool-btn', label: 'toolbar control label (--text-2 on card)', min: 4.5 },
		{ selector: '.chips .chip-toggle', label: 'filter chip label (--text-2 on card)', min: 4.5 },
		{ selector: '.pick:not(.selected) .pick-meta', label: 'check-in pick meta on the recessed card (--text-3)', min: 4.5 },
		{ selector: '.pick.selected .pick-meta', label: 'check-in pick meta on the selected wash (--text-2)', min: 4.5 },
		{ selector: '.compose-card .hint', label: 'composer hint (--text-3)', min: 4.5 },
		{ selector: '.compose-card .inline-link', label: 'prose link (brass)', min: 4.5 },
		{ selector: '.nb-theme-word', label: 'the picker trigger word on the masthead band', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="nb-theme-toggle"]', label: 'the plate picker trigger', min: 44 }
	],
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
