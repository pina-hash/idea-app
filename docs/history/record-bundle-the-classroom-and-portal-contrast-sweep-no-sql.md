---
title: "Bundle -- the classroom and portal contrast sweep (no SQL)"
date: 2026-08-22
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions", "IDEA Classroom"]
record_order: 117
---

**Why.** c71e92d changed two SHARED components and measured one room. `--stamp-ink`
is a hook on `.nb-root` that `.version-badge` now reads, and `.sep`'s opacity moved
0.6 -> 0.8; both ship into the classroom and the portal, and neither was measured
there. That entry's own "NOT verified" list says so. This is the sweep it named.

### The driver

Rebuilt from 4g's, with a role-aware bar. 4g applied a flat 4.5 to everything,
which is why it reported `.sep` at 3.38 and `.dot` at 3.72 as failures and then
had to say in prose that they were fine. Here a candidate carries its ROLE and
the BAR that role chose, in columns, and every candidate stays in the output:

| role | bar | why |
|---|---|---|
| `text` | 4.5 | body text |
| `text-large` | 3 | WCAG large text (>=24px, or >=18.66px at >=700) |
| `separator` | 3 | non-text separator glyph -- the boundary contract |
| `disabled-control` | n/a | WCAG 1.4.3 exempts an inactive control -- measured, reported, held to nothing |

There is no skip list. Two populations are SET ASIDE rather than deleted, each
measured and printed with its ratio: dev-harness chrome (a harness's own view
switcher sits inside `.cr-root`, and a naive sweep of the room reported the same
21 "failures" in every state), and the `disabled-control` bucket above. The
denominator is printed beside the failure count on every run.

**Four defects the driver found in itself before its numbers were worth
anything, three of them by its own denominator:**

- **`[].slice.call()` on a Map iterator returned `[]`** while `failCount` said
  21 -- the exact defect 4g recorded in its own `__report`, reproduced by
  copying its shape. A Map iterator is not array-like and has no `length`.
  `Array.from`. Caught on the first run, by the denominator sitting beside the
  rows.
- **The ground walk answered `unmeasurable` for anything with its own
  opacity.** "Is this background opaque as painted" cannot be answered walking
  OUTWARD -- a node's background is dimmed by ITS ancestors' opacity, which is
  upstream of where the walk is. The planted 0.06 middot came back unmeasurable
  against a perfectly ordinary card. The chain is now built before anything is
  decided.
- **`* { animation: none }` froze entrance animations at their first frame.** Six
  candidates on the portal home came back at ratio 1.00 with accumulated opacity
  0 -- six real-looking failures, entirely the instrument's doing. Transitions
  only; animations run and are settled for on a TIMEOUT.
- **`IntersectionObserver` never fires in this pane, for anything.** `AppLauncher`
  stamps `opacity:0` inline and clears it from an IO callback, so all eight cards
  sat at 0 and the whole launcher dropped out as invisible -- a smaller
  denominator with nothing to say it went missing. Confirmed by scrolling all
  eight through the centre of the viewport and re-reading their inline opacity
  ("0", unchanged). Settled by clearing the inline entrance styles the way the
  component's own `clearCard` does, which is byte-identically the reduced-motion
  path. Both of these are now in CLAUDE.md's pane section.

**Positive control, planted on the live ground before every run**: a span at
1.11:1 (must be caught), one at 19.62:1 (must pass), and a bare middot at 0.06
opacity (must be caught, must be classified `separator` at bar 3, and must not
read as white -- which is what proves own-opacity is applied). All three fired on
every run reported below.

### The two traps, and how each was guarded

