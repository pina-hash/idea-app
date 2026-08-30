// original array position 16 of 25 -- see ../README.md for what `order` means
export const order = 16;

export default {
	path: '/dev/foundry-submit',
	label: 'Foundry submit, a refused upload rendered to the student',
	/*
		THE STUDENT'S OWN UPLOAD SURFACE, and the highest-churn dev route that
		nothing drove: `FoundrySubmit`, `FoundryIssues`, `FoundryContract` and
		`AppFrame` are all mounted here and none of them appears anywhere else
		in this file. `/dev/foundry-forge` drives `FoundryMine` and stops
		there.

		WHAT IS BEING MEASURED IS THE REFUSAL PATH, deliberately, because that
		is the half a student meets when something is wrong and the half whose
		failure is silent: a refusal that stops rendering leaves a student
		looking at an upload that did not work with nothing on screen saying
		why, and the next thing that happens is they paste it back into
		whatever generated the app. CLAUDE.md pins those sentences as
		VERBATIM -- `FoundryIssues` never rewrites, shortens or re-tones one,
		because the same string is produced by the browser preflight and by
		`foundry-ingest`.

		THE PREFLIGHT IS THE REAL ONE. `[data-drive="zip-bad"]` builds a real
		`File`, hands it to the component's own input through a real `change`
		event, and the route runs `preflightZipInBrowser` over the same
		normalized zip the surface would have uploaded -- the same module the
		server runs, with the same wording. Measured: 2 sentences render, at
		14.27:1, at both widths.

		THIS SPEC READ `exactly 4` AND THE SURFACE READ `present 2`, AND THE
		SPEC WAS THE STALE HALF. It was written at 09:30 on 2026-08-30; at
		11:15 the same day, `6cf8f11` narrowed the missing-asset sweep in
		`preflight.ts` so a reference that LEAVES the bundle is no longer put
		to it. Two of the four sentences counted here were exactly that: the
		fixture's `https://fonts.googleapis.com/...` stylesheet and its
		`https://cdn.jsdelivr.net/npm/chart.js` script, each earning "this
		upload does not include a file at ..." over a mangled split-on-slash
		path, about files that were never supposed to be in the upload. The
		narrowing's own header calls them false sentences and notes it can
		refuse nothing (the sweep only ever pushes warnings), so nothing that
		passed then can fail now.

		NO SENTENCE IS MISSING FROM THE SURFACE. Read back off the rendered
		panels rather than reasoned about: the two that remain are the leading
		slash on `/art/logo.png` (the failure) and the unconditional
		`localStorage` warning on `app.js` line 2 (the warning). They are one
		per tone, which is what keeps the two-panel row below honest.

		THE FIX IS HERE AND NOT IN FOUNDRY. The application change was
		deliberate, is documented in its own header, and removed advice that
		was wrong; a spec pinned to the count it produced before that is a
		ratchet recording what last happened.
	*/
	prepare: [
		{
			click: '[data-drive="zip-bad"]',
			until: '() => !!document.querySelector(".fdy-issues")',
			attempts: 8,
			gapMs: 400
		}
	],
	presence: [
		/*
			THE INPUT IS NOT ASSERTED HERE, ON PURPOSE, AND IT IS NOT
			UNCHECKED. `[data-fdy-input]` exists before the drive and is gone
			after it -- the surface moves off its drop zone once it has a
			bundle -- so a presence row for it measured 0 and reported a
			finding about a control that had done its job. It is proven by the
			PREPARE STEP instead, and more strongly: the route's `drive()`
			looks the input up itself and, not finding one, writes "No file
			input on screen" into the drive note and returns WITHOUT handing
			the files over, so `.fdy-issues` never appears and the step prints
			FAILED. The note below is the same fact stated positively.
		*/
		{ selector: '[data-testid="drive-note"]', label: 'the drive note (the input was found and handed the files)', expectPresent: 1 },
		/* TWO PANELS, MEASURED, NOT ONE. `FoundryIssues` renders one section per
		   TONE and the bad fixture produces both a `failure` and a `warning`,
		   so `expectPresent: 1` was a floor passing on a reading of 2 -- and
		   would have gone on passing if the warning panel stopped rendering,
		   which is the storage sentence CLAUDE.md calls unconditional. */
		{ selector: '.fdy-issues', label: 'issues panels after the bad zip (failure + warning tones)', expectPresent: 2, maxPresent: 2 },
		/*
			TWO SENTENCES, not "at least one": the bad fixture trips a leading
			slash (a failure) and the unconditional localStorage warning. One per
			tone, which is what makes the two-panel row above and this row say
			different things -- a count of 1 would pass on a panel that had lost
			one of them, and the ceiling catches the reverse.

			IT READ 4 UNTIL 2026-08-30. See the header: two of those four were
			missing-asset warnings about CDN URLs, which `6cf8f11` stopped
			emitting on purpose. Nothing here regressed.
		*/
		{ selector: '.fdy-issue-message', label: 'refusal + warning sentences (leading slash, storage)', expectPresent: 2, maxPresent: 2 }
	],
	contrast: [
		{ selector: '.fdy-issue-message', label: 'refusal sentence on its panel', min: 4.5 }
	],
	/*
		THE COPY CONTROLS ARE `tap-44` AND THE REASON IS THE FEATURE ITSELF:
		the next thing that happens to a failure is being pasted back into an
		AI tool, so per-issue copy and copy-all are the point of the panel
		rather than a convenience. Measured 77.4x44, min dim 44.0px over 5
		controls.

		NOTE ON THE HIT TEST the tap-target check also records: these controls
		sit ~3000px down the document at 375px, and `elementFromPoint` answers
		null outside the viewport, so `centreHitsSelf` reads false for all
		five here. It is an artefact of the harness never scrolling, not a
		finding -- scrolled into view the same control hit-tests to itself --
		and it changes nothing, because `tapTargets` gates only on the
		geometry. Do not "fix" it by scrolling before measuring: scrolling
		moves the boxes this check exists to report.
	*/
	tapTargets: [
		{ selector: '.fdy-issues .btn', label: 'per-issue and copy-all controls', min: 44 },
		/*
			THE COVERAGE HOLE THIS ROUTE CLOSES. Every `.btn` mounted by the REAL
			Foundry components on this page (`FoundrySubmit`, `FoundryMine`,
			`FoundryContract`, `FoundryIssues`) already carries `.tap-44` --
			checked across every render site in `src/lib/foundry/` -- so a
			`.btn`-shaped check pointed at any of them would pass whether or not
			a plain, unopted-in `.btn` anywhere else was under floor. The harness's
			OWN scaffolding controls (the Submit/My apps/Contract tabs and the
			"Drive an input shape" / "Raw normalize" / "Run the React fixture"
			buttons in this route's own +page.svelte) carry no `.tap-44` at all,
			which is exactly the shape a `.btn`-wide CSS floor change would need a
			check to catch: nothing selector-based here reached them before this
			line existed. Measured with no `.btn` floor: 12 controls at 95.5x39.4
			(min dim 39.4px) at BOTH widths -- 24 readings under the 44px floor,
			all from this one route. This is the harness's own chrome, not a
			shipped surface, but it is real `.btn` markup rendered by real CSS,
			which is exactly what a floor change to `.btn` itself would move.
			**`src/app.css`'s `.btn` now carries that 44px `min-height` floor**,
			and this scaffolding had no local override sitting on top of it --
			re-measured clean at 95.5x44, 0/12 under floor, both widths.
		*/
		{ selector: '.h-tabs .btn, .h-buttons .btn', label: 'plain .btn harness controls (tab switcher, drive/raw/run buttons -- no .tap-44)', min: 44 }
	]
};
