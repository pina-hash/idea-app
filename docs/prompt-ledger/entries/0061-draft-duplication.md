# 0061 Save draft makes infinite copies, and homework progress did not save
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `ContentComposer.svelte`, the composer draft signature module, the draft write paths in `src/lib/classroom/transports.ts`, `src/lib/notebook/draft-mirror.ts`, `src/routes/dev/composer-draft/**`, at most one migration (conditional), `tests/classroom-composer*`, `tests/dom/composer-draft*`, `tests/db/classroom-draft*`, `tools/browser-verify/routes/composer-draft*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0061-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, conditional, number taken at commit time. Highest on origin/main at issue: 0181
- Status: issued
- Branch: assigned by the harness
- Notes: Two reports from the 2026-09-05 feedback pull, and they are the two
  most serious things in it because both are about work disappearing or
  multiplying rather than about a control being awkward.

  "issue where i click save draft and instead of just saving one draft it
  starts making infinite copies of that draft" -- tagged portal/bug.

  "Homework progress didn't save" -- tagged portal/bug, no detail.

  These may be one defect or two. A save path that creates a new row instead
  of updating an existing one produces BOTH symptoms at once: the copies pile
  up, and the copy a person reopens is not the one they were last typing in,
  so their work looks lost. Establish whether it is one before assuming two.

  What is known about the surface: `ContentComposer.svelte` derives a
  `ComposerDraft` and a `composerDraftSignature`, compares it against a
  baseline to decide `dirty`, and has a `Save draft` control at line 1139
  whose copy distinguishes "updated (draft)" from "saved as a draft to N
  classes". `classroom_items` carries `state text not null default 'draft'`.
  The notebook has its own `draft-mirror.ts` keyed
  `notebook_draft_mirror:<viewer>:<record>` with `new` as the record for an
  unsaved one. A composer that never learns the id of the row it just created
  would send `new` forever.

  Deliberately excluded: every other feedback item from that pull; the
  notebook's own composer beyond the mirror module; and any redesign of the
  draft flow beyond making it save once.