**The Vite/stash trap.** Every run prints a TREE PROBE of the values this bundle
moves, in the same result object as the numbers: `--violet-ink` (UNSET before,
`#a08ac7` after), `.cr-root .crumb-sep`'s computed colour (`rgba(255,255,255,.08)`
before, `rgb(111,123,115)` after), and the pathway chips' computed colours (CSEE
`rgb(61,125,255)` before, `rgb(107,156,255)` after). Every stash and pop was
followed by `touch` on all eleven files and a reload, and no baseline number below
was taken until its probe read the BEFORE column. Where a forced state could
answer the same question it was preferred outright -- the pre-c71e92d `.sep` was
measured by setting the opacity back to 0.6 on the live element, which cannot be
fooled by a stale module at all.

**The bare-class trap.** Every candidate carries its Svelte scope hash and its
nearest named component/room ancestor, and every scripted read prints the MATCH
COUNT beside the value. Both halves paid for themselves on live pages:

- On the notebook, **4 elements match `.sep` and only 2 are VersionBadge's** --
  4g's exact mistake, still reproducible on that page.
- On the notebook, **7 elements match `.dot` and only 2 are the meta
  separator**; the other 5 are 7x7 folder colour SWATCHES with no text at all.
  A bare `.dot` read returns the swatches and produces a confident, meaningless
  ratio. The separator is distinguished by the property that matters -- it
  carries the middot as its own text node.

### The 4g leftovers, under the correct bar

Both are non-text separator glyphs, so the bar is the boundary contract's 3:1,
not the text contract's 4.5:1. Re-measured here, unchanged, and PASSING:

| | light | default | IDEA | portal `--bg0` | classroom |
|---|---|---|---|---|---|
| `.version-badge .sep` @3 | **3.38** | 3.65 | 3.88 | 3.84 | 4.09 |
| meta `.dot` @3 | **3.72** | 4.23 | 3.25 | -- | -- |

Not re-fixed. 4g's figures reproduce exactly.

**And c71e92d's shared change turns out to have helped the classroom, which
nobody had checked.** Forcing `.version-badge .sep` back to 0.6 on the live
classroom element: **2.76** -- under the 3:1 boundary bar. At the shipped 0.8 it
is **4.09**. The opacity move fixed an unmeasured classroom failure as well as
the notebook one. `--stamp-ink` is UNSET outside `.nb-root` (probed on both the
classroom and the portal), so the classroom badge renders byte-identically to
before c71e92d, as that bundle intended.

### Denominators

Same driver, same states, same order, both sides. Baseline tree probe-verified
before every BEFORE number.

| run | states | candidate visits | distinct candidates | failures before | failures after |
|---|---|---|---|---|---|
| classroom 1440 | 22 | 1353 | 207 / 206 | **6** | **0** |
| classroom 375 | 22 | 1349 | 206 | **6** | **0** |
| portal 1440 | 11 | 431 / 388 | 119 / 124 | **13** | **1** |
| portal 375 | 11 | 388 | 124 | **13** | **1** |
| notebook 1440 (3 plates) | 3 | 342 | 183 | **0** | **0** |
| notebook 375 (3 plates) | 3 | 528 | 189 | **0** | **0** |

0 unmeasurable on every run. The one remaining portal failure is named below.

### What was fixed

*Classroom, all six, at both widths.*

| what | before | after | bar |
|---|---|---|---|
| `ClassroomShell` `.crumb-sep` "/" -- painted `--hairline` | **1.18** | **4.44** | 3 |
| `PeoplePanel` inactive `.roster-name` | 3.13 | 7.27 | 4.5 |
| `PeoplePanel` inactive `.roster-email` | 3.13 | 7.27 | 4.5 |
| `PeoplePanel` `.nb-excused .nb-glyph` "E" | 3.13 | 9.31 | 4.5 |
| `GradingConsole` `.roster-chip.none` "Not submitted" | 3.29 | 4.85 | 4.5 |
| `SpecRenderer` `.gate-lock` "Locked until..." | 3.91 | 4.72 | 4.5 |

