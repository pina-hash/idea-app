---
title: "The FRC quiz answer key really is recoverable from option length, the lint that says so already existed, and it reddened on the fix (`claude/frc-quiz-bias-10avj9`, no migration)"
date: 2026-09-05
branches: [claude/frc-quiz-bias-10avj9]
migrations: []
subsystems: ["FRC Training", "Testing"]
---

Prompt 0059. No migration, no database, no new dependency, and not one word of quiz
content changed. What changed is the instrument around the content: a measurement
that was remembered and is now re-taken, two strategies nobody had checked, the
number that decides whether this gets fixed this week, a report that did not exist,
and four repairs to a guard that turned out to punish the repair it exists to ask for.

Started from `origin/integration` at `fdf8c68`, which `origin/main` contains (main is
that commit plus the merge). Working directory `/home/user/idea-app`. `git` already
carried a committer identity, so no merge stalled on it.

## What was already there, which is most of it

The prompt's premise was that a lint might exist and might never have been seen to
fail. Both halves of the premise were worth checking and both came back interesting.

`tests/frc-quiz-bank-bias.ts` (the measurement), `tests/frc-quiz-bank-bias.test.ts`
(the lint) and `tests/frc-quiz-bank-bias-report.mjs` (a document generator) were all
committed, thorough, and green: 32 assertions covering seven heuristics, exact
hypergeometric pass arithmetic, per-bank budgets recorded at the measured value, and a
long header arguing correctly against pinning 68% as a standard and against asserting
25% as a permanently-red target. The audit's job was not to build that. It was to find
what it was missing, and the three things it was missing all mattered.

**`docs/frc/quiz-bank-bias-report.md` did not exist.** The lint's header names it, the
generator writes it, and the directory `docs/frc/` was not in the tree at all. The one
artifact the person who has to rewrite the questions would actually open had never been
generated, and nothing pointed at the generator: there was no npm script, so running it
meant knowing to type `node --experimental-strip-types tests/frc-quiz-bank-bias-report.mjs`.

**The measurement was one-sided.** Length, word count, absolutes, stem echo,
near-duplicates, "of the above" and article agreement were all measured. Nobody had
asked whether a DIFFERENT cheap strategy also passes, and if one did, lengthening
distractors would not have finished the job.

**Nothing said how big the fix is.** "68%, and MDM-10 falls 57% of the time" describes
the defect precisely and says nothing about whether closing it is an evening or a term.

## The measurement, re-taken rather than carried forward

140 items across 10 banks, every item offering exactly four options. The remembered
figure was right: the uniquely longest option is the answer **95 times, 67.9%**, against
25% at chance. Options ARE shuffled per attempt (`pickAttempt` permutes each item's
options and stores the correct index in the server-held `sealed` key), so position is
not a second leak -- but every heuristic here is invariant under permutation, which is
the whole reason shuffling buys nothing against it.

The two new strategies both come back negative, and that is worth having asserted
rather than assumed:

- **Shortest option**: right on 11 of 140, 7.9%, well UNDER chance, and on every single
  bank it reaches fewer correct answers than the pass threshold needs -- it cannot clear
  one unit at any number of retries. It is the length tell seen from the other end.
- **Most technical-sounding option** (a deliberately mechanical definition -- acronyms,
  digits, hyphenated compounds, words of nine characters or more, because a hand-curated
  jargon list would measure the list rather than the banks): fires on 58 items and is
  right on 35 of them, 60.3%, which reads alarming, and is exactly 25.0% of the corpus,
  which is chance. On the 19 items where it and the length tell disagree, length is right
  16 times and this is right once. It is the same shadow the stem echo already was, and
  the file already had the vocabulary for saying so.

So the finding is not bigger than length. That is the answer to the question the prompt
asked, and it is a load-bearing answer: it means lengthening distractors is a complete
fix and not a partial one.

## The number nobody had computed: how much is there to rewrite

There is **no attempt limit anywhere in the quiz path** -- only `FRC_QUIZ_COOLDOWNS_SEC`,
60/300/900/3600 seconds, escalating then holding at an hour. Attempts are independent (a
fresh shuffle of every item index; a failed attempt returns a score and the missed
OBJECTIVE tags, never which questions were wrong), so nothing accumulates between them
and memorising stems buys nothing -- which is why memorisation is NOT a third strategy
and is not reported as one. What that does mean is that a per-attempt probability
understates the problem: MDM-10 at 57.1% falls in **1.75 attempts and about 6 minutes of
waiting**; F5 in 2.5 attempts and 25 minutes. Everything below those is genuinely
defended by the 90% threshold, at 268 minutes for F2/F4 and days for the rest.

`fixesNeeded` answers two questions instead of one, because they differ by a factor of
four and reporting only the larger is how a fixable thing gets deferred as too big:

- **16 items** to put every bank under a 1% longest-only pass rate -- the point where
  retrying stops being a route through. They are concentrated: MDM-10 five, MDM-1 four,
  F5 three, F2 and F4 two each, and the other five banks need none.
- **64 items** to bring every bank to chance, which is the full job.

Neutralising is modelled as the tell missing that item -- what lengthening a distractor
past the answer does -- and never as deleting it, because a bank that shrinks is a bank
that got easier to pass.

## The guard existed, could fail, and failed on the wrong thing

Worsening one MDM-2 item (lengthening an answer that was not previously the longest)
reddened it: 5 of 32 assertions, naming MDM-2 and quoting 9/14 against a budget of 8/14.
So the guard was real, which is more than the prompt's premise allowed for.

