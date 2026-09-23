/**
 * A CLASS'S OWN NOTEBOOK TAB, AS A STUDENT SEES IT (ledger 0297, package F4a).
 *
 * `?scope=class` mounts the real NotebookView inside the real ClassroomShell
 * the way `/classroom/<id>/notebook` does: the class's tabs (Class | Notebook,
 * with the check-ins still owed counted on the tab), the classroom's `.cr-app`
 * frame with the notebook as its body, and the notebook FILTERED TO THE CLASS
 * -- the entries filed to it and its check-ins. A free entry written here is
 * filed to the class, so there is no class picker; the head offers the whole
 * notebook ("All classes") instead.
 *
 * BOTH DIRECTIONS, ON ONE FIXTURE: the class picker and the old in-page
 * masthead are absent here, and `/dev/notebook` (the whole notebook) asserts
 * the picker present, so neither absence can pass because a selector stopped
 * matching.
 */
export default {
	path: '/dev/notebook?scope=class',
	label: "A class's Notebook tab, student (filtered to the class, inside the classroom shell)",
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
		{ selector: '[data-testid="section-tabs"]', label: 'the class tab bar (a student now has two tabs)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="section-tab-class"]', label: 'Class tab', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="section-tab-notebook"][aria-current="page"]', label: 'Notebook tab, current', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="section-tab-notebook-count"]', label: 'check-ins still owed, counted on the tab in words', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="section-tab-people"], [data-testid="section-tab-grades"], [data-testid="section-tab-duplicates"]', label: 'manage-only tabs (must be absent for a student)', expectPresent: 0 },
		{ selector: '.cr-root.cr-app > .nb-root.cr-app-body', label: 'the notebook is the body of the classroom frame', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="nb-all-classes"]', label: 'the way to the whole notebook', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="new-entry-class"]', label: 'a class picker (must be absent: this tab IS the class)', expectPresent: 0 },
		{ selector: '[data-testid="pick-class"]', label: 'a class named on a pick (must be absent: one class)', expectPresent: 0 },
		{ selector: '[data-testid="nb-theme-toggle"], [data-nb-theme]', label: 'the retired plate picker or a plate attribute (must be absent)', expectPresent: 0 }
	],
	contrast: [
		{ selector: '[data-testid="section-tab-notebook-count"]', label: 'the tab count words', min: 4.5 },
		{ selector: '.nb-head h1', label: 'title (--text-1)', min: 4.5 },
		{ selector: '[data-testid="nb-privacy"]', label: 'head privacy line (--text-2)', min: 4.5 },
		{ selector: '.compose-card .hint', label: 'composer hint (--text-3)', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="section-tab-class"], [data-testid="section-tab-notebook"]', label: 'the two class tabs', min: 44 },
		{ selector: '[data-testid="nb-all-classes"]', label: 'All classes chip', min: 44 },
		{ selector: '.pick', label: 'check-in picks (student-facing)', min: 44 }
	],
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
