export default {
	path: '/dev/maps-edit?state=unit',
	label:
		'Maps editor harness (Tool Chest A open: the front elevation of a real stack, and the positive control for the compartment absences)',
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
			label: 'NO per-compartment elevation FIELDS on a unit (those live on the compartment itself)',
			expectPresent: 0
		},
		{
			/* The unit's own surface is the STACK, which is a different thing
			   from the compartment's three fields absent above: this is where
			   a person sees the toolbox rather than one drawer of it. */
			selector: '[data-testid="maps-unit-elevation"]',
			label: 'the front elevation of the unit',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-elevation-rows"] > li',
			label: 'one editable slot per compartment (Drawer 1, Drawer 2)',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="maps-elevation-stack"] .slot-draw',
			label: 'the drawn stack: one box per compartment, in slot order',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		{
			/* Both compartments are sized in the fixture, so nothing is drawn
			   at the legibility floor and the drawing is genuinely to scale --
			   which is what the proportionality probe below is entitled to
			   assume. If a fixture height ever drops under the floor this row
			   is what says so first. */
			selector: '[data-testid="maps-elevation-floor-note"]',
			label: 'NO floor note: every slot here is drawn to scale',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-elevation-empty"]',
			label: 'NO empty-elevation message on a unit that has compartments',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-plan-canvas"]',
			label: 'the plan canvas, since this unit is placed in its room',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-node-contents"] .content-row',
			label: 'contents rows (the draft Mystery Fixture Plate item)',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	orderResult: [
		{
			label: 'THE STACK IS DRAWN IN PROPORTION TO THE TYPED HEIGHTS',
			/* Reads the two drawn boxes and the two typed inches and compares
			   the RATIOS. A drawing that answered a fixed height per slot, or
			   sorted the boxes without sizing them, comes back with a ratio of
			   1.000 against a typed 0.600. Measured in a real browser because
			   this is a LAYOUT claim: happy-dom answers 0 for every box. */
			evaluate: `() => {
				const boxes = Array.from(document.querySelectorAll('[data-testid="maps-elevation-stack"] .slot-draw'));
				const rows = Array.from(document.querySelectorAll('[data-testid="maps-elevation-rows"] > li'));
				if (boxes.length !== 2 || rows.length !== 2) return ['expected 2 boxes and 2 rows, got ' + boxes.length + ' and ' + rows.length];
				const typed = rows.map((li) => Number(li.querySelectorAll('input')[1].value));
				const drawn = boxes.map((b) => b.getBoundingClientRect().height);
				return [
					(typed[0] / typed[1]).toFixed(3),
					(drawn[0] / drawn[1]).toFixed(3),
					drawn[0] > 0 && drawn[1] > 0 ? 'both drawn' : 'a box measured zero'
				];
			}`,
			// Drawer 1 is 3in and Drawer 2 is 5in: 0.600 typed, and the drawn
			// boxes have to answer the same number.
			expected: ['0.600', '0.600', 'both drawn']
		},
		{
			label: 'MOVE DOWN REORDERS THE STACK AND RETYPES NO HEIGHT',
			evaluate: `async () => {
				const read = () =>
					Array.from(document.querySelectorAll('[data-testid="maps-elevation-rows"] > li')).map((li) => {
						const i = li.querySelectorAll('input');
						return i[0].value + '|' + i[1].value;
					});
				const before = read();
				const first = document.querySelector('[data-testid="maps-elevation-rows"] > li');
				const down = Array.from(first.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'Move down');
				if (!down) return ['no Move down control'];
				down.click();
				await new Promise((r) => setTimeout(r, 60));
				return [before.join(' / '), read().join(' / ')];
			}`,
			// The heights travel with their own compartments: 5 stays on
			// Drawer 2 as it moves to the top, 3 stays on Drawer 1.
			expected: ['Drawer 1|3 / Drawer 2|5', 'Drawer 2|5 / Drawer 1|3']
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
		},
		{
			selector: '[data-testid="maps-unit-elevation"] .hint',
			label: 'the reorder rule and the pending-publish consequence, both in words',
			must: ['nothing has to be retyped', 'keeps the old elevation until you publish']
		},
		{
			selector: '[data-testid="maps-elevation-total"]',
			label: 'the stack total, from the typed inches',
			must: ['2 compartments', '8']
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
		},
		{
			selector: '[data-testid="maps-unit-elevation"] label',
			label: 'elevation slot field labels',
			min: 4.5
		},
		{
			selector: '[data-testid="maps-elevation-total"]',
			label: 'the stack total line',
			min: 4.5
		},
		{
			selector: '[data-testid="maps-elevation-stack"] .slot-draw-name',
			label: 'the compartment name inside its drawn box',
			min: 4.5
		},
		{
			selector: '[data-testid="maps-elevation-stack"] .slot-draw-size',
			label: 'the typed inches inside the drawn box',
			min: 4.5
		}
	],
	tapTargets: [
		{ selector: '[data-testid="maps-add-child"] .btn', label: 'add compartment control', min: 44 },
		{
			selector: '[data-testid="maps-node-contents"] .row-btn',
			label: 'contents row Edit control',
			min: 44
		},
		{
			selector: '[data-testid="maps-elevation-rows"] input',
			label: 'the elevation slot inputs (the 375px overflow case this surface has paid for once)',
			min: 44
		},
		{
			selector: '[data-testid="maps-elevation-rows"] .slot-btn',
			label: 'Move up / Move down / Open',
			min: 44
		}
	]
};
