export default {
	path: '/dev/feedback?speech=pauses',
	label: 'Report box dictation: a long pause starts a sentence, a short one carries it on',
	/*
		REPORT 5ab3adb6: a period landed at every breath, mid-sentence. The
		harness's `pauses` script says three phrases: "the save button worked",
		then 2.9s of silence and "then the page froze", then 0.3s and "for ten
		seconds". The sentence rule (`continuesSentence`, the pause measured
		from the last thing heard) must close the first and carry the second
		on: a period and a capital at the long gap, a space and no capital at
		the short one. Measured on the field's value, which is the only place
		the rule's outcome exists.
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
			evaluate: '() => {}',
			until: '() => document.querySelector("#fb-msg").value.endsWith("for ten seconds")',
			attempts: 20,
			gapMs: 300
		}
	],
	orderResult: [
		{
			label: 'the long gap closes a sentence, the short gap carries one on, nothing closes the last yet',
			evaluate: '() => [document.querySelector("#fb-msg").value]',
			expected: ['The save button worked. Then the page froze for ten seconds']
		}
	],
	presence: [
		{
			selector: '.fb-dictate[aria-pressed="true"]',
			label: 'still listening: the script never ends the session itself',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		}
	]
};
