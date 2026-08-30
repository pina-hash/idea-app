// original array position 19 of 25 -- see ../README.md for what `order` means
export const order = 19;

export default {
	path: '/dev/notebook-review-student',
	label: 'Notebook review, one student (StudentReviewBackStrip + NotebookView read-only + NotebookDeletedZone)',
	/*
		ALREADY CLEAN AT BOTH WIDTHS -- 0px overflow, measured -- and the only
		reason it was not already listed is that nothing had driven it.

		THIS PARAGRAPH USED TO SAY "both `NotebookDeletedZone` branches (a
		Restore control on the first, a bare refusal reading on the
		second)", AND THERE IS NO SUCH PAIR OF BRANCHES. `NotebookDeletedZone`
		renders a Restore control for EVERY row it is handed whenever a
		`restoreEntry` transport is present, deliberately -- the RPC's own gate
		is what decides who may restore what. That is still true and is still
		asserted below (`staff-restore-entry` count == the row count).

		WHAT CHANGED IS THE SENTENCE BESIDE EACH ROW. The section heading used
		to read "Entries {studentName} removed from this notebook" over a list
		that is half STAFF removals -- the payload carries no `deleted_by`
		filter, deliberately -- so it told an instructor a student had thrown
		away work a colleague deleted. The attribution is per row now, from
		`deleted_by`, and the fixture carries one row per possible answer
		(student / viewer / other staff / null actor), which is what makes the
		four sentences each other's positive control rather than one string
		checked against itself.

		THE 401s ARE THE FIXTURE, NOT A DEFECT: `NotebookView` here (like
		every other notebook route in this file) renders `<img>` tags
		against the REAL `/api/notebook/photo/<id>` proxy, which needs a
		session this placeholder-.env dev server cannot provide. NAMED
		rather than blanketed -- the harness tags a "Failed to load
		resource" console error with the actual failing request (see
		`browser.mjs`), so this ignores the two specific photo fetches
		ana's fixture makes and nothing else that happens to also 401.
	*/
	/*
		THE FOUR SENTENCES, READ BACK AS A MEASUREMENT AND GATED ON DIFFERING.
		A `presence` row cannot ask this -- CSS has no text selector -- and an
		assertion that merely found the word "staff" somewhere on the page
		would pass on a component that printed "staff" for every row, which is
		precisely the defect. So the step reads the four `.deleted-meta` lines
		in DOM order, RETURNS them (an evaluate step's return value is printed,
		so the sentences are in the report and auditable by the next reader),
		and THROWS unless all four are distinct and each names the right actor.

		A throwing evaluate step is `withinThreshold: false`, so this is a gate
		and not a note.
	*/
	prepare: [
		{
			evaluate: `() => {
				const lines = [...document.querySelectorAll('[data-testid="staff-deleted-meta"]')].map(
					(el) => el.textContent.replace(/\\s+/g, ' ').trim()
				);
				if (lines.length !== 4) throw new Error('expected 4 deleted rows, saw ' + lines.length);
				const attribution = lines.map((l) => l.split(String.fromCharCode(183))[0].trim());
				if (new Set(attribution).size !== 4) {
					throw new Error('rows do not say who removed them: ' + JSON.stringify(attribution));
				}
				// Which sentence belongs to which row, so "all four differ" cannot
				// be satisfied by four wrong sentences.
				const [student, staff, viewer, unknown] = attribution;
				if (!student.includes('Ana Reyes')) throw new Error('student row: ' + student);
				if (staff.includes('Ana Reyes')) throw new Error('staff removal named the student: ' + staff);
				if (!staff.includes('staff')) throw new Error('staff row: ' + staff);
				if (!viewer.includes('you')) throw new Error('viewer row: ' + viewer);
				if (unknown.includes('Ana Reyes') || unknown.includes('staff')) {
					throw new Error('null actor was attributed: ' + unknown);
				}
				return attribution.join(' | ');
			}`
		},
		{
			evaluate: `() => {
				// The way back carries the section the console was left on. Read off
				// the href itself, never off a variable the page happens to expose.
				const href = document.querySelector('[data-testid="back-to-review"]').getAttribute('href');
				if (href !== '/notebook/review?section=11111111-2222-4333-8444-555555555555') {
					throw new Error('back link lost the section: ' + href);
				}
				return href;
			}`
		}
	],
	presence: [
		{ selector: '.back-strip', label: 'StudentReviewBackStrip', expectPresent: 1, maxPresent: 1 },
		{ selector: '.nb-root', label: 'NotebookView mounted (read-only)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="staff-deleted-zone"]', label: 'staff Deleted section', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="staff-deleted-meta"]', label: 'per-row attribution line (one per deleted entry)', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="staff-restore-entry"]', label: 'Restore control (one per deleted entry, whoever removed it)', expectPresent: 4, maxPresent: 4 },
		/*
			THE CHIP THAT COULD ONLY EVER SHOW AN EMPTY STATE. `NotebookView` is
			mounted here with no `deletedEntries` and no `deletionReady`, and both
			DEFAULT to on/empty -- so the "Recently deleted" chip rendered, and
			clicking it swapped the pane to second-person copy promising the
			reader nothing was there, directly above the Deleted section that was
			listing the removals. Gated on the length now.

			ITS POSITIVE CONTROL IS `/dev/notebook`, which mounts the same
			component WITH a deleted list and asserts the chip present -- an
			absence assertion with no paired presence is a selector that could
			simply have stopped matching.
		*/
		{ selector: '[data-testid="filter-deleted"]', label: 'Recently deleted chip (must NOT render: no list behind it)', expectPresent: 0, expectVisible: 0 },
		{ selector: '[data-testid="deleted-list"]', label: "NotebookView's own deleted pane (unreachable here)", expectPresent: 0, expectVisible: 0 }
	],
	contrast: [
		{ selector: '.back-strip .who', label: 'back-strip student line', min: 4.5 },
		/* The changed text: the per-row attribution, on the row's own --bg0. */
		{ selector: '[data-testid="staff-deleted-meta"]', label: 'per-row attribution line (changed copy)', min: 4.5 },
		/* The changed text: the section note, which no longer names the student. */
		{ selector: '[data-testid="staff-deleted-zone"] .note', label: 'Deleted section note (changed copy)', min: 4.5 }
	],
	/*
		`NotebookDeletedZone`'s restore control is `.btn.secondary.restore-btn`,
		plain -- no `.tap-44` -- on a staff-facing action that restores a
		student's own deleted entry. Measured clean previously at 104.2x44 at
		both widths; kept as regression protection against the same `.btn`-wide
		coverage hole foundry-submit's harness controls exposed.
	*/
	tapTargets: [
		{ selector: '[data-testid="staff-restore-entry"]', label: 'restore control (plain .btn, no .tap-44)', min: 44 }
	],
	ignoreConsole: [
		'\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/ana-p1\\?',
		'\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/ana-p2-live\\?'
	]
};
