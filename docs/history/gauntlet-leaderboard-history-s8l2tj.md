---
title: "GAUNTLET: the four list loaders read a student's own history from `submissions`, not from `gauntlet_leaderboard` presence (`claude/gauntlet-leaderboard-history-s8l2tj`, code and tests only, no migration)"
date: 2026-08-29
branches: [claude/gauntlet-leaderboard-history-s8l2tj]
migrations: []
subsystems: ["GAUNTLET"]
---

**Starting state, checked before doing anything.** `git fetch origin` at session
start: local/`origin/main` tip `2113f4d`, `origin/integration` ahead at
`59533a1`. `git log --oneline origin/main..origin/integration` showed the
0154 bundle (`0f5d471`, "rank a knowledge answer only if it is right, and a run
only if its clock is plausible") already merged into `integration`, but nothing
touching the four list-route loaders this task owns -- the client-side fix
0154's own header named and explicitly deferred. Branched from
`origin/integration`, not from `main`.

**The task.** `0154_gauntlet_rank_what_is_checkable.sql` narrows
`gauntlet_leaderboard` (a RANKING) to drop a wrong knowledge answer and a
sub-floor modeling pass entirely. Its own header names, and cannot fix because
it lives under `src/`, a regression in the two shapes of list loader that were
reading that view as a HISTORY of what a student has done:

- `speedrun/+page.server.ts` derived `cleared: best !== undefined` from board
  presence. A student whose only pass on a level was under the 30s
  plausibility floor loses the cleared tick, having genuinely cleared it.
- The three knowledge-mode loaders (`drawing-reading`, `gdt-tolerance`,
  `spot-the-error`) derived `attempted: best !== undefined` the same way. A
  student whose every answer was wrong now reads as never having tried, which
  is false and which they would notice.

**Where a student can read their own history.** `submissions` already carries
exactly this: RLS policy `"read own submissions"` (`0004`,
`user_id = auth.uid()`) plus `grant select on public.submissions to
authenticated`, unconditional, no column restriction. No RPC, no new grant, no
migration needed -- the read path already exists and nothing else in the repo
was using it from these four loaders. Found by reading `0004_gauntlet.sql`'s
privileges/RLS sections directly rather than reaching for a new surface.

**The fix, identical in shape across all four files.** Each loader now runs a
second query against `submissions` (`select challenge_id, is_correct`, filtered
to the caller and to the mode), and derives:

- `cleared` from a `Set` of challenge ids with an `is_correct = true` row
  (both page kinds).
- `attempted` from a `Set` of challenge ids with ANY row (knowledge pages
  only -- the speedrun list never exposed an `attempted` field).

The existing `gauntlet_leaderboard` query is UNCHANGED and stays the source for
`bestTime`/`rank`, which are legitimately absent for an unranked run (a
sub-floor speedrun clear, or -- unaffected here, but worth naming -- any run
that simply never ranked). **The board is a ranking, the loaders read history
from `submissions`; the two are no longer conflated.**

No shared helper: `CLAUDE.md` places `src/lib/gauntlet/` off limits for this
session, so the four files carry the same few lines independently rather than
factoring them into a module this session cannot touch. Duplication across
four files this task owns and a fifth session does not is the honest trade
here, not an oversight.

**Testing.** `tests/gauntlet-leaderboard-history.test.ts`, new. Boots the same
GAUNTLET migration chain the `0154` correctness suite uses, seeds through the
real pre-0154 RPCs (`gauntlet_submit`, `gauntlet_speedrun_reveal`,
`gauntlet_macro_start`, `gauntlet_macro_submit`), then applies `0154`'s real
SQL over the top -- every assertion runs against a board that has ALREADY had
0154 applied, per the task's own instruction that testing against the
pre-0154 board proves nothing.

Two page kinds, per the mutation-proof standard: `speedrun` (drives the real
loader end to end) and `drawing-reading` (drives the real loader end to end),
each through all three states -- wrong-only/sub-floor, genuinely
correct/above-floor, and untouched -- with **mutation proof**: a temporary
sibling file reverting each loader to the pre-fix, board-presence-only read is
dynamically imported and driven the same way, and is shown to fail exactly the
case this bundle exists to fix (loses the sub-floor clear; reads a wrong-only
history as never attempted) while still answering the untouched/correct cases
right, so the proof is that the NEW test actually distinguishes the fix from
the regression rather than passing on either. The mutant is a NEW file written
beside the original and deleted in a `finally`; the original on disk is never
edited, so there is nothing to restore and no `git checkout --` anywhere near
this.

`gdt-tolerance` and `spot-the-error` are proven by a source-level equivalence
sweep instead of a second and third full database drive: each is asserted to
read its own `submissions` rows (same select string, same mode filter applied
three times over -- the challenges query, the board query, the new
submissions query), to still use the new `clearedIds`/`attemptedIds`
derivation, and to no longer contain the old `best?.is_correct === true` /
`best !== undefined` reads, with `drawing-reading` itself asserted first as
the positive control for the same shape. This is what "find the equivalents on
the other two knowledge modes" asks for without re-running the same shared
pattern's database proof four times.

**A test-infrastructure gap found and fixed along the way.**
`tests/db/postgrest-shim.ts` (shared test infra, not excluded by this
session's file ownership) had no `.single()` -- only `.maybeSingle()` -- so
driving these loaders (which all call `.select('full_name, role').eq('id',
claims.sub).single()` for the profile row) threw immediately. Added `.single()`
as an alias, renaming the private `single` boolean field to `singleRow` to
avoid the method/field name collision. It also had no support for PostgREST's
json-arrow column projection (`prompt->>material`, `prompt->demo`), which the
speedrun loader's own `challenges` select uses (0153); `projection()`'s
column branch now recognizes `col->>key`/`col->key` and flattens the result
onto the key's own name, matching PostgREST's real behaviour, which the
loader's own doc comment already describes. Both are narrow, additive
capability gaps in a shared harness rather than a change to any behaviour
under test.

**Verification.**

- `svelte-check`: 0 errors, 37 warnings (baseline), both before starting and
  after all changes, with the 31/5/1 `state_referenced_locally` /
  `css_unused_selector` / `perf_avoid_nested_class` mix unchanged.
- `npm test`: full suite, before this bundle's changes were the only thing
  outstanding on the branch (verified via `origin/integration` at the same
  tip) and after: **180 files, 3811 tests, 0 failures**, run duration ~146s.
  `tests/gauntlet-leaderboard-history.test.ts` (17 tests, all passing) is
  counted in that total.
- `tests/gauntlet-leaderboard-history.test.ts` run standalone:
  `--no-file-parallelism`, 17/17 passing, ~1.6s.

**What was NOT verified.** The live Supabase project (this repo's `.env` is a
placeholder project per `CLAUDE.md`); a real signed-in browser session against
these four routes (`npm run verify:browser` covers `/dev` routes only, and
these loaders require a real session, which was exercised instead through the
embedded-Postgres harness and the PostgREST shim -- a real client behaviour,
not a mock, per the harness's own stated purpose). No screenshot was taken;
these are server loaders with no new UI, so nothing in `+page.svelte` changed
and there is nothing new to look at.

**What was explicitly left alone, per the task's scope.** What the board
SHOWS -- who ranks, in what order -- is completely unchanged; every touched
loader's `gauntlet_leaderboard` query is byte-identical to before. No
migration, no `tools/`, no `docs/GAUNTLET.md`, and no file under
`src/lib/gauntlet/` was touched.

Branch pushed: `claude/gauntlet-leaderboard-history-s8l2tj`. Not merged to
`main`, per policy.
