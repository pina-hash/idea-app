/**
 * THE MODELER'S PREFERENCES, OPEN. Ledger 0296.
 *
 * A different STATE of `/dev/ideacad-solid` (`aliasOf`): a new document with
 * the header's preferences control pressed. The panel shows its six groups as
 * tabs and the View group's planes choice (three) and triad box; every row is
 * a label or a button that clears 44px at every width, and nothing in the
 * panel column is covered (`layoutSanity`). Labels only: the panel carries no
 * explanatory sentence, and its one heading is its name.
 */
export default {
	path: '/dev/ideacad-solid?state=prefs',
	aliasOf: '/dev/ideacad-solid',
	label: 'IdeaCAD: the preferences panel, open on its View group',
	prepare: [
		{ click: 'text=+ New document', until: '() => !!window.ideaCadSolid', attempts: 20, gapMs: 250 },
		{ waitFor: '() => !!window.ideaCadSolid && !window.ideaCadSolid.busy' },
		{ click: '.solid-workspace header .prefs-open', until: '() => !!document.querySelector(\'[data-testid="ideacad-preferences"]\')', attempts: 10, gapMs: 200, waitMs: 300 }
	],
	presence: [
		{ selector: '[data-testid="ideacad-preferences"]', label: 'the preferences panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-preferences"] [role="tab"]', label: 'six groups: View, Toolbar, Shortcuts, Snaps, Hints, Units', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '[data-testid="ideacad-preferences"] input[name="ic-planes"]', label: 'the three plane choices', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="ideacad-preferences"] button.reset', label: 'the group\'s own Reset', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-preferences"] p', label: 'no sentence of instructions in the panel', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-preferences"]', label: 'the group names and the planes choice', must: ['View', 'Toolbar', 'Shortcuts', 'Snaps', 'Hints', 'Units', 'Planes', 'Always', 'Never', 'Corner triad', 'Reset view'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-preferences"] label', label: 'a preference label', min: 4.5 },
		{ selector: '[data-testid="ideacad-preferences"] [role="tab"]', label: 'a group tab', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="ideacad-preferences"] button, [data-testid="ideacad-preferences"] label', label: 'every preference control, measured at its label', min: 44 }
	],
	layoutSanity: [{ root: '.solid-workspace .panels', label: 'the panel column with the preferences open', reserved: null }],
	ignoreConsole: []
};
