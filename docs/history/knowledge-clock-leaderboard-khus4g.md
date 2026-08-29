---
title: "A server clock for the GAUNTLET knowledge boards, and a passing unranked run that says so (`0148`, `claude/knowledge-clock-leaderboard-khus4g`)"
date: 2026-08-29
branches: [claude/knowledge-clock-leaderboard-khus4g]
migrations: ["0148"]
subsystems: ["GAUNTLET", "Curriculum, migrations, policy", "Testing"]
---

## A server clock for the GAUNTLET knowledge boards, and a passing unranked run that says so (`0148`, `claude/knowledge-clock-leaderboard-khus4g`)

**Branch:** `claude/knowledge-clock-leaderboard-khus4g`, cut from `origin/integration`
at `7a4ba7b` (not `main`: `0147` is on `integration` and this builds on its payload
shapes).
**Migration:** `supabase/migrations/0148_gauntlet_knowledge_clock.sql`.
**`0148` HAS NOT BEEN APPLIED**, and it has a deploy ordering: the client ships
FIRST, the migration second. See below.

`0146` and `0147` are both accounted for here as previously established facts:
`0146` IS applied on production, so the copy defect in part 1 was live while this
was written; `0147` is not, and this file's `gauntlet_submit` is a diff against
`0147`'s body, so applying `0148` before it would rewind that bundle.

---

### Part 1. A passing run in an unranked mode said nothing at all

`0146` took Reverse Engineer and Feature Golf off `gauntlet_leaderboard` and
predicted the client fallout in its own header:

> ModelingRun.svelte keys its post-run sentence on `result.is_correct && myBest`
> and falls through to "A miss is recorded but does not rank." when myBest is
> null, so a PASSING Feature Golf run will currently read as a miss.

**That prediction is narrower than it reads, and the correction is worth
recording because the fix follows from which version is true.** The miss
sentence is guarded by `{:else if !result.is_correct}`, so it does NOT render on
a pass. Verified by mounting the shipping component and driving a real Realtime
row through it (`tests/dom/gauntlet-modeling-run-mount.test.ts`): on a pass with
`myBest` null, **zero** post-run sentences render. The student clears the
challenge, is told neither that they ranked nor that they did not, and reads
"No verified runs yet. Be the first to clear it." under an empty board. Silence,
not a wrong sentence.

Silence is the harder defect of the two: a wrong sentence gets reported by the
first student who sees it, and a missing one gets read as the site being broken.

**The fix is a third branch, not a reworded second one.** There are three
outcomes and the component had two. The new sentence gives `0146`'s own reason
rather than a second version of it ("neither ranks on anything the server can
check"), says the run still counts toward XP (true: XP counts clears, and
clearing still means passing the hidden volume gate), and names the room board
as the place it does rank.

**`boardSettled` is what makes the third branch safe rather than merely likely.**
`myBest` is ALSO null for one tick after a first clear in a mode that does rank,
because the Realtime row arrives before the `invalidateAll()` that folds it in.
Keyed on `myBest` alone, the unranked sentence would flash at exactly the student
it must never be shown to. The realtime handler now awaits that reload and the
branch waits for it. Today no ranked mode mounts this component, so the flag
guards a case that cannot occur; it is there because the case it guards is the
one nobody would think to check when a mode is put back on the board.

**What was NOT changed, and is worth someone's attention:** the leaderboard
blurb below the fold still reads "Machine-verified runs, best first. Failed runs
are recorded but do not rank", and the empty board still says "Be the first to
clear it" to a student who just did. Neither is false, and both are misleading
in an unranked mode. Fixing them honestly needs a `ranked` prop from the two
routes that mount the component (`/gauntlet/feature-golf/[id]`,
`/gauntlet/reverse-engineer/[id]`), which this session did not own. It cannot be
inferred from an empty board: a ranked mode with no clears yet looks identical.

---

### Part 2. The knowledge boards ranked a number the browser sent

This is `0147` section 6 built. That section names the defect and proposes the
shape; everything below is that proposal plus the one decision it left open.

#### What was re-verified rather than taken on trust

* `gauntlet_submit`'s knowledge branch turns `p_elapsed_ms` into `score_metric`
  unchanged, with no source check and no timing check.
* `gauntlet_leaderboard` admits knowledge rows on `mode` alone, unlike the
  modeling branch beside it which requires `source = 'macro'`.
* The same call returns `correct` and `explanation` on a WRONG answer.
* So: submit anything, read the key off the refusal, resubmit with
  `p_elapsed_ms: 0`. Measured on a real database at the pre-`0148` chain:
  `score_metric` 0, `value.elapsed_ms` 0, board rank 1.

**A second client-supplied ranking input that `0147` did not name.** The view's
tiebreak is `(s.value ->> 'elapsed_ms')::numeric`, and `gauntlet_submit` writes
`p_elapsed_ms` into `value` as well. A fix that moved only `score_metric` would
have left the board ranking on the browser's number one column over. Both are
server-stamped now, which is also why the view did not have to be redefined --
`0147`'s reason for leaving it alone (it is adjacent to `0060`, applied by hand
separately) still holds.

