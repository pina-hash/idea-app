/**
 * A PICK FILTER THAT IS ON IS ALWAYS ON SCREEN. Ledger 0296, stage W2.
 *
 * A hidden active filter is the classic "why can't I click that". With the
 * filter set to Edges (through the preferences store the Settings panel and
 * the right-click menu both write), the control beside the views turns green,
 * fills its funnel and says "Edges" in words, and a hover over the top face
 * picks nothing while one over an edge still lights it: both are counted.
 */
import { BOX_READY, pointerSource } from './_ideacad-pointer.mjs';

export default {
	path: '/dev/ideacad-solid?state=pick-filter',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: the pick filter on Edges, shown in words',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy && !!document.querySelector(\'[data-testid="ideacad-empty-cue"]\')' },
		{ click: '[data-testid="ideacad-empty-cue"] button:has-text("Start from a box")', until: BOX_READY, attempts: 10, gapMs: 400 },
		{
			evaluate: pointerSource(`
				await idle(); s.select(null); s.preferences.set('pick', { only: ['edges'] }); await wait(150);
				await move(s.project([0.2, 0.3, 1]), 200); const face = s.hovered?.kind ?? null;
				await move(s.project([0.3, -1, 1]), 200); const edge = s.hovered?.kind ?? null;
				window.__icPick = { face, edge };
				return 'over the top face: ' + face + '; over the top-front edge: ' + edge;
			`),
			until: '() => !!window.__icPick && window.__icPick.face === null && window.__icPick.edge === "edge"',
			attempts: 3,
			gapMs: 500
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-pick-filter"].active', label: 'the pick filter control, on', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-pick-filter"] span', label: 'the filter in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="ideacad-pick-filter"]', label: 'the control names the filter', must: ['Edges'] }],
	contrast: [{ selector: '[data-testid="ideacad-pick-filter"] span', label: 'the filter word', min: 4.5 }],
	tapTargets: [{ selector: '.solid-workspace .pick-tools button, .solid-workspace .view-tools .row button', label: 'the pick filter control and the views beside it', min: 44 }],
	layoutSanity: [{ root: '.solid-workspace .workarea', label: 'the work area with the filter on', reserved: null }],
	ignoreConsole: []
};
