---
title: "The changelog was on every route, not just the one that renders it: `virtual:site-versions` splits in two, MatrixRain and the root layout's two reads stop being paid up front, and the profile ladder stops walking on a missing row (`claude/loading-perf-audit-0108-ynczwk`, no migration)"
date: 2026-09-09
branches: [claude/loading-perf-audit-0108-ynczwk]
migrations: []
subsystems: ["Portal", "Toolchain", "Profiles", "FRC", "Testing"]
---

Ledger 0108, five independent items from the 0107 read-only loading audit. The
audit ran against `ec017b9d` without `node_modules`, so every figure in it was
comment-stripped source rather than a wire measurement, and it said so. This
bundle confirmed each claim against the tree, then measured the one it could
not: what a production build actually ships.

Files owned: `src/routes/+layout.server.ts`, `vite.config.ts`,
`src/site-versions.d.ts`, the changelog import in `src/routes/+page.svelte`,
`src/lib/frc/ChangelogFooter.svelte`,
`src/lib/design-system/themes/ThemeRoot.svelte`, `src/lib/profile.ts`,
`src/routes/assignments/[slug]/+server.ts`, their tests, and this entry.

## THE UNRESOLVED QUESTION FROM FINDING 1, AND THE ANSWER IS THE BAD ONE

The prompt asked, and forbade assuming: does the changelog payload reach routes
other than `/`? **It does, and it reached every one of them.** It was not a
landing-page problem at all.

