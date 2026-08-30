// original array position 19 of 25 -- see ../README.md for what `order` means
export const order = 19;

export default {
	path: '/dev/notebook-review-student',
	label: 'Notebook review, one student (StudentReviewBackStrip + NotebookView read-only + NotebookDeletedZone)',
	/*
		ALREADY CLEAN AT BOTH WIDTHS -- 0px overflow, measured -- and the only
		reason it was not already listed is that nothing had driven it. The
		default student ('ana') carries one self-deleted and one
		staff-deleted entry.

		THIS PARAGRAPH USED TO SAY "both `NotebookDeletedZone` branches (a
		Restore control on the first, a bare refusal reading on the
		second)", AND THERE IS NO SUCH PAIR OF BRANCHES. `NotebookDeletedZone`
		renders a Restore control for EVERY row it is handed whenever a
		`restoreEntry` transport is present, deliberately -- the dev route's
		own fixture says so in as many words ("Both deleted entries render
		identically here: the RPC's own gate is what actually decides who may
		restore what, not a flag this page keeps in sync with it"). The row
		below asserted `expectPresent: 1`, which is a FLOOR, and it has been
		reading `present 2` at both widths for as long as this route has been
		listed: the spec described behaviour the component does not have and
		the check could not tell anyone. Corrected to the measurement, with a
		ceiling, so the count is now the assertion in both directions.

		THE 401s ARE THE FIXTURE, NOT A DEFECT: `NotebookView` here (like
		every other notebook route in this file) renders `<img>` tags
		against the REAL `/api/notebook/photo/<id>` proxy, which needs a
		session this placeholder-.env dev server cannot provide. NAMED
		rather than blanketed -- the harness now tags a "Failed to load
		resource" console error with the actual failing request (see
		`browser.mjs`), so this ignores the two specific photo fetches
		ana's fixture makes and nothing else that happens to also 401.
	*/
	presence: [
		{ selector: '.back-strip', label: 'StudentReviewBackStrip', expectPresent: 1, maxPresent: 1 },
		{ selector: '.nb-root', label: 'NotebookView mounted (read-only)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="staff-deleted-zone"]', label: 'deleted-entries disclosure', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="staff-restore-entry"]', label: 'Restore control (one per deleted entry -- 2, see the header)', expectPresent: 2, maxPresent: 2 }
	],
	contrast: [{ selector: '.back-strip .who', label: 'back-strip student line', min: 4.5 }],
	/*
		`NotebookDeletedZone`'s restore control is `.btn.secondary.restore-btn`,
		plain -- no `.tap-44` -- and this route had no tap-target check at all
		before this line, on a staff-facing action that restores a student's
		own deleted entry. Measured clean today: 104.2x44 at both widths
		(already clearing floor by other means); added for regression
		protection against the same `.btn`-wide coverage hole foundry-submit's
		harness controls exposed.
	*/
	tapTargets: [
		{ selector: '[data-testid="staff-restore-entry"]', label: 'restore control (plain .btn, no .tap-44)', min: 44 }
	],
	ignoreConsole: [
		'\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/ana-p1\\?',
		'\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/ana-p2-live\\?'
	]
};
