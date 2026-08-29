---
title: "Two flaky browser-verify findings diagnosed to their root cause: both are the harness's to fix, neither is a defect in CountdownOverlay or the notebook composer (`claude/flaky-findings-countdown-notebook-h4qv9t`, no migration)"
date: 2026-08-29
branches: [claude/flaky-findings-countdown-notebook-h4qv9t]
migrations: []
subsystems: ["GAUNTLET", "Notebook", "Build, theme, tests, conventions"]
---

## Two flaky browser-verify findings diagnosed to their root cause: both are the harness's to fix, neither is a defect in CountdownOverlay or the notebook composer (`claude/flaky-findings-countdown-notebook-h4qv9t`, no migration)

Scope for this bundle: `src/routes/dev/gauntlet-shell/`, `src/lib/gauntlet/viewport/CountdownOverlay.svelte`, and `src/routes/dev/notebook/` (which exists and needed no change). `tools/browser-verify/`, any migration, and `tests/` were off limits -- a different live session owns the harness. **No file under `src/` was changed.** Both investigations below concluded the fix belongs in a route spec under `tools/browser-verify/routes/`, which is reported precisely and left alone, per the brief's own instruction for that outcome.

### 1. `/dev/gauntlet-shell-countdown`: a real, measured race -- caused by `ViewportBackground`'s one-time WebGL setup, not by `CountdownOverlay`

**`CountdownOverlay`'s own sequencing is correct.** It schedules five `setTimeout`s at nominal offsets `[0, 800, 1600, 2400, 3700]` from the moment `active` becomes true, painting `3`, `2`, `1`, `BUILD`, then tearing the whole `.gt-countdown` overlay down. Nothing about that logic is racy in isolation, and there is no missing "state to wait for" inside the component -- the DOM already reports exactly what a reader would want (`.gt-countdown` present, `.gt-countdown .numeral` present, `aria-hidden="true"`) for the entire 0-3700ms window.

**The race is external, and it is measured, not guessed.** `/dev/gauntlet-shell` mounts the real GAUNTLET viewport chrome around `CountdownOverlay` -- `ViewportBackground` (a real three.js WebGL scene: PBR hero mesh, `RoomEnvironment` for reflections, particulate, fog) and `CursorLayer`, both running a `requestAnimationFrame` loop. Under this container's headless Chromium with `--disable-gpu` (forced software WebGL), `ViewportBackground`'s one-time setup -- the dynamic `three` import, `WebGLRenderer` construction, and especially `RoomEnvironment`'s PMREM pre-render, all on the main thread -- monopolizes the main thread for roughly the first 0.5-1.5 seconds after page load, and NOTHING else on that thread (including a queued `setTimeout` callback) runs until it finishes.

A standalone diagnostic (Playwright script outside `tools/browser-verify/`, using its `launch`/`server` helpers read-only, never committed) proved this in four independent steps:

1. **A raw, Svelte-free `setTimeout` chain** (`[0, 800, 1600, 2400, 3700]`, no `CountdownOverlay` involved) scheduled on `/dev/gauntlet-shell` shows the identical pattern: `0` fires on time, `800`/`1600`/`2400` all bunch together at ~3.0-3.6s (drift of 1-2.8 SECONDS), and `3700` fires close to its nominal time. The pattern is IDENTICAL across repeated launches, with and without the standard `--disable-background-timer-throttling`/`--disable-backgrounding-occluded-windows`/`--disable-renderer-backgrounding` flags -- ruling out Chromium's background-tab timer throttling as the cause.
2. **The same test on `/dev/pathways` and `/dev/gauntlet-run`** (neither mounts `ViewportBackground`/`CursorLayer`) shows **zero drift**, every timer firing within 1ms of nominal. `/dev/gauntlet-shell` alone, with no click on the countdown button at all, reproduces the multi-second drift. This isolates the cause to the viewport chrome, not to `CountdownOverlay` or to anything route-specific about "countdown."
3. **Delaying the raw timer chain's START** relative to page load narrows the danger window precisely: starting at `+500ms` still shows ~3.1s drift; starting at `+1500ms` or later shows **0-25ms** drift, session after session. The danger window is the first ~0.5-1.5s after `domcontentloaded`, which is exactly when `ViewportBackground`'s async three.js/WebGL/PMREM setup is doing its one-time work -- and exactly when the harness's own `prepare` step clicks the countdown button (`app rendered in ~450-900ms`, click follows almost immediately).
4. **Ten independent isolated-route runs of `/dev/gauntlet-shell-countdown`** (5 at the outset, 8 more with both widths) never showed the actual presence-check finding, only `2 attempt(s)`/`1 attempt(s)` in the click's own retry loop -- consistent with usually landing well inside the stall (while `3` is still showing, however late it started) rather than at the rarer, tighter coincidence needed to compress the whole 3.7s lifecycle past the harness's ~270-900ms post-click measurement window. This matches the task's own framing of the finding as intermittent rather than reliably reproducible, and it is why a session confined to `CountdownOverlay` alone could see it "appear and disappear" without ever being able to pin it down.

