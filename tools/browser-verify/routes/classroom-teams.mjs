/**
 * POSTED TEAMS, AS A STUDENT READS THE CLASS PAGE, A DRAW POSTED TODAY
 * (ledger 0298, R23). Mr. Pina posted a draw and no student saw it. The
 * student's own team is the first thing in the teams region, OPEN, above the
 * class list; the whole draw sits closed below it; nothing names an address.
 * The window is the People tab's own "today" option, so the draw is showing
 * right now whatever time of day this runs.
 */
import { CLASS_LIST, IGNORE, PARTS, READY } from './_classroom-teams.mjs';

export default {
	path: '/dev/classroom-teams',
	label: 'Class page as a student, teams posted today: their team first, the board closed',
	prepare: [{ waitFor: READY, timeoutMs: 20000 }],
	orderResult: [
		{ label: 'own team first, then the board, and no teacher strip', evaluate: PARTS, expected: ['class-team-mine-wrap', 'class-teams-board'] },
		{
			label: 'their own team, by name and members',
			evaluate: `() => [document.querySelector('[data-testid="class-team-mine"] .ct-name').textContent.trim(), ...[...document.querySelectorAll('[data-testid="class-team-mine"] li')].map((l) => l.textContent.trim())]`,
			expected: ['Torque Squad', 'Ana Reyes', 'Ben Okafor', 'Cruz Delgado']
		},
		{
			label: 'the own card sits wholly above the class list and starts in the first screen',
			evaluate: `() => { const m = document.querySelector('[data-testid="class-team-mine"]').getBoundingClientRect(); const r = document.querySelector('[data-testid="item-row"]').getBoundingClientRect(); return [m.bottom <= r.top, m.top < innerHeight, m.height > 0]; }`,
			expected: [true, true, true]
		}
	],
	domOrder: [{ before: '[data-testid="class-teams"]', after: '[data-testid="item-row"]', label: 'the teams before the class list', beforeLabel: 'teams', afterLabel: 'first class row' }],
	presence: [
		{ selector: '[data-testid="class-team-mine"]', label: 'their own team, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-teams-board"][aria-expanded="false"]', label: 'the whole draw, closed by default', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-team"]', label: 'board cards, in the DOM behind the closed board', expectPresent: 4, maxPresent: 4, expectVisible: 0, maxVisible: 0 },
		{ selector: '[data-testid="class-teams-posted"]', label: 'no teacher strip for a student', expectPresent: 0 },
		{ selector: '[data-testid="class-teams-manage"]', label: 'no People link for a student', expectPresent: 0 },
		CLASS_LIST
	],
	textContains: [
		{ selector: '[data-testid="class-teams"]', label: 'names, never addresses', must: ['Your team', 'Lab pairs', 'All teams', 'Torque Squad'], mustNot: ['@', 'boscotech'] },
		{ selector: '[data-testid="class-teams-board"]', label: 'the board keeps its count on the trigger', must: ['All teams', 'Lab pairs', '4 teams', 'Show'] }
	],
	contrast: [
		{ selector: '[data-testid="class-team-mine"] .ct-name', label: 'own team name on its colours', min: 4.5 },
		{ selector: '[data-testid="class-team-mine"] li', label: 'own team members on its colours', min: 4.5 },
		{ selector: '[data-testid="class-team-mine-wrap"] .ct-mine-label', label: 'Your team label', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="class-teams-board"]', label: 'the board trigger' }],
	ignoreConsole: IGNORE
};
