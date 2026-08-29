---
title: "The Speedrun practice check gets a floor and a detector, and neither of them closes the hole (0151)"
date: 2026-08-29
branches: [claude/gauntlet-practice-rate-limit-xm7ye3]
migrations: ["0151"]
subsystems: ["GAUNTLET", "Testing"]
---

## The Speedrun practice check gets a floor and a detector, and neither of them closes the hole (0151)

`supabase/migrations/0151_gauntlet_meter_practice.sql` puts a **two second
minimum interval, per student per challenge**, on `gauntlet_submit`'s Speedrun
practice branch, and adds `gauntlet_practice_pressure()` so an admin can ask
"did anyone hammer this" without writing a query. **It does not prevent forgery.
It makes forgery slow and visible.** That sentence is in the migration header in
those words, because the risk this bundle carries is not a bug, it is somebody
reading it later as the hole being closed.

**0151 HAS NOT BEEN APPLIED.** Nothing in this repo can reach the live project;
every number below is the embedded-Postgres fixture with the real migration
files applied unmodified.

### What the previous bundle settled, and what it left

`docs/history/speedrun-deviation-band-measure-hoqxzz.md` is the specification
for this one, and its two NEGATIVE results did more work than its positive one:

- **A reveal budget does not bind this path at all.** The search runs through
  the practice branch, which needs no reveal: 298 probes, zero reveals. `0151`
  was reserved for that budget and is deliberately not it.
- **Removing `deviation_band` does not stop the search.** With the band assumed
  deleted and only `is_correct` read, 163 probes / 243 ms. Any free, unlimited
  pass/fail test is a search over a continuum whatever coaching sits beside it.

Neither was rebuilt.

### Why a rate and not a count, and why that is not a preference

An honest student is already granted **3 failed attempts per run token**
(`0061`), reveals free and unlimited, so an honest second run is worth six
attempts against an attack whose floor is twelve. The populations overlap on
count and any budget low enough to bite the attack sits below what a student on
their fourth try at a hard part legitimately spends. They do not overlap
anywhere near each other on **rate**.

### The interval, and the loop it was picked from

Two seconds. The assumption is stated in the header so it can be argued with
rather than reverse-engineered from the number: the practice loop is read the
drawing, model the part, read Mass Properties, type, submit, and that is
MINUTES. The only sub-minute honest events are corrections of the typed number
with no return to CAD, and the fastest of those requires READING THE RESULT
BANNER FIRST, which puts it above two seconds. A double click does not, which
puts it below. The floor is placed in that gap and at the BOTTOM of it,
because the cost of setting it too high is an honest student meeting a refusal
inside the free practice loop, and that is the one outcome this file must not
produce.

`tests/gauntlet-practice-meter.test.ts` pins that as a RANGE (1000-3000 ms)
rather than as the literal, so both edges of the argument are assertions rather
than prose.

### What was measured here

Driving the real RPC on the real chain, with and without the file:

| | probes | wall clock | per probe |
|---|---|---|---|
| **unmetered** (deployed today) | 224 | **358 ms** | 1.6 ms |
| **metered**, caller retrying as fast as allowed | 15 accepted (1042 refused) | 28.2 s | **1880 ms** |

Median accepted gap **2016 ms**. That is a **~1180x slowdown**, and it projects
the same 224-probe search to about **seven minutes** of unbroken metronome
traffic. The unmetered run recovered the target to a relative error of 2.5e-4,
comfortably inside the 0.1% pass band, so it really was the whole attack and not
a partial one.

**A 12-probe search against a strong prior is still only about 24 seconds and is
NOT meaningfully bounded by this.** Recorded rather than glossed. What that case
is instead, is loud, which is the other half.

**And the floor bounds ROWS, not REQUESTS.** Those 1042 refusals were 1042 real
calls. Each is a lock acquire, one indexed lookup and a raise, so it is cheap,
but this file is not a defence against request volume and does not claim to be.

### The detector is the half worth more

`gauntlet_practice_pressure(p_since_hours, p_min_checks, p_limit)`, admin only.
Run against the metered attack above with nobody writing a query, it returned
one row:

    player "Attacker", checks 15, fastest_gap_ms 2000, median_gap_ms 2014,
    at_floor_gaps 14, longest_burst 15, passes 0

- **`longest_burst` IS THE HEADLINE, NOT `checks`.** The hardest-working student
  in the class has high `checks` and a `longest_burst` of 0, because their gaps
  are minutes and irregular. Ranking on count would put that student at the top
  of the list, which is how a detector teaches an admin to ignore it. The test
  seeds exactly that student (45 checks, irregular, minutes apart) beside the
  machine and asserts both rows.
- **METERING IS WHAT MADE THE DETECTOR LEGIBLE**, which is the argument for
  shipping the two together rather than either alone. Before the floor a search
  was 250 rows inside one second and its gaps were noise. After it, the same
  search is 250 rows at a metronome cadence. The floor did not only slow the
  attack down, it gave it a shape.
