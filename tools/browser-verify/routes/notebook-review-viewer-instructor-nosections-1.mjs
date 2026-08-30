export default {
	path: '/dev/notebook-review?viewer=instructor&nosections=1',
	label: 'Notebook review console for a teacher of some OTHER section: no grid, no tabs, only the empty-state card',
	/*
		THE "SEES NOTHING" DIRECTION OF 0169's scoping: a teacher whose own
		sections are elsewhere (and who holds no reviewer grant here) is
		offered NO section, so the console renders its empty-state card and
		nothing else -- no grid, no mode bar, no entry pane to probe. The two
		viewer specs beside this one are the positive controls proving every
		zero below is a withheld surface and not a broken selector.
	*/
	presence: [
		{ selector: '.console-panel .card', label: 'the "No sections yet" empty-state card', expectPresent: 1 },
		{ selector: '[data-testid="grid-scroll"]', label: 'compliance grid (nothing to show)', expectPresent: 0, expectVisible: 0 },
		{ selector: '.cell', label: 'grid cells', expectPresent: 0, expectVisible: 0 },
		{ selector: '[data-testid="mode-review"], [data-testid="mode-checkins"], [data-testid="mode-grade"], [data-testid="mode-log"]', label: 'mode tabs', expectPresent: 0, expectVisible: 0 },
		{ selector: '[data-testid="entry-panel"]', label: 'entry panel', expectPresent: 0, expectVisible: 0 }
	]
};
