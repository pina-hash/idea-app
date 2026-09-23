/**
 * THE RIGHT-CLICK MENU ON A FACE. Ledger 0296, stage W2.
 *
 * A right-click on the box's top face (a dispatched `contextmenu`, which is
 * what the browser sends) never opens the browser's own menu: the prepare
 * step reports `defaultPrevented`. It selects the face and opens IdeaCAD's
 * menu for it, built from the command registry: nine rows, each a word with
 * its icon, 44px tall, the first one focused. The audit measured 0 DOM change
 * for the same right-click (F028).
 */
import { BOX_READY, pointerSource } from './_ideacad-pointer.mjs';

export default {
	path: '/dev/ideacad-solid?state=menu',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: the right-click menu on a face',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy && !!document.querySelector(\'[data-testid="ideacad-empty-cue"]\')' },
		{ click: '[data-testid="ideacad-empty-cue"] button:has-text("Start from a box")', until: BOX_READY, attempts: 10, gapMs: 400 },
		{
			evaluate: pointerSource(`
				await idle(); s.select(null); await wait(100);
				const p = s.project([0.2, 0.3, 1]);
				const e = new MouseEvent('contextmenu', { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, button: 2 });
				c.dispatchEvent(e); await wait(250);
				const rows = document.querySelectorAll('[data-testid="ideacad-context-menu"] [data-menu-row]').length;
				window.__icMenu = { prevented: e.defaultPrevented, rows, selected: s.selections.map((x) => x.kind).join(','), focused: document.activeElement?.getAttribute('data-command') };
				return 'browser menu prevented ' + e.defaultPrevented + ', ' + rows + ' rows, selection ' + window.__icMenu.selected + ', focus on ' + window.__icMenu.focused;
			`),
			until: '() => !!window.__icMenu && window.__icMenu.prevented && window.__icMenu.rows === 9 && window.__icMenu.selected === "face" && window.__icMenu.focused === "sketch-on"',
			attempts: 3,
			gapMs: 500
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-context-menu"]', label: 'the menu', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-context-menu"] [data-menu-row]', label: 'nine rows for a face', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="ideacad-context-menu"] [data-command="select-other"][aria-haspopup="menu"]', label: 'Select Other opens its list in place', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-context-menu"] [data-menu-row] p', label: 'no prose in a row', expectPresent: 0 }
	],
	textContains: [{ selector: '[data-testid="ideacad-context-menu"]', label: 'what a face offers', must: ['Sketch', 'Extrude', 'Fillet face edges', 'Shell', 'Hole', 'Measure', 'Normal To', 'Select other', 'Hide body'] }],
	contrast: [{ selector: '[data-testid="ideacad-context-menu"] [data-menu-row] .label', label: 'a menu row', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="ideacad-context-menu"] [data-menu-row]', label: 'every menu row', min: 44 }],
	canvasContent: [{ selector: '.solid-workspace canvas', label: 'the box with its top face selected' }],
	ignoreConsole: []
};
