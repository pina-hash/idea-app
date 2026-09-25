# 37 Finishing an assignment IS turning it in, it stays editable until graded, and edits after a grade are kept and flagged

- Raised: 2026-09-25  By: feedback reports R13, R14 and R27 of the 2026-09-25 archive
  (`docs/feedback/2026-09-25/TRIAGE.md`), triaged by the router chat.
- Status: DECIDED 2026-09-25 by Mr. Pina, choosing "Full model now" over "HTML-only derived
  completion" and "keep a turn-in button". His words in R27: "my goal is to have a minimum
  complexity workflow ... even if one button press can be removed ... it should be removed
  ... you should just be able to edit the assignment until I've graded it and after I've
  [graded] it you can make edits ... however these edits have to be identifiable as having
  been done after ... the grade was given and ... I also need timestamps for the edits ...
  like a Google doc ... edit History."
- Build: OPEN, in two bundles. Round 1 (ledger 0298) ships the no-migration half: a derived
  "complete" standing for ported HTML worksheets and per-block "changed after grading"
  markers. Session 2 (`docs/feedback/2026-09-25/QUEUE.md`) ships the migration half.

## What was decided

1. **Complete is turned in.** An assignment whose every block has a stored answer that
   meets its `minSentences` (the `hxProgress` 100% predicate, NOT `hxIncompleteBlocks`
   alone, which passes an empty worksheet whose manifest sets no minimum) reads as done on
   every surface, with no button. One predicate drives the chip, the filters, the to-do,
   the home feed and the teacher's to-grade tally.
2. **It applies to spec assignments too**, not only ported HTML worksheets. That is the
   half that needs a migration: `submitted` LOCKS saves today (0197's save gate returns
   `locked`), so "editable until graded" means the save gate must stop treating a
   student's own completion as a lock.
3. **Editable until graded; after a grade, still editable, and every edit is recorded.**
   An append-only response-revision table written inside `classroom_save_response`
   (widened in 0197's style, grants in 0166's shape), coalesced 0129-style so autosave does
   not mint a revision per keystroke burst, with a boundary stamped at each grade.

## Defaults taken where he did not specify (a correction is one line)

- The edit history is visible to the teacher only. Kept forever. One revision per block
  per 10-minute burst, frozen at each grade.
- Work completed after the due instant reads "Complete, late": a word and a tone, never
  silently "Done".
- A spec assignment's declaration and preflight, which Submit enforces today, move to a
  check the page shows while the work is incomplete. The pre-submit gate does not silently
  disappear.

## What this forecloses

A Submit button as the only path to "done" on any assignment kind. `postGradeChange`
(`grading-export.ts`) stays and becomes per block rather than being replaced.
