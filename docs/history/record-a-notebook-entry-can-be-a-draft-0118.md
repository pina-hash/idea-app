---
title: "A notebook entry can be a draft (`0118`)"
date: 2026-08-19
branches: []
migrations: ["0118"]
subsystems: ["Digital notebook"]
record_order: 36
---

Migration `0118_notebook_draft_state.sql` (apply manually after `0117`). One
nullable column decides it: `notebook_entries.submitted_at`, **null = a draft,
private to the student; set = turned in, and staff can see it.** DATA LAYER
ONLY -- this bundle ships NO controls; the UI is a separate change.

**`status` IS UNTOUCHED AND STAYS INSTRUCTOR-DRIVEN.** It is the verdict on
work somebody has SEEN; draft-ness answers a different question -- has anybody
been shown it at all -- so folding the two into one column would make every
existing status rule ambiguous the moment a draft existed. A timestamp rather
than a flag for `pinned_at`'s reason: it records WHEN, which a later lateness
rule would need. **This bundle deliberately builds no such rule.**

### THE BACKFILL IS THE DANGEROUS PART, AND IT RUNS EXACTLY ONCE

Every entry that existed before this migration was turned in the moment it was
created -- there was no other way to make one -- so all of them are stamped
`submitted_at = upload_timestamp` (their OWN time, never `now()`, which would
rewrite the whole history to the minute of the apply). A row left null becomes
invisible to every instructor read AT ONCE, so the migration ASSERTS that none
is and aborts if one is.

**AND THE WHOLE BLOCK SITS INSIDE A CATALOG GUARD ON THE COLUMN'S OWN
EXISTENCE.** Re-pasting a migration is ordinary here, and an unguarded
`update ... where submitted_at is null` on the second run would stamp every
genuine draft in the school as turned in, silently. The assertion is inside the
guard too: after this has landed, a null IS a draft, and asserting there are
none would be asserting the feature away.

### The RPCs

`notebook_create_entry` and `notebook_create_note_entry` take
`p_submitted boolean default true`; the default preserves every existing
caller. **Both old signatures are DROPPED first** -- the 0058/0068/0096 trap,
and here it is silent-wrong-function rather than stale-code: PostgREST resolves
by supplied argument NAMES, so a caller omitting `p_submitted` would keep
hitting the pre-0118 body forever, making entries with no stamp and nothing
raised anywhere.

