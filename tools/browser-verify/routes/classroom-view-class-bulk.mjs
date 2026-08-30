export default {
	path: '/dev/classroom?view=class-bulk',
	label: 'Class stream: bulk selection, unit grouping and the crowded row (teacher)',
	/*
		THE DISCOVERABILITY SURFACE. Units, manual ordering, pinning, per-person
		collapse and all three bulk actions already existed and worked; what did
		not exist was any way to FIND them. A checkbox rendered on every row while
		the bar those checkboxes drive appeared only after the first tick, so the
		column had nothing anywhere naming what it was for -- which is a
		regression class nothing here could catch before, because every one of
		these controls is manager-only and `/classroom` needs a Google session no
		automated run holds.

		The fixture is deliberately hostile and self-contained (see
		src/routes/dev/classroom/bulk-fixture.svelte.ts): 29 items over a 22-row
		unit, a 4-row unit, an EMPTY unit, three unfiled rows, and one row
		carrying every dimension that competes for the 356px stream column at
		once -- a 121-character title, a pin, a Draft chip, an Updated chip,
		points, a due date, a category, two files and two links.
	*/
	presence: [
		/* ITEM 1: the bar is on screen BEFORE anything is selected. This is the
		   whole finding, and `expectVisible` is the half that matters -- a bar
		   rendered at height 0 would satisfy a present-count and satisfy
		   nobody else. */
		{ selector: '[data-testid="bulk-bar"]', label: 'bulk bar at rest (before any selection)', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="bulk-hint"]', label: 'resting sentence naming what the checkboxes do', expectPresent: 1, expectVisible: 1 },
		/* At rest the ACTIONS are absent, not disabled: five greyed controls
		   above every class is the clutter this deliberately is not, and a
		   `disabled` control cannot explain itself either (CLAUDE.md). */
		{ selector: '[data-testid="bulk-publish"], [data-testid="bulk-delete"], [data-testid="bulk-unit-select"]', label: 'bulk ACTIONS absent until something is selected', expectPresent: 0 },
		/* ITEM 2: one select-all for the pane, one per group. Three groups are
		   on screen (the empty unit has no rows to select). */
		{ selector: '[data-testid="bulk-select-all"]', label: 'pane select-all', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid^="group-select-"]', label: 'per-group select-all (3 non-empty groups)', expectPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="group-head"]', label: 'group headers (3 units + unfiled)', expectPresent: 4 },
		{ selector: '[data-testid="item-row"]', label: 'rows, including drafts a student never sees', expectPresent: 29 },
		/* The prompt is for a class with NO units; this one has three. Asserted
		   absent so the student-view row below cannot be read as the only
		   negative control on it. */
		{ selector: '[data-testid="units-prompt"]', label: 'units prompt (absent: this course already has units)', expectPresent: 0 }
	],
	contrast: [
		{ selector: '[data-testid="bulk-hint"]', label: 'resting sentence', min: 4.5 },
		{ selector: '[data-testid^="group-select-"]', label: 'per-group select-all label', min: 4.5 },
		{ selector: '.row-name', label: 'item title (the row identity)', min: 4.5 }
	],
	/*
		THE ROW'S CONTROLS ARE 30-32px WIDE AND 44px TALL, and the width is the
		documented exception `.row-expand` has always carried: the row's whole
		body is a link to the same item, so a 44px-wide box eats the target
		beside it, and three controls sit within 5px of each other. The HEIGHT
		had no such exception and did not clear -- the checkbox measured 18x18
		(under the 24px ABSOLUTE floor) and the actions menu 32x40 -- so the
		floor asserted here is the one that applies to the axis with room.
	*/
	tapTargets: [
		{ selector: '[data-testid="bulk-select-all"]', label: 'pane select-all', min: 44 },
		{ selector: '[data-testid^="group-select-"]', label: 'per-group select-all', min: 44 },
		{ selector: '[data-testid="units-toggle"]', label: 'Units toolbar control', min: 44 },
		{ selector: '.row-select-hit', label: 'row checkbox hit area (30px wide by row exception, 44 tall)', min: 30 },
		{ selector: '.menu-trigger', label: 'row actions menu (32px wide by row exception, 44 tall)', min: 32 }
	],
	textContains: [
		{ selector: '[data-testid="bulk-hint"]', label: 'the sentence names the three actions', must: ['publish', 'file', 'delete'] },
		/* An empty unit must say how to file into it, and name WHERE the
		   control is: filing moved into the row's overflow menu deliberately and
		   the copy said only "a row's Unit box", which is a box nobody can see. */
		{ selector: '.empty-row', label: 'empty unit names both filing paths', must: ['actions menu', 'File into'] }
	],
	/*
		ITEM 4, AS A NUMBER RATHER THAN A LOOK. The crowded row's name is the
		only shrinkable child of a `nowrap` line, so every chip took its width
		first: measured against this fixture the name was 40px wide at BOTH 375
		and 1440 -- 7 characters of 121 -- and the column is 356px at every
		width the pane ships at, so widening the page bought it nothing. The
		title line wraps now and the name clamps at two lines: 227.3px / 76
		characters at 1440, 169px / 55 at 375.

		`scrollWidth === clientWidth` on the name is what says the clamp is
		doing the containing rather than the row overflowing -- and the old rule
		DID overflow, by 39px at 375px on this row, which is the horizontal
		scroll this route also measures.
	*/
	orderResult: [
		{
			/* AN ARRAY, because `orderResult` compares element-for-element and a
			   bare string is never `Array.isArray` -- a spec returning one reads
			   as a permanent finding with the right value printed beside it. */
			evaluate: `() => {
				const el = [...document.querySelectorAll('.row-name')].find((n) => n.textContent.includes('Truss bridge analysis'));
				if (!el) return ['crowded row not found'];
				const lines = Math.round(el.getBoundingClientRect().height / (parseFloat(getComputedStyle(el).lineHeight) || 1));
				return [el.scrollWidth > el.clientWidth ? 'overflows' : 'contained', lines];
			}`,
			expected: ['contained', 2],
			label: 'crowded title: clamped to two lines, scrollWidth === clientWidth'
		}
	]
};
