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
		THIS USED TO BE `{ click: '.pick.free', until: ... }` WITH NO `force`, AND
		THE `until` WAS THE BUG. `selectedSession` starts `null` before the mount
		effect (`nearestOutstanding`) settles it to a real session, and `.pick.free`'s
		`aria-pressed` IS `selectedSession === null` -- so the predicate is
		satisfied by the component's own pre-effect DEFAULT, before any click.
		`clickUntil` checks its `until` ONCE, before clicking, and short-circuits
		on "already satisfied" (browser.mjs) -- so whenever the harness's first
		check landed before the effect settled, the click never fired at all, and
		the run silently measured whatever `selectedSession` became by the time
		`settle()` finished.

		A TWO-STEP SPLIT WAS TRIED NEXT -- an unconditional click (no `until`)
		plus a separate `waitFor` on the same predicate -- and it broke a
		DIFFERENT way, caught by this bundle's own 5-run pass: an unconditional
		click with no predicate returns after exactly ONE attempt (`clickUntil`'s
		own "clicked (no predicate given)" branch), so it lost the RETRY loop
		that protects against a click landing before hydration has attached the
		handler yet (CLAUDE.md: "paint is not interactivity ... a scripted click
		never waits on a timer or a marker -- it retries against its own
		effect"). Measured: 375px passed every time (fast hydration), 1440px hit
		exactly that hydration-timing gap once and the `waitFor` step then spent
		its own full 15s timeout before giving up, with the title field still
		short at `present 1` of the expected 2.

		`force: true` (added to `clickUntil` in browser.mjs by this same bundle)
		fixed that: it skips ONLY the pre-click short-circuit, so the click
		always physically fires at least once, while the retry loop underneath
		still runs exactly as before -- up to `attempts` (default 12) more
		clicks, 300ms apart, until `until` actually holds.

		A THIRD, NARROWER RACE SURVIVED EVEN THAT, AND ONLY WHEN THIS ROUTE RAN
		RIGHT AFTER `/dev/notebook-review` IN THE SAME PASS: measured 4/4 runs,
		aria-pressed flips genuinely TRUE right after the forced click (both
		fields present, confirmed with an inline probe), then flips back to
		FALSE roughly 150ms later, at 375px only -- the title field is gone by
		the time `settle()` measures it. `sessionTouched` (set by the free
		pick's own handler, `chooseSession`) is the ONLY thing standing between
		a click and the `nearestOutstanding` mount effect overwriting
		`selectedSession` again, and grepping every assignment to it in
		NotebookView.svelte turns up nothing that clears it back to false on a
		fresh page except that effect's own body, which requires the guard
		(`sessionTouched && !stale`) to already be false to reach -- so this is
		not a fix to make from the harness side without a definitive story for
		what clears it, and `src/` is off limits to this bundle regardless.

		A SIGNAL WAIT WAS TRIED FIRST, THE SAME SHAPE AS THE COUNTDOWN ROUTE'S
		FIX BELOW -- `Math.max(0, 1000 - performance.now())`, topping up the
		shortfall against real elapsed time since navigation -- AND IT DID NOT
		CLOSE THIS. Measured with performance.now() already past 1600ms at
		click time (well past the margin, so the step waited 0ms), the race
		still fired at 375px every time it was tried. So this is not "the
		danger window ends N ms after navigation" the way the countdown
		route's is; the trigger is something else entirely, undetermined.
		Bisected instead directly against the reproduction (200ms, 300ms and
		600ms unconditional pre-click delays, each tried multiple times
		against the exact sequence that reproduced it 4/4 with no delay:
		`/dev/notebook-review` immediately before `/dev/notebook`), and every
		one of them closed it. 600ms is kept over the smaller values that also
		worked, for margin -- this is the flat-delay LAST RESORT the countdown
		route's comment warns is worse than a real signal, used here only
		because a real signal was tried and measured not to work.
	*/
	prepare: [
		{ evaluate: 'async () => { await new Promise((r) => setTimeout(r, 600)); return "pre-click settle (see prepare comment above)"; }' },
		{
			click: '.pick.free',
			until: '() => document.querySelector(".pick.free").getAttribute("aria-pressed") === "true"',
			force: true
		}
	],
	presence: [
		{ selector: '.dev-bar', label: 'harness controls', expectPresent: 1 },
		{ selector: '.nb-root', label: 'NotebookView mounted', expectPresent: 1 },
		{ selector: '.compose-card label.label-field', label: 'free-entry title + folder fields (both stacked, not row-flex)', expectPresent: 2 }
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
		{ selector: '.compose-card .btn', label: 'compose form submit controls (Turn in / Save draft -- plain .btn)', min: 44 }
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
