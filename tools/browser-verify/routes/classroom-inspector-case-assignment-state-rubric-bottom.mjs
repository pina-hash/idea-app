/**
 * A MANAGER GETS THE RUBRIC AT THE BOTTOM, CLOSED, TOO (report R20, a2fe2f8f,
 * ledger 0360). Mr. Pina filed it as the teacher: "it's always opened up
 * initially so you have to close it". Under ledger 0297 the card's collapse
 * signal was the student's own work, which a manager never has, so for a
 * teacher it never folded. It is constant-true now, for every role, and the
 * card is the last panel: after the read-only spec and before the footer.
 */
export default {
	path: '/dev/classroom-inspector?case=assignment&state=rubric-bottom',
	aliasOf: '/dev/classroom-inspector?case=assignment',
	label: 'Teacher view of an assignment: the rubric after the work, closed',
	presence: [
		{ selector: '[data-testid="item-rubric"]', label: 'one "How this is graded" card', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="item-rubric"] [aria-expanded="false"]', label: 'closed for a manager on arrival', expectPresent: 1, maxPresent: 1 },
		{ selector: '.engine-host', label: 'the read-only spec, the work slot', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	domOrder: [
		{ before: '.engine-host', after: '[data-testid="item-rubric"]', label: 'the work, then the rubric' },
		{ before: '[data-testid="item-rubric"]', after: '.item-page > .page-footer', label: 'the rubric, then the footer' }
	],
	tapTargets: [
		{ selector: '[data-testid="item-rubric"] button[aria-expanded]', label: 'the rubric disclosure control', min: 44 }
	]
};
