/**
 * A DRAW WHOSE WINDOW HAS ALREADY CLOSED, AS A STUDENT (ledger 0298, R23):
 * 0223's audience gate returns it to nobody but the teacher, so the class page
 * carries no teams region at all -- never an empty card. The positive control
 * is the class list rendered in the same run, and /dev/classroom-teams (the
 * same draw, window open) renders the region.
 */
import { CLASS_LIST, IGNORE, READY } from './_classroom-teams.mjs';

export default {
	path: '/dev/classroom-teams?window=closed',
	label: 'Class page as a student after the teams window closed: no teams region',
	prepare: [{ waitFor: READY, timeoutMs: 20000 }],
	presence: [
		{ selector: '[data-testid="class-teams"]', label: 'no teams region', expectPresent: 0 },
		{ selector: '[data-testid="class-tools"]', label: 'the tools row rendered (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		CLASS_LIST
	],
	ignoreConsole: IGNORE
};
