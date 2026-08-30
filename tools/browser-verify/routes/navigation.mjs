import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/navigation',
	label: 'Route-transition indicator: the delay gate, the layout shift, the pending primitive',
	widths: WIDTHS,
	/*
		THE GAP THIS CLOSES. Swept before the component existed, `navigating` --
		in either spelling, the `$app/state` rune or the deprecated
		`$app/navigation` store -- was imported by ZERO files under `src/`, so
		every SvelteKit navigation in this application showed nothing at all
		until the new page painted. There was no indicator to measure and no
		spec that could have noticed.

		WHAT IS BEING MEASURED IS THE INTEGRATION, NOT THE COMPONENT. Toggling a
		prop and photographing the bar proves the CSS; it says nothing about
		whether a real navigation ever reaches the state that toggles it. So the
		route's own probe performs two REAL `goto`s -- one to a load that
		resolves immediately and one to a load that sleeps 1200ms -- and samples
		the DOM for the indicator's track throughout each. The pair is the whole
		claim: silent below the gate, drawn above it.
	*/
	prepare: [
		/*
			PRESS ONCE, THEN WAIT. Both halves are deliberate and the split is the
			harness's own: `clickUntil` covers a state reached by pressing,
			`waitFor` covers one that arrives.

			THE PREDICATE NAMES `started`, NOT `done`, AND THE DIFFERENCE COST A
			WRONG READING. `clickUntil` repeats until its predicate holds, so with
			`done` the second click landed 900ms into a probe that takes about
			2.5s and a SECOND probe ran concurrently -- its fast navigation
			sampling the indicator the first one's slow navigation was still
			painting. The report came back `["indicator","indicator"]`: the gate
			looking broken in the one direction that matters, produced entirely by
			the instrument. `started` is set synchronously by the handler, so the
			press is observable on the first poll and never repeated.

			It is also not satisfiable at REST -- `__navProbe` exists from mount
			but `started` is false until a click -- so this is not the
			"already satisfied" short-circuit the harness README records twice.
		*/
		{
			click: '[data-testid="run-nav-probe"]',
			until: '() => !!(window.__navProbe && window.__navProbe.started)',
			attempts: 6,
			gapMs: 400
		},
		/* The two real navigations take ~2.5s together (1200ms of it the slow
		   load's own sleep). Waiting is reported in ms and a predicate that never
		   holds prints FAILED, so every measurement after this is read as
		   describing a state the run did or did not reach. */
		{ waitFor: '() => !!(window.__navProbe && window.__navProbe.done)', timeoutMs: 20000 },
		/* Prints the measured numbers into the report, so the threshold claim is
		   auditable rather than reduced to the pass/fail row below it. */
		{
			evaluate: `() => {
				const p = window.__navProbe;
				if (!p) return 'probe missing';
				if (p.error) return 'probe error: ' + p.error;
				return 'gate ' + p.gateMs + 'ms; ' + p.observations.map((o) =>
					o.requestedDelayMs + 'ms load -> nav ' + o.navigationMs + 'ms, ' +
					(o.indicatorSeen ? 'indicator at ' + o.firstSeenMs + 'ms' : 'silent')
				).join('; ');
			}`
		},
		/* Layout shift, both readings and the in-flow negative control. */
		{
			evaluate: `async () => {
				const r = await window.__measureNavShift();
				return 'fixed: cls ' + r.real.cls + ', ref moved ' + r.real.refTopDeltaPx + 'px; '
					+ 'in-flow control: cls ' + r.control.cls + ', ref moved ' + r.control.refTopDeltaPx + 'px';
			}`
		},
		/* The bar's own ratios, painted to a canvas and read back, with the
		   probe's self-check first -- a contrast probe that cannot reproduce
		   21:1 is reporting arithmetic. */
		{
			evaluate: `async () => {
				const c = await window.__measureNavContrast();
				return 'instrument ' + c.instrument + '; sweep vs page ' + c.sweepVsGround
					+ ':1; sweep vs track ' + c.sweepVsTrack + ':1; track vs page ' + c.trackVsGround + ':1';
			}`
		}
	],
	orderResult: [
		/*
			THE GATE, IN BOTH DIRECTIONS, AND THE EXPECTED VALUE IS NOT DRAWN
			FROM THE THING UNDER TEST. `summary` is one word per navigation,
			written by the probe from what it SAW in the DOM; the expectation is
			the two words spelled out here. A probe that returned the gate's own
			arithmetic instead of an observation would have no oracle, which is
			exactly the defect this comment exists to rule out.

			'silent' FIRST IS THE HALF THAT IS EASY TO LOSE. A bar that draws on
			every navigation passes any assertion of the form "the indicator
			appears when something is slow"; only the fast case can catch it, and
			it is the case a person notices as a flicker on every click.
		*/
		{
			evaluate: `() => (window.__navProbe && window.__navProbe.summary) || ['probe did not run']`,
			expected: ['silent', 'indicator'],
			label: 'a 0ms load draws nothing; a 1200ms load draws the indicator'
		},
		{
			/*
				ZERO LAYOUT SHIFT, MEASURED TWO WAYS, WITH THE CONTROL IN THE SAME
				STRING. "the bar shifts nothing" is satisfied perfectly by a probe
				that cannot see a shift at all, so the verdict only reads
				`control moved` when the same probe, with the same bar put back in
				flow, DID register one. Anything else -- including the blind case
				-- is a different string and reddens.
			*/
			evaluate: `() => [(window.__navShift && window.__navShift.verdict) || 'shift probe did not run']`,
			expected: ['fixed: 0 shift, control moved'],
			label: 'the indicator causes no layout shift, and the probe can see one when there is'
		},
		{
			/*
				THE BAR'S MARK CLEARS THE NON-TEXT FLOOR. 3:1 and not 4.5:1
				deliberately: the sweep is a graphical object, not text, and
				WCAG 1.4.11 is the applicable rule. Two clauses, because the mark
				has to be distinguishable from BOTH the page behind the bar and
				the quiet track it slides along -- clearing one and not the other
				is an indicator nobody can read in one of the two states.
			*/
			evaluate: `() => {
				const c = window.__navContrast;
				if (!c) return ['contrast probe did not run'];
				if (c.instrument !== 'ok (21:1, 1:1, 4.54:1 reproduced)') return ['instrument: ' + c.instrument];
				return [
					c.sweepVsGround >= 3 ? 'sweep-vs-page ok' : 'sweep-vs-page ' + c.sweepVsGround,
					c.sweepVsTrack >= 3 ? 'sweep-vs-track ok' : 'sweep-vs-track ' + c.sweepVsTrack
				];
			}`,
			expected: ['sweep-vs-page ok', 'sweep-vs-track ok'],
			label: 'the moving mark clears 3:1 against the page and against its own track'
		}
	],
	presence: [
		/*
			THE LIVE REGION IS MOUNTED FROM THE FIRST FRAME AND STAYS MOUNTED.
			That is the design, not an accident: several screen readers only
			announce a `role="status"` they were already observing, so the region
			exists empty and the sentence moves in and out of it. A ceiling of 1
			as well as a floor, because TWO live regions on one page is the
			failure this is one refactor away from -- the harness page mounts a
			second, forced instance under its own testid, and a spec with a floor
			alone would not notice the two merging.
		*/
		{
			selector: '[data-nav-progress="nav-progress"]',
			label: 'the live indicator region mounted by the root layout',
			expectPresent: 1,
			maxPresent: 1,
			/*
				PRESENT AND PAINTING NOTHING is the correct resting state, and
				`maxVisible: 0` asserts it rather than tolerating it. The region is
				mounted from the first frame because several screen readers only
				announce a `role="status"` they were already observing -- but an
				empty one must occupy no space, which is what a zero box means
				here. Measured: 375.0x0.0 and 1440.0x0.0.

				This row first read `expectVisible: 1` and the harness reported the
				zero box as a finding. The spec was wrong, not the component: a
				live region that painted something at rest would be a permanent bar
				across the top of every page.

				BOTH HALVES ARE STATED. `expectVisible` defaults to `expectPresent`
				when omitted, so `maxVisible: 0` alone printed the impossible
				threshold "1 to 0 visible" and reddened a correct component a
				second time. The floor has to be written down too.
			*/
			expectVisible: 0,
			maxVisible: 0
		},
		/*
			AND IT DRAWS NOTHING AT REST. This is the absence half of the gate,
			asserted on the resting page rather than during a navigation.
			`expectPresent: 0` means EXACTLY zero (the harness's own rule since
			the floor-of-zero fix), and the POSITIVE CONTROL for it is the row
			above: the same region, same testid, proven present. A renamed
			`.nav-prog-track` would leave this row green and that row green too --
			which is why the alias route `/dev/navigation?force=1` asserts the
			track PRESENT by the identical selector.
		*/
		{
			selector: '[data-nav-progress="nav-progress"] .nav-prog-track',
			label: 'no bar painted with no navigation in flight',
			expectPresent: 0
		},
		/* The primitive, in both variants and in the narrow pane. Three mounts,
		   never two, so a variant that stopped rendering is visible as a count. */
		{
			selector: '.pending',
			label: 'the shared pending primitive (block, inline, narrow pane)',
			expectPresent: 3,
			maxPresent: 3,
			expectVisible: 3,
			maxVisible: 3
		},
		{
			selector: '[data-testid="narrow-pane"] .pending',
			label: 'the primitive inside a 140px pane',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1,
			maxVisible: 1
		}
	],
	textContains: [
		/*
			ONE SPELLING OF THE ELLIPSIS, AND THE `mustNot` IS THE HALF THAT
			MATTERS. Every label on this page goes through `pendingLabel`, which
			strips whatever the caller typed and appends the single character. A
			`must` list alone cannot see a sentence that KEPT the right ellipsis
			and gained a second spelling beside it, which is precisely what three
			hand-written pending strings in three files looked like before the
			primitive existed.
		*/
		{
			selector: '.pending',
			label: 'the primitive spells its ellipsis one way',
			must: ['…'],
			mustNot: ['...', '&hellip;', '……']
		}
	],
	contrast: [
		/*
			The primitive's ink on the PORTAL plate. `.cr-root` and `.nb-root`
			are `/dev/navigation-room` and `/dev/navigation-room-nb`, which are
			separate ROUTES rather than sections here because each of those rooms
			repaints the whole canvas (`body:has(.cr-root)`, and the notebook's
			own plate mirror) -- see routes/README.md, and /dev/animated-logo-room
			for the precedent.
		*/
		{ selector: '.page .pending', label: 'pending label on the portal plate', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="run-nav-probe"]', label: 'the probe control', min: 44 },
		{ selector: '[data-testid="nav-fast"], [data-testid="nav-slow"]', label: 'the two navigation links', min: 44 }
	]
};
