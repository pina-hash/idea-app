---
title: "Wall thickness in IDEA Maps: the typed outline becomes the INTERIOR face in the schema and on screen, snapping gains a face chosen by the relationship, and a polygon's wall is a real mitered offset (`claude/new-session-ow0i42`, migration 0224)"
date: 2026-09-22
branches: [claude/new-session-ow0i42]
migrations: ["0224"]
subsystems: ["Maps", "Database", "Interface", "Standards"]
---

Mr. Pina, feedback report 38, 2026-09-14, from `/maps/edit`: **"wall thicknesses
must be accounted for."** He was asked what that should mean and answered "i
dont know what this means. use your best judgement", so decision 36 is this
assistant's and is recorded as such. This bundle builds it.

The decision, unchanged and not relitigated here: **the typed outline is the
INTERIOR face of the space it describes.** Wall thickness is a separate
per-node value with a building-level default, and a wall is a band lying
OUTWARD from the outline.

## Why that reading is the whole design, and what it bought

Every outline already in `maps_nodes` was typed by somebody measuring a room,
and a room is measured on the inside. So reading the stored numbers as interior
keeps every published row correct **with no backfill** -- and that is not a
convenience, it is the property the rest of the bundle is arranged around.
Centerline or exterior would have moved every room in the building by a wall
thickness, silently, with every stored position still rendering and still
publishing.

The shape of the code follows from it directly. **There is no function in this
bundle that computes an inner face**, because the inner face IS
`mapsShapeCorners`/`mapsFootprint` of the outline exactly as typed. Everything
added derives the OUTER face, and every one of those functions returns the
inner one -- by calling it, not by reproducing it -- when the thickness is null
or zero. So "no wall" is not a second code path that could drift from the old
behaviour; it is the old behaviour.

Measured rather than asserted, three ways:

- `tests/maps-wall-thickness-migration.test.ts` boots the chain SHORT of 0224,
  seeds the world through the real pre-migration write path, reads every
  geometry value out, applies 0224 over the top, and compares row for row.
  `expect(after).toEqual(before)`.
- 0224's own apply-time self-check counts rows carrying a thickness after a
  file that writes none, and raises with the number rather than applying.
- All eight pre-existing `/dev/maps-viewer` browser states measure identically
  at 375 and 1440. Final run: 30 maps routes, **554 measurements at each
  width, 0 outside threshold**.

## The two questions decision 36 left open, answered

**Thickness is uniform PER NODE, not per edge.** A polygon room gets one
number, mitered at the corners. Per-edge was refused: it needs a list parallel
to `points` with nothing to keep the two in step when a corner is edited out, a
second shape for `rect` which has no `points` to parallel, a jsonb home
undoing the column decision below, and a form asking for five numbers where a
building index wants one. What it buys is a room whose north wall is thicker
than its south wall, which nobody has asked for.

**It lives in a COLUMN, not in the `outline` jsonb**, which is a departure
from the build prompt's literal instruction that "both validators take the new
field". 0161's own header states this table's rule -- the outline is "a
variant-shaped document the editor reads" and everything beside it is a scalar
with one shape, in a column, which is why `position_x_in`, `position_y_in` and
`rotation_deg` are columns. A thickness resolved uniformly per node is a scalar
with one shape. And a jsonb key would have had a consequence nobody asked for:
the duplicate-container panel keys on `outlineSignature`, so two rooms of
identical size with different wall thickness would have silently stopped
reading as copies.

The mirror obligation is honoured by a NEW pair rather than a widened one:
`_maps_wall_thickness_ok` here, `mapsWallThicknessOk` in `maps.ts`, pinned
against each other over a nine-value corpus in `tests/maps-kind-rules.test.ts`
exactly as `mapsOutlineOk` is. `_maps_outline_ok` did not change, and the test
asserts that it still says nothing about thickness -- the row that would have
to be deliberately deleted if somebody ever moved the value into the jsonb.

## Two columns, not one, and the number that proves it