**How it was found.** A production build (`npm run build`, which works on Linux
-- the `EPERM` in CLAUDE.md's toolchain traps is Windows-only), then a walk of
the emitted client chunk graph following STATIC import specifiers only,
`import(...)` deliberately excluded. The chunk holding the log was located by
grepping the build output for a known commit subject rather than by guessing a
filename.

**What it showed.** `entries`, `apps` and `deploy` were three exports of ONE
virtual module. `entries` had exactly two consumers (`/` and
`ChangelogFooter`), but `deploy` had nine, including `src/routes/+layout.svelte`
-- the root layout. Rollup will drop an unused export from a module, but a
module several entry points import is HOISTED INTO A SHARED CHUNK, and that
chunk carries every binding any of its dependents needs. So the log landed in a
shared chunk that both `nodes/0.js` (the root layout) and `entry/app.js` (the
client entry) imported statically:

| | files | raw | gzip |
|---|---|---|---|
| every route, before | 22 | 664,121 | 181,891 |
| every route, after | 23 | 413,284 | 126,083 |

**250,837 bytes off every route in the site** (55,808 gzipped) -- the signed-out
landing page, every legacy assignment handout, every classroom page. The chunk
itself was 247,850 bytes holding 1,433 commit records.

The measurement is a BEFORE and AFTER of the same script over two real builds,
the "before" built in a `git worktree` at this branch's first commit rather than
by stashing -- CLAUDE.md's stash trap is about a dev watcher, but a worktree
costs nothing and cannot discard uncommitted work.

**Why tree-shaking was never going to fix it, and why a second module was.** The
fix is not a smarter import; it is a second CHUNK. `virtual:site-changelog` now
carries `entries` alone and is reached only through `await import()`; the eager
module keeps `apps` and `deploy` and gains `total` and `latest`. After: the
changelog chunk is referenced by exactly two route nodes, both as
`await import(...)`, and by neither the root layout nor the client entry.

`total` and `latest` are scalars, not a second copy of the log. `/` renders
`<filtered> / <total>` and the FRC summary line reads "Updated <date>" while
collapsed, so both have to survive the log being absent. A `recent` SLICE was
the rejected alternative and would have been faster for `ChangelogFooter`, which
only ever shows eight entries -- but it is a second copy of entry data in the
eager module, and two copies of the changelog is the thing that stops matching.

## THE OTHER FOUR

**MatrixRain (finding 8).** `ThemeRoot` is mounted in the root layout and
statically imported an 11,801-byte component plus its simulation module, for an
opt-in theme that is not the default, including on the signed-out page where the
control to enable it does not render. Now imported inside the branch that uses
it. Measured with a POSITIVE CONTROL, which is the half that matters: the first
probe searched for identifier names (`glyphAt`, `mulberry32`) and returned zero
hits in BOTH builds, which reads as a clean result and is a probe minification
had defeated. Re-run against the surviving string literals (`matrix-rain`, the
glyph set) and swept over the whole build first: before, the marker is in
`nodes/0.js` and in the every-route closure; after, it is a separate 5,208-byte
chunk and NOT in that closure. Driving the real signed-out `/` in Chromium:
**0 requests** for either module.

Deferring it cannot change the DOM, and that was checked rather than assumed:
`MatrixRain.svelte` has nothing after its closing script tag and builds its
canvas imperatively, so the component contributed an empty render before and an
absent one after -- the same zero nodes. A test pins that, because the day it
grows markup is the day this becomes a hydration mismatch.

**The root layout's two reads (finding 2).** Two sequential awaits on every
authenticated page load, app-wide. Independent, so `Promise.all`. The audit's
supporting line number was wrong -- it cited `src/lib/server/admin.ts:10-21`,
which is comment text; `isAdmin` is at 44-55 -- but the substance held, with one
correction worth writing down: `isAdmin`'s pre-0067 fallback DOES read
`profiles`. It reads it as its own query keyed on the same `claims.sub` and
consumes nothing `loadProfile` produces, so the two are still independent, but
"reads nothing from the profile" is not quite the reason.

**The profile ladder (finding 10).** `fetchUserProfile` discarded `error`
entirely and stepped down on `!data`. `maybeSingle()` answers
`data: null, error: null` for a row that is not there -- which IS the sign-in
transient `+layout.server.ts` retries around -- so that case walked all three
rungs, and the caller then slept 200ms and walked them again: six round trips
and 200ms to learn what the first rung already knew. Now keyed on the
column-missing code.

That predicate is IMPORTED, not re-spelled: `feedbackColumnMissing` in
`$lib/feedback/feedback.ts` is this repo's one statement of `PGRST204 || 42703`,
and its subsystem prefix says where it was born rather than what it does (the
`_notebook_email_for_user` situation). Checked that this costs nothing: the root
layout already mounts `SiteFeedback`, which value-imports the same module, so it
is in the root chunk on every route regardless. The tidier home would be
`$lib/pg-errors.ts` -- "knowledge about Postgres and PostgREST, not about any
feature" by its own header -- but that file and `feedback.ts` are both outside
this bundle's owned paths, so moving it is left as a follow-up rather than done
sideways.

**The assignment handout (finding 11).** `/assignments/<slug>` is public,
QR-coded onto printed handouts, and set no `Cache-Control`, so a class of thirty
opening one slug was thirty function invocations. Now
`public, max-age=0, s-maxage=60, must-revalidate`.

It deliberately does NOT take the coin ledger's `Vary: Cookie`, and that is the
half that is easy to add by copying. The ledger varies because its shell injects
a signed-in boolean; this handler reads no session, no cookie and no claim, so
`Vary: Cookie` would fragment the shared cache by every student's distinct
session cookie -- costing the entire benefit on exactly the class-wide burst it
exists for. A test asserts the absence here beside the presence there, so the
two cannot be "made consistent" without reading why they differ.

## MEASURED

- `svelte-check`: **0 errors, 37 warnings in 20 files**, before and after, with
  `PUBLIC_SUPABASE_URL`/`_ANON_KEY` exported before `svelte-kit sync` (the
  13-phantom-error trap; this checkout had no `.env`).
- Full suite before, measured in the worktree rather than taken from the prompt:
  **327 files, 6525 tests**, matching the stated baseline exactly. After:
  **332 files, 6551 tests**, all passing -- five added files, 26 added tests.
- Build: both builds clean, exit 0.
- Real Chromium (141.0.7390.37) against the dev server on the actual `/`:
  before opening the panel, **0** requests for the changelog module, 0 entries
  rendered, count reads `0 / 1433`; on open, **1** request, 1,433 entries, 4
  month headings, `1433 / 1433`, and `79 / 1433` after a filter. No
  "No updates recorded yet." shown at any point. The one console error is
  `fonts.googleapis.com` reset, which is the harness blocking non-loopback
  requests, documented in CLAUDE.md and not this change.

Each of the five has a test that FAILS on the pre-fix code, verified by running
the new tests against the baseline worktree: 6 of 13 behavioural assertions and
6 of 9 structural ones fail there, with diagnostics naming the actual defect
(`expected 3 to be 1` for the ladder, `expected false to be true` for the
sequential awaits, `expected null not to be null` for the missing header). The
remaining 7 and 3 pass on the old code and are the positive controls -- without
them a red file cannot be told from a broken sweep.

The `ChangelogFooter` disclosure is a MOUNT test rather than a source sweep,
because whether `ontoggle` is reached is a property of the compiled component:
Svelte 5 delegates a fixed event list at the root and attaches everything else
directly, which is the shape that bit `dialog`'s non-bubbling `close` elsewhere
in this repo. `tests/dom` is the only project where an effect runs.

## NOT VERIFIED

- **Nothing was run against the live Supabase project**, and nothing here could
  be: no migration, no RPC change, and the local `.env` is a placeholder.
- **The FRC track's footer was not driven in a browser.** `/frc` is signed-in
  tier and no automated run holds a Bosco Tech Google session; it is covered by
  the mount test and by the build's chunk graph instead.
- **The matrix theme itself was not driven in a browser** for the same reason --
  it requires a session AND the preference set. What was verified is that the
  module is a separate chunk, is absent from the every-route closure, and is not
  requested on the signed-out page.
- **No production timing figure.** Every byte number here is from a local
  production build; none is a measurement of `ideabosco.com`.
- `prefers-reduced-motion` is `no-preference` in this environment, so that path
  was not exercised.

## LEFT UNDONE, DELIBERATELY

- **`src/lib/classroom/transports.ts` was not touched.** The 0107 audit's
  finding 3 named a `loadItemWork` improvement there; ledger 0106 owns that file
  and is live. Reported, unchanged, not read for this bundle.
- **`CLAUDE.md` was not edited.** It is outside this bundle's owned paths and is
  a high-conflict file with another lane live. It needs a line: `entries` now
  comes from `virtual:site-changelog` and must never be statically imported, or
  it returns to every route silently. `tools/claude-md-check.mjs` passes as it
  stands (`virtual:site-versions` still exists), so nothing currently reddens --
  which is exactly why it is worth saying out loud.
- **`vitest.config.ts` WAS edited**, and it is not literally in the owned list.
  One alias, pointing `virtual:site-changelog` at its stub, without which the
  stub cannot resolve and no test could import either surface. Flagged rather
  than filed silently.
- Moving the column-missing predicate to `$lib/pg-errors.ts`, as above.
