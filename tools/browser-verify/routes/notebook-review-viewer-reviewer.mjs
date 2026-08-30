export default {
	path: '/dev/notebook-review?viewer=reviewer',
	label: 'Notebook review console as a 0169 SECTION REVIEWER: grid and verdicts present, manage panels absent',
	/*
		THE 0169 TIER, BOTH DIRECTIONS. A section reviewer reads the grid and
		reviews entries; they do not author check-ins, grade a unit, or delete
		student work. The console withholds those per section on the `manages`
		flag the server load computes, and ABSENCE is the mechanism -- so this
		spec asserts the absences AND the sibling spec (`/dev/notebook-review`,
		the instructor default) asserts the same selectors PRESENT, which is
		what keeps a zero here meaning "withheld" rather than "selector
		misspelled". The entry pane is opened for real (the same cold-load
		predicate the instructor spec uses, then a cell click) so the danger
		zone's absence is measured on the surface where it would render, not on
		a page that never mounted it.
	*/
	/*
		The fixture's photo rows carry ids the REAL proxy route cannot serve --
		the harness has no session, so the opened entry's thumbnail 401s. That
		error belongs to the fixture (any entry opened by hand here does the
		same); a 401 from anything else still fails the check.
	*/
	ignoreConsole: ['/api/notebook/photo/'],
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".cell").length > 0', timeoutMs: 20000 },
		{
			click: '.cell.late',
			until: '() => !!document.querySelector(\'[data-testid="entry-panel"]\')',
			attempts: 6,
			waitMs: 300
		}
	],
	presence: [
		/* THE POSITIVE HALF: the reviewer genuinely gets the console. */
		{ selector: '[data-testid="grid-scroll"]', label: 'compliance grid (reviewer sees it)', expectPresent: 1 },
		{ selector: '[data-testid="mode-review"]', label: 'Review tab', expectPresent: 1 },
		{ selector: '[data-testid="entry-panel"]', label: 'entry panel opened for review', expectPresent: 1 },
		{ selector: '[data-testid="entry-flag-toggle"]', label: 'flag control (review IS granted)', expectPresent: 1 },
		/* THE ABSENT HALF, each present on the instructor spec as the control. */
		{ selector: '[data-testid="mode-checkins"]', label: 'Check-ins tab (manage-only: absent for a reviewer)', expectPresent: 0, expectVisible: 0 },
		{ selector: '[data-testid="mode-grade"]', label: 'Grade unit tab (manage-only: absent for a reviewer)', expectPresent: 0, expectVisible: 0 },
		{ selector: '[data-testid="mode-log"]', label: 'Admin log tab (chair-only: absent for a reviewer)', expectPresent: 0, expectVisible: 0 },
		{ selector: '[data-testid="entry-danger-zone"]', label: 'entry delete danger zone (manage-only: absent for a reviewer)', expectPresent: 0, expectVisible: 0 }
	]
};
