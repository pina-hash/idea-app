/**
 * A FINGER ON A WIDE SCREEN KEEPS THE LIST IN PLACE (report R04, ledger 0298).
 * The same page as `/dev/ideacad-context-menu`, with `(pointer: fine)`
 * answering false -- the instrument patches `matchMedia` for that one query and
 * reopens the menu; the component's own read of it is what is under test.
 *
 * At BOTH widths, 1440 included: a rest on Views opens nothing, a press opens
 * the list inside the menu with its Back row, and no second panel exists. This
 * is the half a desk never sees, which is why it is measured rather than left
 * to the 375 reading (a phone-width window is in place for want of ROOM, not for
 * want of a mouse).
 */
import { COARSE_HELD, MENU_READY, coarse } from './_ideacad-menu.mjs';

export default {
	path: '/dev/ideacad-context-menu?pointer=coarse',
	aliasOf: '/dev/ideacad-context-menu',
	label: 'IdeaCAD: a touch screen keeps a right-click list in place, at any width',
	prepare: [
		{ waitFor: MENU_READY },
		{ evaluate: coarse('views'), until: COARSE_HELD, attempts: 3, gapMs: 300 }
	],
	presence: [
		{ selector: '[data-testid="ideacad-context-menu"] .menu-back', label: 'the Back row of a list opened in place', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-context-menu"] [data-command="view-front"]', label: 'the Views list, inside the menu', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-context-submenu"]', label: 'no panel beside the menu', expectPresent: 0 }
	],
	tapTargets: [{ selector: '[data-testid="ideacad-context-menu"] [data-menu-row]', label: 'every menu row', min: 44 }],
	ignoreConsole: []
};
