---
title: "A textarea mounted inside a collapsed module fitted itself to a zero box and never corrected, so a third of a busy table hid a student's own writing (`claude/collapsed-cell-autoresize-4hmx4n`, no migration)"
date: 2026-09-05
branches: [claude/collapsed-cell-autoresize-4hmx4n]
migrations: []
subsystems: ["IDEA Classroom", "Browser harness"]
---

Prompt 0051. No migration, no database, no new dependency. One guard and one shared
observer in `SpecRenderer.svelte`'s `autoresize` action, a browser route turned from a
reporter into a gate, and two test files.

Started from `origin/integration` at `ce89809`. Working directory `/home/user/idea-app`.
`git` already carried a committer identity (`Claude <noreply@anthropic.com>`), so the
failure the prompt warns about did not arise and nothing was set. The duplicate check ran
first: no `docs/prompt-ledger/entries/0051-*` at `origin/integration` or `origin/main`.

## The defect

`Disclosure` hides a collapsed region with `display: none`. A module arrives collapsed
when it is COMPLETE (`collapseWhen={complete}`), which is every module a student has
finished. `use:autoresize` ran `fit()` once at mount and then only on `input`; inside a
hidden region `el.scrollHeight` is 0, so it wrote `height: 2px` -- the zero plus the 2px
border allowance -- and nothing ever re-ran it. Opening the module left every cell at
`.cell`'s `min-height: 44px` floor with `overflow: hidden` over content taller than that.

Measured at 375px on `/dev/spec-table?rows=12`, warm server, three consecutive passes with
identical numbers:

* all 60 cells carried the inline `height: 2px` written at mount, `scrollHeight` 0 for
  every one of them while hidden;
* after opening the module, still `2px` on all 60, and **19 of 60 cells clipped**, worst
  118px of content in a 42px box (76px of writing off screen);
* **0 of 60 under the 44px tap floor.** This was never about reach.

At 1440 the same page clips 1 of 60, worst 11px, because the columns are wide enough not
to wrap. The defect is a phone defect.

## What a student experiences, which is the half that decides the severity

`.cell` is `overflow: hidden`, so there is no scrollbar and no gutter (measured:
`offsetWidth - clientWidth` is 0 after the borders). A wheel over the cell moves nothing
(measured: `scrollTop` 0 after a 200px wheel). The text is reachable ONLY by putting the
caret in the box and moving it with arrow keys, which scrolls the textarea's own scroll
box to the full 76px -- an interaction a phone does not have. And the moment a student
types anything the `input` handler refits that one cell, so the case that stays broken is
precisely READING BACK work already written.

So: not a cell that scrolls, and not a cell that reveals itself on focus. A cell that is
silently cut off, with no cue that anything is missing, on a graded assignment. That is
what settled the fix as required rather than cosmetic.

`.answer` (the free-text field) shares the action but is not in this state in the fixture,
and would degrade better if it were: it carries `overflow-y: auto` and a `max-height`, so
it genuinely scrolls.

## The fix, and the two mechanisms that were rejected

`fit()` gained a guard -- a box with `clientWidth === 0` is not measured, so no fictional
height is written -- and the action now shares ONE `ResizeObserver` per renderer across
every autoresized textarea, keyed through a `WeakMap`, refitting a box when it appears.

`clientWidth` and not `offsetParent`: a zero WIDTH is what makes the wrap and therefore
`scrollHeight` a fiction, it is 0 for a hidden box and never 0 for a shown one (`.cell`
carries `min-width: 6rem`), and `offsetParent` is also null for a perfectly visible
`position: fixed` box.

The two alternatives, priced and rejected:

* **An effect keyed to the disclosure's open state.** Not available. `Disclosure` LATCHES
  that state inside itself (prompt 0018), so `collapseWhen` says only how the module
  arrives and `SpecRenderer` genuinely cannot know whether the region is open. Reaching it
  means changing `Disclosure`, which this bundle does not own.
* **Refitting on focus.** Fixes the cell only once a student taps it, which is the one case
  the `input` handler already covers, and does nothing for reading back existing work --
  the defect itself.

A `setTimeout` after the press was never a candidate: it is a race that loses on a slow
phone, and this repository has rejected that shape twice (0012, 0018).

**It cannot loop, and that is a property of `fit()` rather than a guard bolted on.**
`fit()` writes HEIGHT; a second delivery recomputes the same string, so the box ends that
frame at the height it started and an observer reports nothing when nothing moved. The
intermediate `height: auto` is never observed on its own because deliveries batch at the
end of the frame and the callback is synchronous. Measured: 0 console errors on the run,
so no undelivered-notification loop, and three further close/open cycles left the count at
0 clipped.

**It also closes a second, quieter case that was always open**: a cell whose WIDTH changes
-- a phone rotating, a pane resizing -- rewraps and used to keep the height it was fitted
to. Same defect, same mechanism, no extra code.

## What it costs per cell

