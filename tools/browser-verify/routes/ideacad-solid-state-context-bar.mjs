/**
 * THE CONTEXT TOOLBAR AND BREADCRUMB. Ledger 0296, stage W2.
 *
 * A click on the box's top face (a press and a release with no drag) selects
 * it and opens, beside the pointer and never under it, the five commands a
 * face most often takes (icon only; every one is also a worded row in the
 * right-click menu) and the breadcrumb End face, Extrude 1, Sketch 1, Body 1.
 * The prepare step measures that the bar does not cover the pointer and that
 * a press there, before the pointer has rested on the bar, still reaches the
 * model; `layoutSanity` checks it covers none of the chrome.
 */
import { BOX_READY, pointerSource } from './_ideacad-pointer.mjs';

export default {
	path: '/dev/ideacad-solid?state=context-bar',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: the context toolbar and breadcrumb beside a selected face',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy && !!document.querySelector(\'[data-testid="ideacad-empty-cue"]\')' },
		{ click: '[data-testid="ideacad-empty-cue"] button:has-text("Start from a box")', until: BOX_READY, attempts: 10, gapMs: 400 },
		{
			evaluate: pointerSource(`
				await idle(); s.select(null); await wait(100);
				const p = s.project([0.2, 0.3, 1]);
				await move(p); ev('pointerdown', p); await wait(40); ev('pointerup', p, { buttons: 0 }); await wait(300);
				const bar = document.querySelector('[data-testid="ideacad-context-bar"]'); if (!bar) return 'no context bar';
				const b = bar.getBoundingClientRect();
				const covers = p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;
				const mid = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
				const through = document.elementFromPoint(mid.x, mid.y)?.closest('[data-testid="ideacad-context-bar"]') ? 'bar' : 'model or chrome';
				window.__icBar = { covers, through, icons: bar.querySelectorAll('.icon').length, crumbs: [...bar.querySelectorAll('.crumb')].map((x) => x.textContent.trim()) };
				return 'bar ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' covers the pointer ' + covers + ', a press on it before resting reaches the ' + through + ', ' + window.__icBar.icons + ' icons, crumbs ' + window.__icBar.crumbs.join(' > ');
			`),
			until: '() => !!window.__icBar && !window.__icBar.covers && window.__icBar.through === "model or chrome" && window.__icBar.icons === 5 && window.__icBar.crumbs.join(">") === "End face>Extrude 1>Sketch 1>Body 1"',
			attempts: 3,
			gapMs: 500
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-context-bar"]', label: 'the context toolbar', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-context-bar"] .icon', label: 'five commands for a face', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="ideacad-context-bar"] .crumb', label: 'four crumbs', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '.solid-workspace .measure', label: 'no drag readout while nothing is dragged', expectPresent: 0 }
	],
	textContains: [{ selector: '[data-testid="ideacad-context-bar"] .crumbs', label: 'the breadcrumb, in the model\'s own names', must: ['End face', 'Extrude 1', 'Sketch 1', 'Body 1'] }],
	contrast: [{ selector: '[data-testid="ideacad-context-bar"] .crumb', label: 'a crumb', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="ideacad-context-bar"] button', label: 'every toolbar icon and crumb', min: 44 }],
	canvasContent: [{ selector: '.solid-workspace canvas', label: 'the box with its top face selected' }],
	layoutSanity: [{ root: '.solid-workspace .workarea', label: 'the work area with the toolbar open', reserved: null }],
	ignoreConsole: []
};
