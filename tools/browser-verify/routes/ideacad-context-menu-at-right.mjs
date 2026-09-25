/**
 * AT THE WINDOW'S RIGHT EDGE THE LIST FLIPS TO THE LEFT OF THE MENU (report
 * R04, ledger 0298). `?at=right` opens the real `ContextMenu` 40 px from the
 * right edge, so the menu itself has flipped to end at the pointer and there is
 * no room on its right.
 *
 * At 1440: resting on Views opens the list on the LEFT of the menu, its right
 * edge against the menu's left edge, its first row level with Views, on screen,
 * and every row hit-testable at its centre (nothing of the menu covers it). At
 * 375 the list opens in place, as it always has on a phone.
 */
import { MENU_READY, restHeld, restOn } from './_ideacad-menu.mjs';

const ROWS = '[data-testid="ideacad-context-menu"] [data-menu-row], [data-testid="ideacad-context-submenu"] [data-menu-row]';
export default {
	path: '/dev/ideacad-context-menu?at=right',
	label: 'IdeaCAD: a right-click list flips to the left of the menu at the window\'s right edge',
	prepare: [
		{ waitFor: MENU_READY },
		{ evaluate: restOn('views'), until: restHeld('left', 5), attempts: 3, gapMs: 300 }
	],
	presence: [
		{ selector: '[data-testid="ideacad-context-menu"]', label: 'the menu', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-menu-row][data-command="view-front"]', label: 'the Views list is open (flipped left at 1440, in place at 375)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [{ selector: ROWS, label: 'every menu row, in either panel', min: 44 }],
	ignoreConsole: []
};
