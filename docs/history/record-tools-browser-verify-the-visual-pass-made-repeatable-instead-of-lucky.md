---
title: "`tools/browser-verify` -- the visual pass, made repeatable instead of lucky"
date: 2026-08-27
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 155
---

Code-only. No SQL, no migration, and **nothing under `src/`**: other sessions
were live in `src/lib/classroom/` and `src/lib/foundry/`, so this bundle owns
`package.json`, `package-lock.json`, `tools/browser-verify/`, `CLAUDE.md` and
this file, and touched nothing else.

### The problem, stated as the contradiction it was

Every session in this repo for several days ended by reporting that no browser
was available and the visual pass was skipped. The entry immediately above this
one ends "**No browser pass. No screenshots.**" Meanwhile `CLAUDE.md` cites
Chromium measurements as established fact in a dozen places -- the `<img>`
thumbnail decode at `naturalWidth` 8, the platform-font CORS load from a genuine
opaque origin, the `while (true)` teardown timings -- and at least one session
demonstrably drove a browser to get them.

Both cannot be true. The sentence "no browser tool available" describes the
SESSION, not the environment, and the two had drifted apart. What follows is
what the environment turned out to have.

### What this container actually has (measured 2026-08-27, not assumed)

- **A Chromium is preinstalled**: `141.0.7390.37` at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, found through
  `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, registered by a **global**
  playwright `1.56.1` at `/opt/node22/lib/node_modules/playwright`. Nothing is
  on `PATH` under any of the six usual names, which is why `command -v chromium`
  -- the obvious check -- answers "no browser" on a machine that has one.
- **It starts headless.** `--headless=new --no-sandbox --disable-gpu
  --dump-dom about:blank` returns the document, exit 0. The wall of
  `Failed to connect to the bus: /run/dbus/system_bus_socket` on stderr is
  NOISE: there is no system bus in the container and Chromium does not need one.
  A session that read that stderr as the failure would conclude the browser was
  broken.
- **`npx playwright install chromium` is a NO-OP**, because build 1194 is
  already at the install location. `--dry-run` prints the three download URLs
  and the install path, which already exists.
- **It could NOT download if it had to.** `cdn.playwright.dev` answers **403 to
  CONNECT** through the agent proxy: `curl` gives
  `CONNECT tunnel failed, response 403`, and the proxy's own
  `/__agentproxy/status` records `connect_rejected -- gateway answered 403 to
  CONNECT (policy denial or upstream failure)`. `registry.npmjs.org` IS
  reachable (it is in `no_proxy`), so npm works and the browser CDN does not.
- **Disk is not the constraint** (30G available; the binary is 463MB).

### The five capability rows that matter most

`CLAUDE.md`'s "The Browser pane" section documents at length what the
`mcp__Claude_Browser__*` pane cannot do. Sessions have been carrying those over
as facts about the environment. Measured against the harness Chromium, **every
one of them is the opposite here**:

| | Browser pane (per `CLAUDE.md`) | This Chromium |
| --- | --- | --- |
| Screenshots | time out | **work** (6086-byte PNG) |
| `requestAnimationFrame` | frozen when hidden | **fires** |
| `IntersectionObserver` | **never** fires, for anything | **fires** |
| `ResizeObserver` | never delivers | **delivers** |
| Canvas readback / `color-mix()` | (n/a) | **work** |
| Paused animation midpoint | (n/a) | **0.5 opacity**, interpolates |

This is the single most useful thing in this entry. It means the documented
workarounds -- settling `AppLauncher`'s cards by hand because the observer never
fires, patching the `ResizeObserver` constructor to capture and invoke the
callback -- are unnecessary here, and applying them anyway measures the
workaround rather than the component.

### The dependency, and why the pin is load-bearing

`playwright-core@1.56.1`, **exact**, in `devDependencies`. Chosen over the full
`playwright` package for two reasons:

- `playwright-core` has no install-time browser download, so `npm install` in
  this repo cannot be broken by the blocked CDN. (Neither package publishes a
  `scripts` field at 1.56.1, so this is belt and braces -- but the belt is free.)
- **The version must match the preinstalled build.** Playwright pins a chromium
  build number per release; 1.56.1 wants **1194**, which is what is on disk. A
  different minor wants a different build, and that download is 403. So a
  routine `npm update` is what would take this harness out, silently, with a
  "browser not found" that reads like a missing tool rather than a version
  drift. The exact pin is the guard, and `browser.mjs` additionally resolves
  through a **reported** fallback chain so a moved binary is a named error.

### The harness

`npm run verify:browser`. Seven modules under `tools/browser-verify/`; the
README there is the reference and is not repeated here.

- **It drives `/dev` routes only, and that is a boundary rather than a starting
  set.** They mount the real components with fixture data and need no account
  and no Supabase. A real route needs a Bosco Tech Google session no automated
  run holds; that stays `/dev/login` against a local stack, by hand. The README
  and `CLAUDE.md` both say so, because the failure mode is a future session
  reporting the harness as covering a signed-in page.
- **No `.env` is written.** The two public Supabase values are handed to the
  vite **child process**, since SvelteKit merges `process.env` into
  `$env/static/public`. The previous bundle wrote one from `.env.example` to
  reach the `svelte-check` baseline; this needs no file and so has nothing to
  restore.
- **Every check reports a measured value, never a pass.** Overflow in px with
  the offending elements and their overhang; contrast as a ratio with both
  composited colours and the ancestor that supplied the ground; every control's
  box with counts under 44px and under the 24px floor; present/visible/
  aria-hidden as three separate counts with a reason per invisible node;
  console errors with their text. A number is auditable and a green tick is not,
  which is precisely how the unchecked claims survived.
- **Contrast is measured by painting to a canvas and reading the pixel back**,
  per the rule in `CLAUDE.md`: a regex over computed styles skips `color-mix()`
  and `color(srgb ...)` silently. Alpha on the text composites over the resolved
  ground before the ratio is taken, and a `background-image` anywhere up the
  stack is flagged so the number is not read as more than it is.

### Four defects found in the instrument while building it, and what each taught

These are recorded because each one produced a **plausible, confident, wrong
reading** -- which is the failure mode a measuring tool has to be hardened
against.

1. **`page.evaluate(string)` treats its argument as an EXPRESSION.** A `prepare`
   step's predicate was handed in as arrow-function source, which evaluated to a
   function object and was never `=== true`. Every step reported twelve failed
   attempts while the clicks underneath were working perfectly -- and the
   presence check beside it reported the state those clicks had produced. Fixed
   by invoking: `page.evaluate(\`(${until})()\`)`.
2. **`page.route('**/*')` round-trips every vite dev module request through the
   Node handler.** A full run took **176 seconds**; with a predicate matcher, so
   Chromium serves loopback on its own fast path, the same run is **22
   seconds**. An 8x cost with no symptom other than slowness.
3. **`waitUntil: 'networkidle'` never idles here.** The proxy resets
   `fonts.googleapis.com` and the request hangs until it does, so every page paid
   the full cap; one run took **305 seconds**. Replaced by a DOM-stability poll,
   and every non-loopback request is now blocked outright -- which is also what
   makes the run deterministic, since whether a webfont arrived changes text
   metrics and this harness reports geometry.
4. **`aria-hidden` was folded into visibility**, so a correctly-decorative
   15.2x15.2 glyph came back as "present but not visible". They are three
   questions and are now three counts.

The first is the one worth generalising: **a verification tool that fails
silently in the direction of "no result" is worse than no tool**, because "0
matched" reads as a changed surface rather than a broken probe. The harness now
reports match counts, attempt counts and blocked-request counts for exactly
this reason.

### Paint is not interactivity, and no marker separates them

Promoted to `CLAUDE.md`. `/dev/pathways` answered HTTP 200 with a 1099-byte
shell and every selector matched 0 nodes with a clean console -- which reads
exactly like a page whose markup changed. Waiting for painted content fixed
that, but not the next layer: on `/dev/spec-table` **every `__SVELTEKIT_*` global
was present at 600ms while two clicks in a row did nothing**, and the same
single click took effect at 2500ms. The client entry module sets those globals
before hydration attaches a handler, so there is no marker to wait on. Nothing
here waits on a timer; `clickUntil` retries against the step's own effect and
reports the attempt count (1-2 in practice).

### Negative controls -- the deliverable, not a footnote

A check that has never failed has not been tested.

- **`--selftest`: 18 controls, 9 negative and 9 positive, 0 instrument
  failures.** Every check is put to a fixture built to break it AND one built to
  pass it, both measured values printed, exiting non-zero if the instrument is
  wrong. Fixtures rather than a mutation of `src/` deliberately: a mutation
  proves a check once in a tree that then needs restoring byte-identically, this
  proves it on every run and touches nothing. The contrast pair includes a
  `color-mix()` ground with alpha text (2.23:1 vs 11.72:1) and a pale-ink-on-a-
  light-card-on-a-dark-page case (1.19:1 vs 12.12:1) that only bites if the
  ground is genuinely resolved; the tap-target pair includes a 22px input in a
  22px label vs the same input in a 44px label, which is the rule about
  measuring at the label.
- **`--break <preset>`: the LIVE control.** Injects a defect into the real page
  before measuring. Run on `/dev/spec-table` at 375px, each preset reddened
  exactly its own check and left every other one green: `overflow` -> 1225px of
  overflow, `tiny-taps` -> smallest 293x18 with 5/5 under 44px, `low-contrast`
  -> 1:1, `invisible` -> present 1 / visible 0 (`opacity:0`), `console-error`
  -> 1 pageerror. **The isolation is the property that makes them worth
  anything**; a preset that reddened three checks would prove none of them.

### Measured

- **Full run: 22.4s, 22.7s, 23.2s** over three consecutive runs (3.5s of it the
  vite boot), 8 route/width runs, 54 measurements. The findings were
  **byte-identical across all three** -- checked with `diff` -- which is the
  reliability evidence behind the CI recommendation.
- `--selftest`: **7.7s**. `--probe`: ~3s.
- Per-page render after the first: **~400-500ms**; first visit to a route
  1.0-1.7s while vite compiles its module graph.
- **`svelte-check`: 0 errors, 37 warnings**, breakdown 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class` -- the documented
  baseline, unmoved.
- **`npm test`: 120 files, 2733 tests, all passing, 113.1s.**

### The `svelte-check` `.env` trap, promoted to `CLAUDE.md`

A first run reported **11 errors**, all
`Module '"$env/static/public"' has no exported member 'PUBLIC_SUPABASE_URL'`
(or `_ANON_KEY`), across eight files this bundle never touched. That module is
generated from the environment, and `.env` is gitignored -- so **every fresh
cloud session sees this**, and it looks exactly like a regression in someone
else's code. Exporting the two values (any placeholder) before `svelte-kit sync`
returns it to 0/37. The tell is that the warnings do not move: a real regression
moves one of those numbers, this moves only the errors and only in files the
diff never named.

### Findings on the surfaces driven

Reported, not fixed -- `src/` was out of this bundle's scope.

- **`/dev/pathways`: the two harness controls measure 194.7x26.2px**, under the
  44px floor at both widths (above the 24px absolute floor, and the centre
  hit-test lands on the control itself). These are the dev harness's own
  controls, not a student surface.
- **`/dev/pathways` mounts the real first-login picker, whose overlay covers the
  page.** Measuring through it is a true reading of the wrong thing; the spec
  dismisses it with "Not now" first and the report says so. Before that was
  noticed, the tap-target hit-test was correctly reporting `.pwp-overlay` as
  what a tap would land on.
- **`/dev/spec-table` renders two disclosures closed and two open**, and the
  closed ones keep their tables in the DOM at a zero box -- which is
  `Disclosure`'s documented contract (hidden in CSS, never removed) and is why
  the presence check reports present and visible separately. `present 2, visible
  0` is the correct reading of a closed panel, and the route spec says so rather
  than carrying a permanent false finding.
- **The chip label on its own fill measures 4.84:1** on `/dev/pathways` -- it
  clears 4.5, but not by much, and the ground is a per-chip fill.

### Not in `npm test`, not in CI, and the recommendation

Left out of both, deliberately, and this bundle wires it into neither.
`npm test` is the database suite (real embedded Postgres, real migrations, no
DOM) and a browser failure there would read as a database failure. More
importantly, **a push to `main` deploys `ideabosco.com` while students are
using it**, so a gate that can wedge that deploy needs a much stronger
reliability record than one bundle's worth of runs. Default exit is **0 even
with findings** -- it is a measuring instrument; `--strict` exits 1 for a
session that wants that. **Recommendation: revisit CI once several sessions
have run it and the finding list is stable enough that a red run means the
change rather than the harness.** 22s and three identical consecutive runs is
an encouraging start, not a record.

### What was NOT verified

- **No signed-in surface, and no real route.** The harness cannot reach one by
  construction. Nothing here says anything about `/classroom`, `/notebook`,
  `/foundry` or any production page.
- **Nothing was run against the live Supabase project, a real deployment, or a
  Vercel preview.** The public env values were placeholders.
- **Web fonts did not load in any measurement**, so every geometry number is
  against the fallback stack. A tap-target height that depends on Rajdhani's
  line box could differ in production.
- **`prefers-reduced-motion` was `no-preference` throughout.** The
  reduced-motion path of any animated component is unexercised.
- **Only three dev routes are in `routes.mjs`** (`/dev/pathways`,
  `/dev/spec-table`, `/dev/animated-logo`), out of 51 that exist. The other 48
  are unmeasured. They were chosen for being stable and outside the areas other
  sessions were live in.
- **No screenshots were taken as part of the pass**, though `--probe` proves
  they work here. The checks are geometry and computed-style reads.

### Deferred

- **Route specs for the other 48 dev routes.** Each needs its selectors
  anchored against the real DOM -- a bare tag name matched the root layout's
  site-feedback glyph on the first attempt -- which is a per-route job.
- **A reduced-motion pass.** `openPage` already takes the context option; it
  needs a second axis in the run matrix and a decision about which surfaces
  care.
- **Screenshot capture on a finding.** Cheap here and would make a contrast or
  overflow report much easier to act on.
- **Wiring `--strict` into a pre-merge step** rather than CI, once the finding
  list is stable.

---

