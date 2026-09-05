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
		/* A STANDING FINDING, MEASURED RATHER THAN OMITTED. The four glyph
		   controls on a row (move up, move down, duplicate, delete) are 1.45rem
		   squares in a 6.4rem column, inside a table that already scrolls
		   horizontally at 375px; four 44px targets would need ~11rem of that
		   column. That is a layout decision with its own measurements, not a
		   class to add, so this row reports the number instead of hiding it --
		   a control nobody measures is a control nobody fixes. */
		{ selector: '[data-testid=ed] td.row-ops button', label: 'row action glyphs (known finding)', min: 44 }
	]
};
