import base from './notebook-scope-class.mjs';

/**
 * A CLASS'S NOTEBOOK TAB FOR A STUDENT, UNDER SPACE WHITE (ledger 0297,
 * package F4a). Mr. Pina's words of 2026-09-23 are the reason this row exists:
 * "visually and functionally the IDEA notebook should follow IDEA Classroom,
 * not the other way around." Under Space White the classroom is white, so the
 * notebook tab inside it is white too -- same masthead, same tokens.
 */
export default {
	...base,
	path: '/dev/notebook?scope=class&site=space-white',
	label: "A class's Notebook tab, student, under Space White",
	prepare: [
		{
			waitFor: '() => document.documentElement.getAttribute("data-theme") === "space-white"',
			timeoutMs: 5_000
		},
		...base.prepare
	],
	contrast: [
		...base.contrast,
		{ selector: '.pick:not(.selected) .pick-meta', label: 'check-in pick meta on the recessed card (--text-3)', min: 4.5 },
		{ selector: '.pick.selected .pick-meta', label: 'check-in pick meta on the selected wash (--text-2)', min: 4.5 },
		{ selector: '[data-testid="nb-filing-manage-folders"]', label: 'Manage folders (brass, a box where it was a prose link)', min: 4.5 }
	]
};
