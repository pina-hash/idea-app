/**
 * SELECT OTHER'S CANDIDATES LIGHT AND UN-LIGHT ON EVERY PATH (report R04,
 * ledger 0298). `?kind=face` opens the real `ContextMenu` with a face's rows;
 * Select other lists four candidates, each of which lights the model while it
 * is hovered or focused -- read here off the harness's `lit` line.
 *
 * At both widths: lit on hover, un-lit on leave, lit on focus, and un-lit when
 * the list closes under a lit candidate (Escape beside the menu at 1440, Back in
 * place at 375). The static checks then measure the candidate list open by a
 * rest (beside at 1440) or a press (in place at 375).
 */
import { MENU_READY, PREVIEW_HELD, previewPaths, restHeld, restOn } from './_ideacad-menu.mjs';

const ROWS = '[data-testid="ideacad-context-menu"] [data-menu-row], [data-testid="ideacad-context-submenu"] [data-menu-row]';
export default {
	path: '/dev/ideacad-context-menu?kind=face',
	label: 'IdeaCAD: Select other\'s candidates light and un-light beside the menu and in place',
	prepare: [
		{ waitFor: MENU_READY },
		{ evaluate: previewPaths(), until: PREVIEW_HELD, attempts: 3, gapMs: 300 },
		{ evaluate: restOn('select-other', 'face'), until: restHeld('right', 4), attempts: 3, gapMs: 300 }
	],
	presence: [
		{ selector: '[data-menu-row][data-command^="candidate-"]', label: 'the four candidates', expectPresent: 4, maxPresent: 4, expectVisible: 4 }
	],
	textContains: [{ selector: 'main[data-testid="ideacad-menu-harness"]', label: 'candidates by the model\'s own names', must: ['End face of Extrude 1', 'Edge of Extrude 1', 'Side face 3 of Extrude 1', 'Body 1'] }],
	tapTargets: [{ selector: ROWS, label: 'every menu row, in either panel', min: 44 }],
	ignoreConsole: []
};
