# `tools/browser-verify` -- the repeatable visual pass

Every session in this repo for several days ended by reporting that no browser
was available and the visual pass was skipped, while `CLAUDE.md` cites Chromium
measurements as established fact. Both cannot be true. This is the instrument
that settles it: a session either runs this and reports numbers, or names
precisely what stopped it.

```bash
npm run verify:browser                  # both widths, every listed dev route
npm run verify:browser -- --probe       # what this container's browser can do
npm run verify:browser -- --selftest    # negative controls; exits 1 if a check is broken
npm run verify:browser -- --route pathways --width 375
npm run verify:browser -- --break tiny-taps --route spec-table
npm run verify:browser -- --break motion --route marks
npm run verify:browser -- --json out.json --verbose
```

## What this container actually has

Measured 2026-08-27, not assumed:

| Question | Answer |
| --- | --- |
| Chromium present? | **Yes** -- `141.0.7390.37` at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` |
| How is it found? | `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, registered by a global playwright `1.56.1` |
| Does it start headless? | **Yes.** `--dump-dom about:blank` returns the document. The dbus errors on stderr are noise -- there is no system bus here and Chromium does not need one |
| `npx playwright install chromium` | A **no-op**: build 1194 is already at the install location |
| Could it download if it had to? | **No.** `cdn.playwright.dev` answers **403 to CONNECT** through the agent proxy (`gateway answered 403 to CONNECT (policy denial or upstream failure)`) |
| npm registry | Reachable -- `registry.npmjs.org` is in `no_proxy` |
| Screenshots | **Work** (6086-byte PNG from the probe) |
| `requestAnimationFrame` | **Fires** |
| `IntersectionObserver` | **Fires** |
| `ResizeObserver` | **Delivers** |
| Canvas `getImageData` readback, `color-mix()` parsing | **Work** |
| Web animation interpolation | **Works** (opacity 0.5 at the midpoint) |
| Google Fonts | **Blocked** -- the proxy resets `fonts.googleapis.com` |

**The last five rows are the point.** `CLAUDE.md`'s "The Browser pane" section
documents a long list of things that pane cannot do -- no compositing, rAF
frozen, `IntersectionObserver` never fires, `ResizeObserver` never delivers.
Those are facts about **that pane**, and sessions have been carrying them over
as facts about the environment. They do not hold here. Re-run `--probe` rather
than trusting this table; it prints the same rows.

### The dependency is pinned, and the pin is load-bearing

`playwright-core@1.56.1`, **exact**, chosen over `playwright`:

- `playwright-core` has no install-time browser download, so `npm install` in
  this repo cannot be broken by a blocked CDN.
- The version must match the preinstalled build. Playwright pins a chromium
  build number per release; `1.56.1` wants build **1194**, which is what is on
  disk. A different minor wants a different build, and that download is
  **403** here -- so a casual `npm update` is what would take this harness out,
  silently, with a "browser not found" that reads like a missing tool.

`browser.mjs` still resolves the executable through a reported fallback chain
(`chromium.executablePath()`, then `$CHROMIUM_PATH`, then three known paths), so
a moved binary is a named error rather than a stack trace.

## What it covers, and what it cannot

**It drives `/dev` routes only.** Those mount the real components with fixture
data, need no account and no Supabase, and are compiled out of a production
build. This is a hard boundary, not a starting set.

**It drives a SELECTED SUBSET of them, and that is also deliberate.** There are
**65** directories under `src/routes/dev` with a page, and `routes.mjs` lists
**59 specs over 32 distinct routes** (re-derived 2026-08-30 against `ROUTES`
itself, on this branch merged with `integration` at `cadf918`: this branch's
classroom-view-as-notebook and notebook-review-realtime-stalled specs, plus the
coins, coin-desk, frc-state, maps-placement, maps shelf-entry and
notebook-review-viewer specs `integration` brought). This line has been
re-derived twice on this branch in one session, because `integration` moved
underneath it both times: it read 45 over 32 on `main`, then 57 over 31 against
`integration` at `47c77b1`, and 59 over 32 against `integration` at `cadf918`.
`integration`'s own copy of this line was stale throughout (it stated 44 over 28
against a tree measuring 55 over 30). Earlier readings, oldest last: 36 over 28
the same day, 29 over 24 on 2026-08-29, and 25 over 20 the same day, before the
marks, room-split, coin-preview and short-link specs. The two maps placement
specs are why a spec count can move without the route count moving:
`?state=place` is a fifth STATE of `/dev/maps-edit`. **This count is a snapshot, not a derived value, and it WILL
go stale the next time a session adds a route --
do not trust this line, re-derive it**: `ls routes/*.mjs | grep -v '/_' | wc
-l` for the spec count, or import `routes.mjs` and read `ROUTES.length`
against the distinct `path.split('?')[0]` values (alias-resolved) for both
numbers at once.
A route pass nobody waits for is a pass nobody runs. Routes earn a place by
one question -- if this surface broke silently, would anyone find out before a
student did -- not by existing. `docs/history/dev-routes-audit-5nocl7.md` has
the audit that produced the current list and the reasons the rest were left
out.

