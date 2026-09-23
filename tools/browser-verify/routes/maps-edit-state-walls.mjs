export default {
	path: '/dev/maps-edit?state=walls',
	label:
		'Maps editor with wall thicknesses on -- the SAME surface as ?state=place, where the two snap faces are either different things or the decision is just a sentence',
	/* WHY THIS FILE IS THE SAME SHAPE AS maps-edit-state-place.mjs. Both open
	   Workbench B on the plan canvas; the only difference is that this one's
	   fixture carries walls. So the two are directly comparable, and the
	   claim that matters can be measured rather than argued:

	     * THE PARENT OFFERS ITS INNER FACE, which is the outline exactly as
	       typed, so the Machine Shop's 9 inch wall changes NO snap value in
	       the editor. `place`'s probe lands the bench at 30in; so does this
	       one. A toolbox pushed against a wall sits against the plaster.
	     * A SIBLING OFFERS ITS OUTER FACE. Tool Chest A carries 3 inches, so
	       the face the bench meets is three inches wider on every side than
	       the box the editor drew before 0224.

	   And the sheet DRAWS what it offers -- this component's own stated rule
	   about the frame, extended to what the frame gained. A wall the drawing
	   does not show is a shape snapping somewhere other than where it looks. */
	presence: [
		{
			selector: '[data-testid="maps-plan-wall-frame"]',
			label: 'the frame (the Machine Shop) draws its own 9 inch wall',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-plan-wall"]',
			label: 'and the one placed sibling (Tool Chest A, 3in) draws the OUTER face it offers',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-plan-sibling"]',
			label:
				'the sibling itself is still drawn and still selectable -- THE POSITIVE CONTROL for the band count above',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-node-walls"] input',
			label: 'the form offers both fields: this one own wall, and the default for what is inside',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		}
	],
	orderResult: [
		{
			label:
				'TYPING A WALL THICKNESS MARKS THE FORM DIRTY, so the unsaved-work guard can see it',
			/* THE DEFECT THIS EXISTS FOR IS SILENT AND WAS REAL. `EditBaseline`
			   answers `changed` from ONE signature string, so a field missing
			   from that string is a field the surface cannot see being edited:
			   the save indicator stays absent, the navigation guard does not
			   fire, and the number is gone on the next click with nothing
			   anywhere reporting it. Both wall fields were missing from that
			   signature until this check was written.

			   IT TESTS ONE FIELD AND CARRIES ITS OWN CONTROL, rather than using
			   a neighbouring field as the control. The save state is ONE-WAY --
			   once a form is dirty it stays dirty -- so a second field measured
			   on the same mount reads `dirty` whatever it does, which is a pass
			   that means nothing. The control here is a NO-OP INPUT on the same
			   field: setting it to the value it already holds must leave the
			   indicator absent, which is what rules out "any input event
			   dirties this form" and makes the transition below evidence. The
			   OTHER field has its own state, `?state=walls-default`, for the
			   same reason.

			   IT RUNS FIRST AND PUTS THE FIELD BACK. These probes share one
			   form, and leaving a 7 in the wall field would change Workbench
			   B's own resolved thickness from the inherited 6 to 7 and move the
			   snap probe's answer from 39 to 40 -- a probe quietly testing a
			   different claim than the one it states. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const FIELD = 'input[id$="-wall"]';
				const ind = () => q('.save-ind');
				const state = () =>
					ind() ? [...ind().classList].find((c) => c !== 'save-ind' && !c.startsWith('svelte-')) : 'absent';
				const set = (v) => {
					const el = q(FIELD);
					el.value = v;
					el.dispatchEvent(new Event('input', { bubbles: true }));
				};
				const settleFor = async (ms) => { await new Promise((r) => setTimeout(r, ms)); return state(); };
				const waitDirty = async () => {
					for (let i = 0; i < 40; i += 1) {
						if (state() === 'dirty') return 'dirty after ' + (i + 1) + ' poll(s)';
						await new Promise((r) => setTimeout(r, 50));
					}
					return 'NEVER WENT DIRTY (' + state() + ')';
				};
				const atRest = state();
				const was = q(FIELD).value;
				set(was);
				const afterNoop = await settleFor(500);
				set('7');
				const went = await waitDirty();
				set(was);
				await new Promise((r) => setTimeout(r, 120));
				console.info('[walls] dirty: rest=' + atRest + ' noop=' + afterNoop + ' changed=' + went);
				return [
					atRest === 'absent' ? 'at rest the indicator is absent, because there is nothing to report' : 'AT REST IT SAID ' + atRest,
					afterNoop === 'absent' ? 'CONTROL: an input event that changes nothing leaves it absent' : 'CONTROL FAILED: a no-op input went ' + afterNoop,
					went.startsWith('dirty') ? 'and a real change to the wall field goes dirty' : 'THE WALL FIELD DID NOT: ' + went
				];
			}`,
			expected: [
				'at rest the indicator is absent, because there is nothing to report',
				'CONTROL: an input event that changes nothing leaves it absent',
				'and a real change to the wall field goes dirty'
			]
		},
		{
			label:
				'THE PARENT IS OFFERED BY ITS INNER FACE: a 9 inch wall on the room moves the frame box not at all',
			/* Decision 36's central promise, on the editor side, READ IN INCHES
			   off the band's own viewBox rather than in pixels off a client
			   rect. Two reasons, and the second is the one that bit: the
			   answer is then scale-independent so this is the same claim at
			   both widths, and `.plan-frame` carries a 1px border under
			   `box-sizing: content-box`, so its client rect is two pixels wider
			   than the box it draws and a pixel comparison came back lopsided
			   by exactly that.

			   The Machine Shop is 400 x 300 inches. Its band's viewBox is the
			   EXTERIOR, which must be 400 + 2*9 by 300 + 2*9. */
			evaluate: `() => {
				const wall = document.querySelector('[data-testid="maps-plan-wall-frame"]');
				const t = Number(wall.dataset.thicknessIn);
				const vb = wall.getAttribute('viewBox').split(' ').map(Number);
				const frame = document.querySelector('[data-testid="maps-plan-frame"]');
				const fr = frame.getBoundingClientRect();
				const wr = wall.getBoundingClientRect();
				return [
					'interior 400 x 300 in typed, wall ' + t + 'in',
					'exterior ' + vb[2] + ' x ' + vb[3] + ' in',
					vb[2] === 400 + 2 * t && vb[3] === 300 + 2 * t ? 'which is the interior grown outward by the typed thickness on every side' : 'NOT THE INTERIOR GROWN OUTWARD',
					wr.left < fr.left && wr.right > fr.right && wr.top < fr.top && wr.bottom > fr.bottom ? 'and the band is drawn outside the frame on all four sides' : 'THE BAND IS NOT OUTSIDE THE FRAME'
				];
			}`,
			expected: [
				'interior 400 x 300 in typed, wall 9in',
				'exterior 418 x 318 in',
				'which is the interior grown outward by the typed thickness on every side',
				'and the band is drawn outside the frame on all four sides'
			]
		},
		{
			label:
				'A SIBLING IS OFFERED BY ITS OUTER FACE: Tool Chest A is 30 x 18, and the face it offers is 3 inches wider on every side',
			/* The half that DID change. The sibling's band IS its snap target,
			   so the drawing and `mapsSnapTargets` have to agree about where
			   that face is -- which is this component's own stated reason for
			   drawing the frame at all. Inches again, off the band's viewBox,
			   so the claim does not move with the scale. */
			evaluate: `() => {
				const band = document.querySelector('[data-testid="maps-plan-wall"]');
				const t = Number(band.dataset.thicknessIn);
				const vb = band.getAttribute('viewBox').split(' ').map(Number);
				const sib = document.querySelector('[data-testid="maps-plan-sibling"]');
				const sr = sib.getBoundingClientRect();
				const br = band.getBoundingClientRect();
				// Tool Chest A is 30 x 18 turned 90 degrees, so its INNER box is
				// 18 x 30 and its outer face is that grown by t on every side.
				// ROUNDED TO 4dp, because this shape is turned 90 degrees and
				// Math.cos of a right angle is not exactly zero -- the inner box
				// carries the same 1e-14 dust and always has. Rounding the
				// REPORT keeps the claim about the geometry rather than about
				// IEEE754; the tolerance below is what actually judges it.
				const r4 = (v) => Math.round(v * 10000) / 10000;
				return [
					'inner 18 x 30 in, wall ' + t + 'in',
					'outer ' + r4(vb[2]) + ' x ' + r4(vb[3]) + ' in',
					Math.abs(vb[2] - (18 + 2 * t)) < 1e-9 && Math.abs(vb[3] - (30 + 2 * t)) < 1e-9 ? 'which is the outer face, not the inner one' : 'NOT THE OUTER FACE',
					br.left < sr.left && br.right > sr.right ? 'and it is drawn outside the sibling box the editor already drew' : 'NOT OUTSIDE THE SIBLING'
				];
			}`,
			expected: [
				'inner 18 x 30 in, wall 3in',
				'outer 24 x 36 in',
				'which is the outer face, not the inner one',
				'and it is drawn outside the sibling box the editor already drew'
			]
		},
		{
			label:
				'THE SUBSTANTIVE EDITOR CHANGE: a sibling snap moves by BOTH walls, and the parent wall still moves nothing',
			/* THIS IS THE ONE PLACE A PLACEMENT LEGITIMATELY MOVED, and the
			   figure is worth deriving rather than reading off the screen.

			   Tool Chest A is 30 x 18 turned 90 degrees at (30, 12), so its
			   INTERIOR occupies x = 12..30 in the Machine Shop's frame. It
			   carries a 3 inch wall, so its MATERIAL runs 9..33 and the face a
			   neighbour can meet is 33. Workbench B carries no wall of its own
			   and inherits the building's 6 inch default, so its own material
			   starts 6 inches before its typed origin. Its outer face landing
			   on the chest's outer face at 33 therefore stores 33 + 6 = 39.

			   Before 0224 the same drag stored 30 -- the bench's typed origin
			   on the chest's typed edge, with the two carcasses occupying the
			   same six inches of floor. 39 is the honest answer and 30 was a
			   drawing of two objects inside one another.

			   THE ROOM'S OWN 9 INCH WALL CONTRIBUTES NOTHING TO THIS, which is
			   decision 36 paying for itself: the parent is met by its INNER
			   face, so a wall on the room moved no placement at all.

			   It retries against its own effect and reports the attempt count
			   (CLAUDE.md: a scripted click never waits on a timer). The
			   neighbouring `place` spec dispatches once and settles on 60ms,
			   and measured on BOTH this tree and the branch point it drops the
			   first drag intermittently -- which then cascades, because these
			   probes are sequential and each computes its delta from the value
			   the last one left. */
			evaluate: `async () => {
				const q = (s) => document.querySelector(s);
				const x = q('input[id$="-pos-x"]');
				const pad = [...document.querySelectorAll('[data-testid="maps-plan-nudge"] .pad-btn')];
				const snapBtn = pad[pad.length - 1];
				if (!x || !snapBtn) return ['no X field or no Snap control'];
				// TYPE 37.5 AND PRESS SNAP, rather than dispatching a pointer
				// drag. It drives the SAME place(..., snap: true) call the drag
				// drives: snapNearest is the keyboard path to it, so the
				// face arithmetic under test is identical, and it is
				// deterministic at both widths where a synthesized drag is not:
				// the snap tolerance is 7 PIXELS converted to inches, so at
				// 375px it spans eleven inches and a drag that lands a pixel
				// off re-aims from somewhere else entirely. Measured: the
				// pointer form converged at 1440 and ran away to 608in at 375.
				const set = (el, v) => {
					el.value = v;
					el.dispatchEvent(new Event('input', { bubbles: true }));
				};
				let attempts = 0;
				for (let i = 1; i <= 8; i += 1) {
					attempts = i;
					set(x, '37.5');
					await new Promise((r) => setTimeout(r, 60));
					snapBtn.click();
					await new Promise((r) => setTimeout(r, 90));
					if (Number(x.value) === 39) break;
				}
				const said = (q('[data-testid="maps-plan-snap-note"]').textContent || '').replace(/\\s+/g, ' ');
				console.info('[walls] snap landed at ' + x.value + ' in ' + attempts + ' attempt(s); note: ' + said);
				return [
					'aimed at 37.5in, landed at ' + x.value,
					Number(x.value) === 39 ? 'which is the chest outer face at 33 plus the bench own inherited 6in wall' : 'NOT THE TWO WALLS',
					said.includes('outside face of Tool Chest A') ? 'and the note names the FACE it landed on, not just the neighbour' : 'THE NOTE DID NOT NAME THE FACE: ' + said
				];
			}`,
			expected: [
				'aimed at 37.5in, landed at 39',
				'which is the chest outer face at 33 plus the bench own inherited 6in wall',
				'and the note names the FACE it landed on, not just the neighbour'
			]
		},
		{
			label:
				'THE FORM SAYS WHAT AN EMPTY FIELD WILL DO, naming the inherited number rather than "the default"',
			/* Inheritance is the one thing about this pair that is not obvious
			   from the two labels, so the field carries a sentence -- and the
			   sentence has to name the resolved figure, because a person
			   standing in a room wants the number and not a pointer to another
			   form. Workbench B inherits the building's 6 inch default. */
			evaluate: `() => {
				const notes = [...document.querySelectorAll('[data-testid="maps-node-walls"] .field-note')];
				const first = notes[0] ? notes[0].textContent.replace(/\\s+/g, ' ').trim() : '';
				return [
					notes.length + ' notes',
					/Left empty: [0-9.]+ in, from the default set further up\\./.test(first) ? 'the first names the inherited number' : 'NO INHERITED NUMBER: ' + first,
					first.includes('Measure the room on the inside') ? 'and states the reference face in words' : 'NO REFERENCE FACE'
				];
			}`,
			expected: ['2 notes', 'the first names the inherited number', 'and states the reference face in words']
		}
	]
};
