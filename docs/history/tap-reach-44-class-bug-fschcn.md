---
title: "A class that promised 44px, a probe that took its word for it, and every surface that trusted both (`claude/tap-reach-44-class-bug-fschcn`)"
date: 2026-09-05
branches: [claude/tap-reach-44-class-bug-fschcn]
migrations: []
subsystems: ["Browser harness", "IDEA Classroom", "Portal shell"]
---

Prompt 0044. No migration. One instrument rewritten, one CSS precondition written down,
three measured violations closed on the surface that owns them, and three more found on
surfaces that do not and routed to a decision entry.

## The base

Started from `origin/integration` at `fc46b6a`. The container's git already carried a
committer identity, so the "Please tell me who you are" failure the prompt warns about
did not arise. No `docs/prompt-ledger/entries/0044-*` at HEAD.

## A1: the rule is right and the call site was not

`.tap-reach-44` is `src/app.css`, and it is two rules: `position: relative` on the
control, and an `::after` at `top: 50%; left: 50%` translated back by half itself,
sized `max(100%, var(--tap-reach-w, 44px))` by `max(100%, 44px)`. Read on the page
rather than off the file: on `/dev/spec-table?empty=1` the info-tip trigger's `::after`
computes **exactly `44px` tall**, `pointer-events: auto`, translated `-22px`. The rule
does what it says.

**What breaks it is a clipping ancestor, and the class could not see one.** An
absolutely-positioned box whose containing block is the control is clipped by every
ancestor whose `overflow` is not `visible`. `SpecRenderer`'s `.table-scroll` declares
`overflow-x: auto`, which forces `overflow-y` to `auto`, and the trigger sits in the
`<thead>` on that box's own top edge -- so the top half of its reach was cut off.

Measured, both widths, hit-tested rather than computed:

| | 375 | 1440 |
| --- | --- | --- |
| trigger box | 124.4 x 32.8 | 140.7 x 16.4 |
| `::after` computed | 44px tall | 44px tall |
| walked reach | 42.5 | **34.5** |
| walk up / down | 21 / 21.5 | **13** / 21.5 |

`elementsFromPoint` at 14px above the 1440 centre returns `div.disc-body` and the
button is **not in the stack at all** -- the pseudo-element is not there to be hit.

**The causal test, rather than the explanation.** Injecting
`.table-scroll { overflow: visible !important }` and changing nothing else returned the
walk to **44.0 at both widths**. So it is neither a specificity loss (prompt 0025's
case) nor a missing call-site variable: the mechanism was right, one ancestor clipped
it, and nothing anywhere reported that.

It is the same clip that put `InfoTip`'s PANEL on `position: fixed`, which that
component's own header describes in detail. The panel got the escape; the reach never
did, and a pseudo-element cannot take it -- there is no JavaScript to write it two
coordinates.

## A2: every user of the class, walked

19 declarations across 8 components. A hit counts the control, something inside it, or
a `<label>` that activates it -- never a plain ancestor. Offscreen controls were
scrolled to the middle of the window first, which the old measurements did not do.
375 and 1440 gave identical numbers everywhere, so one column serves both.

| Component | Declarations | Student-facing under 2.12 | Walked reach | |
| --- | --- | --- | --- | --- |
| `ProfileMenu` `.pm-trigger` | 1 | yes (69 pages) | 45 | ok |
| `SongQueue` `.sq-link` | 4 | yes | 45, all 20 mounts | ok |
| `AttachmentList` `.attach-name`, `/dev/classroom-images` | 1 | yes | 45 | ok |
| `AttachmentList` `.attach-name`, packed item page | (same) | yes | **41.5**, 1 of 2 | UNDER |
| `MapsBreadcrumb` | 2 | public viewer | 45, all 5 crumbs | ok |
| `ClassroomShell` breadcrumbs | 1 | yes | 45 | ok |
| `NotebookView` `.inline-link` | 7 | yes | 45 tall; **32.5 wide** on 1 | UNDER (width) |
| `FolderManager` `.swatch` | 2 | yes | 45 tall; **25 wide**, 7 of 7 | UNDER (width) |
| `InfoTip` `.info-tip-trigger` | 1 | yes | **34.5 / 42.5** | UNDER (fixed here) |

Only `InfoTip` was inside this bundle's ownership. The other three are decision entry
12, with their numbers and an owner, because 2.12 says a measured violation does not get
to be a number in a report.

