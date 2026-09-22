---
title: "Four small surfaces, two of which the measurement settled the other way: FRC on the tile, a harness reset that had stopped resetting, and a spotlight scrim that is already the cheap one"
date: 2026-09-22
branches: ["claude/new-session-6u4tff"]
migrations: []
subsystems: ["portal", "notebook", "verification"]
---

Ledger 0282, four items on four disjoint surfaces, no migration. Two shipped
code. The other two are worth reading first, because in both the prompt's
premise was a claim about the repo and the repo answered differently: item D
was already fixed and only its decision entry was outstanding, and item B's
prescribed fix measures WORSE than what is shipped.

## A. FRC 2026/27 counts as an active course

`activeCourseCount()` is a `Set` over `SECTIONS.map((s) => s.course)`, minus
`summer-2026` while `FSP_CONCLUDED`. There was no FRC row in that array at all,
so the home page hero read **2** against a pathway running 3. The classroom
side was never wrong -- `classroom_sections.active` is a different flag on a
different table, and the class card has always shown -- which is why this was
one row and not a model change.

**Measured, on the real home page mounted by `/dev/tour`:** the tile reads
`2` before and `3` after. `sectionCode(frc)` is `IDEA FRC` (no rotation);
`sectionDisplayName` composes `IDEA FRC — FRC 2026/27 (Freshman to Junior)`;
`termLabel` is `Term S1`; the distinct course set is
`IDEA FSP | IDEA 100 | IDEA 209H | IDEA FRC`.

**The coin desk picker, the second consumer the prompt named, now shows** (read
off `#curriculum-select` on `/dev/coin-desk` with the Students area open):

```
Choose a class…
IDEA 100 — Intro to IDEA (Freshman, Term T1)
IDEA 100 — Intro to IDEA (Freshman, Term T2)
IDEA 100 — Intro to IDEA (Freshman, Term T3)
IDEA 209H — Engineering I Honors (Junior, Term S1)
IDEA 209H — Engineering I Honors (Senior, Term S1)
IDEA FRC — FRC 2026/27 (Freshman to Junior, Term S1)
```

(The Sophomore row is absent because the harness fixture already holds a coin
section for it, and `summer-2026` because `isOfferableSection` excludes a
concluded programme. `$lib/coin-desk/sections.ts` was read and NOT edited.)

**Three decisions inside one row, each written into the row's own comment.**

1. **The season year is in the TITLE and never in `course`.** Every row in the
   array is 2026-27 already, and a course code carrying the year would make
   FRC 2027/28 a second course in the Set -- the `IDEA 100-1/-2/-3` defect
   wearing a different suffix. `IDEA FRC` is the course; a later season is a new
   row under the same code. The prompt warned about `FRC 5669-A` and the year is
   the same trap one step over.
2. **`year: 1` with `yearLabel: 'Freshman to Junior'`.** `Year` is one band by
   type and this course spans three, so the range lives in the free-prose label
   `summer-2026` already uses that way ("Incoming Freshman"). `yearLabel` is
   what the coin desk prints; `year` itself only groups `selfSelectOptions()`,
   which has **no caller in `src/`** today.
3. **`term: 'S1'` IS A PLACEHOLDER AND THE ROW SAYS SO.** `Term` is a closed
   union with no year-long value, and widening it would make `termLabel()` in
   `$lib/coin-desk/sections.ts` -- not this bundle's file -- print
   "Term &lt;whatever was added&gt;". S1 is what the other honors offering uses.
   Nothing that counts reads it.

**Mutation proof: the row removed, the tile reads 2 again -- and NO TEST
REDDENS.** `tests/curriculum-course-identity.test.ts`,
`tests/home-order-and-accent.test.ts` and `tests/coin-desk-prefs.test.ts` pass
either way, 50 tests, because they assert the RULE and derive the expected count
from the same array. That is deliberate and that file's own header says so
("nothing below spells out 'there are two courses'"), so the instrument here is
the rendered tile, not the suite. A test pinning `3` would be a catalog ratchet
and was not added.

