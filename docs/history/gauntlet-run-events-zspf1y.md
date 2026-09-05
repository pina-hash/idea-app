---
title: "GAUNTLET run-event telemetry gains three bounds (window, rows-per-run, bytes-per-call) without touching the `anon` grant it depends on, and the volume tolerance gets a four-copy sweep that reaches the VBA and the C# add-in (`claude/gauntlet-run-events-zspf1y`, migration 0184)"
date: 2026-09-05
branches: [claude/gauntlet-run-events-zspf1y]
migrations: ["0184"]
subsystems: ["GAUNTLET", "Database", "Testing"]
---

Prompt 0060 swept `docs/GAUNTLET.md` against the code and reported two defects
it did not own: `gauntlet_run_events_insert` is granted to `anon` with nothing
bounding what it writes, and `GAUNTLET_VOLUME_TOL_PCT` has copies that drift
silently. Both were audited before anything was built, and on both the audit
moved the target.

## What the audit found that the brief did not say

**The `anon` grant is not the exposure, and cross-person forgery was never
possible.** `gauntlet_run_events_insert` resolves the owner from the run TOKEN
and never reads an identity from the client, exactly as 0035's own header
claims. Measured in the harness as `anon` with no claims: posting Ana's code
with Ben's `run_id` inserted **0 rows**, and every one of the 5,102 rows written
under Ana's code came back attributed to Ana. Guessing somebody else's code is
8 characters from a 31-character alphabet.

**What was actually unbounded was cost and time.** Measured against the deployed
function, all as `anon`:

| Probe | Result before 0184 |
| --- | --- |
| 100 sequential calls | 100 rows, 0 refused |
| One call carrying 5,000 events | 5,000 rows |
| One row carrying a 2 MB jsonb payload | accepted |
| Token expired 30 days ago, `used_at` and `locked_at` set | **still accepted** |

The last line is the one nobody had written down. `gauntlet_macro_start` on that
same token refuses with "This code is no longer active"; the telemetry insert
checked neither `expires_at` nor anything else, so a code stayed a live write
credential to its own run **forever**.

**Two of the three class medians rest on this data.** `gauntlet_class_run_stats`
(0150) shows a student peer medians for elapsed time, feature count and dwell.
Elapsed comes from `gauntlet_speedrun_attempts` and is unaffected; features come
from `gauntlet_run_analysis` and dwell from `gauntlet_run_events`, both written
through the same anon+code path. Each collapses to **one sample per student**
(`group by user_id`) behind a peer-count floor, so one forger moves a median by
one sample and not more. That bound is worth stating precisely rather than
dramatising: it is why this bundle did not treat class stats as an emergency.

## Why the fix bounds cost and leaves forgery alone

Self-forgery is not closable by any credential, because the forger legitimately
holds the credential. 0152 already reasoned this through on four measured
grounds and chose a report over a gate; re-deciding it here, with less evidence,
would have been the wrong move. Requiring a session was refused outright — 0035,
0016 and 0137 all record that the add-in and both VBA macros have no session to
have — and a server-minted token buys nothing, since the code already is one.

So the bundle split the problem: **the cost and window half was never decided by
anyone, is closable with no effect on any legitimate path, and is closed.**

## 0184, and the trap inside it

Three bounds, all inside the existing function, signature unchanged (so no
signature trap, no deploy ordering, no client change):

1. **Window.** Refuse once `now() > expires_at`. Measured: the token's whole
   life is 1800s, and both `gauntlet_macro_start` and `gauntlet_macro_submit`
   already refuse past that instant, so nothing legitimate is lost.
2. **Rows per run** (`_gauntlet_run_event_cap`, 20000). The pane ticks at 1000ms
   and emits at most one snapshot per tick, so a 30-minute window cannot reach
   1,800 snapshots.
3. **Bytes per call** (`_gauntlet_event_bytes_cap`, 262144). A real flush is 12
   buffered events of a few hundred bytes, and a failed post loses its batch
   rather than growing it.

**THE TRAP, and it is measured rather than reasoned: the window bound keys on
`expires_at` ALONE and must never also key on `used_at` or `locked_at`.** A
correct solo submit sets `locked_at` (measured: after a correct submit,
used=false, locked=true, expired=false) and the add-in's guaranteed final flush,
the one carrying `run_end`, posts immediately after that submit returns. A bound
that also refused a locked token would silently drop the closing event of every
correct run — on the happy path, with the add-in swallowing the failure by
design. A fix written without measuring that would look obviously right.

It still **never raises**: 0035's fail-safe contract is that telemetry cannot
affect a run's outcome, so every refusal returns 0 or a short count. A cap that
raised would make the thing built to be harmless able to break a submit. An
oversized call is **clipped to the room left, not refused whole**, so a flush
arriving at the boundary still records what fits.

## The tolerance: the brief's count was stale in both directions

The brief says four copies in `0034`, `0036`, `0061` and `authoring.ts`, plus
VBA "outside this repo". Measured, that is wrong three ways:

