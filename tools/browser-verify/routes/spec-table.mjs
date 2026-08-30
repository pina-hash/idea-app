// original array position 2 of 25 -- see ../README.md for what `order` means
export const order = 2;

export default {
	path: '/dev/spec-table',
	label: 'Spec table harness',
	presence: [
		{ selector: 'h1', label: 'page heading', expectPresent: 1 },
		/* A closed Disclosure keeps its region in the DOM at a zero box on
		   purpose (CLAUDE.md: hidden in CSS, never removed), so present > 0
		   with visible 0 is the CORRECT reading of a closed panel. */
		/* BOTH HALVES WERE FLOORS AND NEITHER MEASURED THE SENTENCE ABOVE.
		   `present >= 1` passed on the 2 tables actually rendered, and
		   `visible >= 0` -- the whole claim of this row -- passed on any number
		   of open panels. `maxVisible: 0` is the claim; `maxPresent: 2` is the
		   fixture, and it is the same 2 `/dev/spec-table-open` asserts. */
		{ selector: 'table.entry-table', label: 'spec tables (closed disclosures)', expectPresent: 2, maxPresent: 2, expectVisible: 0, maxVisible: 0 }
	],
	contrast: [{ selector: 'h1', label: 'h1 on its plate', min: 4.5 }],
	tapTargets: [{ selector: 'button', label: 'buttons', min: 44 }]
};
