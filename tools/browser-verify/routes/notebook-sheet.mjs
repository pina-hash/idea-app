export default {
	path: '/dev/notebook-sheet',
	label:
		'Notebook spreadsheet grid: the real ProseMirror node, the real NodeView and the real formula engine inside a Tiptap editor configured as a note is (ledger 0192, migration 0210)',
	/*
		WHY THIS ROUTE IS MEASURED IN A BROWSER AT ALL, when `tests/dom/` already
		drives 29 assertions over the same components.

		A GRID IS THE SURFACE WHERE EVERY CONTENT CHECK PASSES OVER A BROKEN
		LAYOUT. Every cell is present, every value is right, every aria-label is
		there -- and the thing that goes wrong is that the last two rows are below
		a fold nobody can see, or the header column paints under the cells, or the
		20th column runs off a 375px phone with no way to reach it. happy-dom has
		no layout engine, so `getBoundingClientRect()` answers 0x0 and
		`getComputedStyle(el).color` is the empty string there; a geometry claim
		written in that project reads zero and passes vacuously.

		AND THE NODEVIEW JOIN IS VERIFIED NOWHERE ELSE. Svelte mounted inside a
		ProseMirror NodeView is the one seam in this bundle no test exercises:
		`tests/dom/notebook-sheet-undo.test.ts` deliberately builds its editor
		WITHOUT a NodeView, so that a failure there is a failure of the schema
		rather than of three libraries stacked inside happy-dom. If the mount is
		broken, the `prepare` step below is what says so -- the grid simply is not
		on the page.

		THIS CHROMIUM PAINTS NO SCROLLBAR INTO A SCREENSHOT AT ANY COLOUR, which
		ledger 0186 proved with a magenta-on-green control, and ledger 0171 lost
		two rows below an invisible fold in exactly this way. So the component
		RESERVES its scroll track (`scrollbar-gutter: stable`) and marks its far
		edge with a fade rather than relying on a painted cue, and the
		`orderResult` rows below measure the OVERFLOW ARITHMETIC directly --
		`scrollWidth` against `clientWidth` -- instead of looking for a bar.
	*/
	prepare: [
		/*
			THE EDITOR IS DYNAMICALLY IMPORTED, browser-only, exactly as
			`NoteEditor.svelte` imports it -- so nothing is on the page until that
			promise settles. The predicate names a cell the NODEVIEW draws, which
			is the strongest available signal: it can only exist if Tiptap loaded,
			the node registered, the NodeView was asked for, Svelte mounted inside
			it, and the seeded attribute parsed. A `waitFor` on the editor's own
			host element would have gone green with an empty grid in it.
		*/
		{
			waitFor: '() => !!document.querySelector(\'[data-testid="grid-cell-D5"]\')',
			timeoutMs: 20_000
		},
		/*
			AND THE ENGINE RAN. The seed's D5 is `=SUM(D2:D4)` over three cells
			that are themselves `=B*C` formulas, so a cell reading `36.32` proves
			the dependency graph resolved a second level rather than showing three
			literals. 4*3.25 + 2*11.40 + 24*0.08 = 13 + 22.8 + 1.92 = 37.72.
		*/
		{
			waitFor:
				'() => document.querySelector(\'[data-testid="grid-cell-D5"]\').textContent.trim() === "37.72"',
			timeoutMs: 10_000
		}
	],
	presence: [
		{ selector: '.dev-bar', label: 'harness controls', expectPresent: 1 },
		/*
			ONE GRID IN THE EDITOR AND ONE READ-ONLY MOUNT BESIDE IT. Two, never
			three: a NodeView that mounted twice is a real failure mode (the
			`update` returning false and ProseMirror rebuilding) and it looks
			perfectly normal on screen.
		*/
		{
			selector: '[data-testid="notebook-grid"]',
			label: 'grids on the page (one in the document, one read-only)',
			expectPresent: 2,
			maxPresent: 2
		},
		/*
			THE SEEDED GRID IS 5 x 4. Twenty cell faces in the editor's grid plus
			eight in the read-only one is 28 -- counted rather than "present",
			because a NodeView that rendered a ragged grid still renders cells.
		*/
		{
			selector: '.nb-grid-face',
			label: 'cell faces (5x4 editable + 4x2 read-only)',
			expectPresent: 28,
			maxPresent: 28
		},
		/* Column headers A..D twice, plus A..B on the read-only grid. */
		{ selector: '.nb-grid-colhead', label: 'column headers', expectPresent: 6, maxPresent: 6 },
		{ selector: '.nb-grid-rowhead', label: 'row headers', expectPresent: 9, maxPresent: 9 },
		/*
			READ-ONLY IS STRUCTURAL, AND THIS IS THE ABSENCE ROW WITH ITS POSITIVE
			CONTROL IN THE SAME SPEC. The read-only mount has no `oncommit`, so it
			renders no resize controls at all; the editable one renders four. A
			single count of four is what says the read-only grid contributed none
			-- eight would mean the callback reached a surface that must not have
			one.
		*/
		{
			selector: '[data-testid="grid-add-row"]',
			label: 'Add row (the editable grid only, never the read-only one)',
			expectPresent: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="sheet-readonly"] .nb-grid-btn',
			label: 'resize controls inside the read-only mount (must be absent)',
			expectPresent: 0
		},
		{
			selector: '[data-testid="sheet-readonly"] .nb-grid-face:not(:disabled)',
			label: 'an enabled cell inside the read-only mount (must be absent)',
			expectPresent: 0
		},
		/* The editor loaded. A failure banner is the negative of the wait above. */
		{ selector: '[data-testid="sheet-failed"]', label: 'editor load failure banner', expectPresent: 0 },
		{ selector: '[data-testid="sheet-editor"] .ProseMirror', label: 'the real ProseMirror view', expectPresent: 1 }
	],
	textContains: [
		/*
			THE ENGINE'S OUTPUT, ON SCREEN, IN A REAL BROWSER. `13` is 4 x 3.25 and
			`37.72` is the column total over three derived cells. Read off the page
			rather than computed here, so a grid rendering its SOURCES instead of
			its values reddens.
		*/
		{ selector: '[data-testid="grid-cell-D2"]', label: 'a derived cell', must: ['13'] },
		{ selector: '[data-testid="grid-cell-D5"]', label: 'the column total', must: ['37.72'] },
		/*
			AN ERROR RENDERS AS ITS CODE, WHICH IS THE COLOUR-IS-NEVER-THE-ONLY-
			SIGNAL RULE MEASURED. The read-only grid divides by an empty cell on
			purpose. It also proves the engine runs on a grid with NO write path,
			which is the arrangement an instructor reading a note gets.
		*/
		{
			selector: '[data-testid="sheet-readonly"] [data-testid="grid-cell-B4"]',
			label: 'a refusal renders its code as a word',
			must: ['#DIV/0!']
		},
		/*
			THE POSITIVE CONTROL BESIDE IT, in the same grid: B3 is the literal the
			refusal above divides by zero. Without it, a read-only mount that had
			silently stopped rendering values at all would still satisfy an
			`#DIV/0!` row the moment anything on the page said those characters.
		*/
		{
			selector: '[data-testid="sheet-readonly"] [data-testid="grid-cell-B3"]',
			label: 'the literal beside it, so the refusal row is not the only reading',
			must: ['12'],
			mustNot: ['#']
		}
	],
	contrast: [
		{ selector: '.nb-grid-colhead', label: 'column header letters', min: 4.5 },
		{ selector: '.nb-grid-rowhead', label: 'row header numbers', min: 4.5 },
		{ selector: '.nb-grid-face', label: 'cell text', min: 4.5 },
		{ selector: '.nb-grid-size', label: 'the grid size readout', min: 4.5 },
		{ selector: '.nb-grid-btn', label: 'resize control labels', min: 4.5 }
	],
	tapTargets: [
		/*
			A NOTE IS A STUDENT SURFACE AT EVERY WIDTH, so there is no
			instructor-density exemption to claim: 44px, measured, on the cells and
			on the resize controls. The floor is a `min-height` in the component
			and never a `height`, because a floor written as a height rounds BOTH
			ways.
		*/
		{ selector: '.nb-grid-face', label: 'grid cells (student-facing, no exemption)', min: 44 },
		{ selector: '.nb-grid-btn', label: 'resize controls', min: 44 },
		{ selector: '.dev-controls .btn', label: 'harness undo/redo/insert', min: 44 }
	],
	orderResult: [
		/*
			THE FOLD, MEASURED AS ARITHMETIC RATHER THAN LOOKED FOR AS A SCROLLBAR.
			This Chromium paints no scrollbar into a screenshot at any colour
			(ledger 0186, proven with a magenta-on-green control), so "is there a
			bar" is not a question this instrument can ask. What matters is not
			whether the grid overflows -- at 375px a four-column grid certainly
			does -- but whether every column is REACHABLE once it has. So the probe
			scrolls the scroller to its far end and asks how many cells are still
			outside its box. Width-independent by construction, which is what lets
			one expected value stand at both 375 and 1440.
		*/
		{
			label: 'every column is reachable by scrolling (ledger 0171, horizontally)',
			evaluate:
				'() => { const s = document.querySelector(\'[data-testid="notebook-grid-scroll"]\');' +
				' s.scrollLeft = s.scrollWidth;' +
				' const box = s.getBoundingClientRect();' +
				' const out = Array.from(s.querySelectorAll(".nb-grid-cell"))' +
				'   .filter((c) => c.getBoundingClientRect().right > box.right + 1);' +
				' return [out.length === 0 ? "reachable" : "unreachable: " + out.length + " cell(s) past the edge"]; }',
			expected: ['reachable']
		},
		/*
			AND VERTICALLY. Ledger 0171 lost two rows below an invisible fold; this
			is that lesson as a count. Every row header's bottom edge must sit
			inside the grid's own box.
		*/
		{
			label: 'rows clipped below the grid box (ledger 0171: must be none)',
			evaluate:
				'() => { const g = document.querySelector(\'[data-testid="notebook-grid"]\');' +
				' const box = g.getBoundingClientRect();' +
				' const rows = Array.from(g.querySelectorAll(".nb-grid-rowhead"));' +
				' const cut = rows.filter((r) => r.getBoundingClientRect().bottom > box.bottom + 1);' +
				' return [cut.length === 0 ? "none clipped" : cut.length + " of " + rows.length + " clipped"]; }',
			expected: ['none clipped']
		},
		/*
			THE STICKY ROW HEADER PAINTS OVER THE CELLS, NOT UNDER THEM. `position:
			sticky` makes a box positioned and so does anything else in the row
			that needs one; with `z-index: auto` on both, positioned siblings paint
			in TREE order and the cells (later in the row) cover the header. An
			opaque background does nothing about that -- a background only covers
			what paints BENEATH it. HIT-TESTED at the header's own centre after
			scrolling to the far end, which is the only instrument that can tell
			the two apart: a presence check is green on both, and the production
			symptom of getting it wrong was a student's name with a status chip
			drawn on top of it.
		*/
		{
			label: 'the row header wins the hit test at its own centre after scrolling',
			evaluate:
				'() => { const s = document.querySelector(\'[data-testid="notebook-grid-scroll"]\');' +
				' s.scrollLeft = s.scrollWidth;' +
				' const h = s.querySelector(".nb-grid-rowhead");' +
				' const b = h.getBoundingClientRect();' +
				' const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);' +
				' return [hit && (hit === h || h.contains(hit)) ? "header" : "covered by " + (hit ? hit.className : "nothing")]; }',
			expected: ['header']
		},
		/*
			UNDO IS THE BAR, AND THIS IS IT DRIVEN THROUGH THE NODEVIEW. The same
			claim `tests/dom/notebook-sheet-undo.test.ts` makes over the document,
			re-made across the one seam that file deliberately does not exercise:
			Svelte mounted inside a ProseMirror NodeView. Open a cell, type,
			commit, read it back, press Undo, read it back again.

			THE FORWARD STATE IS IN THE RETURNED VALUE, not only the final one, so
			an undo that "worked" because the edit never landed cannot pass -- the
			middle term has to be `EDITED`.
		*/
		{
			label: 'a cell commit through the NodeView is exactly one undo step',
			/*
				THE PROBE IS ASYNC AND SETTLES BETWEEN EVERY STEP, WHICH IS THE
				REPO'S OWN "PAINT IS NOT INTERACTIVITY" RULE ONE LEVEL DOWN AND WAS
				NOT OBVIOUS. Written synchronously first, it clicked the cell and
				read for the input in the same tick and got `no input opened` at
				BOTH widths -- which reads exactly like a broken NodeView and is a
				Svelte effect that had not flushed yet. `settle` awaits a real
				macrotask, the same instrument `tests/dom/mount.ts` uses, rather
				than an animation frame: a probe scheduled on rAF is the one shape
				this repository has already been bitten by.
			*/
			evaluate:
				'async () => { const settle = () => new Promise((r) => setTimeout(r, 60));' +
				' const at = () => document.querySelector(\'[data-testid="grid-cell-A2"]\').textContent.trim();' +
				' const was = at();' +
				' document.querySelector(\'[data-testid="grid-cell-A2"]\').click();' +
				' await settle();' +
				' const input = document.querySelector(\'[data-testid="grid-input-A2"]\');' +
				' if (!input) return ["no input opened"];' +
				' input.value = "EDITED";' +
				' input.dispatchEvent(new Event("input", { bubbles: true }));' +
				' input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));' +
				' await settle();' +
				' const after = at();' +
				' document.querySelector(\'[data-testid="sheet-undo"]\').click();' +
				' await settle();' +
				' return [was, after, at()]; }',
			expected: ['Angle 1x1', 'EDITED', 'Angle 1x1']
		},
		/*
			AND THE GRID IS STILL ONE NODE AFTERWARDS. A NodeView whose `update`
			returned false would have ProseMirror rebuild it on every undo, which
			drops focus -- so a student pressing Ctrl+Z loses their place as well
			as their edit. The value coming back is not evidence about that; the
			node count is, and it is measured after the drive above rather than
			before it.
		*/
		{
			label: 'the document still holds exactly one grid after the edit and the undo',
			evaluate:
				'() => [String(document.querySelectorAll(\'.ProseMirror [data-testid="notebook-grid"]\').length)]',
			expected: ['1']
		}
	],
	/*
		THE SEED CARRIES NO NETWORK CALL AND NO IMAGE, so there is nothing to
		allow through. A console error here is a real one.
	*/
	ignoreConsole: []
};
