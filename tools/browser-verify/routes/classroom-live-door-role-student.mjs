/**
 * THE CLASS PAGE AS A STUDENT READS IT (ledger 0297): no Live door (it is a
 * teacher's), the hall pass in the student word, and the posted draw with the
 * student's own team first, in the team's colours, as names. The positive
 * control for the door's absence is the teacher spec beside this one.
 */
export default {
	path: '/dev/classroom-live-door?role=student',
	label: 'Class page as a student: their team, no door',
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="class-team-mine"]')`, timeoutMs: 20000 }],
	orderResult: [
		{
			label: 'their own team, by name and members',
			evaluate: `() => [document.querySelector('[data-testid="class-team-mine"] .ct-name').textContent.trim(), ...[...document.querySelectorAll('[data-testid="class-team-mine"] li')].map((l) => l.textContent.trim())]`,
			expected: ['Torque Squad', 'Ana Reyes', 'Ben Okafor', 'Cruz Delgado']
		}
	],
	presence: [
		{ selector: '[data-testid="live-door"]', label: 'no Live door for a student', expectPresent: 0 },
		{ selector: '[data-testid="class-team-mine"]', label: 'their own team', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-teams-board"]', label: 'the whole draw one tap away', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="class-teams"]', label: 'names, never addresses', must: ['Your team', 'Lab pairs'], mustNot: ['@'] },
		{ selector: '[data-testid="hall-pass-tool-chip"]', label: 'the hall pass in the student word', must: ['Taken'], mustNot: ['Ana'] }
	],
	contrast: [
		{ selector: '[data-testid="class-team-mine"] .ct-name', label: 'own team name on its colours', min: 4.5 },
		{ selector: '[data-testid="class-team-mine"] li', label: 'own team members on its colours', min: 4.5 },
		{ selector: '.ct-mine-label', label: 'Your team label', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="class-teams-board"]', label: 'the board trigger' }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
