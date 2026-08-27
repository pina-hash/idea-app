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
  **fallback stack**, so a tap-target height that depends on the line box of
  Rajdhani is approximate. Every run prints the blocked count and says so.
- **`prefers-reduced-motion` is `no-preference`.** The reduced-motion path is
  not exercised.

## The checks

Every check returns a **measured value**. None returns a bare pass/fail: a
number is auditable by the next reader and a green tick is not. Where a
threshold exists it is printed beside the measurement, never instead of it.

| Check | Measures |
| --- | --- |
| `horizontal-scroll` | `scrollWidth - clientWidth`, plus the widest offending elements and their overhang in px |
| `contrast` | WCAG ratio of the text against the **real rendered ground**, naming which ancestor supplied it |
| `tap-target` | Each control's box, the smallest min-dimension, counts under 44px and under the 24px floor, and a centre hit-test |
| `presence` | **present**, **visible** and **aria-hidden** counts -- three different questions -- with a reason for every invisible node |
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

## Negative controls -- the part that makes the numbers mean anything

A check that has never failed has not been tested.

`--selftest` puts every check to a pair of self-contained fixtures, one built to
break it and one built to pass it, and prints both measured values. It exits
non-zero if a check comes back green on the broken fixture or red on the sound
one, because unlike the measuring run there is a right answer here. **18
controls, 9 negative and 9 positive.** Fixtures rather than a mutation of `src/`
on purpose: a mutation proves a check once in a tree that then has to be
restored byte-identically, this proves it on every run and touches nothing.

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

A full run is **~22 seconds** (3.5s of it the vite boot) for 3 routes x 2 widths
= 54 measurements; `--selftest` is ~8s. That is fast enough to be no burden,
and it is still deliberately outside `npm test` and outside CI:

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
| `checks.mjs` | The five checks and the in-page colour/visibility helpers |
| `routes.mjs` | Which dev routes are driven and what is measured on each |
| `probe.mjs` | The environment capability probe |
| `selftest.mjs` | The negative controls |
