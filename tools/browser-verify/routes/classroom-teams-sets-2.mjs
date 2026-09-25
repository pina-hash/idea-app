/**
 * TWO DRAWS POSTED AT ONCE, AS A STUDENT (ledger 0298, R23): both of the
 * student's own teams come before EITHER board, so the second draw's card
 * never sits under the first draw's board.
 */
import { IGNORE, PARTS, READY } from './_classroom-teams.mjs';

export default {
	path: '/dev/classroom-teams?sets=2',
	label: 'Class page as a student with two draws posted: both own teams first',
	prepare: [{ waitFor: READY, timeoutMs: 20000 }],
	orderResult: [
		{
			label: 'every own team before every board',
			evaluate: PARTS,
			expected: ['class-team-mine-wrap', 'class-team-mine-wrap', 'class-teams-board', 'class-teams-board']
		},
		{
			label: 'each own card names its draw',
			evaluate: `() => [...document.querySelectorAll('[data-testid="class-team-mine-wrap"] .ct-mine-label')].map((p) => p.textContent.replace(/\\s+/g, ' ').trim())`,
			expected: ['Your team · Lab pairs', 'Your team · Bridge build crews']
		}
	],
	presence: [
		{ selector: '[data-testid="class-team-mine"]', label: 'both own teams, open', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="class-teams-board"][aria-expanded="false"]', label: 'both boards, closed', expectPresent: 2, maxPresent: 2, expectVisible: 2 }
	],
	textContains: [{ selector: '[data-testid="class-teams"]', label: 'names, never addresses', must: ['Bridge build crews'], mustNot: ['@', 'boscotech'] }],
	ignoreConsole: IGNORE
};
