export default {
	path: '/dev/feedback?speech=restart',
	label: 'Report box dictation, kept alive: the service ends a session and listening carries on',
	/*
		REPORT 5ab3adb6: "as close to Claude's dictation as possible", and Chrome
		ends a session on its own after a silence or a time limit. The harness's
		`restart` script makes the FIRST recogniser end itself 1.2s after its
		final, as Chrome's own limit does; a box on a fine pointer (this
		harness's Chromium, both widths) opens a second one with no second
		"listening" and no flicker of the control, and the second hears "then
		the page went blank". `window.__fbSpeech.built` counts the recognisers.

		WHAT IS MEASURED: the control stays pressed across the service's end,
		two recognisers were built, the two sentences are joined by the sentence
		rule (2s of silence, so a period and a capital), and STOP then closes the
		last sentence with its period. A restart that silently did not happen
		would leave the control reading DICTATE with the second sentence lost,
		which only this end-to-end drive can see in a real browser.
	*/
	prepare: [
		{
			click: '.sfb-relocated .sfb-trigger',
			until: '() => { const t = document.querySelector("#fb-msg"); return !!t && t.getBoundingClientRect().height > 0; }',
			attempts: 8,
			waitMs: 300
		},
		{
			click: '.fb-dictate',
			until: '() => document.querySelector(".fb-dictate")?.getAttribute("aria-pressed") === "true"',
			attempts: 3,
			waitMs: 150
		},
		{
			/* The second recogniser's sentence lands, and the control never let go. */
			evaluate: '() => {}',
			until:
				'() => document.querySelector("#fb-msg").value === "The launch button did nothing. Then the page went blank" && (window.__fbSpeech?.built ?? 0) === 2 && document.querySelector(".fb-dictate")?.getAttribute("aria-pressed") === "true"',
			attempts: 14,
			gapMs: 300
		},
		{
			/* STOP closes the last sentence. */
			click: '.fb-dictate',
			until:
				'() => document.querySelector(".fb-dictate")?.getAttribute("aria-pressed") === "false" && document.querySelector("#fb-msg").value === "The launch button did nothing. Then the page went blank."',
			attempts: 3,
			waitMs: 300
		}
	],
	presence: [
		{
			selector: '.fb-dictate[aria-pressed="false"]',
			label: 'the control at rest after STOP',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.fb-dictate-error',
			label: 'no refusal: a service ending a session is not a failure',
			expectPresent: 0
		}
	],
	orderResult: [
		{
			label: 'two recognisers, one session, two sentences, one period each',
			evaluate:
				'() => [String(window.__fbSpeech?.built ?? 0) + " recognisers", document.querySelector("#fb-msg").value, (document.querySelector(".fb-dictate-status")?.textContent ?? "").trim() === "" ? "status empty after STOP" : "STATUS: " + document.querySelector(".fb-dictate-status").textContent.trim()]',
			expected: [
				'2 recognisers',
				'The launch button did nothing. Then the page went blank.',
				'status empty after STOP'
			]
		}
	],
	tapTargets: [{ selector: '.fb-dictate', label: 'the dictate control', min: 44 }]
};
