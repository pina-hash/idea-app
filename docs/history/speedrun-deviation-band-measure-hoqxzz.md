---
title: "Speedrun's target is recoverable, the board ranks the forgery, and a reveal budget would not have touched it (no migration)"
date: 2026-08-29
branches: [claude/speedrun-deviation-band-measure-hoqxzz]
migrations: []
subsystems: ["GAUNTLET", "Testing"]
---

**This bundle ships no migration.** `0151_gauntlet_bound_the_search.sql` was
reserved for a reveal budget and **was not written**, because the measurement it
was supposed to rest on disproved its premise: the search consumes no reveals,
and bounding the coaching does not bound the search. What follows is the
measurement, the two numbers the budget decision turns on, and the one
containment that is measured to work.

Everything below was run against a real embedded Postgres with the real
migration files applied unmodified, on the chain ending at **`0148`** (the
GAUNTLET chain plus `0146`, `0147`, `0148`). Nothing in this repo can reach the
live project.

### The question

`0148` measured that Reverse Engineer's target is recoverable by bisecting
`_gauntlet_deviation_band`'s constant edges (3.7e-12 relative error, 246 probes,
82 reveals) and flagged the same question for **Speedrun**, which `0146` KEPT on
the global leaderboard and which is the mode students actually compete in. It was
never measured. This session measured it.

### 1. It works on Speedrun, and it is worse than on Reverse Engineer

Reverse Engineer is excluded from `gauntlet_leaderboard` (`0146`), so the
forgery there buys a `score_metric` and no rank. Speedrun is on the board.

Driving the real `gauntlet_speedrun_reveal`, `gauntlet_macro_start` (blank part,
`p_volume_mm3 => 0`) and `gauntlet_macro_submit`, reading **only**
`deviation_band` and never `score_metric`, against a hidden
`target_volume_mm3` of `73412.8391`:

| | probes | reveals | relative error |
|---|---|---|---|
| macro path, naive scan from 1 mm3 | 279 | 93 | **2.0e-16** |

The forged submit, on a fresh reveal, submitting the recovered volume
immediately:

    {"is_correct": true, "deviation_band": "pass", "score_metric": 0,
     "rank": 1, "elapsed_ms": 1, "volume_ok": true}

and the board, against an honest 20-second run seeded beside it:

    [{"player":"Attacker","rank":"1","score_metric":"0.00"},
     {"player":"Honest",  "rank":"2","score_metric":"20.0"}]

**Rank 1 at 0.00 seconds, with no part modelled.** Speedrun's metric is a
server-stamped clock, which is what `0146`'s comment offers as the reason the
mode is rankable ("neither half is authorable"). The clock is honest; it is
timing a run that consists of one RPC call.

**One correction to a natural first attempt, recorded because it cost a run.**
The band is a **plateau, not a monotone function**: `far` on BOTH sides of the
target, with near/close/pass a narrow island in the middle. A doubling scan for
the initial bracket steps straight over the island (measured: it did, ending at
1.1e12 with a relative error of 1.6e7). The `near` window spans `[0.95T, 1.05T]`,
10% of T wide, so a multiplicative scan at ratio <= 1.05 cannot skip it.

### 2. The reveal is not the meter. The search needs zero reveals.

`gauntlet_submit`'s Speedrun practice branch takes a **typed mass** with a bare
challenge id: no reveal, no run token, no macro start, no clock, no attempt cost
and no rate limit. `0147`'s own header says so in those words. It returns the
same `deviation_band` from the same helper, and it is granted to `authenticated`.

Running the identical bisection through it:

| | probes | reveals |
|---|---|---|
| practice path | 298 | **0** |

then **one** reveal, one start, one submit -> `is_correct: true`, `rank: 1`.
The target mass converts to the ranked volume by dividing by the level density,
which is public framing by design.

So a reveal budget per student per challenge would have been a lock on a door the
attack does not use. It would have cost every honest Speedrun student their
practice loop -- repeating a challenge to improve a time IS the mode -- and moved
the attacker's cost by one reveal.

