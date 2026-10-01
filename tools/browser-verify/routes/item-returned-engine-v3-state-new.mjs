/**
 * The same rule on a ported HTML worksheet (report R20, ledger 0360): the
 * stored rubric in parent chrome, after the work (the frame's `.engine-host`)
 * and closed. Before ledger 0297 a ported assignment showed no rubric at all;
 * 0297 put it above the frame, open.
 */
export default {
	path: '/dev/item-returned?engine=v3&state=new',
	label: 'A ported worksheet not yet started: the rubric after the work, closed',
	presence: [
		{ selector: '[data-testid="item-rubric"]', label: 'one "How this is graded" card', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="item-rubric"] [aria-expanded="false"]', label: 'closed on arrival', expectPresent: 1, maxPresent: 1 },
		{ selector: '.engine-host', label: 'the worksheet slot', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	domOrder: [
		{ before: '.engine-host', after: '[data-testid="item-rubric"]', label: 'the work, then the rubric' },
		{ before: '[data-testid="item-rubric"]', after: '.item-page > .page-footer', label: 'the rubric, then the footer' }
	],
	tapTargets: [
		{ selector: '[data-testid="item-rubric"] button[aria-expanded]', label: 'the rubric disclosure control', min: 44 }
	]
};
