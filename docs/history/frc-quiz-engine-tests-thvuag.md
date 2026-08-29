---
title: "The FRC quiz gate gets its first test, and the answer key turns out to leak through the option text"
date: 2026-08-29
branches: [claude/frc-quiz-engine-tests-thvuag]
migrations: []
subsystems: ["Testing", "FRC"]
---

No migration, no `src/` file, no tool and no existing test moved. Three new
files: `tests/frc-quiz-disclosure.ts` (the detector), `tests/frc-quiz-engine.test.ts`
(48 tests, pure) and `tests/frc-quiz-route.test.ts` (28 tests, real Postgres,
real chain, real handler).

`src/lib/server/frc/quiz-engine.ts` and `quiz-service.ts` are 299 lines that
decide whether a student passes a knowledge gate, and had no test of any kind.
Neither did `/frc/[domain]/[unit]/quiz`. A defect there fails a student who
passed or passes one who failed, and neither announces itself.

### What the code actually does, since the audit's four claims were only mostly right

The audit named cooldown escalation, question shuffling, a sealed-item path and
the `frc_quiz_grade` recording. All four exist. What the audit did not say is
that they are spread over **five** layers, not two, and that one of them is a
hand-written SQL mirror of another:

- `pickAttempt` draws `testLength` items with Fisher-Yates over the item
  indices, then shuffles each item's options with a second Fisher-Yates, and
  splits the result into client-safe `{stem, options}` and a server-held
  `sealed[] = {c, o}` where `c` is the correct option's position **after** the
  shuffle. `rng` is injectable, which is what makes all of it testable.
- `gradeAttempt` is the CANONICAL grader -- and **nothing on the real path calls
  it.** The DB store grades through the `frc_quiz_grade` RPC, which is a SQL
  MIRROR of it (0040, recreated by 0041 to record the completion inline). The
  dev harness mock is the only caller of the TypeScript one. So the suite puts
  every grading edge to BOTH, separately.
- `cooldownState` walks the attempt log newest-first, counts consecutive fails
  since the last pass, and anchors on the newest fail; the schedule is injected
  from `track.ts` (`[60, 300, 900, 3600]`, then flat).
- `startQuiz` / `submitQuiz` orchestrate, behind a `QuizStore` interface.
- The endpoint resolves the unit from the URL, enforces the cooldown on `start`,
  and grades on `submit`.

There are TWO surfaces holding the key, not one: the endpoint's responses, and
`frc_quiz_attempts` itself, which 0040 grants a student column-level SELECT on.
`sealed` and `pass_percent` are withheld from that grant. **Measured, as the
`authenticated` role: `select sealed`, `select pass_percent` and `select *` are
each "permission denied for table"; `id, unit_id, status, score, started_at,
submitted_at` is allowed.** A suite that proved non-disclosure over the endpoint
alone would have been the exact shape this repo has shipped before.

### The four properties, and whether each holds

**THE KEY NEVER REACHES THE CLIENT: HOLDS in the code, and FAILS in the
content.** No response on any path -- start, cooldown refusal, 404, a failed
submit, a passed submit -- carries the correct index or a second copy of the
correct text. The detector asserts that on SHAPE rather than on field names,
reusing 0147's idea: it takes the payload plus ground truth resolved from the
BANK'S TEXT (never from `sealed`, or an engine that sealed the wrong index would
agree with its own detector) and asks whether the correct option is recoverable
by a duplicated string, a quoting non-option string, a positionally aligned
index vector, a per-question numeric field, or a collapsed shuffle.

