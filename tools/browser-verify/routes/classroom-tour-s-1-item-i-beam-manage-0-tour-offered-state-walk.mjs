/**
 * THE TOUR NAMES THE CLASS LIST BUTTON WHERE THERE IS ONE (ledger 0298, report
 * 25). The student's walkthrough, run from the Tour control on a spec
 * assignment: above 1024px the class list button sits beside the item's title
 * and the tour stops on it ("Class list"); below 1024px there is no list to put
 * away, the button is not on screen, and the engine drops the step rather than
 * pointing at nothing. Every step on screen and clear of the callout, as the
 * section page's own walk asserts.
 */
import { CALLOUT_OPEN, TOUR_READY, WALK_TOUR, walkVerdict } from './_classroom-tour.mjs';
import { OPEN_SHELL_MENU } from './_shell-menu.mjs';

const BASE = '/dev/classroom-tour/s-1/item/i-beam?manage=0&tour=offered';

export default {
	path: `${BASE}&state=walk`,
	aliasOf: BASE,
	label: 'Classroom tour (student) on a spec assignment: the Class list step above 1024px, dropped below it',
	prepare: [
		{ ...TOUR_READY, waitFor: `() => !!document.querySelector('[data-testid="class-detail-pane"] h1') && typeof window.__tourProbe === 'function'` },
		OPEN_SHELL_MENU,
		{ click: '[data-testid="tour-trigger"]', until: CALLOUT_OPEN },
		WALK_TOUR
	],
	presence: [{ selector: '[data-testid="tour-callout"]', label: 'the callout, on its last step', expectPresent: 1, maxPresent: 1, expectVisible: 1 }],
	orderResult: [
		{ label: 'every step: target present, on screen, clear of the callout; at least 2 steps (below 1180px the tools are in the Menu and the list is put away, so a phone walk is Menu and Your classes)', evaluate: walkVerdict(2), expected: ['none', 'true'] },
		{
			label: 'the Class list step is in the walk exactly where its button is on screen (above 1024px)',
			evaluate: `() => {
				const w = window.__tourWalk;
				if (!w) return ['NO WALK'];
				const has = w.titles.includes('Class list');
				return [innerWidth >= 1024 ? (has ? 'named where it is on screen' : 'MISSING above 1024px') : has ? 'NAMED BELOW 1024px' : 'named where it is on screen'];
			}`,
			expected: ['named where it is on screen']
		}
	]
};
