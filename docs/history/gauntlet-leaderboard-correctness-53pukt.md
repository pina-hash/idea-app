---
title: "Rank only what is checkable: correctness on the knowledge boards, a plausibility floor on the clock (`claude/gauntlet-leaderboard-correctness-53pukt`, migration 0154)"
date: 2026-08-29
branches: [claude/gauntlet-leaderboard-correctness-53pukt]
migrations: ["0154"]
subsystems: ["GAUNTLET", "Leaderboard", "Disclosure", "Testing"]
---


`supabase/migrations/0154_gauntlet_rank_what_is_checkable.sql` narrows
`gauntlet_leaderboard` twice, in one `create or replace view`: a knowledge row
ranks only when it is CORRECT, and a Speedrun run ranks only when its
server-stamped clock is at least 30 seconds. `tests/gauntlet-leaderboard-correctness.test.ts`
is the proof. Nothing under `src/` changed and no other migration was touched.

**0154 HAS NOT BEEN APPLIED.** The local `.env` is the placeholder project; this
session ran only against the embedded-Postgres harness.

### The two claims, verified rather than accepted, and one of them corrected

The session was handed an audit's two claims. Both were re-measured against a
real Postgres running the real chain through `0153` before anything was written.

**Claim 1, that a wrong answer ranks on every knowledge board: TRUE.** The
predicate `0146` left standing admits `drawing_reading`, `gdt_tolerance` and
`spot_the_error` on MODE ALONE, with no `is_correct` term, while the modeling
branch one line below requires `is_correct = true`. Measured: a single wrong
answer written through `gauntlet_submit` produced one board row, `is_correct
false`, `score_metric 4.00`, `rank 1`.

**But the second half of that claim was WRONG, and the entry says so rather
than inheriting it.** The audit said a wrong four-second answer OUTRANKS a
right twenty-second one. It does not. The rank window opens with
`best.is_correct desc nulls last` and the `distinct on` beneath it opens with
the same term, so every correct row sorts above every incorrect one and a
player who has answered both ways is represented by their correct row.
Measured: with both present the board came back `[rank 1 correct 20.00, rank 2
incorrect 4.00]`. The real defect is smaller and still worth fixing: a wrong
answer OCCUPIES A SEAT at all, and holds RANK ONE on every board where nobody
has yet answered correctly, which on a freshly published question is every
board. The migration header states it at that size, and the test file carries a
case named after the corrected claim so nobody re-derives the stronger one from
the fix.

The sharpest statement of the defect turned out to be an internal asymmetry
nobody had written down: **`gauntlet_room_board` (`0010`) has required
`is_correct = true` since the day it was written.** Two boards over one table
disagreeing about whether a wrong answer is a result.

**Claim 2, that a ranked run has no plausibility floor: TRUE, and measured.**
Reveal, `gauntlet_macro_start`, `gauntlet_macro_submit` with the target volume,
back to back with no modeling in between:

```
FORGED RUN elapsed_ms = 6 ... score_metric 0.01 ... rank 1
```

Six milliseconds, rank one on a published board. That is the floor of what the
shape allows over a local socket; a real client adds a network round trip for
each call, so the same forgery lands in the low hundreds of milliseconds on
school wifi. Either way it is under a second.

### Where the floor's number came from, which is the decision in this bundle

The number is **30 seconds, and it is `0152`'s number rather than a new one.**
`gauntlet_run_review.p_fast_finish_seconds` already defaults to 30, with the
argument written in `0152`'s own header: "An honest run would have to read the
revealed drawing, model the part and submit inside half a minute ... Expected
honest rate at 30s: essentially zero."

Reusing it buys a property a second, independently chosen number would have
destroyed: **the set of runs this file unranks is exactly the set `0152`
already puts in front of a teacher.** No run loses a board seat without also
appearing, by name and with its whole telemetry census beside it, on the review
console. A floor above 30 would unrank runs nobody is told about; a floor below
30 would leave reported runs ranked. Two spellings of "implausibly fast" is
also the duplicated-rule defect this codebase keeps paying for.

**The relationship is asserted, not hoped for.** A view cannot read a variable,
so the number exists as a literal in the view and as `c_floor_s` in the
migration's own check block, and the check block reads BOTH ties back out of
the catalog: `pg_get_viewdef` must contain the milliseconds figure, and
`pg_get_function_arguments(gauntlet_run_review)` must carry a
`p_fast_finish_seconds` default that is not SMALLER than the floor. A smaller
one RAISES, because that is the one drift that breaks the property; a larger
one is a loud NOTICE, because the property still holds and a deliberate later
change to `0152` must not be able to wedge a re-paste of `0154`.

