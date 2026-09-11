# 0154 Re-uploading a ported HTML assignment, and the instructor copy that could not be built

- Issued: 2026-09-11
- By: router chat
- Owns: `src/lib/classroom/html-assignment/store.ts` and `answers.ts`, a new
  `src/lib/classroom/html-assignment/InstructorCopy` surface, the HTML-assignment regions
  of `ItemDetail.svelte` and the item route, the EDIT-MODE gating of the HTML upload in
  `ContentComposer.svelte` and nothing else in that file,
  `tests/html-assignment-reupload*`, `tests/html-assignment-instructor*`,
  `tests/db/html-assignment-revision*`, `src/routes/dev/html-instructor/**`,
  `tools/browser-verify/routes/html-instructor*.mjs` and the generated regions of its
  README, `docs/prompt-ledger/entries/0154-*`, and its own `docs/history/` entry
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0198
- Status: pushed
- Branch: claude/beautiful-hawking-7dm6ho
- Notes: GAP ONE SHIPPED IN FULL. A posted ported assignment could not be changed --
  `canStageHtml` required `mode === 'create'` -- and re-uploading one silently orphans
  every answer stored under a block id the new manifest renames. Measured against real
  Postgres: the re-upload is accepted, revision 1 is minted on the same `document_id`, and
  the three rows under the renamed block are still sitting in `classroom_responses`,
  unreachable, with nothing anywhere reporting it. The edit arm now diffs the new manifest
  against the stored one, COUNTS the rows actually at risk from `classroom_responses` and
  `classroom_submission_files`, and holds the post behind a second explicit press naming
  the figure; a re-upload that orphans nothing goes through on one. Every way of not
  knowing -- an unreadable stored manifest, a refused count, no counter at all -- fails
  closed. No migration: 0195's own RPC already upserts and snapshots.
  GAP TWO WAS NOT BUILT, AND THE REASON IS A MIGRATION THIS LEDGER DOES NOT CARRY.
  `classroom_save_instructor_response` (0128) still reads `classroom_assignment_specs`,
  raises 'This assignment has no interactive spec.' without a row, and resolves the block
  id against that spec with a type gate of `textField|table|checklist` against a
  manifest's `text|longText|checkbox|radio|image|table`. 0197 widened
  `classroom_save_response` and `classroom_add_submission_file` and did not touch this
  one. Measured through the real RPC on a real schema-3 item, with a spec-backed item as
  the positive control. A writable frame over that gate is a worksheet that takes typing
  and saves nothing, which is the one failure this feature's own rules name as worth
  avoiding, so the surface was not built and the refusal is pinned in
  `tests/db/html-assignment-revision.test.ts` as a probe written to be DELETED once the
  function gains the same branch 0197 gave the other two. THE READ-ONLY HALF WAS PROVED
  SEPARATELY AND SEPARATELY: the grading console still hands down none of the four write
  callbacks, swept with the item page as a positive control, mutation-proved.
  0149 (Codex, `ContentComposer.svelte`) and 0153 (`HtmlAssignmentFrame.svelte`,
  `bridge.ts`, `ItemDetail.svelte:1720`) run in parallel; no file or region of theirs is
  touched -- the composer edit is the `canStageHtml` gate and its panel alone, and
  `ItemDetail` gains two props and two attributes in the HTML-assignment region only.
