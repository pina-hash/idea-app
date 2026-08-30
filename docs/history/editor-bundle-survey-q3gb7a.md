---
title: "IDEA Maps grows the two placement surfaces: a unit's front elevation and dimensioned shape placement, both driven by the typed number rather than the mouse (`claude/editor-bundle-survey-q3gb7a`, no migration)"
date: 2026-08-30
branches: [claude/editor-bundle-survey-q3gb7a]
subsystems: ["IDEA Maps", "Testing"]
migrations: []
---

Application code only, on 0161-0166 exactly as they stand on `main`. No
migration was written and none turned out to be needed: 0161 already carries
`elevation_order`, `elevation_h_in` and `elevation_w_in` on compartments and
`outline`/`position_x_in`/`position_y_in`/`rotation_deg` on everything else, so
both surfaces are readings of columns that were already there.

## What the survey found, before anything was written

The brief said a good part of this might already exist. It did not.
`docs/history/idea-maps-admin-editor-65iyd4.md` shipped the node tree, typed
geometry, item types, items, stock and draft-and-publish, and names in its own
"Not verified" section exactly what it left: "the plan canvas (B), the elevation
editor beyond the typed per-compartment fields (C)". Confirmed against the tree
rather than against that sentence: `grep -rn -i elevation src/` matched only
GREENLINE track code, and `src/lib/maps/` held nine files with no canvas, no
drag handler and no stack view. What a unit had was nothing at all; what a
COMPARTMENT had was three text inputs on its own detail form (slot order,
height, width), which is a way to type an elevation into the database one drawer
at a time and not a way to see one.

So both halves of this bundle were built. `0166` had landed since that entry was
written, so its "the sweep stays red for the true reason" note no longer applies:
`npm test` is fully green here.

## What shipped

Two components under `src/lib/maps/`, mounted by `NodeDetail`:

**`UnitElevation.svelte`** -- the front elevation of one unit. The compartments
are DRAWN as a stack, each box's height proportional to the typed inches, with
names, heights and widths editable in place and Move up / Move down beside each
slot. `?state=unit` on the harness is it.

**`PlanCanvas.svelte`** -- dimensioned shape placement. The parent's outline is
the frame, siblings are drawn as context, and the node's own shape is a
draggable, focusable, keyboard-nudgeable button. `?state=place` is a new harness
state (Workbench B, a unit with an outline and no compartments) so the placement
surface is measured without the elevation on top of it.

Six pure helpers joined `maps.ts`: `mapsNodeContent` /
`mapsEffectiveNodeContent`, `mapsShapeCorners` / `mapsFootprint` /
`mapsPlacedBox`, `mapsSnapTargets` / `mapsPlaceShape`, and
`mapsElevationStack` / `mapsStackTotals` / `mapsMoveSlot` /
`mapsElevationWrites`.

## The load-bearing decisions

**THE TYPED FIELD IS THE ONLY STORE OF THE VALUE, which is why a drag cannot
overwrite a dimension.** The canvas holds no position state: it renders `x`,
`y`, `outline` and `rotationDeg` handed down from the form's own typed inputs,
and a drag calls `onplace({x, y})` which the form writes back into those same
inputs. Typing 12 moves the shape and dragging types a number into the field --
one value, one place. The spec's rule ("anywhere the two disagree, the typed
value wins and the drag snaps to it") is therefore unrepresentable rather than
reconciled: there is no second value to disagree with. And the callback carries
an X and a Y and NOTHING ELSE, so no reachable pointer path has anything to
overwrite a width with. `tests/maps-placement.test.ts` asserts that
structurally -- `Object.keys(result)` is exactly `snapX, snapY, x, y` -- because
a rule enforced by a type is one a future edit has to work at to break.

**A NUDGE DOES NOT SNAP AND A DRAG DOES, and that split was forced by a
measurement rather than chosen.** The first version snapped both. The DOM test
then measured the consequence: nudging Workbench B down one inch from y = 12,
flush with Tool Chest A's top edge, came straight back to 12 -- the arrow key
appeared to do nothing, on the exact configuration (beside a neighbour) where
somebody is most likely to be nudging. The rule that came out of it is one rule
about where the imprecision is: a pointer lands somewhere approximate, so a snap
is the correction that makes it exact; an arrow key IS an exact number already.
Snapping stays reachable from the keyboard as its own control, which is also
what keeps "every drag interaction needs a keyboard path" true of the snap and
not only of the movement.

