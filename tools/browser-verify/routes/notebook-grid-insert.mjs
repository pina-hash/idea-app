export default {
	path: '/dev/notebook-grid-insert',
	label:
		'Notebook grid INSERTION: the Grid control in the real note toolbar, the grid it inserts, and the engine\'s refusals rendered as sentences under it (ledger 0199)',
	/*
		WHAT THIS MEASURES THAT `notebook-sheet.mjs` DOES NOT.

		That spec drives ledger 0192's harness, which builds its own Tiptap editor
		because when it was written `NoteEditor.svelte` had no grid in it. It
		proves the NODE, the NodeView and the engine behave. It cannot prove a
		STUDENT CAN GET ONE, because the control that inserts one did not exist.

		So what is measured here is everything downstream of the press: the
		toolbar control's own tap target and contrast, the grid that arrives, the
		problem list ledger 0199 added under it, and the two of those at 375px --
		which is where a grid is hardest and where a problem list is most likely to
		push the page sideways.

		A GRID ON A PHONE IS THE HARDEST THING IN THIS APP TO LAY OUT, and ledger
		0192's own browser checks passed while a trailing edge fade painted
		unconditionally and dimmed real content at 1440. That is the failure this
		spec is shaped against: every row below is a MEASURED number and not a
		presence, and the two that could pass over a broken layout -- reachability
		and the issues list's own width -- are arithmetic against a box rather
		than a look at the page.
	*/
	prepare: [
		/*
			THREE MOUNTS HAVE TO SETTLE, and the strongest available signal that
			they have is a cell the NODEVIEW drew inside the SECOND editor. It can
			only exist if the dynamic import resolved, Tiptap built, the node
			registered, the NodeView was asked for, Svelte mounted inside it and
			the seeded attribute parsed. Waiting on the editor's host element would
			go green with an empty document in it.
		*/
		{
			waitFor: '() => !!document.querySelector(\'[data-testid="mount-problems"] [data-testid="grid-cell-B3"]\')',
			timeoutMs: 25_000
		},
		/*
			AND THE ENGINE RAN, in the direction only this fixture can show: B3 is
			`=12/B2` over the literal zero in B2, so `#DIV/0!` proves the evaluator
			ran AND refused, where a cell reading `=12/B2` would mean it never ran
			at all. The refs are one below the row's position in the seed because
			the fixture has a HEADER row, which is what a student's grid has too.
		*/
		{
			waitFor:
				'() => document.querySelector(\'[data-testid="mount-problems"] [data-testid="grid-cell-B3"]\').textContent.trim() === "#DIV/0!"',
			timeoutMs: 15_000
		},
		/*
			THE PRESS ITSELF, WHICH IS THE WHOLE SUBJECT OF THIS SPEC. Not forced:
			the predicate is a grid inside the FIRST mount, which is a state only
			this click can produce -- there is no grid in that editor until the
			control puts one there -- so a press that reached nothing is a failure
			rather than a no-op the harness counted as success.
		*/
		{
			click: '[data-testid="mount-empty"] [data-testid="nb-insert-grid"]',
			until: '() => !!document.querySelector(\'[data-testid="mount-empty"] [data-testid="notebook-grid"]\')',
			attempts: 12,
			waitMs: 250
		}
	],
	presence: [
		/*
			ONE GRID CONTROL PER EDITOR, TWO EDITORS. Three would mean the
			read-only `NoteContent` mount had grown a toolbar, which is the
			direction that matters: an instructor's read of a note must offer
			nothing to write with.
		*/
		{
			selector: '[data-testid="nb-insert-grid"]',
			label: 'Grid controls (one per editor, never on the read-only mount)',
			expectPresent: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="mount-stored"] [data-testid="nb-insert-grid"]',
			label: 'a Grid control inside the read-only mount (must be absent)',
			expectPresent: 0
		},
		/*
			THREE GRIDS AFTER THE PRESS: the one just inserted, the seeded one, and
			the stored one rendered read-only. Counted with a ceiling, because a
			NodeView that mounted twice -- `update` returning false and ProseMirror
			rebuilding -- looks perfectly normal on screen.
		*/
		{
			selector: '[data-testid="notebook-grid"]',
			label: 'grids on the page (inserted + seeded + read-only)',
			expectPresent: 3,
			maxPresent: 3
		},
		/*
			THE INSERTED GRID IS THE DEFAULT SIZE, COUNTED. 4 x 3 is twelve cell
			faces, which is what says the control inserted a grid rather than
			something grid-shaped.
		*/
		{
			selector: '[data-testid="mount-empty"] .nb-grid-face',
			label: 'cell faces in the grid the control inserted (4 x 3)',
			expectPresent: 12,
			maxPresent: 12
		},
		/*
			THE PROBLEM LIST, WHICH IS THE OTHER HALF OF THIS BUNDLE. Two of them:
			the empty-grid notice under the grid just inserted, and the refusals
			under the seeded one. The read-only mount's grid is clean and must have
			NONE -- which is the absence row whose positive control is the two
			beside it.
		*/
		{
			selector: '[data-testid="grid-issues"]',
			label: 'problem lists (the empty notice, and the refusals)',
			expectPresent: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="mount-stored"] [data-testid="grid-issues"]',
			label: 'a problem list on the clean stored grid (must be absent)',
			expectPresent: 0
		},
		/* Read-only is structural: no write path, so no resize controls at all. */
		{
			selector: '[data-testid="mount-stored"] .nb-grid-btn',
			label: 'resize controls inside the read-only mount (must be absent)',
			expectPresent: 0
		},
		{
			selector: '[data-testid="mount-stored"] .nb-grid-face:not(:disabled)',
			label: 'an enabled cell inside the read-only mount (must be absent)',
			expectPresent: 0
		},
		/* The positive control for both absences, in the same reading. */
		{
			selector: '[data-testid="mount-empty"] .nb-grid-btn',
			label: 'resize controls in the inserted grid (the control for the two absences above)',
			expectPresent: 4,
			maxPresent: 4
		}
	],
	textContains: [
		/*
			AN EMPTY GRID SAYS SO, IN WORDS, BEFORE ANYTHING IS SAVED. This is the
			sentence ledger 0199 exists to put on screen: `0210`'s text floor
			refuses a note whose only content is an empty grid, correctly, and
			until now the first anyone heard of that was the save failing.
		*/
		{
			selector: '[data-testid="mount-empty"] [data-testid="grid-issues"]',
			label: 'the empty-grid notice, under the grid that was just inserted',
			must: ['does not count as writing yet'],
			mustNot: ['#']
		},
		/*
			THE FOUR REFUSALS, AS SENTENCES. Each string below is the ENGINE'S own
			wording, read off the page rather than restated here -- the cycle's
			path, the position a malformed formula carries, and the name of a
			function this engine does not have. A code alone would satisfy the
			cells; none of these can be satisfied by a code.
		*/
		{
			selector: '[data-testid="mount-problems"] [data-testid="grid-issues"]',
			label: 'a circular reference reports its PATH, not just #CYCLE!',
			must: ['Circular reference', '->']
		},
		{
			selector: '[data-testid="mount-problems"] [data-testid="grid-issues"]',
			label: 'a function this engine does not have is NAMED (VLOOKUP is not built)',
			must: ['VLOOKUP']
		},
		{
			selector: '[data-testid="mount-problems"] [data-testid="grid-issues"]',
			label: 'a malformed formula carries the position of the problem',
			must: ['position']
		},
		/*
			AND THE CELLS STILL CARRY THEIR CODES, so colour is never the only
			signal and the list can be joined to the grid by eye.
		*/
		{
			selector: '[data-testid="mount-problems"] [data-testid="grid-cell-B3"]',
			label: 'a refusal renders its code as a word in the cell',
			must: ['#DIV/0!']
		},
		{
			selector: '[data-testid="mount-problems"] [data-testid="grid-cell-B2"]',
			label: 'the literal beside it, so the refusal row is not the only reading',
			must: ['0'],
			mustNot: ['#']
		},
		/*
			THE READ-ONLY MOUNT COMPUTES, which is what says an instructor reads the
			same numbers a student does. 4*3.25 + 2*11.40 + 24*0.08 = 37.72.
		*/
		{
			selector: '[data-testid="mount-stored"] [data-testid="grid-cell-D5"]',
			label: 'the stored grid computes its column total for a reader',
			must: ['37.72']
		}
	],
	contrast: [
		/*
			THE PROBLEM LIST IS THE NEW SURFACE AND IT IS THE ONE TO MEASURE. Its
			sentence is real body copy on the notebook's plate, so 4.5:1; its chip
			carries the cell name and the error code and is read as text, so 4.5:1
			too -- it is not a boundary.
		*/
		{ selector: '.nb-grid-issues .sentence', label: 'a problem sentence', min: 4.5 },
		{ selector: '.nb-grid-issues .chip', label: 'the cell/code chip beside it', min: 4.5 },
		{ selector: '[data-testid="nb-insert-grid"]', label: 'the Grid control label', min: 4.5 },
		{ selector: '.nb-grid-colhead', label: 'column header letters', min: 4.5 },
		{ selector: '.nb-grid-face', label: 'cell text', min: 4.5 }
	],
	tapTargets: [
		/*
			A NOTE IS A STUDENT SURFACE AT EVERY WIDTH, so 44px with no
			instructor-density exemption to claim -- on the control that inserts a
			grid as much as on the cells it inserts.
		*/
		{ selector: '[data-testid="nb-insert-grid"]', label: 'the Grid toolbar control', min: 44 },
		{ selector: '.note-toolbar button', label: 'every note toolbar control', min: 44 },
		{ selector: '[data-testid="mount-empty"] .nb-grid-face', label: 'the inserted grid\'s cells', min: 44 },
		{ selector: '[data-testid="mount-empty"] .nb-grid-btn', label: 'its resize controls', min: 44 }
	],
	orderResult: [
		/*
			EVERY COLUMN OF THE INSERTED GRID IS REACHABLE ONCE IT OVERFLOWS. Not
			"does it overflow" -- at 375px a three-column grid with 44px cells
			certainly does -- but whether scrolling reaches the far edge. Measured
			as arithmetic against the scroller's own box, because this Chromium
			paints no scrollbar into a raster at any colour (ledger 0186, proven
			with a magenta-on-green control) so "is there a bar" is not a question
			this instrument can ask.
		*/
		{
			label: 'every column of the inserted grid is reachable by scrolling',
			evaluate:
				'() => { const s = document.querySelector(\'[data-testid="mount-empty"] [data-testid="notebook-grid-scroll"]\');' +
				' s.scrollLeft = s.scrollWidth;' +
				' const box = s.getBoundingClientRect();' +
				' const out = Array.from(s.querySelectorAll(".nb-grid-cell"))' +
				'   .filter((c) => c.getBoundingClientRect().right > box.right + 1);' +
				' return [out.length === 0 ? "reachable" : "unreachable: " + out.length + " cell(s) past the edge"]; }',
			expected: ['reachable']
		},
		/*
			THE PROBLEM LIST NEVER PUSHES THE PAGE SIDEWAYS, which is the thing a
			list of long sentences beside a nowrap chip does at 375px. The harness
			already checks the document for horizontal scroll; this asks the
			narrower question the component is responsible for -- that every
			problem line sits inside its own grid's box -- so a failure names the
			list rather than the page.
		*/
		{
			label: 'every problem line sits inside its grid\'s own box',
			evaluate:
				'() => { const bad = [];' +
				' for (const list of document.querySelectorAll(\'[data-testid="grid-issues"]\')) {' +
				'   const box = list.closest(\'[data-testid="notebook-grid"]\').getBoundingClientRect();' +
				'   for (const li of list.querySelectorAll("li")) {' +
				'     const r = li.getBoundingClientRect();' +
				'     if (r.right > box.right + 1 || r.left < box.left - 1) bad.push(li.textContent.trim().slice(0, 24));' +
				'   } }' +
				' return [bad.length === 0 ? "inside" : "overflowing: " + bad.join(" | ")]; }',
			expected: ['inside']
		},
		/*
			THE CHIP AND THE SENTENCE WRAP AS A UNIT RATHER THAN THE SENTENCE
			FORCING THE ROW WIDER THAN THE PHONE. A flex child's automatic minimum
			is its MIN-CONTENT, so a sentence with no `min-width: 0` on it makes its
			row as wide as its longest word plus the chip, whatever the viewport
			says -- and nothing on screen reports it except a page that scrolls
			sideways. Measured as the sentence's own width against its list's.
		*/
		{
			label: 'no problem sentence is wider than the list holding it',
			evaluate:
				'() => { const bad = [];' +
				' for (const list of document.querySelectorAll(\'[data-testid="grid-issues"]\')) {' +
				'   const w = list.getBoundingClientRect().width;' +
				'   for (const s of list.querySelectorAll(".sentence")) {' +
				'     if (s.getBoundingClientRect().width > w + 1) bad.push(Math.round(s.getBoundingClientRect().width) + " > " + Math.round(w));' +
				'   } }' +
				' return [bad.length === 0 ? "contained" : "wider: " + bad.join(", ")]; }',
			expected: ['contained']
		},
		/*
			THE NOTICE AND THE ERRORS ARE DIFFERENT THINGS AND LOOK DIFFERENT. An
			empty grid is not a fault, and rendering it in the error tone would
			teach a student to read a crimson row as normal -- which costs the rows
			that are not. Measured as two different computed colours rather than
			asserted from the stylesheet, because a token that failed to resolve
			would leave both rows the same and look deliberate.
		*/
		{
			label: 'the empty-grid notice is toned apart from an error line',
			evaluate:
				'() => { const notice = document.querySelector(\'[data-testid="mount-empty"] [data-testid="grid-issue-grid"]\');' +
				' const err = document.querySelector(\'[data-testid="mount-problems"] [data-testid^="grid-issue-B"]\');' +
				' if (!notice || !err) return ["missing: notice=" + !!notice + " error=" + !!err];' +
				' const a = getComputedStyle(notice).color, b = getComputedStyle(err).color;' +
				' return [a !== b ? "distinct" : "identical: " + a]; }',
			expected: ['distinct']
		},
		/*
			ONE LINE PER ERRORING CELL, AND NOTHING ELSE. A list that grew a line
			for a healthy cell would be noise a student learns to ignore; a list
			that dropped one would be the defect this whole component exists to
			fix. Both directions in one reading, over the grid that has errors in
			it.
		*/
		{
			label: 'the problem list names exactly the cells that show a code',
			evaluate:
				'() => { const root = document.querySelector(\'[data-testid="mount-problems"]\');' +
				' const listed = Array.from(root.querySelectorAll(\'[data-testid^="grid-issue-"]\'))' +
				'   .map((el) => el.getAttribute("data-testid").replace("grid-issue-", ""))' +
				'   .filter((r) => r !== "grid").sort();' +
				' const shown = Array.from(root.querySelectorAll(\'[data-testid^="grid-cell-"]\'))' +
				'   .filter((el) => el.textContent.trim().startsWith("#"))' +
				'   .map((el) => el.getAttribute("data-testid").replace("grid-cell-", "")).sort();' +
				' return [listed.join(",") === shown.join(",") ? "paired" : "listed=" + listed.join(",") + " shown=" + shown.join(",")]; }',
			expected: ['paired']
		}
	]
};
