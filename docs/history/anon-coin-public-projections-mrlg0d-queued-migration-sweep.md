---
title: "Every test chain swept against the six unapplied migrations: four suites were describing a world the queue makes false, four short chains are deliberate, and 0151 turns out to revert 0148 (`claude/anon-coin-public-projections-mrlg0d`, no migration)"
date: 2026-08-29
branches: [claude/anon-coin-public-projections-mrlg0d]
migrations: []
subsystems: ["Testing", "GAUNTLET", "Coin economy"]
---

**THE FILENAME IS SUFFIXED, FOR THE SECOND TIME ON THIS SLUG.** The convention
is `docs/history/<branch slug>.md` and it is collision-free because the harness
mints one branch per session; it has now minted the same name three times.
`anon-coin-public-projections-mrlg0d.md` and
`anon-coin-public-projections-mrlg0d-0157.md` are both shipped records, and
CLAUDE.md's harder rule is that an entry is written once and left alone. Hence
the suffix, chosen to name the work rather than to count.

Sixth in the line from `docs/history/postgrest-shim-set-returning-57e7a3.md`.
The bundle before this one shipped `0157` and, in doing so, found the shape of
the problem this one sweeps for: **a test builds its own chain, the chain stops
short, and the test is green, true of its chain, and describing a world that
will not exist once somebody pastes the queued SQL.**

**No migration and no `src/` change.** Five existing test files edited; nothing
under `supabase/migrations/`, `tools/`, `tests/db/`, `CLAUDE.md` or
`docs/HISTORY.md` was written at any point, mutation proof included.

### A correction to the premise: the unapplied set is 0151-0155 and 0157

The brief said "`0152` through `0157`". Derived rather than assumed, from
`comm` between `origin/main` and `origin/integration`: the files on
`integration` and not on `main` are **`0151`, `0152`, `0153`, `0154`, `0155`
and `0157`**. `0156` does not exist on `integration` at all -- it is held by a
session running concurrently with this one -- and `0151_gauntlet_meter_practice.sql`
is the sixth, which the stated range omits. **`0151` turned out to be the most
consequential of the six**, so starting from the given range would have missed
the finding below entirely.

### How the sweep was done

104 test files build or use a chain. Filtering by grep alone would have been a
guess, so the filter is STRUCTURAL: `0151`-`0155` cannot apply to a chain
without `0004` (the gauntlet tables) and `0157` cannot apply to one without
`0089` (the coin public read layer). That leaves **28 candidates**; the other 76
are silent by construction rather than by inspection, and the check found four
files (`classroom-song-queue`, `classroom-song-queue-race`, `coin-bulk-students`,
`coin-legacy-reimport`) that an object-name grep had missed.

Each of the 28 was then RUN with its missing queued migrations inserted, and
every failure was BISECTED to the migration that caused it.

- **Insertion is in NUMERIC ORDER, not appended.** The first driver appended at
  the end, which puts `0152` after `0155` on the chains that already carry
  `0155` -- and which silently changed what `CHAIN.slice(0, -1)` means in
  `gauntlet-run-review-route`, producing a "failure" that was entirely the
  instrument's.
- **Every cause is a QUEUED migration.** `0147`, `0148` and `0150` were added
  where a chain needed them to reach a queued file, and not one of them broke
  anything -- so nothing here is a test that has ALREADY been wrong in
  production.

## THE FINDING THAT IS NOT A TEST PROBLEM: 0151 REVERTS 0148

`0148` rewrote `gauntlet_submit`'s knowledge branch to score on a
SERVER-STAMPED clock, closing an exploit where a browser claiming
`p_elapsed_ms: 0` took rank one on every knowledge board.

`0151` redefines `gauntlet_submit` again, and its own header says so in words:
*"gauntlet_submit, byte-identical to 0147 apart from ONE inserted block ...
everything in the knowledge branch is 0147's text unchanged, diffed against the
source rather than reconstructed."* It was diffed against **`0147`**, which
predates `0148` entirely.

Measured on the function bodies rather than argued:

| file | `gauntlet_submit` body | refs to `gauntlet_knowledge_starts` / `started_at` / `client_elapsed_ms` |
| --- | --- | --- |
| 0147 | 119 lines | -- |
| 0148 | 158 lines | 6 |
| **0151** | **150 lines** | **0** |