**What an honest run costs, since the number has to answer to something.** The
three seeded Speedrun levels (`0005`) are the ABS Spacer (difficulty 1, 30 cm3,
2 features), the Aluminum Block (difficulty 2, 100 cm3, 3 features) and the
Steel Bracket (difficulty 3, 50 cm3, 6 features). The simplest is the ABS
Spacer, and doing it honestly means reading the reveal, switching to
SolidWorks, running the Start macro on a blank part, sketching, dimensioning,
extruding twice and running the submit macro. **And the seeds say something
stronger:** all three ship a drawing reading "DEMO PLACEHOLDER / No dimensioned
part yet". There are no dimensions on them, so on the levels published today an
honest passing run is not merely slow, it is impossible -- every passing run on
a demo level got its volume from somewhere other than the drawing.

**Is the floor theatre? No, and the gap is why.** A forged round trip is 6ms
measured and under a second with real network in it; the floor is 30 seconds.
That is between thirty and five thousand times the thing it refuses. Had the
two been within an order of magnitude the honest answer would have been to say
so and ship no floor. They are not, so it shipped.

### What the floor does NOT catch, stated at its real size

Two cases, both real, neither fixable here:

- a forger MODELS NOTHING AND WAITS -- call start, go to lunch, submit the
  known target at minute four;
- a forger MODELS THE PART FULLY AND ONLY THEN CALLS START -- the run happens
  before the clock exists.

The second is already named in those terms by
`docs/audits/2026-07-security-audit.md:606-609` ("That is not fixable in SQL"),
and it is right. So the honest statement is narrow: **the floor costs an
instant forgery the one thing it cannot fake, wall-clock patience, and costs a
patient one nothing.** What is removed is the zero-effort case -- the script
that starts and submits in the same breath, which is exactly what a recovered
target makes free (`0153`'s header, and the 12-probe / 163-probe search in
`speedrun-deviation-band-measure-hoqxzz`). The detector for both survivors is
and remains the `0152` console, which is precisely why the floor is pinned to
that console's threshold.

### It removes the RUN, not the PLAYER

The `distinct on (user_id, challenge_id)` picks one row per player per
challenge from the rows that PASS the WHERE, so a student holding both a
sub-floor run and an honest one keeps their seat with the honest one. A player
disappears only when every run of theirs on that challenge is refused. The
migration counts those two populations separately at apply time for exactly
that reason, and the test asserts it.

### What moves on screen, including the two regressions this bundle does not fix

`gauntlet_leaderboard` is read for more than the boards.

- **Not affected: every "cleared" count.** `/gauntlet/+page.server.ts`,
  `nextUncleared` and the knowledge list pages all filter `is_correct`
  themselves, so they were already ignoring the rows section 1 removes.
- **REGRESSION, knowledge lists.** The per-mode list pages derive
  `attempted: best !== undefined` from the presence of a board row. A student
  whose only answers were wrong currently reads "attempted"; after this they
  read as never having tried. The time and rank beside it were meaningless for
  a wrong answer and are better gone, but "attempted" was true. The fix is a
  client read of `submissions` for attempted-ness, which is a change under
  `src/` and was out of this session's scope.
- **REGRESSION, Speedrun list.** `/gauntlet/speedrun/+page.server.ts` derives
  `cleared: best !== undefined` the same way, so a student whose only pass was
  sub-floor loses the cleared tick. This is the cost of `0146`'s
  remove-the-row shape, followed here deliberately -- a nulled-rank shape
  beside it would be a second spelling of "does not rank".
- **The published Speedrun record** (`gauntlet_leaderboards()`, `0024`/`0038`)
  reads this view at `rank = 1`. A record held by a sub-floor run is replaced
  by the fastest run above the floor, or becomes "no record yet".
- **The review console still shows the run.** `gauntlet_run_review` selects
  from `submissions`; only its `board_rank` scalar reads the view and goes
  null. Asserted in the test.
- **Passing, recording and the deviation band do not move at all.**
  `gauntlet_macro_submit` is untouched.

### Deliberately not done

