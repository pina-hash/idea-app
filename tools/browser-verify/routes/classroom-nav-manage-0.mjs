export default {
	path: '/dev/classroom-nav?manage=0',
	label: "A student on the same URL: the class and its Notebook tab, nothing manage-only, and the switcher",
	/* THE TAB IS NOT THE GATE, AND THIS IS THE HALF THAT SAYS SO ON SCREEN.
	   Every manage-only destination refuses a non-manager itself -- People and
	   Grades 404, Duplicates 404s anyone `classroom_manages_section` refuses --
	   and a class's Notebook tab asks the server's own `canManage` which of the
	   two surfaces it is, so nothing here decides access. What it decides is
	   what a student is shown: GENERALIZED in ledger 0297 from "nothing at
	   all", because the notebook moved into the class as a tab every member
	   has, so a student's bar is Class and Notebook and `visibleSectionTabs`
	   still drops all three manage-only tabs.
	   `tests/classroom-nav-doors.test.ts` opens that predicate and reddens.

	   THE SWITCHER IS THE POSITIVE CONTROL. Without it, "no tabs" cannot be
	   told from "the harness rendered no shell". */
	presence: [
		{ selector: '[data-testid="class-strip"]', label: 'class row in the masthead (positive control: the shell is mounted)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="section-tabs"]', label: 'the tab bar (a student has two tabs now)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: 'a[data-testid^="section-tab-"]', label: 'section tabs for a student: Class and Notebook', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="section-tab-notebook"]', label: "the class's Notebook tab", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="section-tab-people"], [data-testid="section-tab-grades"]', label: 'People and Grades (absent for a student)', expectPresent: 0 },
		{ selector: '[data-testid="section-tab-check-ins"]', label: 'the retired check-ins departure (absent for everyone)', expectPresent: 0 },
		/* NAMED ABSENCES, not just a count: a tab renamed rather than withheld
		   would keep the total at zero and lose the meaning. */
		{ selector: '[data-testid="section-tab-duplicates"]', label: 'the duplicates tab (absent for a student)', expectPresent: 0 },
		{ selector: '[data-testid="greenline-pending"]', label: 'GREENLINE cards still render (second positive control)', expectPresent: 3, maxPresent: 3 }
	],
	tapTargets: [
		{ selector: '[data-testid="class-icon"]', label: 'class icons (report 26)', min: 44 },
		{ selector: '[data-testid="section-tabs"] a', label: "a student's two tabs", min: 44 }
	]
};