Measured in Chromium on `/dev/spec-table?rows=12` at 375, with the `ResizeObserver`
constructor wrapped to count:

* **2 observer instances for the whole page**, one per mounted `SpecRenderer`, against 62
  autoresized textareas. Not 62 observers.
* Opening the module: **2 callback deliveries, 79 entries** across 60 cells -- about 1.3
  entries a cell for the whole transition.
* Three further close/open cycles: 11 deliveries and 502 entries in total, still 0 clipped.
  It converges rather than accumulating.

So the per-cell cost is one observation record and one weak-map entry, plus roughly one
observer entry per visibility change. There is no per-cell object with its own callback
queue, which is the shape a table of sixty boxes makes expensive.

## The page cost

At 375, `/dev/spec-table?rows=12`:

| | table height | per row | top of table to Add row |
| --- | --- | --- | --- |
| before, as a student saw it (cells clipped) | 658.8px | 54.9px | 709.1px (1.06 screens) |
| after | 822.3px | 68.5px | 872.6px (1.31 screens) |
| prompt 0048's recorded figure | 822.3px | 68.5px | 872.6px (1.31 screens) |

**Against 0048's baseline the page cost is unchanged, and that is the point.** 0048's
822.3px was measured over cells its own route repaired by dispatching `input` at all sixty
of them; the fix makes that repaired page the page a student actually gets. The 163.5px
difference is exactly what that route's comment predicted the clipping was understating.
At 1440 the same reading is 642.4px before and 652.9px after, 53.5px to 54.4px a row --
both inside the route's existing 45-80 band, which needed no change.

## The route stopped reporting and started refusing

`spec-table-rows-12.mjs` found this defect at 0048 and only PRINTED it. It now throws, and
it throws in two directions.

The second one is the one that matters. A cell inside a collapsed module has `clientHeight`
and `scrollHeight` both 0, so `scrollHeight > clientHeight + 1` is false for every one of
them and a naive count comes back `0 of 60 clipped` -- a perfect score over a table nobody
opened. That is not hypothetical: this route's own first draft omitted the click-open step,
and so did prompt 0048's first browser spec. So zero-box cells are counted FIRST and any of
them is a refusal.

**The refit step that used to follow the gate is deleted.** It dispatched `input` at all
sixty cells so the page cost was measured over fitted boxes; it was a workaround for the
defect being fixed, and left in place it would repair the page between the gate and the
page-cost band, hiding a regression from the band.

### Both controls

* **Positive control.** Reverted `SpecRenderer.svelte` to its pristine copy (restored by
  `cp`, md5 `fa3d3139cf0788a027b323a582a7bf3b`) and re-ran: the row reddened with
  `19 of 60 cells clip their own content ... worst 76px hidden` at 375 and `1 of 60 ...
  worst 11px` at 1440. The same numbers Phase A measured, from the check rather than from
  a scratch script.
* **The not-measured control.** Pointed the click-open step at a selector that matches
  nothing, leaving the module collapsed, and re-ran on the FIXED tree. The gate refused:
  `60 of 60 cells have no box -- the module is still collapsed, so a clipped count here is
  NOT MEASURED and must not read as 0 clipped`, and it printed the naive `0 of 60 cells
  clipped` in the same sentence so a reader can see what it replaced. Three independent
  layers reddened (the click, the gate, the page-cost band), 20 measurements outside
  threshold. Both files were restored from `cp` copies and re-verified md5-identical, and
  the run went green again.

## Tests

Two, and each guards something whose regression is silent.

`tests/dom/spec-table-autoresize-mount.test.ts` (6 tests) is the behavioural half.
**happy-dom having no layout engine is what makes this file possible rather than what
limits it**: every element reports `clientWidth` 0, which is exactly what a `display: none`
ancestor produces, so the unlaid-out case is the default and needs no fixture. What is
faked, explicitly, is the opposite -- a box with a size -- and the observer is RECORDED
rather than mocked, so a test can deliver a resize by hand the way a browser would. Every
absence assertion is paired with a sized box that does get a height, because "no inline
height was written" is also what a tree with `fit()` deleted would report.

Mutation-checked, four ways, restoring from a `cp` copy each time and never with
`git checkout --`:

| mutation | reddens |
| --- | --- |
| the zero-box guard removed | 3 of 6 |
| `fitObserver.observe(el)` removed | 2 of 6 |
| `fit()` never writes a height at all | 2 of 6 (the positive controls) |
| `unobserve` dropped from `destroy` | 1 of 6 |

`tests/classroom-spec-table-autoresize.test.ts` (7 tests) guards the INSTRUMENT. Deleting
the not-measured refusal from the browser spec turns the check green and reddens nothing
anywhere -- the harness reports a clean run and the README counts a covered route -- which
is a silent regression by definition, and one that has already happened twice on this
surface. It runs the step's own source string against fabricated documents rather than
matching prose in it, so a gate reworded stays green and a gate that stopped refusing does
not. Mutation-checked: deleting the not-measured refusal reddens 2 of 7, deleting the
clipped refusal 1, restoring the refit workaround 1, dropping the click-open step 1.

