/**
 * THE NOTEBOOK'S MATRIX PLATE, CHOSEN IN THE ROOM (prompt 0119, report 29).
 *
 * Reached through the SHIPPING control -- the masthead picker -- rather than
 * by writing the attribute or the storage key, so a run that comes back green
 * is a run in which the room's own control put it into this state. Then the
 * inks the plate AUTHORS (the faint tier, the accent, the folder colours, the
 * bar note) are measured on the grounds they actually composite over, which
 * is the only place a `color-mix()` or a wash can be measured at all; the
 * hex-over-hex arithmetic is `tests/notebook-theme.test.ts`'s and the two
 * are meant to agree.
 *
 * The site attribute is deliberately ABSENT here: this is the divergence
 * half of the brief (a student choosing Matrix for the notebook alone), and
 * `notebook-plate-follow.mjs` is the parity half.
 */
export default {
	path: '/dev/notebook?plate=matrix',
	label: 'Notebook on its MATRIX plate, chosen from the masthead picker (0119): the authored inks, measured on the plate',
	prepare: [
		{
			click: '[data-testid="nb-theme-toggle"]',
			until: `() => !!document.querySelector('[data-testid="nb-theme-option-matrix"]')`,
			label: 'open the appearance menu'
		},
		{
			click: '[data-testid="nb-theme-option-matrix"]',
			until: `() => document.querySelector('.nb-root')?.getAttribute('data-nb-theme') === 'matrix' && localStorage.getItem('idea_notebook_theme') === 'matrix' && document.querySelector('[data-testid="nb-theme-toggle"]')?.getAttribute('data-theme-showing') === 'matrix'`,
			label: 'pick Matrix: the attribute, the stored key and the trigger word all say so'
		},
		/* The free-entry pick, as notebook.mjs does, so the title hint renders. */
		{
			click: '.pick.free',
			until: '() => document.querySelector(".pick.free").getAttribute("aria-pressed") === "true"'
		},
	],
	presence: [
		{ selector: '.nb-root[data-nb-theme="matrix"]', label: 'the matrix plate is on the room', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="nb-theme-toggle"][data-theme-showing="matrix"][data-theme-state="matrix"]', label: 'the trigger reports matrix as both stored and showing', expectPresent: 1 },
		/* No site attribute: this is the room's own choice, not a follow. */
		{ selector: 'html[data-theme]', label: 'a site theme attribute (there is none: the room chose this on its own)', expectPresent: 0 }
	],
	contrast: [
		/* `.row-title` exists on BOTH card variants (the phone's `full` card and
		   the pane's `row`); the worst match is the untitled entry, whose title
		   is the faint tier on purpose, so this row measures --text-3 on the
		   page ground as well as --text-1. The folder COLOURS as text appear
		   only in the row variant, so they are arithmetic in
		   tests/notebook-theme.test.ts rather than a row that matches nothing
		   at 375. */
		{ selector: '.entry .row-title', label: 'matrix: entry titles (worst is the untitled row: --text-3 on the page ground)', min: 4.5 },
		{ selector: '.entry .stamp', label: 'matrix: entry meta stamps (--text-3, the AUTHORED faint tier)', min: 4.5 },
		{ selector: '.bar-note', label: 'matrix: privacy note (--text-2)', min: 4.5 },
		{ selector: '.nb-bar .chip-btn', label: 'matrix: the check-ins chip (the accent as text)', min: 4.5 },
		{ selector: '.compose-card .hint', label: 'matrix: title hint on the card', min: 4.5 },
		{ selector: '.tab.selected .name', label: 'matrix: the selected folder chip name on the accent wash', min: 4.5 },
		{ selector: '.pick.selected .pick-meta', label: 'matrix: muted copy on the selected pick (--text-2 on the wash)', min: 4.5 },
		{ selector: '.nb-theme-word', label: 'matrix: the picker trigger word on the masthead band', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="nb-theme-toggle"]', label: 'the appearance trigger', min: 44 }
	],
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
