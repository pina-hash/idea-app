export default {
	path: '/dev/html-rubric?state=graded',
	label: 'HTML assignment rubric: a returned grade marks the same level on the console and on what the student reads',
	/*
		THE SAME COMPARISON WITH SCORES ON IT.

		WHY THIS IS A SEPARATE STATE RATHER THAN A SECOND FIXTURE. `RubricView`
		is the promise and the result in ONE rendering -- with `scores` it marks
		the level the student was given, DERIVED from the number by
		`levelIndexForScore`, which is exactly the rule
		`classroom_grade_submission` uses. So a manifest-derived rubric whose
		level points came out wrong would store, render, and then mark the WRONG
		LEVEL, or none at all, with nothing anywhere raising. That is only
		visible once something is scored.

		EVERY SCORE IS EXACTLY A LEVEL, WHICH IS THE POINT. 6 of 6 is Complete,
		2 of 4 is Developing, 8 of 12 is Proficient (the four-level criterion),
		4 of 8 is Developing. So four criteria mark four levels and NOTHING is an
		override -- the override chip's absence is the control, and the criterion
		carrying a comment shows the comment path works over a derived rubric
		too.

		THE EXPECTED LEVELS WERE WRONG THE FIRST TIME THIS SPEC WAS WRITTEN, and
		it is left recorded here because the check is what caught it. The list
		said `... | Complete` for `cut-notes`, reasoning from the criterion's
		NAME rather than from its score: 4 of 8 is the middle level, not the top
		one. The run reported the same three strings from three independent
		scrapes -- console, manifest rubric, spec control -- which is what a
		correct measurement of a wrong expectation looks like, and is why the
		three are read separately rather than compared to each other.
	*/
	prepare: [
		{
			waitFor:
				'() => document.querySelectorAll(".grading-page .roster-list .roster-row").length === 4'
		},
		{
			click: '[data-testid="hx-console-manifest"] .roster-row',
			until:
				'() => document.querySelectorAll(\'[data-testid="hx-console-manifest"] .level-btn.picked\').length === 4'
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'the classroom room', expectPresent: 1, expectVisible: 1 },
		/* FOUR OF THIRTEEN, and `maxPresent` matters as much as the floor: a
		   marker that fired on every level would satisfy a bare ">= 4". */
		{ selector: '[data-testid="hx-console-manifest"] .level-btn.picked', label: 'the picked level on the console', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="hx-view-manifest"] .level.chosen', label: 'the marked level in what the student reads', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="hx-view-spec"] .level.chosen', label: 'the marked level in the spec-derived control', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		/* NOT AN OVERRIDE. Every score is exactly a level's points, so the
		   between-levels path must be silent -- which is what says the derived
		   levels really do carry the points the grade was recorded against. */
		{ selector: '[data-testid="hx-view-manifest"] .override-line', label: 'a between-levels notice', expectPresent: 0 },
		{ selector: '[data-testid="hx-console-manifest"] .override-chip', label: 'an override chip', expectPresent: 0 },
		{ selector: '[data-testid="hx-view-manifest"] .crit-note', label: "the grader's comment on one criterion", expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '[data-testid="hx-view-manifest"] .level.chosen .level-label', label: 'the label of the level the student was given', min: 4.5 },
		{ selector: '[data-testid="hx-view-manifest"] .crit-note', label: "the grader's comment", min: 4.5 },
		{ selector: '[data-testid="hx-view-manifest"] .rubric-total', label: 'the scored total', min: 4.5 }
	],
	textContains: [
		{
			selector: '[data-testid="hx-view-manifest"] .rubric-head',
			label: 'the student reads 20 of 30, which is the rubric sum and not the item points',
			must: ['20 / 30 pts']
		}
	],
	orderResult: [
		{
			/* THE MARKED LEVELS, BY NAME, ON BOTH RENDERINGS. Reading the labels
			   rather than counting ticks is what would catch a rubric whose levels
			   came out in the wrong order: four ticks in the wrong places is a
			   count of four. */
			evaluate: `() => {
				const marks = (a) => [...document.querySelectorAll(a + ' .level.chosen .level-label')].map((e) => e.textContent.trim()).join(' | ');
				const picked = [...document.querySelectorAll('[data-testid="hx-console-manifest"] .level-btn.picked .level-label')].map((e) => e.textContent.trim()).join(' | ');
				return [marks('[data-testid="hx-view-manifest"]'), marks('[data-testid="hx-view-spec"]'), picked];
			}`,
			expected: [
				'Complete | Developing | Proficient | Developing',
				'Complete | Developing | Proficient | Developing',
				'Complete | Developing | Proficient | Developing'
			],
			label: 'the same four levels are marked on the console, on the manifest rubric and on the spec control'
		},
		{
			/* AND THE TWO STUDENT-FACING RENDERINGS ARE STILL WORD FOR WORD THE
			   SAME once scored, which the resting state cannot say. */
			evaluate: `() => {
				const norm = (el) => (el?.textContent ?? '').replace(/\\s+/g, ' ').trim();
				const a = norm(document.querySelector('[data-testid="hx-view-manifest"]'));
				const b = norm(document.querySelector('[data-testid="hx-view-spec"]'));
				return [a === b, a.length > 400];
			}`,
			expected: [true, true],
			label: 'the scored student rubrics still render identically, and the scrape is not empty'
		}
	],
	ignoreConsole: ['ERR_CONNECTION_RESET', 'ERR_BLOCKED_BY_CLIENT']
};
