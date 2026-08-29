---
title: "The \"Has photos\" chip stops counting removed pages, and the sweep is re-run (code only)"
date: 2026-08-21
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 96
---

`0116` gave photos a `removed_at` and left the liveness rule to the client, on a
deliberate contract: the feed's load carries a removed photo through unfiltered
so the student's own "removed photos" disclosure and the restore control can see
it, and EVERY count, render, title and copy site filters it out through
`livePhotos`. `0119` did the same for notes and, while it was there, routed
`notebook-folders.ts`'s `notes` filter chip through `noteThreads`. **It did not
route the `photos` chip beside it.** No SQL, no migration, no schema change.

### WHAT WAS WRONG

`FILTER_PREDICATES.photos` read `e.photos.length > 0`. An entry whose pages had
all been removed answered "Has photos" and then opened with nothing to look at.
The two predicates sat on adjacent lines with opposite behaviour, one of them
carrying a comment explaining the rule the other broke.

The state is reachable without any staff action. `notebook_remove_photo` refuses
only when NOTHING would be left, so a live note is what makes taking the last
page out legal, and the removed row stays on the entry.

### THE SWEEP

`removed_at`, `deleted_at`, `revoked_at`, `cancelled_at` and the `active` flag
are the platform's soft-delete shapes. Every collection read in `src/` that can
hold a soft-deleted member was checked against the rule.

**Fixed** (the one-line shape, all in this bundle):

- `notebook-folders.ts` `FILTER_PREDICATES.photos` -- the defect, now through
  `livePhotos`.
- `/dev/notebook`'s four hand-rolled photo counts -- see below.

**Already correct, and worth naming so the next sweep does not re-check them.**
`NotebookEntryCard` (`orderedPhotos`, `photoPages`, `removedPhotos`,
`noteThreads`, and `hasNotesBlock` deliberately counting deleted notes so the
disclosure survives), `EntryReview` (`pageCount` through `photoPages`, which
also groups original/enhanced pairs), `EntryNotes`, `NotebookPhotos`,
`entryThumb`, `entryPreview`, `entryPlainText`, the classroom layout's check-in
status read (deleted entries excluded, on a three-rung ladder), `holderStatus`
for role grants, the contract status filter, and every `active`-flag list.
`NotebookView`'s `hasPhotos` and `photos.length` count STAGED local Files, which
have no stamp and must not be filtered.

**Deliberately raw, and correct that way:** `entryTimeline` walks
`entry.photos` unfiltered, because a removed page keeps its `photo_added` event
and gains a `photo_removed` one -- the history is the point.

### NAMED AND LEFT ALONE, because each is a behaviour change rather than a sweep

- **`entryTitle`'s filename fallback** (`notebook.ts`) reads the raw photo list,
  so an entry whose only page was removed keeps that page's filename as its
  title. Routing it through `livePhotos` would flip such an entry to "Untitled
  entry" and change what `isUntitled` reports, across the card, the review
  panel, search and the clipboard copy. It belongs to whoever wants that
  outcome.
- **`entrySearchText`** collects `original_filename` off the raw list, so a
  removed page's filename still finds its entry. **Measured rather than
  assumed:** the removed-photos disclosure renders that filename on the entry,
  and Restore sits beside it, so unlike a superseded note revision the text
  really is still on screen. Searching for it and finding the entry is how a
  student gets a page back. Left as it is, on evidence.

### THE HARNESS

`/dev/notebook` stands in for the write RPCs, and its `setEntryLabel` guard read
`entry.photos.length === 0` where `notebook_set_entry_label` counts
`p.removed_at is null` (checked against the body in `0119`, not from memory).
The harness therefore PERMITTED clearing a title on a shell entry the real RPC
refuses, which is the one thing a harness must not do. Three more sites filtered
`!p.removed_at` by hand (`removePhoto`, `submitEntry`, and `deleteNote`'s
`remainingPhotos`, added later); all four now go through `livePhotos`, so the
file has one answer and not four copies of it.

### VERIFIED

- **`tests/notebook-page-load.test.ts`: three new tests** driving the REAL load
  and the REAL `applyQuery` -- not `FILTER_PREDICATES`, which is module-private
  and which a test reaching past `applyQuery` could not tell was wired wrong.
  The fixture is built through the REAL RPCs in the shape described above.
- **The expected value does not come from the client code.** The chip's whole
  result is compared against the same question asked of Postgres directly
  (`exists (... where removed_at is null)`). The unfiltered list is the positive
  control, and a third test asserts the entry is STILL found by "Has notes" and
  still absent from "Drafts", so a predicate that simply dropped it fails.
- **Mutation proof, and the harness was proved against a deliberate breakage
  first.** Three mutations, each verified applied by grep and by a changed md5
  before the run, `src/lib/notebook-folders.ts` restored byte-identically
  (md5 `c25e3019029b16b4f0dcead6961321fd`) and re-verified green after each:
  - `photos: (e) => e.photos.length > 0` (the defect as shipped): **1 reddened**.
  - `photos: () => true` (maximally permissive): **1 reddened**.
  - `photos: (e) => livePhotos(e.photos).length > 0 && e.submitted_at !== null`:
    **1 reddened, on the Postgres comparison ALONE.** This one passes all three
    named checks and is caught only by the oracle, which is what proves the
    oracle is load-bearing rather than decorative.
- **Driven in a real browser** at `/dev/notebook`, through the real controls: a
  note added, then the only page removed. Measured **8 entries unfiltered, 7
  under "Has photos"**, the emptied entry the only one dropped, its removed page
  still listed under "Removed photos" with Restore beside it; and **4 of 8 under
  "Has notes" with the same entry PRESENT**, so the fix hides it from one chip
  and not from the notebook.
- `npx svelte-check`: **0 errors, 36 warnings** (the baseline).
  `npx vitest run --no-file-parallelism`: see below.

### NOT VERIFIED, and why

- **The live Supabase project.** The local `.env` is the placeholder. Nothing
  here touches SQL, so there is nothing to apply.
- **The harness's `setEntryLabel` guard was not driven to its divergent state.**
  That needs a FREE-FORM entry (the rename control is gated on `session_id`
  being null) with no live photo and no live note, and the fixture carries no
  free-form draft; on a submitted entry the note-delete guard correctly refuses
  the last note. Creating one needs the photo stager, which **cannot be driven
  in the Browser pane**: `document.hidden` is true there and
  `requestAnimationFrame` never fires, which the correction step waits on. This
  was confirmed directly in the pane rather than inferred, and it is the trap
  already recorded in `CLAUDE.md`. The guard's correctness rests on the RPC body
  it was diffed against, not on a drive.

**Undoing it:** revert the four files. There is no migration and nothing applied.
