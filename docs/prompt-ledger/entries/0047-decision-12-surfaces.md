# 0047 Decision 12's three surfaces, each measured and each under the floor
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `AttachmentList.svelte`, the `.inline-link` rule in `NotebookView.svelte`, the `.swatch` rule in `FolderManager.svelte`, `src/routes/dev/classroom-images/**`, the harness rows for those three surfaces, the generated regions of `tools/browser-verify/README.md`, `tests/classroom-attachment*`, decision 12's Status line, `docs/prompt-ledger/entries/0047-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0180
- Status: issued
- Branch: assigned by the harness
- Notes: Prompt 0044 hit-tested every user of `.tap-reach-44` and found the
  class itself sound: a clipping ancestor was cutting its pseudo-element off,
  and the rule now states the precondition it always had. It fixed the one
  surface it owned and wrote the other three into decision 12 with numbers
  and an owner, which is what 2.12 requires instead of a standing report row.

  This bundle is that owner acting.

  Measured by 0044, identical at 375 and 1440:
    `AttachmentList` on the packed item page -- 41.5px, 1 of 2 controls
    `NotebookView` `.inline-link` -- 45 tall but 32.5 WIDE on one of seven
    `FolderManager` `.swatch` -- 45 tall, 25 WIDE, on all seven

  Two of the three fail on WIDTH while passing on height, which is the shape
  the old probe could not see at all: it computed `max(ownHeight, 44)`, so
  every component carrying the class was unmeasured for height and width was
  never the axis anyone looked at.

  All three are student-facing and none declares a density class, so under
  2.12 there is no exception available without a decision entry with an owner
  on it, and that entry is this one.

  Deliberately excluded: `.tap-reach-44` itself; the standard; and the spec
  table, whose row height is its own bundle.
