/**
 * A DRAW WHOSE WINDOW HAS ALREADY CLOSED, AS THE TEACHER (ledger 0298, R23).
 * The teacher's board still carries the draw (`showing` false), and the class
 * page leaves it off exactly as it does for a student: no strip claiming it is
 * posted, no board. The People tab is where an ended draw is visible, and it
 * says "Ended. The class can no longer see these teams."
 */
import { CLASS_LIST, IGNORE, READY } from './_classroom-teams.mjs';

export default {
	path: '/dev/classroom-teams?role=teacher&window=closed',
	label: 'Class page as the teacher after the teams window closed: no strip, no board',
	prepare: [{ waitFor: READY, timeoutMs: 20000 }],
	presence: [
		{ selector: '[data-testid="class-teams"]', label: 'no teams region', expectPresent: 0 },
		{ selector: '[data-testid="class-teams-posted"]', label: 'no posted-until strip for an ended draw', expectPresent: 0 },
		CLASS_LIST
	],
	ignoreConsole: IGNORE
};