**A ROUTE IS ONLY AS GOOD AS THE ROOM IT MOUNTS IN.** A `/dev` route has no
layout above it, so it carries whatever scoped-theme wrapper its own page puts
there -- and four harnesses were found measuring a different room from the one
production gives them (`docs/history/marks-reduced-motion-test-kzaoyk.md`, and
`routes/README.md` has the working rules). Check the layout chain before
trusting any contrast or geometry number here.

**It cannot reach a real route.** `/classroom`, `/notebook`, `/foundry` and the
rest need a Bosco Tech Google session, and OAuth against a real school account
cannot happen from an automated run. A signed-in surface is verified with
`/dev/login` against a local Supabase stack (see `CLAUDE.md`), by hand. Do not
report this harness as covering a signed-in page.

Two further limits belong in any report that quotes these numbers:

- **Web fonts do not load.** The harness blocks every non-loopback request --
  the proxy resets `fonts.googleapis.com`, and an unanswered request hung the
  page load for 8s each, which took one run to **305 seconds**. Blocking is
  also what makes the run deterministic. But it means text is measured in the
  **fallback stack**, so **every pixel measurement is approximate, including
  tap-target geometry** -- a control's box depends on the line box of
  Rajdhani, which this run never loads. **Contrast is unaffected**: colour is
  resolved by painting the computed `color`/`background` and reading the
  pixel back (see below), which does not depend on which face rendered the
  glyphs. Every run prints the blocked count and says so.
- **`prefers-reduced-motion` is `no-preference` for every check except
  `motion`.** The context is opened at `no-preference` and left there, so a
  contrast, geometry or presence finding describes that state and never the
  reduced one -- the two are not inferable from each other. **`motion` is the
  exception and the only one**: it emulates the media feature itself, measures
  both states, and puts the page back to `no-preference` before it returns, so
  nothing measured after it is reading a page left in the wrong state. This
  paragraph used to say the reduced path was "not exercised" flatly; that was
  true until `/dev/marks` and is now true only of the other seven checks.

### Known findings, and the two limits above as they apply to them

**The whole run reports exactly 6 measurements outside threshold** (re-derived
2026-08-30 on this branch merged with `integration` at `cadf918`: **118
route/width runs, 1538 measurements**), and they are THREE findings: two seen at
both widths, and one seen at 375px only on two different routes. Anything
else is new. **This paragraph is a snapshot and it drifts** -- the run above it
is the authority, and a session measuring a different number corrects this line
in the same change, saying which finding moved.

The count moved for two independent reasons and neither of them is a check being
added -- one reason from each of the two lanes that corrected this paragraph.
The 28 `prepare` steps are measurements now, at two widths each, which took
`main`'s own tree from 532 to 580; and `integration` carries seven route specs
`main` does not, which is the rest of the way to 780. The three findings this
paragraph used to list are down to one. The other two are named below rather
than deleted, because a finding that vanishes without a word reads like a check
that stopped running.

- **`/dev/foundry-submit`: the refusal/warning sentence row reads `present 2`
  against an expected 4**, at both widths, and it still reproduces on this
  merged tree. NOT introduced by the branch that found it: measured on a `git
  stash`ed tree with that branch's changes removed entirely (and the foundry
  files `touch`ed afterwards, per the stash trap in `CLAUDE.md`) and it
  reproduces identically. It is the foundry lane's -- neither the notebook
  branch nor `integration` touches a file this route loads -- and is recorded
  here rather than fixed across a lane boundary. **A sibling branch,
  `claude/navigation-loading-indicator-laqsgc`, corrects this spec**, so a tree
  carrying that branch reports 4 outside threshold where this one reports 6.