Two new RPCs on 0116/0117's exact shape (SECURITY DEFINER, `set search_path =
''`, revoked from public, granted to authenticated, jsonb). Neither takes a
student id: the caller is `auth.uid()` and the WHERE clause is the
authorization.

- **`notebook_submit_entry`** -- refuses an already-submitted entry, and one
  with nothing in it, **counting LIVE photos only** (0116 made a photo
  removable, so "has a photo" and "has a photo row" stopped being one question).
- **`notebook_unsubmit_entry`** -- refuses once `reviewed_at` is set, and one
  that is already a draft. **It exists so that Turn in is not a trap**, and it
  costs the instructor nothing: a student can already add photos and notes to a
  submitted entry, so what staff see was always live. This only withdraws work
  nobody has acted on yet.

**Refused on a draft: `notebook_flag_entry`, `notebook_resolve_entry`,
`notebook_staff_delete_entry`.** Staff cannot act on what staff cannot see, and
these are SECURITY DEFINER so RLS never runs inside them -- the read boundary
could not be what stops them. Each refusal sits AFTER the existing authorization
check, so an outsider still learns nothing; the staff-delete one is folded into
the ordinary not-yours message on purpose, because naming a draft would confirm
to a manager that a student is holding unturned-in work.

**0116's shell guard relaxes for DRAFTS ONLY** in `notebook_remove_photo`: a
draft may be emptied (a student who photographed the wrong page must be able to
replace it without deleting the whole draft), a submitted entry may not (an
empty row on an instructor's grid claiming presence is what that guard exists
to prevent).

### THE PRIVACY BOUNDARY IS TWO SITES

`notebook_entries` carries its own staff SELECT policy AND
`notebook_can_read_entry` -- 0106's header says why: "the policy governs a
direct select and the function governs every delegated one". The delegated ones
are the photos, the notes, the folder name, and `/api/notebook/photo/[photo_id]`.
**Fixing only the lists would have left a draft's pages fetchable one at a time
by id.** Both get the same clause; the owner's branch is untouched in both.
Mutation-checked independently: the policy alone reddens 1 test, the function
alone reddens 3.

### The exclusion sweep, and what was deliberately left alone

Built by walking all 24 live functions and views whose body names
`notebook_entries`. **CHANGED:** the grid roster's `holders` branch, and the
grid's `free_entries` / `latest` / `counts` (so **a student holding only a draft
reads as `missing`** -- the honest answer, and the one the whole feature rests
on); `_notebook_student_payload`'s entries, its `deleted_entries` and its
activity read, feeding BOTH `notebook_review_student_notebook` and
`notebook_view_as_notebook`; and `_notebook_detach_session_entries`' returned
COUNT (the update still moves every row, drafts included -- the composite key to
`notebook_session_postings` demands it).

- **THE VIEW-AS PREVIEW IS NOW LESS FAITHFUL, KNOWINGLY.** 0116 excluded
  deleted entries there partly because "a student does not see their deleted
  work", so the filter and the promise agreed. A student DOES see their drafts,
  so here they disagree and **privacy wins**: an admin preview must not be how
  an unturned-in draft becomes visible.
- **`notebook_entry_activity` (the view) is UNTOUCHED**, and that is the neat
  part: it is `security_invoker`, so a staff member selecting it is already
  scoped by the new policy while the OWNER keeps their drafts, which the
  recent-activity sort on their own feed needs. The one caller that bypasses
  invoker rights is `_notebook_student_payload`, and that is where the clause
  went. A filter on the view would have been wrong in both directions at once.
- **`notebook_delete_folder`'s count is UNTOUCHED** -- its sibling in the detach
  path changed, and the difference is who reads the number: the detach count is
  a TEACHER's, this one is the STUDENT's own, and their drafts are theirs.
- **`notebook_admin_override_entry` is UNTOUCHED**: the chair-tier repair hatch,
  not a review action, and the only path that can correct a draft filed against
  the wrong section. **`notebook_staff_restore_entry`** likewise (it only ever
  acts on an already-deleted row). Every owner-only write is untouched -- adding
  to a draft is what a draft is FOR.

### Client

`submitted_at` rides a **new widest rung** on both select ladders
(`NOTEBOOK_DRAFT_SELECT`, `REVIEW_ENTRY_DRAFT_SELECT`), composed rather than
written out because it widens no embed. **There is no filter on it: a draft is
the student's own work and belongs in their feed.** An absent column reads as
TURNED IN, never as a draft -- the direction that fails silently, since a null
default would report a notebook full of handed-in work as nothing handed in.

- **A REAL BUG THE EXISTING TESTS CAUGHT.** The feed's deleted-filter was keyed
  on `rung.capability === 'deletion'`, so the new rung above it carried
  `deleted_at` and silently stopped excluding deleted entries. `excludeDeleted`
  is per-rung DATA now, and `notebook-page-load.test.ts` pins the equivalence
  both ways.
- **The class page distinguishes a draft from a turned-in entry**, and that is
  load-bearing: reporting an unturned-in entry as `filed` is the worst failure
  this feature can produce -- the student sees the check-in done and stops,
  while the instructor's grid correctly reads `missing`, and nobody finds out
  until it is graded. `CheckInStatus` gains `draft` (label "Draft, not turned
  in", `attention` tone, **outstanding**), and it **ranks BELOW `filed`**: a
  student who turned one page in and is still drafting a second HAS filed it.
  The manager's `sectionOutstanding` needed no change -- it is `gridSummary`
  over the grid, which now excludes drafts, so a draft counts as owed for free.

### Verified

- **`tests/notebook-draft-state.test.ts` (37 tests)** on real embedded Postgres.
  The backfill is asserted against a database booted on the chain WITHOUT 0118,
  filled through the REAL pre-0118 RPCs, then migrated -- the only way to see
  what it did to rows that already existed. Every refusal, the two privacy sites
  independently, a staff select against a draft's photos AND notes returning
  zero rows, the photo proxy answering 404 (with the three Drive env vars set
  first, or the route's own 503 would fire before authorization and the
  assertion would measure nothing), and the full round trip -- create a draft,
  absent from every staff read and present in the owner's, submit, appears
  everywhere with the grid counts landing where a directly-created entry would
  have put them, unsubmit, leaves again.
- **A dedicated block re-checks 0116's and 0117's own guarantees with 0118
  applied.** Their suites are byte-unchanged and their chains deliberately left
  alone: 0116's re-applies its own file to prove it is re-runnable, which on a
  database carrying 0118 would revert every function 0118 recreated and leave
  the rest of that file passing against a half-reverted schema.
- **MUTATION-CHECKED 27 WAYS, EVERY ONE CAUGHT**, each file restored
  byte-identical (md5): the backfill removed, its re-apply guard removed, all
  nine RPC refusals one at a time, both owner clauses widened, the shell guard
  relaxed too far and not at all, each privacy site alone, all five sweep
  filters together and then individually, the class page's draft distinction,
  its pre-0118 fallback reading as a draft, its widest rung dropped, the draft
  rank inverted, `isOutstanding` not counting a draft, and the feed's null
  fallback.
- **ONE MUTATION SURVIVED AND IS WORTH RECORDING:** rewriting the class page's
  `draftsReady ? row.submitted_at !== null : true` as `row.submitted_at !== null`
  changes nothing, because an absent column reads `undefined` and
  `undefined !== null` is already true. The guard is documentation, not
  behaviour; the mutation that DOES bite is making the fallback read as a draft.
- **`tests/notebook-shell.test.ts`: 5 assertions GENERALIZED, none deleted.**
  They spelled the ladders out position by position, which adding a rung
  necessarily breaks (the `classroom-measure.test.ts` situation). They assert
  the RULE now -- widest-first, strictly narrowing, and a rung names the columns
  of its own capability and nothing wider -- and all four were re-mutated to
  confirm they still bite.
- `npx svelte-check`: **0 errors, 36 warnings** (the same 36 as HEAD).
  `npx vitest run --no-file-parallelism`: **1426/1426 across 58 files**.
- **NOT verified: the live Supabase project, and nothing was driven in a
  browser.** The local `.env` is the placeholder project, so `0118` has never
  been applied anywhere -- and there is no UI to drive yet, which is the point
  of the split. Apply it by hand after `0117`, **read the `raise notice` and
  confirm the backfilled count matches what the deployed app holds**, then check
  with two real accounts that a teacher cannot see a student's draft and that a
  student holding only a draft reads as missing on the grid.

