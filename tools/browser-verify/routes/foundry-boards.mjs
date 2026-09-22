export default {
	path: '/dev/foundry-boards',
	label: 'Foundry ranked sections and search (reports 30 and 32b)',
	/*
		NINE APPS, SO THE BOARDS RENDER AT ALL. `foundryBoards` returns nothing
		at or below `FOUNDRY_BOARD_SIZE` (five), because four sections over a
		gallery that small would be the same five cards four times above a list
		of the same five. The fixture's own header says why nine rather than six.

		NOTHING IS PREPARED. The whole claim of report 32b is that the sections
		are "visible and live right upon opening", so a prepare step that
		pressed something would measure a state a student never arrives in.
		Every row below is the FIRST paint.
	*/
	presence: [
		{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },
		/*
			FOUR BOARDS: trending, most played, most hours, brand new. `versions`
			is deliberately NOT one -- it is offered in the sort control, because
			"most updated" is a thing to browse by rather than a thing to look
			at. `maxPresent` is what makes that an assertion rather than a floor.
		*/
		{
			selector: '[data-testid="foundry-gallery-boards"] .fdy-gal-board',
			label: 'ranked sections on first paint',
			expectPresent: 4,
			maxPresent: 4,
			expectVisible: 4
		},
		{
			selector: '[data-board="trending"]',
			label: 'the trending section specifically',
			expectPresent: 1,
			maxPresent: 1
		},
		/*
			A BOARD IS A TOP FIVE AND NOT THE WHOLE LIST. With nine apps in the
			fixture, four apps have to be missing from each row for this to be
			true -- which is the one thing about a board that could be wrong
			invisibly, because a row of nine cards looks like a row of five until
			somebody counts.
		*/
		{
			selector: '[data-board="played"] .fdy-gal-board-row > li',
			label: 'most played row is capped at five',
			expectPresent: 5,
			maxPresent: 5
		},
		/*
			EVERY BOARD SAYS WHAT IT COUNTS. A ranking whose rule is not on the
			page is a ranking a reader cannot check, and "trending" in particular
			means nothing until it is spelled out.
		*/
		{
			selector: '.fdy-gal-board-rule',
			label: 'what each board counts, in words',
			expectPresent: 4,
			maxPresent: 4,
			expectVisible: 4
		},
		/*
			THE COVERAGE NOTE, ONCE, FOR THE WHOLE REGION. CLAUDE.md requires it
			beside every play figure; decision 04 records that the ranked list
			carried none. One is the assertion -- four copies of one sentence in
			one screen is what gets skipped.
		*/
		{
			selector: '.fdy-gal-boards-note',
			label: 'play coverage note over the ranked region',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="foundry-gallery-search"]',
			label: 'search box',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.fdy-gal-find-label',
			label: 'the search box has a visible word, not only a placeholder',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.fdy-gal-all',
			label: 'the full list is labelled so it is not read as a fifth board',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="foundry-gallery-grid"] > li',
			label: 'the full list below the boards, all nine',
			expectPresent: 9,
			maxPresent: 9
		},
		/*
			AND THE SEARCH EMPTY STATE IS ABSENT ON FIRST PAINT, which is the
			exclusion half: a surface that rendered it unconditionally would look
			fine in a screenshot of a search and wrong on arrival.
		*/
		{ selector: '[data-testid="foundry-search-empty"]', label: 'search empty state (absent before searching)', expectPresent: 0, maxPresent: 0 }
	],
	contrast: [
		{ selector: '.fdy-gal-board-head h3', label: 'board heading', min: 4.5 },
		{ selector: '.fdy-gal-board-rule', label: 'what a board counts', min: 4.5 },
		{ selector: '.fdy-gal-boards-note', label: 'play coverage note', min: 4.5 },
		{ selector: '.fdy-gal-find-label', label: 'search label', min: 4.5 },
		{ selector: '.fdy-gal-all', label: 'full list heading', min: 4.5 }
	],
	tapTargets: [
		/*
			THE SEARCH INPUT IS A STUDENT-FACING CONTROL, so it clears 44 and not
			24: this page carries no instructor-only class on its root, and
			CLAUDE.md's rule is that a surface with no such class IS
			student-facing for the purpose of the floor.
		*/
		{ selector: '[data-testid="foundry-gallery-search"]', label: 'search input', min: 44 },
		{ selector: '.fdy-gal-sort-btn', label: 'sort buttons, now five of them', min: 44 }
	]
};
