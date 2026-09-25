/**
 * NO DUPLICATES, NO DOOR (ledger 0298, report 28). The same teacher as
 * classroom-tour-s-1-manage-1-tour-offered-dupes-2.mjs, on a class with one
 * draft: a draft cannot duplicate itself, so the count is never asked and the
 * door is not rendered at all. The Drafts filter is the positive control that
 * the row the door would sit in is on screen.
 */
import { TOUR_READY } from './_classroom-tour.mjs';

export default {
	path: '/dev/classroom-tour/s-1?manage=1&tour=offered&dupes=0',
	label: 'No Duplicates door for a teacher whose class has no duplicate drafts',
	prepare: [TOUR_READY, { waitFor: `() => !!document.querySelector('[data-testid="stream-status-drafts"]')`, timeoutMs: 5000 }, { evaluate: `() => new Promise((r) => setTimeout(() => r('waited out the count'), 400))` }],
	presence: [
		{ selector: '[data-testid="stream-duplicates-door"]', label: 'no Duplicates door', expectPresent: 0 },
		{ selector: '[data-testid="stream-status-drafts"]', label: 'POSITIVE CONTROL: the Drafts filter row is on screen', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="section-tab-duplicates"]', label: 'no Duplicates tab', expectPresent: 0 }
	]
};