**Two of those three are the width knob rather than a clip, and that is a conflict its
own documentation never resolved.** `--tap-reach-w: 0px` is correct for seven swatches
in a row and for a toolbar of links side by side -- overlapping reaches hand the tap to
the wrong control -- and the result is still 25px and 32.5px against a 44px floor. The
third is the same overlap happening VERTICALLY: an attachment row's reach is taken by
the next attachment row's, on a mount where the rows sit closer than 44px apart. The
identical component measures 45 clean on `/dev/classroom-images`, so it is spacing at
that mount rather than the component.

## A3: what the probe was measuring, which was the class name

`tapReach` in `tools/browser-verify/checks.mjs` did not measure the reach. It
RECONSTRUCTED it: `reachH = Math.max(ownHeight, 44)`, `reachW = Math.max(ownWidth,
--tap-reach-w)`. So **`reachH` was 44 by construction** for every control the CSS pair
applied to, and the `under` gate could only ever fire on the width.

It also hit-tested five points, and that could in principle have contradicted the model
-- except that `hitsSelf` read `hit === el || el.contains(hit) || hit.contains(el)`, and
**the third term is true for every ancestor.** Those are exactly the elements a clipped
reach falls through to. Measured directly on the unfixed page at 1440: at 14px and 16px
above the trigger's centre the top element is `div.disc-body`, `hit.contains(el)` is
`true`, and the sample counted as a hit on a point where a finger presses nothing.

Put the OLD probe at the known-broken control and it says so itself:

- **375: `withinThreshold=true`**, `smallest reach 124.4x44 ... 0/4 reaches under 44px,
  0 tap(s) stolen`. A clean pass on a control delivering 42.5.
- **1440: `withinThreshold=false`**, 2 stolen. It caught this one **by luck**: the
  element 22px above happens to be `button.disc-trigger`, a SIBLING, which the ancestor
  clause does not cover. Had the markup put an ancestor there, as it does at 14px, 1440
  would have read clean too.

Prompt 0029's fix to the `--tap-reach-w` zero SURVIVED and is untouched -- `parseFloat`
with an explicit `Number.isFinite` check, distinguishing absent from zero, with the raw
declared string carried in `reachWDeclared`. That half was right.

**No route spec pointed at the info-tip at all**, which is the other half of why nothing
reported it: six `tapReach` rows across five route files, none of them this control.

## A4: 2.12's order, restated

The conflict is never between the target and the container: the container is a property
of the surface, and the number of controls in it is a choice somebody made without
measuring. So, reporting numbers at each step tried --

1. **Re-lay the controls in the space that is already there.** Arithmetic, belongs to
   whoever is measuring, costs row height, stated as a number.
2. **Carry fewer controls.** Changes what the surface can do, so it goes to the
   surface's owner rather than being taken inside the bundle that found it.
3. **Widen**, only where nothing else measured pays, and never at the narrow width.
4. **An exception**, which is a decision entry with an owner and a date.

And separately: a measured violation ends in one of three ways -- fixed, an exception
with an owner, or handed on with a phase. Writing the number in a report is not a fourth.

## A5: the counts block before

`sha 5aa1e22`, `dirty: false`, **198 runs, 2846 measurements, 0 outside**,
`outsideRows: []`. `5aa1e22` is prompt 0043's own commit, so the block does reflect the
two rows it closed rather than predating them. Its 198 against the static block's 202 is
the documented stale-but-honest state: two specs were added after that measurement.

## B1: the class keeps its name

**It can deliver 44 at every call site** -- proven, because removing the one clip
returned it to 44.0 with nothing else changed, and because 12 of the 13 measurable
declarations already did. So the name is not a lie; what the class lacked was a stated
precondition and any way to notice it had been violated. Renaming it would have recorded
one call site's mistake in the name of the mechanism.

`src/app.css` now carries the precondition -- nothing may clip within 22px of the
control's centre -- with the measured case, the causal test, why `position: fixed` is
not available to a pseudo-element, and a line saying to point a route spec at a new call
site rather than reading the reach off the class name.

## B2: the probe measures geometry

`tapReach` WALKS the hit area outward from the centre in four directions and gates on
that alone. Four things fell out of building it, all measured rather than reasoned:

- **A hit is the control, a descendant, or an activating `<label>`.** The label case is
  not a softening: clicking a label activates its control, so the label's box IS the
  target, which is what lets a 13x13 checkbox be measured at the 44px label around it.
