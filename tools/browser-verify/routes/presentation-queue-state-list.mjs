/**
 * PRESENTATION CHECK-OFF FROM THE PHONE (ledger 0438): who is up, the three
 * marks, the notes box and the rubric, at 375 first. The harness opens with
 * two students done (one Presented, one Absent), so the Done lane is drawn.
 */
export default {
	path: '/dev/presentation-queue?state=list',
	label: 'Presentation list: up now, Presented / Absent / Redo, notes and the rubric',
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="pq-up"]')` }],
	presence: [
		{ selector: '[data-testid="pq-up"]', label: 'the person up now', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid^="pq-mark-"]', label: 'Presented, Absent and Redo', expectPresent: 3, maxPresent: 3, expectVisible: 3, maxVisible: 3 },
		{ selector: '[data-testid="pq-note"]', label: 'the notes box', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="pq-rubric"]', label: 'the rubric', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="pq-done"] li', label: 'the two done', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="pq-start"]', label: 'the start form on a list that exists', expectPresent: 0 }
	],
	tapTargets: [
		{ selector: '[data-testid^="pq-mark-"]', label: 'the three marks', min: 44 },
		{ selector: '.pq-key', label: 'Start, Undo and move keys', min: 44 },
		{ selector: '[data-testid="pq-note-save"]', label: 'Save note', min: 44 }
	]
};
