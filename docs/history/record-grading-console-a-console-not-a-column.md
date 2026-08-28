---
title: "Grading console: a console, not a column"
date: 2026-08-20
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 91
---

## Grading console: a console, not a column

**Code only. No migration.** Six changes to
`src/routes/classroom/[sectionId]/item/[itemId]/grade/` and
`src/lib/classroom/GradingConsole.svelte`, plus two shared primitives the rest
of the app can now consume.

### 1. Full-viewport width

The grade route sat outside `ClassSplit` and took `--measure-wide` (62rem).
**Measured at 1440px before the change: 928px of page content in a 1440px
window, a rubric card holding 229.8px of content and a level button holding
208.1px.** That is the width a grader was reading a written standard in.

`classroomMeasure('item-grade')` returns a new `console` measure;
`--measure-console: 100%` in `effects.css` is the only measure that is a
percentage rather than a length, and the reason is written beside it. The value
resolves through the existing `--cr-measure-route` indirection -- the route
passes the token name, `classroom.css` resolves it -- so nothing is hardcoded in
the component.

**After, same window: 1376px of page content (1440 less the room's own 2rem
gutter each side), 438.3px of rubric card, 416.7px of level button.**

**NO UPPER BOUND, and that is a decision with a measurement behind it.** At
2560px the console is 2496px of content and every measured value either improves
or stays flat -- except one: the response column's prose measured a **1035px
line**, about 65rem against a 46rem reading measure. A console-level cap is the
wrong instrument for that; it would take the room back off the rubric, which is
the entire point of the change. **The cap went on the prose instead**
(`.module-intro`, `.readonly-text`, `.prompt` in `SpecRenderer` now carry
`max-width: var(--measure-reading)`), measured back at **736px in a 1100px
column**. Every other surface that mounts `SpecRenderer` is already narrower
than the measure, so the rule is inert there.

### 2. Three panes, each scrolling on its own

`.work-split.has-rubric .work-col` carried `max-height: calc(100vh - 11rem)` at
every width while the document scrolled too, and the roster had **no overflow
rule at all** -- a class of thirty made the page taller.

The frame is the documented one (`CLAUDE.md`: a full-height surface is `.cr-app`
+ `.cr-app-body`, never viewport arithmetic). `.cr-app` goes on `.cr-root` from
`+layout.svelte`, read off the SAME `classroomMeasure` answer as the width
rather than a second list of routes; the page's `main` is `.cr-app-body`.
Nothing names a chrome height.

**`width: 100%` on `.grading-page` is load-bearing** and was found by measuring:
`margin: 0 auto` cancels the stretch a flex item would otherwise get, auto
margins eat the free space, and the box falls back to shrink-to-fit -- **409px
of console in a 1440px window** until it was added. `split.css` carries the same
note for the same reason.

**`grid-template-rows: minmax(0, 1fr)` + `align-items: stretch` on the work
split above the breakpoint** was the second find: with the shell's `start`
alignment the two columns sized to their own content, so they measured **1234px
and 1408px tall inside a 532px box and neither ever scrolled**.

Measured at 1440x900, one student open: document `scrollHeight` 900 =
`clientHeight` 900, `scrollTop` 0; roster 386px box over 1148px of content,
response 426/1257, rubric 426/1407.

**Proved by input, not by geometry.** The Browser pane cannot deliver mouse
wheel events (coordinate input requires a prior screenshot, and the pane does
not composite), so each pane was scrolled by REAL key presses through CDP:

