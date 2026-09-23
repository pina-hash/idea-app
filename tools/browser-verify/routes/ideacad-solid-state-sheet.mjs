/**
 * THE ANALYSIS TOGGLE, AND THE PANELS AS A BOTTOM SHEET ON A PHONE. Ledger 0296, W4.
 *
 * A different STATE of `/dev/ideacad-solid` (`aliasOf`): Start from a box,
 * then the Analysis toggle in the panel row. The Analysis panel is mounted
 * in the workspace (not only in its own harness), its toggle says it is
 * pressed, and the six panel toggles fit their row at every width. Below
 * 700px the panel column is a bottom sheet under one Panels handle that
 * leaves the model above it visible (F044); above that the handle is absent,
 * because the column is a side column there.
 */
export default {
	path: '/dev/ideacad-solid?state=sheet',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: the Analysis panel in the workspace, and the phone bottom sheet',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy && !!document.querySelector(\'[data-testid="ideacad-empty-cue"]\')' },
		{ click: '[data-testid="ideacad-empty-cue"] button:has-text("Start from a box")', until: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy && window.ideaCadSolid.model.bodies.length === 1', attempts: 10, gapMs: 400 },
		{ click: '.solid-workspace .right-tools button:has-text("Analysis")', until: '() => !!document.querySelector(\'.solid-workspace .panels [data-testid="ideacad-analysis-panel"], .solid-workspace .panels [aria-label="Analysis"]\')', attempts: 6, gapMs: 300, waitMs: 400 }
	],
	presence: [
		{ selector: '.solid-workspace .right-tools button[aria-pressed="true"]', label: 'the Analysis toggle, pressed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.solid-workspace .right-tools button', label: 'six panel toggles', expectPresent: 6, maxPresent: 6, expectVisible: 6 }
	],
	textContains: [
		{ selector: '.solid-workspace .panels', label: 'the Analysis panel\'s own sections', must: ['Analysis', 'Mass'] }
	],
	tapTargets: [
		{ selector: '.solid-workspace .right-tools button, [data-testid="ideacad-sheet-handle"]', label: 'the panel toggles and the sheet handle', min: 44 }
	],
	layoutSanity: [{ root: '.solid-workspace .right-tools', label: 'the panel toggles in one row', reserved: null }],
	ignoreConsole: []
};