**SNAPPING SAYS WHAT IT SNAPPED TO, in words, every time.** `mapsPlaceShape`
returns the target and the edge (`leading edge onto the trailing edge of Tool
Chest A`) and the surface prints the whole sentence beside the value. A shape
that silently jumped 0.4in is a typed number somebody finds wrong later with no
way to know why. The candidates are every edge of every target against BOTH of
the moving shape's own edges, so flush-against and aligned-with are the same
arithmetic; the parent's walls are pushed first so a wall wins a tie, because a
wall is what somebody means when two candidates coincide. The tolerance is 7
PIXELS converted to inches, so the snap feels the same on a plan drawn small at
375px as on one drawn large at 1440.

**PARENT ASSIGNMENT IS NOT INFERRED FROM OVERLAP, and the surface says so where
the overlap happens.** Two shapes on top of each other are two things in one
room, which is an ordinary state of an ordinary room; making the lower one a
CHILD of the upper one would re-home an object because somebody dragged past it.
Reparenting stays the Inside picker, which is the control the schema's kind
ladder already constrains, and the sentence naming that sits under the canvas
rather than in a document.

**ROTATION IS APPLIED TO THE CORNER POINTS, NOT SPECIAL-CASED AT MULTIPLES OF
90.** `mapsShapeCorners` is one implementation that the canvas DRAWS and
`mapsFootprint` MEASURES -- a drawing and a snap computed from two ideas of
where the corners are is a shape that snaps somewhere other than where it looks
-- and the arithmetic is exact at any angle, so there is no branch to be wrong
at 37 degrees. Checked against the closed form: a rect turned 45 degrees has an
axis-aligned box of side `(w + h) / root 2`.

**REORDERING NEVER RETYPES A HEIGHT.** The array position IS the order and
`elevation_order` is derived from it at save time, so Move up carries the slot's
own typed inches with it. `mapsElevationWrites` is the whole save decision as
one pure function: it renumbers from position, carries every other content
column through untouched (`maps_publish` promotes a snapshot wholesale, so a
write that dropped a subtype would publish a compartment without one), and
returns ONLY the rows whose content actually changed -- so a rename writes one
row rather than the whole stack.

**BATCHING THE PRESS DOES NOT BATCH THE RULE.** One Save writes every changed
compartment and each goes through `mapsSaveObject`, the one write decision all
five maps forms share: a draft row is updated in place, a PUBLISHED one has its
edit staged as a pending revision. Draft-per-object (spec 4.3) therefore
survives a stack-shaped press, and the panel says in words that a published
stack has not moved for the public yet -- because somebody who reordered a
public toolbox and walked away should know that.

**THE DRAWING IS PROPORTIONAL, AND WHERE IT CANNOT BE IT SAYS SO.** One scale
for the whole stack, capped so a two-drawer chest does not fill the pane. A slot
whose drawn height would fall under the legibility floor is drawn AT the floor,
which is the one case where the drawing stops being to scale -- so
`maps-elevation-floor-note` names those compartments and tells the reader to
read the inches rather than compare the boxes. The first version applied the
floor silently and the browser probe measured the cost: the two fixture drawers
came back at 22px and 30px for typed heights of 3in and 5in, a drawn ratio of
0.733 against a typed 0.600, which is a drawing that lies about the thing it
exists to show.

**THE DRAWN SHAPE IS UNDER 44px ON PURPOSE, AND IT IS NOT THE CONTROL.** A 72in
bench in a 400in room is 72/400 of the pane whatever anybody would prefer;
inflating it to clear the tap floor would make the plan lie about its dimension.
That is CLAUDE.md's locked-density exception, taken deliberately and stated in
the spec file rather than passed over: every control that MOVES the shape -- the
five pad buttons, the two step radios, the typed inputs -- measures at or above
44px, so the floor is met by the interface instead of by distorting the drawing.

## The fixture gained a node, and the reason is a check that could not fail

`Workbench B` (a 72x30 unit at 120, 12 in the Machine Shop) is new. Snapping has
nothing to snap to in a room holding one object, so every placement check would
have been measuring the WALLS alone -- which is exactly the case that stays green
when sibling snapping is broken. Unrotated on purpose: the rotated chest and the
square-on bench are the two footprint shapes the arithmetic has to get right.

Tool Chest A also moved, from x = 12 to x = 30. Rotation is about the shape's own
position origin, so a 30x18 chest turned 90 degrees occupies `position - 18 ..
position`: at x = 12 it hung 6in outside the west wall and drew half off the plan
the moment there was a plan to draw it on. 30 is the smallest x that clears the
wall exactly. The tree count moved 7 -> 8, so `tests/maps-editor-render.test.ts`
and `routes/maps-edit.mjs`'s counts moved with it (both were floors and would
have passed unchanged, which is why they were corrected deliberately rather than
left to pass).

