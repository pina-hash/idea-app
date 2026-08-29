---
title: "The telemetry gap closed, and Foundry added to the browser-verify route table (code only, no migration, `claude/foundry-telemetry-harness-b1k8sm`)"
date: 2026-08-27
branches: [claude/foundry-telemetry-harness-b1k8sm]
migrations: []
subsystems: ["IDEA Foundry", "Build, theme, tests, conventions"]
record_order: 167
---

The previous bundle shipped the telemetry migration and the three surfaces that
read it -- the gallery's play-count chips, `FoundryPlayStats`, and the admin
metadata editor -- and named its own gap in the same breath: `/dev/foundry-gallery`
supplied none of `playCounts`, `playStats` or `saveField`, so all three were
transport-gated dead code as far as any harness or browser pass could see, and
`tools/browser-verify/routes.mjs` did not drive the route at all. Both were left
alone because the files were outside that session's assigned list. This session's
whole job was those two files, named explicitly.

### The fixture, and the one thing it deliberately does not do

`playCounts` and `playStatsFixture` are plain in-memory objects in
`src/routes/dev/foundry-gallery/+page.svelte`, keyed off `data.apps[i].id` (the
load's own fixture ids, never re-typed uuids) and wrapped in `$derived` -- a bare
top-level read of the `data` prop is flagged by `state_referenced_locally` and
would have moved the `svelte-check` warning count off its pinned 37. One of the
three fixture apps carries a genuine zero play count on purpose:
`playCountLabel` renders no chip for zero, and that absence is only provable with
a real zero sitting beside two real nonzero counts, not by every app having a
number.

**No per-player row was invented anywhere.** `FoundryPlayStats`'s whole point is
that the four scalars it renders are the entire answer `foundry_app_play_stats`
can give, for the owner and for staff alike -- there is no shape in which a
per-player breakdown could exist, and inventing one in the fixture to make the
block "more real" would have been fixture data the actual RPC can never produce.
The fixture stays four scalars per app, same as the function.

`saveField` and `setHidden`/`deleteApp` are now driven the same way: the
transport writes into a `metaEdits` overlay (`Record<appId, Partial<Record<field,
string>>>`), and `reviewSelected` merges it in, so a save in `FoundryInspector`'s
metadata editor is provably reflected in both `FoundryDetail` and the inspector
itself beside it -- not merely accepted and dropped. `lastDecision` records the
call the same way `decide`/`setHidden`/`deleteApp` already did.

### Confirming the three surfaces actually render

Read through `curl` against the SSR output (no hydration needed for the gallery
chips, which are a plain prop the template branches on; the play-stats and
metadata-editor blocks render their `{#if load}` / `{#if transports.saveField}`
wrapper synchronously even before the client fetch fills in numbers):

- `data-testid="fdy-card-plays"` -- 2 matches (the two nonzero fixture apps; the
  third, zero-play app correctly renders no chip).
- `data-testid="foundry-play-stats"` -- present.
- `data-testid="foundry-metadata-edit"` -- present.

### Foundry in the browser-verify route table

`/dev/foundry-gallery` is now a permanent entry in `tools/browser-verify/routes.mjs`.
It needed one `prepare` step the other routes did not: both `gallerySlug` and
`reviewSlug` default to `'hostile-probe'`, so the page loads with a detail pane
already open on both halves, and under `ClassSplit`'s `narrow="swap"` a selection
collapses the pane WITHOUT the selection -- meaning the gallery's own nav pane,
where the sort control lives, is the one hidden at 375px. Clicking the harness's
own deselect control (now carrying a stable `data-testid="gallery-deselect"`,
added for this) is exactly what a visitor to bare `/foundry` sees, and it is what
makes the sort buttons measurable at both widths rather than only the one where a
selection happens not to collapse the nav pane. The review pane is left selected
on purpose: that selection is what puts `FoundryPlayStats` and the metadata
editor on screen, which is the entire reason this route is listed.

### Re-measured, not copied

The task handed over specific numbers from a prior one-off manual drive as a
number to confirm rather than trust. Re-run through the actual harness (not
retyped from the prompt):

```
ok  tap-target [gallery sort buttons]  smallest 94.3x44 (min dim 44px); 0/3 under 44px, 0 under the 24px floor
ok  contrast [sort control, active]    7.55:1  fg rgb(120, 184, 112) on rgb(27, 23, 18)
ok  contrast [sort control, inactive]  7.26:1  fg rgb(163, 157, 146) on rgb(13, 12, 10)
```

and the full per-button geometry, read from the check's own JSON: 94.3x44,
136.5x44, 178.8x44, all three `centreHitsSelf: true`. All of it matches, at both
375px and 1440px.

### A new check: active-vs-inactive state distinctness

Two individually-passing `contrast` checks would not have caught the sort
control's own earlier bug (documented in the prior bundle's history entry): a
first draft styled the pressed button `color: var(--green)`, which `.btn` was
already setting, so pressed and unpressed rendered the IDENTICAL foreground at
the IDENTICAL 8.28:1 ratio and only `aria-pressed` told them apart -- invisible
to a sighted reader, and 8.28:1 clears 4.5:1 twice over so neither individual
check would ever redden on it. `statePairContrast` (`tools/browser-verify/checks.mjs`,
wired into `run.mjs` as a new `statePairs` spec key) reads the foreground colour
and the contrast ratio of an "active" element and an "inactive" element and
fails unless they actually differ from EACH OTHER -- by a real RGB separation in
the ink or a materially different ratio against their own ground. Run against the
real, already-fixed control it reports `Δfg=61.1 Δratio=0.29`, comfortably over
either threshold; its `--selftest` negative control reconstructs the exact
green-on-green bug in an isolated fixture (`.btn{color:#78b870}` restated
verbatim by `[aria-pressed='true']`) and measures the identical `8.28:1` both
ways, proving the check would have caught it, and the positive control proves it
does not fire on the fixed shape.

