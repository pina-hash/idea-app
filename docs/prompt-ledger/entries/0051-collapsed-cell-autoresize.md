# 0051 A cell mounted inside a collapsed module never grows, and a third of them clip
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: the cell autoresize in `SpecRenderer.svelte`, `src/routes/dev/spec-table/**`, `tools/browser-verify/routes/spec-table*.mjs`, the generated regions of its README, `tests/classroom-spec-table*`, `tests/dom/spec-table*`, `docs/prompt-ledger/entries/0051-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0180
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0048 measured a spec table at twelve rows and found, beside
  the thing it was sent for, that **19 of 60 cells were clipped** on a table
  inside a module that had been re-opened. A cell mounted while its module is
  collapsed has no layout to measure, so the autoresize computes a height
  against a zero box and never corrects itself when the module opens.

  The tap floor holds throughout: 0 of 60 controls under 44px. This is not
  reach. It is a student not being able to SEE what they wrote, in a text box
  they are typing into, on a graded assignment.

  It is also the third defect in a week found only because somebody measured
  the whole page rather than one control, and the second one hiding behind a
  collapsed module: 0048's own first browser spec forgot the click-open step
  and every number came back 0px, which read as a clean pass.

  The autoresize standard predates all of this. `HTML_ASSIGNMENT_BUILD_STANDARDS`
  required auto-resizing textareas from the beginning, and this is that
  requirement failing silently in one state.

  Deliberately excluded: the row-height question, settled by 0048 and decision
  13; the tap targets, settled by 0043 and 0044; and the `Disclosure` component
  itself, which prompt 0018 owns.
