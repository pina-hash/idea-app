# 21 `integrate.yml` runs the suite AFTER it merges, pushes and deletes, so a red merged tree cannot stop a merge
- Raised: 2026-09-09  By: session on `claude/site-versions-build-blade-fix-gqksqp` (prompt 0121), item FOUR, report-and-propose
- Status: open
- Decision needed: whether the suite on the merged tree becomes a GATE on the push, or
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