- **The SQL side has been single-source since 0147.** `_gauntlet_tol_pct(answer)`
  is the one definition and every live grading function reads it. 0034 (0.5),
  0036 (0.1) and 0061 (0.1) are an immutable record of a superseded state and
  decide nothing today.
- **The VBA is in this repository** (`static/tools/idea-gauntlet-submit.bas`).
- **There is a copy nobody counted**: the C# COM add-in,
  `tools/solidworks-addin/IdeaGauntletAddin/GauntletMath.cs`.

So the live set is four: the server helper, the authoring seed, the VBA and the
add-in. **All four state 0.1 today.** The authoring-seed link was already pinned
behaviourally by `tests/gauntlet-authoring-tolerance.test.ts`; the VBA and the
add-in were guarded by nothing.

`tests/gauntlet-volume-tolerance.test.ts` reads all four from disk and names the
file, the label and the value on any disagreement. An expected source it cannot
read is a **failure naming that copy**, never a silent skip — a check that
quietly guarded two of four would be worse than none, because its green tick
would be read as covering them. It also asserts the property the single-source
claim rests on: every live grading function reads the shared helper and declares
no local constant, so a migration reintroducing the 0036 drift reddens here
rather than in a term of grades.

Writing that assertion found something: listing `gauntlet_run_targets` as a
grader reddened, correctly — 0147 removed the tolerance from it entirely when it
closed the disclosure. The assertion was **generalized rather than deleted**: it
now pins that the function states no band at all, in either spelling.

## What was measured

- **A2 exposure**, all four probes above, plus the contrast that `macro_start`
  refuses the same expired token.
- **A paired pre/post-migration measurement.** The same three abuses put to the
  deployed function on a chain stopping one file short: all three succeed there
  (5,000 rows, the 2 MB row, the 30-day-expired token) and all three refuse with
  0184 applied. Without this, a bound that had always been present would pass
  every other assertion identically.
- **Mutation controls, each opening one clause in the permissive direction**: the
  run cap (a second call floods once room is restored), the byte cap (the
  identical 2 MB document lands), and the window (the expired token writes again
  once moved back inside its window).
- **The legitimate path control.** Reveal → start → anon flushes → submit → anon
  FINAL flush is driven end to end through `asAnon`, and is control-proved by
  tightening each cap until that same drive stops landing rows.
- **Four on-disk tolerance controls.** The VBA, the C# and the authoring copies
  each drifted in turn, and the sweep named the right file and value each time;
  a fourth control moved a file away and the sweep failed with the
  "now guards only 3" sentence. All three files restored from `cp` copies and
  verified **md5-identical**.
- `svelte-check`: **0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`) — baseline unchanged.
- Full suite: 5,676 tests, 3 failures, all diagnosed below.

## What is NOT verified

- **Nothing was applied to the live Supabase project.** The local `.env` is a
  placeholder; 0184 is applied by hand.
- **No browser pass.** This bundle changed no rendered surface.
- **The add-in and the VBA macros were not executed.** Their emission profile
  (1000ms tick, one snapshot per tick, flush at 12 buffered events, buffer
  cleared before posting) was read from their source, not run in SolidWorks. The
  caps are sized off that reading with an order of magnitude of headroom.
- **The `anon` key was not exercised over real HTTP.** `asAnon` is the role and
  the grants, which is the boundary under test, but not PostgREST itself.

## Inherited, found, not mine

`tests/derived-numbers.test.ts` fails two assertions on `integration` today,
because three `themes*` route specs landed after the last browser-verify
measurement. Confirmed pre-existing: with 0184 moved aside, the same two
assertions fail on the untouched base. Fixing it needs a browser run in a file
outside this bundle's ownership.

`tests/db/migration-0177-tombstone.test.ts` reddened on a contiguity hole at
[182, 183] — not a defect, but `integration` sitting three commits behind `main`,
which carries both. `origin/main` was merged into the branch (never the reverse)
and the hole closed.

## Stale claim to report rather than edit

`docs/GAUNTLET.md` is owned by prompt 0060 and was not touched. If it repeats the
brief's framing — four tolerance copies in 0034/0036/0061/`authoring.ts` with the
VBA outside the repo — that is now wrong on all three counts, per the measurement
above, and 0060's check should catch it.

## Cold apply

One migration, applied by hand in the Supabase SQL editor:

    supabase/migrations/0184_gauntlet_run_event_bounds.sql

It is `create or replace` on an unchanged signature plus two new private
helpers, so it is re-appliable and there is no deploy ordering: the add-in and
both VBA macros work against it before and after. Its own self-check reads the
catalog back and refuses rather than leaving a half-bounded function standing.

**What undoes it:** re-apply 0035 section 4's body verbatim, then
`drop function if exists public._gauntlet_run_event_cap();` and
`drop function if exists public._gauntlet_event_bytes_cap();`.
