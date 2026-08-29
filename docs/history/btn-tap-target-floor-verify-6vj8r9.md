---
title: "The `.btn` tap-target coverage this session's predecessor added is verified against the real floor (`claude/btn-tap-target-floor-verify-6vj8r9`, no migration)"
date: 2026-08-29
branches: [claude/btn-tap-target-floor-verify-6vj8r9]
migrations: []
subsystems: ["browser-verify harness", "classroom composer"]
---

**The premise handed to this session:** `claude/tap-target-btn-coverage-sket8k`
(merged into `integration` at `0638bcd`) added four `.btn` tap-target
selectors to `tools/browser-verify/routes.mjs` and measured 8 findings
outside threshold on a tree with **no `.btn` floor in `src/app.css`** -- 4
pre-existing (unrelated to `.btn`) plus 4 new, of which 2 were called real:
`/dev/foundry-submit`'s harness chrome (12 controls at 95.5x39.4) and
`ContentComposer.svelte`'s `.composer-actions` footer (3 controls at
112.8x39.4 / 130.1x39.4). This session's job was to establish which of those
2 survive now that a real `.btn { min-height: 44px }` floor exists in
`src/app.css` (confirmed present at apply time, ~line 327, with the "a chip
opts back down and must declare it" comment) and to fix what is owned here
if it does not.

**Branching correction, worth recording:** `origin/integration`'s tip at
session start was `d2c2ee6` (`Merge claude/tap-target-btn-coverage-sket8k
into integration`), NOT the checked-out working tree's HEAD (`d8405aa`,
which was `main`'s tip after PR #50 and diverges from `integration` --
`main` and `integration` have forked, neither is an ancestor of the other).
The branch this session already had checked out under this session's name
was rooted on `main`'s tip, not `integration`'s, and had to be recreated
from `origin/integration` directly (the old one renamed aside as
`-oldmain` and left alone, untouched, in case it held anything worth
recovering -- it did not; it was 0 commits ahead of `origin/main`).

### The two real findings, re-measured with the floor in place

Both are clean. Neither `.composer-actions` nor `/dev/foundry-submit`'s
harness chrome (`.h-tabs`, `.h-buttons`) carries any local height/padding
override that would fight `.btn`'s new `min-height: 44px` -- confirmed by
reading `ContentComposer.svelte`'s `<style>` block (no rule touches
`.composer-actions .btn`) and `classroom.css` (no selector reaches
`.composer-actions` at all; the file's only height overrides are
`.btn.tiny`/`.btn.secondary.tiny` at a 24px floor and `.cr-console .btn` at
an explicit 44px, neither of which applies here), and by reading
`/dev/foundry-submit/+page.svelte`'s `<style>` block (`.h-tabs`, `.h-buttons`
set only flex layout and spacing, no height).

- `/dev/classroom-split` compose-assignment-rubric, `.compose-card
  .composer-actions .btn`: **112.8x44 / 130.1x44, 0/3 under 44px, both
  widths.** (Was 112.8x39.4 / 130.1x39.4 before the floor.)
- `/dev/foundry-submit`, `.h-tabs .btn, .h-buttons .btn`: **95.5x44, 0/12
  under 44px, both widths.** (Was 95.5x39.4 before the floor.)

**No fix was needed in `ContentComposer.svelte`.** The footer was never
overriding the floor; it simply predates one existing to inherit from. This
session's ownership of that file is confirmed unused for this task --
nothing in it changed.

### Route checks corrected (a stale expectation, not a stale threshold)

The two `min: 44` thresholds in `routes.mjs` were never stale -- they always
asserted the right number, so nothing "passes trivially" now that changed
meaning. What WAS stale is the surrounding comment prose: both blocks said
"Measured with no fix applied: ...39.4..." in a way that read as the
current state rather than as history once the floor actually landed.
Updated both comments (composer footer, foundry-submit harness chrome) to
state the pre-floor measurement as history and the post-floor re-measurement
(44px, clean) as the current, confirmed state -- so a future reader is not
left wondering whether the 39.4 number is still true. No selector and no
`min` value changed.

### The full pass, and what does not belong to this bundle

Before (isolated re-runs of the two owned checks, floor already present,
confirming the finding-by-finding claim above): clean, as reported.

Full `npm run verify:browser`, run twice for stability: **50 route/width
runs, 418 measurements, 9 outside threshold** on the first pass and **7** on
a second, both after this session's `routes.mjs` edit. The variance is
entirely in one route discussed below, not in anything this bundle touches.
Held constant across both runs:

- `/dev/pathways` harness controls, both widths: **194.7x26.2, 2/2 under
  44px.** Confirmed unrelated to `.btn` entirely -- `src/routes/dev/pathways
  /+page.svelte`'s `.controls button` is a **plain `<button>` with no `.btn`
  class at all** (its own hand-written border/padding/font rules), so a
  `.btn` floor of any size cannot reach it. Pre-existing, undocumented by
  this session's ownership (`tools/browser-verify/`, `ContentComposer.svelte`
  -- this route is neither), left as found.
