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
	/* `tapTargets` STAYS EMPTY, AND THE MEASUREMENT SAYS WHY. A row pointed at
	   `textarea.cell` here reports `20 matched, 0 visible/measurable` at both
	   widths: the prepare step opens the FIRST closed disclosure, which is the
	   read-only mount, so the 20 editable cells are all inside the panel that
	   is still shut. The cells are measured on `/dev/spec-table?empty=1`, where
	   the editable table arrives open. A row that cannot measure its selector
	   is the thing this file's own prose warns about one comment up -- it reads
	   like coverage and is a permanent unanswerable. */
	tapTargets: [],
	/* The read-only table's column tips ARE visible here, and they are the same
	   `.tap-reach-44` control inside the same clipping `.table-scroll` -- so
	   this is a second, independently-mounted measurement of the reach that was
	   34.5px until 2026-09-05. Measured 45px at both widths. */
	tapReach: [{ selector: 'button.info-tip-trigger', label: 'column tip triggers (reach, not box)', min: 44 }]
};
