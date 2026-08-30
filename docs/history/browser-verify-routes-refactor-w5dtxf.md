---
title: "`tools/browser-verify/routes.mjs` becomes one file per route spec, for the same reason the history record was split (`claude/browser-verify-routes-refactor-w5dtxf`, docs/tools only, no migration)"
date: 2026-08-29
branches: [claude/browser-verify-routes-refactor-w5dtxf]
migrations: []
subsystems: ["Build, theme, tests, conventions"]
---

`tools/browser-verify/routes.mjs` was a single `export const ROUTES = [ {...},
{...}, ... ]` array that every lane adding a dev-route check appended a new
object to, at the same closing `];`. That is the identical shape
`docs/HISTORY.md` had before it was split
(`docs/history/history-merge-split-vx1fmk.md`): one shared append point, hit by
every unrelated pair of features, and it had already forced a hand resolution
on a merge three times before this session, on top of blocking one outright.
The brief was explicit: read that entry and `docs/history/_tools/` first and
do the same thing here rather than invent a second approach, so this bundle
is that split, applied to the routes table.

### The split

**One file per route spec, under `tools/browser-verify/routes/`.** A route's
filename is derived from its own `path` (`slugify` in `routes.mjs`: strip the
leading `/dev/`, lowercase, collapse every run of non-alphanumeric characters
to one `-`) -- e.g. `/dev/home-order?role=student&classes=1&rows=3` becomes
`home-order-role-student-classes-1-rows-3.mjs`. That is collision-free by
construction for the same reason the history split's branch-named files are:
a route answers on a URL nothing else in the app does, so two lanes adding two
routes always produce two different files and share no line. `routes.mjs`'s
loader recomputes the slug from each file's own `path` and refuses to load a
file whose name disagrees, and refuses two files claiming the same `path` or
the same slug -- so a typo or an actual collision is a load-time error, not a
route silently missing or shadowing another.

**A pinned sequence number was rejected for the same reason `docs/history/`
rejected one.** `routes.mjs`'s `position()` mirrors
`docs/history/_tools/index.mjs`'s exactly: the 25 files produced by this split
carry `export const order = N`, their exact position in the original array,
so the assembled table reproduces the original order (proved below); any
route a future session adds carries no `order` at all and sorts after all 25,
alphabetically by filename -- an append point nobody has to coordinate,
because the filename is already decided by the route's own path before the
sort ever runs.