#### The decision `0147` left open: what a SECOND start does

`0147` proposed `on conflict do nothing`. That is right about the exploit and
wrong about the student, and both halves are load-bearing:

* **Plain `do nothing`** makes one abandoned attempt permanent. A student who
  opens a question, closes the tab and comes back an hour later can never post an
  honest time for it again. Not a lock on clearing it, but a lock on ever ranking
  on it, landing on the most ordinary thing a student does.
* **Plain `do update set started_at = now()`** restores the exploit in one
  keystroke: read the question, work the answer out, RELOAD, answer in three
  seconds. This is the trap in the obvious repair, and it is why no rule keyed on
  the answer alone can work: "restarting because I abandoned it" and "restarting
  because I have finished thinking" are the same action.

**So the separator is time PLUS answeredness**, and the three cases are:

1. **Unanswered and stale** (older than 30 minutes): restart. The reload exploit
   survives here and is PRICED rather than closed -- it now costs thirty minutes
   of real waiting per reset, per question, and leaves every step in
   `submissions`. Turning a free instant win into a tedious, visible, half-hour
   one is the whole of what a clock can buy against somebody willing to wait.
2. **Unanswered and fresh**: the first start stands. This is what stops
   reload-before-answering, and it is why the window cannot be short.
3. **Answered, at any age**: the clock is closed forever. This kills the
   read-the-key loop: a later correct submit is still measured from the ORIGINAL
   start, so it costs the whole detour and can never beat the student's own first
   attempt.

**The cost, stated rather than discovered later:** once a student has submitted
an answer to a question, they cannot post a better time for it, ever. They can
still CLEAR it (a later correct submit supersedes an earlier miss, because the
view orders `is_correct desc` before `score_metric asc`) but with the wall-clock
time since their first start. One timed attempt per question; practice
afterwards is free, honest, and does not rank. The result carries
`timed_attempt` so the surface says that instead of showing a four-figure time
with no explanation -- driven in a browser, the review submit renders
"1473m 32s" beside the note, which is exactly the number the note exists for.

**Accrual was drafted and rejected on a measurement, not on taste.** Letting the
student restart after answering and charging them attempt one plus attempt two
looks fairer and is worse: it bounds their score by their FIRST attempt's
length, which they choose. Submit garbage two seconds in, read the key off the
refusal, restart, answer instantly, and the board reads two seconds. Freezing
bounds the score by wall-clock time, which they do not choose.

**Thirty minutes is `gauntlet_run_tokens`' existing expiry (`0023`)**, so it is
already what this subsystem means by one sitting. It is a function
(`_gauntlet_knowledge_window()`) and not two literals, for the
`_foundry_play_window()` reason: the restart rule and any later staleness reading
are the same question about what one attempt is.

#### The deploy ordering, which `0147` deliberately did not take on

**Deploy the client FIRST, then apply `0148`.** After the migration a knowledge
submit requires a start row, so the client must be able to create one before the
migration lands. `startKnowledgeClock` degrades past a missing function on
`PGRST202` alone, so between the deploy and the apply the call is a no-op and
submits grade exactly as they do today. After the apply, a page LOADED before it
has no start row and its submit is refused with a sentence telling the student to
reload -- the same refusal a genuinely stale tab gets, and self-healing.

**The successful start is what licenses omitting `p_elapsed_ms`**, which is the
tidiest form of the deploy-ordering rule: the RPC and the arithmetic change that
ignores the parameter land in the SAME migration, so a start that came back
PROVES the parameter is not wanted. This is not decoration. The pre-`0148`
function scores a MISSING `p_elapsed_ms` as **zero**, so a client that stopped
sending one before the migration landed would not degrade, it would fill every
knowledge board on the site with 0.00 rows. The routes therefore pass the
parameter conditionally, on the field's presence, and `p_elapsed_ms` keeps its
place in the signature (removing it is a signature change on a function a
deployed client already calls).

#### One implementation, two call sites

Drawing Reading has its own page and GD&T / Spot the Error share
`KnowledgePlay.svelte`, so `src/lib/gauntlet/knowledge-clock.ts` holds the
ladder, the predicates and the copy. Two spellings of "is the server timing this"
is the pair that stops agreeing, and it fails silently: a surface that quietly
decided the clock was absent goes on sending a browser number nothing checks.
`tests/gauntlet-knowledge-clock-client.test.ts` sweeps both surfaces for a second
`PGRST202` check and for the shared call.

**The start is in `onMount`, not in the route `load`.** A load runs on hover
prefetch, so a start there would stamp a clock for every question a student's
mouse passed over. It is also a plain call rather than an `$effect`: it is
somebody else's client, and an effect calling it takes a dependency on whatever
it touches.

---

### Part 3. Reported, not changed: would closing the Reverse Engineer oracle let `0146` lift the exclusion

**No, not on its own, and the residue is measured rather than argued.** Full
answer in the session report; the load-bearing measurement is here so it is not
re-derived.