**Conclusion: the fix is a harness fix, not a component fix; do not add a `waitFor`-able state to `CountdownOverlay` to work around it.** `ViewportBackground` exposes no readiness signal today (no class, attribute, or event marking "WebGL setup finished"), and there is no reason to add one just to satisfy a headless/software-rendering artifact that would not occur on real hardware with GPU acceleration -- `ViewportBackground`'s own header already documents the scene as "purely decorative," and `CountdownOverlay`'s own comment says it is "purely visual ... never touches the server-authoritative clock," so neither component claims wall-clock precision as a contract worth engineering around.

**What the harness should wait on, precisely, for whoever owns `tools/browser-verify/`:** in `tools/browser-verify/routes/gauntlet-shell-countdown.mjs`, insert a delay of at least ~2000ms (measured safe margin over the observed 0.5-1.5s danger window) BEFORE the existing `{ click: '[data-drive="countdown"]', until: ... }` prepare step, so the countdown is never armed until `ViewportBackground`'s one-time WebGL/PMREM setup has already finished consuming the main thread. `run.mjs`'s own `waitForApp` does not cover this: it waits for DOM element count / text length / `aria-expanded` count / body height to stabilize, none of which the WebGL canvas rendering changes, so a page can report "stable" while the async three.js chain is still about to monopolize the thread. No other change to the existing `until` predicate or the three presence rows is needed -- they already assert the right thing; they just need to not be evaluated inside the window where their own precondition (the DOM having genuinely reached one of the four numeral states, undisturbed) does not hold. Nothing about `/dev/gauntlet-shell` itself (the alias target, no `prepare`, no click) is affected -- its own checks do not depend on `setTimeout`-driven state.

### 2. `/dev/notebook`: confirmed -- the `until` predicate is satisfiable before any click, and now reproduces deterministically in isolation

The pre-existing diagnosis holds, exactly as stated. `tools/browser-verify/routes/notebook.mjs`'s prepare step is:

```js
prepare: [{ click: '.pick.free', until: '() => document.querySelector(".pick.free").getAttribute("aria-pressed") === "true"' }]
```

`.pick.free`'s `aria-pressed` is `selectedSession === null` (`NotebookView.svelte`). `selectedSession` starts at `linkedPick?.sessionId ?? null` -- `null` in this fixture, since there is no linked pick -- and only gets pinned to a real session by a mount `$effect` (`nearestOutstanding(sessions, entries, todayIso())`) that runs asynchronously after first paint. `clickUntil` in `browser.mjs` checks its `until` predicate ONCE, before any click, and returns immediately with `attempts: 0, reason: 'already satisfied'` if it already holds -- so whenever that first check lands before the mount effect has settled `selectedSession` to a real session, the predicate is satisfied by the component's own transient DEFAULT state, no click ever fires, and the harness proceeds to `settle()` and measure whatever `selectedSession` becomes by then. If the effect settles to a non-null session in the meantime, the title field (`.compose-card label.label-field`, gated on `selectedSession === null`) stops rendering, and the `expectPresent: 2` presence check drops to 1.

**This reproduced deterministically in this session's environment: 6/6 isolated runs, and 3/3 full-pass runs (see the five-run table below) fired the finding, every one logging `prepare: clicked .pick.free -- 1 matched, 0 attempt(s), already satisfied`** -- confirming the click never actually happens and the predicate's own "already satisfied" branch is exactly the failure mode.

**Conclusion: also a harness fix, not a defect in `NotebookView`.** The auto-select effect and its guard (`sessionTouched`) are correct, intentional behavior -- filing several entries in a row should keep following the last pick until the student changes it, and a stale pick should fall back to the nearest outstanding one, which is exactly what the effect does. There is nothing to fix in `NotebookView.svelte`.

**What the harness should wait on, precisely:** the fix is to stop relying on `clickUntil`'s "already satisfied, skip the click" short-circuit for this step. Two ways to spell that in `tools/browser-verify/routes/notebook.mjs`, either sufficient:

