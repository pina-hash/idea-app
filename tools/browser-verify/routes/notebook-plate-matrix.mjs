/**
 * A STUDENT WHOSE BROWSER STILL HOLDS THE MATRIX PLATE (generalized in ledger
 * 0297, package F4a, from "the notebook's fourth plate, chosen").
 *
 * This route used to set the notebook's OWN Matrix plate through its picker
 * and measure `data-nb-theme="matrix"`. The notebook has no plates any more:
 * it follows the site theme, and every id the retired picker wrote --
 * default, light, idea, matrix, and the older dark and system -- must answer
 * the site theme and be CLEARED, never throw and never paint a plate that is
 * gone. `?plate=matrix` now plants that stored id in this browser BEFORE the
 * notebook mounts (the harness's own initialisation), exactly the state such
 * a student arrives in, with the site theme at its default.
 *
 * THE WAIT IS THE ASSERTION. It holds only once the key is gone from storage,
 * so a notebook that stopped sweeping it prints FAILED here rather than
 * measuring a page that looks right. The rows after it say the plate painted
 * nothing: no plate attribute anywhere, no picker, no site attribute (the
 * default is an absence), and the default register's contrast on the inks
 * this view paints.
 */
export default {
	path: '/dev/notebook?plate=matrix',
	label: 'Notebook, a stored retired Matrix plate: answered by the site theme and cleared',
	prepare: [
		{
			waitFor: '() => !!document.querySelector(\'.pick:not(.free)[aria-pressed="true"]\')',
			timeoutMs: 15_000
		},
		{
			waitFor: '() => localStorage.getItem("idea_notebook_theme") === null',
			timeoutMs: 5_000
		}
	],
	presence: [
		{ selector: '.nb-root', label: 'the notebook mounted', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-nb-theme]', label: 'a plate attribute anywhere (must be absent)', expectPresent: 0 },
		{ selector: '[data-testid="nb-theme-toggle"]', label: 'the retired plate picker (must be absent)', expectPresent: 0 },
		{ selector: 'html[data-theme]', label: 'a site theme attribute (the default is an absence)', expectPresent: 0 },
		/* The classroom's own chrome is what the notebook sits under now. */
		{ selector: '.cr-root .cr-header', label: 'the classroom masthead', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: '[data-testid="nb-privacy"]', label: 'head privacy line (--text-2)', min: 4.5 },
		{ selector: '.nb-head .chip-meta', label: 'head chip meta words (--text-2 on card)', min: 4.5 },
		{ selector: '.nb-head .chip-key', label: 'head chip key word (brass)', min: 4.5 },
		{ selector: '.nb-head h1', label: 'title (--text-1)', min: 4.5 },
		{ selector: '.result-count', label: 'toolbar result count (--text-3)', min: 4.5 },
		{ selector: '.group-head', label: 'date group heading (--text-3)', min: 4.5 },
		{ selector: '.pick:not(.selected) .pick-meta', label: 'check-in pick meta on the recessed card (--text-3)', min: 4.5 },
		{ selector: '.pick.selected .pick-meta', label: 'check-in pick meta on the selected wash (--text-2)', min: 4.5 },
		{ selector: '.compose-card .hint', label: 'composer hint (--text-3)', min: 4.5 }
	],
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
