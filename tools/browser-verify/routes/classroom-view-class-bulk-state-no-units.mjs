export default {
	path: '/dev/classroom?view=class-bulk&state=no-units',
	label: 'Class stream with NO units: the state units are undiscoverable from',
	aliasOf: '/dev/classroom?view=class-bulk',
	/*
		THE STATE EVERY CLASS STARTS IN, and the one the whole grouping feature
		was invisible from: no units, so the toolbar control reads "Add units"
		and a manager who has never made one has no reason to press it. Nothing
		on the page said what a unit is or that the class could be anything but
		one list.

		The harness toggle takes the units away and LEAVES THE TRANSPORTS, which
		is the real state -- turning 0111 off instead would be a deployment
		sitting before the migration, which is a different thing and not this
		one. With no units there are no group headers at all (`bare`), so the
		pane-level select-all is the only selection control there is, and the
		prompt is the only thing on the page that says grouping exists.
	*/
	prepare: [
		{
			click: '[data-testid="sim-bulk-units"]',
			until: '() => !!document.querySelector("[data-testid=\'units-prompt\']")'
		}
	],
	presence: [
		{ selector: '[data-testid="units-prompt"]', label: 'the units prompt, on a class with none', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="units-prompt-open"]', label: 'its control', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="group-head"]', label: 'group headers (none: one bare list)', expectPresent: 0 },
		{ selector: '[data-testid^="group-select-"]', label: 'per-group select-all (none: no groups)', expectPresent: 0 },
		/* The pane control still reaches every row, which is what makes the
		   bare case selectable at all. */
		{ selector: '[data-testid="bulk-select-all"]', label: 'pane select-all still present', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-bar"]', label: 'resting bulk bar', expectPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.units-prompt-title', label: 'prompt heading', min: 4.5 },
		{ selector: '.units-prompt .note', label: 'prompt copy', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="units-prompt-open"]', label: 'Set up units', min: 44 }],
	textContains: [
		{
			selector: '[data-testid="units-prompt"]',
			label: 'the prompt says what a unit IS and what it buys, in a student-free register',
			must: ['unit', 'folds shut'],
			mustNot: ['classroom_items', 'RPC', '0111']
		}
	],
	orderResult: [
		{
			/* Pressing it opens the SAME UnitManager the toolbar opens, and the
			   prompt is gone once the panel is up: two doors, one panel, and
			   never both on screen arguing for the same press. */
			/* ASYNC, AND THAT IS NOT TIDINESS. Read synchronously after the
			   click this returned ["no panel","prompt still up"] at both widths
			   -- Svelte had not flushed the render yet, which reads exactly like
			   a control that does nothing. It polls for the panel instead, and a
			   control that genuinely does nothing still fails after 2s. */
			evaluate: `async () => {
				document.querySelector('[data-testid="units-prompt-open"]')?.click();
				for (let i = 0; i < 40 && !document.querySelector('.tool-panel'); i++) {
					await new Promise((r) => setTimeout(r, 50));
				}
				return [
					document.querySelector('.tool-panel') ? 'panel open' : 'no panel',
					document.querySelector('[data-testid="units-prompt"]') ? 'prompt still up' : 'prompt gone'
				];
			}`,
			expected: ['panel open', 'prompt gone'],
			label: 'Set up units opens the unit manager and retires the prompt'
		}
	]
};
