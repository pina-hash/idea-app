---
title: "Merging claude/gauntlet-component-harnesses-gnddjg into integration: a two-append conflict in tools/browser-verify/routes.mjs, resolved by keeping both route sets"
date: 2026-08-29
branches: [claude/merge-gauntlet-harnesses-integration-nghlc3]
migrations: []
subsystems: ["browser-verify harness", "GAUNTLET"]
---

`claude/gauntlet-component-harnesses-gnddjg` could not merge into `integration`
by the automation. The cause was exactly one file: both that branch and
`integration`'s tip (`51dd94e`, carrying commit `4253321`) appended new entries
to the `ROUTES` array in `tools/browser-verify/routes.mjs` -- `integration`
added `/dev/frc` and `/dev/classroom-deck`, the harness branch added
`/dev/gauntlet-shell`, `/dev/gauntlet-shell-countdown` and `/dev/gauntlet-run`.
Every other file each side touched was disjoint (verified with `git diff
--name-only` from the merge-base against each side before touching anything).
This is the **third** time this project has had to resolve a hand-conflict in
one shared table this way -- `CLAUDE.md` already names the pattern for
`docs/history/` (one file per entry, for exactly this reason) and for
`app_feedback`'s write paths; a growing array in a single file that many
sessions append to is the same shape again, and it will not be the last time
it collides.

### The resolution

Neither side was wrong. Both are ordinary appends to one array. The merge
conflict was resolved by keeping both objects, in the order Git's merge left
them (`/dev/frc`, `/dev/classroom-deck`, then the three GAUNTLET viewport
routes), and removing the three conflict markers -- no content on either side
was edited.

### Verified by running, not by reading

- `node --check` / a live `import()` of the merged module: parses clean, 25
  routes exported (22 pre-existing + the 3 new GAUNTLET ones; the 2 from
  `integration`'s own side were already counted in the harness branch's "22").
- `svelte-check`: **0 errors, 37 warnings**, mix **31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`** -- unchanged from
  the documented baseline.
- Full suite (`npm test`): **163 files, 3524 tests, 0 failing**, in 107.04s.
  `origin/integration` alone (before this merge) is the **3476** the task
  brief cited; the harness branch's two new files
  (`tests/gauntlet-payload-sql-contract.test.ts`,
  `tests/gauntlet-progression.test.ts`) together hold exactly **48** tests
  (verified standalone: `2 files, 48 passed`). `3476 + 48 = 3524` -- the
  merge added nothing and lost nothing.
- `npm run verify:browser` (full, both widths): **50 route/width runs, 410
  measurements, 7 outside threshold**, wall clock **121.6s**. Against each
  side's own numbers: `integration` contributed `/dev/frc` and
  `/dev/classroom-deck` (2 routes x 2 widths = 4 runs); the harness branch
  alone reported 46 runs / 388 measurements / 6 outside threshold / 116.7s.
  `46 + 4 = 50` runs, `388 + 22 = 410` measurements (each new route/width
  carries its own presence/contrast/tap-target checks). The harness branch's
  README cites ~3.6s per route/width for its own new specs against a ~2.6s
  baseline elsewhere in the file; this run's wall clock is consistent with
  that mix once boot time (3.4s) is subtracted.
- `npm run verify:browser -- --selftest`: **44 controls (22 negative, 22
  positive), 0 instrument failures**. The harness branch's own bundle raised
  this from 36 by adding `textContains` and a `maxVisible` presence ceiling;
  both prove clean post-merge.

### The three findings that ride in with this branch, confirmed still present

All three are pre-existing defects the harness branch's new routes make
visible for the first time, not something introduced by this merge, and none
were touched:

1. **GAUNTLET speedrun clock's STANDBY label, 3.39:1** -- `/dev/gauntlet-run`,
   both widths, `contrast [STANDBY label on the clock plate]`, fg
   `rgb(154, 90, 58)` on `rgb(14, 22, 27)`. Measured identically at 375 and
   1440.
2. **Four of eight post-run controls under 44px at 375px** --
   `/dev/gauntlet-run` @375, `tap-target [post-run actions (retry / next /
   back)]`: smallest 135.7x40.4, 4/8 under 44px. At 1440 the same row is
   clean (0/8 under 44px, smallest 282.2x45.4) -- this is a 375px-only defect,
   confirmed by re-measuring rather than assumed. This finding's mechanism is
   said to be in `src/app.css`, and another session may be working on it
   concurrently; it was **not** fixed here, and it still reports after the
   merge, so nothing about it disappeared.
3. **`/dev/notebook`'s intermittent finding** -- `presence [free-entry title
   + folder fields (both stacked, not row-flex)]` came back `withinThreshold:
   false` (present 1, visible 1, against an expectation of 2) on both widths
   in this run, reproducing the documented race: the route's `prepare` click
   forces "Something else" before measuring, but the `until` predicate
   (`aria-pressed === "true"` on the free-entry pick) is satisfiable by
   state the pre-click render can already be in, so the step can resolve
   before the title/folder fields have actually re-rendered for it.

A fourth finding also appeared in this run and is unrelated to any of the
three above or to this merge: `/dev/pathways`, both widths, `tap-target
[harness controls]` (smallest 194.7x26.2, 2/2 under 44px, 0 under the 24px
floor) -- these are the harness's own dev-bar navigation buttons, present on
both sides before this merge, not part of the GAUNTLET bundle's payload.
Reported for completeness; not investigated further here.

### Not verified

- No signed-in surface, no live Supabase, no Drive round trip -- this session
  touched no database and no migration.
- `npm run build` was not attempted (the known Windows EPERM trap does not
  apply on this Linux container, but a full production build was out of scope
  for a route-table conflict).

### What was not done

The three findings above are reported, not fixed, per the task's explicit
instruction. Nothing under `src/lib/gauntlet/`, `src/routes/gauntlet/`, or
`src/app.css` was touched by this merge.
