/**
 * A DRAW POSTED WITH NO END, AS THE TEACHER (ledger 0298, R23): the strip
 * says it stays up until they take it down, rather than printing a date.
 */
import { IGNORE, READY } from './_classroom-teams.mjs';

export default {
	path: '/dev/classroom-teams?role=teacher&window=forever',
	label: 'Class page as the teacher, teams posted with no end',
	prepare: [{ waitFor: READY, timeoutMs: 20000 }],
	presence: [{ selector: '[data-testid="class-teams-posted"]', label: 'the posted strip', expectPresent: 1, maxPresent: 1, expectVisible: 1 }],
	textContains: [
		{ selector: '[data-testid="class-teams-posted"]', label: 'no end, said in words', must: ['Teams posted until you take them down'], mustNot: ['PM', 'AM'] }
	],
	ignoreConsole: IGNORE
};