`0146` names the minimal change: stop returning `score_metric` from
`gauntlet_macro_submit` for `reverse_engineer`, which removes the two-probe
closed-form solve for the target. Necessary, and not sufficient. What survives is
`deviation_band`, whose edges are constants (1% and 5%): bisecting the far/near
crossing puts a caller at `0.95 * target` to arbitrary precision, so the target
follows by one division.

**Measured against a real database at the `0147` chain, reading ONLY
`deviation_band` and never `score_metric`:** the target volume was recovered to a
relative error of **3.7e-12** in **246 probes across 82 reveals**, and submitting
the recovered value scored `is_correct = true, score_metric = 0` -- a perfect
Reverse Engineer run with no part modelled. The scripted cost per reveal is one
`gauntlet_speedrun_reveal`, one `gauntlet_macro_start` (blank part, volume 0) and
three `gauntlet_macro_submit` calls; all three are reachable straight through
PostgREST with no SolidWorks and no macro. Most of the 246 was a naive geometric
scan for the initial bracket, so a competent attacker does it in well under a
hundred.

So the `0061` attempt budget prices the search at one reveal per three probes and
does not bound it, exactly as `0147`'s header says of any unlimited free
correctness signal. Lifting the exclusion needs the SEARCH bounded, not just the
closed form removed.

---

### Verification

* **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), unchanged from baseline
  and re-derived after `svelte-kit sync` with placeholder `PUBLIC_SUPABASE_*`
  exported.
* **Full suite before: 164 files / 3539 tests, all passing. After: 167 files /
  3584 tests, all passing.** +3 files, +45 tests.
* **Mutation proofs, all in the permissive direction.**
  * The clock's are BY CONSTRUCTION, in separate databases, so nothing on disk is
    edited: a `BEFORE` chain ending at `0147` (production as it stands) that every
    "the client's number is ignored" assertion must FAIL against, and two MUTANT
    databases built by one string replacement each against the shipped migration
    text, with the anchor count asserted. Removing the missing-start refusal makes
    an unstarted submit score 0 again; removing the restart `where` hands back both
    reload-before-answering and the resubmit loop. Both reddened.
  * The copy fix's is a file mutation, restored from a copy and md5-checked, never
    `git checkout --`. Two mutations: dropping the third branch (the pre-fix
    world) reddened 3 of 6; making the miss copy unguarded (`0146`'s predicted
    world) reddened 3 of 6 including the exclusion assertion. Restored
    byte-identical and re-verified green.
  * The exclusion assertion was SPLIT into its own test after the first mutation
    run showed it was being short-circuited by a `toBeDefined()` ahead of it. An
    exclusion buried behind another assertion is never exercised by the mutation
    that matters.
* **Browser pass, real Chromium 141.0.7390.37 at 1440px and 375px**, driving the
  new `/dev/gauntlet-knowledge-clock` harness (five mounts, one per outcome of
  the start call):
  * With an answer selected, Submit is enabled in 4 of 5 mounts and disabled in
    exactly one: `starting`. That is the claim, measured, with the other four as
    its positive control.
  * Submit button box **186x44 / 188x44** at both widths, clearing the 44px floor.
  * `server-closed` renders the ahead-of-the-attempt note; `failed` renders the
    warning; `client-rung` is indistinguishable from `server-timed`, which is
    correct (the student is not the person who needs to know).
  * Timed submit renders "Correct / 41.6s" with no review note; the second submit
    renders "Correct / 1473m 32s" WITH it.
  * No horizontal overflow at either width (scrollWidth == clientWidth).
  * The only console errors were `ERR_CONNECTION_RESET` on an external font
    request, at both widths, from the sandbox's network policy rather than the
    page.

### Not verified

* **The live Supabase project.** `0148` has not been applied anywhere; every
  database claim above is the embedded Postgres fixture with the real migration
  files applied unmodified.
* **The deploy-ordering window itself**, which by definition needs a real
  deployment and a hand-applied migration. What is tested is each rung
  separately: the `PGRST202` degradation, and that the routes omit
  `p_elapsed_ms` only when the field is absent.
* **A real signed-in knowledge run.** The play routes need a Bosco Tech Google
  session; the browser pass drove the `/dev` harness, which mounts the real
  component with an injected client, not the production route.
* **Whether the same bisection compromises Speedrun's board**, which `0146` KEPT.
  Its stated argument is that the clock is server-stamped and the volume "only
  has to hit a hidden target"; if the target stops being hidden, a student who
  bisected it once can reveal and submit within seconds. Not measured, not this
  session's to fix, and named so it is not found later as a surprise.

### Deferred

* The leaderboard blurb and the empty-board card in `ModelingRun.svelte` (Part 1),
  which need a `ranked` prop from two routes this session did not own.
* Bounding the reveal, which is what lifting the Reverse Engineer exclusion
  actually requires (Part 3). It changes the practice loop for every modeling
  mode, so it is a product decision with its own bundle.
* Backfilling or deleting the knowledge submissions already recorded with a
  client-supplied `score_metric`. `0148` cannot rewrite them -- nothing anywhere
  recorded when those students were shown the question -- so it COUNTS them at
  apply time, and separately counts the ones claiming exactly 0 ms, and leaves
  the decision to a person reading the numbers.