### Measured

- **`svelte-check`: 0 errors, 37 warnings, same 31/5/1 mix.** Re-derived after
  `svelte-kit sync` against a placeholder `.env`, per the standing trap about a
  fresh checkout reporting phantom errors with none present.
- **`npm run verify:browser`, before this session's changes (stashed back to the
  merged state, a fresh `vite dev` process per run so the stash reliably reaches
  the served bundle): 18 route/width runs, 120 measurements, 2 outside
  threshold.** Confirms the prompt's own baseline rather than trusting it.
- **`npm run verify:browser`, after: 20 route/width runs (18 + 1 new route x 2
  widths), 146 measurements (120 + 26), 2 outside threshold.** The 2 are
  unchanged: both are the pre-existing `/dev/pathways` tap-target finding
  (26.2px harness controls), confirmed by re-reading the failing lines in both
  runs. Nothing this session added is outside threshold.
- **`node tools/browser-verify/run.mjs --selftest`: 24 controls (12 negative, 12
  positive), 0 instrument failures**, up from 22/11/11 with the new
  `state-pair-contrast` pair included and proving correctly both ways.
- **`npm test`: 133 files, 3061 tests, all passing**, unchanged from before this
  session -- expected, since nothing under `src/lib`, `src/routes` outside the
  one harness page, or `supabase/migrations` changed.

### What was NOT verified

- **No signed-in surface and no local Supabase stack.** Same as the prior
  bundle: no Docker, no Supabase CLI, no `/dev/login`.
- **No production or preview deployment.** Nothing was opened on `ideabosco.com`.
- **`npm run build` was not run** (the documented Windows `EPERM` trap does not
  apply to this Linux container, but the build was not exercised either way).
- **The metadata editor's actual RPC semantics were not exercised** -- only the
  harness's own in-memory `saveField`, which is deliberately the same shape
  `/foundry/mine` and the real route already use. The RPC itself
  (`foundry_update_app_metadata`) is unchanged by this session.

### Scope held

Both files touched are exactly the two named in this session's brief:
`src/routes/dev/foundry-gallery/+page.svelte` and `tools/browser-verify/` (four
files inside it: `checks.mjs`, `routes.mjs`, `run.mjs`, `selftest.mjs`).
`CLAUDE.md`, everything under `src/lib`, and every migration were left
untouched, as instructed -- `CLAUDE.md` in particular has another session's work
in flight on it. The four items the prior bundle deferred for promotion into
`CLAUDE.md`, and the `classroom-updates.json` entry it flagged as possibly owed,
remain exactly as deferred; this session did not touch either file and is not
the one to resolve that deferral.

---

---

