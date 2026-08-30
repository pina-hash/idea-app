export default {
	path: '/dev/notebook-review?viewer=instructor',
	label: 'Notebook review console as the teacher of record: every manage panel present (0169 positive control)',
	/*
		THE MIRROR OF `?viewer=reviewer`. Every selector that spec expects at 0
		is expected at 1 here, on the same fixture, same entry opened the same
		way -- which is what makes the reviewer spec's zeros mean "withheld per
		section" rather than "selector misspelled" or "panel never mounts".
		(The bare /dev/notebook-review spec stays the locked-density contract
		measurement and is deliberately not perturbed with an entry click.)
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
		{ selector: '[data-testid="grid-scroll"]', label: 'compliance grid', expectPresent: 1 },
		{ selector: '[data-testid="mode-review"]', label: 'Review tab', expectPresent: 1 },
		{ selector: '[data-testid="mode-checkins"]', label: 'Check-ins tab (manages this section)', expectPresent: 1 },
		{ selector: '[data-testid="mode-grade"]', label: 'Grade unit tab (manages this section)', expectPresent: 1 },
		{ selector: '[data-testid="mode-log"]', label: 'Admin log tab (chair-only: absent for an instructor too)', expectPresent: 0, expectVisible: 0 },
		{ selector: '[data-testid="entry-panel"]', label: 'entry panel opened', expectPresent: 1 },
		{ selector: '[data-testid="entry-flag-toggle"]', label: 'flag control', expectPresent: 1 },
		{ selector: '[data-testid="entry-danger-zone"]', label: 'entry delete danger zone (manages this section)', expectPresent: 1 }
	]
};
