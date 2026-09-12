# 21 `integrate.yml` runs the suite AFTER it merges, pushes and deletes, so a red merged tree cannot stop a merge
- Raised: 2026-09-09  By: session on `claude/site-versions-build-blade-fix-gqksqp` (prompt 0121), item FOUR, report-and-propose
- Status: decided 2026-09-12. YES, BLOCK. The DECISION is closed; the BUILD is open, see the Build line.
- Decision: 2026-09-12, Mr. Pina: yes, block. A failing merged suite stops the push
  rather than warning.
- Build: OPEN, and it is still the single-lane bundle this entry already said it
  had to be -- `.github/workflows/integrate.yml` is the file every lane depends on
  to land, so the change runs alone and merges nothing else with it.
- What made this answerable: ledger 0163. The `merged_suite` job used to run
  `npm ci` then `npm test` with NO `svelte-kit sync` between them, so on a runner's
  checkout vitest died in dependency optimisation before any test body, named no
  failing test, and the job answered `unrun` -- on every tree, every time. A gate on
  a signal that is structurally never green would have blocked every merge in the
  repository, which is why this could not be answered before. 0163 fixed the sync,
  so the suite reports a real result now and a gate on it is a gate on something.
- What remains: beyond flipping the gate, the ORDER this entry describes is
  unchanged, and blocking means reordering rather than adding an `if`.
  Today the job merges, regenerates the counts, PUSHES `integration`, DELETES the
  source branches, and only then runs the suite -- so by the time the suite speaks
  there is nothing left to stop. A gate has to move the suite ahead of the push and
  the delete, which is exactly the thing the current order was chosen to avoid:
  `npm ci` plus the suite are the two longest steps and the two most exposed to
  being killed from outside, and a run evicted mid-suite must not lose a merge it
  had already computed. That trade is the build's to solve and his answer settles
  which side of it wins.
- Question as raised: whether the suite on the merged tree becomes a GATE on the push, or
  stays the report it is today.
- Not changed by this bundle, on purpose. `.github/workflows/integrate.yml` is the file
  every other lane depends on to land, four lanes were running when this was written, and
  a change to it is the one kind of bundle that has to run alone. This entry is the
  proposal; the edit is a separate, single-lane bundle.

## The problem

The job's own order is: merge `main` into `integration`, merge every green `claude/**`
branch into it, regenerate the static counts region, **push `integration`**, **delete the
source branches**, and only then run `npm ci && npm test` on the merged tree
(`merged_suite`, called at the end of the sweep). The suite's result reaches a person as a
red run and a summary; it reaches the branch protection of nothing.

Two consequences, and the second is the expensive one:

1. **A red merged tree cannot stop the merge that made it red.** By the time the suite
   speaks, the merge commit is on the remote and the branch that contributed it has been
   deleted. The workflow says so in words -- "SO A RED TREE IS PUSHED, DELIBERATELY".
2. **`integration` keeps accepting work while it is red.** The next branch to go green is
   merged into a target that is already failing, and the run after that, and so on. The
   suite result of each of those runs is red for a reason none of them introduced, so the
   signal that would identify the culprit is buried under the ones that follow it. This
   landed `integration` red on 2026-09-10 and cost a full landing cycle.

**The reason for the current order is real and any change has to answer it.** `npm ci`
plus a ~175s suite are the two longest things the job does and the two most exposed to
being killed from outside (out-of-memory, runner eviction, the job cap). Run before the
push, any of those discards every merge in the sweep -- each of which was individually
fine. The current order buys "a failure here is never a lost merge", which is a genuine
property and not a shortcut.

**What weakens that reason, and is the reason to reopen it.** Nothing is lost by a
discarded sweep, because the deletes have not happened yet either: every source branch is
still standing, so the NEXT run redoes the whole sweep from the new tip. That is already
how this job handles a rejected push -- "Nothing has been deleted at this point, so
nothing is lost" -- and it is the same argument one step earlier. What a discarded sweep
costs is latency, not work.

## The exact proposed change

In `.github/workflows/integrate.yml`, move the `merged_suite` call from after the delete
loop to immediately after `counts_refresh` and immediately before `target_push_gate`, so
it runs on the exact tree that is about to be pushed (counts region included), and branch
on its return code:

