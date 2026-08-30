---
title: "The class page's bulk actions, units and item titles were all built and none of them were findable (`claude/classroom-discoverability-audit-zdw89v`, no migration)"
date: 2026-08-30
branches: [claude/classroom-discoverability-audit-zdw89v]
migrations: []
subsystems: ["Classroom", "Testing"]
---

The instructor asked for a way to group classroom posts so the irrelevant ones
compress and only the relevant ones stage. Every part of that already shipped:
units with create, rename, delete and reorder (0111, `UnitManager`), manual
ordering by drag and by the row menu, pinning, per-person persisted collapse
(`preferences.classroomUnits`), and bulk publish, bulk file-into-unit and bulk
delete. **The premise was verified before anything was written**, function by
function against the shipping source, and it held in full.

So the defect is not that the features are missing. It is that a manager who
does not already know they exist cannot find them, and this bundle is four
repairs to that, plus the harness and route specs that make the claims
measurable. **No migration, no new capability, no new write path.**

## What was actually wrong, measured against the pre-change file

The numbers below are from the pre-change `ClassView.svelte` served to a real
Chromium against this bundle's own fixture, with a behavioural marker
(`getComputedStyle('.row-title').flexWrap`) read first so a stale dev bundle
could not be mistaken for the baseline -- the `git stash` trap in CLAUDE.md, in
the shape where the file is swapped rather than stashed and restored from an
in-memory copy (md5-checked).

- The bulk bar rendered **only after the first tick**, so the checkbox column
  had nothing anywhere naming what it drove. Present at rest: 0.
- There was **no select-all of any kind**. A 22-row unit was 22 clicks.
- The row checkbox measured **18x18** -- under the 24px ABSOLUTE floor, on the
  control the whole feature starts at -- and the row's actions menu **32x40**,
  under 44 on the axis that had room and with no exception written for it
  anywhere.
- The crowded row's name measured **40px wide at BOTH 375 and 1440**: 7
  characters of a 121-character title. `.row-title` was `nowrap` with the name
  the only shrinkable child, so every chip took its width first, and the stream
  column is 356px at every width the pane ships at -- widening the page bought
  the name nothing.
- At 375px that same row **overflowed the document by 39px** (`span.chip`),
  which nothing had ever measured.

## The four repairs

**1. The bar is on screen before the first selection, in a resting state.** One
sentence ("Tick items to publish, file or delete several at once.") and one
control, with the filled surface and border dropped so a permanently-present
manager line does not read at the weight of the content under it. The ACTIONS
stay absent rather than disabled: five greyed controls above every class is the
clutter this is trying not to be, and a `disabled` control cannot explain itself
either. One slot, two states -- the sentence gives way to the count.

**2. Select-all is PER GROUP, plus one for the pane, and the pane's takes OPEN
GROUPS ONLY.** The scope decision is the load-bearing one. The selection SET
stays global to the pane (selecting Unit 1 then Unit 2 accumulates), because
"bundle multiple posts together" is a page-level ask and the existing model
already said so; the CONTROLS are per group because "publish Unit 2" is the
scope a teacher actually thinks in, and because a control that swept up a folded
unit would make the bulk-delete hazard -- "the person cannot see everything it
touches" -- the default rather than the edge case. A collapsed group's rows are
not on screen and neither control reaches them. `allSelected` is ONE predicate
driving both the label and the handler, the `reviewCanSend` convention: two
spellings of "is this set already selected" is what produces a control whose
word disagrees with what pressing it does. The partial-failure behaviour is
untouched and is now asserted rather than assumed.

**3. Units introduce themselves once, on the class where they would help.** A
card, rendered only when unit transports exist, the course has NO units, the
panel is closed and the class holds at least four items. It says what a unit is,
that it folds shut, and that it belongs to the course. The floor is a threshold
rather than "any items at all" on purpose: below it one list IS the right
answer, and a prompt recommending units then is advice to ignore, which is how a
first-run prompt trains somebody to skip the next one. **It self-terminates** --
the moment a unit exists it never renders again -- which is what makes it
onboarding rather than a banner, and why it is allowed a card while the resting
bulk bar is held to one line. The empty-unit copy was also wrong in a way nobody
would notice: it said to "pick this unit in a row's Unit box", and the Unit box
is inside the row's overflow menu, which the copy never mentioned. It now names
both filing paths and where each one is. **Filing did not move back onto the
row**; that decision stands.

**4. The title line wraps and the name clamps at two lines.** The fix is to the
ORDER the width is handed out in, not to the column. A short name still shares
line one with its chips and the row is the same two lines it always was; a long
one is the first item on the line, takes the full column, and the chips wrap
under it. `overflow-wrap: anywhere` is what keeps that against a single unbroken
token. Measured on the fixture, at 1440: the crowded name goes 40px/7 characters
to 227.3px/76, and **24 of 29 rows do not change height at all** -- only the
rows that could not be read pay a third line. The whole stream grows 1302.8px to
1425.9px (+9.4%).

At 375 the trade is steeper and is stated rather than buried: 1688.6px to
2248.3px (+33%), with 23 of 29 names on two lines, because the name only has
169px there. **The 375 cost was reduced by hiding the drag grip below 640px**,
which is correct on its own terms -- it initiates an HTML5 drag, which has no
touch equivalent, so it was a control nobody could operate sitting in the middle
of the row that identifies the item. That gave the name 134.3px -> 169px, 44
characters -> 55. Reordering stays reachable from the row menu's Move up / Move
down, which is already the keyboard and assistive-tech path.

