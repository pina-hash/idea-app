export default {
	path: '/dev/maps-edit?state=compartment',
	label: 'Maps editor harness (Drawer 1 open: the compartment constraints, stated before the action)',
	/* A compartment carries NO plan geometry (the schema forbids it) and
	   NOTHING may nest inside one. Both constraints are structural here --
	   fields absent, add-child buttons absent -- each with its reason stated
	   in words where the control would have been. */
	presence: [
		{
			selector: '[data-testid="maps-elevation-fields"]',
			label: 'elevation fields on a compartment',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-geometry-fields"]',
			label: 'NO plan-geometry section on a compartment',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-add-child"] .btn',
			label: 'NO add-child controls inside a compartment',
			expectPresent: 0
		},
		{
			/* The positive control for those two absences: the same sections
			   exist and hold controls on the unit state (see ?state=unit spec
			   rows in maps-edit-state-unit.mjs). Here: the contents section is
			   present, so an empty add-child row is not "the page failed". */
			selector: '[data-testid="maps-node-contents"]',
			label: 'contents section present (items and stock live here instead)',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-add-child"] .hint',
			label: 'the empty add-child row says WHY (nothing nests in a compartment)',
			must: ['Nothing can sit inside a compartment']
		},
		{
			selector: '[data-testid="maps-elevation-fields"] .hint',
			label: 'the elevation section says compartments carry no plan geometry',
			must: ['no plan geometry']
		}
	],
	contrast: [
		{
			selector: '[data-testid="maps-add-child"] .hint',
			label: 'the constraint sentence',
			min: 4.5
		},
		{
			selector: '[data-testid="maps-elevation-fields"] label',
			label: 'elevation field labels',
			min: 4.5
		}
	],
	tapTargets: [
		{
			selector: '[data-testid="maps-elevation-fields"] input',
			label: 'elevation inch inputs',
			min: 44
		},
		{
			selector: '[data-testid="maps-node-contents"] .btn',
			label: 'add item / add stock controls',
			min: 44
		}
	]
};
