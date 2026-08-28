---
title: "The review console's select ladder joins the shared module (code-only)"
date: 2026-08-16
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 49
---

## The review console's select ladder joins the shared module (code-only)

`/notebook/review` hand-wrote a three-rung PostgREST ladder inline, naming
`notebook_entry_photos`, `notebook_entry_notes` and `notebook_folders` as
embeds. `src/lib/notebook-selects.ts` exists precisely because an embed is an
assertion about the SCHEMA that nothing type-checks, and this ladder sat outside
it with no coverage at all -- the same position the student feed's ladder was in
on the day `0098` repointed a key out from under its `notebook_sessions` embed
and the page reported the notebook missing on a database that had it.

- **It is a genuinely DIFFERENT select, not a wider copy**, so it gets its own
  exports (`REVIEW_ENTRY_PHOTOS_SELECT` / `_NOTES_SELECT` / `_FULL_SELECT` +
  `REVIEW_ENTRY_SELECTS`) rather than being folded into the feed's rungs: it
  reads ONE entry by id, carries `student_id`, and resolves the folder's NAME
  through an embed where the student's own view reads the bare `folder_id`.
- **Behaviour is unchanged**: same three selects, same widest-first order, same
  degrade-one-capability-at-a-time reason. The route's explicit
  `FULL -> NOTES -> BASE` chain is a loop over the array now.
- **`tests/notebook-page-load.test.ts` gained the catalog assertion** the ladder
  never had, held against the REAL foreign keys and kept honest by pinning the
  exact set of three relations (so a parser returning nothing cannot pass it
  vacuously, and a dropped embed shows up too).

### Verified

- `npx svelte-check`: **0 errors, 36 warnings** (the same 36 as HEAD). Note the
  generated route types are stale after adding a load key -- run
  `npx svelte-kit sync` first or it reports a phantom `units` error.
- `npx vitest run --no-file-parallelism`: **1066/1066 across 44 files**
  (was 1065/44 -- the new assertion is the difference exactly).
- **The new test was PROVEN TO FAIL before it was called passing, twice.**
  Repointing the folder embed at `notebook_sessions` -- the real `0098`-class
  regression, a table `notebook_entries` provably has no key to -- reddens
  exactly it, with the PGRST200 explanation; DROPPING the notes embed reddens
  the same test through the honesty check instead. Module restored
  byte-identical (md5 `8c0bd85353df54db710b80b486012c74`) and re-verified green
  after each.
- **NOT verified: the live Supabase project, and nothing was checked in a
  browser.** The local `.env` is the placeholder project, so `0113` has never
  been applied anywhere. Both changed paths need a real session to exercise --
  view-as is admin-gated and the review console's transports are the real
  browser client (the `/dev/notebook-review` harness answers from an in-memory
  store, so it does not touch these select strings at all). **Apply `0113` by
  hand after `0112`**, then check with a real admin that a bulleted item reads
  as a list in the preview and that items sit under their unit headers.
- **No `classroom-updates.json` entry**, deliberately: both changes are staff
  tooling and neither alters what a student sees.