**The density cost is the deliberate half of this.** The old rule optimised for
uniform rows and the comment said so; it bought that by making 23 of 29 titles
unidentifiable at phone width. Rows per screen is recoverable by scrolling, and
by the unit collapse this same bundle is making findable. A title you cannot
read is not recoverable at all.

## Tap targets, which were not the assignment and were in the way of it

`.row-select` 18x18 -> a 30x44 `<label>` (the browser hit-tests the label and
forwards the click, which is what a finger lands on); `.menu-trigger` 32x40 ->
32x44; the `pane-tools` controls 86.4x24 -> 86.4x44, beside a `.manage-link`
that had already taken the floor with its own comment, so one row had been
carrying two answers to the same question. **The widths stay 30 and 32 and take
the exception `.row-expand` already carries**: three controls sit within 5px of
each other and the row's whole body is a link to the same item, so a 44px-wide
box eats the target beside it. After: **0 controls under the 24px floor**, from
30.

Two of the new CSS rules measured 24px on the first pass because
`.cr-root .btn.tiny` pins a 24px chip floor and outranks a single-class rule --
the same reason `.bulk-bar` already spelled both classes. Written down beside
both new rules.

## The harness, and the one existing spec this broke

`/dev/classroom` gained `class-bulk` and `class-bulk-student`, mounting the real
`ClassView` against a **self-contained store**
(`src/routes/dev/classroom/bulk-fixture.svelte.ts`) rather than more rows in the
harness's shared arrays: 29 items over a 22-row unit, a 4-row unit, an EMPTY
unit and three unfiled would otherwise have changed the People tab, the grading
console, the admin list, the composer's posting checklist and the route specs
already driving them. Its `setPublished` refuses an item posted to a section the
teacher does not manage, mirroring the RPC -- so "a partial bulk failure leaves
the failures selected" is a measurement of a real refusal rather than of a flag.
The `bulkUnitsExist` toggle is the state the global `unitsApplied` one cannot
give: units APPLIED and this course has none, which is the only state the prompt
renders in and is what every class looks like before its first unit.

Four route specs: the resting state, the selected state (the partial failure),
the no-units state, and the student positive control.

**`classroom-split-s-1-manage-1.mjs` had to change, and the way it broke is
worth knowing.** Its prepare step clicked a row checkbox with
`until: !!document.querySelector('[data-testid="bulk-bar"]')`. The bar now
exists at rest, so `clickUntil`'s documented pre-click short-circuit fired,
**the click never physically happened**, and both tap-target rows reported "0
matched" -- a green-looking spec measuring nothing. The predicate is
`bulk-count` now, which exists only while something is selected. Its drag
`orderResult` had also been failing at one width for the same reason (the
short-circuit returns with no retry gap, so the drag ran before hydration); both
widths pass now.

## Measured

- `svelte-check`: **0 errors, 37 warnings**, breakdown 31/5/1, unchanged.
- `npm test`: **208 files, 4333 tests, all passing.**
- `npm run verify:browser`, whole run: **66 route/width runs, 662 measurements,
  2 outside threshold**, both the documented `/dev/pathways` harness-control
  finding (194.7x26.2). The README's known-findings paragraph is corrected in
  this change: it claimed 6 over 58 runs, and `/dev/coin-preview` (now 352x44)
  and `/dev/short-links` (now 112.8x44) no longer reproduce.
- Contrast, measured by painting: resting sentence **7.63:1**, per-group
  select-all label **14.96:1**, item title **15.42:1**, prompt heading
  **8.26:1**, prompt copy **7.27:1**, the refusal sentence on the selected
  state. All against 4.5.
- Horizontal scroll **0px** at 375 and 1440 in every state, against **39px** on
  the pre-change file at 375.
- Student positive control, same fixture, both widths: **0** bulk bars, resting
  sentences, select-alls, row checkboxes, hit areas, row menus, grips, Units
  controls, prompts and New post controls, against **25 rows and 3 group
  headers** rendering -- 25 not 29 because a student's read carries no draft,
  3 not 4 because an empty unit is a heading over nothing for them. Both
  positive halves asserted so the absence counts cannot be a page that failed
  to render.

## Not verified

- **Nothing was run against the live Supabase project.** No migration, no RPC
  call, no signed-in session. Every measurement above is the dev harness in
  headless Chromium.
- **Web fonts do not load in the harness** (the proxy resets
  `fonts.googleapis.com`), so every pixel figure here is in the fallback stack
  and is approximate. Contrast is unaffected -- it is read by painting.
- **`prefers-reduced-motion` was `no-preference` throughout.** Nothing in this
  bundle animates, but that state was not exercised.
- **No Vercel preview.** Deployments were rate limited for the day; the
  in-container browser pass is the verification for this bundle.
- The real `/classroom` page was never opened -- it needs a Bosco Tech Google
  session no automated run holds.

## Deliberately not done

- **A thumbnail column on the row.** Out of scope by instruction, and it would
  change the width budget item 4 is about.
- **Filing back onto the row.** It was moved off deliberately and that stands.
- **Raising `.row-expand`, `.row-grip` or the menu trigger to 44px WIDE.** The
  row exception is real and written down; widening them steals the target
  beside them.
