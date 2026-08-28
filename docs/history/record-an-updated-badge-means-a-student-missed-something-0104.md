---
title: "An \"Updated\" badge means a student missed something (`0104`)"
date: 2026-08-14
branches: []
migrations: ["0104"]
subsystems: ["IDEA Classroom"]
record_order: 39
---

## An "Updated" badge means a student missed something (`0104`)

Migration `0104_classroom_edit_visibility.sql` (apply manually after `0103`)
plus one client change. Nothing about instructor-only materials (`0090`) or
what a student may READ changed; what changed is when the badge fires.

### The bug, and the shape of it

`0085` decided a published item had been edited with
`v_changed := ... or p_resources is not null` -- **"the caller sent a links
array" rather than "the links changed"** -- and `ContentComposer.itemInput()`
builds `links` on every save. So EVERY save through the composer stamped
`edited_at`, whatever did or did not move.

**Which leaked instructor-only work.** `classroom_add_instructor_attachment` /
`classroom_set_instructor_resources` touch nothing on `classroom_items`, so on
their own they were already silent (asserted, not assumed -- see the suite).
But the composer attaches them AFTER saving the item, so adding an answer key
ran `classroom_update_item` first and stamped it -- and every student in every
class the item is posted to was shown "Updated" (ClassPage, ItemDetail, and the
home feed's `updated` rank) pointing at content they cannot open, are not meant
to know exists, and would find unchanged. It fails in the direction nothing
catches: nothing errors, nothing looks wrong to the teacher who caused it, and
the cost is that the badge stops being worth opening.

### The fix, at the layer that owns the timestamp

Not "the composer should send less": a caller reaches this RPC through PostgREST
with any payload it likes, and what a badge MEANS belongs where its timestamp is
written.

- **Resources are COMPARED**, by `_classroom_resources_changed`, which
  normalizes an incoming array exactly the way `_classroom_write_resources`
  stores one (url trimmed, label defaulting to the url and capped at 200,
  position from the array's order) so the two cannot disagree about what "the
  same links" are. Deliberately NOT a validator: a malformed array still reaches
  the writer and is refused there with its own message, and reads as *different*
  in the meantime -- the safe direction.
- **Unchanged resources are not REWRITTEN.** `_classroom_write_resources` is
  delete-then-insert, so rewriting identical links mints new
  `classroom_item_resources` ids -- and `ITEM_SELECT` embeds those rows BY ID, so
  a student's own read carries them. "Changes nothing student-visible" has to
  include the ids.
- **A save that changes nothing leaves `updated_at` alone too**, so the row is
  byte-identical rather than merely visually identical. Publishing still moves
  it (it is a change to the row) while still not counting as an edit.
- **Client half: a `datetime-local` value has no seconds**, so re-encoding an
  untouched due date through the input LOSES them, which the server can only
  read as a real change. `dueToSend()` sends an untouched field back exactly as
  stored. Small, and the one remaining way an instructor-only save could still
  have stamped an assignment.

### Verified

- **`tests/classroom-edit-visibility.test.ts` (9 tests)**, on real embedded
  Postgres. The headline assertion is not a field check: it reads the student's
  WHOLE view through the REAL `ITEM_SELECT` over the REAL policies (the
  PostgREST shim), serializes it, and requires it byte-identical across an
  instructor-only change -- badge included. A field check would have passed
  while the resource rows underneath were being re-minted. Also: the home feed
  not ranking it `updated`, no timestamp moving on a no-op save, the link ids
  surviving, and every instructor-only write path leaving the whole
  `classroom_items` row byte-identical (`to_jsonb(i.*)`).
- **Kept honest by its second block**: every assertion above would also pass if
  `edited_at` were never written at all, so a real body change, and a link
  added / removed / relabelled / retargeted / REORDERED, each still raise it.
- **MUTATION-CHECKED BOTH WAYS.** Restoring `0085`'s `or p_resources is not
  null` reddens exactly the 4 tests in block 1; making a links change never
  stamp reddens the link test; `v_changed := false` reddens 2. `0104` restored
  byte-identical (md5-checked) and re-verified green.
- **Browser-verified** in `/dev/classroom` (whose `updateItem` stub was
  aligned with the shipped rule -- it never modelled the bug, which is part of
  why it went unnoticed): two consecutive instructor-only saves on a published
  assignment left the student's "Last updated Aug 14, 2:21 PM" identical and
  raised no Updated badge, with the instructor material invisible throughout and
  0 trapped window errors.
- **NOT verified: the live Supabase project.** The local `.env` is the
  placeholder project, so `0104` has never been applied anywhere. Apply it by
  hand after `0103` and check with two real accounts that adding an answer key
  to a published assignment leaves the student's view alone.