## Verification

* `npx svelte-check` after `npx svelte-kit sync`, with the two `PUBLIC_SUPABASE_*` values
  exported as placeholders: **0 errors, 37 warnings**, breakdown **31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`** over 20 files. The baseline,
  unmoved.
* `npm run check` (`svelte-kit sync && svelte-check`): **0 errors, 37 warnings, 20 files
  with problems**, over 2944 files. Run at **11:12:09 PDT**.
* `npm test`, run TWICE. The first, at **10:54:54 to 10:57:44 PDT (America/Los_Angeles),
  2026-09-05**, 169.8s: 5593 passed and **two failures, both in
  `tests/derived-numbers.test.ts` and both inherited from `ce89809`** -- see below. The
  second, after regenerating the measured README region, at **11:09:04 to 11:11:55 PDT**,
  169.5s: **271 files, 5595 tests, all passing.**
* `npm run verify:counts -- --check`: the static region agrees with this tree, before and
  after (no route spec was added or removed, so the count stays 103).
* `npm run verify:browser -- --route 'rows=12'`: green at both widths, **30 measurements,
  0 outside threshold, 0 console errors**.
* `npm run verify:readme`, once, on a clean tree at `c7f57b9` with the dev-server port
  already held: **206 route/width runs, 3010 measurements, 2 outside threshold, 467.5s**,
  and `Route specs the run covered` moved **102 to 103**, which is the static count. The 2
  outside rows are the `/dev/notebook` `tap-reach` pair (decision 12, with the owner) and
  are the same two the previous measurement carried.

### The inherited failure, which is prompt 0051's own Phase A finding

`origin/integration` carries `tools/browser-verify/routes/spec-table-rows-12.mjs` in the
tree and does NOT carry it in the README's measured `covered` list -- proven from the git
objects directly, without running anything. So the measured region said `Route specs the
run covered: 102` against a static `103`, and `Measurements outside threshold: 2`.

The prompt's claim to verify was "103 covered, 0 outside". **The tree says otherwise on
both numbers**, and the one uncovered spec is the route that found this very defect: the
one generated place a reader consults was reporting a clean score for a route the run never
visited, which is exactly the failure `tools/browser-verify/README.md` names at its own
line 49. The two outside-threshold rows are the known `/dev/notebook` `tap-reach` pair
(decision 12, with the owner) and are not this bundle's.

Regenerating the measured region on a clean tree closed it: covered is now **103**, equal
to the static count, `spec-table-rows-12.mjs` is in the list, and both `derived-numbers`
failures went green in the second suite run. **This bundle is the reason that route's
measurement finally exists in the one generated place a reader consults**, which is worth
more than the fix itself the next time somebody asks whether the spec table has been
looked at.

## Not verified

* **No real phone, and no real device of any kind.** Mr. Pina's check -- type a long answer
  into a table cell on a phone, collapse the module, reopen it -- is the case no cloud
  session reaches. Everything here is Chromium 141.0.7390.37 headless at a 375px viewport,
  `devicePixelRatio` 1, with no touch input and no software keyboard.
* **Web fonts do not load in the harness** (`fonts.googleapis.com` is blocked by the proxy),
  so every wrap measurement -- and therefore every clipped count -- is taken in the fallback
  stack. Rajdhani has different metrics; the count on a real device will differ in
  magnitude. The DIRECTION does not depend on it: a box fitted to a zero height clips
  whatever font is in it.
* `prefers-reduced-motion` is `no-preference` throughout, so that path is not exercised.
* No live Supabase, no signed-in session, no production data. The `.env` here is the
  placeholder project.
* **Printing is untested.** `Disclosure` reveals a collapsed region under `@media print`
  (its own stylesheet does this so a section that never rendered can still print), and
  whether a `ResizeObserver` delivers for that reveal was not measured. If it does not, a
  printed collapsed module would still carry the clipped cell. Worth a measurement by
  whoever next owns the print path.

## Deferred, deliberately

* **No other surface has this shape, and that was swept rather than assumed.**
  `SpecRenderer`'s `autoresize` is the ONLY auto-growing textarea in `src/`: `scrollHeight`
  appears in exactly two files, the other being `src/routes/+page.svelte`'s scroll-progress
  read, which resizes nothing. Every one of the other 43 textareas across 30 files is a
  fixed-`rows` box that never grows, so none of them can fit itself to a zero box. The one
  file that both imports `Disclosure` and holds a textarea, `SpecImporter.svelte`, has its
  textarea outside the disclosure region and at a fixed `rows="8"`. There is nothing to
  hand on.
* The row-height question (0048, decision 13), the tap targets (0043, 0044) and the
  `Disclosure` component itself (0018) are all other people's, and none was touched.
