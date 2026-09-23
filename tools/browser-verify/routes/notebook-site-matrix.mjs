/**
 * THE NOTEBOOK UNDER THE SITE'S MATRIX THEME (generalized in ledger 0297,
 * package F4a, from "the default plate following the site theme").
 *
 * There is one way in now, not two: the notebook has no plate of its own, so
 * what changes colour here changes because `<html data-theme="matrix">` is
 * set -- the room's grounds and inks alias the site register, and the few
 * notebook-only tokens are authored for this theme in colors.css. `?site=`
 * writes the attribute (the dev page does it; ThemeRoot gates the real write
 * on a session this page has none of).
 *
 * THE CONTRAST ROWS ARE THE SAME SELECTORS AS `notebook-site-space-white.mjs`
 * and `notebook-plate-matrix.mjs` (the default theme), so the three themes'
 * numbers read row for row.
 */
export default {
	path: '/dev/notebook?site=matrix',
	label: 'Notebook under the SITE Matrix theme (data-theme on html, no plate of its own)',
	prepare: [
		{
			waitFor: '() => !!document.querySelector(\'.pick:not(.free)[aria-pressed="true"]\')',
			timeoutMs: 15_000
		},
		{
			waitFor: '() => document.documentElement.getAttribute("data-theme") === "matrix"',
			timeoutMs: 5_000
		}
	],
	presence: [
		{ selector: 'html[data-theme="matrix"]', label: 'the site theme attribute is on <html>', expectPresent: 1, maxPresent: 1 },
		{ selector: '.nb-root', label: 'the notebook mounted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-nb-theme]', label: 'a plate attribute anywhere (must be absent)', expectPresent: 0 },
		{ selector: '[data-testid="nb-theme-toggle"]', label: 'the retired plate picker (must be absent)', expectPresent: 0 },
		/* THE NOTEBOOK'S GROUND IS OPAQUE UNDER MATRIX, AND THAT IS AN OPEN
		   QUESTION RATHER THAN A RULE. The classroom lets the rain through its
		   gutters; whether the notebook should, now that it lives in the
		   classroom, is Mr. Pina's call (themes/matrix.css records it). What is
		   measured is that no rain canvas exists on this page. */
		{ selector: '.bg-fx canvas', label: 'matrix rain canvas (absent on this page)', expectPresent: 0 }
	],
	contrast: [
		{ selector: '[data-testid="nb-privacy"]', label: 'head privacy line (--text-2)', min: 4.5 },
		{ selector: '.nb-head .chip-meta', label: 'head chip meta words (--text-2 on card)', min: 4.5 },
		{ selector: '.nb-head .chip-key', label: 'head chip key word (brass on card)', min: 4.5 },
		{ selector: '.nb-head h1', label: 'title (--text-1)', min: 4.5 },
		{ selector: '.result-count', label: 'toolbar result count (--text-3)', min: 4.5 },
		{ selector: '.group-head', label: 'date group heading (--text-3)', min: 4.5 },
		{ selector: '.tools .tool-btn', label: 'toolbar control label (--text-2 on card)', min: 4.5 },
		{ selector: '[data-testid="nb-filters-toggle"] .disc-label', label: 'folders-and-filters trigger word', min: 4.5 },
		{ selector: '[data-testid="nb-filters-summary"]', label: 'folders-and-filters summary (what is set)', min: 4.5 },
		{ selector: '.pick:not(.selected) .pick-meta', label: 'check-in pick meta on the recessed card (--text-3)', min: 4.5 },
		{ selector: '.pick.selected .pick-meta', label: 'check-in pick meta on the selected wash (--text-2)', min: 4.5 },
		{ selector: '.compose-card .hint', label: 'composer hint (--text-3)', min: 4.5 },
		{ selector: '.compose-card .inline-link', label: 'prose link (brass)', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="nb-filters-toggle"]', label: 'folders-and-filters trigger', min: 44 }],
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