`wall_thickness_in` is this node's own wall. `default_wall_thickness_in` is
what its DESCENDANTS fall back to. One column resolved by inheritance cannot
hold both: a building's exterior wall is routinely 12 inches and the partitions
between its rooms 5, so a single column would draw every room in the building
with a 12 inch wall. That is not subtle -- it is wrong on the first drawing
anybody opens, and the browser check measures exactly it (`the inherited 5
reached the room that named nothing`, `and the building own 12 did NOT leak
down`).

Resolution is own value, then the nearest ancestor carrying a default, then
null. **Zero stops the walk**, which is the whole reason zero is a legal value
distinct from null: it is an answer somebody gave. The `walls` harness state
puts the two side by side -- the Mill Room's explicit zero draws a line beside
the Machine Shop's inherited band.

## Snapping gains a face, and one placement legitimately moved

The rule is two lines: a thing being placed is INSIDE its parent, so it meets
the parent's **inner** face; it is BESIDE a sibling, so it meets that
sibling's **outer** face. The thing being placed presents its own outer face in
both cases.

So the commonest snap in the editor -- a toolbox against a room wall -- did not
move at all, which is decision 36 paying for itself: a 9 inch wall on the
Machine Shop changes no placement, measured. What DID move is a sibling snap,
and the figure is worth writing down: Tool Chest A's interior occupies
x = 12..30, its 3 inch wall runs 9..33, and Workbench B inheriting the
building's 6 inch default lands at 33 + 6 = **39**. Before 0224 the same drag
stored 30, with the two carcasses occupying the same six inches of floor. 39 is
the honest answer.

**This session's own expectation was wrong here and the browser run corrected
it.** The spec file was written expecting 30; the measurement returned 33 and
named the outer face, which is when it became clear that `place()` was still
handing `mapsPlaceShape` the mover's INNER footprint -- so the sheet drew one
face and snapped to another. That is fixed, and the check now reads 39.

## The narrow-width answer, which decision 36 named as the renderer's to give

A band with a real dimension deliberately reverses `MapsPlan`'s
`non-scaling-stroke` rule, and the decision asked how a thin wall reads at
375px. **The band is drawn at its true size and never inflated; the inner
path's hairline underneath it is the floor.**

Measured: on `walls-room` at 375px the drawing is 0.8438 px/in, so Tool Chest
A's 1 inch wall is **0.844 device pixels** -- genuinely sub-pixel -- and the
band's own bounding box is still exactly 1.000in on every side. What is left on
screen is the hairline that was there before 0224. The rejected alternative, a
minimum band width in pixels, is the same mistake `MapsPlan` already refuses
about the 44px floor: inflating a shape makes the drawing lie about the
dimension it exists to show, and a wall drawn fatter than it is is a plan
somebody could measure a room off wrongly.

The band is an `evenodd` annulus over two subpaths, never a thick stroke on the
outline -- a stroke straddles its path, so a six inch stroke would put three
inches of wall inside the room and contradict the decision it is drawing.

## What the browser run found that reading the code did not

Three real defects, all invisible at 1440px and all caught by a measurement:

1. **The band inherited `.mv-shape path`'s stroke at higher specificity.** The
   band is a `<path>` inside the shape's own `<a>` (a wall belongs to the room
   it encloses), so `.mv-shape path` reached it and the band drew its own
   1.5px non-scaling stroke on top of the shape's -- two lines where there is
   one surface, worst exactly at the sub-pixel widths where the hairline is all
   that is left. Every shape stroke rule is `path:not(.mv-wall)` now.
2. **`place()` handed in the inner footprint**, above.
3. **NEITHER WALL FIELD WAS IN `NodeDetail`'s EDIT SIGNATURE**, which is the
   worst of the three and was found last, by going looking rather than by a
   failure. `EditBaseline` answers `changed` from one string; a field missing
   from it is a field the surface cannot see being edited, so typing a wall
   thickness left the save indicator absent and the navigation guard silent,
   and the number was gone at the next click with nothing anywhere reporting
   it. The feature would have shipped looking correct and losing input.

