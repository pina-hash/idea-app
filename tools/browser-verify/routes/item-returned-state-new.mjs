/**
 * "How this is graded", at the bottom and closed (report R20, a2fe2f8f, ledger
 * 0360). Ledger 0297 moved the rubric from the last card below Submit (y 4884
 * of 5994 at 1366) to after the instructions and BEFORE the work, open; Mr.
 * Pina found that a long scroll past four open leveled criteria to reach the
 * work, closed by hand on every visit, and asked for it at the bottom and not
 * open by default. It is the last panel now, after the work and before the
 * footer, with its trigger on the page and its region in the DOM.
 * `item-returned-state-new-open-rubric` opens it and reads the criteria.
 */
export default {
	path: '/dev/item-returned?state=new',
	label: 'An assignment not yet started: the rubric after the work, closed',
	presence: [
		{ selector: '[data-testid="item-rubric"]', label: 'one "How this is graded" card', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="item-rubric"] [aria-expanded="false"]', label: 'closed on arrival', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="item-rubric"] .criterion-text', label: 'the criteria still in the DOM, not shown', expectPresent: 4, expectVisible: 0, maxVisible: 0 },
		{ selector: '[data-testid="returned-grade"]', label: 'no returned card on work nobody handed in', expectPresent: 0 }
	],
	domOrder: [
		{ before: '[data-testid="item-body-disclosure"]', after: '.engine-host', label: 'instructions, then the work' },
		{ before: '.engine-host', after: '[data-testid="item-rubric"]', label: 'the work, then the rubric' },
		{ before: '[data-testid="item-rubric"]', after: '.item-page > .page-footer', label: 'the rubric, then the footer' }
	],
	tapTargets: [
		{ selector: '[data-testid="item-rubric"] button[aria-expanded]', label: 'the rubric disclosure control', min: 44 }
	],
	contrast: [{ selector: '[data-testid="item-rubric-disclosure"] .disc-label', label: 'the "How this is graded" label', min: 4.5 }]
};