**What is NOT established.** `status: 'live'` and `instructor: 'Pina'` rest on
the prompt's statement that the classroom carries "FRC 2026/27 Section 1" on Mr.
Pina's switcher; no session in this repo can reach production to check either,
and `status` is read by nothing that counts (both `live` and `upcoming` are
offerable). Note also that every other 2026-27 row still says `upcoming` and
`summer-2026` still says `live` although FSP has concluded -- **the `status`
column in that file is stale generally**, and correcting it is Mr. Pina's, not
a side effect of this row.

## B. The spotlight's `200vmax` shadow: built, measured, and reverted

Ledger 0276 measured the shipped scrim -- `0 0 0 200vmax rgba(3,9,5,0.72)` on
`.tour-spot`, a 5414px spread at 2707px wide, recomposited on capture-phase
scroll -- at a median frame time of 33.3ms against 16.7ms with the tour closed,
and left it alone. This bundle was asked to replace it with something whose area
does not scale with the window.

**It was built exactly as prescribed**: one `position: fixed; inset: 0` scrim
carrying the dim, with the ring's rounded box subtracted by
`clip-path: path(evenodd, ...)`; a SECOND element, because `clip-path` clips hit
testing as well as paint and cutting that hole in `.tour-backdrop` would have
handed the spotlighted control a click on every step rather than only an
`interactive` one; the hole keeping the 8px radius; and the transition on the
same curve and duration as the ring, which works because the command sequence is
identical on every step (a paused animation reads the exact linear midpoint at
25/50/75%, measured).

**Then it was measured, and it is worse.** The first attempt to measure it was
wrong in three ways worth writing down, because each one changed the answer:

- `page.evaluate('(n) => ...')` hands Playwright a STRING, which it evaluates as
  an EXPRESSION -- the function comes back uncalled and the read is undefined.
- the first page measured paid vite's cold compile of the whole home page.
- **the scroll did not cover the sampling window.** Driving the wheel from the
  Playwright side gave ~0.4s of scrolling inside a window that is 2s at 60fps
  and TEN SECONDS at 83ms/frame, so most samples were idle frames and the thing
  under test -- `measure()` rewriting the ring on capture-phase scroll -- was not
  running for most of them.
- and comparing two RUNS rather than two arms moved the control too: the no-tour
  cell went 33.4ms to 49.9ms between two runs of code it does not even mount.

The instrument that settles it scrolls one step per sampled frame and runs every
arm INTERLEAVED in one page per width, each arm asserted by reading the spot's
own computed `box-shadow` back. 120 frames a reading, three readings an arm:

| arm | 2707x1074 median | 1440x900 median |
| --- | --- | --- |
| `shadow` (shipped, 5414px spread) | **50.0 / 50.0 / 50.0** | 16.7, p95 16.7-16.8 |
| `shadow-tight` (100vmax, 2707px spread) | 50.0 / 50.0 / 50.0 | 16.7 |
| `clip` (the built replacement) | **83.3 / 83.3 / 83.3** | 16.7, p95 **33.4-50** |
| `panels` (four solid fixed rects) | 50.0 / 50.0 / 50.0 | 16.7 |

Three things follow, and the first is the one that matters most:

1. **The spread is not the cost.** Halving it changes nothing. Chromium clips
   the shadow's paint to the damage rect, so the "118 megapixels of shadow"
   arithmetic describes a region that is never rasterized.
2. **The prescribed replacement is a regression**, by 33ms of median at 2707 and
   by 2-3x of p95 at 1440, stable across seven readings in two separate scripts.
3. **The bounded alternative buys nothing.** Four panels measure identical to the
   shadow and would cost the hole its rounded corners.

