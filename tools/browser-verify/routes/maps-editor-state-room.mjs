export default {
	path: '/dev/maps-editor?state=room',
	label: 'Maps workspace (Machine Shop open: the room in its building, its units inside it, the numbers on the drawing)',
	/* THE STATE THE BRIEF IS ABOUT. A room selected: the stage draws the
	   BUILDING'S frame with the Mill Room beside it, the Machine Shop as the
	   editable shape with its two units inside it, and four dimension labels
	   (width, depth, X and Y offsets) drawn on the sheet; the inspector beside
	   it holds the typed fields. The orderResult probes are the three claims
	   this bundle exists for -- typing moves the drawing, dragging never moves
	   a dimension, undo takes a drag back -- each read off the DRAWN GEOMETRY
	   or the typed fields, never off the source. */
	presence: [
		{
			selector: '[data-testid="maps-node-detail"] [data-testid="maps-node-stage"]',
			label: 'the stage (the drawing), inside the node detail',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-node-detail"] [data-testid="maps-node-inspector"]',
			label: 'the inspector (the form), beside it',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-plan-shape"]',
			label: 'the room as the ONE editable shape',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-plan-sibling"]',
			label: 'its one sibling room drawn as context (Mill Room)',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-plan-child"]',
			label: 'its two units drawn INSIDE it (Tool Chest A, Workbench B): they move with the room',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="maps-plan-dim-w"], [data-testid="maps-plan-dim-h"], [data-testid="maps-plan-dim-x"], [data-testid="maps-plan-dim-y"]',
			label: 'four dimension labels on the drawing: width, depth, X offset, Y offset',
			expectPresent: 4,
			maxPresent: 4
		},
		{
			selector: '[data-testid="maps-plan-tools"] .tool-btn',
			label: 'the sheet tools: Fit, zoom out, zoom in, Undo',
			expectPresent: 4,
			expectVisible: 4,
			maxPresent: 4
		},
		{
			selector: '[data-testid="maps-plan-undo"][aria-disabled="true"]',
			label: 'Undo is disabled (and says so) before anything has moved',
			expectPresent: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-plan-nudge"] .pad-btn',
			label: 'the keyboard-and-touch path: four nudges and a snap',
			expectPresent: 5,
			expectVisible: 5,
			maxPresent: 5
		},
		{
			selector: '[data-testid="maps-overview"]',
			label: 'NO overview once something is selected',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-node-detail"] canvas',
			label: 'NO <canvas> element: shapes are buttons, dimensions are SVG',
			expectPresent: 0
		}
	],
	orderResult: [
		{
			label: 'TYPING A WIDTH MOVES THE DRAWING: the shape widens by the typed ratio and the dimension label reads the new number',
			/* The width field is set 400 -> 480 (x1.2) and the SHAPE'S OWN BOX is
			   read back, along with the dimension text drawn on the sheet. The
			   depth box is read too and must be unchanged, so a change that
			   scaled the whole sheet would fail on it. Read off the DOM
			   geometry, never off the field: the field holding 480 is what the
			   person typed, not what they see. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const shape = q('[data-testid="maps-plan-shape"]');
				const w = q('input[id$="-rect-w"]');
				const dim = q('[data-testid="maps-plan-dim-w"]');
				if (!shape || !w || !dim) return ['no shape, field or dimension'];
				const before = shape.getBoundingClientRect();
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				setter.call(w, '480');
				w.dispatchEvent(new Event('input', { bubbles: true }));
				await new Promise((r) => setTimeout(r, 120));
				const after = shape.getBoundingClientRect();
				return [
					'shape widened ' + (after.width / before.width).toFixed(3),
					'dim reads ' + (dim.textContent || '').trim(),
					Math.abs(after.height - before.height) < 0.5 ? 'depth held' : 'depth MOVED ' + before.height + '->' + after.height
				];
			}`,
			expected: ['shape widened 1.200', 'dim reads 480″', 'depth held']
		},
		{
			label: 'A DRAG MOVES THE POSITION, CHANGES NO TYPED DIMENSION, AND UNDO TAKES IT BACK',
			/* Reads width, depth and rotation before and after a real drag, then
			   presses Undo and reads X again. A drag that did nothing fails on
			   'x moved'; an undo that did nothing fails on the last element. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const shape = q('[data-testid="maps-plan-shape"]');
				const w = q('input[id$="-rect-w"]'), h = q('input[id$="-rect-h"]'), rot = q('input[id$="-rot"]'), x = q('input[id$="-pos-x"]');
				const undo = q('[data-testid="maps-plan-undo"]');
				if (!shape || !w || !h || !x || !undo) return ['no shape, fields or undo'];
				const before = [w.value, h.value, rot ? rot.value : '', x.value];
				const r = shape.getBoundingClientRect();
				const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
				const fire = (t, X, Y) => shape.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: X, clientY: Y, pointerId: 1 }));
				fire('pointerdown', cx, cy); fire('pointermove', cx + 60, cy); fire('pointerup', cx + 60, cy);
				await new Promise((r2) => setTimeout(r2, 80));
				const moved = x.value !== before[3];
				const dimsHeld = w.value === before[0] && h.value === before[1] && (rot ? rot.value : '') === before[2];
				undo.click();
				await new Promise((r2) => setTimeout(r2, 80));
				return [moved ? 'x moved' : 'x stuck at ' + x.value, dimsHeld ? 'dims held' : 'a dimension MOVED', x.value === before[3] ? 'undo restored x' : 'undo left x at ' + x.value];
			}`,
			expected: ['x moved', 'dims held', 'undo restored x']
		},
		{
			label: 'CLICKING A UNIT DRAWN INSIDE THE ROOM OPENS IT, AND THE TREE FOLLOWS',
			evaluate: `async () => {
				const units = Array.from(document.querySelectorAll('[data-testid="maps-plan-child"]'));
				const target = units.find((b) => (b.getAttribute('aria-label') || '').startsWith('Workbench B'));
				if (!target) return ['no Workbench B shape'];
				for (let i = 1; i <= 20; i += 1) {
					target.click();
					await new Promise((r) => setTimeout(r, 150));
					const h2 = document.querySelector('[data-testid="maps-node-inspector"] h2');
					if (h2 && /Workbench B/.test(h2.textContent || '')) {
						const current = document.querySelector('[data-testid="maps-node-tree"] .tree-row[aria-current="true"] .row-name');
						return ['opened Workbench B', current && /Workbench B/.test(current.textContent || '') ? 'tree followed' : 'tree did not follow'];
					}
				}
				return ['never opened'];
			}`,
			expected: ['opened Workbench B', 'tree followed']
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-plan-dim-w"]',
			label: 'the width label reads the typed width',
			must: ['400″']
		},
		{
			selector: '[data-testid="maps-plan-dim-h"]',
			label: 'the depth label reads the typed depth',
			must: ['300″']
		},
		{
			selector: '[data-testid="maps-plan-dim-x"], [data-testid="maps-plan-dim-y"]',
			label: 'the offsets from the building origin, named X and Y',
			must: ['X 0″', 'Y 0″']
		},
		{
			selector: '[data-testid="maps-plan-canvas"] .hint',
			label: 'the typed-dimension rule, in words, beside the drawing',
			must: ['never resizes it', 'typed dimensions']
		},
		{
			selector: '[data-testid="maps-geometry-fields"] .hint',
			label: 'the geometry section no longer calls the drawing a later bundle',
			must: ['redraws as you type'],
			mustNot: ['later bundle']
		},
		{
			selector: '[data-testid="maps-plan-snap-note"]',
			label: 'the snap readout names Undo and its key',
			must: ['Nothing moved yet', 'Ctrl+Z']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-plan-shape"] .drawn-name', label: 'the edited shape name over its accent fill', min: 4.5 },
		{ selector: '[data-testid="maps-plan-sibling"] .drawn-name', label: 'a sibling name over its fill', min: 4.5 },
		/* No `.drawn-name` row on the CHILDREN here, deliberately: the two units
		   inside a 400in room are drawn 9px and 36px wide at fit, under the 44px
		   at which a shape carries a name at all (its aria-label stays). The
		   child-name contrast is measured on the overview spec, where the
		   children are 400in rooms in a 1200in building and do carry one. */
		{ selector: '[data-testid="maps-plan-readout"]', label: 'the live readout', min: 4.5 },
		{ selector: '[data-testid="maps-plan-zoom"]', label: 'the zoom percentage', min: 4.5 },
		{ selector: '[data-testid="maps-plan-canvas"] .hint', label: 'the sheet hints', min: 4.5 },
		{ selector: '[data-testid="maps-plan-snap-note"]', label: 'the snap readout', min: 4.5 },
		{ selector: '[data-testid="maps-plan-tools"] .tool-btn', label: 'the sheet tool labels', min: 4.5 },
		{ selector: '[data-testid="maps-node-inspector"] label', label: 'inspector field labels', min: 4.5 },
		{ selector: '[data-testid="maps-node-inspector"] .crumb', label: 'the containment crumb', min: 4.5 },
		{ selector: '[data-testid="maps-plan-frame-size"]', label: 'frame size', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-plan-tools"] .tool-btn', label: 'Fit, zoom and Undo', min: 44 },
		{ selector: '[data-testid="maps-plan-nudge"] .pad-btn', label: 'nudge and snap controls', min: 44 },
		{ selector: '[data-testid="maps-plan-nudge"] .step-option', label: 'nudge-step radio labels', min: 44 },
		{ selector: '[data-testid="maps-geometry-fields"] input', label: 'typed-inch inputs in the inspector', min: 44 },
		{ selector: '[data-testid="maps-node-inspector"] .actions .btn', label: 'save controls', min: 44 },
		{ selector: '[data-testid="maps-node-tree"] .tree-row', label: 'tree rows', min: 44 }
		/* The drawn shapes are scale drawings and are deliberately not here;
		   see maps-editor.mjs. Zooming in is the way to make one a bigger
		   target, and it changes nothing but pixels. */
	]
};
