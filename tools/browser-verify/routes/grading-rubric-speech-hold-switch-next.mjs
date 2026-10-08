export default {
	path: '/dev/grading-rubric?speech=hold&switch=next',
	label: 'Grading console: N mid-sentence waits, and the sentence lands in the student it was spoken about',
	/*
		REPORT 5ab3adb6: every dictation field is keyed the same for every
		student, so a sentence still in flight when the grader pressed N used to
		land in the NEXT student's comment. Now the console waits for the
		session (`settle`), the `hold` script's stop finishes the words it was
		hearing, they land in Alice's comment with their period, and the
		unsaved-work bar asks about ALICE. The `switch` query is ignored by the
		page; it only names this spec's file.
	*/
	prepare: [
		{"waitFor": "() => document.querySelectorAll('[data-testid=\"console-pane\"] .roster-row').length === 3"},
		{"click": "[data-testid=\"console-pane\"] .roster-row:has-text(\"Alice Alvarez\")", "until": "() => !!document.querySelector('[data-testid=\"console-pane\"] .score-card')"},
		{
			click: '[data-testid="dictate-comment"]',
			until: '() => (document.querySelector("#grade-comment")?.closest(".dg-wrap")?.querySelector(".dg-ghost")?.textContent ?? "").includes("the fillet")',
			attempts: 3,
			waitMs: 600
		},
		{
			evaluate:
				'() => { document.activeElement?.blur?.(); document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true, cancelable: true })); }',
			until: '() => !!document.querySelector(\'[data-testid="console-pane"] [role="alertdialog"]\')',
			attempts: 3,
			gapMs: 500
		}
	],
	orderResult: [
		{
			label: 'still Alice, her comment holds the sentence, the guard asks about her',
			evaluate:
				'() => [document.querySelector(".work-name").textContent.trim(), document.querySelector("#grade-comment").value, document.querySelector(\'[role="alertdialog"] .dirty-line\').textContent.includes("Alice Alvarez") ? "the unsaved bar names Alice" : "THE BAR NAMES SOMEBODY ELSE"]',
			expected: ['Alice Alvarez', 'Clean weld, but the fillet.', 'the unsaved bar names Alice']
		}
	],
	presence: [
		{
			selector: '[data-testid="console-pane"] [role="alertdialog"]',
			label: 'the unsaved-work bar, for the student dictated into',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[aria-pressed="true"][data-dictate-field]',
			label: 'nothing listening after the wait',
			expectPresent: 0
		}
	]
};
