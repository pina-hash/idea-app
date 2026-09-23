/**
 * AN EMPTY PART, THE MOMENT IT OPENS. Ledger 0296.
 *
 * A different STATE of `/dev/ideacad-solid` (`aliasOf`): a new document with
 * nothing in it. What a student sees first is the Front, Top and Right planes
 * with the Origin (drawn into the canvas, so `canvasContent` is the pixel
 * claim), ONE short cue line and TWO direct actions, the view control in words,
 * the corner triad's slot, and the footer with the shell's Voice and Report
 * controls docked in its ends. Every control clears 44px at every width, and
 * nothing interactive is covered (`layoutSanity`).
 *
 * THE CUE IS PROSE-FREE BY COUNT: one line of text and two buttons. A third
 * button, or a paragraph, is the thing this row exists to catch.
 */
export default {
	path: '/dev/ideacad-solid?state=empty',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: an empty part, with its planes, its start cue and the view control',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy && !!document.querySelector(\'[data-testid="ideacad-empty-cue"]\')', waitMs: 500 }
	],
	presence: [
		{ selector: '[data-testid="ideacad-empty-cue"]', label: 'the start cue', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-empty-cue"] p', label: 'one short cue line, never a paragraph block', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-empty-cue"] button', label: 'two direct actions (Sketch on a plane, Start from a box)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-view-controls"] .row button', label: 'the view control buttons', expectPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="ideacad-triad"]', label: 'the corner triad slot', expectPresent: 1, maxPresent: 1 },
		{ selector: '.solid-workspace header .prefs-open', label: 'the preferences control in the header', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* No refusal on a new part. Positive control: the cue above rendered. */
		{ selector: '.solid-workspace .error', label: 'the refusal banner, absent on a new part', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-empty-cue"]', label: 'the cue says what to press and offers the two starts', must: ['plane', 'Sketch on a plane', 'Start from a box'] },
		{ selector: '.solid-workspace footer', label: 'the footer counts on an empty part', must: ['0 bodies', '0 features'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-empty-cue"] p', label: 'the cue line', min: 4.5 },
		{ selector: '[data-testid="ideacad-empty-cue"] button', label: 'a start action', min: 4.5 },
		{ selector: '[data-testid="ideacad-view-controls"] .row button', label: 'a view button', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.solid-workspace header button, .solid-workspace .tools button, .solid-workspace .view-tools .row button, .solid-workspace .right-tools button, [data-testid="ideacad-empty-cue"] button', label: 'the workspace chrome and the two start actions', min: 44 }
	],
	canvasContent: [{ selector: '.solid-workspace canvas', label: 'the viewport: Front, Top and Right with the Origin, and the corner triad' }],
	layoutSanity: [{ root: '.solid-workspace .workarea', label: 'the work area chrome on an empty part', reserved: null }],
	ignoreConsole: []
};
