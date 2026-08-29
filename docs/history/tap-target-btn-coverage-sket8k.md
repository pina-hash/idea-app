---
title: "verify:browser closes the plain-.btn tap-target hole its own coverage had (`claude/tap-target-btn-coverage-sket8k`, no migration)"
date: 2026-08-29
branches: [claude/tap-target-btn-coverage-sket8k]
migrations: []
subsystems: ["browser-verify harness"]
---

**The premise handed to this session:** a bundle raising `.btn` to a 44px
floor in `src/app.css` would move zero of `verify:browser`'s 306
measurements, because no registered route's `tapTargets` selector reaches a
plain (no `.tap-44`) `.btn`. **Confirmed on the actual tree**: `src/app.css`
carries no such floor today (`.tap-44`/`.tap-reach-44` are, and remain, the
opt-in mechanism `app.css` documents -- there is deliberately no blanket
`.btn` sweep), so this session's job was to add the coverage itself and
prove it would catch the defect the day that CSS change lands, whoever
lands it. `src/app.css` is not this session's file (`tools/browser-verify/`
only) and was never committed to.

### The audit

Grepped every `.btn`-classed element in `src/lib/` and `src/routes/` for one
missing `.tap-44`, then cross-referenced against every selector already in
`routes.mjs`, restricted to the 20 route specs the harness actually drives
(a `.btn` nobody mounts through a registered route cannot be measured no
matter what the selector says). Four gaps, all real:

1. **`/dev/foundry-submit`'s own harness chrome** -- the Submit/My
   apps/Contract tab switcher and the "Drive an input shape" / "Raw
   normalize" / "Run the React fixture" buttons in the route's own
   `+page.svelte` (lines 599-662). Every `.btn` the REAL Foundry components
   render on this route (`FoundrySubmit`, `FoundryMine`, `FoundryContract`,
   `FoundryIssues`) already carries `.tap-44`, so the existing
   `.fdy-issues .btn` check was accidentally already immune to the gap this
   task exists to close -- the harness's own scaffolding was the one thing
   left plain. Measured before any fix: **95.5x39.4, 12 controls, both
   widths -- 24 readings under the 44px floor**, all from this one route.
   This is the number the task brief cited, reproduced independently.
2. **`ContentComposer.svelte`'s `.composer-actions` footer** ("Post now" /
   "Save & publish" / "Save draft" / "Cancel") -- `.btn`/`.btn.secondary`,
   no `.tap-44`, and NOT `.btn.tiny` (so the 24px chip floor
   `classroom.css` already gives `.btn.tiny`/`.btn.secondary.tiny` does not
   reach it either). Measured on `/dev/classroom-split`'s
   compose-assignment-rubric route: **112.8x39.4 and 130.1x39.4, 3
   controls, both widths**. This is a real, previously-uncaught gap in a
   file this session does not own (`src/lib/classroom/`) -- reported here,
   left unfixed, matching the brief's own instruction to name a genuine
   fifth (here, third and fourth) finding rather than suppress it. The
   identical defect is visible through `/dev/classroom?view=class-teacher`
   too (same component, `.composer-host` wrapper); only the classroom-split
   route carries the new check, to avoid reporting one root cause twice.
3. **`NotebookView.svelte`'s compose-card "Turn in" / "Save draft"**
   (`/dev/notebook`) -- plain `.btn`, no `.tap-44`, and until this bundle no
   check reached it at all on the one surface where a `.btn`-wide
   regression would matter most (a student submitting their own work).
   Measured clean today: 72.9x44 (375px) / 64.7x44 (1440px) -- added purely
   for regression protection, not because it is broken.
4. **`NotebookDeletedZone.svelte`'s restore control**
   (`/dev/notebook-review-student`, `[data-testid="staff-restore-entry"]`)
   -- `.btn.secondary.restore-btn`, plain, and this route had no
   `tapTargets` check of any kind before this bundle. Measured clean today:
   104.2x44 at both widths -- same reasoning, added for regression
   protection.

No other registered route mounts a reachable plain `.btn`: every other
`.btn.tiny`/`.tap-44`/`.tap-reach-44` site already has its own dedicated
check (or a documented reason it does not -- e.g. `SpecRenderer`'s "Add
row", inside a closed disclosure). Dozens more plain `.btn` sites exist
across `src/lib/gauntlet/`, `src/lib/coin-desk/`, `src/lib/tournaments/`,
`src/routes/admin`, etc., but none of them is mounted by any route
`tools/browser-verify/routes.mjs` drives, so none of them is a coverage
question this bundle can answer -- consistent with the harness's own
documented boundary (`/dev` routes only, a selected subset of those).

### The proof (CLAUDE.md's own mutation-proof pattern, applied to a file this
session does not own)

