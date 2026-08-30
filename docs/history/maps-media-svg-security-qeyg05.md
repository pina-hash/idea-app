---
title: "`maps-media` stops admitting SVG on a public bucket; a unit's published elevation slots become unique; the plan frame is fixed in the catalog (`claude/maps-media-svg-security-qeyg05`, migration 0168)"
date: 2026-08-30
branches: [claude/maps-media-svg-security-qeyg05]
migrations: ["0168"]
subsystems: ["IDEA Maps", "Storage", "Migrations"]
---

Three findings carried out of the maps build sessions, none of them previously
built. One migration, `0168_maps_media_types_and_plan_frame.sql`, plus
`tests/maps-media-and-plan-frame.test.ts` pinning it, committed together to
`main` because either half alone turns `main` red. No application code.

## The one that mattered

`0163` created `maps-media` with `public: true` and
`allowed_mime_types = array['image/*']`. That wildcard matches
`image/svg+xml`. An SVG is a document -- script, external references, event
handlers -- and Storage's content-type rewrite only catches `text/html`, so an
accepted SVG would have been served back as `image/svg+xml` from a public URL
on the project's own Storage origin, where navigating to it executes it.

Replaced with six concrete raster types: `image/jpeg`, `image/png`,
`image/webp`, `image/heic`, `image/heif`, `image/avif`. The list was decided
from the path (spec 7's "standing at the toolbox with a phone", plus a desktop
admin pasting a screenshot), not copied. `notebook-upload.ts` was read and
agrees on five of the six; that is a conclusion rather than an inheritance,
since it is a 4 MB Drive-proxied path with a server transcode point and this is
a 20 MiB direct-to-public-bucket path.

`heic`/`heif` are admitted **deliberately, with a cost that is written down**:
Chrome and Firefox do not decode HEIC, so a raw iPhone capture stored here
would not render for most visitors of a public viewer. Admitting it means a
capture can never fail *at the bucket*, which is the one failure the person at
the toolbox cannot work around; transcoding on capture is the editor bundle's
obligation and is named in the header the way `0163` named the `File.type`
obligation. `gif`, `bmp` and `tiff` are refused because nothing in this path
produces one.

**What the narrowing does not reach, stated in the header rather than assumed
away.** Storage enforces the list at upload against the *declared* content
type, so this closes the door on future uploads and does nothing to an object
already stored: an SVG already in the bucket stays there, stays public and
stays scriptable. The migration therefore counts them and prints every key as a
`raise warning`, and does not delete them -- deleting a `storage.objects` row
would not remove the backing bytes and would destroy the only record naming
them. Byte sniffing is not quietly missing either: an upload declaring
`image/png` that contains SVG markup is served as `image/png`, which no engine
sniffs back to SVG.

## The elevation index, and a disagreement with 0161 worth recording

`0161`'s header declined this uniqueness **on purpose**, and its reasoning was
checked against the code and is sound: `maps_publish(text, uuid)` is strictly
per-object, one object per call and therefore one transaction per call, so
swapping two published compartments necessarily passes through a state where
the first published collides with the second not yet published. No index shape
avoids that -- a deferrable constraint defers to commit, and each publish
commits separately.

It was added anyway, **narrowed to `where kind = 'compartment' and
elevation_order is not null and status = 'published'`**, which is the set the
public viewer and search actually read. Draft rows are left entirely free, so
an admin building out a unit types slot numbers in any order; only publishing
holds them to the rule. The residual cost is one extra publish on a reorder of
already-published siblings (route one through a free slot), and it is named in
the header rather than discovered later.

One rough edge is recorded rather than fixed: the refusal arrives as SQLSTATE
`23505`, which `src/lib/pg-errors.ts` has on its **transient** whitelist, so a
caller using `rpcErrorStatus` would read a permanent deterministic refusal as
"come back in a moment" and retry it to exhaustion. The fix belongs to the
editor bundle -- recognise the index by name and say "that elevation slot is
taken" -- and emphatically not to widening the transient list.