- Split the one step into an UNCONDITIONAL click (no `until`, so `clickUntil`'s early-return branch never applies and the physical click always fires) followed by a separate `waitFor` step polling the same predicate (`() => document.querySelector('.pick.free').getAttribute('aria-pressed') === 'true'`). This is robust because `chooseSession(null)` (the free pick's own handler) sets `sessionTouched = true`, which makes the auto-select `$effect`'s own guard (`if (sessionTouched && !stale) return;`) skip re-running afterward -- so once a REAL click lands, `selectedSession` stays pinned at `null` with no further race window, regardless of when the click happens relative to the mount effect.
- Or, equivalently: give the click step a predicate that cannot be satisfied by the pre-click default at all (e.g. first force a real session, THEN click free and wait for the flip) -- more moving parts for the same result; the unconditional-click form above is simpler.

Either way, no change is needed to the presence assertion itself (`expectPresent: 2` is the correct claim about the intended state) -- only to how reliably the intended state is reached first.

### Five full-pass runs, finding set per run (unmodified harness, no code change made)

| run | outside threshold | findings |
| --- | --- | --- |
| 1 | 4 | pathways@375, pathways@1440, notebook@375, notebook@1440 |
| 2 | 4 | pathways@375, pathways@1440, notebook@375, notebook@1440 |
| 3 | 4 | pathways@375, pathways@1440, notebook@375, notebook@1440 |
| 4 | 3 | pathways@375, pathways@1440, notebook@375 |
| 5 | 4 | pathways@375, pathways@1440, notebook@375, notebook@1440 |

**Stable across all 5 runs:** `/dev/pathways` at both widths (the long-known, unrelated tap-target finding) and `/dev/notebook@375`. **Moved:** `/dev/notebook@1440` was absent on run 4 alone (3/5 vs the rest at 4/5) -- consistent with the diagnosed race (the mount effect's settle timing varies run to run) rather than a new or different defect; the finding's own name and selector were identical every time it appeared. **`/dev/gauntlet-shell-countdown` did not fire in any of the 5 full-pass runs, nor in 13 additional isolated single-route runs** (5 + 8, both widths) run specifically to try to catch it in the act -- consistent with the diagnosis above needing a tighter timing coincidence than the underlying multi-second drift alone guarantees, and consistent with the task's own description of it as intermittent. All 5 runs reported **50 route/width runs and 418 measurements**, identical every time -- the instrument itself is not the source of the count variance, only the four-item finding set is.

**What was changed to make the difference: nothing.** No file under `src/`, `tools/browser-verify/`, or `tests/` was modified this session. The `/dev/notebook` finding firing far more reliably here (4-5 of 5, vs the 0-1-of-3 range a prior session's report cited) is itself data about the race's sensitivity to ambient timing, not evidence of a regression -- the mechanism (the pre-click default value racing the mount effect) is unchanged code, confirmed unchanged by reading it, and the CLAUDE.md rule this matches is its own: "a flaky finding is as corrosive as a vacuous check." One clean run proves nothing about a race in either direction, which is why this report is five runs and a described mechanism, not one.

### What was measured

- `npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**, mix 31 `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class` -- the pinned baseline, before AND after (unchanged, since no source file changed), re-derived after exporting the two placeholder `PUBLIC_SUPABASE_*` values in a fresh `npm ci` checkout.
- `npm test`: **171 files, 3660 tests, all passing**, before and after (see below for the "after" figure) -- unaffected, since this bundle touches no file under `src/`, `supabase/` or `tests/`.
- Four standalone Playwright diagnostics (raw-timer chain on `/dev/gauntlet-shell` with and without throttling-disable flags; the same chain on `/dev/pathways` and `/dev/gauntlet-run` as negative controls; the chain started at five different delays after page load to bound the danger window; a full instrumented poll of `.gt-countdown`/`.numeral` state every 40ms across three trials) -- all reported in-line above, none committed (scratch scripts only, deleted after use).
- Five full `npm run verify:browser` passes: 50 route/width runs and 418 measurements in every run; findings tabulated above.
- 6 isolated `/dev/notebook` runs (all firing) and 13 isolated `/dev/gauntlet-shell-countdown` runs (none firing), used to characterize each race's reproduction rate in isolation versus inside the full 50-route pass.

### What was NOT verified

- No live Supabase project was reached; nothing here has a database side.
- No migration was written, applied or needed.
- `npm run build` was not run (this session's environment is Linux; the Windows-only `EPERM` trap does not apply, and this bundle changes no application code the build's illegal-import pass would need to catch).
- The recommended harness fixes above were NOT applied -- `tools/browser-verify/` belongs to a different live session, per this session's explicit scope.
- Whether real hardware with GPU acceleration (rather than this container's forced `--disable-gpu` software rendering) would show any drift at all was not measured; the diagnosis is that it would not, based on `RoomEnvironment`'s PMREM generation being the well-known expensive step and GPU acceleration being exactly what that cost depends on, but no GPU-enabled Chromium was available here to confirm directly.