- **The volume filter has an `or` in it.** `p_min_checks` alone would hide the
  SHORT search, which is the realistic one: twelve probes against a student who
  has nearly modelled the part is under any sensible volume floor. Anything with
  a burst of three or more is listed whatever its count. Three, because two
  consecutive checks at the floor is a double click and this file's whole
  premise is that double clicks are the common case.
- **A refused call leaves no row, and that is not a gap.** The guard raises
  before the insert so the call rolls back whole. A caller being refused is a
  caller pinned AT the floor, and the accepted calls either side of the refusal
  are exactly what `longest_burst` counts. A second table recording refusals
  would buy a duplicate of a signal already in the rows, at the price of a write
  path whose rate a refused caller controls.
- **It projects no email.** `user_id` plus the student's chosen name. A non-admin
  gets an empty set rather than an error, so the function's existence does not
  disclose that there is a detection lane.

### The load-bearing decisions

- **THE DISCRIMINATOR IS STRUCTURAL, NOT A NEW FLAG.** `mode = 'speedrun' AND
  source = 'manual' AND room_id IS NULL` is reached by exactly one writer in the
  schema: every ranked modeling submit writes `source = 'macro'` (0016, 0061,
  0147), and `gauntlet_room_manual_submit` writes `'manual'` but refuses a token
  whose `room_id` is null. Nothing was added to mark practice rows, because a
  mark is a second statement of a fact that is already load-bearing. The test
  asserts it over `pg_proc.prosrc` rather than over the fixture's rows: a
  row-shaped version takes its expected value from whatever the test happened to
  seed, which is the one place an expected value must never come from. (The
  first draft did exactly that and broke the moment a later test seeded a macro
  row, which is how it was caught.)
- **IT RAISES RATHER THAN RETURNING `{ok:false}`, AND THE DEPLOYED CLIENT IS
  WHY.** `/gauntlet/speedrun/[id]` hands `rpcError.message` to its own warning
  line and renders it verbatim, whereas a refusal OBJECT would go to
  `{ result: data }` and into the result banner, where a missing `is_correct`
  reads as FALSE. A double-clicking student would be told their part is wrong. A
  wrong answer is a worse lie than an error. No `src/` file was touched.
- **NO DEPLOY ORDERING.** `gauntlet_submit` keeps its exact `(uuid, jsonb,
  integer)` signature, so no drop is needed and no overload can survive; the
  client sends the same three arguments and reads no new field. The migration and
  the app are independent events and either may go first.
- **THE GRANTS ARE RESTATED, NOT ASSUMED.** `create or replace` under this
  project's default privileges hands a function a fresh `anon` grant (the 0137
  rule), so 0147's narrowing on `gauntlet_submit` is written out again. Section 5
  reads `has_function_privilege` back from the catalog rather than trusting its
  own guard, and the test asserts the same six ACL facts independently.
- **THE INTERVAL IS WRITTEN DOWN ONCE**, `_gauntlet_practice_min_interval()`,
  because the guard refuses inside it and the detector counts bursts against it
  and they are the same rule about what one check is. Two literals is how an
  enforced floor and a measured floor stop being the same number, leaving a
  detector reporting nothing while the guard holds callers at a cadence it no
  longer recognises. The test asserts both function bodies name the helper.
