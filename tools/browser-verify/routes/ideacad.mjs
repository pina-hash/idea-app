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
 */
export default {
	path: '/dev/ideacad',
	label: 'IdeaCAD: the Blade editor console',
	prepare: [{ waitFor: '() => typeof window.__ideacadVerdicts === "function"' }],
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
				'the readouts rail shows its last row ok'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-editor"]', label: 'the editor console', expectPresent: 1, expectVisible: 1 },
		{ selector: '.viewport', label: 'the 3D viewport pane', expectPresent: 1, expectVisible: 1 },
		/* Six features plus Materials plus Standard Parts. A count, not a
		   presence check: a tree that renders one row looks fine to a selector. */
		{ selector: '.tree button', label: 'FeatureManager rows', expectPresent: 8, expectVisible: 8 },
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
		{ selector: '.tree button', label: 'a FeatureManager row', min: 4.5 },
		{ selector: '.eyebrow', label: 'the IDEACAD / BLADE eyebrow', min: 4.5 },
		{ selector: '.save', label: 'the saved-state word', min: 4.5 },
		/* Over the viewport ground rather than the rail's: the triad and the view
		   name are the only copy painted on the graphics area. */
		{ selector: '.triad', label: 'the reference triad over the viewport', min: 4.5 },
		{ selector: '.viewport > p', label: 'the current view name', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.viewport nav button', label: 'a view toolbar control' },
		{ selector: '.tree button', label: 'a FeatureManager row' },
		{ selector: '.concepts button', label: 'a concept strip control' },
		{ selector: 'footer button', label: 'Accept and Cancel' }
	]
};
