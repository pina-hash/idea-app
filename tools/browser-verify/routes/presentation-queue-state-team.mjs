/** A team list (ledger 0438): each entry a team with its members named under it. */
export default {
	path: '/dev/presentation-queue?state=team',
	label: 'Presentation list by team: the team up with its members',
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="pq-up"]')` }],
	presence: [
		{ selector: '[data-testid="pq-up"] .pq-members', label: 'the members of the team up', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid="pq-next"] li', label: 'the next team', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [{ selector: '[data-testid="pq-up"]', label: 'the team and its three members', must: ['Torque', 'Cho, Dan', 'Lim, Cara'] }],
	tapTargets: [{ selector: '[data-testid^="pq-mark-"]', label: 'the three marks', min: 44 }]
};
