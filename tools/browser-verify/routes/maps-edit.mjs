export default {
	path: '/dev/maps-edit',
	label: 'Maps editor harness (nothing selected: tree gets the full measure)',
	/* The REAL MapsEditor over the fixture in src/routes/dev/maps-edit/fixture.ts:
	   7 nodes (2 draft), 1 with a pending edit, 3 item types. Nothing selected,
	   so ClassSplit renders no detail pane and the tree takes the width --
	   the layout-responds-to-selection state, measured on its own. */
	presence: [
		{
			selector: '[data-testid="maps-node-tree"] .tree-row',
			label: 'tree rows (7 fixture nodes)',
			expectPresent: 7,
			expectVisible: 7
		},
		{
			selector: '[data-testid="maps-node-tree"] .mp-chip[data-state="pending"]',
			label: 'pending-edit chip on Mill Room, visible from the list',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-node-tree"] .mp-chip[data-state="draft"]',
			label: 'draft chips on Drawer 2 and Prototype Lab',
			expectPresent: 2,
			expectVisible: 2
		},
		{
			selector: '[data-testid="maps-add-root"] .btn',
			label: 'root add controls (site, building, outdoor zone -- the ladder, before the action)',
			expectPresent: 3,
			expectVisible: 3
		},
		{
			selector: '[data-testid="maps-editor"] [data-testid="maps-node-detail"]',
			label: 'NO detail pane while nothing is selected',
			expectPresent: 0
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-add-root"] .hint',
			label: 'the root nesting rule stated in words beside the add controls',
			must: ['At the top level']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-node-tree"] .row-name', label: 'tree row name', min: 4.5 },
		{ selector: '[data-testid="maps-node-tree"] .row-kind', label: 'tree row kind word', min: 4.5 },
		{ selector: '[data-testid="maps-editor"] .mp-chip', label: 'status chip word', min: 4.5 },
		{ selector: '[data-testid="maps-add-root"] .hint', label: 'nesting-rule hint copy', min: 4.5 },
		{ selector: '[data-testid="maps-editor"] .section-tabs .tab', label: 'section tab label', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-node-tree"] .tree-row', label: 'tree row button', min: 44 },
		{ selector: '[data-testid="maps-editor"] .section-tabs .tab', label: 'section tab', min: 44 },
		{ selector: '[data-testid="maps-add-root"] .btn', label: 'root add control', min: 44 }
	]
};
