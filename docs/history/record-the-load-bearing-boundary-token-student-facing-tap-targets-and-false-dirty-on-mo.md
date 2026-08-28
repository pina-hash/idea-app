---
title: "The load-bearing boundary token, student-facing tap targets, and false dirty on mount (code only, NO migration)"
date: 2026-08-22
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 107
---

## The load-bearing boundary token, student-facing tap targets, and false dirty on mount (code only, NO migration)

Three items, each starting from a measurement somebody else had already taken.

### 1. `--boundary`: two tokens, not one raised hairline

**The measurement.** `--hairline` was drawn 155 times in the source and, measured
in a browser, 1.18-1.23:1 across the classroom and portal and 1.11-1.40:1 across
the three notebook plates. The floor for a load-bearing boundary is 3:1
(`IDEA_INTERFACE_STANDARDS` 10). Two surfaces had already fixed this locally and
differently: the grading console with a `--text-3` override, the launcher with a
75% `--acc-edge` mix.

**What was rejected, and why it is the interesting half.** Raising `--hairline`
is one line and makes every load-bearing case pass. It is wrong because ~190 of
the rendered edges in the classroom alone are decoration -- a rule between two
paragraphs in a card, a table cell edge, the frame on a thumbnail -- and drawing
all of them at 3:1 turns a tuned surface into a wireframe that nothing on screen
reports as a regression. So the split is made at the POINT OF USE, and
`tests/boundary-token.test.ts` exists to redden the one-line version.

**The value, and a wrong number corrected.** `--boundary` is `#6f7b73`:
`--text-3`'s own hue and saturation at 46% lightness instead of 38%. Lightness
only -- desaturating is how a room stops being itself. Measured by painting each
colour onto each ground in a canvas and reading the composited pixel back,
because these resolve to `color(srgb ...)` and `color-mix(...)` and a regex over
computed styles skips them and reports the plate instead of the real ground.

    surface-0 4.44  surface-1 4.23  surface-2 3.98
    bg0 4.02        bg1 3.42        bg2 3.21     (worst 3.21, floor 3.0)

`--plate` is excluded: `var(--plate)` appears in no rule, so nothing renders on
it. A boundary that ever lands there needs its own measurement -- this value is
2.66 against `#2c3c2c`.

**`--text-3` was the obvious candidate and does not clear.** The grading console
had taken it as 3.13:1. That number is against `--surface-1`; the console's
option controls fill themselves with `--surface-2`, where the same ink is
**2.95:1** and misses the floor. The override is now folded into the shared
token and the same controls measure 4.62:1.

**Per room, like `--hairline` is.** `.nb-root` aliases `--boundary` to
`--nb-boundary`, declared per plate: light `#8e8467` (3.56/4.03/3.28), dark
`#756b57` (3.50/3.20/3.69), IDEA `#577063` (3.48/3.25/3.63). Without the alias
the room would inherit the `:root` value, which is 1.29:1 on paper.

**What moved and what did not.** 58 of the 155 `var(--hairline)` rules moved,
plus the grading console's two `--text-3` overrides folded in; **96 were left on
`--hairline` deliberately**. Rendered, across the 21 classroom harness views:
223 elements now carry `--boundary` at 4.23-4.44:1, and 189 still carry
`--hairline` at 1.18-1.23:1, unchanged. On all three notebook plates: 6 elements
each at 3.20-3.72:1, hairline unchanged at 1.18-1.34:1.

**The launcher was NOT folded in, and that is stated rather than glossed.**
`--acc-edge` is the same 3:1 contract with a brand colour in it. All eight cards
on the harness measure 3.80-7.65:1 (worst FRC). Replacing it with the neutral
token would delete eleven deliberate identity decisions to satisfy a rule the
accent already meets, so the app has one token plus one documented identity
variant, not one token.

### 2. Tap targets on student-facing surfaces

**Two mechanisms in `src/app.css`**: `.tap-44` grows a control that owns its row;
`.tap-reach-44` expands the HIT AREA of one inside a line of text, with a
pseudo-element, so the target grows and the writing does not reflow. Most reaches
set `--tap-reach-w: 0px` and grow in height only, because Edit beside Delete,
seven colour swatches and two breadcrumbs all sit closer than 44px horizontally
and overlapping reaches hand the tap to the wrong control. Verified by hit-test:
all seven swatches keep their own tap at 8px spacing.

**They are global rather than component-scoped because Svelte prunes a scoped
`::after`.** Written inside `FolderManager`, `.swatch::after` was dropped from
the compiled output entirely while `.swatch` beside it was kept -- silently, with
no `svelte-check` warning. Found by reading the served stylesheet back and
hit-testing the element, not by looking at it.

**Measured, both viewports, harness chrome excluded from the denominator.**
Classroom: 21/21 views, 261 control measurements, student-facing under-44 went
from 5 distinct to **1**. Notebook: 95-121 measurements per state across default,
folder manager, folder editor, select mode and entry-open, at 375 and 1440, under
44 went from 15 to **0**. No horizontal overflow at 375 on any student view
(`scrollWidth 375 / clientWidth 375`).