## Measured

**`npx svelte-check`: 0 errors, 37 warnings**, breakdown 31
`state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class` -- the baseline in `CLAUDE.md`, unmoved, re-derived
after `npx svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders
exported first. Two errors and one extra warning were introduced and fixed on the
way: a `parent` narrowing in the canvas template, `MapsNodeContent` against
`mapsSaveObject`'s deliberately untyped record, and an init-time `unit.id` read
that needed `untrack` the way every other deliberate capture in this subsystem
has it.

**`npm test`: 217 files, 4462 tests, all passing**, 181.1s.

**`npm run verify:browser`**, this container's Chromium 141.0.7390.37: the two
maps placement specs measured **98 measurements over 4 route/width runs, 0
outside threshold**, and the whole suite **1076 measurements over 88 route/width
runs, 4 outside threshold** in 207.1s -- none of the four in maps (see below).
`--selftest`: 64 controls, 32 negative and 32 positive, 0 instrument failures.

The numbers that answer the brief's own list, at 375px and 1440px both:

- **A typed height changes the rendered compartment and a drag does not change a
  typed dimension.** The drag probe reads width, depth and rotation before and
  after a real `PointerEvent` sequence at the shape's own measured box:
  `["width held","depth held","rotation held","x moved"]`. The last element is
  the positive control -- a drag that did nothing would hold all three
  dimensions too.
- **Snapping lands on the value it claims, measured.** Dragging the bench so its
  leading edge wants 28.5in -- 1.5in short of Tool Chest A's trailing edge at 30
  -- lands the typed field on exactly `"30"` and the readout on `named the
  edge`. The pixel delta is computed from the frame's own measured width inside
  the probe, so the same inch value is tested at both viewports rather than the
  probe silently drifting to a different one.
- **The stack is drawn in proportion to the typed heights.** Typed ratio
  `0.600` (3in over 5in), drawn ratio `0.600`, `both drawn`.
- **A reorder retypes nothing.** `Drawer 1|3 / Drawer 2|5` becomes `Drawer 2|5 /
  Drawer 1|3`.
- **Keyboard reaches the drag.** `["shape focusable","1","1"]` -- the shape takes
  focus and two arrow keys move X and Y by exactly one inch each.
- **The inch inputs do not overflow at 375px**, which is this surface's own past
  defect: `0px overflow (scrollWidth 375 vs clientWidth 375)` on both new states,
  with the six elevation inputs measuring `287.9x44` smallest.
- **Tap targets:** nudge and snap controls smallest `48.1x44`, step radio labels
  `44.8x44`, Move up / Move down / Open `91.4x44`, elevation inputs `287.9x44`
  -- 0 under 44px in every set. The drawn shape is the stated exception above.
- **Contrast**, read back off a canvas against the real rendered ground, worst
  measured across the two specs: elevation slot labels **5.88:1**, the typed
  inches inside a drawn box **6.26:1**, the placement rule copy and the
  nudge-step legend **6.91:1**, the snap readout **11.34:1**, the compartment
  name in its box **11.34:1**, the live X/Y readout **14.22:1**. All above 4.5.
- **0 console errors** on both states at both widths.

Harness limits apply as documented and belong beside these numbers: web fonts do
not load, so text is measured in the fallback stack and every PIXEL figure is
approximate (contrast is not -- colour is resolved by painting and reading the
pixel back); `prefers-reduced-motion` stays `no-preference`, and nothing in
either component animates.

## The negative controls

Two, each restored from a scratch copy taken BEFORE the mutation -- never `git
checkout --`, which is a discard-to-HEAD that would have taken this session's
whole uncommitted tree with it -- then md5-verified and re-run green.

1. **A drag overwrites a typed dimension** (`acceptPlacement` also writing
   `rectW`), which is the defect the whole bundle is written against. It
   reddened `tests/dom/maps-plan-canvas-mount.test.ts` (2 failed / 6 passed) AND
   the browser probe, which reported the mutation concretely rather than as a
   bare fail: `["width MOVED 72->159.82","depth held","rotation held","x
   moved"]`, **1 of 21 measurements outside threshold** on that route/width --
   the one-measurement-moves property that makes a control worth anything.
   Restored: md5 `05a009f5bebbcb6d39db6096b46be959` both sides, 8/8 green.
2. **A reorder retypes the heights** (`mapsElevationWrites` taking the height
   from the stored slot at that INDEX rather than from the row that moved).
   Reddened exactly 3 of 37: the writes oracle, the cleared-height case, and the
   save-path mount that reads what the transports actually received. Restored:
   md5 `172b925c26f85b5018173f543620f6b2` both sides, 37/37 green.

## The absence rows, and their controls

Every "must be absent" row added here sits beside a positive control for the
same selector, because `present 0` reads the same whether the rule holds or the
markup was renamed:

- no plan canvas and no elevation with nothing selected, against 1 of each on
  `?state=place` and `?state=unit`;
- no elevation ROWS on a unit with no compartments, against 2 on `?state=unit`;
- no elevation at all on a ROOM, against the plan canvas being present in the
  same read (so the zero is about the elevation and not about the pane failing);
- no shape on a top-level building (nothing to place it against) with the reason
  rendered in its place, against 1 shape on the placed unit;
- no floor note on `?state=unit`, which is also the row that would say first if
  a fixture height ever dropped under the legibility floor and quietly made the
  proportionality probe untrue.

## Not verified

- **The live Supabase project.** No write, publish or load here touched
  production; the transports driven in every test are the harness's in-memory
  ones, which mirror 0161's refusals.
- **A signed-in browser session on `/maps/edit`.** It needs a Bosco Tech admin
  account no automated run holds. The harness mounts the identical
  `MapsEditor`, so what is unverified is the route's own load and RLS, which
  `tests/maps-editor-route.test.ts` and the RLS bundle cover in the db fixture
  instead.
- **A real finger and a real trackpad.** Every drag measured here is a
  synthesized `PointerEvent` sequence. Pointer CAPTURE in particular is
  exercised only through its failure path: `setPointerCapture` throws
  `NotFoundError` for a pointer id the browser does not consider active, which
  is every synthetic event, so the call is wrapped and the drag proven to work
  WITHOUT capture. That a real drag continues correctly when the pointer leaves
  the small shape is the one behaviour no run here has seen.
- **Photo capture, the public viewer, search UI, DXF import**: other bundles.

## Two findings that are not this bundle's, reported rather than fixed

The full `verify:browser` run reports 4 measurements outside threshold, all four
outside maps, each seen at both widths:

- `/dev/pathways`: the two harness controls at `194.7x26.2px`, under the 44px
  floor. Already in the harness README's known list.
- `/dev/foundry-submit`: the preflight sentence sweep measures `present 2,
  visible 2` where it states `exactly 4`. This one was NOT in that list and is
  now. It is on `main`: nothing in this branch's diff is reachable from that
  route (the diff is `src/lib/maps`, the maps harness fixture, one maps test and
  two maps route specs, and there is no maps import anywhere under
  `src/lib/foundry`). Fixing a foundry preflight rendering claim is that
  surface's own bundle, not a side effect of a maps one.

`tools/browser-verify/README.md`'s three drifted counts were corrected in place,
which that file's own rule requires of a session measuring different ones: 36
specs -> **44**, 780 measurements over 72 runs -> **1076 over 88**, 184.7s ->
**207.1s**. The route count did not move (28), because `?state=place` is a fifth
STATE of `/dev/maps-edit` rather than a new route.

## What the schema made awkward (reported, not changed)

1. **Nothing enforces that a unit's compartments carry distinct
   `elevation_order` values.** There is no unique index on `(parent_id,
   elevation_order)` and no constraint tying the numbers to a contiguous run, so
   two compartments can both be slot 2 -- which a hand-written SQL insert, or the
   compartment's own detail form, can produce today. `mapsElevationStack` breaks
   that tie totally and deterministically (order, then name), so the STACK never
   flickers between two renders, and the editor renumbers 1..n on the next save;
   but a duplicate written elsewhere is not refused at the database. A migration
   closing it would need a partial unique index over compartments and an answer
   for the rows already stored -- which is a narrowing, with a count taken at
   apply time, and belongs in its own bundle.
2. **`position_x_in` / `position_y_in` have no stated frame convention in the
   schema**, only "positioned in the parent's frame" in 0161's comment. This
   bundle fixes one: the position is the shape's own ORIGIN corner and rotation
   is about that origin, which is what `mapsFootprint` implements and what the
   fixture's Tool Chest A was moved to satisfy. Nothing in the database says so,
   so a second client could read those columns as a CENTRE and be equally
   consistent with the schema. The cheapest fix is a comment on the columns, not
   a constraint; the real one is that `$lib/maps/maps.ts` is the only reader and
   stays that way.

Neither needs a migration for this bundle, and none was written.
