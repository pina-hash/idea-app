export default {
	path: '/dev/frc?state=student',
	label: 'FRC shell, ordinary-student state: every reviewer control absent',
	aliasOf: '/dev/frc',
	/*
		THE ABSENCE HALF OF THE 0167 REVIEWER-TIER GATE MATRIX. The harness
		defaults to "Simulate reviewer" ON (the presence half lives in
		frc-state-reviewer.mjs); unchecking it is the ordinary student, for whom
		FrcShell's `canReview` is false and every reviewer control must be
		structurally ABSENT, not merely hidden: the "View as student" toggle,
		the "Gate review" nav tab, and DomainLanding's completion-override
		strip.

		The `until` predicate is satisfiable ONLY by the click -- the toggle is
		present at rest -- so clickUntil cannot short-circuit into measuring
		the unchanged page (the trap the spec README names).

		Every absence row is expectPresent: 0, which the presence check treats
		as an exact ceiling; the positive controls beside them are what tells
		"the rule holds" apart from "the selector was renamed": the same
		`.frc-nav a[href=...]` vocabulary must still find the two ungated tabs,
		and the same `.fuo-unit` vocabulary still finds the sim panel's
		override strip OUTSIDE the shell (the harness's own progression panel,
		which is not gated and proves the component's selectors are live).
	*/
	prepare: [
		{
			click: '.harness-bar .sim-teacher input',
			until: '() => !document.querySelector(".frc-nav .frc-view-toggle")'
		}
	],
	presence: [
		{ selector: '.frc-nav .frc-view-toggle', label: '"View as student" toggle (reviewer-only)', expectPresent: 0 },
		{ selector: '.frc-nav a[href="/frc/review"]', label: '"Gate review" tab (reviewer-only)', expectPresent: 0 },
		{ selector: '.frc-main .teacher-override', label: 'completion-override strip (reviewer-only)', expectPresent: 0 },
		{ selector: '.frc-preview-banner', label: 'preview banner (reviewer-only)', expectPresent: 0 },
		/* Positive controls: the same selector vocabulary still resolves. */
		{ selector: '.frc-nav a[href="/frc"]', label: 'Track home tab (ungated)', expectPresent: 1 },
		{ selector: '.frc-nav a[href="/frc/references"]', label: 'References tab (ungated)', expectPresent: 1 },
		{ selector: '.harness-bar .sim-teacher input', label: 'the unchecked simulate control itself', expectPresent: 1 },
		{
			/* A FLOOR on purpose: 10 CAD units are content-backed today and the
			   count only grows as units are authored. The row's job is proving
			   the override component's selectors are live somewhere ungated. */
			selector: '.sim-panel .fuo-unit',
			label: 'override component alive in the harness sim panel (proves .fuo selectors)',
			expectPresent: 10
		}
	]
};
