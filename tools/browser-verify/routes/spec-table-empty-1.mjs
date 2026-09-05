export default {
	path: '/dev/spec-table?empty=1',
	label: 'Spec table harness, untouched table: the first Add row press',
	/* THE STATE THE SEEDED FIXTURE CANNOT REACH. `/dev/spec-table` and
	   `/dev/spec-table-open` both mount the table with four rows already in it,
	   so neither ever runs the arithmetic that decides how many rows a FIRST
	   touch produces -- which is why the defect an instructor reported was
	   invisible on this harness. `?empty=1` seeds no rows for the table block at
	   all, which is what an untouched block on a class page actually is.

	   The block declares `minRows: 4`. Before the fix, one press here produced
	   FIVE rows: `ensureRows` materialised the minimum and `addRow` appended to
	   it. */
	prepare: [
		/* THE PANEL ARRIVES OPEN HERE AND THERE IS NOTHING TO PRESS, which is why
		   this is a `waitFor` and not `/dev/spec-table-open`'s click: a module
		   collapses only once it is COMPLETE, and with no rows seeded this one
		   never is. The click step measured `0 matched, 0 attempt(s), no match`
		   -- a finding, correctly, because a step that reaches no state must not
		   look like one that did. Asserted as the EFFECT wanted (a table with
		   height) rather than as `aria-expanded` on a named button, which is the
		   lesson `/dev/spec-table-open` already carries. 0ms here is the state
		   having already arrived, which is the step working. */
		{
			waitFor:
				'() => { const t = document.querySelector("[data-testid=ed] table.entry-table"); return !!t && t.getBoundingClientRect().height > 0; }',
			timeoutMs: 4000
		},
		/* THE BASELINE, MEASURED RATHER THAN ASSUMED: the editable table is open
		   and genuinely holds no rows. Reported as a number, so a later count of
		   1 cannot be read off a selector that matches nothing. */
		{
			evaluate:
				'() => document.querySelectorAll("[data-testid=ed] td.row-ops").length + " row(s) before the press"'
		},
		/* THE PRESS. `until` names the row count reaching exactly one, which is
		   something only the click can produce and which the pre-fix code could
		   never satisfy -- it went straight to five. So this step is the finding:
		   a regression here reports FAILED with its attempt count rather than
		   letting the numbers below describe a state the run never reached. */
		{
			click: '[data-testid=ed] .table-foot button',
			until: '() => document.querySelectorAll("[data-testid=ed] td.row-ops").length === 1',
			attempts: 6,
			waitMs: 300
		},
		/* And the count again, printed, so the report carries the measured value
		   and not only the fact that a predicate held. */
		{
			evaluate:
				'() => document.querySelectorAll("[data-testid=ed] td.row-ops").length + " row(s) after one press"'
		}
	],
	/* ONE row, and the empty-state cell is gone with it. `maxPresent` is stated
	   on both because both rows' prose names an exact count, and a floor of zero
	   on the second would assert nothing at all. */
	presence: [
		{ selector: '[data-testid=ed] td.row-ops', label: 'rows after one press', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: '[data-testid=ed] td.empty-cell', label: 'empty-state cell after one press', expectPresent: 0 },
		/* THE POSITIVE CONTROL for that absence row: the read-only mount beside
		   it seeds no rows either and is never pressed, so its empty cell is
		   still there. Without it, "0 empty cells" cannot be told from the class
		   having been renamed. */
		{ selector: '[data-testid=ro] td.empty-cell', label: 'empty-state cell, unpressed control', expectPresent: 1, maxPresent: 1 }
	],
	/* A row that exists must be readable, and the counter beneath it is the
	   sentence saying the minimum is still unmet -- a blank row is not a filled
	   one, which is the whole reason one row is the right answer here. */
	contrast: [
		{ selector: '[data-testid=ed] td.row-ops button', label: 'row action controls', min: 3 },
		{ selector: '[data-testid=ed] .table-foot .counter', label: 'min-rows counter', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid=ed] .table-foot button', label: 'Add row', min: 44 },
		/* NO LONGER A STANDING FINDING. This row read `known finding` and
		   reported 23.2x23.2 every run from 2026-09-04, on the grounds that
		   four 44px targets need ~11rem of a 6.4rem column inside a table that
		   already scrolls at 375px. The arithmetic was right about ONE LINE of
		   four and wrong that a line was the only arrangement: 2x2 needs
		   2*44 + gap + cell padding = 102.4px, which is the 6.4rem the column
		   was already declared at. Measured after: 44x44 on all four at both
		   widths, the column NARROWED (125.4 -> 100.0 at 375, 125.4 -> 102.4 at
		   1440), the table's own scrollWidth fell 653 -> 628 at 375, and the
		   document overflowed 0px at both. The cost is row height, 40.4 -> 98.3.

		   THE ROW STAYS, and its label no longer excuses it. A row kept only
		   while it is failing is a row that disappears at exactly the moment it
		   starts being the thing that would catch a regression. */
		{ selector: '[data-testid=ed] td.row-ops button', label: 'row action controls', min: 44 },
		/* 33px AT BOTH WIDTHS UNTIL 2026-09-05, and it cost the row nothing to
		   fix: the row is already 98.3px tall because of the 2x2 grid above,
		   so a 44px cell fits inside the height that was there. Measured after:
		   44x44 (96 wide at 375, 241.5 at 1440), row height still 98.3, column
		   still 100.0/102.4, table scrollWidth still 628 at 375. */
		{ selector: '[data-testid=ed] textarea.cell', label: 'editable table cells', min: 44 },
		/* THE LABEL AND NOT THE INPUT, because the label is what a finger hits
		   (CLAUDE.md) -- the input inside it stays 13x13 deliberately. The
		   `tapReach` row below is what proves the two are actually one target
		   rather than two things that happen to be nested. Measured 293x23 at
		   375 and 1358x23 at 1440 before, both under the 24px absolute floor's
		   own margin; 293x44 and 1358x44 after. */
		{ selector: 'ul.checklist label.check-item', label: 'checklist rows (measured at the label)', min: 44 }
	],
	/* THE COLUMN TIP TRIGGER, WHICH IS WHY THIS BUNDLE EXISTS. It carries
	   `.tap-reach-44` and was delivering 34.5px of walked reach at 1440 and
	   42.5px at 375 -- its `::after` computes 44px, and the `.table-scroll`
	   around the table clipped the top half of it away, because `overflow-x:
	   auto` forces `overflow-y` to `auto`. Nothing reported it: no spec pointed
	   at this control, and the check itself RECONSTRUCTED the reach from the
	   CSS rather than walking it, so it would have answered 44 if one had.
	   Both halves are fixed; this row is what keeps them fixed.

	   THE CHECKBOX IS HERE RATHER THAN IN `tapTargets` ON PURPOSE. It has no
	   reach mechanism at all, so the modelled columns just echo its 13x13 box;
	   what the row is for is the WALK, which follows the activating `<label>`
	   and therefore measures the pair as one target. Measured 45.3px tall at
	   both widths. A `tapTargets` row on the input alone would report 13x13 and
	   be wrong about a control that is fine; a `tapTargets` row on the label
	   alone would report 44 without ever proving the input goes with it. */
	tapReach: [
		{ selector: '[data-testid=ed] button.info-tip-trigger', label: 'column tip triggers (reach, not box)', min: 44 },
		{ selector: 'ul.checklist input[type=checkbox]', label: 'checklist inputs, walked through their label', min: 44 }
	]
};
