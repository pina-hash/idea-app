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
53 directories under `src/routes/dev` (50 with a page, 3 server-only) and 52
`+page.svelte` files; `routes.mjs` lists **20 specs over 15 distinct routes**
(17 over 12 before `/dev/notebook`, `/dev/notebook-review-student` and
`/dev/song-queue` joined it).
A 52-route pass nobody waits for is a pass nobody runs. Routes earn a place by
one question -- if this surface broke silently, would anyone find out before a
student did -- not by existing. `docs/history/dev-routes-audit-5nocl7.md` has
the audit that produced the current list and the reasons the rest were left
out.

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
- **`prefers-reduced-motion` is `no-preference`.** The harness never sets the
  reduced-motion media feature, so that path is **not exercised** -- a finding
  from a route with `prefers-reduced-motion: no-preference` behaviour (an
  entrance fade, a spin, a transform) describes only that state, never the
  reduced one, and neither state is inferable from the other.

### Known findings, and the two limits above as they apply to them

**The whole run reports exactly 2 measurements outside threshold**, and they are
the two below -- the same finding at each width. Anything else is new.

- **`/dev/pathways`: the two harness controls measure 194.7x26.2px** (min
  dimension 26.2px), under the 44px floor at both widths. This number is a
  **tap-target measurement**, so the fallback-stack limit above applies to it
  directly -- the true box under Rajdhani may differ slightly, though not
  enough to cross the 44px line from 26.2px.
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
number. `SETTLE_ENTRANCE` in `routes.mjs` uses that to say how many cards it
settled -- a settling step that reports `0 course-card(s)` is a silent no-op made
visible, which is what happens the day a class name moves.

## Negative controls -- the part that makes the numbers mean anything

A check that has never failed has not been tested.

`--selftest` puts every check to a pair of self-contained fixtures, one built to
break it and one built to pass it, and prints both measured values. It exits
non-zero if a check comes back green on the broken fixture or red on the sound
one, because unlike the measuring run there is a right answer here. **36
controls, 18 negative and 18 positive** (re-derived from `selftest.mjs`'s own
`CASES` array 2026-08-28, after `click-through (aria-disabled control)` and the
two `tap-reach` groups went in alongside `wait-for`; a number written down here
is a number that drifts, so re-derive it rather than trusting this line).
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

## Why it is not in `npm test` and not in CI

A full run is **~101 seconds** (3.4s of it the vite boot) for **20 route specs
x 2 widths = 40 runs and 306 measurements**; `--selftest` is ~12s (36 controls).

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
constant). **101 seconds is the point at which this is worth saying out loud
rather than just running**: it is comfortably still a pass a person will run
before pushing, but it is no longer the kind of number nobody notices, and the
next few specs added here should watch it rather than assume it stays flat.

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
| `routes.mjs` | Which dev routes are driven and what is measured on each |
| `probe.mjs` | The environment capability probe |
| `selftest.mjs` | The negative controls |
