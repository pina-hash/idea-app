/**
 * THE NOTEBOOK UNDER SPACE WHITE, THE SITE'S LIGHT THEME (ledger 0297, package
 * F4a). Space White is scoped to the classroom, and the notebook lives there
 * now, so a student who turns it on gets a white notebook -- where until this
 * package the notebook was a dark island inside a white classroom. The
 * room's grounds and inks alias the Space White register, and the notebook-only
 * inks (the review grid's seven states, the folders, the status inks, brass)
 * are authored for these grounds in colors.css and pinned by
 * tests/notebook-theme.test.ts. The photo overlays stay dark (`.nb-island`),
 * which `notebook-state-corrector-site-space-white.mjs` measures.
 *
 * THE CONTRAST ROWS ARE THE SAME SELECTORS AS `notebook-site-matrix.mjs` and
 * `notebook-plate-matrix.mjs` (the default theme), so the three themes'
 * numbers read row for row.
 */
export default {
	path: '/dev/notebook?site=space-white',
	label: 'Notebook under Space White (the site theme reaches the notebook; no dark island)',
	prepare: [
		{
			waitFor: '() => !!document.querySelector(\'.pick:not(.free)[aria-pressed="true"]\')',
			timeoutMs: 15_000
		},
		{
			waitFor: '() => document.documentElement.getAttribute("data-theme") === "space-white"',
			timeoutMs: 5_000
		}
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'the site theme attribute is on <html>', expectPresent: 1, maxPresent: 1 },
		{ selector: '.nb-root', label: 'the notebook mounted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-nb-theme]', label: 'a plate attribute anywhere (must be absent)', expectPresent: 0 },
		{ selector: '[data-testid="nb-theme-toggle"]', label: 'the retired plate picker (must be absent)', expectPresent: 0 },
		/* NOT A DARK ISLAND. The room used to be one of Space White's islands and
		   kept the default look inside a white classroom; only the photo
		   overlays are now. */
		{ selector: '.nb-root.nb-island, .nb-root .nb-island', label: 'a dark island on the notebook at rest (must be absent)', expectPresent: 0 }
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
