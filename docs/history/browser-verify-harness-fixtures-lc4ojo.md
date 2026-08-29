---
title: "Two features shipped without harness fixtures get them: the composer's grading-category datalist and the Foundry download control (`claude/browser-verify-harness-fixtures-lc4ojo`, no migration)"
date: 2026-08-28
branches: [claude/browser-verify-harness-fixtures-lc4ojo]
migrations: []
subsystems: ["browser-verify harness", "Classroom", "Foundry"]
---

Two features landed on `main` this week whose harness fixtures were left for
somebody else, because the files they needed touched belonged to other live
sessions. This bundle owns `src/routes/dev/` and `tools/browser-verify/` only
and supplies both.

### 1. The composer's grading-category datalist, on `/dev/classroom`

`ContentComposer.svelte` (0142, already on `main`) reads
`transports.loadCategorySuggestions` to populate a `datalist` behind the
"Grading category" field. `src/routes/dev/classroom/+page.svelte` mounts the
real `ContentComposer` but never supplied that transport, so the datalist
never rendered there and `verify:browser` measured nothing about it.

The fixture transport (`ClassroomManageTransports.loadCategorySuggestions`)
returns the RAW, unprocessed `category` of every item posted into one of the
given courses -- mirroring the real RPC's contract exactly: ranking is
`courseCategorySuggestions`'s job, not the transport's. Every fixture item
lives under course `c-1`, and three of them carry a category (`i-3` and
`i-8`: `'Unit Labs'`; `i-4`: `'Documentation'`), so the ranked order is
`['Unit Labs', 'Documentation']`.

**A real bug found while wiring this up, not a pre-existing one:** the moment
the transport was supplied, opening the composer threw
`effect_update_depth_exceeded` on mount, before any user interaction. Cause:
`ContentComposer`'s own `$effect` calls `transports.loadCategorySuggestions`
SYNCHRONOUSLY (before any `await` inside it resolves), so every reactive read
performed during that synchronous window -- including reads made deep inside
the transport function itself, per CLAUDE.md's documented Svelte 5 trap --
becomes a dependency of THAT effect. The fixture transport read `items` and
`sections` (both `$state`) and, on its very first line, called `note()`,
which writes `log` (also `$state`), all still inside that synchronous window.
That was enough churn to spin the effect. Fix: a leading `await
Promise.resolve()` as the transport's first statement, which moves every
subsequent read past the effect's synchronous tracking window -- the same
effect `untrack` would have, achieved from the callee side since
`ContentComposer.svelte` is out of this bundle's scope
(`src/lib/classroom/` is owned by another session). Verified this is real and
not a fixture artifact by removing the `await` again and reproducing the
crash on a bare `page.evaluate` script outside the harness proper, then
re-adding it and confirming the datalist renders
`["Unit Labs", "Documentation"]` on both widths.

The new route, `/dev/classroom?view=class-teacher`, opens the composer
(`[data-testid="new-post"]`), switches to the Assignment kind tab (the
"Grading category" field only renders for `isAssignment`), and asserts the
field's `list` attribute resolves to a real `<datalist>` (`input.list`, not a
plausible-looking id) whose options are in the order a page-side probe
(`window.__categorySuggestionsFor`, exposed for this reason only) actually
produces -- calling the SAME `transports.loadCategorySuggestions` and the
SAME `courseCategorySuggestions` the real render path calls, so the expected
order is never retyped into the route spec. This needed a new check,
`datalistOrder`, in `tools/browser-verify/checks.mjs` (wired into `run.mjs`
and given a negative/positive pair in `selftest.mjs`): the existing
`orderResult` check compares a page-computed value against a STATIC expected
array, which is the wrong shape here since "the function's own output" has
to be computed in-browser too, from data that lives in a Svelte fixture
`checks.mjs`/`run.mjs` cannot import.

### 2. The Foundry download control, on the inspector and `FoundryMine`

`FoundryInspector.svelte` and `FoundryMine.svelte` both gained a "Download
this build" / "Download v&lt;ordinal&gt;" control
(`foundryDownloadUrl`/`foundryDownloadable`, already on `main`), measured by
hand because neither route carrying them was in
`tools/browser-verify/routes.mjs`.

**Reachability, established before touching anything:** `/foundry/mine` (the
real route) is behind a Bosco Tech session and answers 404 to the harness's
`dev` server, so it is not directly drivable here -- consistent with
`README.md`'s stated boundary (`/dev` routes only). Its underlying component,
`FoundryMine.svelte`, is already mounted for real by two existing dev
harnesses (`/dev/foundry-forge`, `/dev/foundry-submit`), neither of which was
in `routes.mjs` either. `FoundryInspector.svelte` was already reachable
through `/dev/foundry-gallery`, which WAS in `routes.mjs` but never measured
this control. No session was faked; the existing fixtures already exercise
the real components with file-carrying, non-hidden fixture apps.

Added:
- To the existing `/dev/foundry-gallery` entry: `presence`, `contrast` and
  `tapTargets` checks on `[data-testid="foundry-inspector"] .fdy-insp-get
  a.btn` (the inspector's reviewed 'hostile-probe' version carries real
  fixture bundle files, so `foundryDownloadable` holds).
- A new `/dev/foundry-forge` route entry: `presence`, `contrast` and
  `tapTargets` checks on `.fdy-detail .fdy-versions a.btn[download]`.
  'ember-clock' (selected by default) has five fixture versions, all
  `file_count: 3` on a non-hidden app, so `foundryDownloadable` -- which
  mirrors `foundryPreviewable` and asks no status question -- holds for
  every one, and five controls render.

**Measured, confirming the hand measurements exactly, no discrepancy:**

| control | measured | hand measurement given |
|---|---|---|
| Inspector "Download this build" | 208x45.4, 8.28:1 | 208 x 45.4, 8.28:1 |
| FoundryMine "Download v&lt;ordinal&gt;" | 138.8x45.4, 7.97:1 | 138.8 x 45.4, 7.97:1 |

No horizontal overflow at 375 or 1440 on either route.

### Verification

- `svelte-check`: 0 errors, 37 warnings, 31/5/1 mix -- unchanged (a fresh
  checkout needs the placeholder-`.env` step first; see CLAUDE.md, this is
  not a regression).
- `npm test`: 138 files / 3174 tests, all green -- unchanged, since nothing
  here is application logic.
- `npm run verify:browser`: 28 route/width runs (up from 24), 200
  measurements (up from 174), exactly 2 outside threshold both before and
  after -- the known `/dev/pathways` "harness controls" finding at 26.2px,
  unchanged in count or value. No new finding surfaced.
- `npm run verify:browser -- --selftest`: 26 controls (13 negative, 13
  positive; up from 24/12/12), 0 instrument failures. The new
  `datalist-order` group is proved both ways: a resolved datalist with
  options out of order reads OUTSIDE, the same datalist in the probe's own
  order reads WITHIN.

### Not verified

- `/foundry/mine` and `/dev/classroom` as SIGNED-IN real routes -- both
  remain dev-harness-only surfaces, per the stated boundary.
- Nothing under `src/lib/`, `src/routes/classroom/`, `src/routes/foundry/`,
  or any migration was touched, read for editing, or needed to be: both
  fixes lived entirely in this bundle's own files
  (`src/routes/dev/classroom/+page.svelte`,
  `tools/browser-verify/{routes,checks,run,selftest}.mjs`).
