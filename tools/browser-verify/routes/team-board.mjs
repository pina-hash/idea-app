// Ledger 0436, 0306: the team board, four teams in three classes, one slipping
// two school days before its Design sign-off, and every machine's tagged
// tasks by day across all three classes.
export default {
	path: '/dev/team-board',
	label: 'Team board (burn-ups, flags, next sign-off, machines by day)',
	presence: [
		{ selector: '[data-testid="board-team"]', label: 'one card per team', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="board-team"] svg', label: 'one burn-up per team', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="board-slipping"]', label: 'Slipping on the three behind teams', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="board-machines"] tbody tr', label: 'only machines with tagged tasks', expectPresent: 3, maxPresent: 3 }
	],
	textContains: [
		{ selector: '[data-testid="board-next"]', label: 'next sign-off counted in school days', must: ['2 school days'] },
		{ selector: '[data-testid="board-machines"] tr[data-machine="router"] .tb-total', label: 'router uses equal the tags seeded', must: ['4'] }
	],
	contrast: [
		{ selector: '[data-testid="board-team"] .tb-name a', label: 'team names', min: 4.5 },
		{ selector: '[data-testid="board-slipping"]', label: 'a flag', min: 4.5 }
	]
};