`md5sum src/app.css` before touching it: `ac639d507964be5bc40bde48098b693d`.

Added `min-height: 44px;` to the top of `.btn` in `src/app.css` (a direct
simulation of "raise `.btn` to a 44px floor" -- the shape the brief
describes, and the shape that would make every one of the above controls
grow). Re-ran the two REAL findings in isolation:

- `/dev/foundry-submit`: `95.5x44` (min dim 44px), 0/12 under 44px, both
  widths -- clean.
- `/dev/classroom-split` compose-assignment-rubric: `112.8x44`, 0/3 under
  44px, both widths -- clean.

Restored `src/app.css` with `git checkout -- src/app.css`; `md5sum` back to
`ac639d507964be5bc40bde48098b693d` (byte-identical). `git diff --stat src/`
is empty. Re-ran `/dev/foundry-submit` once more: back to `95.5x39.4`,
12/12 under 44px, both widths -- the check reddens again with no CSS change
standing. `git status --short` at the end of the session shows only
`tools/browser-verify/routes.mjs` modified.

### The full pass

Before this bundle: **40 route/width runs, 306 measurements, 4 outside
threshold** (the two pre-existing, documented findings: `/dev/pathways`
harness controls at 26.2px, both widths; `/dev/notebook`'s free-entry
title+folder fields presence gap, both widths -- unchanged, still present,
still the only PRE-EXISTING findings).

After: **40 route/width runs, 314 measurements (+8, four new selectors x 2
widths), 8 outside threshold** -- the same original 4, plus the two real
gaps this bundle surfaces (foundry-submit's 12 harness controls, the
composer footer's 3 controls), each counted once per width. The two
"clean today" additions (notebook compose-card, notebook-review-student
restore control) contribute measurements but no findings. No threshold was
loosened anywhere to reach this number; nothing pre-existing was touched.

One flake observed and chased down: a single full-run showed
`/dev/notebook`'s pre-existing presence finding at only ONE width instead
of both. Re-run in isolation (this bundle's changes stashed out entirely)
reproduces the SAME finding at both widths every time, so this is
full-run-only noise unrelated to this bundle, not a regression it
introduced or masked.

### Runtime

Full pass: **~96-98s** across three repeated runs (95.3s / 97.2s / 97.7s),
against a documented ~101s baseline for the prior route count -- no
material slowdown from four added selectors on already-visited pages (no
new route/width runs were added, only more assertions per existing run).
`--selftest`: unaffected, still **36 controls (18 negative, 18 positive), 0
instrument failures** -- this bundle added no new check function, only new
route-level selectors pointed at the existing `tapTargets` check, so no new
selftest fixture was needed; the live mutation proof above is this
bundle's negative control for the specific coverage gap it closes.

### Verified

- `npx svelte-kit sync && npx svelte-check`: 0 errors, 37 warnings (31
  `state_referenced_locally`, 5 `css_unused_selector`, 1
  `perf_avoid_nested_class`), matching the documented baseline exactly.
- Full suite: `npm test` -- 158 files, 3429 tests, all passing (no
  application code touched, so this is a confirmation, not a defense).
- `git diff --stat src/` empty at the end of the session (confirmed after
  the mutation-proof restore, and again at the end of the bundle).
- `git status --short`: only `tools/browser-verify/routes.mjs` modified.

### Not verified

- A real Chromium-rendered screenshot of any of the four controls (per the
  harness's own documented limits, geometry is the auditable number here,
  not a picture).
- Whether `.composer-actions`'s correct floor is genuinely 44px rather than
  some manage-only-surface exception this session was not positioned to
  invent -- that determination, and any fix, belongs to whoever owns
  `src/lib/classroom/ContentComposer.svelte`; this bundle only measures and
  reports it.
- A real signed-in session; this bundle touches no route, no data path, and
  no student-facing behaviour (harness-only), so no `classroom-updates.json`
  entry was added.

### What was NOT changed

Nothing under `src/`, `supabase/`, or `docs/` other than this history
entry. `src/app.css` was mutated and restored byte-identically as part of
the proof above and carries no diff. `tools/browser-verify/checks.mjs`,
`selftest.mjs`, `browser.mjs`, `server.mjs` and `probe.mjs` are untouched --
this bundle is four new route-level selectors in `routes.mjs`, using the
existing `tapTargets` check unchanged.