- **THE ADVISORY LOCK IS NOT DEFENSIVE.** The double click is the loudest case
  here, and without serialization on the (student, challenge) pair two posts
  milliseconds apart both read an empty window and both insert, so the guard
  would miss precisely the caller its sentence is written for. There is no
  unique index to collide on instead: the window is `now()`, and an index
  predicate may not contain a volatile expression (0139's situation exactly).

### What is deliberately NOT built

- **The board decision.** `0146`'s allowlist was written so a person decides
  which modes rank, and dropping `speedrun` from it is still the only
  containment measured to work. Untouched: no view, no allowlist, no ranking.
- **A reveal budget, and a `deviation_band` removal.** Both disproved by the
  previous bundle; rebuilding either is named in the header as a thing not to do.
- **Any metering of the knowledge modes or the ranked paths.** The knowledge
  modes grade against a fixed key rather than a continuum, so repeating one is
  not a search, and `0148` already gave them a clock. `gauntlet_macro_submit` and
  `gauntlet_room_manual_submit` already hold a run token and `0061`'s budget.
- **A UI for the detector.** Nothing under `src/` was touched. It is a named
  function with sensible defaults, callable from the SQL editor or PostgREST.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived after
  `npx svelte-kit sync` with placeholder `PUBLIC_SUPABASE_*` exported, per the
  fresh-checkout rule. Identical before and after, and necessarily so: no file
  under `src/` was touched.
- **Full suite: 170 files / 3628 tests before, 171 files / 3660 tests after.**
  Both all-passing. The delta is exactly this bundle's one test file.
- **The migration re-applies.** A chain listing `0151` twice produces the same
  three functions and no error; asserted in the suite rather than eyeballed.

### The mutation proof

Required here because most of what this file guarantees fails silently: a floor
that has become zero looks exactly like a floor that is working, since the
honest path is meant to sail through it either way.

**Twelve mutants, all in the PERMISSIVE direction, every one of them reddened.**
The file was restored from an IN-MEMORY COPY taken before the first mutation and
md5-checked after each one (`a9e1eca0084beed017a46302c126563b`, 28844 bytes,
verified identical at the end). `git checkout --` was not used anywhere: it
restores from HEAD, not from what a script saved, and would have silently
discarded the session's own uncommitted work.

| mutant | tests reddened |
|---|---|
| the whole interval check removed | 5 |
| the floor set to `0 seconds` | 5 |
| the comparison flipped so only OLD checks refuse | 4 |
| the advisory lock removed | 1 (x3 runs) |
| the lock keyed on the challenge alone | 1 (x3 runs) |
| the guard's read widened past the practice branch | 2 |
| the detector filtered on volume alone | 1 |
| the detector's admin gate opened | 2 |
| the detector's population widened past the practice branch | 1 |
| the detector ignoring its own window | 1 |
| the detector measuring bursts against its own literal, not the helper | 4 |
| the detector projecting the email | 2 |

**THE LOCK MUTANT IS THE ONE WORTH READING, BECAUSE IT WAS SILENT TWICE AND THE
FIX WAS THE TEST, NOT THE CODE.** The obvious concurrency test is N simultaneous
checks asserting one is accepted. Two concurrent calls passed against a function
with the lock DELETED. So did EIGHT, four runs in a row, 31/31 green every time:
the role switch and claims round trip ahead of each `asUser` call stagger them
enough that they never overlap inside the guard. That is 0134's lesson exactly,
that a burst which happens not to overlap passes on the broken code too, and a
green burst test would have certified a function with no lock in it.

The overlap is therefore **manufactured rather than hoped for**: a separate
transaction takes the same advisory lock on the same key and holds it for 1.2 s,
and the measurement is how long the check then WAITS. With the lock in the
function it waits most of a second; with it removed the call returns in
milliseconds. It reddens 3/3, and it carries a positive control on the same
clock (an uncontended check on a different challenge, under 300 ms) so a slow
database cannot be mistaken for a held lock. A second test holds one student's
key and confirms a DIFFERENT student is not stalled by it, which is what says
the key is the pair.

### Specific proofs the prompt asked for

- **An honest cadence passes.** 40 consecutive checks at three times the floor,
  every one accepted, 40 rows recorded. Deliberately far faster than a real
  modelling loop: if anything count-shaped had been built instead of a rate,
  this is where it would surface.
- **The floor is bracketed from both sides**, 200 ms either way, against the
  server's own clock. The first draft of this test aged `created_at` by
  `FLOOR_MS - 1` and read one side of the floor as the other, because the round
  trip that did the ageing is itself elapsed time. It sets the age absolutely
  now, so the only slack in the assertion is the slack the assertion names.
- **The refusal names no database object.** A 25-term sweep over every table,
  column, function and role on the path plus the vocabulary a leak would arrive
  in, with a positive control proving the sweep can find something. A second
  sweep of 15 terms asserts it does not read as an accusation (`too many`,
  `rate limit`, `blocked`, `abuse`, `suspicious`, `cheat`, `exceeded`,
  `attempt`...), and a third asserts it says what to do next.
- **The practice loop is untouched elsewhere.** The knowledge modes take three
  back-to-back submits with no ageing, with a positive control on the SAME
  caller and the SAME function proving the floor is real and simply not on that
  branch. A ranked macro row and a room row each fail to hold the practice floor
  down, again with a positive control.

### Not verified

- **The live project.** `0151` has not been applied anywhere. Whether production
  challenges publish `prompt.target_mass` and `prompt.density` (in which case no
  search is needed at all, `0061`'s own recorded limitation) still could not be
  counted from here.
- **The honest student's real cadence.** There is no production access, so the
  two-second floor rests on the structural argument above and on the repository's
  own constants, not on a distribution measured from live data. The
  attacker-side numbers ARE measured. Stated this way round deliberately: the
  argument does not need the honest number to be precise, because the honest
  floor requires reading a result and the machine floor is 1.6 ms.
- **No browser pass, and none was possible.** Nothing renders differently and no
  `src/` file moved. What a refused student actually SEES was read out of the
  deployed route's source (`fail(500, {error})` to `submitError` to a `.warn`
  line) rather than driven in a browser, because that path needs a signed-in
  Bosco Tech session.
- **Request-volume load.** The 1042 refused calls were counted, not
  load-profiled.

### For whoever is next

- **The decision this bundle still hands back is `0146`'s board allowlist.**
  Unchanged from the previous entry. This file bought time and visibility; it did
  not buy a different answer.
- **If the floor ever has to move**, it moves in
  `_gauntlet_practice_min_interval()` and nowhere else, and the range assertion
  in `tests/gauntlet-practice-meter.test.ts` is the thing that will argue with
  you. Raising it past three seconds starts costing honest retypes and that is
  the trade to state out loud, not to make quietly.
- **`gauntlet_practice_pressure` has no UI and that is not an oversight**, only
  an unfinished half. A surface for it would live under `/admin` or the GAUNTLET
  authoring area and needs nothing new from the database.