`.crumb-sep` is the rule CLAUDE.md already states, one room over from where 4g
applied it: a hairline is a rule WEIGHT, authored to sit below every text
threshold, and a separator glyph is a mark drawn AS content. It took
`--boundary`. The three `--text-3` cases are the token being used for real
content in a room where CLAUDE.md says in as many words that it is decorative
tertiary; a removed student is still a name somebody has to read, and the
line-through is what carries "removed". The two opacity cases are group dims
that took the state's own EXPLANATION down with the state: 0.6 -> 0.8 (4.81 on
`--surface-2`, 5.17 on `--surface-0`) and 0.75 -> 0.85 (4.73), each the lowest
step that clears, with the dashed border and the chip text still carrying the
signal.

*Portal, ten of thirteen.*

| what | before | after |
|---|---|---|
| `.legacy-index .hero-stat .label` | 4.24 | 5.51 |
| `.legacy-index .gc-link` | 4.24 | 5.51 |
| `.legacy-index .footer-sub` (a raw `rgba(...,0.6)`) | **2.81** | 6.91 |
| coin `.type-chip.adjustment` "Adjustment" | **2.45** | 5.00 |
| coin `.amount.adjustment` "+10i¢" | **2.45** | 5.00 |
| `PathwayChip` `.pw-label` BMET / CSEE / MSET | 4.45 / 3.54 / 3.79 | 5.04 / 4.96 / 4.90 |
| `PathwayPicker` `.pwp-code` CSEE / MSET | 3.76 / 3.83 | 5.28 / 4.96 |
| harness `.id-name` CSEE / MSET | 4.01 / 4.09 | via `pathwayInk()` |

The violet and the pathway colours are the `--acc-ink` contract in its other
costume -- see CLAUDE.md, which this bundle widened from a launcher rule to the
rule. `--violet-ink` is `#a08ac7`: hue 261.8deg and saturation 35.5% held,
lightness 48.6% -> 66%. `Pathway.ink` sits beside `Pathway.color`; three of the
six identities carry their own text and simply repeat it (IDEA, ACE, MAT), and
three do not -- BMET `#B47CFF` -> `#BC8AFF` (L 74.3 -> 77), CSEE `#3D7DFF` ->
`#6B9CFF` (L 62 -> 71), MSET `#FF2E2E` -> `#FF6666` (L 59 -> 70). Lightness only
in every case. The identity still paints the fill and the edge, including the
picker's selected border, which is why `--pw` and `--pw-ink` are two variables
rather than one.

### What was NOT fixed, and why -- with the numbers

- **`--dim` clears only the darkest of the three portal grounds**: 5.31 on
  `--bg0`, **4.46** on `--bg1`, **4.24** on `--bg2`. Lightening it (hue 105deg
  and 6.7% saturation held, 53.3% -> 56%, `#8b9687`, giving 5.76 / 4.90 / 4.60)
  is the obvious fix and was REFUSED: five FRC components read `--dim` on
  `.frc-root`'s paper, where it already measures **2.95 / 3.23** and the
  candidate takes it to **2.72 / 2.98**. Degrading a room this sweep did not
  cover, to fix one it did, is the exact mistake this bundle exists to correct.
  The two failing call sites took `--text-2` instead and the token did not move.
  **This leaves a real defect standing**: the next use of `--dim` on `--bg1` or
  `--bg2` fails, and FRC's own `--frc-gray` measures 2.77 on its own surface, so
  that room needs a hook of its own. Now stated as a rule in CLAUDE.md.
- **`span.live-badge` at 3.90 @ 4.5, still failing.** Reported rather than
  exempted. It is demo markup in `src/routes/dev/pathways/+page.svelte` and ships
  nowhere: it exists to show the reserved status crimson beside the MSET identity
  red, which is the colour rule the page is about. Restyling it would break what
  it demonstrates. It is the one remaining failure in both portal runs.
- **Borders and rules are not in the candidate population at all.** The sweep
  measures ink -- text and glyphs. `--hairline` is explicitly not measured
  (CLAUDE.md), and `tests/boundary-token.test.ts` is what governs which elements
  carry the load-bearing token. Said here so the population is legible rather
  than assumed.

