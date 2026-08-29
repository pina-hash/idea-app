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
		{ selector: 'table.entry-table', label: 'spec tables (closed disclosures)', expectPresent: 1, expectVisible: 0 }
	],
	contrast: [{ selector: 'h1', label: 'h1 on its plate', min: 4.5 }],
	tapTargets: [{ selector: 'button', label: 'buttons', min: 44 }]
};
