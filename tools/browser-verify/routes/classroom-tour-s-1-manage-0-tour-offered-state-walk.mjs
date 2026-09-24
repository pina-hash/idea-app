/**
 * THE STUDENT'S WALKTHROUGH, FROM THE TOUR CONTROL, AFTER THE OFFER WAS
 * ALREADY MADE (ledger 0297, LEARN). Seeded `offered`, as if on another
 * computer: no offer appears (offered once), and the Tour control in the
 * header -- inside the Menu on a narrow window -- runs it anyway. Walked to
 * the end: every step on screen and clear of the callout; then Done records
 * `finished` and focus returns to a header control.
 */
import { CALLOUT_CONTRAST, CALLOUT_OPEN, CALLOUT_TAPS, TOUR_READY, TOUR_STUDENT, WALK_TOUR, pressThenRead, walkVerdict } from './_classroom-tour.mjs';
import { OPEN_SHELL_MENU } from './_shell-menu.mjs';

const BASE = `${TOUR_STUDENT}&tour=offered`;

export default {
	path: `${BASE}&state=walk`,
	aliasOf: BASE,
	label: 'Classroom tour (student): no second offer, run from the Tour control, every step on screen, then Done',
	prepare: [
		TOUR_READY,
		{
			label: 'no offer over a state that says it was offered',
			evaluate: `() => document.querySelector('[data-testid="tour-offer"]') ? 'OFFERED AGAIN' : 'no offer'`
		},
		OPEN_SHELL_MENU,
		{ click: '[data-testid="tour-trigger"]', until: CALLOUT_OPEN },
		WALK_TOUR
	],
	presence: [
		{ selector: '[data-testid="tour-callout"]', label: 'the callout, on its last step', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tour-offer"]', label: 'offered once: nothing offered over "offered"', expectPresent: 0 }
	],
	contrast: CALLOUT_CONTRAST,
	tapTargets: CALLOUT_TAPS,
	orderResult: [
		{ label: 'every step: target present, on screen, clear of the callout; at least 4 steps', evaluate: walkVerdict(4), expected: ['none', 'true'] },
		{
			label: 'Done: closed, finished, focus on a header control; the teacher tour untouched',
			evaluate: `async () => { const r = await (${pressThenRead('Enter', 'student', '[data-testid="tour-next"]')})(); return [...r, window.__tourProbe().tours.teacher]; }`,
			expected: ['true', 'clicked', 'finished', 'true', 'offered']
		}
	]
};