- **0, the suite ran and passed.** Push `$TARGET`, then run the delete loop, then write
  the summary. Byte-for-byte today's behaviour.
- **1, the suite ran and reported failures.** Push NOTHING and delete NOTHING. Exit
  non-zero. The summary names the failing assertions (it already does) AND the full list
  of branches that were in the batch, because that list is now the suspect list and it is
  the thing a person needs. Every source branch is left standing, so nothing is lost and
  the next run retries.
- **2, the suite could not be run at all** (`npm ci` failed, the runner is sick). This is
  the case the current ordering exists to protect, and it is the half that needs Mr.
  Pina's answer rather than a default. Fail closed (push nothing) is the safer reading and
  is what this entry recommends: "cannot say" is never a pass, which is the rule
  `deploy-probe` already follows. Fail open (push, warn) preserves today's throughput and
  keeps an infrastructure fault from stopping every lane.

Two things must move with it or the change is not finished:

- **`tools/integrate-gate-proof.sh` gains a case for it.** The suite body is already
  between `merged_suite_marker:begin/end` and is proved by cutting that exact text out of
  the workflow. The new proof needs both directions: a stub `npm` that FAILS proves the
  target ref did not move and no branch was deleted, and a stub that PASSES proves both
  still happen. A gate proved in one direction is the vacuous positive control this
  repository has already been bitten by twice.
- **`tests/workflows.test.ts` pins the file's push shape** -- exactly one
  `git push --delete` -- and that pin must keep holding, because the delete loop moves
  inside a conditional rather than being duplicated.

## What it costs

- **A branch stays standing longer.** Today a green branch is deleted in the run that
  merges it. Under the proposal a branch is deleted only once the merged tree is green, so
  a branch whose merge interacts badly with another stays on the remote until somebody
  resolves it. That is a visible outstanding branch instead of an invisible red target,
  which is the trade this proposal is making, but it does mean the branch list temporarily
  overstates the in-flight queue -- the exact reading the ledger gate exists to correct,
  and the ledger entry still says `pushed`, so the queue is still readable from the
  ledger.
- **One bad interaction blocks every lane until a person acts.** That is what a gate is
  for and it is still a cost: today the other three lanes in a sweep land and one problem
  is recorded, where under the proposal none of them lands. Note the batch is retried
  whole by the next run, so a transient failure clears itself.
- **A killed job costs a sweep's latency.** Measured on the runner that found `5877f19`:
  the suite is 174.50s over 287 files and `npm ci` is 15s, on a serialized job.
- **Nothing about `main` changes.** This workflow may never write to the deploy branch and
  the proposal does not touch that; the human gate at `deploy.yml` is unaffected.

## The revert

One commit, reverted: move the `merged_suite` call back after the delete loop and drop the
conditional. There is no state to unwind -- no schema, no data, no stored flag -- and a
target left red by the old behaviour is red either way.

**The revert has the same landing constraint as the change, and that is the sharpest part
of this entry.** `workflow_run` runs the copy of the workflow that is on the DEFAULT
BRANCH, so neither the change nor its revert does anything until it is on `main`. A bad
edit here cannot be fixed on a branch: it is fixed by landing a revert on `main`, which is
a deploy. That is the whole argument for this being a bundle that runs alone, and for the
decision being Mr. Pina's rather than a lane's.

## FOUND WHILE THIS BUNDLE WAS LANDING: the merged-tree suite has never once run

This section was written after the rest of the entry, from this bundle's own
Integrate run, and it **changes the recommendation above rather than merely
adding to it.**

`merged_suite` runs `npm ci` and then `npm test`, and nothing between them runs
`svelte-kit sync`. A fresh `npm ci` checkout has no `.svelte-kit`, so vitest dies
during startup with `Tsconfig not found` before a single test executes.
`merged_suite` therefore returns 2 -- "the suite could not be run at all" -- on
EVERY run in which the tree moved, and has done since it landed.

**`ci.yml` does not hit this because it runs `npm run check` (which is
`svelte-kit sync && svelte-check`) as a step BEFORE `npm test`**, so the
generated tsconfig is on disk by the time the suite starts. `integrate.yml` has
no equivalent step. Two workflows running "the same" suite differ by one
generated directory, and only one of them generates it.

**Measured, with a positive control, rather than inferred:**