### The notebook, re-measured because a shared fix can reach back

Enumerated mechanically rather than argued: of the eleven changed files, only
`PathwayChip` renders inside `.nb-root` (via `NotebookMasthead` -> `ProfileMenu`),
`.crumb-sep` has 0 matches there, and `--violet-ink` has no consumer there.

Proven by a full before/after over a REPRODUCIBLE state sequence -- load, switch
plate, sweep, no other interaction -- with the fingerprint of every candidate
(`owner|selector|role|bar|ratio`) compared element by element:

| | candidates | moved | failures |
|---|---|---|---|
| notebook 1440, 3 plates, before vs after | 183 vs 183 | **0** | 0 vs 0 |
| notebook 375, 3 plates, before vs after | 189 vs 189 | **0** | 0 vs 0 |

**A first attempt at this comparison was thrown away**, and the reason is worth
recording: it clicked an entry open first, the click landed on different rows on
the two trees, and the fingerprint diff came back 48 rows wide -- entirely
different SELECTORS (`nb-compose-trigger` against `nb-save-draft`), not the same
selector at a different ratio. A fingerprint diff across non-identical states
proves nothing and reads exactly like a regression.

**The pathway chip is the one thing that does move there**, and it is not in the
harness (which mounts no ProfileMenu), so it was measured directly against every
ground it lands on. The ProfileMenu panel's ground was MEASURED, not assumed:
`.pm-panel` is painted `var(--bg1)` and `.nb-root` does not alias `--bg1`, read
back as `#1a2a1a` from inside `.nb-root` on all three plates -- the menu keeps
its designed dark ground, exactly as `notebook-theme.css` claims. An earlier pass
assumed the panel took the plate and produced a table showing the light plate
REGRESSING (CSEE 3.26 -> 2.32); that table was wrong and is recorded here only
because the assumption is an easy one to make.

Chip on the notebook masthead band, before -> after, BMET / CSEE / MSET:

| plate | before | after |
|---|---|---|
| default `#161a18` | 5.16 / 4.11 / 4.31 | 5.83 / 5.76 / 5.57 |
| light `#211f1a` | 4.77 / **3.83** / **3.98** | 5.39 / 5.37 / 5.15 |
| IDEA `#060e09` | 5.90 / 4.65 / 4.87 | 6.67 / 6.52 / 6.29 |

On the ProfileMenu panel (`--bg1`, every plate): 4.45 / 3.54 / 3.79 -> 5.04 /
4.96 / 4.90. IDEA, ACE and MAT are unchanged on every ground. **Every notebook
ratio that moved, moved up.**

### Verified

- `svelte-check`: **0 errors, 37 warnings**, re-derived after `npx svelte-kit
  sync`. Breakdown unchanged: 31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`, over 20 files.
- Full suite: **88 files, 2135 tests, all passing.**
- 1440 and 375 for every run above. Every ratio is a canvas pixel read of the ink
  composited over a ground asserted opaque; 0 unmeasurable on every run.

### NOT verified

- **No screenshot.** The Browser pane does not composite.
- **No live Supabase and no signed-in session.** Every surface was driven through
  its dev harness or as a signed-out visitor. **This bundle ships no SQL.**
- **`npm run build` was not run** (the pre-existing Windows EPERM in the Vercel
  adapter's `closeBundle`).
- **No real phone.** 375px is an emulated viewport.
- **The real `/notebook` route was never swept** -- only `/dev/notebook`, which
  mounts no ProfileMenu. The pathway chip there was measured against its grounds
  directly rather than on the page, and the panel ground was read from
  `.nb-root` rather than from a rendered menu.
- **FRC, FSP, GAUNTLET, GREENLINE, tournaments and the coin desk's own room were
  not swept.** The `--dim` exposure in FRC above was measured because the fix
  under consideration would have reached it; the rest of those rooms were not.
- **The `--dim` and `--frc-gray` failures named above are left standing**, with
  their numbers, for a bundle that can measure the room properly.

---

