---
title: "Reviewing an entry that is fine leaves a mark (`0121`)"
date: 2026-08-20
branches: []
migrations: ["0121"]
subsystems: ["Digital notebook"]
record_order: 88
---

## Reviewing an entry that is fine leaves a mark (`0121`)

Migration `0121_notebook_review_acknowledged.sql` (apply manually after `0120`).
Data layer only: two new RPCs, one grid function rewritten, three tables added
to the realtime publication. No route, component or transport changed, so
nothing on screen calls any of it yet.

### The problem

Reviewing a compliant entry recorded nothing. `notebook_flag_entry` and
`notebook_resolve_entry` were the only two writes that stamped `reviewed_at`,
and both of them say something about the WORK. An instructor who opened an
entry, read it and found it fine had no way to record that they had been there,
so the compliance grid could not tell an entry somebody had approved from one
nobody had opened, and there was no way to pick up where a review session
stopped. The verdict that applies to most entries was the one with no button.

### What shipped

- **`notebook_accept_entry(p_entry_id uuid)`** -- `notebook_flag_entry`'s shape
  and `notebook_flag_entry`'s gate (`classroom_manages_section`, authorization
  refusal FIRST so an outsider learns nothing about the row). It sets
  `reviewed_by` and `reviewed_at` and NOTHING else: `status`, `flag_reason` and
  `instructor_comment` are not named in the UPDATE and must never be. Refuses a
  draft (`submitted_at is null`) and a deleted entry, deleted checked first for
  0116's reason -- both can be true of one row and "that entry is gone" is the
  more useful answer.
- **`notebook_unaccept_entry(p_entry_id uuid)`** -- the same gate, clearing both
  columns. It refuses a FLAGGED entry, which is the one rule accept does not
  have: clearing the stamp off a flagged row would leave a verdict with nobody
  attached to it, which the grid would then render as filed-and-unreviewed while
  still carrying a flag reason. `notebook_resolve_entry` owns the flag and is the
  way back from one. Un-accepting something never accepted is SUCCESS, not
  misuse -- a second click on Undo asks for a state that already holds.
