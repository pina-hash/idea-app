export default {
	path: '/dev/feedback',
	label: 'Report affordance, box open: the tried field and the box controls',
	/*
		THE REPORT BOX HAD NO ROUTE SPEC AT ALL until 0170 put a second field
		and an attach control in it, which is the ordinary reason a surface gets
		measured: something was added to it. `/dev/feedback` has existed since
		the shell mount landed and mounts the REAL SiteFeedback, the REAL
		FeedbackBox behind it and the REAL FeedbackConsole against one in-memory
		sink -- so what is measured here is the shipped component, not a copy.

		WHAT THIS SPEC CAN REACH, AND WHAT IT CANNOT, said plainly because the
		gap is the interesting half:

		  * THE BOX AND EVERYTHING IN IT, including the new "What did you try?"
		    field, is reached by clicking one of the harness's relocated
		    triggers. That is what the prepare step below does.
		  * THE ATTACH CONTROL IS NOT REACHABLE HERE, and that is a fixture
		    gap rather than a defect in the control. `SiteFeedback` builds its
		    screenshot transport from a Supabase client and a viewer id --
		    read from `page.data`, the way ProfileMenu reads `userProfile`, so
		    that every existing mount inherits the control without four
		    layouts outside the feedback subsystem having to thread one -- and
		    a `/dev` route has neither. The harness page would need one line
		    at its mount (`uploadScreenshot={...}`, an in-memory stand-in) for
		    the control to render, and `src/routes/dev/feedback/` was OUTSIDE
		    the file surface of the bundle that wrote this spec. Whoever owns
		    that page next should add it and a `tapTargets` row for
		    `.fb-shot-choose` and `.fb-shot-remove` here; both carry
		    `min-height: 44px` in the component's own stylesheet, which is
		    ASSERTED IN SOURCE by tests/feedback-tried-and-screenshot.test.ts
		    and is NOT the same thing as having been measured on a page.

		SO EVERY NUMBER BELOW IS ABOUT THE BOX AS IT RENDERS WITHOUT A SESSION,
		which is exactly what a signed-out visitor gets and therefore worth
		measuring on its own account.

		PROMPT 0111 ADDED TWO THINGS TO THIS BOX AND BOTH ARE MEASURED HERE.
		The IDEA theme: every colour below is now the portal's own token
		(--bg1/--bg0 plate, --white ink, --text-2 secondary, --green accent,
		--boundary edges), so the contrast rows are the theme's numbers and not
		the old neutral-blue defaults'. And DICTATION: the harness hands the
		first relocated mount a scripted speech recogniser, so the control
		renders here exactly as it does in Chrome or Safari; its resting state
		is measured in this spec and its listening state in
		feedback-state-dictating.mjs next door, because the word on the control
		changes between the two.
	*/
	prepare: [
		{
			/*
				OPEN THE BOX. The relocated trigger, not the shell's floating one:
				the harness mounts several, and the first relocated one is inside
				the page's own card where nothing overlaps it.

				THE PREDICATE IS THE THING WANTED, not a proxy for it -- the tried
				field having a BOX, which only a real open can produce. A predicate
				the page satisfies at rest short-circuits the click and the step
				reaches no state, which is the failure this repo has already had
				once (see spec-table-open).
			*/
			click: '.sfb-relocated .sfb-trigger',
			until: '() => { const t = document.querySelector("#fb-tried"); return !!t && t.getBoundingClientRect().height > 0; }',
			attempts: 8,
			waitMs: 300
		}
	],
	presence: [
		{
			selector: '#fb-tried',
			label: 'the What did you try field, once the box is open',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: 'label[for="fb-tried"]',
			label: 'its label, which carries the word optional',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			/*
				ABSENCE, WITH ITS REASON BESIDE IT. No client and no viewer on a
				/dev route, so no attach control -- which is the same branch a
				signed-out visitor takes in production. The note below is the
				positive control for it: a control that vanished silently and a
				control that is correctly absent look identical without one.
			*/
			selector: '.fb-shot-choose',
			label: 'the attach control (absent with no session, by design)',
			expectPresent: 0
		},
		{
			selector: '.fb-shot-absent',
			label: 'the sentence saying why there is no attach control',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.fb-dictate',
			label: 'the dictate control, with the harness recogniser in play',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.fb-dictate-note',
			label: 'the sentence saying where the audio goes',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			/* At rest nothing is being heard and nothing has been refused, so
			   neither of these renders; the note above is the positive control
			   for the same subtree. */
			selector: '.fb-dictate-heard, .fb-dictate-error',
			label: 'no interim text and no refusal before anything is said',
			expectPresent: 0
		}
	],
	textContains: [
		{
			selector: 'label[for="fb-tried"]',
			label: 'the tried field says it is optional',
			must: ['optional']
		},
		{
			selector: '.fb-shot-absent',
			label: 'the absence names its reason rather than leaving a gap',
			must: ['screenshot']
		},
		{
			selector: '.fb-dictate',
			label: 'the control carries the word, not only a glyph',
			must: ['DICTATE'],
			mustNot: ['STOP']
		},
		{
			selector: '.fb-dictate-note',
			label: 'the note says whose service hears the audio',
			must: ['browser', 'speech service']
		}
	],
	contrast: [
		{ selector: 'label[for="fb-tried"]', label: 'tried field label', min: 4.5 },
		{ selector: '.fb-shot-absent', label: 'the no-attach sentence', min: 4.5 },
		{ selector: '.fb-title', label: 'the box title on the themed plate', min: 4.5 },
		{ selector: '.fb-note', label: 'the opening note on the themed plate', min: 4.5 },
		{ selector: '.fb-kind.on', label: 'the selected kind chip, accent ink on the field fill', min: 4.5 },
		{ selector: '.fb-btn-primary', label: 'SEND, accent ink on the control fill', min: 4.5 },
		{ selector: '.fb-count', label: 'the characters-left count', min: 4.5 },
		{ selector: '.fb-dictate', label: 'the dictate control word', min: 4.5 },
		{ selector: '.fb-dictate-note', label: 'the where-the-audio-goes sentence', min: 4.5 }
	],
	tapTargets: [
		/*
			THE TEXTAREA IS A TARGET: it owns its row, so it takes the 44px floor
			rather than the inline-in-prose exemption.
		*/
		{ selector: '#fb-tried', label: 'the tried textarea', min: 44 },
		{ selector: '.fb-box .fb-btn', label: 'the box buttons (dictate, cancel, send)', min: 44 },
		{ selector: '.fb-box .fb-kind', label: 'the four kind chips', min: 44 },
		{ selector: '.fb-dictate', label: 'the dictate control on its own', min: 44 }
	]
};
