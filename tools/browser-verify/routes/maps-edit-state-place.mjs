export default {
	path: '/dev/maps-edit?state=place',
	label: 'Maps editor harness (Workbench B open: dimensioned shape placement, drag and snap)',
	/* THE PLAN CANVAS ON ITS OWN. Workbench B is a unit with an outline, a
	   position and NO compartments, so this state measures the placement
	   surface without the front elevation on top of it (that is ?state=unit).

	   The two orderResult probes are the whole point of this file: they are
	   claims about what a POINTER DOES, which no presence, contrast or
	   geometry read can settle. Both dispatch real PointerEvents at the shape's
	   own measured box and read the TYPED INPUTS afterwards -- the fields are
	   where the value lives, so reading them is reading the thing the spec's
	   rule is about. */
	presence: [
		{
			selector: '[data-testid="maps-plan-canvas"]',
			label: 'the plan canvas on a placed unit',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-plan-shape"]',
			label: 'the draggable shape, drawn from the typed dimensions',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-plan-sibling"]',
			label: 'the one placed sibling drawn as context (Tool Chest A), which is also the snap target',
			expectPresent: 1,
			expectVisible: 1,
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
			/* Workbench B holds no compartments, so its elevation is the EMPTY
			   state rather than a stack. The absence of rows here has its
			   positive control in maps-edit-state-unit.mjs, where the same
			   selector matches 2. */
			selector: '[data-testid="maps-elevation-rows"]',
			label: 'NO elevation rows on a unit with no compartments',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-elevation-empty"]',
			label: 'the empty elevation says so instead of rendering nothing',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	orderResult: [
		{
			label: 'A DRAG MOVES THE POSITION AND CHANGES NO TYPED DIMENSION',
			/* Reads width, depth and rotation before and after a real drag of
			   the shape. The expected value states them twice on purpose: the
			   assertion is that the three dimensions are the SAME strings
			   after, and that X did move, so a drag that did nothing at all
			   fails on the last element rather than passing on the first three. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const shape = q('[data-testid="maps-plan-shape"]');
				const w = q('input[id$="-rect-w"]');
				const h = q('input[id$="-rect-h"]');
				const rot = q('input[id$="-rot"]');
				const x = q('input[id$="-pos-x"]');
				if (!shape || !w || !h || !x) return ['no shape or no typed fields'];
				const before = [w.value, h.value, rot ? rot.value : '', x.value];
				const r = shape.getBoundingClientRect();
				const cx = r.left + r.width / 2;
				const cy = r.top + r.height / 2;
				const fire = (t, X, Y) =>
					shape.dispatchEvent(
						new PointerEvent(t, { bubbles: true, cancelable: true, clientX: X, clientY: Y, pointerId: 1 })
					);
				fire('pointerdown', cx, cy);
				fire('pointermove', cx + 90, cy);
				fire('pointerup', cx + 90, cy);
				await new Promise((r2) => setTimeout(r2, 60));
				return [
					w.value === before[0] ? 'width held' : 'width MOVED ' + before[0] + '->' + w.value,
					h.value === before[1] ? 'depth held' : 'depth MOVED ' + before[1] + '->' + h.value,
					(rot ? rot.value : '') === before[2] ? 'rotation held' : 'rotation MOVED',
					x.value !== before[3] ? 'x moved' : 'x stuck at ' + x.value
				];
			}`,
			expected: ['width held', 'depth held', 'rotation held', 'x moved']
		},
		{
			label: 'SNAPPING LANDS ON THE VALUE IT CLAIMS: the bench edge onto the chest edge, at 30in',
			/* Tool Chest A is 30x18 turned 90 degrees at (30, 12), so it
			   occupies x = 12 .. 30 in the Machine Shop's frame. Dragging the
			   bench so its own leading edge wants 28.5in puts it 1.5in short of
			   the chest's trailing edge at 30 -- inside the tolerance, at both
			   widths, because the tolerance is 7 PIXELS converted to inches and
			   the plan is drawn smaller at 375. The pixel delta is computed
			   from the frame's own measured width rather than written down, so
			   this probe is scale-independent and does not silently start
			   testing a different inch value at a different viewport. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const shape = q('[data-testid="maps-plan-shape"]');
				const frame = q('[data-testid="maps-plan-frame"]');
				const x = q('input[id$="-pos-x"]');
				if (!shape || !frame || !x) return ['no shape, frame or field'];
				const pxPerInch = frame.getBoundingClientRect().width / 400; // Machine Shop is 400in wide
				const r = shape.getBoundingClientRect();
				const cx = r.left + r.width / 2;
				const cy = r.top + r.height / 2;
				const dx = (28.5 - Number(x.value)) * pxPerInch;
				const fire = (t, X, Y) =>
					shape.dispatchEvent(
						new PointerEvent(t, { bubbles: true, cancelable: true, clientX: X, clientY: Y, pointerId: 1 })
					);
				fire('pointerdown', cx, cy);
				fire('pointermove', cx + dx, cy);
				fire('pointerup', cx + dx, cy);
				await new Promise((r2) => setTimeout(r2, 60));
				const note = (q('[data-testid="maps-plan-snap-note"]').textContent || '').replace(/\\s+/g, ' ');
				return [
					x.value,
					note.includes('leading edge onto the trailing edge of Tool Chest A') ? 'named the edge' : 'said: ' + note
				];
			}`,
			expected: ['30', 'named the edge']
		},
		{
			label: 'THE KEYBOARD REACHES THE SAME MOVE: an arrow key nudges the typed value by one inch',
			/* "Every drag interaction needs a keyboard path." The arrow key is
			   dispatched at the shape's own handler; the nudge is exact
			   arithmetic (a nudge does not snap, by design), so the expected
			   value is the starting inch plus one. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const shape = q('[data-testid="maps-plan-shape"]');
				const x = q('input[id$="-pos-x"]');
				const y = q('input[id$="-pos-y"]');
				if (!shape || !x || !y) return ['no shape or no typed fields'];
				const before = [Number(x.value), Number(y.value)];
				shape.focus();
				const focused = document.activeElement === shape ? 'shape focusable' : 'shape NOT focusable';
				shape.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
				await new Promise((r) => setTimeout(r, 40));
				shape.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
				await new Promise((r) => setTimeout(r, 40));
				return [focused, String(Number(x.value) - before[0]), String(Number(y.value) - before[1])];
			}`,
			expected: ['shape focusable', '1', '1']
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-plan-parent-note"]',
			label: 'parent assignment is stated as NOT inferred from overlap, where the overlap happens',
			must: ['does not put it inside it', 'Inside picker'],
			mustNot: ['drop it on']
		},
		{
			selector: '[data-testid="maps-plan-canvas"] .hint',
			label: 'the typed-dimension rule, in words, beside the drawing',
			must: ['never resizes it', 'typed dimensions']
		},
		{
			selector: '[data-testid="maps-plan-snap-note"]',
			label: 'the snap readout exists before anything has moved and says so',
			must: ['Nothing moved yet']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-plan-canvas"] .hint', label: 'the placement rule copy', min: 4.5 },
		{ selector: '[data-testid="maps-plan-snap-note"]', label: 'the snap readout', min: 4.5 },
		{ selector: '[data-testid="maps-plan-readout"]', label: 'the live X/Y readout', min: 4.5 },
		{ selector: '[data-testid="maps-plan-nudge"] legend', label: 'the nudge-step legend', min: 4.5 },
		{ selector: '[data-testid="maps-plan-nudge"] .step-option', label: 'the nudge-step choice', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-plan-nudge"] .pad-btn', label: 'nudge and snap controls', min: 44 },
		{ selector: '[data-testid="maps-plan-nudge"] .step-option', label: 'nudge-step radio labels', min: 44 }
		/* The drawn SHAPE is deliberately not here. It is a scale drawing of a
		   72in bench in a 400in room, so its box is dictated by the data:
		   inflating it to clear 44px would make the plan lie about the
		   dimension it exists to show (CLAUDE.md's locked-density exception,
		   stated rather than taken silently). Every control that MOVES it --
		   the five pad buttons above, the two step radios, and the typed
		   inputs measured on the other maps specs -- clears the floor. */
	]
};