**Applying `0151` to a database that has `0148` silently reverts the knowledge
clock and reopens the exploit.** `tests/gauntlet-knowledge-clock.test.ts`
detects it in six assertions, and they stay green today only because that
file's chain stops at `0148` and never applies `0151`. Bisected: adding `0150`
alone leaves all 22 green; adding `0151` reddens exactly those six.

**Those six are LEFT ENTIRELY ALONE, and that is the decision rather than an
omission.** The test is right and the migration is wrong; moving the assertions
would be writing the regression down as intended behaviour, which is precisely
the failure mode this whole sweep exists to catch. `0151` is queued for a hand
paste and needs an owner before anyone runs it. This bundle cannot fix it --
`supabase/migrations/` is out of scope, and correcting an unapplied file is a
decision about `gauntlet_submit`'s current definition that belongs with whoever
owns the GAUNTLET lane.

## Category 1 -- the assertion was about the old behaviour and moved (4 files)

### `coin-public-ledger.test.ts` (0157) -- 1 assertion

Chain gains `0157`. **Before:** `expect(text).toContain('orphan.only')`, with a
comment reading "The orphan is named by the local part alone, with the domain
gone." **After:** `expect(text).not.toContain('orphan.only')` and
`expect(text).toContain('Student')`.

The old line was true of its chain and false of the rule the same test enforces
two lines above it -- 0089's headline is "NO PUBLIC RESPONSE EVER CONTAINS AN
EMAIL ADDRESS, UNDER ANY PARAMETER", and the student domain is one fixed string,
so a local part on a public page reconstructs the address. **The replacement is
STRONGER rather than merely different**: it pins the absence of the local part
AND the presence of the generic word, so a revert of `0157` reddens here and not
only in `0157`'s own suite. A positive control was added beside it -- the orphan
really is in the ledger, and exactly one leaderboard row reads `Student` -- so
the word being asserted is this student's name and not a string that happened to
be in the payload.

### `gauntlet-modeling-reveal.test.ts` (0154) -- 1 assertion, plus new coverage

`0154` ranks a macro run only when `(value->>'elapsed_ms')::numeric >= 30000`,
and a run with no such key fails CLOSED. This file seeded clocks of `12_500` and
`30_000`, so under `0154` the first run stops ranking.

**What changed is the FIXTURE, not the claim.** The seeds are now
`CLOCK_FLOOR_MS + 15_000` and `+ 30_000`; the rank order is still carried by
`score_metric` (12.5 before 30.0), so `Speedrun still ranks, both players, in
score order` is character for character what it was. A fixture that stopped
being something the producer can emit is not an assertion that changed its mind.

**THE RESTORED CONTROL IS THE POINT OF THE CHANGE, SO IT IS NOW UN-EMPTIABLE.**
That assertion guards four exclusion assertions below it, and a bare
`expect(await boardRows(mode)).toEqual([])` passes just as well against a view
that matches NOTHING -- which is exactly the state `0154` put this fixture into.
So the control moved INSIDE the exclusion: each exclusion now asserts
`boardRows('speedrun')` has length 2 in the same test, before asserting its own
mode is absent. An emptied board can no longer satisfy an emptiness claim.
Proven, not asserted: reverting the fixture reddens **four** tests including
both exclusions, where before the repair it would have reddened one and left the
exclusions passing vacuously.

A new `THE FLOOR BITES` test was added beside it: a run one millisecond under
the floor holds no seat, with a positive control that the same run one
millisecond over DOES rank and takes rank one. Without it, raising the seeded
clocks would leave the file with no statement anywhere of why the number is
30 000, and a later session could lower it back with nothing reddening.

### `gauntlet-mode-ranked-parity.test.ts` (0154) -- 1 assertion, plus new coverage

Same root cause in its sharper form: this file seeded `value` as `'{}'::jsonb`,
so `elapsed_ms` was not merely low, it was ABSENT, and `0154` fails a missing key
closed. `seedPassingRun` now writes a real clock, which is what
`gauntlet_macro_submit` does on every run it records.