**And one about the instrument, which cost more than any of them.** The first
version of the dirty probe used the ROTATION field as its positive control --
rotation has always been in the signature -- and read `the wall field goes
dirty`. That was a FALSE PASS: the save state is one-way, so once rotation had
dirtied the form every later field read `dirty` whatever it did. The probe was
green on a defect it was written to catch. It is rebuilt so each field is
measured on its OWN mount (hence `?state=walls-default`, a whole harness state
for one assertion) with its own NO-OP negative control on the same field: an
input event that changes nothing must leave the indicator absent, which is what
rules out "this form dirties on any event" and makes the transition evidence.

And one about the instrument rather than the code: the pointer-drag probes in
`maps-edit-state-place.mjs` drop the first drag intermittently, **on the branch
point as well as on this tree**, and because those probes are sequential and
each computes its delta from the value the last one left, one miss cascades
into the next. This bundle's own snap probe types the value and presses the
real Snap control instead -- the same `place(..., snap: true)` the drag drives.
The pointer form was measured converging at 1440 and running away to 608in at
375, because the snap tolerance is 7 PIXELS converted to inches and spans
eleven inches at the smaller scale.

**Mr. Pina, or whoever takes the next maps lane: `maps-edit-state-place.mjs`
and `maps-editor-state-room.mjs` carry flaky drag probes.** They are not this
bundle's to fix and they were flaky before it, but they will report a false
red on an unrelated run. The fix is the one applied here: retry against the
effect and report the attempt count, or drive the keyboard path instead.

## A red test this bundle causes and cannot honestly fix

`tests/db/migrations-applied-record.test.ts` has an assertion -- "has a record
for every migration from 0193 onward, and no gaps" -- that compares every
migration FILE in the tree at 0193 or above against the records in
`docs/migrations-applied/`. **It therefore turns red for any lane that writes a
migration, from the moment the file is committed until somebody applies it and
records it.**

Isolated rather than inferred: the branch point (`1ec2f640`) passes that file
23/23; copying THIS bundle's `0224_maps_wall_thickness.sql` into that otherwise
untouched worktree, and nothing else, reddens exactly that one assertion.

**Writing a record for 0224 would be a lie**, and the directory's own README
forbids it in its first two lines: "One file per migration that actually
applied to the production database. Nothing here is a plan." 0224 has never
touched production and cannot from a cloud container. So this bundle leaves the
assertion red rather than satisfying it falsely.

That test is outside this lane's ownership, so it is reported rather than
edited. **The lane holding `0218` will hit it identically** the moment that
branch merges, so this is not a maps problem. If it is worth fixing, the shape
that keeps the README's sentence true is to compare records against migrations
that are ON `origin/main` (or that a ledger entry does not still hold a claim
on), rather than against every file in the working tree -- which is what
`tools/migration-claims.mjs` already knows how to answer.

## The polygon, and the defect deliberately NOT fixed

A polygon's outer face is a real mitered offset, not a bounding box grown by
`t`: the outward direction is read from the SIGNED AREA rather than assumed
from the winding somebody typed, because a person entering points in the shelf
form has no idea they are choosing a direction and a reversed shape would
otherwise grow its wall inward and eat the room. Both windings are measured to
give the same box. Concave corners are mitered with a limit of 4, degenerate
input is returned unchanged rather than guessed at, and the five-sided Weld Bay
rotated 12 degrees is measured keeping five corners on both rings.

The rect branch is exact arithmetic rather than routed through the miter, and
the two paths are allowed to coexist because the test MEASURES that the general
one reduces to the exact one on a rectangle-shaped polygon -- which is the only
thing that ever licenses two implementations.

**What is NOT fixed: a polygon's SNAP targets are still its axis-aligned
bounding box.** That predates wall thickness -- `mapsFootprint` takes min/max
over the corners for `rect` and `polygon` alike, with no per-edge branch -- and
0224 left it exactly as it found it: the outer snap box is the footprint of the
offset outline, so it is as approximate as the inner one and the two stay
consistent. It is now named in the spec's deliberately-undecided list, where it
had never been written down at all. Fixing it is real per-edge geometry in the
editor's drag arithmetic and is its own bundle. Note the split: a polygon's
DRAWN faces are exact; what is approximate is only where a shape snaps.

