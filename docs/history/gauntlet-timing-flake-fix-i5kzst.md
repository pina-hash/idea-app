---
title: "The GAUNTLET verification-floor fixture seeded two honest runs at the identical nominal time, so its rank-1 seat assertion was racing per-call clock drift; separated the two times (`claude/gauntlet-timing-flake-fix-i5kzst`)"
date: 2026-09-10
branches: [claude/gauntlet-timing-flake-fix-i5kzst]
migrations: []
subsystems: ["GAUNTLET", "Testing"]
---

Prompt 0132, a repair-only bundle. It owns exactly one source file
(`tests/db/gauntlet-verification-floor.test.ts`), this entry and its own
ledger entry. No migration.

## THE ROOT CAUSE, BY NAME

**`runFor` backdates the clock in one statement and `gauntlet_macro_submit`
reads it back in a later one, so every stored `elapsed_ms` is `elapsedMs +
drift`, and drift is independent per call.** The helper updates
`gauntlet_run_tokens.started_at = now() - make_interval(secs =>
elapsedMs/1000)`, then `gauntlet_macro_submit` computes
`elapsed_ms = now() - started_at` on its own, separate, `now()`. Two calls
given the same nominal `elapsedMs` do not produce the same stored value; each
picks up whatever passed between the two statements on that particular round
trip.

The fixture seeded Ben and Cleo -- two students, both correct, on the same
challenge -- with the identical nominal `HONEST_MS` (187,004ms), and one test
asserted Ben holds board rank 1 over Cleo. `0194`'s ranking is a deterministic
window ending in `created_at asc`, and the file reads as though it is relying
on that to settle a tie between two equal times, insertion order (Ben's
`runFor` call precedes Cleo's) deciding the seat. **That tiebreak never
runs**, because the two `score_metric` values that actually land in the table
are never exactly equal -- each carries its own drift, so the ordering is
decided by whichever round trip happened to be faster, which is a property of
system load and nothing this test controls.

Measured on the merged tree: roughly 1 failure in 16 standalone runs, 0 in 6
on a quiet local machine. Load-dependent is exactly why a shared CI runner hit
it on the first full-suite pass while a 7,026-test local suite passed clean --
the two environments do not carry the same scheduling noise between two
statements 2ms apart.

## THE FIX

Gave Cleo her own honest time, `CLEO_HONEST_MS = 192,881`, roughly 5.9 seconds
slower than Ben's `HONEST_MS`. The gap is chosen to outlast any plausible
round-trip drift by orders of magnitude, not to be the smallest number that
happened to pass locally -- the whole point of the defect is that "passed on
this run" proves nothing about the next one. Ben stays the rank-1 seat by
being strictly faster, not by an insertion-order coincidence the ranking was
never actually using.

Two assertions read `HONEST_MS` back and had to be checked against which
constant actually applies to the row each one reads:

- The board test for Cleo's own row (`cleos[0].score_metric`) was reading
  `HONEST_MS` -- Ben's constant -- against Cleo's ranked time. That was
  already a latent mismatch masked by the two constants having been equal;
  now that they differ it reads `CLEO_HONEST_MS`, correctly.
- The per-drawing record test reads `held?.best_time` where `held` is Ben's
  row (`records.find((r) => r.user_id === ben.id)`). That one stays
  `HONEST_MS`, unchanged -- it was already reading the right person's
  constant.

No other line in the file moved. `supabase/migrations/0194_gauntlet_verification_floor.sql`
was not touched: the migration was never the defect, the fixture driving it
was.

## WHAT WAS MEASURED

- The file, standalone, 20 times in a row: **20/20 passed**, 11/11 tests every
  run.
- The file, 4 more times, with the full suite running concurrently in the
  background as the load generator (the condition that actually produces the
  flake, per the 1-in-16 figure above): **4/4 passed**, 11/11 tests every run.
  24/24 total.
- `svelte-check`: **0 errors, 37 warnings**, breakdown **31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`** -- matches the
  file's own stated baseline exactly.
- The full suite, once, at the end: **358 passed / 1 failed** of 359 files,
  **7055 passed / 5 failed** of 7060 tests. The target file is in the 358.

## A SECOND FAILURE, FOUND AND DELIBERATELY LEFT ALONE

The one failing file in that final run is **not** this one:
`tests/derived-numbers.test.ts` fails on `origin/integration`'s own tip
(`541e00a1`), confirmed by stashing this lane's one-file change and re-running
it against a clean checkout of that tip -- the failure is identical with or
without this bundle's fix. Three `html-rubric-*` route specs
(`html-rubric-state-graded.mjs`, `html-rubric-state-single.mjs`,
`html-rubric.mjs`) landed after the measured region of
`tools/browser-verify/README.md` was last regenerated on the merged tree
(`docs/history/ledger-0130-derived-numbers-b629zb.md`), and were never
measured by that run -- the exact recurring defect that entry named and asked
every future landing bundle to check for.

This lane does not fix it. The prompt scoped this session to exactly one
file, explicitly withheld `npm run verify:readme` (which needs a browser and
regenerates the region), and 0130's own entry already states whose job the
re-check is: "every landing bundle inherits this one's job." Reported here so
the next landing bundle does not have to re-derive it: `tests/derived-numbers.test.ts`
is red on `integration`, for this reason, independent of this bundle.

## WHAT WAS NOT VERIFIED

No live Supabase project, no Drive round trip, no signed-in browser session --
none of those are implicated in a fixture-only, database-harness-only change,
and none was touched or needed.

## WHAT SHIPPED

`tests/db/gauntlet-verification-floor.test.ts` only. No migration, no schema
change, no application code.