**And the premise does not reproduce on this container at all.** With the entire
tour layer hidden, the same page at 2707 measures **49.9ms** against the
shadow's **50.0ms** -- indistinguishable. 0276 measured a control of 16.7ms at
that width; this container's is 33-50ms, so it is roughly three times slower at
2707 and the page is already off 60fps before the tour opens. Either the
containers differ that much or something else on the page has changed since; the
ratio, which is the only thing 0276 claimed transfers, is 1.0 here.

**So nothing shipped.** `src/lib/tour/SpotlightTour.svelte` is byte-identical to
`origin/main` (md5 `463c5aa909888e7e6970faf7f93497b2`, re-checked against
`git show HEAD:`). Shipping a measured regression to satisfy a prescription is
the opposite of what the prescription was for, and 0276's own precedent on a
different candidate is the same one: "No change was made. Editing CSS that
measures correct to fix nothing would risk... for no gain."

**Caveat that cuts both ways:** this is a 4-core container running Chromium with
`--disable-gpu`, so everything is CPU-rasterized. On the school's 6-8 year old
desktops, which have a GPU, the ordering of these four arms could differ. What
does NOT depend on that is `shadow` ≡ `shadow-tight`: the spread is not the cost
on any machine where the shadow's paint is clipped to the viewport, which is
every Chromium.

## C. `/dev/tour`'s "Reset flags + reload" resets the pathway sheet again

Harness only, no product surface. The control cleared
`sessionStorage['pathway-picker-dismissed']`, which is precisely where ledger
0276 moved the deferral OUT of, so it had silently stopped resetting the one
thing it is named for.

**It does not name the new key either, and that is the point.** `DEFER_KEY` is
module-private in `PathwayPicker.svelte` on purpose -- that module's own header
says two copies of "has this been deferred" is the pair that drifts, and
`HomeTour` was already taken off its inline copy. So the reset calls the
exported writer with an expired stamp:
`deferPathwayPicker(Date.now() - PATHWAY_DEFER_MAX_AGE_MS - 1)`. The predicate is
`now - at < PATHWAY_DEFER_MAX_AGE_MS`, so an expired record is the same answer as
no record, through the same rule -- and because the predicate consults the legacy
session key only when there is NO durable record, one call resets both stores.
`PathwayPicker.svelte` was not touched.

**Verified by pressing it**, three steps, both trees:

