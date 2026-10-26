// Ledger 0436, 0303: one team's plan, slipping two school days before its
// Design sign-off, with its timeline and today's check-in.
export default {
	path: '/dev/team-plan',
	label: 'Team plan (slipping team, timeline, check-in)',
	presence: [
		{ selector: '[data-testid="team-plan"]', label: 'the plan', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="team-plan"] button[data-kind="done"], [data-testid="team-plan"] .done-button', label: 'no done or turn-in button', expectPresent: 0 }
	]
};