| driven by | pane that moved | roster | response | rubric | document |
| --- | --- | --- | --- | --- | --- |
| 4x ArrowDown (the console's own criterion keys) | rubric | 0 | 0 | **900** | 0 |
| 14x Tab through roster rows | roster | **472** | 0 | 0 | 0 |
| 5x Tab through the response column | response | 0 | **278** | 0 | 0 |

Below 1024px none of it applies: the document owns the scroll, and the
**existing 900px and 800px stacking breakpoints are untouched** -- measured at
900px (console 320+519, work split one column, document scrolls), at 800px
(single 753px column) and at 375px (343px column, no pane bounded, no horizontal
overflow: `scrollWidth` 375 = `clientWidth` 375).

### 3. Rubric selects on `short`

`short` is authored in the specs and was dropped in exactly one place: the map
literal in `rubricFromSpec`. It is optional on `SpecRubricLevel` and
`RubricLevel` now and the map keeps it. **No backfill, no regeneration path, no
second write path** -- `_classroom_normalize_rubric` already passes `levels`
through verbatim, so a regenerated rubric stores it and nothing else needs to.

`levelShort(level, criterionId, spec)` is the ONE resolver, in this order: the
stored level's own `short`; else the matching spec level, paired by
`rubricFromSpec`'s criterion-id rule and then by POINTS inside the criterion
(strictly descending, so at most one can match, and it survives a reordered
builder rubric); else the full descriptor.

`RubricBuilder`'s save payload keeps it too. Carrying it in and dropping it one
step later is the same defect one level in.

### 4. Tips escape their scroll container

`InfoTip`'s panel was `position: absolute` in a `position: relative` wrapper. On
the grading console its chain holds two clipping ancestors, both confirmed by
walking the real DOM: `.table-scroll` (`overflow-x: auto`, which forces
`overflow-y` to `auto`) and `.work-col`. No `transform`, `filter` or `contain`
anywhere in the chain, which is what makes fixed positioning a real escape.

`src/lib/shell/anchored.ts` is the primitive: a pure `anchorPosition(anchor,
panel, viewport, opts)` returning a placement, and a thin `use:anchored` action
that measures, calls it, and writes two numbers. **An action, not a component
and not a portal**, because the panel has to stay in the caller's markup for the
caller's scoped styles -- and its `@media print` rules -- to keep working. The
print block regained `position: static !important` on three properties, since
the action writes them inline; **verified in-page that an `!important`
stylesheet declaration beats an inline one** rather than assuming it.

**The escape is proved by hit-test, with the old geometry as the
counterfactual.** With the table header scrolled to the top of the response
column, the panel lands at 273-305.7 while `.table-scroll` starts at 308 and
`.work-col` at 302.5. `document.elementFromPoint` at (500, 277) -- outside both
clippers -- returns **the panel**. Restore the shipped-before geometry
(`absolute` in a `relative` wrapper) at the same scroll position and the
equivalent point returns `.work-meta`: clipped, not painted. Flipping was
measured in both axes at 375px (an anchor at the viewport top flips `below`;
shoved toward the right edge the alignment flips `start` to `end`) and all eight
rubric tips at 1440px stay inside the window.

Escape dismisses with focus kept on the trigger, and `stopPropagation` keeps the
console's own Escape ("back to the roster") from also firing -- verified with a
real key press: tip hidden, student still selected, `document.activeElement`
still the trigger.

**OUTSTANDING, deliberately not done in this pass:** the link popover in
`RichTextEditor.svelte` (:424-520) is a hand-rolled second copy of the same
problem. `anchorPosition` takes a plain BOX rather than an element precisely so
it can consume it later -- a `Range`'s own `getBoundingClientRect()` is already
the right shape.

### 5. Keyboard path through the whole loop

The generic half of `notebook-review.ts`'s machinery moved to
`src/lib/shell/keys.ts` -- the binding shape, the modifier rule, the typing
guard -- and both surfaces consume it. `REVIEW_KEYS` gained a `dispatch` map per
row and `reviewAction` is now `keyAction(event, REVIEW_KEYS)`; `isTypingTarget`
is re-exported from its old home so no call site and no test moved. The
notebook's own actions stayed where they were.

The bindings, and why:

| key | action | why |
| --- | --- | --- |
| `1`-`4` | pick that level on the focused criterion | a criterion holds at most four levels (the SQL constraint), so the digits cover every rubric exactly, and level 1 is the top level as printed |
| `Up` / `Down` | previous / next criterion | the axis the rubric already has on screen |
| `Left` / `Right` | previous / next level inside one | the other axis; from "nothing picked" the first press lands on the top level, not level two |
| `Tab` | next criterion | **NATIVE, not swallowed.** Each level group is a roving tabindex with exactly one tabbable button. Taking Tab would trap focus in the rubric with no way out |
| `N` / `P` | next / previous student | the pager convention; single letters that do not collide with the digits and read as words in the legend |
| `S` | save draft | safe and reversible |
| `R` `R` | return to student | **armed, then confirmed.** Returning releases a grade to a student, so it takes the same two-step every irreversible control here takes; the button's label changes to "Press R again to return" and gains an amber edge |
| `Esc` | back to the roster | routed through the same dirty guard as every other way out |

`GRADE_KEYS` is one array that is both the legend and the dispatch table; the
legend renders on the surface (`data-testid="grade-key-legend"`), not only in
this report. The `native` flag on the Tab row is what lets a
legend-versus-handler test skip it honestly instead of failing on it.

After a selection, focus lands on the picked level button, scrolled `block:
'nearest'` with `behavior: 'instant'` (app.css sets a global smooth scroll).
After a student change it lands on the first criterion's level control.

**Driven end to end with real key presses:** `1`, Down, `1`, Down, `1`, Down,
`1` scored 20/20; `S` produced "Draft saved"; `R` armed; `R` returned, and the
roster chip became "Returned - 20/20"; `N` then moved to the next student with
no confirm, because the save had made what was on screen the new baseline.

### 6. Two defects the audit found

`busy` is cleared in a `finally` in `GradingConsole` (`grade`, `setGate`),
`RubricBuilder` (`save`, `removeRubric`) and `FeedbackBox` (`send`). A throw
left every control disabled with the work still in the form.

`select()` overwrote scores, criterion comments and override state with no dirty
check. Every path that changes the selection -- a roster click, Close, the
keyboard -- now goes through `requestSelect`, which is exempt when nothing
changed and otherwise raises an inline confirm naming the real counts ("Carla
Cardenas has unsaved grading: 1 criterion and the comment to the student") with
three ways out, one of which saves first. A successful save makes the current
state the new baseline, so the confirm cannot fire on work that landed.

### Layout, measured as a set

Both states at every width. **Nothing selected, the roster takes the full
measure** -- it is not a third of the screen beside two placeholder panes -- and
it USES the width, in `auto-fit` columns at a measured 22rem (below which the
longer names ellipsise against the status chip):

| width | nothing selected | one student open |
| --- | --- | --- |
| 375 | 343px page, roster 295px, 1 column, document scrolls | 343px page, one column, no pane bounded |
| 1440 | 1376px page, roster 1328px, **3 columns**, document does not scroll | roster 272 / response 521.3 / rubric 496.3, all three bounded |
| 2560 | 2496px page, roster 2448px, **6 columns** | roster 272 / response 1095 / rubric 1042.6 |

The vertical rhythm was audited as a set, not tuned one value at a time:

| value | before | after |
| --- | --- | --- |
| roster row height | 32.8px | **44px** |
| `.btn.tiny` on this console (Save draft, Return, Close, Export, Approve) | 22.9px | **44px** |
| "Score between levels" toggle | 22.2px | **44px** |
| level button height | 49.7px | 49.7px (unchanged; `min-height` was already 44) |
| override number input | 24px | **44px** |
| card margin | 20px top / 14.4px bottom | 0 / 12px |
| hero block | 216px | **100.2px** (left-aligned, eyebrow margin 24 to 4, title 2.4rem to 1.75rem) |
| score row padding | 8 / 9.6px | 8 / 12px |
| page bottom padding above 1024 | 48px | 12px |
| roster gap, level gap, section-label margin, card padding, gutter | 4 / 4 / 8 / 24 / 32px | unchanged |

The `.btn.tiny` change is scoped to `.cr-console` in `classroom.css`: ten other
call sites legitimately want the chip.

### Legibility, measured

Every rubric level state against the CARD it composites over (`#101312`), not
the page plate:

| | default | picked |
| --- | --- | --- |
| level label | 14.5:1 | 16.19:1 |
| short line | 6.84:1 | 7.63:1 |
| points | 7.66:1 | 8.55:1 |
| boundary vs the card | **1.22 to 3.13:1** | 7.91:1 |

The boundary was the one finding. `--hairline` measured **1.22:1** against the
card and the row's own fill is **1.06:1** -- with a boundary that faint there is
nothing saying where one option ends and the next begins. `--text-3` (the room's
existing separator ink, not a new colour) is **3.13:1**, the non-text threshold;
applied to the level buttons and the roster rows on this console only, the
shared token untouched. **The fill is pinned and only the boundary moved**,
which is the rule: a fill mixed from the ink hands the contrast straight back.

Tip panel: text **14.5:1** on its own surface, border **3.42:1** against the
card, plus a shadow. Focus ring (the global `:focus-visible`, `--cyan`):
**7.76:1** on a level button or roster row, **8.26:1** on either card, **8.67:1**
on the page plate, **7.76:1** on a tip panel. The classroom has ONE palette --
the `prefers-color-scheme` block in `colors.css` is notebook-only -- so that is
every palette this surface has.

Legend text 7.27:1, `kbd` 14.5:1, override toggle 8.26:1, roster name 14.5:1,
submitted chip 7.76:1, focused-criterion edge 8.26:1.

### The harness

`/dev/classroom?view=grade` mirrors the WHOLE mechanism now, not most of it: it
takes `.cr-app` and `--cr-measure-route` from the REAL `classroomMeasure` rather
than a copy of its table, because the three-pane fill depends on a bounded
parent the component does not own and a harness missing that half proves
nothing.

The roster went from 3 names to 24: "a long roster does not grow the page"
cannot be shown either way by three rows, it passes vacuously. The fixture also
carries all three short-form states at once -- `m1-views` keeps the shorts
`rubricFromSpec` carried in, `m2-photos` has them STRIPPED (the shape of every
row stored today, so the spec fallback is exercised), and two criteria were
never authored with one -- because branch two is the one nothing else can reach.

### Proof

`tests/classroom-grading-console.test.ts`, 35 tests. Only guarantees whose
regression is SILENT: the anchor arithmetic (a panel off-screen looks like a
panel that did not open), the shortcut exclusion, the short-form resolution
order, the `finally` blocks, and the selection guard. The three-pane layout and
the pane scrolling fail visibly and are verified in the browser instead.

**The harness was proved against a deliberately bad mutation before any clean
result was trusted**, and every mutation was restored byte-identically
(md5-checked) with the file re-run green afterwards:

| mutation, always in the PERMISSIVE direction | reddened | named tests |
| --- | --- | --- |
| M0 (harness check) the vertical flip never happens | 3 | the two flip tests, the corner test |
| M1 `rubricFromSpec` drops the authored short again | 3 | round trip, spec fallback, one-write-path |
| M2 the builder drops short on save | 2 | builder round trip, one-write-path |
| M3 `isTypingTarget` always says no | 2 | console exclusion, and the notebook's own |
| M4 the console stops asking the guard | 1 | handler gates |
| M5 `grade()` clears `busy` outside the `finally` | 1 | the `finally` assertion |
| M6 the dirty guard is gone | 1 | exempt-when-clean |
| M7 a roster click bypasses the guard | 1 | every-path-through-the-guard |
| M8 the room stops being an application frame | 1 | the layout supplies the bounded parent |

M0 is worth reading twice: with no flip the SWEEP still passed, because the
clamp keeps every panel inside the viewport either way. The sweep tests
containment; the three named tests test flipping. An all-clean sweep would have
been a reason to check the harness, not a result.

`svelte-check` 0 errors / 36 warnings (baseline, unmoved). Full suite 67 files /
1622 tests green.

### NOT verified

- **No live Supabase project and no signed-in session.** Everything above ran
  against the dev harness's in-memory transports. No RPC, no RLS path and no
  real `classroom_rubrics` row carrying a `short` was exercised; the claim that
  `_classroom_normalize_rubric` passes `levels` through verbatim is read off the
  migration source, not observed on a database.
- **No screenshots, and none are possible here.** The Browser pane does not
  composite; every visual number above is a measured computed-style, geometry or
  hit-test read. Transitions were disabled before every measurement.
- **No mouse input at all.** Coordinate input needs a prior screenshot, so wheel
  scrolling, hover-driven tips and drag were never exercised by real pointer
  events. Hover paths were driven by focus (the same state) and by scripted
  `pointerenter`; the scroll proofs used real KEY presses instead.
- **Print was not rendered.** The `@media print` behaviour is asserted from the
  cascade experiment (an `!important` stylesheet declaration beating an inline
  one, measured in-page) and from the source, not from a print preview.
- **The two `materials/idea209h` specs were read, not applied.** Both already
  carry a `short` on every level of every criterion -- there are none missing to
  author -- but nothing here put them into a live `classroom_rubrics` row.
- **`RichTextEditor`'s link popover is untouched**, as stated above.
- **`.btn.tiny` elsewhere in the classroom is still 22.9px.** Ten other call
  sites use it and this bundle deliberately did not restyle a shared control
  beyond the console it was scoped to.


