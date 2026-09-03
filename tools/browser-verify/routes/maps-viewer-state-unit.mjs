export default {
	path: '/dev/maps-viewer?state=unit',
	label:
		'IDEA Maps viewer at a unit (the front elevation: the last ten feet, drawn in proportion and still tappable)',
	/* THE POSITIVE CONTROL FOR THE ROOM SPEC'S "no elevation" ZERO, and the
	   one place the elevation's central compromise is measured: a compartment
	   row is drawn at its share of the typed stack height AND is never allowed
	   below 44px, because unlike a plan shape the row IS the control. A stack
	   of ten one-inch drawers must be ten tappable rows, not ten slivers. */
	presence: [
		{
			selector: '[data-testid="maps-viewer-elevation"]',
			label: 'the front elevation',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-viewer-plan"]',
			label: 'NO plan: a unit is shown as an elevation, never both',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-viewer-stack"] a',
			label: 'every compartment in the stack, each a link into it',
			expectPresent: 3,
			expectVisible: 3
		}
	],
	orderResult: [
		{
			label: 'THE STACK IS TOP-FIRST, IN PROPORTION, AND NEVER BELOW THE TAP FLOOR',
			/* Three claims one measurement can settle and a presence check
			   cannot: the order is `elevation_order` ascending, a 9in drawer is
			   drawn taller than a 3in one, and neither is under 44px. */
			evaluate: `() => {
				const slots = [...document.querySelectorAll('[data-testid="maps-viewer-stack"] a')];
				const names = slots.map((a) => a.querySelector('.mv-slot-name').textContent.trim());
				const heights = slots.map((a) => Math.round(a.getBoundingClientRect().height));
				return [
					names.join(' / '),
					heights[1] > heights[0] ? 'the 9in drawer is drawn taller than the 3in one' : 'PROPORTION LOST: ' + heights.join('/'),
					// The floor is asserted as a PROPERTY, not as an exact number:
					// this stack's shortest slot is above it in proportion, and
					// pinning the pixel here would make an ordinary change to the
					// fixture's inches read as a regression. The state where the
					// floor genuinely bites is the thin-stack state.
					Math.min(...heights) >= 44 ? 'nothing under the floor' : 'UNDER THE FLOOR at ' + Math.min(...heights) + 'px'
				];
			}`,
			expected: [
				'Drawer 1 / Drawer 2 / Bottom bay',
				'the 9in drawer is drawn taller than the 3in one',
				'nothing under the floor'
			]
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-viewer-stack"]',
			label: 'each slot says its typed height, and an unsized one says it has none',
			must: ['3 in', '9 in', 'height not recorded']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-viewer-stack"] .mv-slot-name', label: 'a compartment name', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-stack"] .mv-slot-meta', label: 'the height and subtype beside it', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-viewer-stack"] a', label: 'every compartment in the stack', min: 44 }
	]
};