| | before | after |
| --- | --- | --- |
| "Choose later" pressed | sheet gone, `pathway_picker_deferred` written | same |
| reload | sheet still gone (the deferral is durable, which is 0276's fix) | same |
| **"Reset flags + reload" pressed** | **sheet still gone**, record still live | **sheet BACK**, record `{"v":1,"at":<expired>}` |

`/dev/tour?mode=picker`'s own spec is unaffected -- each harness run gets a fresh
context -- and it still measures 0 outside threshold.

## D. Decision 12 is closed, and this bundle wrote no code for it

The prompt's claim was that the notebook toolbar's four controls are still under
the floor and that the fix is one line. **The tree disagreed: both halves were
already shipped**, by prompt 0119, which re-laid the toolbar so the list
controls took a line of their own and became ordinary 44px boxes (`.tool-btn`)
rather than `.inline-link.tap-reach-44` words, and which put `flex-wrap: wrap`
and `min-width: 0` on `.tools` with the automatic-minimum trap written beside
them. That bundle said in its own history entry that flipping decision 12's
status "belongs to whoever owns `docs/decisions/`". This is that.

Re-measured rather than read off the entry, in the BUSIEST state (a query typed
so Clear renders, Select pressed so it reads Done), anchored at
`.list-head .tools` with the match count printed beside it because `.tools`
matches in `NotebookEntryCard` too:

| control | 375px | 1440px |
| --- | --- | --- |
| sort select | 112 x 44 | 112 x 44 |
| Clear | 52.4 x 44 | 52.4 x 44 |
| Expand all | 78.4 x 44 | absent (`{#if !wide}`) |
| Select / Done | 51.8 x 44 | 51.8 x 44 |

**0 of 4 under the floor at 375, 0 of 3 at 1440, 0px document overflow at both**,
`.tools` 293x96 at 375 (two lines) and 366x44 at 1440, `scrollWidth` equal to
`clientWidth` throughout. No fifth control in the row is under the floor.

**Mutation proof:** `flex-wrap: wrap` and `min-width: 0` removed, the busiest
state at 375 goes to a **74px document overflow** (`.tools` scrollWidth 408
against clientWidth 293); 1440 unchanged; restored from a copy and md5-re-checked
(`39634f4e54f54d64468b12780f8527a2`), never with `git checkout --`. The entry
predicted 13px -- its arithmetic was for a row without Clear in it -- so the
shape reproduces and the number does not. **`npm test` cannot see this at all**:
82 files and 1014 tests pass with the mutant in place, because `tests/dom/` has
no layout engine.

## Verification

- `npx svelte-check`: **0 errors, 37 warnings in 20 files**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`, unchanged before and after. Re-derived with the two
  `PUBLIC_SUPABASE_*` values exported and `svelte-kit sync` first, per CLAUDE.md;
  the line in that file is correct on this tree.
- `npm test`: baseline **527 files, 9866 tests passed, exit 0** (1416s); after,
  see the run recorded at the end of this entry.
- `npm run verify:browser`: `--route notebook` **500 measurements, 0 outside
  threshold**; `--route home` **110, 0**; `--route tour` **1028, 0**.
- Mutation proofs for A, B and D are above, each with its restore verified.
  Item C's proof is pressing the control, both trees, also above.

## Not verified, and not verifiable here

- **Whether FRC 2026/27 is really live, who teaches it, and which term it runs
  in.** No session in this repo can reach production, and `status`, `instructor`
  and `term` are all read by nothing that counts.
- **Whether the preview renders correctly**, which no cloud session can check.
- **Whether students are in class right now.** A push to `main` deploys
  `ideabosco.com`; this session has a clock and no timetable.
- **Web fonts do not load in the harness** (the proxy resets
  `fonts.googleapis.com`), so every text measurement here is in the fallback
  stack, and `prefers-reduced-motion` is `no-preference` throughout.
- **The frame-time numbers are from a 4-core container with `--disable-gpu`**,
  not from a school desktop.

## For Mr. Pina

1. **The spotlight tour's scrim is already the cheap one, and 0276's finding
   does not reproduce here.** The measured table is in section B. Nothing was
   changed. If the tour still feels slow on a school machine, the thing to
   measure there is the PAGE (the particle canvas and the launcher), not the
   scrim: with the whole tour layer removed this page measures within 0.1ms of
   the tour being open.
2. **`--dim` on `--bg1` is used by the tour callout's own controls** (Back,
   Next, Skip tour and the close X), where CLAUDE.md already records that token
   as measuring **4.46:1** -- under the 4.5 floor. It was left alone because
   item B shipped nothing and a colour change is not what this bundle was for,
   and no harness row points at it, so it is not a standing finding either. It
   is a real one and it needs an owner. The same section of CLAUDE.md says
   `--dim` "is still a failure waiting for a use"; this is the use.
3. **Those same controls are under the 44px floor** (`.tour-btn` is 0.4rem of
   padding on a 0.66rem font). Named rather than fixed for the same reason, and
   named here rather than in a decision entry because `docs/decisions/` is not
   on this bundle's Owns line.
4. **The whole spotlight tour has no browser-harness coverage** -- no spec
   mounts `SpotlightTour` at all, and nothing in `tests/` references
   `.tour-spot`, `.tour-backdrop` or `.tour-callout`. A `tour-mode-student.mjs`
   spec pinning the scrim, the unclipped catcher and the two findings above is
   the natural follow-up; it was not added here because item B ships no change
   for it to guard.
5. **`SECTIONS`'s `status` column is stale**: `summer-2026` still reads `live`
   although FSP has concluded, and every 2026-27 row still reads `upcoming`.
   Nothing counts it, so nothing is wrong on screen, but the next person to read
   that file for the truth will be misled.
