export default {
	path: '/dev/classroom-nav?manage=0',
	label: 'A student on the same URL: no tab bar at all, and the switcher still there',
	/* THE TAB IS NOT THE GATE, AND THIS IS THE HALF THAT SAYS SO ON SCREEN.
	   Every manage-only destination refuses a non-manager itself -- People and
	   Grades 404, `/notebook/review` 404s a non-reviewer -- so nothing here
	   decides access. What it decides is what a student is shown, and there are
	   two independent reasons they are shown nothing: `visibleSectionTabs`
	   drops all three manage-only tabs, and the bar renders only when more than
	   one survives. Opening either one alone still leaves the other closed;
	   `tests/classroom-nav-doors.test.ts` opens the first and reddens.

	   THE SWITCHER IS THE POSITIVE CONTROL. Without it, "no tabs" cannot be
	   told from "the harness rendered no shell". */
	presence: [
		{ selector: '[data-testid="section-switcher"]', label: 'class switcher (positive control: the shell is mounted)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="section-tabs"]', label: 'the tab bar (absent for a student)', expectPresent: 0 },
		{ selector: '[data-testid^="section-tab-"]', label: 'any section tab (absent for a student)', expectPresent: 0 },
		{ selector: '[data-testid="section-tab-check-ins"]', label: 'the check-ins departure (absent for a student)', expectPresent: 0 },
		{ selector: '[data-testid="greenline-pending"]', label: 'GREENLINE cards still render (second positive control)', expectPresent: 3, maxPresent: 3 }
	],
	tapTargets: [
		{ selector: '[data-testid="section-switcher"]', label: 'class switcher', min: 44 }
	]
};
