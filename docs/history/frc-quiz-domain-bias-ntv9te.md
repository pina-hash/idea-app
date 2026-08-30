---
title: "The Foundation quiz becomes reachable, the answer key stops leaking through option length, and two client values the server was trusting are closed"
date: 2026-08-29
branches: [claude/frc-quiz-domain-bias-ntv9te]
migrations: []
subsystems: ["FRC", "Testing"]
---

Acts on `docs/history/frc-quiz-engine-tests-thvuag.md`, which measured all of
this and fixed none of it (that bundle owned test files only). No migration.
Three source files moved -- the endpoint, `quiz-service.ts`, `quiz-engine.ts` --
plus four new test files, one report generator, and one document.

**Every figure below was re-derived from the banks rather than quoted.** The
premise entry's numbers reproduce exactly: 95 of 140, 67.9%; MDM-10 57.1%, F5
40.0%, F2 and F4 13.3%.

### 1. The Foundation domain was dead, and the literal that killed it is gone

`quiz/+server.ts` opened with `params.domain !== 'cad-mechanical'` and resolved
the unit through `mdmUnitByNumber`. F1 through F5 all have banks, are all
authored `gate: quiz`, and `+page.server.ts` builds a live gate for any unit
with a bank -- so five units rendered a "Start quiz" button against an endpoint
that 404'd it and `FrcQuizGate` said "The quiz is not available right now."

**The fix is a derivation, not a second literal.** The route resolves
`params.domain` through `domainById` (the track registry) and `params.unit`
through THAT domain's own unit list, then serves the pair if and only if
`getQuizBank` has a bank for the resolved unit id. **There is no domain name
anywhere in the file.** A sixth domain added to the registry is served the
moment its units have banks, with no edit here, because the condition is "does
this unit have a bank" rather than "is this the domain somebody wrote down".

- **THE TRACK REGISTRY IS THE RIGHT SOURCE, NOT THE CONTENT SETS**, and the two
  were checked against each other rather than assumed equivalent. The page
  resolves through `CONTENT_SETS` (it needs the authored `MdmUnit` for the gate
  text and the prev/next chain); the endpoint needs only `unit.id`, which
  `track.ts` already carries for every domain. Measured: the banked set is
  exactly {F1-F5, MDM-1, 2, 3, 9, 10}, every one of which has authored content
  and carries `gate: quiz`, so the two resolutions agree on every unit that can
  reach a quiz. The route's own sweep asserts that agreement rather than
  restating it -- and `MDM-11` through `MDM-16`, which are in the registry with
  no content and no bank, 404 from both.
- **`CONTENT_SETS` could not have been shared anyway**: it lives in a
  `+page.server.ts`, and SvelteKit refuses any non-method export from one.

**The test that "goes green when it is fixed" does not, and that is worth
saying plainly.** The premise bundle's own sentence described it that way, but
the test as written PINS the 404 (`expect(r.status).toBe(404)`), so the fix
turns it red. It was a characterization test, and it was generalized rather
than deleted, per `CLAUDE.md`: it now sweeps EVERY domain in `FRC_DOMAINS` and
every unit in each, asserting `served === hasBank` per unit, with the served
set checked against `Object.keys(BANKS)` as its own positive control -- so it
bites on the original defect, and keeps biting for a domain nobody has written
yet. A second test that expected `'foundation'` to 404 was generalized the same
way.

### 2. The answer is recoverable from option length, and the lint says so without blessing it

Re-derived independently: across the ten banks the single longest option is the
correct one **95 of 140 times, 67.9%**, against 25% at chance. Exact
single-attempt pass probability for a student who knows nothing and always
picks the longest option: **MDM-10 57.1%, F5 40.0%, F2 and F4 13.3%**, against
0.024% at random.

**THE BANK CONTENT WAS NOT TOUCHED.** A machine lengthening distractors
produces plausible-looking nonsense inside a quiz that gates a student's
progress. `docs/frc/quiz-bank-bias-report.md` is the per-item rewrite list,
ordered by give-away (the answer's length as a multiple of the longest
distractor offered against it), for the person who wrote the questions. The
worst is F1 `qf1-07` at **4.69x** -- a 75-character answer against a
16-character best distractor.

#### The threshold question, and the argument for what was chosen

Three shapes were available and two are traps.

- **Pin today's 68%.** A ratchet: records what last happened, checks nothing,
  and worse, BLESSES the defect -- a number in a test file reads as a standard.
- **Assert the target, 25%.** Red on arrival on all ten banks, greenable only
  by rewriting 140 questions. `CLAUDE.md` is explicit, with the
  `spec-instructions-budget` history to prove it: a standing red hid every real
  regression behind it for days.