On a non-zero duplicate count the migration **refuses and does not renumber**:
which drawer is really in which slot is a fact about the furniture, and
renumbering would change a published unit's elevation for the public with
nobody looking.

## The plan frame

`position_x_in`, `position_y_in` and `rotation_deg` carried no stated anchor,
axis direction or unit. Recorded as a table comment plus four column comments,
which is where a session actually looks.

This **fixes** the convention rather than transcribing it, and the entry says
so because there is no plan renderer in the tree -- `src/lib/maps/` is a
typed-number form editor with no canvas -- so no shipped code confirms or
contradicts it. Fixing it before a renderer exists is the cheapest moment. One
part is a property of the stored shape rather than a claim about it: a rect is
`{kind:'rect',w,h}` with no `x`/`y`, so it spans local `(0,0)` to `(w,h)` and
the local origin *is* its minimum-x, minimum-y corner. Position places that
origin in the parent's frame; rotation turns about it. Axes are x-right,
y-down, rotation positive clockwise -- SVG user space, so a renderer needs no
flip.

## Two premises in the brief that did not hold

Both were checked rather than repeated, because a header sentence that
contradicts its own body is the failure this repo has been finding weekly.

- **"A client-side refusal already exists in the shelf entry surface."** It does
  not. `src/lib/maps/` and `src/routes/maps/` contain no upload surface of any
  kind: no picker, no `accept`, no mime check, and no reference to `maps-media`
  or `maps_photos` anywhere in `src/`. So the bucket list is currently the
  **only** gate, not the second of two, and the header says so and tells the
  editor bundle to bring its own refusal.
- **"The editor breaks ties totally and renumbers on save."** It does not.
  `NodeDetail.svelte` writes one node's `elevation_order` as a typed integer and
  touches no sibling. That is why nothing shipped breaks under the new index.

## Verified

- Full suite green: 216 files, 4465 tests. `svelte-check` at the baseline, 0
  errors and 37 warnings (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`) -- re-derived after
  exporting placeholder `PUBLIC_SUPABASE_*` values and running
  `svelte-kit sync`.
- Every assertion mutation-proved by editing the **migration file** toward the
  defect and confirming the test reddens, then restoring from a scratchpad copy
  and confirming md5 identical (`247efa37b67355b092612c892d997511`). Four
  mutants: re-widen the list to `image/*` (4 red), never create the index (5
  red, including the pre-migration-data test's own control), delete the
  `position_x_in` comment (4 red), and -- separately -- keep the comment but
  make it say nothing (2 red), which proves the substance assertions are not
  satisfied by mere presence. The committed test additionally carries an
  in-database mutation proof so the property stays proven in CI.
- The migration's refusal is tested over seeded **pre-migration** data: boot the
  chain short of `0168`, seed a published duplicate through the real path, apply
  the file, assert it refuses with the count and the unit name and that both
  rows still say slot 1 -- with a positive control that the same file applies
  cleanly once the duplicate is resolved, so an always-raising migration could
  not pass. Re-appliability is asserted in the same test.

## Not verified

- **Nothing was run against the live Supabase project.** No CLI command that
  connects to a project was issued, per the brief. So the apply-time counts are
  unknown from here: how many objects are in `maps-media`, how many carry a type
  the new list refuses, and **how many SVGs are already in there** are all
  answered only when the file is pasted into the SQL editor. The migration
  prints all three.
- No browser pass: this bundle renders nothing.
- `allowed_mime_types` enforcement itself is storage-api behaviour, not a
  database constraint, so the test asserts the **policy value** the upload path
  reads (through a matcher mirroring storage-api's wildcard semantics) and does
  not simulate an upload. The db harness has no Storage server and the test
  stub's `storage.objects` has no `metadata` column, which is also why the
  migration's per-object census is catalog-guarded and dynamic.

## Deferred

- Removing any SVG already in `maps-media`: a Storage-side action, named by key
  in the migration's own warning output.
- Teaching the maps write path to name this index in a refusal instead of
  surfacing `23505`.
- A server-side bulk/subtree publish, which would make a whole unit's reorder
  one transaction and remove the extra publish this index costs.
