export default {
	path: '/dev/spec-table?rows=12',
	label: 'Spec table harness, a busy table: the PAGE cost of the row actions',
	/* THE ROUTE THAT MEASURES A PAGE RATHER THAN A ROW, WHICH IS THE THING
	   NOBODY HAD. `/dev/spec-table?empty=1` measures one row after one press,
	   and every number this surface has ever reported was a per-row number:
	   23.2x23.2, then 44x44 with the row at 98.3px. A row is a number and a
	   table is a page, and the two answer different questions.

	   TWELVE IS READ OFF THE REAL SPECS, NOT CHOSEN. Across the 26 table blocks
	   under `materials/`, `minRows` is 4 in 15 of them, and the per-page total
	   is 8 in the median case and 16 at the worst. Twelve is a page that exists.

	   WHAT IT CAUGHT: the four row actions laid 2x2 at 44px (correct under step
	   1 of `IDEA_INTERFACE_STANDARDS` 10, 2.12, and correctly reported as
	   costing row height) put 1244.5px of table between a student and the Add
	   row control at 375px -- 1.94 phone screens against 1.26 before the fix.
	   Two controls on one line brings it to 822.3px / 1.31 screens at the SAME
	   column width and the SAME table scrollWidth. See the comment above
	   `.row-ops` in `SpecRenderer.svelte` and decision entry 13. */
	prepare: [
		/* THE MODULE ARRIVES COLLAPSED AT THIS ROW COUNT and must be opened, the
		   way `/dev/spec-table-open` opens the seeded one: a module collapses
		   once it is COMPLETE, and twelve filled rows against `minRows: 4` is
		   complete. Asserted as the EFFECT wanted -- a table with height --
		   rather than as `aria-expanded` on a named button, which is the lesson
		   that route already carries. THE FIRST DRAFT OF THIS SPEC OMITTED THE
		   CLICK on the strength of a reading taken at `networkidle`, where the
		   module had not collapsed yet; every number below came back 0px and
		   every presence row reported `visible 0`. The state is reached, not
		   assumed. */
		{
			click: 'button[aria-expanded="false"]',
			until: '() => { const t = document.querySelector("[data-testid=ed] table.entry-table"); return !!t && t.getBoundingClientRect().height > 0; }',
			attempts: 6,
			waitMs: 300
		},
		/* THE RE-OPENED STATE, GATED. This route FOUND the defect at prompt 0048
		   and only reported it -- `use:autoresize` wrote `style.height` once at
		   mount and then only on `input`, so a textarea mounted inside a CLOSED
		   disclosure measured `scrollHeight` 0, fitted itself to `2px`, and never
		   re-ran; re-opening the module left the cell at its `min-height: 44px`
		   floor with `overflow: hidden` over content taller than that. Measured
		   here at the time: 19 of 60 cells clipped at 375, worst 118px of writing
		   in a 42px box, and 0 of 60 under the 44px tap floor -- so what was lost
		   was never reach, it was the sight of a student's own answer.
		   `SpecRenderer` now shares one `ResizeObserver` across a renderer's
		   textareas and refuses to fit a box with no width, so the cell fits the
		   frame it becomes visible in (prompt 0051).

		   THE REFIT STEP THAT USED TO FOLLOW THIS ONE IS GONE. It dispatched
		   `input` at all 60 cells so the page cost below was measured over fitted
		   boxes rather than clipped ones; it was a workaround for the defect, and
		   with the defect fixed it would MASK a regression from the page-cost band
		   by repairing the page between the two. The gate below runs first either
		   way, but a check whose neighbour quietly undoes what it measures is the
		   shape that costs the next reader an hour.

		   IT REFUSES A STATE IT COULD NOT MEASURE, WHICH IS THE HALF THAT MATTERS.
		   A cell inside a collapsed module has `clientHeight` and `scrollHeight`
		   both 0, so `scrollHeight > clientHeight + 1` is FALSE for every one of
		   them and a naive count comes back `0 of 60 clipped` -- a perfect score
		   over a table nobody ever opened. That is not a hypothetical: this
		   route's own first draft omitted the click above and read 0px everywhere,
		   and prompt 0048's first browser spec did the same thing. So the zero-box
		   cells are counted FIRST and any of them is a refusal, never a pass. */
		{
			evaluate:
				'() => { const c = [...document.querySelectorAll("[data-testid=ed] textarea.cell")]; if (!c.length) throw new Error("no editable cells found"); const t = document.querySelector("[data-testid=ed] table.entry-table"); const r = (x) => Math.round(x * 10) / 10; const unmeasured = c.filter((el) => el.clientWidth === 0 || el.clientHeight === 0); const clipped = c.filter((el) => el.scrollHeight > el.clientHeight + 1); const worst = clipped.length ? Math.max(...clipped.map((el) => el.scrollHeight - el.clientHeight)) : 0; const said = "re-opened at " + window.innerWidth + "px: table " + r(t.getBoundingClientRect().height) + "px, " + clipped.length + " of " + c.length + " cells clipped by overflow (worst " + worst + "px hidden), " + c.filter((el) => el.getBoundingClientRect().height < 44).length + " under the 44px floor"; if (unmeasured.length) throw new Error(unmeasured.length + " of " + c.length + " cells have no box -- the module is still collapsed, so a clipped count here is NOT MEASURED and must not read as 0 clipped. " + said); if (clipped.length) throw new Error(clipped.length + " of " + c.length + " cells clip their own content: a cell mounted inside a collapsed module was never refitted when the module opened. " + said); return said; }'
		},
		/* THE PAGE COST, REPORTED AND GATED IN BOTH DIRECTIONS. A band and not
		   a ceiling: a table that grew is the regression this route exists for,
		   and a table that SHRANK past the band means rows went missing or the
		   refit above silently stopped working, which would otherwise read as
		   an improvement.

		   GATED PER ROW RATHER THAN ON THE TABLE'S TOTAL HEIGHT, because this
		   spec runs at BOTH widths and the totals legitimately differ: 822.3px
		   at 375 where the narrow columns wrap, 652.9px at 1440 where they do
		   not. A 700-950 band tuned on the 375 figure reported the correct
		   1440 measurement as a failure -- a true reading judged against the
		   wrong threshold, which is the same defect as measuring the wrong
		   thing. Per row the two are 68.5px and 54.4px, and the arrangement
		   this route exists to catch -- four controls laid 2x2 -- is 103.7px
		   and 99.9px, so 45 to 80 separates them at both widths with room. */
		{
			evaluate:
				'() => { const t = document.querySelector("[data-testid=ed] table.entry-table"); const f = document.querySelector("[data-testid=ed] .table-foot"); const b = t.closest(".block"); const r = (x) => Math.round(x.getBoundingClientRect().height * 10) / 10; const toAdd = Math.round((f.getBoundingClientRect().bottom - t.getBoundingClientRect().top) * 10) / 10; const rows = document.querySelectorAll("[data-testid=ed] tbody tr").length; const screens = Math.round((toAdd / 667) * 100) / 100; const per = Math.round((r(t) / rows) * 10) / 10; const said = rows + " rows at " + window.innerWidth + "px: table " + r(t) + "px (" + per + "px a row), block " + r(b) + "px, top of table to Add row " + toAdd + "px = " + screens + " phone screens (667px tall)"; if (rows !== 12) throw new Error("expected 12 rows, found " + rows + " -- " + said); if (per < 45 || per > 80) throw new Error(per + "px a row is outside the 45-80 band -- " + said); return said; }'
		}
	],
	/* BOTH AXES, WHICH `tapTargets` REPORTS AS `WxH` BESIDE THE MIN. The
	   controls are 44x44 and the cells 96x44 at 375; the threshold is the
	   smaller side, and the report carries both so a control that grew in one
	   axis only is visible. */
	tapTargets: [
		{ selector: '[data-testid=ed] td.row-ops button', label: 'row action controls (2 per row)', min: 44 },
		{ selector: '[data-testid=ed] textarea.cell', label: 'editable table cells', min: 44 },
		{ selector: '[data-testid=ed] .table-foot button', label: 'Add row', min: 44 }
	],
	presence: [
		/* TWO CONTROLS A ROW, NOT FOUR, AND BOTH DIRECTIONS ARE STATED. Twelve
		   rows times two is the ceiling as well as the floor: a third control
		   added here wraps the grid to a second line and takes the row straight
		   back to 98.3px, which is the whole thing this route measures. */
		{ selector: '[data-testid=ed] td.row-ops', label: 'row-action cells', expectPresent: 12, maxPresent: 12 },
		{ selector: '[data-testid=ed] td.row-ops button', label: 'row action controls', expectPresent: 24, maxPresent: 24, expectVisible: 24 },
		/* THE ABSENCE, WITH ITS POSITIVE CONTROL IMMEDIATELY BELOW. Reordering
		   was dropped under step 2 (decision entry 13); a `title` sweep for it
		   returning 0 is worthless unless the same sweep shape finds the
		   controls that ARE there, which the next two rows are. */
		{ selector: '[data-testid=ed] td.row-ops button[title="Move up"], [data-testid=ed] td.row-ops button[title="Move down"]', label: 'row reorder controls (dropped, step 2)', expectPresent: 0 },
		{ selector: '[data-testid=ed] td.row-ops button[title="Delete row"]', label: 'delete controls, positive control for the absence above', expectPresent: 12, maxPresent: 12 },
		{ selector: '[data-testid=ed] td.row-ops button[title="Duplicate row"]', label: 'duplicate controls, positive control for the absence above', expectPresent: 12, maxPresent: 12 }
	],
	contrast: [
		{ selector: '[data-testid=ed] td.row-ops button', label: 'row action glyphs', min: 3 },
		{ selector: '[data-testid=ed] table.entry-table td', label: 'table cell copy', min: 4.5 }
	]
};
