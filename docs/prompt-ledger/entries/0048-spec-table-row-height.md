# 0048 A table row that more than doubled, and whether that was the right trade
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: the table block in `SpecRenderer.svelte`, `src/routes/dev/spec-table/**`, `tools/browser-verify/routes/spec-table*.mjs`, the generated regions of its README, `tests/classroom-spec-table*`, `tests/dom/spec-table*`, a decision entry if 2.12 requires one, `docs/prompt-ledger/entries/0048-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0180
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0043 brought the spec table's four row-action glyphs from
  23.2px to 44px by laying them out 2x2 inside the column that was already
  declared. The arithmetic was right, the column got NARROWER, and the
  table's own horizontal scroll got SHORTER. It was a good fix.

  Its cost was row height: 40.4px to 98.3px. More than double, on every row
  of every table in every assignment spec a student fills in. 0043 said
  plainly that it took that trade itself and that if it is wrong it is wrong
  in the direction 2.12's step 2 corrects. Prompt 0044 then confirmed 98.3
  held while fixing two more controls on the same surface.

  Nobody has measured what that costs a student on a real spec. A single row
  is a number; twelve rows on a phone is a page.

  This bundle measures the whole-page cost and then answers 2.12's step 2 for
  this surface, which is the step the clause assigns to an owner rather than
  to the bundle that finds it.

  Deliberately excluded: the standard, whose clause is being applied rather
  than revised; `.tap-reach-44`, settled by 0044; and the three surfaces in
  decision 12, which are another bundle.
