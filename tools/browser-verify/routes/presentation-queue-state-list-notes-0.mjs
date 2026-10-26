/** The other direction of presentation-queue-state-list.mjs: no feedback transport, no notes box. */
export default {
	path: '/dev/presentation-queue?state=list&notes=0',
	label: 'Presentation list with no notes transport: no notes box, the marks still there',
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="pq-up"]')` }],
	presence: [
		{ selector: '[data-testid="pq-note"]', label: 'a notes box with nowhere to save it', expectPresent: 0 },
		{ selector: '[data-testid="pq-note-save"]', label: 'Save note', expectPresent: 0 },
		{ selector: '[data-testid^="pq-mark-"]', label: 'Presented, Absent and Redo', expectPresent: 3, maxPresent: 3, expectVisible: 3, maxVisible: 3 }
	],
	tapTargets: []
};