- Integrate run 34411071492 (22:13Z, 2026-09-09) merged this bundle's branch,
  pushed `integration`, deleted the branch, and then failed with
  `[RESOLVE_ERROR] Could not resolve 'node:module' in \0rolldown/runtime.js ...
  Tsconfig not found`.
- **The control that says it is not this bundle's doing:** run 34398008856
  (19:56Z, three and a half hours before this branch existed) merged nothing but
  a `materials/` fast-forward of `main` and failed with the same error at the
  same step.
- Reproduced locally on the merged tree: with `.svelte-kit` present `npm test`
  reaches `RUN v4.1.10`; with the directory moved aside it dies at startup on
  `Tsconfig not found`; with the directory deleted and `npx svelte-kit sync` run
  once, it reaches `RUN v4.1.10` again. The local failure surfaces as
  `[TSCONFIG_ERROR]` against `tests/db/cluster.ts` rather than the runner's
  `[RESOLVE_ERROR]` against rolldown's runtime -- the same missing generated
  tsconfig, reported by a different first consumer of it, which is worth knowing
  because the two messages do not look alike.
- The trap is already written down in `CLAUDE.md`, under the toolchain traps, as
  the thing that bites a fresh `npm ci` checkout. The workflow was written
  against it and does not do what it says.

**Three consequences, and the second is the one that changes the proposal.**

1. **The safety net added to catch a red merged tree has never caught one.** The
   cross-file failure it was built for (`5877f19`) would pass through it today,
   because the suite does not run. Every Integrate run that merges anything goes
   red for this reason, so the signal that a merged tree is genuinely broken is
   indistinguishable from the signal that the suite could not start -- and both
   have been arriving as the same red mark for days.
2. **THE ORDERING CHANGE PROPOSED ABOVE MUST NOT LAND FIRST.** This entry
   recommends failing closed on return code 2. With the missing sync still in
   place, return code 2 is not a rare infrastructure fault, it is the PERMANENT
   state -- so a fail-closed gate shipped today would push nothing, delete
   nothing and block every lane in the repository, immediately and
   indefinitely. **The sync fix is a prerequisite for the reordering, and the
   safe order is: add the sync step, watch one Integrate run report a real
   verdict, and only then move the call.**
3. **It sharpens what `merged_suite`'s three return codes are worth.** A gate
   whose "cannot say" branch is permanently taken is a gate with one reachable
   answer, which is the vacuous-control failure this repository has been bitten
   by repeatedly -- here aimed at a workflow rather than at a test.

**The proposed fix for this half, separately from the reordering:** add
`npx svelte-kit sync` between the `npm ci` and the `npm test` inside
`merged_suite`, treating a sync failure the way an `npm ci` failure is already
treated (return 2, "could not be run"). `tools/integrate-gate-proof.sh` already
cuts that function between markers, so the proof gains a case with a stub `npm`
that reaches `npm test` only when the sync ran. This is a smaller change than
the reordering, it is independently useful, and it is the one that has to go
first.

**It is still not made here.** The file is the one every lane depends on to
land, and the fact that this bundle discovered the defect BY being merged and
deleted by it is the argument for that, not against it.

## THE PREREQUISITE HAS LANDED. THE DECISION HAS NOT, AND THIS ENTRY STAYS OPEN

Written by the session on `claude/cool-cori-0vzwcz` (prompt 0163), which was sent at the
half above and only at that half. **`Status` is deliberately unchanged.** What this entry
asks is whether the merged-tree suite becomes a GATE on the push or stays the report it is
today, and in particular what return code 2 should do -- and the entry's own argument is
that this is Mr. Pina's rather than a lane's, because a bad edit here cannot be fixed on a
branch. None of that is answered by what follows. What follows is the thing the section
above named as having to go FIRST.

**THE DEFECT IS FIXED AND IT WAS REPRODUCED BEFORE IT WAS TOUCHED.** `merged_suite` now
runs `npx svelte-kit sync` between `npm ci` and `npm test`. Reproduced on a fresh
`npm ci` checkout of this repository, with the exact instrument the section above
describes: with no `.svelte-kit`, `npm test` exits 1 having printed
`[RESOLVE_ERROR] Could not resolve 'node:module' ... Tsconfig not found`, with **0 `FAIL`
lines and 0 `Tests` summary lines** -- so `findings` is empty and the function takes its
`unrun` branch, unconditionally, on any tree. After one `svelte-kit sync` the same tree
runs (`tests/workflows.test.ts`, 59 passed).