- **`/dev/pathways`: the two harness controls measure 194.7x26.2px** (min
  dimension 26.2px), under the 44px floor at both widths. This number is a
  **tap-target measurement**, so the fallback-stack limit above applies to it
  directly -- the true box under Rajdhani may differ slightly, though not
  enough to cross the 44px line from 26.2px.
- **`/dev/coins` and `/dev/coins-signedin-1`: 51px of horizontal overflow at
  375px** (scrollWidth 426 vs clientWidth 375; the overhanging nodes are
  `#student-drawer`'s header and body, its close button, and the drawer's name,
  stats and transaction-title rows, each reaching right=750 or 727.6 against a
  375 viewport). **At 375px only -- 1440px is clean on both routes**, which is
  why one finding accounts for two of the six measurements rather than the four
  a both-widths finding would give. It arrived with the coin-ledger specs rather
  than with this bundle, and `integration`'s own copy of this paragraph never
  recorded it because that copy had gone stale (it stated 44 specs against a
  tree carrying 55). The drawer is in the LEGACY coin ledger's shipping bytes,
  which are frozen, so it is recorded here and not fixed: `/dev/coins` is
  labelled "shipping bytes" for exactly that reason.
- **Two findings this list used to carry no longer reproduce**, measured on the
  same run rather than assumed: `/dev/coin-preview`'s student picker is
  **352x44** (it was 247.3x19 at 375px and 352x19 at 1440px, under the 24px
  absolute floor as well as the 44px one) and `/dev/short-links`'s composer save
  control is **112.8x44** (it was 76.1x24, a primary action that had taken
  `ShortLinkManager`'s row-ops chip floor by sharing `.btn.tiny`). Both were
  owned by their components rather than by this harness, and both have since
  been fixed there.
- **The chip label on its own fill measures 4.84:1** on `/dev/pathways`,
  which passes. This is a **contrast measurement**, which the font-loading
  limit does not qualify (see above) -- the ratio is real regardless of which
  face painted the glyphs.
- **A single `net::ERR_ABORTED` on `/dev/pathways/__data.json`** was seen once
  and did not reproduce on a second run. Treat a non-reproducing abort as
  flaky and say so rather than reporting it as a finding.

## The checks

Every check returns a **measured value**. None returns a bare pass/fail: a
number is auditable by the next reader and a green tick is not. Where a
threshold exists it is printed beside the measurement, never instead of it.

| Check | Measures |
| --- | --- |
| `horizontal-scroll` | `scrollWidth - clientWidth`, plus the widest offending elements and their overhang in px |
| `contrast` | WCAG ratio of the text against the **real rendered ground**, naming which ancestor supplied it |
| `tap-target` | Each control's box, the smallest min-dimension, counts under 44px and under the 24px floor, and a centre hit-test |
| `tap-reach` | A `.tap-reach-44` control's expanded HIT AREA (its `::after` pseudo-element's own geometry, recomputed the way the CSS computes it), not its box -- plus a 5-point hit test across that area for a tap a neighbour might be stealing |
| `presence` | **present**, **visible** and **aria-hidden** counts -- three different questions -- with a reason for every invisible node |
| `dom-order` | Which of two rendered elements precedes the other, read from `compareDocumentPosition` -- never a computed boolean the page happens to expose |
| `order-result` | An array a page-side action wrote (a dev transport's own call log), compared element-for-element against what it should have written -- for a claim about a WRITE, where a fixture backed by static data never re-renders to prove it on screen |
| `motion` | Per ELEMENT, in BOTH media states: how many elements animate under `no-preference`, and how many are still moving, still transformed or unpainted under `reduce`, plus the lowest resting opacity in the set |
| `console-errors` | Console errors and uncaught exceptions during the run |

Three details are deliberate:

- **Contrast is measured by painting.** Colours are resolved by setting
  `ctx.fillStyle` and reading the pixel back, because a regex over computed
  styles skips `color-mix()` and `color(srgb ...)` silently and then reports the
  plate instead of the real ground. Alpha on the text is composited over that
  ground before the ratio is taken, and a `background-image` anywhere up the
  stack is flagged so the number is not read as more than it is.
- **A control inside a `<label>` is measured at the label**, which is what a
  finger hits, and both boxes are printed.
- **`aria-hidden` is a third question, not a visual one.** Folding it into
  visibility reported a perfectly painted 15.2x15.2 decorative glyph as
  invisible.
- **Visibility walks ANCESTORS for opacity, because `opacity` is not
  inherited.** A child of an `opacity: 0` parent computes opacity 1 and used to
  report itself visible while being painted nowhere -- the exact false green
  this check exists to prevent. Found by a live control: `--break invisible` set
  opacity 0 on three routes' room wrappers and every presence row came back
  green. The reason string NAMES the ancestor that did it. It also revealed that
  seven assertions on `/dev/home-order` and `/dev/home-feed` had been passing
  vacuously about rows inside entrance-faded cards; those specs settle the
  entrance in `prepare` now (see `SETTLE_ENTRANCE`) rather than writing the
  vacuum down as an exemption.
- **The centre hit-test is recorded but is only meaningful IN THE VIEWPORT.**
  `document.elementFromPoint` answers null outside it and the harness never
  scrolls, so a control far down a long page reads `centreHitsSelf: false` --
  measured on `/dev/foundry-submit`, where the five copy controls sit ~3000px
  down at 375px and all five read false, while the same control scrolled into
  view hit-tests to itself. It is an artefact, not a finding, and it changes no
  verdict: `tapTargets` gates on the geometry alone. Do not "fix" it by
  scrolling before measuring -- that moves the boxes the check exists to
  report.

## Reaching a state: `prepare`, and why it retries

**Paint is not interactivity, and no window marker separates them.** The
server-rendered markup is on screen before hydration attaches a single handler,
and the `__SVELTEKIT_*` globals are set by the client entry module before that
too. Measured on `/dev/spec-table`: every global present at 600ms while two
clicks in a row did nothing, and the same single click taking effect at 2500ms.

So nothing here waits on a hydration signal. `waitForApp` waits for painted
content and then for the **DOM to stop changing**, and anything that clicks uses
`clickUntil`, which repeats the click until a predicate holds and **reports the
attempt count**. A step that needed four tries is telling you something about
the surface that a silent success would not.

A `prepare` predicate is a function **source string**, invoked as `(${src})()`.
`page.evaluate(string)` treats its argument as an expression, so an arrow
function source evaluates to a function object and is never `=== true`; that bug
reported twelve failed attempts on steps whose clicks were working perfectly.

### Every step is a MEASUREMENT, not a narration

Prepare steps used to be prose printed above the results (`prepare: clicked
...`). They are `prepare-click`, `prepare-wait` and `prepare-eval` rows now,
counted in the summary and gating `--strict`, because the old shape let a step
fail for nothing: a spec handed three broken steps at once -- an `evaluate` that
throws, a `click` whose selector matches nothing, a `waitFor` that times out --
reported **"4 measurement(s), 0 outside threshold" and `--strict` exited 0**,
over a route whose every number described a state the run never reached.

**A click step passes only when the click ACTUALLY FIRED.** `clickUntil`
evaluates the step's `until` BEFORE clicking and short-circuits on "already
satisfied" (browser.mjs explains why). That is correct behaviour and a silent
trap: a predicate satisfiable by the page's RESTING state means the click never
physically fires, and the report still says "clicked". It has bitten twice for
real -- `/dev/classroom-split/s-1?manage=1` when the bulk bar started rendering
at rest, `/dev/notebook` when `.pick.free` started `aria-pressed` true -- and
measured on `/dev/song-queue` with the component's `notice` seeded non-null, the
step printed `1 matched, 0 attempt(s), already satisfied`, the whole
aria-disabled click-through contract went unproven, and the run reported 0
outside threshold.

So `attempts === 0` is a finding, and so is a click with no `until` at all. The
two ways out are both deliberate and both visible in the report: **write a
predicate naming something only the click can produce** (the preferred one --
`bulk-count` rather than `bulk-bar`), or pass **`force: true`**, which
guarantees the click fires and annotates the row `[force: predicate not required
to discriminate]` so the next reader learns it from the line rather than from
the spec file.

**`waitFor` returning at 0ms is NOT a finding**, and that is the difference from
a click: waiting is not supposed to cause anything, so a payload that had
already landed is the step working.

### `waitFor` -- the state that arrives rather than being pressed

`clickUntil` covers a state reached by pressing something. **`{ waitFor: '<predicate
source>', timeoutMs }`** covers the other one: a state that arrives when an async
payload lands, where there is nothing to press and pressing something arbitrary
to borrow a retry loop is a lie about what the step does. The wait is REPORTED in
milliseconds and a predicate that never holds prints `FAILED`, so the
measurements after it are read as describing a state the run never reached.

**It is not a longer `settleMs`, and the difference is the whole point.**
Measured on `/dev/notebook-review`: the first visit to a route pays vite's
module-graph compile, the run visits 375 before 1440, and the compliance grid's
transport had not resolved 700ms after `waitForApp` returned. The cold 375 pass
measured **0 cells** and the warm 1440 pass measured **30** -- which reads
exactly like a console that renders no grid at phone width and is nothing of the
kind. Warm, both widths render the identical 30 cells. A fixed timeout long
enough today measures an empty page the day the payload gets slower, silently,
because every selector honestly matches nothing.

### `evaluate` steps print their return value

An `evaluate` step's return value is printed beside it when it is a string or a
number. `SETTLE_ENTRANCE` in `routes/_shared.mjs` uses that to say how many cards
it settled -- a settling step that reports `0 course-card(s)` is a silent no-op
made visible, which is what happens the day a class name moves.

## Negative controls -- the part that makes the numbers mean anything

A check that has never failed has not been tested.

`--selftest` puts every check to a pair of self-contained fixtures, one built to
break it and one built to pass it, and prints both measured values. It exits
non-zero if a check comes back green on the broken fixture or red on the sound
one, because unlike the measuring run there is a right answer here. **64
controls, 32 negative and 32 positive** (re-derived from a `--selftest` run
2026-08-30 on `claude/notebook-audit-fixes-0tkfek`, unchanged by it -- that
branch added route specs, not checks; it read 54 on 2026-08-29, 44 the same day,
and 36 on 2026-08-28. A number
written down here is a number that drifts, so re-derive it rather than trusting
this line).
Fixtures rather than a mutation of `src/` on purpose: a mutation proves a check
once in a tree that then has to be restored byte-identically, this proves it on
every run and touches nothing.

**`tap-reach` is a SEPARATE check from `tap-target`, not a variant of it, for a
control whose class is `.tap-reach-44` rather than `.tap-44`.** `.tap-reach-44`
(app.css) grows a control's HIT AREA with a centred `::after` pseudo-element
instead of growing the control's own box, for a control sitting inside a line
of text where inflating the box would reflow the writing around it
(`IDEA_INTERFACE_STANDARDS` 10). Pointing the ordinary box-measuring
`tap-target` check at one of these reports a finding on every single one --
CLAUDE.md names the exact case: "a box-height check would report 20 findings on
a surface that is actually fine." `tap-reach` instead recomputes the pseudo's
geometry the way the CSS computes it (only when a `::after` genuinely exists on
that element -- `getComputedStyle(el, '::after').content` is `'none'`
otherwise, and crediting every element with a reach it does not have would be
a worse defect than the one this check exists to catch) and HIT-TESTS five
points across it -- the centre and the midpoint of each edge -- because a
neighbouring reach or an opaque sibling overlapping part of it steals a tap
silently, which no amount of geometry alone can see. Sample points outside the
viewport are marked `offscreen` and excluded from the stolen-tap count and the
gate, the same artefact and the same fix `tap-target`'s own centre hit-test
already documents (see `/dev/foundry-submit` below).

**`click-through (aria-disabled control)` is not a check, it is the CLICK
MECHANISM `prepare` steps use, and it earns a control for the same reason
`wait-for` does.** This repo uses `aria-disabled` over `disabled` deliberately,
in several places, so a blocked control can still explain itself when tapped
(CLAUDE.md). Playwright's `locator.click()` performs an actionability check
that refuses a control carrying `aria-disabled="true"` -- the negative control
proves it, on a real button, in this container's own Chromium: the click times
out and the handler never fires. `clickUntil` now dispatches at the element's
own bounding-box centre with `page.mouse.click()`, a real coordinate click with
no actionability gate in front of it, which the positive control proves lands.

`--break <preset>` is the **live** control: it injects a defect into the real
page before measuring, so a session can prove a check bites on the surface in
front of it. Each preset moves exactly one measurement and leaves the rest
green, which is the property that makes it worth anything.

| Preset | Reddens |
| --- | --- |
| `overflow` | `horizontal-scroll` |
| `tiny-taps` | `tap-target` |
| `low-contrast` | `contrast` |
| `invisible` | `presence` |
| `console-error` | `console-errors` |
| `blank-text` | `text-contains` |
| `motion` | `motion` |

**`blank-text` names the compliance footers rather than sweeping the
document**, and that is deliberate: blanking every element would redden
`contrast` and `tap-target` too, and a control that reddens everything proves
nothing about the one check under test. It empties `.gt-tm p, footer p`, so it
only bites on a route that renders one. `overflow` and `invisible` name room
wrappers for the same kind of reason, and both now include `.gt-root`.

### `text-contains` -- what an element SAYS

`presence` proves an element is in the DOM and paints; `contrast` proves its ink
is readable. **Neither reads a word of it.** For a compliance surface that is
the whole question: GAUNTLET's trademark footer carries
`docs/GAUNTLET-DESIGN.md`'s nominative-attribution requirement, and a footer
whose sentence had lost "Dassault Systemes" is present, visible, and clears
4.5:1 exactly as before -- every other check in this file comes back green on
it. `textContains` takes `must` and `mustNot` phrase lists, collapses
whitespace on both sides (source is wrapped across lines; an editor reflowing a
paragraph must not redden a compliance check), and **fails on zero matched
nodes**, because a selector that matches nothing satisfies "no forbidden phrase
appears" perfectly. `mustNot` is the direction `must` cannot see: a sentence can
keep every required phrase and add one that reverses it.

### `presence`: both counts are FLOORS, and both have a ceiling

`expectPresent` and `expectVisible` are floors (`>= n`). A floor is the right
default for "the page rendered these at all" and the wrong one for every claim
of the form "and no more than these".

**`expectPresent: 0` NOW MEANS EXACTLY ZERO, and it used to mean nothing at
all.** `present >= 0` holds for any number of nodes, so every "must be absent"
row in `routes/` -- around thirty of them -- could not fail. Measured rather
than reasoned: an `<svg>` injected into `TrademarkFooter.svelte` produced
`ok presence [no mark of any kind inside the footer] present 1, visible 1` and a
run reporting 0 measurements outside threshold, on the one row whose whole job
is `docs/GAUNTLET-DESIGN.md`'s "nominative text only, never the logo or a
lookalike". `maxPresent` is the ceiling, **and it defaults to 0 whenever
`expectPresent` is 0** -- a caller asking for zero is always stating an absence,
and a floor of zero is not a weaker assertion than they meant, it is no
assertion. Pass `maxPresent` explicitly on any row whose own prose states a
count ("2 chips painted, never 3", "5 action blocks, never 6"); leave it off
where a floor is genuinely wanted (`/dev/pathways` counts chips across every
stage on purpose, and says so).

**AN ABSENCE ROW STILL CANNOT SEE A RENAMED SELECTOR.** `present 0` reads the
same whether the rule holds or the markup moved, and no ceiling can separate
those. Every absence row in `routes/` therefore sits beside a positive control
in the same spec -- the footer's own `.gt-tm`, the song queue's `[aria-disabled]`
twin, the 30 grid cells beside the two absent cell states -- and `--selftest`
carries a control that PROVES the limit rather than leaving it to be
rediscovered. A new absence row without a positive control is an assertion about
a selector, not about a surface.

`maxVisible` is the same ceiling one axis over, and it exists because some rules
here are stated as prohibitions rather than minimums. Where the visible half has
no ceiling the threshold column now prints **`visible unconstrained`** rather
than `>= 0 visible`: the remaining unconstrained rows are deliberate
(`.gt-tree` paints at 1440 and not at 375, and the spec says so), but deliberate
and invisible are different things. Omitting either ceiling on a row whose floor
is above zero changes nothing.

**It is not the right tool for an element that is hidden by being moved.**
Measured on the GAUNTLET FeatureManager rail: at 1440px the collapsed rail is
`translateX(calc(-100% - 1.5rem))` plus `pointer-events: none`, so it keeps a
real 232px box entirely off the left edge and `isVisible` correctly reports it
as painted -- `maxVisible: 0` reddened a rail behaving exactly as designed.
`isVisible` does not model "outside the viewport" and **must not be taught
to**: `tapReach` already reports off-screen sample points as a harness
artefact, so changing that predicate would move readings on routes far from the
one being worked on. Assert the EFFECT instead, with an `orderResult` probe
that hit-tests the element's own box (`/dev/gauntlet-shell` does), which
answers the same for `display: none` at 375 and an off-screen transform at 1440
-- two mechanisms, one guarantee.

### `motion` -- the reduced-motion gate, measured in the state that is hard to see

`CLAUDE.md` states one rule three times and not identically in any two of them.
The narrowest is under the launcher-card section: "Every other app mark is a
component in `$lib/marks` with a 3-4.6s loop gated behind
`prefers-reduced-motion: no-preference`, and **nothing is hidden in a base
state**: with the animation cancelled every animated element is at full opacity
and no transform, so a reduced-motion reader sees the whole glyph." The two
looser ones are "Everything animated is gated behind `prefers-reduced-motion`"
and AnimatedLogo's "spin is gated behind `prefers-reduced-motion:
no-preference`". The FRC exception is the other direction: "THE FRC MARK IS
NEVER ANIMATED ... FIRST's brand guidelines prohibit altering the mark, and
motion is an alteration."

**MEASURING THE ANIMATION RUNNING PROVES NOTHING ABOUT THE CANCELLED STATE**,
which is the whole difficulty. So the check flips Chromium's own emulation of
the media feature and reads the SAME elements twice:

- **RUNNING** (`no-preference`) discovers which elements animate at all. That
  set is the POSITIVE CONTROL: an `expect: 'gated'` entry that finds NOTHING to
  animate FAILS, because a sweep with an empty case list satisfies "nothing
  moves under reduce" perfectly and is exactly the shape a renamed class
  silently produces.
- **REDUCED** re-reads those elements. Each must have no animation attached,
  `animation-name: none`, `transform: none`, and must still be painted.

**DISCOVERY IS `Element.getAnimations()`, NOT A WALK OF `document.styleSheets`.**
The stylesheet walk is the worse instrument here for a reason `CLAUDE.md`
already names: `CSSStyleRule` has a `cssRules` property now (CSS Nesting) and
an empty `CSSRuleList` is truthy, so the ordinary shape for walking a sheet
skips every plain rule's declarations and comes back with zero matches -- which
reads exactly like a clean result. Asking the element what is attached to it has
no selector to fail to parse and no sheet to fail to read, and it reports an
`animation-play-state: paused` animation too, which is correct: paused is
attached.

**THE PAINTED PREDICATE IS NOT `isVisible`, DELIBERATELY.** `isVisible` flags a
zero-area box, which is right for a laid-out element and wrong for SVG stroke
geometry -- `<path d="M5 10v20" />` is a vertical line, so its box is 0px wide,
and every animated rail, tick and node in these marks would report itself
invisible. `motion` keeps the opacity/display/visibility half (ancestor walk
included, because `opacity` is not inherited) and drops the geometry half.

**"FULL OPACITY" IS REPORTED, NOT GATED, AND THAT IS ON PURPOSE.** These glyphs
author depth with opacity -- `.node { opacity: 0.35 }` in `GauntletMark` is its
resting value, not a dimmed frame -- so a gate at 1.0 would fail correct marks
and a gate at 0.35 would be fitted to today's data. What is GATED is "painted at
all", on the harness's own existing 0.01 floor; what is REPORTED is every
animated element's resting opacity and the lowest in the set, which is the
number a future reader can audit.

**ONE CALL SWEEPS EVERY ENTRY IN A SPEC.** Each media flip costs a settle, and
eleven marks measured one at a time would pay twenty-two per route/width. Two
flips serve the whole spec, which is why `motionSweep` returns an ARRAY of
results rather than one.

## Why it is not in `npm test` and not in CI

A full run is **265.6 seconds** (2.4s of it the vite boot) for **59 route specs
x 2 widths = 118 runs and 1538 measurements**; `--selftest` is ~32s (64
controls). That is measured 2026-08-30 on this branch merged with `integration`
at `cadf918`. Against `integration` at `47c77b1` the same branch read 253.3s for
114 runs and 1460 measurements; `integration` itself read 207.1s for 88 runs and
1076 measurements. This branch's own findings paragraph earlier recorded a
90-run/1064-measurement reading with no wall clock beside it; it read 184.7s for
72 runs and 780 measurements earlier the same day, and 152.2s for 58 runs and
580 measurements on `main` alone. The per-route/width cost has held at roughly
2.2s across that whole range.

**MEASURE IT, DO NOT QUOTE THIS LINE.** It has been wrong before in the
direction that matters: it read "~34 seconds ... 8 route specs" against a tree
carrying 14, and a task brief written from it put the real figure at "roughly 22
seconds" when the same tree measured **71.9s**. It later read "~91 seconds ...
17 route specs" (91.4s measured 2026-08-27); three more specs
(`/dev/notebook`, `/dev/notebook-review-student`, `/dev/song-queue`) measured
**+9.3s** on 2026-08-28, close to the ~2.6s-per-route/width estimate this line
already carried (~+15.6s expected for 6 more runs; 9.3s measured -- still in the
same ballpark, and the discrepancy is plausibly the `/dev/notebook` prepare
click adding one extra round trip per width rather than a new per-route
constant). **Then 2026-08-29 measured the baseline at 94.9s, not 101s**, and
the task brief written from this file put it at "44 route/width runs at about
107 seconds" against a tree measuring **40 runs and 94.9s** -- the third time
a quoted figure here has been wrong. Three GAUNTLET specs took it to
**116.7s (+21.8s for 6 runs, ~3.6s per route/width)**, which is ABOVE the
~2.6s estimate: two of the three specs mount a `.gt-root` with a live canvas
background and an rAF clock, and the countdown alias pays a real 3.5s hydration.

Then 2026-08-29 added four specs -- `/dev/marks`, `/dev/animated-logo-room`,
`/dev/coin-preview`, `/dev/short-links` -- and measured **144.8s for 58 runs**,
**+27.9s for 8 more runs, ~3.5s per route/width**. That is at the high end of
the range this line already carried and above the ~2.6s estimate, which is worth
knowing: none of the four mounts a canvas, so ~3.5s looks like the current
per-route/width cost rather than a surcharge for animation. `/dev/marks` mounts
twelve glyphs and runs the `motion` check's two media flips, and still came in
at 5.6s of measuring for both widths.

Then 2026-08-30 made every `prepare` step a measurement, which added **48
measurements (24 steps x 2 widths) and no routes**: the same 58 runs measured
**152.2s**, +7.4s over 144.8s on an identical route list. Roughly 0.15s per
extra measurement, which is the cost of a step being JUDGED rather than
narrated, and it is paid whether or not the step passes.

Then merging `integration` in brought the route list to **36 specs, 72 runs and
780 measurements** at **184.7s** -- **+32.5s for 14 more runs, ~2.3s per
route/width**, which is BELOW the ~3.5s this line had settled on. The fourteen
are the classroom-inspector and class-bulk specs, which mount fixture data with
no canvas, no rAF clock and no media flip, so the per-route/width figure is a
range set by what a route mounts rather than a constant -- budget ~3.5s for a
route with animation in it and ~2.3s for one without.

**The marks are ELEVEN GLYPHS ON ONE ROUTE for exactly this reason.** One route
per mark would have been twenty-two runs and roughly 77 seconds for
measurements that share a single page load; `data-mark` keeps the reporting
per-mark anyway. A pass nobody waits for is a pass nobody runs.

**~185 seconds is the point at which this stops being free.** It is still a pass
a person will run before pushing, but the next session adding specs here should
budget somewhere in the ~2.3s to ~3.5s per route/width the paragraph above
brackets, and should say out loud what the run cost.

It is still deliberately outside `npm test` and outside CI:

- `npm test` is the DB suite -- real embedded Postgres, real migrations, no DOM.
  This needs a browser and a dev server. A browser failure would read as a
  database failure.
- Pushing to `main` **deploys `ideabosco.com`**, which students use during
  class. A gate that can wedge that deploy needs a much stronger reliability
  record than one bundle's worth of runs, and a browser-shaped flake would
  block a deploy for a reason that has nothing to do with the change.
- The exit code is **0 even with findings** by default. It is a measuring
  instrument. `--strict` exits 1, for a session that wants that.

**Recommendation: leave it out of CI for now.** Revisit once several sessions
have run it and the finding list is stable enough that a red run means the
change, not the harness.

## Files

| File | |
| --- | --- |
| `run.mjs` | CLI, report formatting, `--break` presets |
| `browser.mjs` | Executable resolution, launch, `waitForApp`, `clickUntil`, external-request blocking |
| `server.mjs` | Boots and stops `vite dev`, handing the placeholder public env to the **child process** so no `.env` is written to the repo |
| `checks.mjs` | The six checks and the in-page colour/visibility helpers |
| `routes.mjs` | Assembles the route table from `routes/`; read it first |
| `routes/` | One file per route spec -- what is measured on each. See `routes/README.md` before adding one |
| `routes/_tools/verify-loader-guards.mjs` | Negative controls for `routes.mjs`'s two load-time refusals (`node tools/browser-verify/routes/_tools/verify-loader-guards.mjs`) -- no browser needed |
| `probe.mjs` | The environment capability probe |
| `selftest.mjs` | The negative controls |
