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
