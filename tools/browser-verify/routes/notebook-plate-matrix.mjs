/**
 * THE NOTEBOOK'S FOURTH PLATE, CHOSEN (prompt 0119, report 29).
 *
 * `?plate=matrix` sets the notebook's OWN plate through the shipping setter
 * (`setNotebookTheme`), with the site theme OFF, so what is measured here is
 * the explicit Matrix row of the notebook's picker: `data-nb-theme="matrix"`
 * on `.nb-root` and `data-theme` absent from `<html>`. The sibling spec
 * `notebook-site-matrix.mjs` measures the OTHER way in -- the default plate
 * following the site theme -- against the same selectors, so the two rows
 * can be read side by side: the claim is that they paint the same values.
 *
 * EVERY NUMBER IS A CONTRAST READ OFF THE REAL RENDERED GROUND. A green-on-
 * black plate is exactly where contrast quietly fails, so the rows sweep the
 * inks this view actually paints on this plate: the head's privacy line and
 * chip words, the toolbar's tertiary count, the date group heading, a
 * control label, the check-in pick's meta line on the bare card AND on the
 * selected wash, and the composer's hint. The plate's six-ground table lives
 * in `src/lib/notebook/notebook-theme.css` beside the tokens and is pinned
 * by `tests/notebook-theme.test.ts`; this is the same claim measured in a
 * browser rather than computed.
 */
export default {
	path: '/dev/notebook?plate=matrix',
	label: 'Notebook on its own Matrix plate (data-nb-theme="matrix", site theme off)',
	prepare: [
		{
			waitFor: '() => !!document.querySelector(\'.pick:not(.free)[aria-pressed="true"]\')',
			timeoutMs: 15_000
		}
	],
	presence: [
		{ selector: '.nb-root[data-nb-theme="matrix"]', label: 'the notebook plate is matrix', expectPresent: 1, maxPresent: 1 },
		/* The site theme is OFF on this route: what is measured is the plate a
		   student CHOSE in the notebook, with nothing on <html>. */
		{ selector: 'html[data-theme]', label: 'site theme attribute (must be absent here)', expectPresent: 0 },
		{ selector: '[data-testid="nb-theme-toggle"][data-plate="matrix"]', label: 'the picker reports the matrix plate as painted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="nb-theme-toggle"][data-theme-state="matrix"]', label: 'the picker reports matrix as the CHOSEN state', expectPresent: 1, maxPresent: 1 }
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