### 3. The band is not the vulnerability either. `is_correct` alone is enough.

This is the load-bearing measurement, and it is `0147`'s own lesson one level
deeper ("it removed the closed form and the search survived"). With
`deviation_band` assumed **deleted outright** and only `is_correct` read, a
geometric scan at ratio 1.001 (the pass band is +/-0.1%, so it cannot be stepped
over) finds the target:

| prior | probes | wall clock |
|---|---|---|
| within 20% | **163** | **243 ms** |
| within 2x | 694 | - |

163 probes at 1.5 ms each against a local database. A pass/fail test that is
free, unlimited and reachable straight through PostgREST is a search over a
continuum, whatever coaching is or is not returned beside it.

### 4. The two numbers, which is what the budget decision turns on

**What the bisection needs**, measured, as a function of how much the attacker
already knows about the scale of the part:

| prior | probes | of which scan | of which bisect |
|---|---|---|---|
| none (from 0.001 g) | 257 | 250 | 7 |
| within 100x | 102 | 95 | 7 |
| within 10x | 55 | 48 | 7 |
| within 2x | 22 | 15 | 7 |
| within 20% | **12** | 5 | **7** |

The scan is the whole cost and the bisect is a constant **7 probes**, which is
irreducible: `log2(0.20 / 0.001)` is 7.6 bits, and that is the entire distance
from a 20%-wide bracket to inside the 0.1% pass band. A student who has modelled
the part nearly right is inside 20% by accident, so the strong-prior row is the
realistic one.

**What an honest student is already granted**, from the repository rather than
from taste: `c_max_failed_attempts = 3` **per run token** (`0061`, reused by
`0147` for the room path), with reveals free and unlimited.

**So the honest allowance the repo already grants exceeds the attacker's floor.**
Three failures on the second run of a challenge is six; the attack needs twelve.
The two numbers are not merely close, they overlap: any budget low enough to bite
a 12-probe search sits below what a student on their fourth attempt at a hard
part legitimately spends. And a budget aimed at the band raises the cost from 12
to 163 -- a 13x improvement that leaves the whole search inside a quarter of a
second.

**A budget is therefore the wrong tool here, and this is the finding.** Not
because the numbers are within a factor of two, but because the meter is wrong
twice over: reveals are not consumed, and coaching is not required.

### 5. What protects Speedrun today, plainly: nothing

The property that protects Reverse Engineer is not a property of the mode at
all. It is `0146`'s **board exclusion** -- the forgery still succeeds, it just
has nowhere to land. Speedrun has no equivalent, and the three properties that
might have supplied one do not:

- **The server-stamped clock** times the forged run honestly at 1 ms.
- **The run token's 3-failure cap** is per token, and reveals are free.
- **The macro path's blank-part guard** (`p_volume_mm3 > 0` raises) is a
  client-attested value; the attack passes `0` and it is satisfied.

### 6. What would work, in order of size, none of it built here

