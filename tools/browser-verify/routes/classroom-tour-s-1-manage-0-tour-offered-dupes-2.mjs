/**
 * A STUDENT IS NEVER HANDED THE DUPLICATES DOOR (ledger 0298, report 28). The
 * copies are seeded exactly as for the teacher beside this spec, and the
 * student's class page carries no door, no Drafts filter and no Duplicates
 * tab: the loader is handed only to a manager, and the page behind it 404s for
 * anybody else regardless (tests/classroom-nav-duplicates-gate.test.ts). The
 * student's own status filters are the positive control that the row is on
 * screen.
 */
import { TOUR_READY } from './_classroom-tour.mjs';

export default {
	path: '/dev/classroom-tour/s-1?manage=0&tour=offered&dupes=2',
	label: 'No Duplicates door, Drafts filter or tab for a student',
	prepare: [TOUR_READY, { evaluate: `() => new Promise((r) => setTimeout(() => r('waited out any count'), 400))` }],
	presence: [
		{ selector: '[data-testid="stream-duplicates-door"]', label: 'no Duplicates door', expectPresent: 0 },
		{ selector: '[data-testid="stream-status-drafts"]', label: 'no Drafts filter', expectPresent: 0 },
		{ selector: '[data-testid="section-tab-duplicates"]', label: 'no Duplicates tab', expectPresent: 0 },
		{ selector: '[data-testid="stream-status-missing"]', label: "POSITIVE CONTROL: the student's own filters are on screen", expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	]
};
