export default {
	path: '/dev/maps-edit?state=unit',
	label: 'Maps editor harness (Tool Chest A open: the positive control for the compartment absences)',
	/* The compartment spec asserts NO geometry section and NO add-child
	   controls. Those zeros mean nothing unless the same selectors match on a
	   kind where they should -- this state is that control: a unit HAS the
	   typed-inches geometry section and offers exactly one child kind
	   (compartment). It also carries the fixture's item and stock rows, so
	   the per-object status chips on contents are measured somewhere. */
	presence: [
		{
			selector: '[data-testid="maps-geometry-fields"]',
			label: 'plan-geometry section present on a unit (control for the compartment zero)',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-add-child"] .btn',
			label: 'exactly one add-child control on a unit (compartment is the only legal child)',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-elevation-fields"]',
			label: 'NO elevation section on a unit (it lives on the compartments)',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-node-contents"] .content-row',
			label: 'contents rows (the draft Mystery Fixture Plate item)',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-add-child"] .hint',
			label: 'the nesting rule for a unit, in words, before the action',
			must: ['Inside a unit: a compartment.']
		},
		{
			selector: '[data-testid="maps-add-child"] .btn',
			label: 'the one legal child offered by name',
			must: ['Add compartment']
		}
	],
	contrast: [
		{
			selector: '[data-testid="maps-node-contents"] .content-name',
			label: 'contents row name',
			min: 4.5
		},
		{
			selector: '[data-testid="maps-add-child"] .hint',
			label: 'nesting sentence on the unit',
			min: 4.5
		}
	],
	tapTargets: [
		{ selector: '[data-testid="maps-add-child"] .btn', label: 'add compartment control', min: 44 },
		{
			selector: '[data-testid="maps-node-contents"] .row-btn',
			label: 'contents row Edit control',
			min: 44
		}
	]
};
