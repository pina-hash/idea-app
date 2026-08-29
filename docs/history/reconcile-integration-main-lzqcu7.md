---
title: "Rebuilding `integration` after a bundle was built twice (`claude/reconcile-integration-main-lzqcu7`)"
date: 2026-08-29
branches: [claude/reconcile-integration-main-lzqcu7, integration]
migrations: []
subsystems: ["GAUNTLET", "Curriculum, migrations, policy", "Testing"]
---

## Rebuilding `integration` after a bundle was built twice (`claude/reconcile-integration-main-lzqcu7`)

**`main` and `integration` had diverged and could not auto-merge.** The cause
was a duplicate: the same GAUNTLET bundle was built independently, twice, as
two different `claude/**` branches --
`claude/gauntlet-modeling-modes-reveal-75aeej` and
`claude/gauntlet-modeling-modes-reveal-pftzc2`. The first merged to `main`
through PR #49; the second was swept onto `integration` by the automatic
`claude/**` -> `integration` workflow. Both wrote
`supabase/migrations/0146_gauntlet_reveal_all_modeling_modes.sql` with
materially different SQL, and both edited `src/lib/gauntlet/authoring.ts` and
`tests/gauntlet-authoring-tolerance.test.ts`.

**`main`'s `0146` is the authoritative one** -- it is the version applied on
production, confirmed by reading the live `gauntlet_leaderboard` definition
before this session started. `integration`'s copy of the same three files was
dropped entirely rather than reconciled.

### What was kept

`integration`'s tip (`2ade597`) carried three bundles beyond the duplicate,
none of which touch `0146`, `authoring.ts`, or
`tests/gauntlet-authoring-tolerance.test.ts`:

- `813658f` -- Prove a running app survives full screen, and drive the
  feedback contact field instead of grepping for it.
- `f2662d0` -- Register `/dev/frc` and `/dev/classroom-deck` for overflow
  regression, write down three testing traps, fix false comments in
  `file-drop.ts`.
- `f3f9b22` -- GAUNTLET: stop returning the target a ranked submit is checked
  against. (Carries `supabase/migrations/0147_gauntlet_close_target_disclosure.sql`
  with it -- this is the disclosure work from the OTHER, non-duplicate
  GAUNTLET session, and rides beside the dropped duplicate rather than being
  part of it.)

`integration` was rebuilt from `origin/main` (`2d445d9`) with exactly these
three commits cherry-picked on top, in that order. All three applied with no
conflict. The result was force-pushed to `origin/integration`
(`--force-with-lease`, confirmed with the user first, since this replaces
history rather than fast-forwarding it -- the commits being replaced are the
confirmed duplicate).

**Verified byte-identical to `main` after the rebuild:**
`supabase/migrations/0146_gauntlet_reveal_all_modeling_modes.sql`,
`src/lib/gauntlet/authoring.ts`, `tests/gauntlet-authoring-tolerance.test.ts`
(md5 matched on all three). `supabase/migrations/0147_gauntlet_close_target_disclosure.sql`
is present, so dropping the duplicate did not drop the disclosure work riding
beside it.

New `integration` tip: `7aed56e`.

### A real coupling the merge surfaced, not a git conflict

`npm test` on the rebuilt branch reports **2 failures**, both in
`tests/gauntlet-authoring-tolerance.test.ts`:

```
No c_volume_tol_pct constant found in 0147_gauntlet_close_target_disclosure.sql
```

This is not a cherry-pick conflict -- all three commits applied cleanly -- but
it is the kind of cross-branch incompatibility the task brief asked to be
reported rather than silently patched. The test (shipped on `main`,
independent of either duplicate) finds the NEWEST migration that defines
`gauntlet_macro_submit` and regex-parses a literal
`c_volume_tol_pct constant numeric := 0.1;` out of it, asserting
`GAUNTLET_DEFAULT_TOLERANCE_PCT` still matches. Before this rebuild, on `main`
alone, that newest definition was `0061` (which does carry the literal). After
carrying `0147` over from `integration` -- built independently, on top of the
now-discarded duplicate `0146`, with no knowledge of the test file `main` had
meanwhile grown -- `0147` becomes the newest definition of
`gauntlet_macro_submit`, and it deliberately factors the constant out into a
shared helper, `public._gauntlet_tol_pct(jsonb)`, rather than declaring it as
a `constant numeric` inline. The value itself is unchanged (still `0.1`,
confirmed by reading the helper body), so this is not a grading regression --
it is the regex-based test instrument losing sight of a constant that moved.

**Not fixed in this session.** The brief's instruction was to stop and report
a conflict rather than resolve it unilaterally, and altering
`tests/gauntlet-authoring-tolerance.test.ts` or `authoring.ts` was outside
what dropping the duplicate authorized. The fix is straightforward whenever
someone picks it up: teach `parseToleranceConstant` (or
`serverDefaultTolerance`) to also recognise `_gauntlet_tol_pct`'s
`coalesce(nullif(p_answer ->> 'tolerance_pct', '')::numeric, 0.1)` shape, or
to follow the call from `gauntlet_macro_submit` into the helper it now reads
the constant from.

### Verification

- `npx svelte-check`: **0 errors, 37 warnings** -- matches the documented
  baseline exactly.
- `npm test`: **3472 passed, 2 failed** (the coupling above), 160/161 files
  green.
- `npm run verify:browser`: 44 route/width runs, 328 measurements, 3 outside
  threshold -- two on `/dev/pathway-chip`-style harness controls (tap-target)
  and one on `/dev/notebook` @1440px (`free-entry title + folder fields`
  present 1 of an expected 2). None of these three findings touch any file
  the three carried commits changed; they read as pre-existing and are
  reported as measured rather than chased down, since they are outside this
  session's scope.

### Not verified

- Whether the `verify:browser` findings above are also present on `main`
  alone (not re-run against a bare `main` checkout to confirm).
- No live Supabase project, Drive round trip, or signed-in session was
  exercised -- `.env` was set to placeholder values for the local checks
  only.
