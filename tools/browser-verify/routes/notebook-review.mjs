// original array position 17 of 25 -- see ../README.md for what `order` means
export const order = 17;

export default {
	path: '/dev/notebook-review',
	label: 'Notebook review grid, the locked density contract and its seven states',
	/*
		THE GRID IS A LOCKED CONTRACT (CLAUDE.md): its density, its status
		glyphs, Share Tech Mono and the 1.9rem cell box are verified
		byte-identical after any restyle, and every status value carries a
		glyph, a label, a fill STYLE no other state uses, a `--nb-cell-*`
		token declared on all three plates AND A MEASURED CONTRAST FIGURE FOR
		EACH. That last clause is a standing obligation on a surface nothing
		automated has ever measured, which is the whole argument for listing
		this route: a token missing from one plate, or an ink that quietly
		stops clearing on the ground it is actually painted on, is invisible
		on screen and reddens no type check.

		0140 IS WHY IT IS URGENT RATHER THAN TIDY. `scheduled` is the seventh
		answer to the same question the other six answer, so it arrived with
		all of it -- key, label, glyph, dashed-vs-dotted fill, per-plate token
		-- and its contrast figure is now measured here (6.19:1) instead of
		once, by hand, in the bundle that added it.

		THE STATES PRESENT IN THIS FIXTURE ARE FIVE OF THE SEVEN, and the two
		absent ones are asserted as absent rather than left unmentioned: the
		section fixture produces no `ontime` and no `await` cell, so a
		contrast row naming either would report "no match" forever and read as
		a finding about the ink. The LEGEND is the assertion that covers all
		seven regardless -- it renders the same array the grid dispatches
		from, so a state that stopped being drawn stops being advertised.
	*/
	/*
		THE COLD-LOAD RACE, AND WHY THIS ROUTE NEEDS `waitFor`. The compliance
		grid arrives on an async transport. The FIRST visit to any route also
		pays vite's module-graph compile, and the run visits 375 before 1440 --
		so on the cold pass the grid had not landed 700ms after `waitForApp`
		returned and the page measured 0 cells, while the warm 1440 pass
		measured 30. That reads exactly like a console that renders no grid at
		phone width, and it is nothing of the kind: warm, BOTH widths render
		the identical 30 cells (`narrow="stack-nav-first"` puts the grid pane
		first, it is not dropped). A longer `settleMs` would paper over it
		until the payload got slower again; the predicate cannot.
	*/
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".cell").length > 0', timeoutMs: 20000 }
	],
	presence: [
		{ selector: '[data-testid="grid-scroll"]', label: 'compliance grid', expectPresent: 1 },
		{ selector: '.cell', label: 'grid cells', expectPresent: 30, maxPresent: 30 },
		/* SEVEN STATES PLUS THE not-reviewed DOT. The legend is always
		   visible on purpose -- CLAUDE.md forbids putting words in a cell to
		   satisfy a label audit, so this row and the hint above the grid are
		   what carry the meaning. */
		/* A CEILING, because "7 states + not-reviewed" is a closed set: a ninth
		   legend row means a state was added without the five contrast rows
		   below it being asked about, which is exactly what the locked contract
		   forbids arriving quietly. */
		{ selector: '.legend li', label: 'always-visible legend (7 states + not-reviewed)', expectPresent: 8, maxPresent: 8 },
		/* The two states this fixture does not produce, asserted as absent so
		   the five contrast rows below cannot be read as covering all seven. */
		{ selector: '.cell.ontime, .cell.await', label: 'states absent from this fixture (ontime, await)', expectPresent: 0, expectVisible: 0 }
	],
	contrast: [
		{ selector: '.cell.late', label: 'cell: late', min: 4.5 },
		{ selector: '.cell.flagged', label: 'cell: flagged', min: 4.5 },
		{ selector: '.cell.excused', label: 'cell: excused', min: 4.5 },
		{ selector: '.cell.missing', label: 'cell: missing', min: 4.5 },
		/* 0140's new value, measured rather than asserted. */
		{ selector: '.cell.scheduled', label: 'cell: scheduled (0140)', min: 4.5 }
	],
	/*
		24px, NOT 44px, AND THAT IS THE DOCUMENTED EXCEPTION RATHER THAN A
		RELAXATION. `IDEA_INTERFACE_STANDARDS` 10 exempts a control inside a
		locked density contract, because inflating the cell box to 44px would
		break the invariant the contract exists to hold -- and this grid is an
		instructor console, not a phone surface. Measured 30.4x30.4, which
		clears the floor that actually applies with room to spare.
	*/
	tapTargets: [{ selector: '.cell', label: 'grid cells (locked density: 24px floor)', min: 24 }]
};