**But the answer is recoverable from the option text, and no shuffle can fix
that, because length is invariant under permutation.** Measured over all ten
committed banks, 140 items: the single longest option is the correct one **95
times, 68%, against 25% chance.** Per bank, and computed exactly (hypergeometric
over the draw, against each bank's own `testLength` and 90% threshold):

| bank | draw | longest-is-answer | P(pass first try, longest-option only) | P(pass at random) |
|---|---|---|---|---|
| MDM-10 | 6 of 14 | 13/14 | **57.1%** | 0.024% |
| F5 | 6 of 10 | 9/10 | **40.0%** | 0.024% |
| F2, F4 | 6 of 10 | 8/10 | 13.3% | 0.024% |
| MDM-1 | 10 of 32 | 21/32 | 5.6% | 0.003% |
| MDM-2, 3, 9 | 6 of 14 | 8/14 | 0.9% | 0.024% |
| F1, F3 | 8 of 12, 6 of 10 | 7/12, 5/10 | 0.0% | 0.002%, 0.024% |

**A student who knows nothing, always picks the longest option and retakes
through the cooldown clears MDM-10 in about 1.75 attempts.** That is a defect in
the BANKS, not in this module, and it is **measured and reported here rather
than asserted**: pinning today's 68% would be a ratchet that records what last
happened and checks nothing, and asserting the target (25%) would ship a red
test nobody can green without rewriting 140 questions. The suite asserts only
that the heuristic is not a CERTAINTY. **The fix is to lengthen the distractors,
and it belongs to whoever owns the content.**

Separately: the banks' pre-shuffle answer indices are **70 / 67 / 3 / 0** across
the four positions -- authored answer-first. That never reaches a client, and it
is what makes the shuffle load-bearing rather than cosmetic, so it is pinned as
a precondition of the sweep below.

**SHUFFLING DOES NOT CHANGE THE VERDICT: HOLDS.** For every bank and 60 seeded
draws each, `sealed[i].c` is the position of `item.options[item.answer]` in the
served options -- the expected value coming from the bank's text, so the
off-by-one has nothing to agree with. An answer sheet built by TEXT always
scores 100 and always passes; one built to avoid the correct text always scores
0. And no fixed index is worth more than chance (measured 0.18 to 0.32 over
3,000+ served questions), which is the shuffle's whole job.

**GRADING IS CORRECT AT ITS EDGES: HOLDS, with two client-value caveats below.**
Every option correct, every option wrong, an unanswered item (short array and a
hole), an out-of-range index at either end, an extra answer past the last
question, a repeated submit, an empty key, and the pass boundary -- all put to
the TypeScript grader AND to the SQL mirror. There is no partial credit beyond
the rounded percentage: at 90%, six questions means all six (5/6 is 83), ten
means nine. `Math.round` and Postgres `round()` agree at 12.5, the only tie a
small item count reaches. A second submit of a finalized attempt is refused
(`no_attempt`, 409) rather than re-graded, so a fail cannot be overwritten by
pressing submit again -- verified against the row, which stays `failed`/0.

**COOLDOWN ESCALATION IS MONOTONIC AND BOUNDED: HOLDS.** Measured through the
real endpoint over six consecutive fails: 60, 300, 900, 3600, 3600, 3600, with a
`start` refused 429 throughout and allowed again one second past the window and
not one second before it. A pass clears the streak. It is per unit. The log is
never mutated, order of the input does not matter, the anchor is the newest
fail, and the remaining time is clamped at zero.

**A student cannot shorten it by any input they control.** `cooldownState` takes
three arguments, none of which a request body can reach: the attempts come from
the store, `nowMs` from `Date.now()` in the handler, the schedule from
`track.ts`. Eight bodies carrying `remainingSec: 0`, `failStreak: 0`, a `nowMs`
a day ahead, `passed: true`, another unit id and another user id were each sent
with `action: 'start'` during an active cooldown; all eight were refused 429 and
none created an attempt. Adding fails can only lengthen; a fail dated in the
future lengthens too.

### The question nobody had asked: does correctness depend on a client value the server does not re-derive?

**Three, and none of them opens the gate. All three are pinned as behaviour.**

1. **The URL's unit is never checked against the attempt's unit.** `submitQuiz`
   takes `unitId` from `params.unit` but grades through the attempt row, and
   0041 reads `unit_id` off that row for the completion write -- so an MDM-9
   attempt submitted through the MDM-1 URL is graded as MDM-9 and recorded as
   MDM-9. **The gate is safe.** What follows the URL is the FAIL response: the
   cooldown is recomputed over the URL unit's log and the missed topics are
   named from the URL unit's bank. Measured: fail MDM-9 through the MDM-1 URL
   after MDM-1's own window has elapsed, and the student is told
   `cooldownRemainingSec: 0` on a unit they just failed -- while a `start` on
   MDM-9 is still correctly refused with 60. A reporting defect, not a bypass.

2. **A JSON `null` in `answers` is graded as option 0.** The route coerces every
   entry with `Number()`, and `Number(null)` is 0, so the server cannot tell an
   unanswered question from a student who chose the first option. Not
   exploitable -- after the shuffle the correct index is uniform, so a blank
   sheet is worth chance -- but an all-null sheet scores 25 against a key
   containing a zero and 0 against one that does not, and both are pinned.
   `Number('nope')` is NaN, which JSON writes as `null` on the wire and SQL
   coalesces to -1, so a non-numeric answer is always wrong. A NUMERIC string
   (`'0'`) becomes a real choice and grades.

3. **Nothing validates that an answer is an integer in range.** The endpoint
   sends whatever `Number()` produced into an `integer[]` parameter. Measured in
   Postgres: every numeric path rounds (`2.7` becomes `3`), while the text path
   raises `invalid input syntax for type integer`. Which one a live request
   takes depends on PostgREST's cast, **which was NOT verified** -- there is no
   live PostgREST here. Under the canonical TypeScript grader `2.7` is simply
   not `3` and is pinned as wrong. Whichever way it lands, a client value
   reaches the comparison unchecked.

### A separate live defect found on the way: the whole Foundation domain has an unreachable quiz

The endpoint opens with `params.domain !== 'cad-mechanical'` and resolves the
unit through `mdmUnitByNumber`. But `getQuizBank` carries **F1 through F5**
(the module's own comment still says "F1", written when it did), every
Foundation unit in `foundation-content-seed.md` is authored `gate: quiz`, and
`+page.server.ts` builds a live `gate` for any unit with a bank, on either
content set. So all five Foundation units render "Start quiz" against an
endpoint that 404s them, and `FrcQuizGate` reports "The quiz is not available
right now." Both halves are asserted together in the route suite so the pair
cannot be half-fixed silently; that test is what goes green when it is fixed.
**Not fixed here** -- this bundle owns test files only.

### Two things about the fixtures worth knowing next time

**The PostgREST shim cannot carry a jsonb argument.** node-postgres serializes a
JS array as a Postgres ARRAY literal, so `p_sealed` arrives as text jsonb cannot
parse and every `frc_quiz_start` fails with `invalid input syntax for type
json`. PostgREST does not do that: it sends the body as JSON and lets Postgres
cast. `tests/frc-quiz-route.test.ts` restores that one behaviour in a local
wrapper (`jsonClient`) rather than editing `tests/db/postgrest-shim.ts`, which
another session was working in. **A gap worth closing in the shim itself.**

**The wire's JSON round trip is load-bearing in that wrapper, not decoration.**
JSON has no NaN, so `Number('nope')` becomes `null` on the way to the database.
Binding the JS value straight through instead made the shim raise on an
`integer[]` cast and produced a 503 the endpoint cannot actually return -- a
test measuring the fixture instead of the app. `jsonClient` puts the args
through `JSON.parse(JSON.stringify(...))` for exactly that reason.

**The reported cooldown is 61 for a 60 second step, and that is real.** The
handler reads `Date.now()` at the top and the database stamps `submitted_at`
with its own `now()` during the grade, so the reported remaining time is the
schedule value plus the round trip, rounded up by `Math.ceil`. The suite asserts
a band with the schedule value as the FLOOR: the gate may over-report, never
under-report.

### Verification

- **Every assertion is mutation-proven, and nothing under `src/` was ever
  written to.** Nine mutants of `quiz-engine.ts` were generated as COPIES under
  a scratch directory (seal off-by-one, shuffle removed, grade off-by-one, `>`
  for `>=`, oldest-fail anchor, pinned streak, topic precedence swapped, and two
  that leak the key into the payload -- one as a per-question index, one as a
  quoted hint). Each reddened its own shipped assertion; the UNMUTATED module
  passed all nine, so none was throwing vacuously. `md5sum` on the three shipped
  modules verified identical before and after.
- **Three database guarantees proven in a permissive world built by
  construction**, 0147-style, with no file edited: granting `select (sealed,
  pass_percent)` makes the second-surface refusal fire; granting insert plus an
  open policy on `frc_user_progress` makes the 0041 no-self-mark refusal fire;
  and a `create or replace` of `frc_quiz_grade` with `user_id = v_uid` removed
  lets one student grade and pass another student's attempt.
- `svelte-check`: **0 errors, 37 warnings**, mix 31 `state_referenced_locally` /
  5 `css_unused_selector` / 1 `perf_avoid_nested_class`, before and after.
- Full suite before: **183 files, 3864 tests, all passing, 195.82s.**
  After: **185 files, 3940 tests, all passing.**

### Not verified

The live Supabase project (nothing here can reach it), a live PostgREST (so
finding 3's cast is measured in Postgres but not end to end), a signed-in
browser session, and any visual pass -- this bundle adds no UI. The Foundation
404 is proven at the endpoint and from the bank/seed data; it was not driven
through a rendered `FrcQuizGate`.
