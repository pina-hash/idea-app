/**
 * IdeaCAD's Blade editor: the first measurement this surface has ever had.
 *
 * WHY A BROWSER, AND WHY THIS ROUTE EXISTS AT ALL. Ledger 0145 built the whole
 * subsystem in a Codex container with no Chromium and a Vite that would not
 * stay up, and said so in its own history entry: the data model and the
 * arithmetic were proven by `tests/`, and the entire visual surface was
 * unverified. What that cost was not subtle. Measured here on the first run,
 * before any change:
 *
 *   the console          628.0 x 760   inside a 1440 x 900 window
 *   the 3D viewport        0.0 x 431.3  -- the middle grid track, gone
 *   "Fit"                 41.4 x 44     -- under the 44px floor, on a student surface
 *
 * The cause was one element name: the editor's body was a bare `<main>`, and
 * `src/app.css` styles that element globally (`max-width: 880px; margin: 0
 * auto; padding: 3rem 1.5rem 5rem; position: relative`). Auto side margins on a
 * grid ITEM disable stretch, so the console was sized to max-content, and the
 * viewport's max-content is zero -- its only sized child is a percentage width.
 * Nothing in `svelte-check`, in `tests/`, or in any server render can see that.
 * A real browser at a real width can, which is the whole argument for this file.
 *
 * THE VERDICTS ARE BUILT ON THE PAGE, not retyped here: `__ideacadVerdicts`
 * reads the real boxes at whichever width the harness is driving, so a probe
 * that stops running shortens the array and reddens rather than checking less.
 * The claims carry no numbers, deliberately -- the same ten sentences have to
 * hold at 375 and at 1440, where the arrangement is different but the promise
 * is not.
 *
 * TAP TARGETS ARE MEASURED WITH NO 24px EXCEPTION. This is a student surface at
 * every width, so `IDEA_INTERFACE_STANDARDS` 10's floor is 44 and the
 * instructor-console relief does not apply and must not be claimed.
 *
 * THERE IS A REAL 3D VIEWPORT BEHIND THIS NOW, which there was not when the
 * file above was written. Ledger 0160 measured no canvas, no `WebGLRenderer`,
 * no camera and no controls anywhere in the tree, and could not take PART 4's
 * frame-time p95 at all because there was nothing to drag. So the second verdict
 * block below drives a REAL 300-frame middle-drag through the real controls and
 * reports two clocks: the cost of issuing a frame, which is this repository's
 * to answer for and is held to the 60 fps budget, and the presented cadence,
 * which belongs to a host that has no GPU and falls back to a software
 * rasteriser, and is reported beside an idle control rather than thresholded.
 * Holding SwiftShader to 60 fps would redden this harness for the machine it
 * runs on.
 *
 * WEBGL IS AVAILABLE UNDER THIS HARNESS'S OWN LAUNCH ARGS, measured rather than
 * assumed: `--disable-gpu` with no swiftshader flag still yields a WebGL2
 * context through ANGLE's SwiftShader device. No launch change was needed and
 * none was made.
 */