**`routes/_shared.mjs` holds `WIDTHS` and `SETTLE_ENTRANCE`**, the two values
more than one route file needs (four routes call `SETTLE_ENTRANCE` from
`prepare`). The loader in `routes.mjs` skips any `_`-prefixed file in the
directory when it reads route specs -- the same escape hatch a SvelteKit
`+server.ts` uses for a non-route export (CLAUDE.md: "anything whose key
starts with `_`") -- so `_shared.mjs` and the one-shot `_tools/` script below
are infrastructure, not routes, without needing a second list anywhere.

**`routes.mjs` itself is now the assembler and the pointer**, the same role
`docs/HISTORY.md` plays for the history split: it explains why the split
happened, states the rule for adding a route, and loads every file under
`routes/` with a Node top-level `await` (this repo already runs Node 22 as
ESM, so no bundler step is needed for that). `run.mjs`'s
`import { WIDTHS, selectRoutes, urlFor } from './routes.mjs'` is unchanged --
the only importer in the codebase, and it did not need to change at all.

**The 25 files were produced mechanically, not retyped.** A one-shot script
(`routes/_tools/split-routes.mjs`, kept for provenance and pinned against
`b4ceb02` -- the commit this branch was cut from -- rather than the working
tree) found the 25 array-element boundaries by their exact indentation (every
route object opens on a line that is precisely `\t{` and closes on precisely
`\t},` or `\t}`, confirmed by grep before trusting it: 25 opens, 25 closes),
sliced each element's source text, dedented it by one tab, and wrote it under
`export default { ... }` with `export const order = <position>` above it. It
refuses to overwrite a file that already exists, so it is not rerunnable
against the split's own output.

### Lossless, and how it was checked

Not by reading the diff -- by loading both the original array and the
assembled table in the same Node process and comparing.

- **Route count and order:** both hold exactly 25 specs, in the identical
  path order, confirmed by importing the pinned `b4ceb02` copy of the old
  `routes.mjs` from `/tmp` and the new assembled `routes.mjs` side by side and
  diffing `ROUTES.map(r => r.path)`.
- **Structural equality:** `JSON.stringify` of each of the 25 pairs was
  compared. 23 of 25 were byte-identical. The other 2
  (`/dev/classroom-split/s-1?manage=1` and `/dev/frc`) differed only inside a
  multi-line `evaluate` template-literal string, by exactly one tab of
  leading whitespace per line -- the expected consequence of dedenting the
  WHOLE file (including template-literal bodies) by one tab when it moved
  from being an array element to a top-level default export, not a
  mistranscription. Confirmed by normalizing both sides' whitespace
  (`\s+` -> one space) before re-comparing: all 25 pairs come back identical.
  The two `evaluate` strings are still valid, semantically identical
  JavaScript (indentation inside a function body is not significant), and
  `run.mjs` only ever prints them through its own `.replace(/\s+/g, ' ')`
  collapse before slicing to 70 characters, so nothing downstream can see the
  difference either.
- **`WIDTHS` and `SETTLE_ENTRANCE`:** compared with `===` (a plain array and a
  template-literal string respectively) -- identical.

### The pass, run before and after, twice on each side

`npm run verify:browser --json <file>`, full run, no `--route` filter, on
`b4ceb02` (before) and on this branch (after):

| | route/width runs | measurements | wall clock |
| --- | --- | --- | --- |
| before, run 1 | 50 | 418 | 137.6s |
| before, run 2 | 50 | 418 | 132.9s |
| after | 50 | 418 | 132.2s |

**Route/width run count and measurement count are identical across all three
runs, and the printed route order matches exactly** (diffed the `/dev/...
@<width>px` lines from the before-run-1 log against the after log: identical,
50 lines each). This is the number that proves the split moved nothing: same
routes, same checks, same order, same thresholds, run for run.

**"Outside threshold" is NOT identical across the two before-runs (3 then 7),
which is the pass's own documented flakiness, not a regression signal.** The
two `/dev/pathways` tap-target findings (194.7x26.2, a pre-existing finding
this file already tracks) appeared in all three runs. The third pre-existing
finding CLAUDE.md and the task brief both name -- intermittent on
`/dev/gauntlet-shell-countdown` -- appeared in before-run-2 (three findings
there: the countdown overlay, its numeral, and its aria-hidden attribute, all
reading `present 0` -- the countdown's own 3.7s teardown racing the click that
arms it) but not in before-run-1 or after. Before-run-2 ALSO turned up two
occurrences of a `/dev/notebook` finding (`free-entry title + folder fields`,
present 1 of an expected 2) that neither before-run-1 nor after produced, and
the after-run turned up that same `/dev/notebook` finding twice on its own.
None of these three routes' specs, checks, or thresholds changed in this
bundle -- `notebook.mjs`, `pathways.mjs` and `gauntlet-shell-countdown.mjs`
are each a verbatim (structurally identical, per above) copy of their
original array element -- so this is the harness's own async-timing
variance, run to run, on unmodified code, not something this split
introduced. **If a future session's diff makes any of these three findings
disappear on this route, CLAUDE.md's own instruction stands: that is a
regression in the instrument, not a fix.**

### `--selftest` and `--break`, confirmed still reaching the assembled table

`--selftest`: **44 controls run (22 negative, 22 positive), 0 instrument
failures** -- unchanged from the count CLAUDE.md and the task brief both cite.
`--selftest` does not read `routes.mjs` at all (it drives its own fixture
routes directly), so this mainly confirms the split did not disturb anything
it depends on; it is reported because the brief asked for it to be checked
explicitly.

`--break tiny-taps --route spec-table` and `--break overflow --route
hall-pass`: both injected their defect and both were caught (2 findings each,
matching the routes' own control descriptions in their comments -- `tiny-taps`
against `.harness button` selectors, `overflow` against every named room
wrapper). `--route` is `selectRoutes`'s substring filter over `r.path` /
`r.label`, run against the ASSEMBLED table -- proving the loader's output is
usable by every other entry point in `run.mjs`, not only the full unfiltered
pass.

### What was measured

- `npx svelte-check`: **0 errors, 37 warnings**, the pinned 31/5/1 mix,
  unchanged (this bundle adds no application code).
- `npm test`: **171 files, 3660 tests, all passing** (`npm ci` then
  `svelte-kit sync` then the placeholder `.env`, per the fresh-checkout rule).
- `npm run verify:browser`: three full runs, table above. 50 route/width
  runs and 418 measurements on every run, before and after.
- `npm run verify:browser -- --selftest`: 44 controls, 0 instrument failures.
- `npm run verify:browser -- --break {tiny-taps,overflow} --route
  {spec-table,hall-pass}`: both presets injected and caught against the
  assembled table.
- Pass duration: no measurable cost from assembling the table from 25 files
  plus one `readdirSync` and 25 dynamic `import()`s at module load -- the
  three full-run wall clocks (137.6s, 132.9s before; 132.2s after) are within
  each other's run-to-run variance, and server boot time (the number that
  would show a module-loading cost) was 4555ms/2742ms before against 2599ms
  after, i.e. not slower.

### What was NOT verified

- No live Supabase project was reached; nothing here has a database side.
- No migration was written, applied, or needed.
- `npm run build` was not run (Windows EPERM trap does not apply in this
  container, but this bundle changes no application code either way).
- The two structurally-identical-modulo-whitespace `evaluate` strings were
  confirmed semantically equivalent by whitespace-normalized comparison, not
  by parsing both into an AST and diffing that -- the normalized-string
  comparison is exact and the difference is confined to leading whitespace
  inside a string literal, so an AST diff would not have found anything this
  did not.
- Files this session does not own (`src/`, `tests/`, `supabase/`) were not
  touched, checked by `git status` before finishing.

### What was deferred

- The README's "23 specs over 17 distinct routes" line (`tools/browser-verify/README.md`)
  was already stale before this session touched anything -- the file holds 25
  specs, not 23 -- and updating that count is unrelated to the split this
  bundle was scoped to. Left alone rather than folded into an unrelated
  change.
- `routes/_tools/split-routes.mjs` is kept for provenance and will never run
  again (it refuses to overwrite existing files); it is not wired into any
  npm script, the same way `docs/history/_tools/verify-split.mjs` is run by
  hand rather than in CI.
