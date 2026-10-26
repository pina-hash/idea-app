/** No list yet (ledger 0438): the start form, and nothing of a list. */
export default {
	path: '/dev/presentation-queue?state=empty',
	label: 'Presentation list not started: the start form',
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="pq-start"]')` }],
	presence: [
		{ selector: '[data-testid="pq-start"]', label: 'the start form', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="pq-up"]', label: 'a person up on no list', expectPresent: 0 },
		{ selector: '[data-testid="pq-close"]', label: 'Close on no list', expectPresent: 0 }
	],
	tapTargets: [{ selector: '[data-testid="pq-start-go"]', label: 'Start the list', min: 44 }]
};
