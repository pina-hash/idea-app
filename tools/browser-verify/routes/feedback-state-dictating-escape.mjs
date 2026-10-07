export default {
	path: '/dev/feedback?state=dictating-escape',
	label: 'Report box dictation: Escape stops listening and keeps the box; a second Escape closes it',
	/*
		REPORT 5ab3adb6: Escape while dictating closed the whole box and the
		report with it. Escape is the conventional "stop dictating" key, so now
		it only stops listening (the box stays, with what was said in it); a
		second Escape, at rest, closes as it always did. Both halves are prepare
		predicates, so a half that does not happen reddens its own step: the
		first must leave the field mounted with the sentence in it and the
		control at rest, the second must remove the box.
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
			until: '() => document.querySelector("#fb-msg").value === "The launch button did nothing"',
			attempts: 8,
			gapMs: 300
		},
		{
			evaluate:
				'() => { document.querySelector("#fb-msg").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); }',
			until:
				'() => { const v = document.querySelector("#fb-msg")?.value ?? ""; return document.querySelector(".fb-dictate")?.getAttribute("aria-pressed") === "false" && v.startsWith("The launch button did nothing") && v.endsWith("."); }',
			attempts: 3,
			gapMs: 400
		},
		{
			evaluate:
				'() => { (document.querySelector("#fb-msg") ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); }',
			until: '() => !document.querySelector("#fb-msg")',
			attempts: 3,
			gapMs: 300
		}
	],
	presence: [
		{
			selector: '.fb-scrim',
			label: 'the box closed on the second Escape',
			expectPresent: 0
		},
		{
			selector: '.sfb-relocated .sfb-trigger',
			label: 'the relocated triggers are back (positive control for the same page)',
			expectPresent: 1,
			expectVisible: 1
		}
	]
};