**A parity check is the shape most vulnerable to an emptied view**, because
"the catalog says unranked and the view returns nothing" is satisfied by a view
that returns nothing for everything. A `CONTROL` test was added ahead of the
parity cases asserting every mode the catalog marks ranked really does hold a
seat, so "the view matches nothing" is now a distinct, loud failure rather than
a partial one. A `THE FLOOR BITES` test was added for the same reason as above.

### `gauntlet-authoring-tolerance.test.ts` (0151) -- 4 assertions

`0151`'s minimum interval refuses a second Speedrun practice check on the same
(student, challenge) inside two seconds. The band probe submits twice on one
level by design -- a pass and a fail against the SAME band is what makes it an
instrument -- so all four instrument controls stopped discriminating.

`stepPastPracticeMeter` back-dates that caller's last practice row on that level
and is called between the two submits. **Only the clock moves**: the same
student, the same level, the same two masses, the same RPC, and every assertion
byte for byte what it was. The helper says in its own comment that this file is
not testing the meter and that `gauntlet-practice-meter.test.ts` is where the
interval is asserted -- which is left alone.

## Category 2 -- deliberately about the short chain, left alone (4 files)

- **`gauntlet-knowledge-clock.test.ts`** -- `CHAIN_0147` / `CHAIN_0148`. Its
  pre-0148 chain is the positive control proving the exploit existed. Untouched,
  md5-verified, for the reason in the section above.
- **`gauntlet-target-disclosure.test.ts`** (`CHAIN_0061` / `CHAIN_0147` /
  `CHAIN_PRE_0153`) and **`gauntlet-published-answer.test.ts`**
  (`CHAIN_BEFORE`) -- both hand-apply their subject migration over a
  deliberately pre-migration chain, which is CLAUDE.md's own standard for
  testing a one-time strip over existing rows. Probed with only the AFTER side
  widened: 30/30 and 17/17 green, so the queued tail moves nothing in either.
- **`gauntlet-practice-meter.test.ts`** -- its one red was
  `the interval bites did not exist before 0151 -- the positive control on the
  whole file`, which is the driver widening a BEFORE chain. Instrument artefact.

**What makes these deliberate rather than accidental** is that each names its
own before/after pair in code and states the reason in a comment; the short
chain is the subject, not a stopping point somebody forgot to move.

### `gauntlet-run-review-route.test.ts` -- deliberate, and hardened

Its `CHAIN_BEFORE` models a deployment between the push and the apply, so the
route says "0152 is not applied" rather than showing an empty all-clear. That
stays. What changed is how it is derived.

**Before:** `const CHAIN_BEFORE = CHAIN.slice(0, -1)`. **After:** the slice is
cut at `CHAIN.indexOf('0152_gauntlet_run_review.sql')`, with a throw if the name
is not on `CHAIN` (an `indexOf` of -1 would make the slice an EMPTY chain, which
fails in a way that reads as a harness problem rather than a renamed migration).

`slice(0, -1)` means "without 0152" only while 0152 is last. Appending anything
silently turns it into "without whatever is last now", leaving 0152 applied and
the degrade test asserting the opposite of its own name -- **which is not
hypothetical: adding the queued tail is exactly what broke it during this sweep,
and the failure read as a behavioural change rather than as a chain that had
stopped meaning what it said.**