- **No `source` term on the knowledge branch.** It would narrow nothing:
  `gauntlet_room_manual_submit` (`0010`) takes the mode from the CHALLENGE and
  gates on nothing, so a knowledge challenge hosted in a room writes a
  knowledge-mode row with `source = 'manual'` -- the same source
  `gauntlet_submit` writes -- always `is_correct false` (it grades typed mass
  against `answer.target_mass`, which a knowledge level does not carry).
  `source` cannot tell those apart; `is_correct` closes both.
- **`gauntlet_room_board` gets no floor.** It already requires correctness, so
  section 1 has no counterpart there, but an instant forgery still ranks on a
  live room board clocked from the shared `reveal_at`. A room round is minutes
  long and a floor there interacts with a host's own timing; that is a
  different decision.
- **A student whose run is refused by the floor is told nothing.** The
  unranked-mode messaging (`gauntlet-leaderboard-unranked-messaging-4cup6n`) is
  per MODE, and `speedrun` is still ranked, so no existing sentence covers a
  per-RUN refusal -- and saying "too fast to rank" hands a forger the
  threshold. Left for a bundle that owns the surface.

### How many rows this unranks

Production cannot be queried from here, so the migration counts it **at apply
time, against the real table, printing and writing nothing** (`0146`'s
posture). It reports: wrong knowledge seats removed and how many held rank one;
knowledge boards that had no correct answer at all and are now empty; correct
seats that remain (the positive control); ranked Speedrun seats under the floor
and how many held rank one; `(player, challenge)` pairs that leave the board
entirely; any macro row carrying no `elapsed_ms` key; the seats that remain and
**the fastest run left on the board**, which is the operator's answer to "what
was the fastest run currently on it"; and a count of survivors between 30 and
60 seconds, with the instruction that if it is not tiny the floor and `0152`'s
threshold are both too high and must be lowered TOGETHER.

Every one of those branches was fired against a known fixture and read back
through a notice listener. The numbers came out exactly right: 3 wrong seats
gone with 1 at rank one, 1 board emptied, 1 correct seat remaining, 2 Speedrun
seats under the floor with 1 at rank one, 1 pair leaving entirely, 1 keyless
macro row warned about, 2 seats remaining, fastest survivor 45.00 s, 1 survivor
in the 30-60 s band.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), before and after,
  re-derived after `npm ci`, a placeholder `.env` and `svelte-kit sync`.
- **`npm test` before: 175 files, 3743 tests, all passing.**
  **After: 176 files, 3768 tests, all passing.** The delta is exactly the one
  new file; nothing else moved.
- **Applied over seeded PRE-migration data**, per the migration standard: the
  chain is booted through `0153`, every row is written through the real
  pre-`0154` RPCs (`gauntlet_submit`, `gauntlet_speedrun_reveal`,
  `gauntlet_macro_start`, `gauntlet_macro_submit`), and only then is the file
  read off disk and applied over the top. Re-applying it is asserted to be a
  no-op.
- **Mutation-proved, permissively.** Dropping the correctness term brings the
  wrong answer back at its old seat and refills the emptied board; relaxing the
  floor to `>= 0` brings the forged run back ahead of the honest one; reverting
  both while leaving the self-checks in place makes the file REFUSE, which is
  what proves the behavioural checks are not passing vacuously. Two further
  mutants prove the `0152` tie bites: a 60 s floor against a 30 s report is
  refused with "would be unranked and never reported", and a block constant
  that disagrees with the view's literal is refused by the viewdef tie -- so
  neither check shadows the other. **Every mutant was built by string
  substitution on a copy of the file's text held in memory; the file on disk
  was never written to, so no restore step existed and `git checkout --` was
  never anywhere near this** (CLAUDE.md's three-sessions-in-one-week lesson).
- **Both directions asserted on every exclusion**, with counts: 1 board row
  present after against 2 before on the shared knowledge challenge, 0 rows on
  the wrong-only board against 1 before, 0 incorrect rows anywhere against a
  non-zero correct count, 5 `submissions` rows still present and untouched.

### NOT verified

- **The live Supabase project.** `0154` has not been applied anywhere. Every
  count above is from the embedded harness against a fixture this session
  seeded; the production figures are whatever the migration prints when
  somebody pastes it.
- **The browser.** No GAUNTLET surface was opened. The two `src/` regressions
  named above were read out of the loaders' source and reasoned about, not
  observed on screen.
- **`npm run verify:browser` was not run.** This bundle changes one SQL file
  and one test file and renders nothing.