**IT DIFFERS FROM THE PROPOSAL IN MECHANISM, NOT IN OUTCOME, AND THAT IS SAID HERE RATHER
THAN LEFT TO BE FOUND.** The section above proposed treating a sync failure "the way an
`npm ci` failure is already treated (return 2)". The line added does not carry its own
guard: a failed sync is reported to stderr and left to the suite, which then reaches no
test body and is answered by the `unrun` branch that already exists for exactly that. The
RETURN CODE IS 2 either way and is proved so; what a caller loses is the more specific
sentence, and what it costs is one suite run before the same verdict. The fix was kept to
one line on purpose, because this function's stdout is its verdict and every extra path
through it is a path that can print on the wrong stream.

**THREE STATES, ALL THREE PROVED, WHICH IS THE PART THAT WAS MISSING.**
`tools/integrate-gate-proof.sh` cuts the real function out of the workflow and drives it;
it reported green, red and unrun before this bundle too, and that is precisely the problem
the section above describes one level up: its stub `npm test` ran regardless of any
generated directory, so the harness was modelling a function the workflow did not have.
The stub now mirrors the real toolchain -- `npm ci` REMOVES `.svelte-kit`, `npx svelte-kit
sync` is the only thing that creates it, and `npm test` reproduces the startup error's
shape (non-zero, nothing named) when it is absent. **And the control is the real one:**
cases 72c and 72d re-cut the same region with the sync line deleted and re-run the two
trees that cases 61 and 63 tell apart; without the line both collapse to `unrun`, with it
they come back `green` and `red`. Case 72a covers a sync that fails. 98 of 98 cases pass,
exit 0.

**A SECOND DEFECT WAS FOUND IN THE HARNESS WHILE DOING IT, AND IT IS THE SAME SPECIES.**
Cases 80 and 81 -- the standards-version half of the cross-branch gate -- stood RED on
`origin/integration`, measured on a pristine worktree of it before anything was changed
(91 passed, 2 failed). The cause is not the gate: the harness sources the cut text under
`set -u` and never supplied `AGENT_BRANCH_PREFIXES`, which the workflow declares once in
its job-level `env:`, so the region aborted at its first use and the two cases observed
`MERGE MERGE` where the real gate skips. The harness now reads that value OUT OF THE
WORKFLOW rather than writing a second copy of it down. So the standards-version contest
gate was unproven for as long as those cases were red, which is the other half of why a
standing failure is worse than no check.

**WHAT REMAINS, UNCHANGED BY THIS.** The reordering, the branch on the return code, and
the fail-closed-versus-fail-open answer for code 2. The entry's own safe order puts one
more step before them: **watch one Integrate run report a real verdict.** No Integrate run
has done that yet at the time of writing -- this bundle's fix is not on `main`, and
`workflow_run` runs the copy of the workflow on the DEFAULT BRANCH, so the first real
verdict cannot arrive until it lands there. Until one does, the claim that the gate now
speaks rests on the cut-text proof and the local reproduction, both of which are stated
above, and not on a production run.

## Context

- `.github/workflows/integrate.yml` -- the `merged_suite` block and its "AFTER THE PUSH
  AND AFTER THE DELETES, WHICH IS THE WHOLE OF WHERE IT MAY GO" argument, which this
  proposal contradicts deliberately and quotes rather than paraphrases.
- `docs/decisions/entries/16-a-lane-may-merge-to-main.md` (decision 16,
  a-lane-may-merge-to-main) -- the six gates a lane reports before merging `integration`
  into `main`. A red `integration` fails its CI-green gate, so today's behaviour does not
  leak a red tree to production; what it costs is the landing cycle, which is what this
  entry is about.
- `docs/decisions/entries/10-unattended-nightly-deploy.md` (decision 10,
  unattended-nightly-deploy) -- the declined automation next door, for the shape of what
  gets declined and why.
- `docs/prompt-ledger/entries/0121-build-stamp-and-blade-exports.md` -- the prompt that
  raised this and was told to propose rather than change.