Then the control in the other direction, which is the one that had never been run.
**Lengthening one MDM-10 distractor past its answer -- the exact repair this whole
apparatus exists to request -- reddened three assertions.** Two were exact counts
(`expect(scored.length).toBe(95)` and `expect(notLongest.length).toBe(45)`) and the
third was an arithmetic test that had used the live MDM-10 bank as the fixture for a
claim about hypergeometric versus binomial probability, so fixing the content broke a
test about mathematics.

That is worse than a guard that says nothing. The cheapest way out of a red build is to
edit the number, and a number edited in the direction of the fix is the same ratchet the
file's own header spends four paragraphs rejecting -- it would have recorded the repair
as a regression and taught the next reader that the repair is what breaks CI. The counts
are now a ceiling and a floor with the partition pinned as an invariant
(`clean + offending === 140`), and the arithmetic is asserted against a synthetic bank
built to the 13-of-14 shape, so the expectation stays hand-computed and content-free.

**And I wrote a fourth one of these before noticing.** The retake test I added asserted
`expectedAttempts(MDM-10) < 2` off the live bank, and the improvement control caught it
on the next run. It is gone; the live figure belongs in the generated report, which is
regenerated rather than asserted. Three separate authors of this file have now made the
same mistake, which is why it is written into the header rather than left in a commit
message.

## Naming the item, and the ordering that made it matter

The failure message said which BANK got worse and not which QUESTION, which sends a
person to open fourteen items and diff them by eye. The budget now records
`longestIds` -- which items handed their answer over on 2026-08-29 -- asserted as a
SUBSET, so it is one-directional by construction: fixing an item shrinks the measured
set and passes silently.

The first version of that assertion never ran. vitest stops a test at its first failed
expectation, and the two rate assertions sat above it, so the worsening control still
printed the same bank-level sentence and the id list was never reached. It is now the
first assertion in the test body. This is also why the subset form is worth having over
a count: a **swap** -- one item fixed and another broken in the same edit -- leaves the
count unchanged and is invisible to a budget, and the third control confirms it reddens
naming `m3-04`.

## What was measured

- `svelte-check` **0 errors, 37 warnings**, breakdown 31 `state_referenced_locally` /
  5 `css_unused_selector` / 1 `perf_avoid_nested_class`, re-derived after
  `svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders exported (a fresh
  cloud checkout has no `.env`, and without them it reports the documented 11 phantom
  errors). Run 2026-09-05 12:34 PDT. Baseline unmoved.
- Full suite, 2026-09-05 12:36-12:41 PDT: **5660 passed, 2 failed, 276 files.** The two
  failures are in `tests/derived-numbers.test.ts` and are **pre-existing on the base
  commit** -- verified by running that one file in a clean `git worktree` at `fdf8c68`
  with a synced `.svelte-kit`, where it fails identically. Three route specs
  (`themes-signedout-1.mjs`, `themes-state-matrix.mjs`, `themes.mjs`) exist in the tree
  that the browser-verify README's measured-counts block never measured; the fix is
  `npm run verify:readme`, which needs a browser and about six minutes, and both the
  file and the block are outside this lane's ownership.
- The frc-quiz lane in full: **122 passed across 5 files**, the bias lint itself 36
  (from 32).
- Three mutation controls, each restored from a `cp` copy and verified with
  `md5sum -c`, never `git checkout --`:
  1. worsen `m2-01` -> 6 failed, first message names `m2-01`;
  2. improve `m10-01` -> **36 passed**, where the same mutation reddened 3 before;
  3. swap in MDM-3 (fix `m3-01`, break `m3-04`, count unchanged) -> 1 failed, names
     `m3-04`.
- The printed and written documents are byte-identical (`md5` on both), which is the
  claim the generator's header now makes.

## What is NOT verified

- **No browser pass, and none was warranted.** Nothing in this bundle renders. The
  documented visual-verification standard applies to interactive or visual work; this
  is a measurement module, a test file, a generator and a markdown document.
- **Nothing was run against the live Supabase project.** The quiz path's cooldown and
  attempt log were read from `track.ts` and `quiz-engine.ts`, not observed in
  production. The claim that a failed attempt reveals no per-question feedback is read
  off `gradeAttempt`'s return type and `submitQuiz`'s result union, not measured against
  a real student's attempt.
- **The expected-wait figures assume a student who retakes immediately** when each
  cooldown expires. They are an upper bound on speed, not a prediction.
- The three `derived-numbers` failures were confirmed pre-existing but not fixed.

## What was deliberately not built

- **No `tools/frc-quiz-bias.mjs`.** The prompt made it conditional, and the audit found
  a generator already reading the one measurement module. A second front end would have
  been a second thing to keep in step for no gain, so the existing one grew a `--print`
  mode and an `npm run frc:bias` script instead, building ONE document with two
  destinations rather than a console summary composed separately from the committed one.
- **No new `/dev/frc` harness.** `/dev/frc` already mounts the real `UnitPage` and
  `FrcQuizGate` against the dev mock endpoint for any quiz unit, so a student's-eye view
  exists. What it cannot do is show a NAMED item on demand, because the draw is random --
  and building that would mean moving answer-bearing bank content toward a client route,
  which is precisely what `$lib/server/frc` exists to prevent. The report carries all
  four options with their character counts and the target length instead, which is what
  a rewriter needs at the keyboard and reaches no client at all.
- **Not one word of quiz content.** A plausible wrong answer in a technical subject is a
  teaching judgement. The report names the item, shows every option with its length, and
  states how many characters the longest distractor has to gain; it suggests no wording,
  and the generator was written so that it cannot start to.