- **Fail on worsening.** Shipped, in **two tiers, because the banks are in two
  states and one assertion cannot serve both.**

**TIER A is absolute and zero-tolerance**, on the four dimensions measured
clean: uniform option count, no "all of the above", no near-duplicate-pair
leak, no article agreement. Each is at zero today, so the assertion is green on
arrival and bites the first time anyone writes one. Free teeth, no argument for
softening them.

**TIER B is a per-bank budget** on the dimension already bad, recorded at
today's EXACT measured value with no headroom. **Why it is not the ratchet it
resembles:** it is not "today plus a margin", it is today, so there is no slack
to drift into; and it is a MAXIMUM that may only ever be lowered, stated in the
file as the contract. Somebody raising a budget to get CI green must type a
larger number under a comment saying that raising it means the quiz got easier
to cheat. That is the strongest thing a lint can deliver against hand-edited
prose: it cannot make the regression impossible, so it makes it **loud and
attributable**. The budget stores `[longest, items]` as a PAIR rather than a
rate, so shrinking a bank cannot satisfy it. The target (25%) is recorded and
quoted in every failure message, so the standard is visible without failing.

#### Length is not the only tell, and one that looked real is not

Seven dimensions were measured. Two leak, one is a decoy, four are clean.

| Dimension | Fires on | Correct | Chance | Verdict |
|---|---|---|---|---|
| Longest option (characters) | 131 | 95 (72.5%) | 25% | **the dominant tell** |
| Most words | 108 | 88 (81.5%) | 25% | the same tell, second reading |
| Only option with no absolute | 9 | **9 (100%)** | 25% | **certain where it fires** |
| Correct option echoes the stem | 40 | 27 (67.5%) | 25% | no signal of its own |
| Near-duplicate pair holds the answer | 22 | 12 (54.5%) | 50% | noise |
| "All / none of the above" | 0 | - | - | clean |
| a/an agreement with the stem | 0 | - | - | clean |
| Option count | uniform 4 | - | - | clean |

