/**
 * A STUDENT ON NO TEAM IN THE POSTED DRAW (joined the class after it), ledger
 * 0298, R23: no own card, and the whole draw still one press away under a
 * trigger that says what it is.
 */
import { IGNORE, PARTS, READY } from './_classroom-teams.mjs';

export default {
	path: '/dev/classroom-teams?mine=0',
	label: 'Class page as a student on no team: the board alone, closed',
	prepare: [{ waitFor: READY, timeoutMs: 20000 }],
	orderResult: [{ label: 'the board alone', evaluate: PARTS, expected: ['class-teams-board'] }],
	presence: [
		{ selector: '[data-testid="class-team-mine"]', label: 'no own team', expectPresent: 0 },
		{ selector: '[data-testid="class-teams-board"][aria-expanded="false"]', label: 'the board, closed (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="class-teams-board"]', label: 'the trigger says it is the teams', must: ['All teams', 'Lab pairs', '4 teams'] }],
	ignoreConsole: IGNORE
};
