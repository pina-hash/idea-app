export default {
	path: '/dev/maps-editor?state=root',
	label: "Maps workspace (IDEA Building open: a root's OWN outline is the frame, live from the typed fields)",
	/* A ROOT HAS NO PARENT FRAME, and before prompt 0093 the canvas therefore
	   drew nothing for one -- a new building with 600 x 400 typed showed one
	   sentence. Now the sheet IS the root's outline, redrawn from the typed
	   fields, with its rooms inside it. The probe types a new width and reads
	   the FRAME'S ASPECT RATIO, which is scale-independent: 1200/800 = 1.500
	   before, 1500/800 = 1.875 after, whichever way the fit happens to bound
	   the drawing at this viewport. */
	presence: [
		{
			selector: '[data-testid="maps-node-detail"] [data-testid="maps-plan-frame"]',
			label: "the building's own frame, on its own sheet",
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-plan-child"]',
			label: 'its two placed rooms inside it',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="maps-plan-shape"]',
			label: 'NO editable shape: a root is not placed in anything',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-plan-nudge"]',
			label: 'NO nudge pad: nothing to move',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-plan-tools"]',
			label: 'the zoom tools stay: a big building wants zooming in',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	orderResult: [
		{
			label: "TYPING THE BUILDING'S WIDTH REDRAWS ITS OWN FRAME: aspect 1.500 -> 1.875, and the size label follows",
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const frame = q('[data-testid="maps-plan-frame"]');
				const w = q('input[id$="-rect-w"]');
				const size = q('[data-testid="maps-plan-frame-size"]');
				if (!frame || !w || !size) return ['no frame, field or size label'];
				/* The frame's INSIDE, where the plan is drawn, at sub-pixel
				   precision: the bounding box less its border. Two earlier drafts of
				   this probe measured the wrong thing -- the raw bounding box adds
				   the 1px border on each side (600x400 read 1.495), and
				   clientWidth/clientHeight are rounded to whole pixels (1.502) --
				   both measured, both fixed here. */
				const inside = () => {
					const r = frame.getBoundingClientRect();
					const c = getComputedStyle(frame);
					const bw = parseFloat(c.borderLeftWidth) + parseFloat(c.borderRightWidth);
					const bh = parseFloat(c.borderTopWidth) + parseFloat(c.borderBottomWidth);
					return (r.width - bw) / (r.height - bh);
				};
				const a0 = inside();
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				setter.call(w, '1500');
				w.dispatchEvent(new Event('input', { bubbles: true }));
				await new Promise((r) => setTimeout(r, 150));
				const a1 = inside();
				return ['before ' + a0.toFixed(3), 'after ' + a1.toFixed(3), (size.textContent || '').replace(/\\s+/g, ' ').trim()];
			}`,
			expected: ['before 1.500', 'after 1.875', 'building 1500″ × 800″']
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-plan-reason"]',
			label: 'the root sentence says its outline is the frame and what is inside is drawn',
			must: ['no frame to be placed in', 'drawn here']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-plan-reason"]', label: 'the root sentence', min: 4.5 },
		{ selector: '[data-testid="maps-plan-child"] .drawn-size', label: 'a drawn room size', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="maps-plan-tools"] .tool-btn', label: 'zoom tools', min: 44 }]
};
