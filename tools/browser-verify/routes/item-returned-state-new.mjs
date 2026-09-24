/**
 * "How this is graded", before the work (ledger 0297, package ITEM). On a v1
 * assignment the rubric used to be the last card, below Submit (y 4884 of 5994
 * at 1366); a ported assignment had none in parent chrome. It now sits AFTER
 * the instructions and BEFORE the work surface: above the instructions was
 * tried and measured, and four leveled criteria open pushed the instructions
 * to y 1350 at 375.
 */
export default {
	path: '/dev/item-returned?state=new',
	label: 'An assignment not yet started: the rubric after the instructions, before the work',
	presence: [
		{ selector: '[data-testid="item-rubric"]', label: 'one "How this is graded" card', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="item-rubric"] [aria-expanded="true"]', label: 'open before the work has started', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="returned-grade"]', label: 'no returned card on work nobody handed in', expectPresent: 0 }
	],
	domOrder: [
		{ before: '[data-testid="item-body-disclosure"]', after: '[data-testid="item-rubric"]', label: 'instructions, then the rubric' },
		{ before: '[data-testid="item-rubric"]', after: '.engine-host', label: 'the rubric, then the work' }
	],
	tapTargets: [
		{ selector: '[data-testid="item-rubric"] button[aria-expanded]', label: 'the rubric disclosure control', min: 44 }
	],
	contrast: [{ selector: '[data-testid="item-rubric"] .criterion-text', label: 'a criterion name', min: 4.5 }]
};
