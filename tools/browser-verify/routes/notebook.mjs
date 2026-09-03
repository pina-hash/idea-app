// original array position 18 of 25 -- see ../README.md for what `order` means
export const order = 18;

export default {
	path: '/dev/notebook',
	label: "Notebook, student account (the compose form stacked above the feed at phone width, always -- CLAUDE.md: 'a phone has always shown it ABOVE the feed')",
	/*
		REACHABLE FROM NOWHERE ELSE IN THIS FILE. `NotebookView.svelte` and
		`NotebookEntryCard.svelte` had never been driven here before this
		bundle -- `/dev/notebook-review` mounts the review CONSOLE (a
		different component, `SectionGrid`), never the student's own
		notebook. The default account is 'student', which at 375px is
		`wide=false`, so `composerMounted` is unconditionally true and the
		split's `has-detail` class applies from first paint -- no prepare
		step is needed to reach the state this route exists to measure.

		THIS IS THE ROUTE THE 10px OVERFLOW WAS ON. `.field.label-field`
		(the free-entry title field) had no override for the shared
		`.field` class's row-flex layout from app.css -- a key/value row
		built for a profile header, not a label wrapping a stacked input
		and hint -- so the title field's long hint sentence forced the row,
		and the document, 10.5px past the viewport. `body` clips horizontal
		overflow (app.css), so nothing scrolled and nothing looked wrong;
		the content was simply cut off the right edge. Fixed by giving
		`.label-field` itself the column stacking `.note-field` and
		`.folder-field` already had -- the folder field only avoided the
		same defect by ALSO carrying `.folder-field`, which the title
		field's label never did.
	*/
	/*
		THE TITLE FIELD ONLY RENDERS FOR A FREE ENTRY (`selectedSession ===
		null`), and which check-in (if any) auto-selects on mount is not
		pinned by this route -- forcing "Something else" is what makes the
		title field's presence deterministic at BOTH widths rather than
		riding whatever the auto-pick effect happened to land on.
	*/
	/*
		THE CLICK WAITS FOR THE AUTO-SELECT EFFECT TO HAVE RUN, AND THAT IS A
		DOM SIGNAL RATHER THAN A CONSTANT.

		THE ORIGINAL BUG, kept because the shape recurs: this was
		`{ click: '.pick.free', until: <aria-pressed is true> }` with no
		`force`. `selectedSession` starts `null` before the mount effect
		(`nearestOutstanding`) settles it, and `.pick.free`'s `aria-pressed` IS
		`selectedSession === null` -- so the predicate is satisfied by the
		component's own PRE-EFFECT DEFAULT. `clickUntil` checks `until` once
		before clicking and short-circuits on "already satisfied", so the click
		never fired and the run measured whatever the effect settled on.

		`force: true` (browser.mjs) closed that by firing the click regardless,
		and a fixed `setTimeout(600)` was added in front of it as a documented
		LAST RESORT after a `performance.now()` margin was measured not to help.

		BOTH OF THOSE ARE GONE NOW, AND THE MEASUREMENT IS WHY. Polling
		`aria-pressed` every 25ms from the moment `waitForApp` returns, the
		auto-select effect lands at **1483ms** on a cold visit and at **239ms**
		when `/dev/notebook-review` ran immediately before it -- which is the
		adjacency every real pass has, because their `order` values are 17 and
		18. A 6x spread, and the 600ms constant sits INSIDE it: on the cold
		sequence the click preceded the effect by ~880ms, on the warm one it
		followed it by ~360ms. A constant chosen against one of those is a bet
		against the other, and neither the constant nor the report said so.

		THE SIGNAL IS THE EFFECT'S OWN OUTCOME. Until it runs, `open`'s picks
		are all unpressed and `.pick.free` holds the default; the moment it
		settles, exactly one `.pick:not(.free)` carries `aria-pressed="true"`.
		Measured 0 of those at t=0 in both sequences and 1 from the settle
		onward, so the predicate cannot be satisfied by the pre-effect state --
		which is precisely what the original bug was.

		AND THAT IS WHAT LETS `force` GO. After the wait, `.pick.free` is
		aria-pressed FALSE, so the click's own `until` names something ONLY the
		click can produce -- the preferred way out in ../README.md, rather than
		the `[force: predicate not required to discriminate]` annotation this
		row used to print. `chooseSession(null)` sets `sessionTouched`, whose
		guard (`sessionTouched && !stale`) then stops the effect re-running, so
		the click is the last writer. A failed wait prints FAILED and the rows
		below are read as describing a state never reached; a fixed delay could
		only be wrong quietly.

		WHAT IS NOT CLAIMED: this bundle could not reproduce the finding this
		route was flagged for. It fired 0 of 6 times here before the change
		(five targeted runs plus one full pass) and 0 of 18 times under three
		deliberately adversarial prepare shapes, INCLUDING no wait at all -- so
		the 600ms was measurably inert in this container and its removal costs
		nothing that was ever measured. The change is the removal of a timing
		assumption whose bracket was measured, not a proven fix for a race
		nobody here could make fire.
	*/
	prepare: [
		{
			waitFor: '() => !!document.querySelector(\'.pick:not(.free)[aria-pressed="true"]\')',
			timeoutMs: 15_000
		},
		{
			click: '.pick.free',
			until: '() => document.querySelector(".pick.free").getAttribute("aria-pressed") === "true"'
		}
	],
	presence: [
		{ selector: '.dev-bar', label: 'harness controls', expectPresent: 1 },
		{ selector: '.nb-root', label: 'NotebookView mounted', expectPresent: 1 },
		{ selector: '.compose-card label.label-field', label: 'free-entry title + folder fields (both stacked, not row-flex)', expectPresent: 2 },
		/*
			THE POSITIVE CONTROL FOR `/dev/notebook-review-student`'s ABSENCE ROW.
			That page asserts the "Recently deleted" chip does NOT render, because
			the staff mount hands `NotebookView` no deleted list and the chip's
			only possible outcome there was an empty state. An absence assertion
			with nothing paired to it is a selector that could simply have stopped
			matching -- so the SAME component, on the student's own view, with a
			pre-seeded trash fixture behind it, must still render exactly one.
		*/
		{ selector: '[data-testid="filter-deleted"]', label: "Recently deleted chip (student's own view: a list IS behind it)", expectPresent: 1, maxPresent: 1 }
	],
	contrast: [{ selector: '.compose-card .hint', label: 'title field hint copy', min: 4.5 }],
	tapTargets: [
		{ selector: '.compose-card input[type="text"], .compose-card select', label: 'compose form controls', min: 44 },
		/*
			THE STUDENT-FACING "Turn in" / "Save draft" CONTROLS ARE PLAIN `.btn`
			(NotebookView.svelte's `.actions` block, no `.tap-44`) and until this
			line nothing measured them -- exactly the shape a `.btn`-wide CSS
			change would need a check to catch, on the one surface where that
			would matter most (a student, submitting their own work). Measured
			clean today: 72.9x44 at 375px, 64.7x44 at 1440px (min dim 44px,
			already clearing floor by other means) -- added for regression
			protection, not because it is currently broken.
		*/
		{ selector: '.compose-card .btn', label: 'compose form submit controls (Turn in / Save draft -- plain .btn)', min: 44 },
		/*
			THE FREE-ENTRY CHIP, MEASURED RATHER THAN ASSUMED. This route already
			CLICKS `.pick.free` in `prepare` -- it is the control that makes the
			title field render at all -- and until this line nothing had ever
			measured its box. It is a `.pick` in the check-in picker, a
			student-facing surface at every width, so the 44px floor applies with
			no density-contract exemption to claim.

			LISTED WHATEVER IT MEASURES. If it is under the floor that is a
			finding to report and not a number to soften: the fix is a rule in
			NotebookView's own stylesheet, and a check that only exists once it
			passes is a check that has never told anyone anything. The
			fallback-stack limit in ../README.md applies to this number like every
			other geometry measurement here.
		*/
		{ selector: '.pick.free', label: 'free-entry check-in chip (student-facing, no density exemption)', min: 44 }
	],
	/*
		THE FEED'S PHOTO THUMBNAILS 401 FOR THE SAME REASON EVERY OTHER
		NOTEBOOK ROUTE'S DO: `<img>` against the real `/api/notebook/photo/
		<id>` proxy, which needs a session this placeholder-.env dev server
		cannot provide. This fixture's own photo ids (p-1 through p-13,
		the STUDENT_ENTRIES/FILLER fixtures), named rather than blanketed.
	*/
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
