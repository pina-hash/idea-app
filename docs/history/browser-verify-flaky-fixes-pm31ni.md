---
title: "browser-verify: applied the two diagnosed flaky-finding fixes, swept every `until` predicate for the same shape, and found a third race the diagnosis had not (`claude/browser-verify-flaky-fixes-pm31ni`, no migration)"
date: 2026-08-29
branches: [claude/browser-verify-flaky-fixes-pm31ni]
migrations: []
subsystems: ["Build, theme, tests, conventions"]
---

## browser-verify: applied the two diagnosed flaky-finding fixes, swept every `until` predicate for the same shape, and found a third race the diagnosis had not (`claude/browser-verify-flaky-fixes-pm31ni`, no migration)

Scope for this bundle: `tools/browser-verify/` only, per the brief. Starting sha
`d8405aa` (origin/main), rebased to `origin/integration`'s tip `3992d8f`, which
already carried `docs/history/flaky-findings-countdown-notebook-h4qv9t.md` --
the diagnosis this bundle applies. Its measurements were taken as given and not
re-derived; this entry is about the fixes and what verifying them turned up.

### 1. `/dev/notebook`: the diagnosed race, one wrong fix, then the real one -- plus a second, undiagnosed race in the same route

The diagnosis was right about the mechanism: `clickUntil`'s `until` predicate
was checked once BEFORE the click and short-circuited on "already satisfied"
(`selectedSession`'s pre-effect default), so the click never physically fired.

**First attempt (rejected by this bundle's own verification): split into an
unconditional click (no `until`) plus a separate `waitFor` on the same
predicate.** This looked right and matched the diagnosis's own suggested
shape, but broke a DIFFERENT way: `clickUntil` with no `until` returns after
exactly ONE attempt (its own "clicked (no predicate given)" branch), so it
lost the retry loop that protects a click landing before hydration has
attached the handler (CLAUDE.md: "paint is not interactivity ... a scripted
click never waits on a timer or a marker -- it retries against its own
effect"). Caught by this bundle's own first full pass: `/dev/notebook@1440`
failed with the `waitFor` step timing out after its full 15000ms, title field
still short at `present 1` of 2.

**The real fix: `force: true`, added to `clickUntil` in `browser.mjs`.** It
skips ONLY the pre-click short-circuit -- the click always physically fires at
least once -- while the retry loop underneath is untouched, so a click that
lands before the handler is attached still gets its remaining `attempts`
(default 12, 300ms apart) rather than being reported as a single unverified
click. Wired through `run.mjs`'s prepare-step loop (`force: step.force ??
false`) and used as `{ click: '.pick.free', until: ..., force: true }` in
`notebook.mjs`, replacing the two-step split.

**A second, narrower race survived even `force: true`, and the original
diagnosis had not seen it** -- reproduced 4/4 in isolation, but only in one
specific sequence: `/dev/notebook-review` run immediately before `/dev/notebook`
in the same pass (their `order` values, 17 and 18, put them adjacent in every
real run). Instrumented directly: `aria-pressed` on `.pick.free` reads `true`
right after the forced click (both label fields present, confirmed with an
inline DOM probe added temporarily for this investigation), then flips back to
`false` roughly 150ms later at 375px only, dropping the title field before
`settle()` measures it. `sessionTouched` (set by the free pick's own handler,
`chooseSession`) is the only thing standing between a click and the
`nearestOutstanding` mount effect overwriting `selectedSession` again, and
every assignment to it in `NotebookView.svelte` was read: nothing clears it
back to `false` on a fresh page except that effect's own body, which requires
its guard (`sessionTouched && !stale`) to already be false to reach --
circular, and not resolved. **This is a real, reproducible defect with an
undetermined trigger**, and `src/` was off limits to this bundle regardless,
so no source fix was attempted.

A signal-based fix was tried first, matching the countdown route's own
eventual shape: `Math.max(0, 1000 - performance.now())`, topping up only the
shortfall against real elapsed time since navigation. **Measured NOT to close
it**: with `performance.now()` already past 1600ms at click time (well past
the 1000ms margin, so the step waited 0ms extra), the race still fired at
375px on every attempt. So the trigger is not "N ms since navigation" the way
the countdown route's is. Bisected directly against the reproduction instead
(200ms, 300ms, 600ms unconditional pre-click delays, each tried multiple times
against the exact `/dev/notebook-review` -> `/dev/notebook` sequence that
reproduced it 4/4 with none): every one of them closed it. **600ms is used, as
a documented last resort** -- the route file's own comment says exactly why a
signal wait was tried first and did not work, so the next session does not
have to re-discover that before trying to remove it.

### 2. `/dev/gauntlet-shell-countdown`: the diagnosed race was real, but the reported fix (a real main-thread-idle wait) was measured to detect the wrong thing, and was replaced

The diagnosis's mechanism was confirmed: `ViewportBackground`'s one-time setup
can still be running when the countdown is armed, delaying `CountdownOverlay`'s
`setTimeout` chain. Its own suggested fix was a flat ~2000ms delay, which this
bundle's brief said to treat as a last resort, not a first one -- so a real
main-thread-idle signal was built and tried first.

**The idle detector: an independently armed `requestAnimationFrame` chain,
waiting for three consecutive callback gaps under 40ms.** It never worked at
1440px. Instrumented directly (a temporary debug build that logged every gap):
the trace oscillates 33/50/83/100/117ms indefinitely -- never three
consecutive frames under 40ms in an 8000ms budget, run after run. That is not
the one-time setup block still running; it is `ViewportBackground`'s ORDINARY
per-frame cost at a 1440-wide software-rendered canvas (its own header:
"single rAF loop ... paused when the tab is hidden", never "paused once
settled" -- it redraws every frame for the whole time the tab is visible). A
scene with no idle state has no idle to wait for; the detector just spent its
whole 8000ms budget on every 1440px run and then clicked anyway, which is
strictly worse than an honest fixed delay at the same cost.

**The fix used instead: an elapsed-since-navigation margin, the same shape
that did NOT work for the notebook race above, but does work here** --
`Math.max(0, 2000 - performance.now())`, topping up only the shortfall.
`waitForApp`'s own hydration-stability wait already measures real time since
navigation (its `waitedMs`), and the setup block is front-loaded at mount,
before any DOM text/height/count reason to still be changing -- so a fast
machine's `waitForApp` can return well inside the 0.5-1.5s danger window
(matching the original diagnosis's own "~450-900ms" figure) while a loaded
one's takes long enough to have already absorbed it (measured here: 3800-4400ms
to hydrate at 1440px, comfortably past the 2000ms margin, so the step waits
nothing extra). 2000ms matches the original diagnosis's own suggested margin
("at least ~2000ms, a measured safe margin over the observed 0.5-1.5s
window"); what changed is that it is spent adaptively, keyed to real elapsed
time, rather than unconditionally on every run regardless of how much of it
hydration had already paid for.

Verified against the exact sequence that used to show `/dev/gauntlet-shell` (a
second WebGL context) immediately before `/dev/gauntlet-shell-countdown`
(their real `order`, 23 and 24) -- 0 findings across repeated isolated runs and
across all five required full passes below.

### 3. The `until`-predicate sweep

Every `until` predicate in `tools/browser-verify/routes/*.mjs` was read against
the shape that broke `/dev/notebook`: **can the pre-action DOM state satisfy
the predicate before the harness's click physically happens?** That requires
either a `$state` initialized from something computed asynchronously after
mount (an `$effect` that settles later, like `selectedSession`), or a value
whose default already matches what the predicate checks for.

**Audited: 16. Unsafe (this bundle's own two fixes above): 2. Fixed: 2.**

The other 14, and what makes each one sound -- a synchronous, deterministic
pre-click state with no async mount effect that could change the relevant
value before the click lands:

- **`classroom-split-s-1-item-i-crowded-manage-1.mjs`** (`#item-inspector-body`)
  -- gated by `{#if inspectorOpen}` in `ItemDetail.svelte`, a real conditional
  render (not CSS-hidden); `itemInspector.open` starts `false` with no effect
  that flips it.
- **`classroom-split-s-1-manage-1-state-compose-assignment-rubric.mjs`** (two
  predicates, `.kind-toggle` then `.rubric-builder`) -- the composer is closed
  until "New post" is clicked, and `kind` defaults to `'post'` (no
  `rubric-builder` renders until the click sets `kind = 'assignment'`); both
  are plain component-local `$state`, no effect.
- **`classroom-split-s-1-manage-1.mjs`** (`[data-testid="bulk-bar"]`) -- no row
  is selected by default; the bar's presence is a direct, synchronous function
  of selection state.
- **`classroom-view-class-teacher.mjs`** (two predicates) -- same shape as the
  compose-assignment-rubric route above.
- **`foundry-gallery.mjs`** (`foundry-gallery-grid` present and no
  `.fdy-gal-detail`) -- `gallerySlug` is `$state<string | null>('hostile-probe')`,
  a literal initializer, no mount effect; the detail pane is open by DEFAULT
  (opposite of the notebook shape, but still deterministic, not async).
- **`foundry-submit.mjs`** (`.fdy-issues`) -- only populated by the real
  `preflightZipInBrowser` call the prepare step's OWN click triggers; nothing
  populates it by default.
- **`hall-pass.mjs`** (two predicates, log length >= 1 then >= 2) -- the log
  starts empty; both predicates require the harness's own prior clicks to hold.
- **`home-feed-teacher.mjs`** (`[data-mode="teacher"].active`) -- `mode`
  defaults to `'student'`, a plain `$state` literal.
- **`pathways.mjs`** (`.pwp-overlay` absent) -- `dismissed` is read
  synchronously from `sessionStorage` at component init (not in an effect);
  `show` is `$derived` from `page.data`, which SvelteKit's load already
  resolved before first render, not from a post-mount async fetch.
- **`song-queue.mjs`** (`song-queue-notice` present) -- only rendered by the
  prepare step's own click handler; no default notice.
- **`spec-table-open.mjs`** (table height > 0) -- `started`/`complete`
  (`Disclosure`'s `collapseWhen`) are derived synchronously each render from
  `values`/`responses`, themselves a `$derived(seed())` over the route's own
  static fixture constant, not an async load.

None of the 14 needed a change. `gauntlet-shell-countdown.mjs`'s own `until`
(`.gt-countdown .numeral` existing) was also sound in this same sense -- the
element genuinely does not exist before the click -- so its fix (above) is a
different defect class: a timing race in what happens AFTER a sound click,
not an "already satisfied" predicate.

### Four full `npm run verify:browser` passes, plus the required fifth from run 1 above

| run | findings | notebook | countdown |
| --- | --- | --- | --- |
| 1 | pathways@375, pathways@1440 (both, known, unrelated) | none | none |
| 2 | pathways@375, pathways@1440 | none | none |
| 3 | pathways@375, pathways@1440 | none | none |
| 4 | pathways@375, pathways@1440 | none | none |
| 5 | pathways@375, pathways@1440 | none | none |

All five: **50 route/width run(s), 418 measurement(s), 2 outside threshold**,
identical every time -- the two `/dev/pathways` tap-target findings are the
long-known, unrelated one this file's own diagnosis and prior sessions have
already characterized (not touched by this bundle). Zero notebook or countdown
findings across all five, and across the many additional isolated and
paired-route runs used to develop and verify the fixes above (specific
reproduction sequences run 3-7 times each, reported inline in sections 1-2).
The check for the SECOND notebook race (the undiagnosed one) is not a vacuous
"one clean run" claim: it was reproduced 4/4 with the fix removed, then
verified 7+/7+ clean with it applied, in the identical `/dev/notebook-review`
-> `/dev/notebook` sequence, before the five full passes above (which
themselves also carry it, since that route order is real) added five more.

### What was measured

- `npx svelte-kit sync && npx svelte-check`, fresh `npm ci` checkout with the
  two placeholder `PUBLIC_SUPABASE_*` values exported first: **0 errors, 37
  warnings**, the pinned 31 `state_referenced_locally` / 5 `css_unused_selector`
  / 1 `perf_avoid_nested_class` mix, unchanged -- expected, since this bundle
  touches no file under `src/`.
- `npm test`: **171 files, 3663 tests, all passing.** The brief's own baseline
  cites 3660; this bundle changed no file under `src/` or `tests/`, so the
  3-test gap is pre-existing drift on `origin/integration`'s tip, not something
  this bundle moved. Re-derive rather than trust either number, per this
  file's own standing rule.
- `npm run verify:browser -- --probe`: a real Chromium (141.0.7390.37) is
  attached in this session's environment; `rafFires`, `intersectionObserverFires`
  and `resizeObserverDelivers` all `true`.
- `npm run verify:browser -- --selftest`: **44 controls (22 negative, 22
  positive), 0 instrument failures** -- unchanged. No new `checks.mjs`
  assertion type was added by this bundle (the fixes are prepare-step timing
  and a `clickUntil` option, not a new check), so no new selftest control was
  owed; the existing 44 were re-run to confirm nothing regressed.
- Five full `npm run verify:browser` passes, tabulated above.
- Numerous isolated and paired-route runs (`--route <slug>`) used to bisect and
  verify both fixes, reported inline in sections 1 and 2.

### What was NOT verified

- **The second notebook race's exact trigger.** A flat 600ms pre-click delay is
  confirmed to close it, bisected against the real reproduction; WHY
  `sessionTouched`/`selectedSession` flips back is not resolved, and no
  plausible mechanism found while investigating (the mirror-restore effect and
  the pending-capture effect were both read and ruled out: both require
  browser storage that is empty in a fresh Playwright context) explains it.
  `src/` was off limits to this bundle, so this is reported rather than fixed
  at the root. The comment left in `notebook.mjs` says exactly what was ruled
  out, so the next session does not have to re-run that investigation.
- Whether real hardware with GPU acceleration would show the countdown route's
  original danger window at all was not re-measured (carried over from the
  prior entry's own unverified item).
- No live Supabase project was reached; nothing in this bundle has a database
  side.
