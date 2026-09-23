/**
 * THE CLASS PAGE'S LIVE DOOR AND POSTED TEAMS, AS A TEACHER SEES THEM (ledger
 * 0297). The door sits in the class-tools row beside the hall pass and names
 * how many students are on today's assignment right now; the posted teams sit
 * below the row, the board closed with its count left on the trigger.
 *
 * The count is the presence rows that are not away, at the instant the read
 * was taken (`liveCountOf`). The fixture carries the teacher's own row to test
 * the grid's exclusion; the door has no roster and counts it, which production
 * cannot produce: heartbeats come only from the student assignment page.
 */
export default {
	path: '/dev/classroom-live-door',
	label: 'Class page: the Live door (teacher) and the posted teams',
	prepare: [{ waitFor: `() => /\\d+ on /.test(document.querySelector('[data-testid="live-door-count"]')?.textContent || '')`, timeoutMs: 20000 }],
	orderResult: [
		{
			label: 'the door names the count and the assignment, and links there',
			evaluate: `() => { const d = document.querySelector('[data-testid="live-door"]'); return [d.textContent.replace(/\\s+/g, ' ').trim().replace(/\\d+ on/, 'N on'), new URL(d.href).pathname + new URL(d.href).search]; }`,
			expected: ['● Live class N on Truss sketch', '/dev/classroom-live?item=i-truss']
		}
	],
	presence: [
		{ selector: '[data-testid="class-tools"] [data-testid="live-door"]', label: 'the door in the tools row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-teams"]', label: 'the teams region', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-teams-board"][aria-expanded="false"]', label: 'the board, closed by default', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-team"]', label: 'team cards, in the DOM behind the closed board', expectPresent: 4, maxPresent: 4, expectVisible: 0, maxVisible: 0 },
		{ selector: '[data-testid="class-team-mine"]', label: 'no own team for a teacher', expectPresent: 0 }
	],
	textContains: [{ selector: '[data-testid="class-teams-board"]', label: 'the board keeps its count on the trigger', must: ['Lab pairs', '4 teams', 'Show'] }],
	contrast: [
		{ selector: '[data-testid="live-door"] .ld-word', label: 'door word', min: 4.5 },
		{ selector: '[data-testid="live-door-count"]', label: 'door count', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="live-door"]', label: 'the door' },
		{ selector: '[data-testid="class-teams-board"]', label: 'the board trigger' }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