**The cut is a truncation and not a filter, on purpose.** `0154` refuses to
apply without `0152` by its own guard ("this floor is pinned to its threshold
and is not meant to stand alone"), so a deployment that has not applied `0152`
has not applied `0153`-`0155` either. Filtering `0152` out of the middle would
build a database no operator can have.

## Category 3 -- silent on the difference (20 of the 28, and 76 by construction)

Green with the queued tail added, test counts unchanged: `coin-medium` (39),
`coin-public-adjustments` (12), `coin-public-anon-projection` (23),
`coin-public-medium` (11), `coin-bulk-students` (20), `coin-legacy-reimport`
(25), `classroom-song-queue` (36), `classroom-song-queue-race` (5),
`gauntlet-leaderboard-history` (17), `gauntlet-leaderboard-correctness` (25),
`gauntlet-class-stat-floor` (14), `gauntlet-run-review` (32),
`gauntlet-author-tier-routes` (13), `gauntlet-landing-authoring-gate` (5),
`grant-surface` (15).

`coin-admin-list-gates` cannot take `0157` at all -- no `0089`, no `0077` -- and
its quiz-option fixtures already satisfy `0157`'s new element CHECK, so both
halves of that migration are inert for it. `gauntlet-author-tier`,
`coin-public-board-anon-projection` and `coin-public-surface-hardening` already
carry everything relevant.

## Mutation proof: seven mutants, every one reddening

Each takes the EDITED file and reverts exactly one thing, into a `zz-proof-*`
copy under `tests/` that is deleted afterwards. **`git checkout --` was used
nowhere**; `gauntlet-knowledge-clock.test.ts` is md5-identical
(`13c74bfb0415885da292f7227f304329`) to the copy taken before any edit.

| mutant | reddened |
| --- | --- |
| `coin-public-ledger`: chain reverted to pre-0157 | 1 -- the changed assertion, on the chain it no longer describes |
| `modeling-reveal`: fixture back to the under-floor clocks, 0154 on chain | **4** -- the control AND both exclusions AND the floor test |
| `modeling-reveal`: 0154 removed from the chain | 1 -- `THE FLOOR BITES` |
| `mode-ranked-parity`: fixture back to a missing `elapsed_ms`, 0154 on chain | 2 -- the new CONTROL and the speedrun parity case |
| `mode-ranked-parity`: 0154 removed from the chain | 1 -- `THE FLOOR BITES` |
| `run-review-route`: `CHAIN_BEFORE` back to `slice(0, -1)` with the tail on CHAIN | 1 -- the degrade test |
| `authoring-tolerance`: the meter step-past removed, 0151 on chain | 4 -- all four instrument controls |

**NOTHING WAS WEAKENED TO PASS ON BOTH CHAINS, and the last two rows are the
evidence rather than the claim.** Every new assertion was put to a chain WITHOUT
its subject migration and reddened there: the floor tests fail on a pre-0154
chain, because a below-floor run really does rank without `0154`. An assertion
that survived both chains would be asserting nothing about the thing that
changed.

**The second row is the one worth reading twice.** Before the hardening, an
emptied board reddened one test and left `feature_golf does not reach the board`
passing against a view that matched nothing at all. After it, the same revert
reddens the exclusions too. That is the guard the brief asked for, measured.

### One flaw found in this bundle's own instrument

The first `mode-ranked-parity` mutant reverted the value expression but left the
bound parameter, producing a broken statement rather than a working query that
seeds the old shape -- it reported `<<SUITE DID NOT RUN>>`, which is a failure
to boot and not a proof of anything. Re-run with both halves reverted, it
reddens 2. **A mutant that cannot execute proves nothing and looks exactly like
one that does**, which is the same lesson the previous bundle recorded about a
mutant needing a `drop function` first.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`). No `.svelte` or `src/`
  file is touched.
  - **`svelte-kit sync` was run immediately after checkout, before any
    baseline**, per the previous bundle's finding that the stale-route-types
    trap fires on a base change and not only on a fresh clone. No phantom this
    time.
- **Full suite: 200 files / 4217 tests before, 200 / 4220 after.** Both
  all-passing, and **every moved number is accounted for**: `modeling-reveal`
  18 -> 19 (+1, the floor test), `mode-ranked-parity` 7 -> 9 (+2, the control
  and the floor test), `coin-public-ledger` 19 -> 19, `run-review-route`
  11 -> 11, `authoring-tolerance` 18 -> 18. 4217 + 3 = 4220. No file count
  moved, because no file was added or removed.
- **Every cause was BISECTED**, one migration at a time, rather than attributed
  to the set that was added.

### Not verified

- **The live project.** No migration was written and none was applied. Every
  claim is against the embedded fixture with the real migration files applied.
- **`0151`'s revert of `0148` in production.** It is read off the two function
  bodies and reproduced in the fixture; nobody has applied `0151` to a database
  carrying `0148` outside a test harness, and nobody should until it is fixed.
- **The 76 files excluded structurally** were not each executed with a queued
  migration appended. The argument is that the migrations cannot apply to a
  chain lacking `0004` or `0089`, which is a property of the files rather than
  a measurement of each suite.
- **No browser pass.** Nothing here renders.

### Migration files created

None.
