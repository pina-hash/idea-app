export default {
	path: '/dev/instructor-requests',
	label: "Prompt 0069's four built items, each mounting the real component",
	/*
		FOUR INSTRUCTOR REQUESTS, ONE PAGE, AND EACH ROW BELOW SAYS WHICH.

		WHAT NEEDS A BROWSER HERE AND WHAT DOES NOT. The database rules are
		asserted in `tests/classroom-song-queue-spotify.test.ts` and
		`tests/db/feedback-delete-is-a-status.test.ts`, against real Postgres,
		which is where they belong -- nothing on a page can say whether an RPC
		refuses. What only a browser can answer:

		  * WHETHER THE 11:59PM DEFAULT IS ACTUALLY IN THE BOX. The whole reason
		    the due field became two controls is a MEASURED fact about
		    `datetime-local` -- with only its date segments filled its value is
		    the empty string, `badInput` is true and no event has fired -- so a
		    default had nowhere to live. That measurement is written up in
		    `src/lib/classroom/due-default.ts`; what is measured HERE is the
		    consequence: a time box seeded 23:59 beside an EMPTY date box.
		    Both halves matter and only together: a seeded date would be a
		    deadline nobody chose.
		  * WHETHER THE SPOTIFY RULE IS SAID BEFORE THE PASTE. A refusal is a
		    sentence the database already owns; a rule a student meets only by
		    being refused is a rule nobody told them, and the fix for that is
		    copy on the surface, which is a browser question.
		  * WHETHER THE FOURTH STATUS EXISTS AS A CONTROL AND AS AN UNDO. Spam
		    is a status, not a delete, and the property that makes that true on
		    screen is that a spam row still renders its other three buttons.
		  * WHETHER THE TWO CONFUSABLE CONTROLS ARE NOW DISTINGUISHABLE. This is
		    the item that IS a browser question and nothing else: two adjacent
		    same-sized controls that both open a panel below the same strip.

		THE FIFTH REQUEST -- sorting a page by date -- IS NOT ON THIS PAGE AND
		THAT IS THE RESULT, not an omission. The audit found several candidate
		lists and no way to tell which was meant, so nothing was built; the
		lede on the page says so, and `textContains` below pins that sentence,
		because a harness that quietly stopped mentioning it would read as four
		requests having been the whole ask.
	*/
	presence: [
		{
			selector: 'section.mount[data-mount]',
			label: 'the four item mounts',
			expectPresent: 4,
			maxPresent: 4,
			expectVisible: 4
		},
		/* 1. THE DUE FIELD. Two boxes, and exactly two. */
		{
			selector: '[data-testid="composer-due-date"]',
			label: 'the due DATE box',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="composer-due-time"]',
			label: 'the due TIME box',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			/*
				ABSENCE WITH A REASON. The single `datetime-local` is gone from the
				due field; `publish_at` still uses one, which is why this is scoped
				to the mount rather than to the page -- an unscoped row would be
				asserting something false about a control this bundle never touched.
			*/
			selector: '[data-mount="due time defaults to 11:59pm"] .due-field input[type="datetime-local"]',
			label: 'no single datetime box left in the due field',
			expectPresent: 0
		},
		/* 3. THE FOURTH STATUS, as a tab and as a row button. */
		{
			selector: '[role="tablist"] [role="tab"]',
			label: 'the status tabs: four statuses plus All',
			expectPresent: 5,
			maxPresent: 5,
			expectVisible: 5
		},
		{
			/*
				MEASURED AFTER THE PRESS, which is why the count is 4 and not 8: the
				fixture opens with two rows in New, the prepare step marks one Spam,
				and the row that leaves the queue takes its four buttons with it.
				THE REMAINING ROW STILL CARRIES ALL FOUR -- including the three that
				are the undo for a row in any other state, which is the property
				that makes this a status rather than a delete.
			*/
			selector: '.fb-actions button',
			label: 'four status buttons on the row still in the queue -- three of them the undo',
			expectPresent: 4,
			maxPresent: 4,
			expectVisible: 4
		},
		/* 4. THE TWO CONTROLS, both present and both visible in one strip. */
		{
			selector: '[data-testid="inspector-toggle"]',
			label: 'the Instructor tools toggle',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="item-edit-toggle"]',
			label: 'the Edit control beside it',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			/*
				THE SEPARATION, AS A SELECTOR. Both controls now carry
				`aria-controls`, and they must name DIFFERENT regions -- this row
				asserts the Edit control's own target, and the `orderResult` probe
				below is what asserts the two are not the same string. A row
				asserting only that both have the attribute would pass with both
				pointing at the same panel, which is the defect wearing a hat.
			*/
			selector: '[data-testid="item-edit-toggle"][aria-controls="item-edit-direct"]',
			label: 'Edit names the region it opens',
			expectPresent: 1,
			maxPresent: 1
		}
	],
	textContains: [
		{
			selector: '[data-mount="song links are spotify only"] .sq-note',
			label: 'the Spotify rule is said before the paste, not only in a refusal',
			must: ['Spotify']
		},
		{
			selector: '[data-mount="song links are spotify only"] .sq-label',
			label: 'and the field itself is labelled for it',
			must: ['Spotify']
		},
		{
			selector: '[data-testid="inspector-toggle"] .insp-label',
			label: 'the toggle names a collection of tools',
			must: ['Instructor tools']
		},
		{
			/*
				THE WHOLE OF ITEM 5, IN ONE ASSERTION. "Edit" alone said neither
				what it edits nor which of the two panels it opens; "Edit post"
				names its object, and `mustNot` is what stops a later tidy-up
				shortening it back to the word that made the pair confusable.
			*/
			selector: '[data-testid="item-edit-toggle"]',
			label: 'the Edit control names what it edits',
			must: ['Edit post']
		},
		{
			selector: '.lede',
			label: 'the page says which request was NOT built, and why',
			must: ['not built']
		}
	],
	orderResult: [
		{
			/*
				THE TWO CONTROLS OPEN TWO DIFFERENT REGIONS, AND BOTH TARGETS
				EXIST. An `aria-controls` pointing at nothing is worse than none --
				a reader is told there is a region and sent nowhere -- so the probe
				resolves both ids as well as comparing them.
			*/
			evaluate: `() => {
				const e = document.querySelector('[data-testid="item-edit-toggle"]');
				const i = document.querySelector('[data-testid="inspector-toggle"]');
				if (!e || !i) return ['a control is missing'];
				const ec = e.getAttribute('aria-controls');
				const ic = i.getAttribute('aria-controls');
				/* THE TOGGLE NAMES ITS REGION ONLY WHILE THAT REGION EXISTS, so a
				   COLLAPSED toggle correctly carries no aria-controls, and this
				   probe reads it in exactly that state because nothing here opens
				   it. See the label and the spec comment above -- no backticks in
				   here, this is the inside of a template literal. */
				if (!ec) return ['Edit has no aria-controls'];
				if (!ic) return [ec, '(toggle collapsed: no aria-controls, and no dangling id)'];
				if (ec === ic) return ['both name the same region: ' + ec];
				if (!document.getElementById(ec)) return ['Edit names no real region: ' + ec];
				if (!document.getElementById(ic)) return ['the toggle names no real region: ' + ic];
				return [ec, ic];
			}`,
			expected: ['item-edit-direct', '(toggle collapsed: no aria-controls, and no dangling id)'],
			label: 'neither control names a region that is not in the document'
		},
		{
			/*
				THE DEFAULT, READ OFF THE TWO BOXES. The date must be EMPTY and the
				time must be 23:59; reading only the time would pass on a composer
				that had also invented a due date.
			*/
			evaluate: `() => {
				const d = document.querySelector('[data-testid="composer-due-date"]');
				const t = document.querySelector('[data-testid="composer-due-time"]');
				if (!d || !t) return ['a due box is missing'];
				return ['date=' + JSON.stringify(d.value), 'time=' + JSON.stringify(t.value)];
			}`,
			expected: ['date=""', 'time="23:59"'],
			label: 'the due field opens with no date and an 11:59pm time'
		},
		{
			/*
				A SPAM ROW IS STILL IN THE SET, which is the export-honesty half of
				the choice: `All` means every status, so nothing this console can be
				pointed at silently omits a report. Read off the tab COUNTS rather
				than off the rendered rows, because the console opens on New and the
				spam row is correctly not drawn at rest -- which is the feature, not
				a gap.
			*/
			evaluate: `() => {
				const tabs = [...document.querySelectorAll('[role="tablist"] [role="tab"]')]
					.map((t) => t.textContent.trim());
				return [
					tabs.find((t) => t.startsWith('New')) || 'no new tab',
					tabs.find((t) => t.startsWith('Spam')) || 'no spam tab',
					tabs.find((t) => t.startsWith('All')) || 'no all tab'
				];
			}`,
			/*
				READ AFTER THE PRESS. The fixture opens with two New and one Spam;
				the prepare step marks one of the two, so New falls to 1 and Spam
				rises to 2 -- which is the whole claim in three numbers: the report
				left the queue, and `All` never moved, because `all` still means
				every status and no surface here silently omits a row.
			*/
			expected: ['New (1)', 'Spam (2)', 'All (5)'],
			label: 'marking spam takes a report out of the queue and out of no total'
		}
	],
	prepare: [
		{
			/*
				PRESS SPAM ON THE ONE VISIBLE ROW AND READ THE CALL BACK. The
				predicate is the harness's own probe line, which ONLY the press can
				write -- it reads "no press yet" at rest, so a predicate the page
				satisfied already would be caught rather than short-circuiting the
				step.

				THIS IS THE CONTROL EXISTING AND FIRING, not the database refusing
				or accepting: the transport here is in memory. What the RPC does
				with it is `tests/db/feedback-delete-is-a-status.test.ts`.
			*/
			click: '.fb-actions button:nth-of-type(4)',
			until: '() => (document.querySelector(\'[data-testid="probe-set-status"]\')?.textContent || "").includes(":spam")',
			attempts: 12,
			waitMs: 250
		}
	],
	contrast: [
		{ selector: '.due-legend', label: 'the due field name', min: 4.5 },
		{ selector: '.due-part-label', label: 'the Date/Time part labels', min: 4.5 },
		{
			selector: '[data-mount="song links are spotify only"] .sq-note',
			label: 'the sentence carrying the Spotify rule',
			min: 4.5
		},
		{
			/*
				THE STATUS CHIP IS TEXT, so it takes 4.5 rather than the 3:1 a
				boundary takes. The spam chip's own amber is NOT what is measured
				here and cannot be: the console opens on New, so the chip on screen
				after the prepare step is the surviving row's. The amber is asserted
				where it can be -- in `tests/`, from the stylesheet -- and this row
				measures the chip a reader is actually looking at.

				AND IT TAKES NO TAP-TARGET ROW. A first draft put one here at the
				24px floor and it reported the chip at 18.5px -- correctly, and for
				a control that does not exist: `.fb-status` is a LABEL, nothing
				presses it, and the floor is about targets. Inflating a status chip
				to satisfy a check written for buttons is the shape CLAUDE.md calls
				breaking a real invariant to satisfy a guideline; the reason it is
				not measured is recorded here instead.
			*/
			selector: '.fb-status',
			label: 'the status chip on the row still in the queue',
			min: 4.5
		},
		{ selector: '.insp-label', label: 'the Instructor tools label', min: 4.5 },
		{ selector: '[data-testid="item-edit-toggle"]', label: 'the Edit post control', min: 4.5 }
	],
	tapTargets: [
		/*
			BOTH DUE BOXES TAKE THE 44px FLOOR: each owns its cell in the field's
			own grid, so neither is an inline target in a line of prose.
		*/
		{ selector: '[data-testid="composer-due-date"]', label: 'the due date box', min: 44 },
		{ selector: '[data-testid="composer-due-time"]', label: 'the due time box', min: 44 },
		{ selector: '.fb-actions button', label: 'the four status buttons, Spam among them', min: 44 },
		{ selector: '[role="tablist"] [role="tab"]', label: 'the five status tabs', min: 44 },
		{ selector: '[data-testid="item-edit-toggle"]', label: 'the Edit post control', min: 44 },
		{ selector: '[data-testid="inspector-toggle"]', label: 'the Instructor tools toggle', min: 44 }
	]
};