export default {
	path: '/dev/ideacad',
	label: 'IdeaCAD: the Blade editor console',
	prepare: [
		{ waitFor: '() => typeof window.__ideacadVerdicts === "function"' },
		/* The renderer is loaded dynamically inside `onMount`, so the camera
		   probe appears a tick after the markup does. Waiting on the PROBE
		   rather than on a timer is what keeps this honest on a slow run. */
		{ waitFor: '() => !!window.__ideacadCamera?.()' },
		/* PART 4's 300-frame middle-drag, run ONCE here so its numbers land in
		   the output, with the verdict block below comparing the claims off the
		   same reading. The probe restores the pre-drag view through the real
		   Previous control, so every layout measurement after it is taken at the
		   pose the page opened on. */
		{ evaluate: '() => window.__ideacadRunFrameProbe()' }
	],
	orderResult: [
		{
			label: 'the console, the viewport and the view toolbar are where they claim to be',
			evaluate: '() => window.__ideacadVerdicts()',
			expected: [
				'the console uses the width of the window ok',
				'the viewport has real width ok',
				'the viewport is the widest region ok',
				'the three regions fill the console ok',
				'nothing is wider than the window ok',
				'the desktop console does not scroll the page ok',
				'the view toolbar is inside the viewport it belongs to ok',
				'every view control is on screen rather than clipped ok',
				'the confirm pair clears the reference triad ok',
				'the confirm pair clears the concept strip ok',
				'the readouts rail shows its last row ok',
				/* The canvas, and the rig behind it. A pane with real width was
				   already measured; a pane holding a canvas that draws nothing is
				   the next way for this surface to be wrong while every threshold
				   passes, which is how the last two defects here got through. */
				'the canvas fills the viewport pane ok',
				'the canvas has a backing store ok',
				'the backing store matches the pane at the clamped pixel ratio ok',
				'the renderer issued draw calls ok',
				'the model has triangles in it ok',
				'the world point under a pixel survives a zoom ok',
				'the model is inside the pane at the zoom it fits to ok',
				'the model fills the pane it was fitted to ok'
			]
		},
		{
			label: 'a 300-frame middle-drag, through the real controls',
			evaluate: '() => window.__ideacadFrameVerdicts()',
			expected: [
				'a 300-frame middle-drag reaches the renderer ok',
				'the cost of issuing a frame is inside the 60 fps budget ok'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-editor"]', label: 'the editor console', expectPresent: 1, expectVisible: 1 },
		{ selector: '.viewport', label: 'the 3D viewport pane', expectPresent: 1, expectVisible: 1 },
		{ selector: 'canvas[data-testid="ideacad-canvas"]', label: 'the WebGL canvas', expectPresent: 1, expectVisible: 1 },
		/* The no-WebGL refusal, as an ABSENCE with its own positive control: the
		   canvas above IS present, so a machine that could not draw would show
		   this panel instead of leaving the pane blank. */
		{ selector: '.nogl', label: 'the cannot-draw-3D notice, absent on a machine that can', expectPresent: 0 },
		/* The orientation popover is closed until its control is pressed. */
		{ selector: '.orient', label: 'the standard-view list, closed', expectPresent: 0 },
		/* Six features plus Materials plus Standard Parts. A count, not a
		   presence check: a tree that renders one row looks fine to a selector.
		   The BODY'S STATIONS ARE CHILD ROWS AND START COLLAPSED (0171), which is
		   measured rather than preferred: expanded, the four station rows pushed
		   Materials and Standard Parts past the fold of a 514.6px pane, and this
		   container's Chromium paints OVERLAY scrollbars -- the pane's offsetWidth
		   and clientWidth differ by its 1px border and nothing else -- so two rows
		   0145 PART 5 names were invisible with no cue at all. */
		{ selector: '.tree [role="treeitem"]', label: 'FeatureManager rows', expectPresent: 8, expectVisible: 8 },
		{ selector: '.tree button', label: 'FeatureManager rows and the body’s expander', expectPresent: 9, expectVisible: 9 },
		/* The stations, ABSENT, with the expander present beside them as the
		   positive control that the tree rendered at all. */
		{ selector: '.tree .child', label: 'the body’s station rows, collapsed', expectPresent: 0 },
		{ selector: '.tree .twist', label: 'the body’s expander', expectPresent: 1, expectVisible: 1 },
		/* The PropertyManager is not open on this state, which is what makes the
		   `footer button` pair below the only confirm pair on screen. */
		{ selector: '[data-testid="ideacad-property-manager"]', label: 'the PropertyManager, closed', expectPresent: 0 },
		{ selector: '.viewport nav button', label: 'view toolbar controls', expectPresent: 5, expectVisible: 5 },
		{ selector: '.readouts .metric', label: 'rule readouts and the centre of mass', expectPresent: 5, expectVisible: 5 },
		/* The gate, as an ABSENCE with its own positive control beside it: the
		   compare sheet is not open here, so the physics rows must not be in the
		   document at all. `ideacad-compare.mjs` opens it and asserts the same
		   absence with the sheet on screen. */
		{ selector: '.compare', label: 'the compare sheet, closed on this state', expectPresent: 0 },
		{ selector: '.compare dl', label: 'the comparative physics, gated', expectPresent: 0 },
		{ selector: 'footer button', label: 'Accept and Cancel', expectPresent: 2, expectVisible: 2 }
	],
	contrast: [
		{ selector: '.readouts .metric span', label: 'a readout label on the rail ground', min: 4.5 },
		{ selector: '.readouts .metric strong', label: 'a readout value on the rail ground', min: 4.5 },
		{ selector: '.readouts .metric b', label: 'the PASS word on the rail ground', min: 4.5 },
		{ selector: '.tree [role="treeitem"]', label: 'a FeatureManager row', min: 4.5 },
		{ selector: '.tree .why', label: 'the sentence saying what the tree does not offer', min: 4.5 },
		{ selector: '.eyebrow', label: 'the IDEACAD / BLADE eyebrow', min: 4.5 },
		{ selector: '.save', label: 'the saved-state word', min: 4.5 },
		/* Over the viewport ground rather than the rail's: the triad and the view
		   name are the only copy painted on the graphics area. The triad is an
		   SVG overlay driven by the camera quaternion now, so its marks paint
		   `currentColor` and a reading of `color` is the colour on screen --
		   asked of `.triad text`, because an SVG root has no text of its own. */
		{ selector: '.triad text', label: 'a reference-triad axis letter over the viewport', min: 4.5, all: true },
		{ selector: '.view', label: 'the current view name', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.viewport nav button', label: 'a view toolbar control' },
		{ selector: '.tree button', label: 'a FeatureManager row' },
		{ selector: '.concepts button', label: 'a concept strip control' },
		{ selector: 'header .hist', label: 'Undo and Redo' },
		{ selector: 'footer button', label: 'Accept and Cancel' }
	]
};
