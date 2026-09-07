export default {
	path: '/dev/maps-editor?state=compartment',
	label: "Maps workspace (Drawer 1 open: a compartment's stage is its unit's elevation, drawn at the typed height)",
	/* A COMPARTMENT HAS NO PLAN GEOMETRY, so its stage is the SKETCH of its
	   unit's front elevation with this drawer marked -- read-only, because the
	   editor for that stack lives on the unit and two editable copies of one
	   height on one screen is the pair that stops agreeing. The probe types a
	   new height into the inspector and reads the marked slot's DRAWN height
	   against its neighbour's: Drawer 2 is 5in, so typing 6 must draw 1.200. */
	presence: [
		{
			selector: '[data-testid="maps-elevation-sketch"]',
			label: "the unit's elevation sketch as the compartment's stage",
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-elevation-sketch-marked"]',
			label: 'exactly one marked slot: this drawer',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-plan-canvas"]',
			label: 'NO plan sheet for a compartment (positive control: maps-editor-state-room.mjs)',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-unit-elevation"]',
			label: 'NO elevation EDITOR here: that is the unit\'s, and a second editable copy of the height is refused',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-elevation-fields"]',
			label: 'the typed slot fields in the inspector',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	orderResult: [
		{
			label: 'TYPING A HEIGHT MAKES THE DRAWN DRAWER TALLER: 3in -> 6in against a 5in neighbour draws 1.200',
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const marked = q('[data-testid="maps-elevation-sketch-marked"]');
				const rows = Array.from(document.querySelectorAll('[data-testid="maps-elevation-sketch-stack"] .slot'));
				const other = rows.find((el) => el !== marked);
				const h = q('input[id$="-elev-h"]');
				if (!marked || !other || !h) return ['no marked slot, neighbour or height field'];
				const before = (marked.getBoundingClientRect().height / other.getBoundingClientRect().height).toFixed(3);
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				setter.call(h, '6');
				h.dispatchEvent(new Event('input', { bubbles: true }));
				await new Promise((r) => setTimeout(r, 120));
				const after = (marked.getBoundingClientRect().height / other.getBoundingClientRect().height).toFixed(3);
				return ['before ' + before, 'after ' + after, (marked.textContent || '').replace(/\\s+/g, ' ').includes('6″') ? 'label reads 6″' : 'label: ' + marked.textContent];
			}`,
			// Drawer 1 is 3in and Drawer 2 is 5in: 0.600 before, 1.200 after.
			expected: ['before 0.600', 'after 1.200', 'label reads 6″']
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-elevation-sketch"] .hint',
			label: 'the sketch says what a compartment is drawn in and where the stack is edited',
			must: ['no plan geometry', 'slot 1 of 2', 'edited on the unit']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-elevation-sketch"] .hint', label: 'the sketch hint', min: 4.5 },
		{ selector: '[data-testid="maps-elevation-sketch"] .slot-name', label: 'a drawn slot name', min: 4.5 },
		{ selector: '[data-testid="maps-elevation-sketch"] .slot-size', label: 'a drawn slot size', min: 4.5 },
		{ selector: '[data-testid="maps-elevation-sketch"] .meta', label: 'the stack meta line', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-elevation-sketch"] button.slot', label: 'the other slots, as ways into them', min: 24 },
		{ selector: '[data-testid="maps-elevation-fields"] input', label: 'the typed slot inputs', min: 44 }
		/* The drawn slots are scale drawings of typed heights (a 3in drawer is
		   drawn at 3 x 12px = 36px), so they clear the 24px absolute floor and
		   deliberately not 44: inflating them would make the stack lie about the
		   height it exists to show. The tree row and the elevation editor on the
		   unit are the 44px ways to the same compartments. */
	]
};
