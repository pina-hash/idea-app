export default {
	path: '/dev/html-rubric',
	label: "HTML assignment: a manifest-derived rubric renders identically to a spec-derived one, in the real RubricView and the real grading console",
	/*
		THE COMPARISON, ON ONE PAGE.

		WHY A BROWSER AT ALL. `tests/html-assignment-rubric.test.ts` proves the
		two rubric ARRAYS are equal as strings and
		`tests/html-assignment-rubric-db.test.ts` proves the real
		`classroom_set_rubric` keeps what it is given. Neither can see a level
		whose one-line form never reached a button -- which is the entire defect
		class this lane replaces. On 2026-09-08 an instructor rewrote rubric
		descriptors on IDEA209H Unit 1 and saw nothing change, because
		`levelShort` renders `short` first and nothing in the product could edit
		it. Every layer above the screen was correct.

		WHY BOTH RENDERINGS ARE ON ONE PAGE. A route spec measures one URL, so
		"identical to a spec-derived one" has to be answerable inside a single
		page load. The fixture writes the same assignment twice -- once as a
		manifest, once by hand as a spec -- and the page renders both through the
		same real components. `orderResult` below scrapes the two rendered
		regions and compares them, so what is compared is two SCREENS.

		WHAT THIS ROUTE CANNOT MEASURE, said here rather than discovered later:
		two grading consoles on one document share a keyboard. `GradingConsole`
		binds `<svelte:window onkeydown>` and resolves a level with a
		document-wide `document.querySelector('[data-grade-level=...]')`, so a
		digit press fires in both and focus lands in the first. That is a
		property of this harness and not of the component; it touches the
		keyboard path only. `/dev/html-rubric?state=single` is the real page
		shape, and `/dev/grading-rubric` and `/dev/grading-change` mount one
		console each.

		13 IS THE NUMBER TO WATCH. Four criteria, one of which carries FOUR
		levels where the rest carry three -- so a translation that flattened or
		truncated levels shows up as a missing button rather than as nothing.

		THE CHECKS WERE PUT TO A BROKEN TREE BEFORE THEY WERE TRUSTED. Dropping
		`short` from the projection in `rubric.ts` -- the exact 2026-09-08 defect
		-- reddened TEN measurements here (both `textContains` rows, the oracle
		summary, and both `orderResult` scrapes, at both widths) and put the full
		descriptors on the level buttons. It reddened NOTHING on `?state=graded`
		or `?state=single`, and nothing on the `.level-short` presence row: see
		that row's own comment for why a count cannot see this and only the text
		can. The module was restored from an in-memory copy and md5-checked,
		never with `git checkout --`.
	*/
	prepare: [
		{
			/* The roster lands asynchronously (`loadGrading` is deferred out of the
			   effect body), so wait on the rows rather than on a timer. Two
			   consoles, two rosters. */
			waitFor:
				'() => document.querySelectorAll(".grading-page .roster-list .roster-row").length === 4'
		},
		{
			/* THE RUBRIC REGION ONLY EXISTS ONCE A STUDENT IS SELECTED. `until`
			   names a level button, which nothing on this page produces at rest --
			   so a click that never fired cannot short-circuit the step. */
			click: '[data-testid="hx-console-manifest"] .roster-row',
			until:
				'() => document.querySelectorAll(\'[data-testid="hx-console-manifest"] .level-btn\').length === 13'
		},
		{
			click: '[data-testid="hx-console-spec"] .roster-row',
			until:
				'() => document.querySelectorAll(\'[data-testid="hx-console-spec"] .level-btn\').length === 13'
		}
	],
	presence: [
		/* THE ROOM ACTUALLY MOUNTED. Both components ship under `/classroom/**`,
		   whose layout gives every surface `.cr-root`; without the stylesheet
		   import the class paints nothing and every contrast row below would
		   quietly report the portal plate instead. */
		{ selector: '.cr-root', label: 'the classroom room', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="hx-view-manifest"] .criterion', label: 'criteria in the manifest-derived student rubric', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="hx-view-spec"] .criterion', label: 'criteria in the spec-derived student rubric', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="hx-view-manifest"] .level', label: 'levels in the manifest-derived student rubric', expectPresent: 13, maxPresent: 13, expectVisible: 13 },
		{ selector: '[data-testid="hx-console-manifest"] .level-btn', label: 'level buttons over the manifest rubric', expectPresent: 13, maxPresent: 13, expectVisible: 13 },
		{ selector: '[data-testid="hx-console-spec"] .level-btn', label: 'level buttons over the spec rubric', expectPresent: 13, maxPresent: 13, expectVisible: 13 },
		/* A COUNTING ROW, AND IT CANNOT CATCH A DROPPED `short` -- MEASURED,
		   RATHER THAN ASSUMED, AND SAID HERE SO NOBODY READS IT AS THE GUARD.
		   `levelShort` falls to rung three when `short` is missing, so the
		   element still renders (`{#if short}` is truthy on the descriptor) and
		   this row still counts 13. Under the mutation that drops `short` from
		   the projection, this row stayed green and ten OTHER measurements
		   reddened: the two `textContains` rows, the oracle summary and the two
		   `orderResult` scrapes, on both widths. Only the TEXT can see this
		   defect. What the row is genuinely for is a level that stopped
		   rendering a one-liner at all. */
		{ selector: '[data-testid="hx-console-manifest"] .level-short', label: 'a one-line form on every level button, with NO spec handed in (a count, not the guard -- see the comment)', expectPresent: 13, maxPresent: 13, expectVisible: 13 },
		/* NOTHING IS SCORED YET, which is the positive control for
		   `?state=graded` and for the total below. */
		{ selector: '[data-testid="hx-console-manifest"] .level-btn.picked', label: 'a picked level (nothing graded yet)', expectPresent: 0 },
		{ selector: '[data-testid="hx-view-manifest"] .level.chosen', label: 'a marked level in the student rubric (nothing graded yet)', expectPresent: 0 },
		/* NO CRITERION IS UNFINISHED. `_classroom_normalize_rubric` stamps
		   `incomplete` server-side and `criterionIncomplete` recomputes it for an
		   unsaved one, so a manifest-derived rubric that failed the level
		   constraints would say so here rather than anywhere else. */
		{ selector: '[data-testid="hx-view-manifest"] .unfinished-line', label: 'an unfinished-criterion notice', expectPresent: 0 },
		{ selector: '[data-testid="hx-console-manifest"] .score-unfinished', label: 'an unfinished-criterion notice on the console', expectPresent: 0 }
	],
	contrast: [
		{ selector: '[data-testid="hx-console-manifest"] .level-short', label: "the level button's one-line form", min: 4.5 },
		{ selector: '[data-testid="hx-console-manifest"] .score-crit', label: 'the criterion name on the console', min: 4.5 },
		{ selector: '[data-testid="hx-view-manifest"] .level-desc', label: "the level descriptor a student reads", min: 4.5 },
		{ selector: '[data-testid="hx-view-manifest"] .criterion-text', label: 'the criterion name a student reads', min: 4.5 }
	],
	tapTargets: [
		/* 44, not 24. The console carries no named instructor-density class on
		   its own root (`main.grading-page.cr-console.cr-app-body`), and
		   CLAUDE.md's rule is that a surface with no such class is student-facing
		   for the purpose of the floor. Measured 49.7px high at both widths, so
		   the stronger claim is also the true one. */
		{ selector: '[data-testid="hx-console-manifest"] .level-btn', label: 'a level button', min: 44 },
		{ selector: '[data-testid="hx-console-manifest"] .roster-row', label: 'a roster row', min: 44 }
	],
	textContains: [
		{
			selector: '[data-testid="hx-console-manifest"]',
			label: "the console shows the manifest's own short forms, not the descriptors",
			must: ['Every part staged, guard on.', 'Within 0.5 mm, clean edge.', 'Names a cause, tests it.'],
			/* RUNG THREE'S TEXT, which is what a dropped `short` would put on the
			   button. It is legitimately present in the TOOLTIP, so this row is
			   anchored at the buttons' own container below rather than here --
			   see the orderResult check, which reads `.level-short` alone. */
			mustNot: []
		},
		{
			selector: '[data-testid="hx-facts"]',
			label: 'the manifest produces four criteria worth 30, with no issues',
			must: [
				'Rubric total from the manifest: 30',
				'Criteria: 4',
				'setup-quality setup-notes cut-quality cut-notes',
				'Manifest issues: 0',
				'Derived rubrics identical as JSON: yes'
			]
		},
		{
			selector: '[data-testid="hx-oracle-summary"]',
			label: 'levelShort resolves every level at rung one, with and without a spec',
			must: ['13 of 13 resolve identically with and without a spec', '0 of 13 fell back to the descriptor']
		}
	],
	orderResult: [
		{
			/* THE WHOLE CLAIM, AS A SCRAPE OF TWO SCREENS. Both student-facing
			   rubrics and both consoles' level text, read off the rendered DOM and
			   compared. Two objects being equal is what the unit test says; this
			   is the two renderings. */
			evaluate: `() => {
				const norm = (el) => (el?.textContent ?? '').replace(/\\s+/g, ' ').trim();
				const btns = (a) => [...document.querySelectorAll(a + ' .level-btn')].map((e) => norm(e)).join(' | ');
				return [
					norm(document.querySelector('[data-testid="hx-view-manifest"]')) === norm(document.querySelector('[data-testid="hx-view-spec"]')),
					btns('[data-testid="hx-console-manifest"]') === btns('[data-testid="hx-console-spec"]'),
					norm(document.querySelector('[data-testid="hx-view-manifest"]')).length > 400,
					btns('[data-testid="hx-console-manifest"]').length > 400
				];
			}`,
			expected: [true, true, true, true],
			label: 'the two student rubrics and the two consoles render identical text, and neither scrape is empty'
		},
		{
			/* THE ONE-LINE FORMS, AGAINST THE PAGE'S OWN ORACLE. The right-hand
			   side is `levelShort` called directly on the derived levels and
			   printed in the oracle table, so this compares the console with the
			   pure resolver rather than with a list typed beside it. Break the
			   translation and BOTH go quiet, which is the tell that a mutation
			   landed rather than the console merely hiding something. */
			evaluate: `() => {
				const shorts = [...document.querySelectorAll('[data-testid="hx-console-manifest"] .level-short')].map((e) => e.textContent.trim());
				const oracle = [...document.querySelectorAll('[data-testid="hx-oracle"] tbody tr')].map((tr) => tr.querySelectorAll('td')[2].textContent.trim());
				const descriptors = [...document.querySelectorAll('[data-testid="hx-view-manifest"] .level-desc')].map((e) => e.textContent.trim());
				return [
					shorts.join(' | '),
					oracle.join(' | '),
					shorts.some((s) => descriptors.includes(s))
				];
			}`,
			expected: [
				'Every part staged, guard on. | Staged, guard missing or late. | Not set up. | Specific, in order, dated. | Present, vague. | No notes. | Within 0.5 mm, clean edge. | Within 1 mm. | Outside 1 mm, recoverable. | No cut made. | Names a cause, tests it. | Names the error only. | No reflection.',
				'Every part staged, guard on. | Staged, guard missing or late. | Not set up. | Specific, in order, dated. | Present, vague. | No notes. | Within 0.5 mm, clean edge. | Within 1 mm. | Outside 1 mm, recoverable. | No cut made. | Names a cause, tests it. | Names the error only. | No reflection.',
				false
			],
			label: 'every level button shows the resolver\'s answer, and not one of them is a descriptor'
		},
		{
			/* THE ID IS THE JOIN KEY AND IT REACHES THE MARKUP. `data-grade-level`
			   is positional, so the ids are read off the fixture's own criterion
			   names instead: both modules use `quality` and `notes`, and four
			   distinct criteria come out. Unnamespaced they would be two. */
			evaluate: `() => {
				const crits = [...document.querySelectorAll('[data-testid="hx-console-manifest"] .score-crit')].map((e) => e.textContent.trim());
				return [crits.join(' | '), new Set(crits).size];
			}`,
			expected: [
				'Bench setup: Bench is set up as specified | Bench setup: Setup notes record what was actually done | First cut: The cut is within tolerance | First cut: Reflection explains the error',
				4
			],
			label: 'two modules sharing the criterion ids `quality` and `notes` produce four distinct rows'
		}
	],
	/* The harness blocks every non-loopback request, so the fixture's own font
	   fetch resets. Nothing to do with this surface. */
	ignoreConsole: ['ERR_CONNECTION_RESET', 'ERR_BLOCKED_BY_CLIENT']
};
