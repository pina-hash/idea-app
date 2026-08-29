// original array position 3 of 25 -- see ../README.md for what `order` means
export const order = 3;

export default {
	path: '/dev/spec-table-open',
	label: 'Spec table harness, disclosures opened',
	aliasOf: '/dev/spec-table',
	/* Assert the EFFECT wanted (a table with height), not a proxy for it.
	   The first predicate here read aria-expanded on one named button and
	   reported FAILED through twelve attempts that had in fact opened both
	   regions -- a true reading of the wrong thing. */
	prepare: [
		{
			click: 'button[aria-expanded="false"]',
			until: '() => { const t = document.querySelector("table.entry-table"); return !!t && t.getBoundingClientRect().height > 0; }',
			attempts: 6,
			waitMs: 300
		}
	],
	presence: [{ selector: 'table.entry-table', label: 'spec tables (opened)', expectPresent: 2, expectVisible: 1 }],
	contrast: [{ selector: 'table.entry-table td', label: 'table cell copy', min: 4.5 }],
	tapTargets: []
};