- **THE ABSOLUTE-QUALIFIER TELL IS REAL AND NARROW.** On nine items three of
  the four options are written as absolutes ("Only the captain / Only mentors /
  Only drivers") and the answer is not, so it is identifiable without reading
  the question. It is right on all nine; 9 for 9 at 25% is p < 4e-6. All nine
  are listed in full in the report, because the fix is per item. It is
  **reported and count-capped rather than rate-budgeted** -- nine items in 140
  cannot move a corpus rate enough for a rate budget to notice.
- **THE STEM-ECHO TELL IS THE LENGTH TELL IN A SECOND COSTUME, and the naive
  reading of it is wrong in both directions.** A first pass here divided hits
  by all 140 items and reported 19.3%, "below chance" -- the wrong denominator,
  since a tie fires on nothing and is neither hit nor miss. Measured properly
  it fires on 40 and hits 27, **67.5% against 25%**, which reads as a second
  serious leak. It is not one: **26 of those 27 are items where the longest
  option was already the answer, and on the ten items where the two disagree,
  length is right 8 times and the echo once.** A longer option overlaps a stem
  more because it has more words in it. Reporting it separately would have sent
  somebody rewriting questions to fix a shadow. `independenceFrom` is the
  measurement, and the assertion is that on the DISAGREEMENTS the echo is not
  worth a guess -- see the mutation findings for why the obvious weaker form of
  that assertion was not enough.

### 3. Two client-supplied values closed, and the third answered

**The fail response followed the URL's unit rather than the attempt's.**
`submitQuiz` graded through the attempt row -- correctly -- but recomputed the
cooldown and named the missed topics under `params.unit`. Measured: fail MDM-9
through the MDM-1 URL after MDM-1's window has elapsed and the student is told
`cooldownRemainingSec: 0` on a unit they just failed, while a `start` on MDM-9
is still refused. `frc_quiz_grade` (0041) does not return the unit id and the
migration is not this bundle's to change, so `dbStore.gradeAttempt` reads
`unit_id` back off the attempt row (a column students hold a grant on) and
`submitQuiz` prefers it. **The store's `unitId` is optional**, which is what
made this additive: no other caller of `QuizStore` changed. The test now asserts
the reported figure and the enforced one are the same fact, within the round-trip
band, with a start on MDM-1 as the positive control that it is MDM-9's cooldown
and not a blanket refusal.

**A JSON `null` graded as option 0.** `Number(null)` is 0, so a question left
blank and a question answered with the first option reached the grader as the
same value. `normalizeAnswers` in `quiz-service.ts` is the one implementation
and `submitQuiz` RUNS it rather than trusting what it was handed, so no caller
can reintroduce a softer one; the endpoint now passes `body.answers` raw. Every
shape `Number()` would have turned into option 0 -- `null`, `undefined`,
`false`, `''`, whitespace, `[]`, an array hole -- maps to `NO_ANSWER` (-1),
which no sealed index can equal. A NUMERIC string still grades: `'0'` is a real
choice and refusing it would be a narrowing dressed as a fix.

**The third finding -- no integrality or range check -- needed one of the two,
and the reason is not exploitability.** *Range* needs nothing: an index outside
the option list matches no sealed value and is already wrong on both graders,
so a check would refuse nothing. *Integrality* does need closing, because it is
**the one input on which the canonical grader and its SQL mirror return
different verdicts**: Postgres rounds a numeric into `integer[]` (2.7 becomes
3) while the TypeScript grader compares 2.7 to an integer and calls it wrong.
That is precisely the silent mirror drift the premise bundle warns about, and
it is closed at the boundary so both answer "wrong" by construction. What was
added beyond that is a LENGTH bound, at `maxTestLength()` -- derived from the
banks, never a literal -- so an unbounded array cannot be pushed into an
`integer[]` bind. Grading is unaffected: both graders walk `sealed`, so entries
past the last question were never read.

**A bug in the fix, found by its own test.** The first `normalizeAnswers` used
`raw.slice().map()`, and `map` SKIPS a hole in a sparse array: `[0, , 2]` came
back as `[0, <hole>, 2]` -- an array typed `number[]` with an `undefined` in
it. It graded correctly by luck on both sides. It is `Array.from({length})`
now, because a function whose whole job is to make "not answered" representable
must not hand back the one value it exists to replace.

### Verification

- **25 mutants, all killed, restored from COPIES and never with
  `git checkout --`.** `md5sum -c` verified all four mutated modules
  byte-identical afterwards. Highlights: restoring the domain literal reddens
  the Foundation sweep; dropping the bank check reddens two; reverting
  `normalizeAnswers` to `Number()` reddens five; each of the three ways to make
  the fail response follow the URL again reddens the divergence test; emptying
  the corpus reddens eight, which is the vacuous-sweep control.
- **THE MUTATION HARNESS ITSELF WAS WRONG FIRST, AND THE TELL WAS THREE
  SURVIVORS IN A ROW.** A bad summary parse reported mutants 1-3 as SURVIVED
  when hand-running mutant 1 showed it plainly killed. `CLAUDE.md` names this
  shape ("a mutation suite that suddenly all passes"); an unmutated negative
  control was added to the harness and every result re-run.
- **TWO MUTANTS GENUINELY SURVIVED, and both were real weaknesses in the new
  assertions rather than in the code.** Removing the `a === b` guard from
  `independenceFrom` did not redden, because folding the agreements in inflates
  both sides equally and `tellRight < baselineRight` still held (27 against 34)
  -- the assertion is a RATE on the disagreements now. And hardcoding
  `optionCounts` to `[4]` satisfied a test asserting `[4]`, which cannot tell a
  measurement from a constant -- it has a synthetic mixed-count positive control
  now. Both re-run and killed.
- `svelte-check`: **0 errors, 37 warnings**, mix 31 / 5 / 1, before and after.
- Full suite before: **189 files, 4038 tests, all passing, 212.58s.** After:
  **191 files, 4078 tests, all passing, 199.59s** (+2 files, +40 tests: 32 for
  the bank lint, 7 for `normalizeAnswers`, and one added to the route suite).

### Not verified, and one gap left open deliberately

- The live Supabase project, a live PostgREST, a signed-in browser session, and
  any visual pass. The Foundation fix is proven at the endpoint against a real
  Postgres and the real chain; **it was not driven through a rendered
  `FrcQuizGate`**, so "the button now works" is inferred from the endpoint
  answering 200 rather than observed.
- **THE DEV HARNESS STILL HAS THE `Number(null)` DEFECT, and it is named here
  rather than fixed.** `src/routes/dev/frc-quiz/+server.ts` maps
  `body.answers.map((a) => Number(a))` before calling `submitQuiz`, so the
  nulls are destroyed one frame before the one implementation can see them.
  That file is outside this bundle's ownership and two other sessions were
  live, so the one-line fix (pass `body.answers` raw, exactly as the real route
  now does) is left to whoever owns it. It matters because `CLAUDE.md` requires
  a harness to mirror the mechanism it stands in for; until it is applied, the
  dev harness grades a blank answer as option 0 while production does not. The
  route 404s in production, so nothing student-facing is affected.
- The report is a dated snapshot. Regenerate with
  `node --experimental-strip-types tests/frc-quiz-bank-bias-report.mjs`; it
  measures nothing of its own, reading the same module the lint enforces, so
  the document and the test cannot disagree.