**Never a fixed height.** Rounding to reach a floor rounds both ways. The
notebook's plate switch was `height: 2.4rem` -- it could not round up, and is now
`min-height`. Nothing was snapped to a token.

**The one left, deliberately:** `ItemBody`'s `.item-link` (19px), an authored link
inside prose. Prose lines sit ~24px apart, so a 44px reach on one link overlaps
the lines above and below and steals their taps; WCAG 2.5.8 exempts an inline
target in a sentence for the same reason.

**One item in the brief was misclassified and is flagged rather than silently
re-scoped:** the Grade link is `GradesPanel`'s `.grade-open` on the instructor
Grades tab, not a student surface. It was raised anyway because it was named.

**The deferred instructor-only list is 23 distinct controls**, 17.4-41.6px, all
in `AdminConsole`, `PeoplePanel`, `GradesPanel`, `DocumentationCheck` and the
teacher-only branches of `ClassView`.

### 3. False dirty on mount, everywhere it could happen

**All eight `SaveState` consumers audited.** Five were already correct and are
recorded so the next audit does not redo them: `GradingConsole` (baseline
snapshot), `FspTechSelection` and `FspPulse` (baseline serial seeded at mount),
`FeedbackBox` (input-event driven), `AssignmentEngine`/`SpecRenderer` (every
`report()` is a user action; no effect writes). `CheckInGuidance` was fixed in
9094428. `EntryNotes` already compared against an `onready` baseline.

**`ContentComposer` was the real one, and worse than an editor transaction.** Its
`dirty` was `composerHasWork` -- "is there content in here" -- being read as "has
this been edited". A composer opened on an EXISTING item carries that item's own
title and body from the first frame, so it reported dirty before anybody typed.
Both questions are now the same comparison against a different reference:
`composerDraftSignature` differs from an EMPTY draft, or differs from the SEEDED
one. They cannot drift apart.

**One helper, not three.** `$lib/edit-baseline.svelte.ts` (`EditBaseline`) holds
the mount value, answers `changed`, and is read by `CheckInGuidance`,
`EntryNotes` and `ContentComposer`. `changed` is false before anything is seeded.

**The harness was missing the mechanism.** `/dev/classroom-phase1` mounted
`ContentComposer` in edit mode but never wired `ondirtychange`, which is what the
section layout's `beforeNavigate` guard reads -- so nothing on that page was
asking the question. A dirty readout was added to both composer mounts.

### Verification

* `svelte-check`: **0 errors, 36 warnings** (baseline, unchanged).
* Full suite: **2002 tests, 83 files, all passing.** One pre-existing test broke
  legitimately and was GENERALIZED, not deleted: `classroom-measure` spelled the
  pane border's fallback out as `var(--hairline)`, and the pane edge is
  load-bearing. It now pins the mechanism (reads `--cr-pane-line`, has a
  fallback) and asserts the fallback is not the decorative token. Re-mutated
  both ways: removing the hook reddens, restoring `--hairline` reddens.
* **Mutation proof, each verified applied by grep and a changed hash, each
  restored and re-verified green:**
  - `--hairline` raised globally to `0.42` -> `boundary-token` reddens on the
    literal tripwire. With that tripwire ALSO disabled, the contrast loop reddens
    on its own at 4.06:1. Both layers bite alone.
  - a decorative rule (`.md-table td`) swept onto `--boundary` -> reddens, naming
    the file.
  - `ContentComposer`'s dirty put back to `composerHasWork` -> edit mode reports
    **dirty at mount** with nothing typed; create mode stays clean, which is
    exactly why nobody noticed (the real layout only mounts create mode).
* **Positive controls on every sweep**, because a clean sweep that cannot go
  dirty measured nothing: forcing three notebook rules to 20px took under-44 from
  0 to 12 and back; forcing the engine's `.btn` to 18px took it 0 to 6 to 0; the
  view sweep asserts 21/21 and fails on a view that renders nothing.
* **Item 3 at each site, seeded, with a positive control:** `CheckInGuidance` 0
  writes after 3s idle on a seeded document -> 1 on a real edit -> stable;
  `EntryNotes` Save disabled at mount and after 2.5s -> enabled with "Unsaved
  changes" on a real edit; `ContentComposer` clean at mount in BOTH modes -> dirty
  on a typed character and on a pasted body -> clean again when undone;
  `NotebookView`'s own composer guard clean at mount -> armed on a real edit.

### NOT verified

* **No live Supabase.** The local `.env` is a placeholder project; nothing here
  touches a real database, and none of this work is SQL.
* **No screenshots.** The Browser pane does not composite; every visual claim
  above is a measured computed-style, canvas-pixel, geometry or hit-test read.
* **Real touch input was not used.** Target sizes are geometry and
  `elementFromPoint` hit-tests, not a finger on a phone.
* **The three notebook plates were exercised on the default view only** for the
  boundary element count; the tap-target sweep covered more states but on the
  system palette only.
* **`npm run build` was not run** -- it dies on Windows in the Vercel adapter's
  `closeBundle` with `EPERM` regardless (pre-existing, machine-level).
* **The instructor-side 23 are not fixed**, by instruction. They are listed above
  so the phased sweep has a denominator.


---