- **(a) The `0146` containment: drop `speedrun` from `gauntlet_leaderboard`'s
  allowlist.** This is the only option measured to work, and it works by removing
  the VALUE of the forgery rather than by bounding a search that cannot be
  bounded. One line in one view, the same line `0146` already wrote for the other
  two modes, and it leaves `gauntlet_room_board` untouched -- so a Speedrun raced
  in a supervised room still ranks inside that room, which is the human-witness
  case `0147` names. The cost is real and is the whole decision: the mode stops
  ranking globally. **`0146`'s allowlist was written so that exactly this
  decision is made by a person** ("a macro mode added later must be admitted by
  somebody who has decided its metric is checkable"), which is why this session
  did not make it.
- **(b) Bound the free pass/fail test.** It has to be both paths at once, or the
  attacker moves between them; past the budget the student must be denied the
  CORRECTNESS ANSWER, not the coaching, or the search proceeds at full speed; and
  a student denied the correctness answer cannot tell whether their ranked run
  counted. That is the practice loop, removed.
- **(c) Make the ranked path require something the search cannot produce.** Does
  not exist. The server never sees geometry -- the same wall `0146` documents for
  Feature Golf's feature count.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived after
  `npx svelte-kit sync` with placeholder `PUBLIC_SUPABASE_*` exported, per the
  fresh-checkout rule. Unchanged, and necessarily so: no file under `src/` was
  touched.
- **Full suite: 169 files / 3618 tests passing before, and the same after.** The
  branch adds one documentation file and nothing else, so the two runs are of the
  same tree.
- **No mutation proof, and the reason is that there is nothing to mutate.** A
  mutation proof establishes that an assertion bites when a guard is opened; this
  bundle adds no guard and no assertion. The measurement's own controls are
  positive rather than negative: every recovered figure is checked against the
  seeded target, and every forged submit is checked for `is_correct`, `rank` and
  a board row rather than for the absence of one.
- **The hidden target was `73412.8391`** -- deliberately not round and not the
  `80000` every existing GAUNTLET fixture seeds -- so a recovered figure could not
  have come from anywhere but the search.

### Not verified

- **Nothing was applied anywhere, and `0151` does not exist.** No file was
  created at `supabase/migrations/0151_gauntlet_bound_the_search.sql`; the number
  is still free.
- **The live project.** Every number here is the embedded-Postgres fixture.
  Whether production challenges publish `prompt.target_mass` (in which case no
  search is needed at all -- `0061`'s own recorded limitation, unchanged by
  `0147`) could not be counted from here.
- **No browser pass.** Nothing renders differently; no `src/` file moved.
- **The honest student's real reveal and failure counts.** They are not
  measurable from this repo -- there is no production access -- so section 4's
  honest-side number is the repository's own constant (`c_max_failed_attempts`,
  3 per run) and the structural observation that Speedrun's loop is repetition,
  not a figure from live data. The attacker-side numbers ARE measured. Stated
  this way round deliberately: the argument does not need the honest number to be
  precise, because the attacker's floor already sits below the allowance the repo
  grants today.

### The reproducer, so it is not re-derived

Scratch harness, run and deleted rather than committed: a test asserting that the
attack works is a ratchet that goes red the day somebody fixes it. It is a single
vitest file on the chain
`0001, 0004-0010, 0015-0018, 0020-0024, 0026-0030, 0033-0036, 0038, 0060, 0061,
0067, 0137, 0146, 0147, 0148`, seeding one published `speedrun` challenge with
`answer = {target_volume_mm3: 73412.8391, tolerance_pct: 0.1, density: 2.7}`,
and:

1. `db.asUser(...)` calling
   `select public.gauntlet_submit($1::uuid, jsonb_build_object('mass', $2::text))`
   in a loop -- this alone is the whole search, and it needs nothing else;
2. scanning multiplicatively at ratio <= 1.05 (band-assisted) or <= 1.001
   (pass-only) until the band leaves `far` or `is_correct` turns true;
3. bisecting the far/near crossing, which sits at `0.95 * T`, so `T = edge / 0.95`;
4. one `gauntlet_speedrun_reveal` -> `gauntlet_macro_start(code, 0)` ->
   `gauntlet_macro_submit(code, recoveredVolume, runId)` and reading
   `gauntlet_leaderboard`.

### For whoever is next

- **The decision this bundle hands back is (a).** It is small, it is already the
  repo's chosen containment for the two sibling modes, and it is the only one
  measured to work. What it costs is the global Speedrun board.
- **`tests/gauntlet-target-disclosure.test.ts` stays green through all of this,
  and is not wrong.** It asks whether a SINGLE payload discloses the target, and
  no payload here does. What this measurement shows is that the property that
  test pins is not the property that matters: the target is recoverable ACROSS
  calls from answers that are individually clean. Anyone extending that file
  should know it is a per-payload detector by design and that widening it to
  cross-call search is a different instrument.
- **`0151` is unused.** The next migration in this repo takes it.