- `/dev/notebook` free-entry compose card, `.compose-card label.label-field`
  presence (expects 2, gets 1): pre-existing, a presence check (title +
  folder fields), not a tap-target and not `.btn`-shaped. Owned by
  `NotebookView.svelte`, not this session's file. Left as found. (One full
  run reported it at only one width instead of both -- the same
  full-run-only flake `tap-target-btn-coverage-sket8k`'s own history entry
  already documented for this exact check; re-running it in isolation
  reproduces both widths every time.)

**New this session, and NOT part of the `.btn`-floor task:**
`/dev/gauntlet-shell-countdown`'s three presence checks (countdown overlay
armed, its numeral, its `aria-hidden`) failed on one or both widths across
both full runs (6 measurements on the first run, 3 on the second -- the
inconsistency itself is the tell). Re-run in isolation (`--route
gauntlet-shell-countdown`), it reproduced at both widths, both times, with
the `prepare` step reporting its click predicate as satisfied before the
presence assertions still read zero -- a route-internal timing issue between
the countdown mount and this check's read, unrelated to any `.btn` sizing
rule and to anything this session edited. This route lives entirely under
`src/lib/gauntlet/` and `src/routes/dev/gauntlet-shell-countdown`, which
this session was explicitly told not to touch (two other sessions were
reported live, and `git log` on `origin/integration` shows recent GAUNTLET
commits, including one to `src/lib/gauntlet` clock/contrast work, from
the hours immediately before this session started -- consistent with a
concurrent change to that surface, though this session did not verify which
commit is responsible). Reported here by measured figure and owning path,
per this task's own instruction for a survivor in a file not owned, and
left untouched.

### The count, stated plainly

Every survivor is now named and justified:

- 2 `.btn`-shaped findings this task was sent to resolve: **both clean**,
  confirmed twice independently, no code change needed beyond the comment
  correction above.
- 2 pre-existing, unrelated, undocumented-by-this-session findings
  (`/dev/pathways`, plain `<button>`; `/dev/notebook`, a presence gap):
  unchanged, not `.btn`-shaped, not this session's files.
- 3 new findings on `/dev/gauntlet-shell-countdown`: a timing race in a
  GAUNTLET dev route, not `.btn`-shaped, explicitly out of this session's
  file scope, most likely concurrent with another live session's GAUNTLET
  work.

No threshold was loosened anywhere. The count moving from 8 (the premise) to
0 real `.btn` survivors is the correction working as designed -- the floor
landed, the two real findings the prior bundle predicted would close did
close, and nothing pre-existing was touched to get there.

### Verified

- `npx svelte-kit sync && npx svelte-check`: 0 errors, 37 warnings (31
  `state_referenced_locally`, 5 `css_unused_selector`, 1
  `perf_avoid_nested_class`), matching the documented baseline, both before
  and after this session's edit (routes.mjs is not a Svelte file and cannot
  move this number; confirmed anyway).
- `node --check tools/browser-verify/routes.mjs` and a direct
  `import()` of the module: both succeed: the edited comments did not break
  the file.
- `npm run verify:browser` --probe: Chromium 141.0.7390.37 present, rAF,
  IntersectionObserver, ResizeObserver, canvas readback, `color-mix()`, and
  animation interpolation all confirmed working in this container (per the
  README's own measured table).
- Full pass run three times total in this session (once before the comment
  edit, twice after); the two owned findings were clean in every run that
  measured them.
- Full `npm test` suite: **170 files, 3628 tests, all passing** (273.65s).
  No application code was touched this session, so this is a confirmation
  the two-comment edit in `tools/browser-verify/routes.mjs` broke nothing,
  not a defense of a code change.

### Not verified

- Which commit introduced the `/dev/gauntlet-shell-countdown` timing race,
  or whether it is itself a genuine regression versus a pre-existing flake
  that the prior bundle's full-pass runs never happened to surface (its own
  history entry documented a similar flake on a different route). Diagnosing
  or fixing it is out of this session's file scope (`src/lib/gauntlet/` was
  off limits) and out of this task's `.btn` remit.
- A real Chromium-rendered screenshot of either owned control (per the
  harness's own documented limits, geometry is the auditable number, not a
  picture).
- A real signed-in session; this bundle touches no route, no data path, and
  no student-facing behaviour beyond confirming an already-shipped CSS
  floor does what it was meant to, so no `classroom-updates.json` entry was
  added.

### What was NOT changed

`src/app.css` (the floor itself, already shipped by whichever bundle
preceded this one on `integration` -- this session confirmed it, never
edited it), any migration, and everything under `src/lib/gauntlet/` --
all off limits for this session and none of them needed to change to
answer the question this task asked. `src/lib/classroom/ContentComposer.svelte`
was read in full and found to need no change. The only diff is two comment
blocks in `tools/browser-verify/routes.mjs`; no selector, no `min` threshold,
and no route definition changed.
