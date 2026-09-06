export default {
	path: '/dev/maps-editor?state=new-room',
	label: 'Maps workspace (a NEW room in the building: typed size draws a ghost before any position exists)',
	/* THE STATE MR. PINA REPORTED. Before prompt 0093 a new room with a typed
	   width and depth drew NOTHING until BOTH position fields were typed too.
	   Now the moment both dimensions are numbers the shape is drawn as a GHOST
	   in the middle of the building, and Place here (or a drag) writes its
	   position into the typed fields. The probe types the two numbers and reads
	   the sheet and then the fields. */
	presence: [
		{
			selector: '[data-testid="maps-plan-canvas"]',
			label: "the sheet is up from the first frame, drawing the building's frame and its two rooms",
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-plan-sibling"]',
			label: 'both existing rooms drawn as siblings of the new one',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="maps-plan-shape"], [data-testid="maps-plan-ghost"]',
			label: 'NO shape and NO ghost before an outline is typed (its control is the probe below)',
			expectPresent: 0
		}
	],
	orderResult: [
		{
			label: 'TYPE A WIDTH AND A DEPTH: A GHOST APPEARS; PLACE HERE WRITES ITS CENTRE INTO THE TYPED FIELDS',
			/* The building is 1200 x 800 and the ghost is 240 x 180 centred, so
			   accepting it must type X 480 and Y 310 -- numbers derived from the
			   fixture's own inches, never read off the implementation. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				const type = (sel, v) => { const el = q(sel); if (!el) throw new Error('no ' + sel); setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
				const outline = q('select[id$="-outline"]');
				if (!outline) return ['no outline picker'];
				outline.value = 'rect';
				outline.dispatchEvent(new Event('change', { bubbles: true }));
				await new Promise((r) => setTimeout(r, 80));
				type('input[id$="-rect-w"]', '240');
				type('input[id$="-rect-h"]', '180');
				await new Promise((r) => setTimeout(r, 120));
				const ghost = q('[data-testid="maps-plan-ghost"]');
				const reason = (q('[data-testid="maps-plan-reason"]')?.textContent || '').replace(/\\s+/g, ' ');
				if (!ghost) return ['no ghost drawn; reason: ' + reason];
				const place = q('[data-testid="maps-plan-place-ghost"]');
				if (!place) return ['ghost drawn', 'no Place here control'];
				place.click();
				await new Promise((r) => setTimeout(r, 120));
				const x = q('input[id$="-pos-x"]').value, y = q('input[id$="-pos-y"]').value;
				return ['ghost drawn', 'placed at ' + x + ', ' + y, q('[data-testid="maps-plan-shape"]') ? 'shape drawn' : 'no shape after placing'];
			}`,
			expected: ['ghost drawn', 'placed at 480, 310', 'shape drawn']
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-plan-reason"]',
			label: 'the sheet says what it needs before an outline exists',
			must: ['Type an outline', 'drawn to scale']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-plan-reason"]', label: 'the reason sentence', min: 4.5 },
		{ selector: '[data-testid="maps-node-inspector"] h2', label: 'the new-container heading', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-plan-tools"] .tool-btn', label: 'sheet tools', min: 44 },
		{ selector: '[data-testid="maps-geometry-fields"] input', label: 'typed-inch inputs', min: 44 }
	]
};
