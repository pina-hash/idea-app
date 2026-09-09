export default {
	path: '/dev/feedback?state=dictating',
	label: 'Report affordance, box open and LISTENING: the dictate control mid-session',
	/*
		THE SAME BOX AS feedback.mjs, ONE PRESS FURTHER IN. The harness's
		scripted recogniser (mode "transcribes a sentence", the default) answers
		start() with an interim fragment at 350ms and a final sentence at 900ms,
		so pressing DICTATE puts the control into its listening state for real:
		the word becomes STOP, a live dot appears beside it, the status line
		says what listening means here, and the interim text shows BESIDE the
		field. Every one of those is a thing that could silently stop being
		true, which is why the state is measured and not only the control.

		WHAT IS ASSERTED ABOUT THE RULE ITSELF: the field is filled BEFORE the
		press and read AFTER the final sentence lands, and the typed text must
		still be its prefix. That is the never-overwrite rule (prompt 0111)
		measured in the browser the way tests/dom/feedback-dictation-mount
		measures it under happy-dom.

		THE DOT IS THE ONE THING IN THE BOX THAT ANIMATES. It pulses under
		no-preference and must rest painted at full opacity under reduce, the
		rule every mark in this repo already follows; `expect: 'gated'` is
		both halves in one row.
	*/
	prepare: [
		{
			click: '.sfb-relocated .sfb-trigger',
			until: '() => { const t = document.querySelector("#fb-msg"); return !!t && t.getBoundingClientRect().height > 0; }',
			attempts: 8,
			waitMs: 300
		},
		{
			/* Type first, through the same input event a person's typing raises,
			   so `bind:value` and `oninput` both see it. */
			evaluate:
				'() => { const t = document.querySelector("#fb-msg"); t.value = "I typed this first"; t.dispatchEvent(new Event("input", { bubbles: true })); }',
			until: '() => document.querySelector("#fb-msg").value === "I typed this first"',
			attempts: 3,
			waitMs: 100
		},
		{
			/* Press DICTATE ONCE. The control is a TOGGLE, and the scripted final
			   sentence lands 900ms after start(): a click step whose predicate
			   was "the sentence landed" re-clicked at 400ms, which is STOP, and
			   the sentence never came (measured, the first full run). So this
			   step's predicate is the pressed state, which the first click
			   satisfies at once, and the sentence is waited on below. */
			click: '.fb-dictate',
			until: '() => document.querySelector(".fb-dictate")?.getAttribute("aria-pressed") === "true"',
			attempts: 3,
			waitMs: 150
		},
		{
			/* Then wait for the FINAL sentence to land in the field, re-reading
			   rather than re-pressing: the evaluate is a no-op and the predicate
			   is the thing wanted. */
			evaluate: '() => {}',
			until: '() => document.querySelector("#fb-msg").value.startsWith("I typed this first the launch button")',
			attempts: 8,
			gapMs: 300
		}
	],
	presence: [
		{
			selector: '.fb-dictate[aria-pressed="true"]',
			label: 'the control in its pressed (listening) state',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.fb-dictate-dot',
			label: 'the live dot beside the word STOP',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.fb-dictate-status',
			label: 'the status line',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			/* The scripted recogniser never refuses in this mode. */
			selector: '.fb-dictate-error',
			label: 'no refusal while transcribing',
			expectPresent: 0
		}
	],
	textContains: [
		{
			selector: '.fb-dictate',
			label: 'the word changed with the state',
			must: ['STOP'],
			mustNot: ['DICTATE']
		},
		{
			selector: '.fb-dictate-status',
			label: 'the status says what listening means here',
			must: ['Listening', 'added to the box']
		}
		/* The never-overwrite rule itself is the SECOND PREPARE STEP's predicate:
		   the field's `.value` must start with the typed text and carry the
		   dictated sentence after it. It is not a text-contains row because that
		   check reads `textContent`, and a textarea whose value was set by script
		   has none (measured: "1 node(s), 0 chars" on a field visibly holding the
		   sentence). A prepare predicate that never holds reddens its own row. */
	],
	contrast: [
		{ selector: '.fb-dictate', label: 'STOP, on the listening control', min: 4.5 },
		{ selector: '.fb-dictate-status', label: 'the status line', min: 4.5 }
	],
	tapTargets: [{ selector: '.fb-dictate', label: 'the control while listening', min: 44 }],
	motion: [
		{
			selector: '.fb-dictate',
			label: 'the live dot: pulses under no-preference, rests painted under reduce',
			expect: 'gated'
		}
	]
};
