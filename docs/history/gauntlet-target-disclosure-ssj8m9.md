---
title: "GAUNTLET: widen the target-disclosure suite to the SELECT surface, and correct two false cheat-detection claims"
date: 2026-08-29
branches: ["claude/gauntlet-target-disclosure-ssj8m9"]
migrations: []
subsystems: ["gauntlet"]
---

## GAUNTLET: widen the target-disclosure suite to the SELECT surface, and correct two false cheat-detection claims

### What this bundle is

`tests/gauntlet-target-disclosure.test.ts` (0147's own suite) asserts
non-disclosure over four RPC return payloads and is sound about exactly what
it measures. It never once ran a plain `select ... from public.challenges`.
That is precisely the surface that shipped the target for the whole of
0061's and 0147's life: `0004` grants `select (id, mode, title, difficulty,
asset_ref, prompt, author_id, published, created_at, updated_at) on
public.challenges to authenticated`, and `challenges.prompt` carried
`target_mass`, `density` and `tolerance_pct` on every published Speedrun row
until `0153` stripped them. Twenty-six RPC-level tests passed while that
column-level grant handed the answer to any signed-in student with no
reveal, no run token, no clock and no rate limit.

`0153` (already on this branch via `origin/integration`) is what actually
closes this at the data layer. `tests/gauntlet-published-answer.test.ts`
(a companion suite from the same bundle, not touched here) already proves
`0153`'s effect field-name by field-name (`toHaveProperty('target_mass')`
etc.). This session widens `tests/gauntlet-target-disclosure.test.ts` to
prove the SAME surface SHAPE-wise, reusing the numeric `reconstructions()`
detector 0147's own suite already built for the RPC payloads: any number in
the granted select that lands inside the pass band, directly, through the
public density, or as a ratio against a known-submitted value. A field-name
check would miss a renamed key or a unit-converted copy exactly the way
0061's own history shows happened once already (`target_volume_mm3` ->
`target_mass_level`); this doesn't.

### What was added

One new `describe` block, `the challenges SELECT surface`, in
`tests/gauntlet-target-disclosure.test.ts`:

- A chain ending one file short of `0153` (copied from
  `gauntlet-published-answer.test.ts`'s own `CHAIN_BEFORE`, which is the
  proven-correct dependency list for this migration).
- A published Speedrun row seeded with the pre-`0153` legacy `prompt` shape
  (the same three keys `seed()` already writes elsewhere in this file).
- A student reads it through the real column grant (`db.asUser`, the exact
  granted column list) both BEFORE and AFTER `0153` is applied by hand over
  the seeded row.
- POSITIVE CONTROL: before `0153`, `reconstructions()` fires on the plain
  select (mirrors the RPC positive controls already in this file).
- After `0153`: `reconstructions()` returns `[]`.
- A narrowing-not-blanking check: `material`, `mass_unit`, `unit_system`,
  `title` and `published` all survive.
- An explicit assertion that `0147` alone (already applied in the pre-`0153`
  chain) does NOT close this surface — the positive control still fires
  against a chain that has `0147` but not `0153`.

Ran alone: `npx vitest run --no-file-parallelism tests/gauntlet-target-disclosure.test.ts`
-> 30/30 passed (was 26; 4 new tests). Full suite run reported separately
below.

### The two false claims, corrected

**1. "A passing run with no modeling events is visibly fake."** This exact
sentence is NOT in `docs/GAUNTLET.md` and never has been (checked the full
`git log --all -p` for the file). It is in `0061`'s own header (an applied,
immutable migration — left untouched) and in
`docs/audits/2026-07-security-audit.md`. Neither of those is a file I own on
this branch, and the audit doc is outside the ownership list, so I did not
edit either. What I did instead: added a dated correction directly to
`docs/GAUNTLET.md` (in the "Residual trust" bullet under Speedrun, right
where a future session evaluating this exact proposal will be reading),
because that document is the one this task named as the thing that "invites
this proposal again," and it is the file I own. The correction states the
counter-evidence plainly: the three `.bas` macros never write a
`gauntlet_run_events` row (only the C# add-in's `TelemetryRecorder` does,
which `docs/GAUNTLET.md` already documents a few paragraphs above), so every
macro submit is a legitimate zero-event run; an add-in build from before the
telemetry recorder shipped is another; `gauntlet_room_manual_submit` never
touches either tool; and every knowledge mode has nothing to model. Zero
events is the ordinary case on at least four ranked/graded paths, not a
tell. It also states what telemetry CAN support: nothing authoritative —
`gauntlet_run_events` (`0035`) is anon-granted and client-posted with no
server attestation, so its presence corroborates nothing a forger could not
fabricate more cheaply than doing the real work.

