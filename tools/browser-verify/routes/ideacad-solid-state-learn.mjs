/**
 * THE LEARN BUTTON AND THE TUTORIAL, IN THE REAL WORKSPACE. Ledger 0296, W4.
 *
 * A different STATE of `/dev/ideacad-solid` (`aliasOf`): a new document with
 * the header's Learn control pressed. The tutorial is mounted as the first
 * card of the panel column (the one render path the harness at
 * `/dev/ideacad-tutorial` measures on its own), the control says it is pressed,
 * and the palette's More button carries the hook the tutorial rings. At 375
 * the panel column is a bottom sheet with its Panels handle.
 */
export default {
	path: '/dev/ideacad-solid?state=learn',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: the Learn control opens the tutorial in the panel column',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy' },
		{ click: '.solid-workspace header .help-open', until: '() => !!document.querySelector(\'[data-testid="ideacad-tutorial"]\')', attempts: 10, gapMs: 200, waitMs: 300 }
	],
	presence: [
		{ selector: '[data-testid="ideacad-tutorial"]', label: 'the tutorial card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.solid-workspace header .help-open[aria-pressed="true"]', label: 'the Learn control, pressed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.solid-workspace .tools button.more[data-more-tools]', label: 'the More button the tutorial rings', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [
		{ selector: '.solid-workspace header button', label: 'the header controls, Learn included', min: 44 }
	],
	layoutSanity: [{ root: '.solid-workspace .panels', label: 'the panel column with the tutorial open', reserved: null }],
	ignoreConsole: []
};