- **`notebook_get_section_grid`** gains the reviewed dimension on all three of
  its reads of `notebook_entries`, separately, because each can be wrong
  separately: `free_entries_unreviewed` beside `free_entries`, `reviewed` +
  `reviewed_at` on the cell (from the distinct-on's own pick), and
  `unreviewed_count` beside `entry_count`. Same arity, so `create or replace` is
  correct and the signature trap does not apply; the payload only GAINS keys, so
  a client deployed before the migration keeps working against it.
- **Realtime**: `notebook_entries`, `notebook_entry_photos` and
  `notebook_entry_notes` join `supabase_realtime`, guarded on the publication
  existing (0062's shape) and on per-table membership.

### The load-bearing decisions

- **Acceptance is a fact about the INSTRUCTOR, not a judgement about the work.**
  `status` says whether the entry is compliant; `reviewed_at` says somebody
  looked. Folding the second into the first is how "I looked at it" quietly
  becomes "I graded it well", which would be a second scoring path on work
  already graded once through `notebook_unit_items` (0097). This is why accept
  leaves a flag standing: accepting a flagged entry records a second look, it
  does not withdraw the flag.

- **THE BEHAVIOUR CHANGE, and it is not local to this file.** Two existing
  student-facing refusals key on `reviewed_at is not null`:
  `notebook_delete_entry` (0116) and `notebook_unsubmit_entry` (0118). Both were
  written when only a flag or a resolve could set the stamp -- rare, deliberate
  acts. Acceptance is the ORDINARY case and will be applied in bulk down a grid,
  so **from this migration on, accepting an entry also closes the student's own
  delete and their own take-it-back.** That is correct on the merits (the record
  an instructor keeps is the same record either way) and it is why
  `notebook_unaccept_entry` ships in the SAME migration rather than later: a door
  that used to be open must not be closed forever by a misclick. Both refusals
  reopen the moment the stamp is cleared, and that round trip is asserted.

- **`reviewed` is computed ONCE, in the grid.** Both the boolean and the
  timestamp ship so no consumer re-derives "has this been looked at" and gets it
  subtly different. It is NULL, not false, where there is no entry -- the
  `on_time` convention on the same cell.

- **`unreviewed_count` comes from the COUNTS read, not from the picked entry.**
  A student with four entries against one check-in, one of them accepted, must
  read as "1 of 4 looked at". A reviewed dimension taken only from the
  distinct-on would have said "reviewed" over three untouched entries, and the
  badge beside it would have agreed with it, which is the shape of wrong number
  nobody investigates.

- **A DRAFT IS STILL `missing` ON THE GRID.** The brief listed `draft` among the
  states a cell should distinguish. That reverses 0118's central privacy
  boundary -- `submitted_at` null means work the student has not handed over,
  invisible to staff on every read, and NOT presence on any grid -- and it
  contradicts the same brief's requirement that every prior exclusion assertion
  re-run unchanged (`tests/notebook-draft-state.test.ts` asserts a draft-only
  student reads `['missing', null, 0]`). Distinguishing the two would show staff
  that a student is holding unfiled work, which is the disclosure 0118 exists to
  prevent. Four states are distinguished instead -- missing, filed and
  unreviewed, filed and accepted, flagged, plus the pre-existing excused -- and
  the `submitted_at is not null` filter stays on all three reads. Flagged as an
  assumption rather than silently narrowed; reversing it is a one-line change to
  the `latest` filter plus a deliberate rewrite of 0118's assertions.

- **A free entry with no section stays admin-only.** `classroom_manages_section
  (null)` is `is_admin()` and always has been, so accepting a section-less free
  entry is reachable only by an admin -- exactly what flagging one has always
  done. Not new, but asserted now so that widening it later is a deliberate act.

- **Replica identity is left at the default.** The full-row setting exists so
  DELETE events can carry more than a primary key, and this subsystem does not
  hard-delete: entries, photos and notes are all soft-deleted (0116, 0119), which
  reaches a subscriber as an UPDATE carrying the whole new row. Paying full-row
  WAL on every photo insert to improve an event that effectively never fires is
  not a trade worth making. RLS still applies to the stream, so publishing these
  tables grants nobody a read they did not already have -- a draft and a
  soft-deleted entry stay off somebody else's channel because their policies say
  so.

- **`notebook_entry_activity` is NOT published.** It is a view (0091), and a
  publication takes tables only. Its rows are these three tables' rows, so a
  subscriber already receives every change under it.

### What was measured

`tests/notebook-review-acknowledged.test.ts`, 33 assertions, on the live chain
through `0121`. `svelte-check` 0 errors / 36 warnings (the baseline, unmoved).
Full suite 65 files / 1559 tests green, with every prior test file unedited.

- **The untouched-fields claim is asserted COLUMN BY COLUMN**, over whatever
  columns `notebook_entries` has, rather than against a list -- so a future
  column this function starts writing is caught without editing the test. Accept
  changes exactly `['reviewed_at', 'reviewed_by']`; un-accept returns the row
  byte-identical to before it was accepted.
- **MUTATION PROOF on the grid's three reads**, each run against this single test
  file, in the permissive direction, restored md5-identical
  (`be6eb48020db714b75c653bea8f326c7`) and re-verified green:

  | Mutation | Reddens |
  | --- | --- |
  | `free_entries_unreviewed` loses `and e.reviewed_at is null` | 1 |
  | counts badge loses its `filter (where e.reviewed_at is null)` | 3 |
  | `latest` distinct-on loses `and e.submitted_at is not null` | 3 |
  | counts read loses `and e.deleted_at is null` | 2 |
  | `free_entries` loses `and e.submitted_at is not null` | 2 |

- **The five states are asserted on a class of their own**, with its own five
  students, so every number is an ABSOLUTE built to a known figure rather than a
  delta measured against what earlier cases left lying around. Dana holds two
  entries with the OLDER one accepted, which is what makes the badge and the cell
  two different questions.
- **The badge is asserted against the cell it summarizes, on every cell**, with
  the case count asserted first (`4 * 2`) so a sweep that generated nothing
  cannot pass.
- **Every 0116 and 0118 exclusion the grid carried is re-run with 0121 applied**
  -- drafts and deleted rows off all three reads, the payload's two callers, the
  roster -- each paired with its positive control in the same assertion.
- **The publication is exercised in all four worlds**: no publication at all (the
  fixture, where the block must do nothing), an empty publication, a publication
  that already holds one of the three tables by hand, and a re-paste. The view is
  asserted absent from it AND asserted to be a view, so the absence cannot be
  read as a missing table.

### NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder (`example-ref`), so **the live `supabase_realtime` publication was
  not read**, contrary to the brief's instruction to check it first -- there is no
  path from this repo to the dashboard. The migration is written so that reading
  it is unnecessary: the outer guard skips the whole block if the publication is
  absent, the inner guard skips any table already in it, and a `raise notice`
  reports how many of the three were actually added, which is the number to check
  against the dashboard after pasting.
- **No browser pass, no signed-in session, no screenshots.** Nothing renders any
  of this yet.
- **Realtime delivery itself is untested.** The embedded fixture has no Realtime
  server; what is proven is publication MEMBERSHIP, which is the part a migration
  controls.

### Left undone, deliberately

- **No UI.** Data layer only, as briefed. The review console still offers Flag
  and nothing else; `src/lib/notebook-review.ts` does not yet know the new cell
  fields, and no transport calls either RPC.
- **No `classroom-updates.json` entry.** Nothing a student can observe has
  changed: no client calls accept, so the delete/take-it-back door stays open
  until the UI ships. **The session that adds the button owns that entry**, and it
  must say plainly that once an instructor marks an entry reviewed, the student
  can no longer delete it or pull it back.
- **No bulk accept.** Accepting a whole column is the obvious next RPC and would
  follow the `{total, succeeded, refused, results:[...]}` shape, calling this
  single-row function per row.

---