**Correction lives in:** `docs/GAUNTLET.md`, the bullet immediately after
"Residual trust" under the "Speedrun" section (search
`CORRECTED 2026-08-29: telemetry is not a cheat detector`).

**2. 0146's own comment: Speedrun's client-sent volume "only has to hit a
hidden target."** Verified in `supabase/migrations/0146_gauntlet_reveal_all_modeling_modes.sql`,
inside the `gauntlet_leaderboard` view definition's comment. At the time
`0146` was written this was false: `challenges.prompt` carried the target
mass, density and tolerance on every published row, reachable by the same
ordinary `0004` `select` grant named above — no reveal, no search, nothing
hidden about it. `0146` is applied and immutable and was NOT edited.

**Correction lives in:** `docs/GAUNTLET.md`, in the "What happened after
`0027`" migration table — I extended the table with rows for `0146` through
`0153` (it previously stopped at `0067`) and added a dated correction
paragraph immediately below the table (search
`CORRECTED 2026-08-29: 0146's own comment overstates`).

### Item 3: does the same masking pattern (RPC checked, raw SELECT not) appear elsewhere?

Read-only investigation, no changes made. I could not exhaustively audit the
suite (111+ files reference disclosure/exclusion-shaped assertions) in the
time available, so this is a spot-check, not a sweep, and should be read as
such.

- **`tests/coin-public-ledger.test.ts` already does this correctly** and is
  worth naming as the pattern to imitate: alongside asserting that the
  public RPCs never emit an address in serialized form, it separately
  asserts `has_table_privilege('anon', 'public.<table>', 'select')` is false
  for every underlying table, and does the equivalent for `authenticated`
  against write verbs. It checks the RPC surface AND the grant surface as
  two separate things, which is exactly what `gauntlet-target-disclosure`
  was missing before this session.
- **`tests/gauntlet-framing-projection.test.ts`** is the client half of
  `0153` (the two Speedrun loaders' `select` strings) and is a source-level
  sweep, not a live-grant check; it doesn't claim to cover the database
  grant, so it isn't an instance of the pattern, just a different layer of
  the same fix.
- **`tests/notebook-security.test.ts`** and **`tests/notebook-tolerance-privacy.test.ts`**
  spot-checked and did not show the pattern — the latter is an import-sweep
  over which components reference a module, not a payload-shape assertion,
  so there's no second surface to miss.
- **Not checked in the time available:** the classroom instructor-materials
  suites, the foundry review-queue suites, and the coin bulk/role RPCs
  beyond the public ledger. Given how this bug actually shipped (a correct,
  narrow RPC fix that never looked at the table's own grant), the highest-
  value next check is any suite asserting non-disclosure over a SECURITY
  DEFINER RPC's return value for a table that ALSO has a client-facing
  `grant select` on it — `grep -rn "^grant select" supabase/migrations/*.sql`
  cross-referenced against which of those tables have a disclosure-shaped
  test would find the rest faster than reading test files one at a time.

### What was not touched

No migration, nothing under `src/`, nothing under `tools/`,
`docs/audits/2026-07-security-audit.md` (carries the same false telemetry
claim as `0061`'s header but is outside this session's file ownership and
was left alone), and `tests/gauntlet-published-answer.test.ts` (another
session's file, already correct for what it asserts).

### Verification

- `svelte-check`: 0 errors, 37 warnings (31/5/1 mix), matching baseline.
  Ran with a placeholder `.env` (not committed) after `svelte-kit sync`,
  per CLAUDE.md.
- `tests/gauntlet-target-disclosure.test.ts` alone: 30/30 passed (26 before
  this session, 4 added).
- Full suite (`npm test`): **178 test files, 3769 tests, all passed.**
- Not verified: the live Supabase project, a real signed-in session, and
  a browser pass -- this bundle is test/doc only, touches no `src/`, and
  changes no runtime behaviour.