- **The walk reports the FIRST MISS, not the last hit.** A box occupies a half-open
  interval, so a sample at its far edge belongs to the next element: last-hit reported
  **43** for the selftest's own fixture of the real rule pair, and failed a control that
  is correct. First-miss gives 44.0 there. `WALK_STEP` is 0.25px so the over-credit that
  buys is at most 0.5px on a 44px floor; at 0.5px a 43.4px reach reported a clean 44.
- **The cap is per direction and the floor is read off the TOTAL.** Five healthy
  controls all walk 22.5 one way and 22.5 the other after the first-miss change, but
  before it they walked 22.5 and 21.5 -- the control's centre lands on a fraction of a
  pixel and the two edges resolve half a step apart. A per-side cap of `min / 2` would
  have failed every passing call site in the repo.
- **The check SCROLLS and puts every scroll back.** This is the one place it departs
  from the harness's never-scroll rule, and it departs because a hit test cannot be taken
  on a point outside the window. `/dev/classroom-images` is the case: four attachment
  links below 900px at both widths, previously five offscreen points and a pass on the
  model. `behavior: 'instant'`, because `src/app.css` sets a global smooth scroll. The
  whole scroller chain is recorded first and restored last.

`reachW`/`reachH` KEEP their reconstructed meaning and their names, because
`selftest.mjs` -- which this bundle does not own -- asserts on them to test the
`--tap-reach-w` parsing, and that parsing is still worth asserting. The walked values
are `walkedW`/`walkedH` and they are the only thing the gate reads. Both are in the
sentence, so a reader can see the two disagree; the difference is the clip.

### B2's controls

**The required positive control, on the real surface.** New probe, unfixed tree,
`button.info-tip-trigger.tap-reach-44` on `/dev/spec-table?empty=1`:

| | old probe | new probe |
| --- | --- | --- |
| 375 | `withinThreshold=true`, "0/4 under 44px" | **`false`**, "4/4 reaches under 44px", walked 42.5 |
| 1440 | `false`, 2 stolen taps | **`false`**, "4/4 reaches under 44px", walked 34.5 |

It reddens, and at 375 it reddens where the old one certified. `blockedBy` names
`div#disclosure-s1`, which is the clip.

**And the instrument's own controls.** `npm run verify:browser -- --selftest`:
**70 controls (36 negative, 34 positive), 0 instrument failures.** It took three
iterations to get there and every one of them was the selftest catching a real defect in
my rewrite -- the per-side cap, the last-hit reporting, and the viewport clamp on a
40px-tall fixture. A check that has never failed has not been tested, and this one
failed four times before it passed.

**One diagnosis of my own that the instrument corrected.** A standalone script measuring
`.pm-trigger` on `/dev/pathways` reported `0x0`, covered by `div.pwp-overlay`. That is
the first-login picker's modal scrim, and it is correct behaviour -- the real spec
dismisses it in `prepare` and my script had skipped that. Run properly the control walks
**45.5 x 45**. The finding was my instrument's omission, not the page's.

## B3: the checkbox and the textarea, worked through 2.12

Both reached **step 1 and stopped there**; steps 2, 3 and 4 were not needed.

**`textarea.cell`.** Measured 33px tall at both widths, over the 24px absolute floor and
under 44, on a student assignment surface declaring no density class. Step 1 asked what
space is already there, and the answer is: all of it. The row is 98.3px tall because of
the 2x2 row-action grid prompt 0043 put beside it, so a 44px cell fits inside height that
already exists. `min-height` and not `height`, so the `autoresize` action can still grow
the box for a long answer -- it writes `style.height` inline and a stylesheet
`min-height` only ever clamps upward.

| | before | after |
| --- | --- | --- |
| cell box, 375 | 96 x 33 | **96 x 44** |
| cell box, 1440 | 241.5 x 33 | **241.5 x 44** |
| row height | 98.3 | **98.3** |

**The checklist checkbox.** The input is 13 x 13 inside a `label.check-item` measuring
293 x 23 at 375 and 1358 x 23 at 1440, hit-tested 24px tall -- under 44, and within half
a pixel of the 24px absolute floor at the place `CLAUDE.md` says to measure it. Step 1
again, and again there is no conflict to resolve: the items are a vertical stack in a
card with the full measure to themselves, so nothing competes for the height.

The input is **left at 13 x 13 deliberately**. `CLAUDE.md` is explicit that a small input
inside a 44px label is fine, because the label activates the control -- and the
hit-tested reach through the label is what proves the two are one target rather than two
nested things. Padding rather than `min-height`, so a one-line item's words stay centred
in the row instead of pinned to the top of a 44px box with 21px of blank label beneath.
`align-items: flex-start` is kept, so a wrapped item still lines its checkbox up with its
first line.