## The select ladder's first rung

`selects.ts` said, since 0161, "the first migration that widens these tables
adds the rung with it". 0224 is that migration. The node read is two rungs now,
widest first, and `thicknessReady` starts FALSE and is turned on only by a rung
that NAMED the columns succeeding -- so "this deployment has no 0224" and
"nobody typed a wall thickness" are two answers and not one. The form's
controls are withheld where the flag is false, and the save path withholds the
two keys entirely, because writing a column PostgREST does not know about fails
the whole save.

**The public read takes the same ladder rather than a second copy**, and that
is the half that matters most: `/maps` holds no session and answers a phone
standing at a toolbox, and PostgREST rejects a whole select on an unknown
column -- so between this bundle shipping and Mr. Pina pasting 0224 by hand,
the map would have gone blank rather than degraded.

## Verified

- `svelte-check`: **0 errors, 37 warnings in 20 files**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`. Re-derived at the branch point (`1ec2f640`) in a
  clean `git worktree` with `.env` exported: identical, same breakdown. The
  `CLAUDE.md` baseline line is correct for this tree and was not edited.
- `npm test` (the serial form, never a bare `npx vitest run`): **2 failed |
  9922 passed (9924)**, 527 of 529 files, 1300s. Both failures are the
  migration-number pair below and neither is in this bundle's code; every file
  it added or touched is green (`maps-wall-thickness-migration` 24,
  `maps-placement` 46, `maps-select-ladder` 8, `maps-kind-rules` 7,
  `derived-numbers` 25).
- `npm run verify:browser`, all 30 maps routes at 375 and at 1440: **554
  measurements each width, 0 outside threshold.** The four new specs also have
  their measurement files written under `tools/browser-verify/measured/` by
  `npm run verify:readme` on the committed tree with port 5199 free -- 8
  route/width runs, 72 measurements, 0 outside threshold -- and both counts
  regions of the harness README were REGENERATED rather than edited.
- Migration 0224 applied against a real Postgres over seeded pre-migration
  data, re-applied twice more cleanly, and the predicate exercised at nine
  inputs including NaN and both infinities.
- **Mutation proof, nine mutants.** Eight killed as written; the ninth SURVIVED
  and is the reason this bundle has a ninth test file.
  - Migration, three, all killed: dropping the NaN/Infinity clause from
    `_maps_wall_thickness_ok`, and adding a plausible backfill
    (`set wall_thickness_in = 5 where kind = 'room'`), were both killed by
    0224's OWN apply-time self-check -- an **apply refusal**, which is the
    strongest kill available, because the transaction rolls back and nothing
    is half-applied. Neutering the compartment constraint to `check (true)`
    was killed by an assertion through the real write path.
  - Geometry, four, all killed: reverting the sibling target to the inner
    face (2 failures), offering the PARENT by its outer face -- the single
    edit that breaks decision 36's central promise -- assuming a winding
    instead of reading the signed area, and letting a falsy zero fall through
    the inheritance walk.
  - **The ladder, two, and the first one SURVIVED.** Setting `thicknessReady`
    unconditionally true -- which is "cannot tell" rendering as "no wall", the
    exact confusion the flag exists to prevent -- passed every test in the
    bundle. Nothing covered the ladder at all.
    `tests/maps-select-ladder.test.ts` closes it: the rungs strictly narrow,
    differ by exactly the two columns, a PostgREST-shaped refusal of the wide
    rung degrades to the narrow one and reports false, the last rung's failure
    is RE-THROWN rather than answered as an empty map, and an empty table on
    the wide rung is not mistaken for a refusal. Re-run against the same
    mutant it dies, and against a mutant that deletes the narrow rung
    entirely, four of eight die.
  - **The editor form, one, killed on both mounts**: removing both wall fields
    from `NodeDetail`'s edit signature reddens the dirty probe on `?state=walls`
    and on `?state=walls-default` while each one's own no-op control still
    passes -- which is what makes the red mean the field and not the
    instrument.
  - Every file restored from a byte copy (never `git checkout --`) and
    re-verified green; `md5sum` matches the copy in each case.
- The dollar-quote-inside-a-comment paste trap checked both ways against a
  planted `$x$` control: the instrument reported 1 with the plant and 0 without,
  and every dollar-quote token on a code line is in a balanced pair.
- The spec was fetched with `git clone` before editing and again immediately
  before delivering. Both reads are `163a979c`, so the edit is on the current
  version.

## NOT verified

- **Nothing was run against the production database, and nothing could be.** A
  cloud container cannot open a socket to it. 0224 has never been applied to
  production; its verification query at the tail is for Mr. Pina to paste in a
  new SQL editor tab after applying it.
- **No signed-in surface was driven.** `verify:browser` covers `/dev` routes
  only. `/maps/edit` behind the real admin gate, and the real `maps_publish`
  promoting a thickness through PostgREST rather than through the SQL harness,
  are both unexercised here.
- **The wall colours were not contrast-measured.** `--mv-wall-fill` and
  `--mv-wall-frame-fill` are graphical objects and carry a 3:1 floor; the
  harness's contrast check measures TEXT, and no check in this bundle reads a
  composited pixel for the band against its ground. They were chosen from the
  room's own accent at 34% and 26% and looked at in a rasterized screenshot,
  which is a judgement rather than a measurement.
- **`prefers-reduced-motion` is `no-preference` in the harness**, and web fonts
  are blocked, so the type in every measurement above is the fallback stack.
- The editor's wall band was not driven at a zoom other than fit.

## One thing that LOOKS like a regression in a screenshot and is not

Rasterized side by side at 1440px, `?state=place` and `?state=walls` put the
plan sheet about 145px apart vertically, which reads as the canvas having moved
when walls were added. Measured rather than eyeballed, it has not: the sheet is
**662 x 514px in both**, with the frame at **34, 34 inside it in both** -- so
`marginPx` correctly stayed at the constant 34 (a 9 inch wall at 1.5px/in is
13.5px, well under it). What differs is the PANE, **1234px tall without walls
and 1528px with them**, because the form column beside the canvas grew by the
two new fields and their notes; the sheet is centred in a pane as tall as its
taller column, so half of that 294px is the offset. Worth writing down because
the next person to compare those two screenshots will see it too.

## A scope note

The prompt's ownership list named `src/lib/maps/`, `src/routes/maps/`, the
migration, the spec, `tests/maps-*.test.ts` and
`tools/browser-verify/routes/maps-*.mjs`. This bundle also touched
`src/routes/dev/maps-viewer/` and `src/routes/dev/maps-edit/` -- the two maps
dev harnesses -- because a browser check has nothing to measure without a
fixture state to measure it on, and CLAUDE.md requires interactive work to be
verified through a harness mounting the real component. They are maps-only
files that nothing outside maps reads, and every existing state was left
byte-identical: the wall fixtures are SEPARATE functions rather than numbers
typed into the shared ones, precisely so the twelve pre-existing viewer states
still measure what they measured. Nothing outside the maps subsystem was
touched at all, which `git diff --stat origin/main...HEAD` shows in one screen.

## For Mr. Pina

- **Migration 0224 is ready to paste** and has never been applied. Its tail
  carries a commented, read-only verification query: paste that into a NEW
  SQL editor tab afterwards. It returns rows (the editor shows no
  `raise notice`), names each thing it examined, and its last row is a positive
  control -- if `authenticated CAN execute` reads false the instrument is not
  seeing grants at all and every row above it is meaningless.
- **Nothing on the live map changes until somebody types a number.** Every node
  carries null on both columns after the apply, and null renders exactly as it
  rendered before. Set the building's "Default for what is inside" once and
  every room inside it gets that wall.
- The two fields are on every container's form except a compartment's: the
  node's own wall, and the default for what is inside it. They are different
  numbers on purpose.
