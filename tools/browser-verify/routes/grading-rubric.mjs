export default {
	path: '/dev/grading-rubric',
	label: 'Rubric builder, student view and grading console over one store (0106)',
	/* THE RESTING STATE: nothing edited. Everything below is about the surface
	   as an instructor first meets it -- the three panes mounted, the room they
	   are in, and the console's level control showing the STORED short line,
	   which is the field prompt 0106 found nobody could edit. The edited state
	   is its own spec (`grading-rubric-state-edited.mjs`). */
	/* THE CONSOLE'S RUBRIC COLUMN ONLY EXISTS ONCE A STUDENT IS OPEN -- the
	   roster is the resting view, and `.score-card` is not in the DOM until
	   somebody is selected. So opening one IS the state a grader is in, and the
	   `until` names something only the click can produce. The BUILDER is left
	   exactly as it is: this spec's whole job is the surface before any edit. */
	prepare: [
		/* THE ROSTER ARRIVES ASYNCHRONOUSLY -- `loadGrading` is a transport, so
		   the console renders its shell first and the rows land after. Measured
		   on this fixture: 0 rows at 200ms, 3 at 500ms. Without this step the
		   click below matched nothing and reported it, which is the harness
		   working; waiting for the row is the fix, not forcing the click. */
		{ waitFor: "() => document.querySelectorAll('[data-testid=\"console-pane\"] .roster-row').length === 3" },
		{
			click: '[data-testid="console-pane"] .roster-row:has-text("Alice Alvarez")',
			until: "() => !!document.querySelector('[data-testid=\"console-pane\"] .score-card')"
		}
	],
	presence: [
		/* The room actually mounted, stylesheet and all. Without this the
		   contrast rows below would quietly go on reporting the portal plate:
		   see routes/README.md, "A harness must be in the room production is
		   in". */
		{ selector: '.cr-root', label: 'classroom room wrapper', expectPresent: 1 },
		{ selector: '[data-testid="builder-pane"] .rubric-builder', label: 'the REAL RubricBuilder', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="student-pane"] .rubric', label: 'the REAL RubricView', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="console-pane"] .score-card', label: 'the REAL GradingConsole rubric column', expectPresent: 1, maxPresent: 1 },
		/* Ten levels across three criteria (4 + 3 + 3): the fourth button
		   exists on one of them on purpose, since a uniform ladder never
		   exercises it. */
		{ selector: '[data-testid="oracle-row"]', label: 'levelShort oracle rows (one per level)', expectPresent: 10, maxPresent: 10 },
		/* THE EDITOR IS CLOSED AT REST, which is what makes the edited spec's
		   first prepare step a real click rather than a predicate the page
		   already satisfies. */
		{ selector: '[data-testid="builder-pane"] input.level-short', label: 'short-line inputs (editor closed)', expectPresent: 0 },
		{ selector: '[data-testid="level-short-stale"]', label: 'stale-short flag (nothing edited yet)', expectPresent: 0 }
	],
	/* Every level's line on the console comes from the STORED short, which is
	   the rung an edit could not reach before this bundle. Read off the
	   oracle's own `data-source`, so the row says WHICH rung answered rather
	   than only what it said. */
	orderResult: [
		{
			label: 'which levelShort rung answers for each level, at rest',
			evaluate:
				"() => [...document.querySelectorAll('[data-testid=\"oracle-row\"]')].map((r) => r.dataset.source)",
			expected: [
				'stored short', 'stored short', 'stored short', 'stored short',
				'stored short', 'stored short', 'stored short',
				'stored short', 'stored short', 'stored short'
			]
		}
	],
	contrast: [
		{ selector: '[data-testid="builder-pane"] .rubric-builder .line', label: 'rubric summary line', min: 4.5 },
		{ selector: '[data-testid="console-pane"] .score-card .level-short', label: 'the level line a grader picks on', min: 4.5 },
		{ selector: '[data-testid="student-pane"] .rubric .level-desc', label: 'the description a student reads', min: 4.5 }
	],
	/* Manage-only classroom surface, so IDEA_INTERFACE_STANDARDS 10's 24px
	   floor applies to the authoring chips, not the 44px one -- the same call
	   `classroom-split-...-compose-assignment-rubric.mjs` records, and for the
	   same control set. */
	tapTargets: [
		{ selector: '[data-testid="builder-pane"] .rubric-builder .actions .btn', label: 'rubric builder controls (Edit rubric / Generate from spec / Remove)', min: 24 }
	],
	/* The harness blocks every non-loopback request, so the fixture's own font
	   fetch resets. Nothing to do with this surface. */
	ignoreConsole: ['ERR_CONNECTION_RESET', 'ERR_BLOCKED_BY_CLIENT']
};