| | before | after |
| --- | --- | --- |
| label box, 375 | 293 x 23 | **293 x 44** |
| label box, 1440 | 1358 x 23 | **1358 x 44** |
| input walked through its label | 24 tall | **51.5 x 45.3** |

**The info-tip.** 0.7rem of padding on `.table-scroll`, which is the clipper. The
arithmetic: the reach needs 22px above the trigger's centre, which sits at (this padding
+ the `<th>`'s 4px + half the trigger's own height); the single-line trigger is 16.4px
tall, so 12.2px was available. 11.2px takes it to 23.4. Padding-top only -- the bottom
needs nothing, because the last row's controls are 44px BOXES rather than reaches, and
padding-bottom would only push the horizontal scrollbar away from the table it scrolls.

## B4: the row-height cost, which is none

Prompt 0043 took the row from 40.4 to 98.3 and said plainly it took that trade itself.
**This bundle adds nothing to it.** Measured after all three fixes, `?empty=1`, one row:

| | 0043 left it at | after 0044 |
| --- | --- | --- |
| table row height | 98.3 | **98.3** |
| row-ops column, 375 / 1440 | 100.0 / 102.4 | **100.0 / 102.4** |
| table `scrollWidth` at 375 | 628 | **628** |
| document horizontal overflow | 0 | **0** |

What did grow, stated rather than described:

- **The table wrapper: +11.2px**, once per table, from the scroller's padding.
- **Each checklist item: 23 -> 44, +21.1px.** A two-item list goes 51.6 -> 93.6.

The cells cost nothing at all, which is the whole reason step 1 answered them.

## B5: the counts block after

`npm run verify:counts`: static region already current, nothing written.

`npm run verify:readme` on a clean tree with the port guarded:
**202 route/width runs, 2944 measurements, 0 outside threshold**, 485.1s, on `4e245ed`,
`dirty: false`.

Compared to A5 **by identity**: `outsideRows` was `[]` and is `[]`. Runs 198 -> 202,
which closes the stale gap 0043's entry named -- the measured half now agrees with the
static block's 202 rather than trailing it by two specs. Measurements 2846 -> 2944, +98,
which is the four new spec rows plus the reach rows now measuring 20 song-queue links and
4 attachment links that used to be reported offscreen.

## B6: suite and check

`npx svelte-kit sync && npx svelte-check` with the two `$env/static/public` placeholders
exported first: **0 errors, 37 warnings** in 20 files, breakdown
**31 `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`**.
Baseline held on both numbers and on the mix.

`npm test`: **268 files, 5559 tests, all passing**, 266.16s. Started 2026-09-05 08:54:18
PDT, finished 08:58:46 PDT (America/Los_Angeles).

## What this bundle reclassified

**Every `.tap-reach-44` control in the repository was unmeasured, and six harness rows
across five route files reported four of them as passing.** The rows were real rows
against real selectors; what they reported for the height came from `max(ownHeight, 44)`,
which is the class name by way of the stylesheet. The other four components carrying the
class had no row at all, and three of those four turn out to hold a control under the
floor.

They are measured now. The four that had rows all pass on walked numbers.

## Not verified

- **Nothing was run against the live Supabase project.** No migration, no RPC, no
  signed-in session; the local stack was not started and this bundle needed none.
- **`/dev` routes only.** The spec table as a student meets it -- inside `ClassSplit`'s
  detail pane on a real class page -- was not measured, because that needs a Bosco Tech
  Google session. The checklist's new height inside a narrower pane is unmeasured.
- **Web fonts did not load.** The harness blocks every non-loopback request, so
  `fonts.googleapis.com` is reset and every box here is measured in the fallback stack.
  `prefers-reduced-motion` was `no-preference` throughout, so that path was not
  exercised.
- **`--break` was not extended.** `run.mjs` is outside this bundle's ownership, so the
  probe's positive control is the real surface before the fix rather than an injected
  preset. `--selftest` covers the instrument.
- **The three decision-12 findings were not put in front of Mr. Pina.** Two of them trade
  a measured floor against a width knob another bundle documented as correct, which is a
  judgement rather than arithmetic.

## Left standing

- **`docs/decisions/entries/12-tap-reach-under-floor-three-surfaces.md`**, open, with the
  numbers and the component for each of three controls under the floor. None has a
  harness row, so the full run is still 0 outside threshold; that is exactly why they are
  written down somewhere with an owner instead.
