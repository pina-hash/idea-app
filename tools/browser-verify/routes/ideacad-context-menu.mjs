/**
 * THE RIGHT-CLICK MENU'S LISTS OPEN BESIDE IT ON A MOUSE (report R04, ledger
 * 0298). `/dev/ideacad-context-menu` mounts the REAL `ContextMenu` with the
 * modeler's empty-space rows, opened near the window's left edge.
 *
 * At 1440 (a mouse, room on the right): resting on Views opens nothing at 60 ms
 * and a second panel beside the menu by 300 ms, its first row level with Views
 * and every row hit-testable at its centre. The grace, measured with its
 * controls: a diagonal move across Fit into the list keeps it, a rest on Fit
 * closes it, leaving both panels closes it after the grace and not before. The
 * right arrow opens it and moves in, the left arrow and Escape close it and go
 * back to Views. At 375 (no room either side): a rest opens nothing and a press
 * opens the list IN PLACE with its Back row, exactly as before R04.
 *
 * A FINGER on the same wide screen (a touch-screen laptop, whose main pointer
 * is its trackpad): a tap opens Pick filter's list and a tap on one of its
 * boxes ticks it and leaves the list open, because only a MOUSE resting and
 * leaving drives the timers. At 375 the same taps work in place.
 *
 * The static checks measure the list open: beside the menu at 1440, in place at
 * 375. `view-front` is one of its rows, so it is visible at both widths.
 */
import { FINGER_HELD, GRACE_HELD, MENU_READY, fingerTaps, graceAndKeys, restHeld, restOn } from './_ideacad-menu.mjs';

const ROWS = '[data-testid="ideacad-context-menu"] [data-menu-row], [data-testid="ideacad-context-submenu"] [data-menu-row]';
export default {
	path: '/dev/ideacad-context-menu',
	label: 'IdeaCAD: a right-click row\'s list opens beside the menu on a mouse, in place on a phone',
	prepare: [
		{ waitFor: MENU_READY },
		{ evaluate: restOn('views'), until: restHeld('right', 5), attempts: 3, gapMs: 300 },
		{ evaluate: fingerTaps(), until: FINGER_HELD, attempts: 3, gapMs: 300 },
		{ evaluate: graceAndKeys('views', 'fit'), until: GRACE_HELD, attempts: 3, gapMs: 300 }
	],
	presence: [
		{ selector: '[data-testid="ideacad-context-menu"]', label: 'the menu', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-menu-row][data-command="view-front"]', label: 'the Views list is open (beside at 1440, in place at 375)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: 'main[data-testid="ideacad-menu-harness"]', label: 'the views, by name', must: ['Isometric', 'Front', 'Top', 'Right', 'Normal To'] }],
	contrast: [{ selector: '[data-testid="ideacad-context-menu"] [data-menu-row] .label, [data-testid="ideacad-context-submenu"] [data-menu-row] .label', label: 'a menu row, in either panel', min: 4.5 }],
	tapTargets: [{ selector: ROWS, label: 'every menu row, in either panel', min: 44 }],
	ignoreConsole: []
};
