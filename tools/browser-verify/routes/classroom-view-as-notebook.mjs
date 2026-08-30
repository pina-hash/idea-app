export default {
	path: '/dev/classroom-view-as-notebook',
	label: "Classroom view-as, a student's notebook (the SECOND read-only mount of NotebookView)",
	/*
		WHY THIS ROUTE IS LISTED AT ALL: it is the OTHER surface that mounts
		`NotebookView` with `readOnly` and no deleted list, and it is the one
		nobody looks at. `/notebook/review/student/[email]` at least renders a
		staff Deleted section below the view, so the phantom "Recently deleted"
		chip there sat visibly beside a real one. Here there is NO zone at all,
		so the chip was the page's only deleted affordance and it was
		structurally empty -- the same defect with nothing next to it to make
		the contradiction obvious.

		ONE GATE FIXED BOTH, WHICH IS THE POINT. The chip is gated inside
		`NotebookView` on the LENGTH of the list it would show, so neither
		read-only mount had to be edited -- and this route is what says so,
		because a fix asserted only on the surface it was found on is a fix
		nobody knows is general. `/classroom/**` is another lane's tree and
		this bundle touched none of it.

		`prefers-reduced-motion` IS `no-preference` HERE like everywhere else in
		this harness (../README.md), so nothing below describes the reduced path.
	*/
	presence: [
		{ selector: '.cr-root', label: 'classroom room wrapper (this mounts inside ClassroomShell, not bare)', expectPresent: 1 },
		{ selector: '.nb-root', label: 'NotebookView mounted (read-only)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="filter-deleted"]', label: 'Recently deleted chip (must NOT render: no list behind it)', expectPresent: 0, expectVisible: 0 },
		{ selector: '[data-testid="deleted-list"]', label: 'the deleted pane that chip led to', expectPresent: 0, expectVisible: 0 },
		/*
			AND NO STAFF ZONE EITHER, asserted rather than assumed: this route
			deliberately does not render `NotebookDeletedZone`, so with the chip
			correctly gone the page offers NO route to a deleted entry at all --
			which is the honest state, not an omission. Its positive control is
			`/dev/notebook-review-student`, where the zone IS asserted present.
		*/
		{ selector: '[data-testid="staff-deleted-zone"]', label: 'staff Deleted section (not on this surface)', expectPresent: 0, expectVisible: 0 },
		/*
			READ-ONLY IS STRUCTURAL, not a discipline: every write prop is omitted
			so the controls they drive do not exist. Measured as counts rather
			than described.
		*/
		{ selector: '.compose-card', label: 'the compose form (no upload transport -> no form)', expectPresent: 0, expectVisible: 0 },
		{ selector: 'input[type="file"]', label: 'any file input (no upload transport)', expectPresent: 0, expectVisible: 0 }
	],
	contrast: [
		{ selector: '.nb-root .pane-head h2', label: 'entries pane heading', min: 4.5 }
	],
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
