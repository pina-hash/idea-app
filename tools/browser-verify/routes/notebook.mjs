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
	prepare: [{ click: '.pick.free', until: '() => document.querySelector(".pick.free").getAttribute("aria-pressed") === "true"' }],
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
