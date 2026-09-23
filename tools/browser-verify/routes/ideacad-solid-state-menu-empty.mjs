/**
 * THE RIGHT-CLICK MENU ON EMPTY SPACE. Ledger 0296, stage W2.
 *
 * Off the model, the menu offers what applies to the whole view: the views
 * (a list opened in place), Fit, Show or Hide planes, the pick filter (a
 * list of boxes opened in place) and command search. Five rows, 44px each,
 * and the browser's own menu never opens.
 */
import { BOX_READY, pointerSource } from './_ideacad-pointer.mjs';

export default {
	path: '/dev/ideacad-solid?state=menu-empty',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: the right-click menu on empty space',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy && !!document.querySelector(\'[data-testid="ideacad-empty-cue"]\')' },
		{ click: '[data-testid="ideacad-empty-cue"] button:has-text("Start from a box")', until: BOX_READY, attempts: 10, gapMs: 400 },
		{
			evaluate: pointerSource(`
				await idle(); s.select(null); await wait(100);
				const p = await emptyPoint(); if (!p) return 'no empty point on the canvas';
				const e = new MouseEvent('contextmenu', { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, button: 2 });
				c.dispatchEvent(e); await wait(250);
				const rows = [...document.querySelectorAll('[data-testid="ideacad-context-menu"] [data-menu-row]')].map((b) => b.getAttribute('data-command'));
				window.__icMenuEmpty = { prevented: e.defaultPrevented, rows, selections: s.selections.length };
				return 'browser menu prevented ' + e.defaultPrevented + ', rows ' + rows.join(' ') + ', ' + s.selections.length + ' selected';
			`),
			until: '() => !!window.__icMenuEmpty && window.__icMenuEmpty.prevented && window.__icMenuEmpty.rows.join(",") === "views,fit,planes,pick-filter,search" && window.__icMenuEmpty.selections === 0',
			attempts: 3,
			gapMs: 500
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-context-menu"] [data-menu-row]', label: 'five rows off the model', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="ideacad-context-menu"] [aria-haspopup="menu"]', label: 'the views and the pick filter open in place', expectPresent: 2, maxPresent: 2, expectVisible: 2 }
	],
	textContains: [{ selector: '[data-testid="ideacad-context-menu"]', label: 'what empty space offers', must: ['Views', 'Fit', 'Show planes', 'Pick filter', 'Search commands'] }],
	contrast: [{ selector: '[data-testid="ideacad-context-menu"] [data-menu-row] .label', label: 'a menu row', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="ideacad-context-menu"] [data-menu-row]', label: 'every menu row', min: 44 }],
	ignoreConsole: []
};
