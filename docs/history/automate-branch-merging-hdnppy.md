---
title: "Green session branches collect themselves onto `integration`, and the deploy stays a person's decision (`claude/automate-branch-merging-hdnppy`, no migration)"
date: 2026-08-28
branches: [claude/automate-branch-merging-hdnppy]
migrations: []
subsystems: ["Repository workflow", "CI"]
---

Nine one-commit branches landed in a single day this week, each through its own
pull request, each merged by hand, and every one of those merges was mechanical:
pull `main`, merge the branch, push, delete the branch. The judgement in that
sequence is not in any of those steps. It is in the decision to deploy, which
`main` conflates with them because every push to `main` deploys
`ideabosco.com` while students are on it.

So the mechanical half moved into `.github/workflows/integrate.yml` and the
judgement stayed put. When CI passes on a `claude/**` branch, the workflow
merges `main` into a long-lived `integration` branch, merges the green branch
into it, pushes, and deletes the source branch. A person merges `integration`
into `main` when they want to deploy.

`integration` was created for this at `6d90c0a`, which was `main`'s tip at the
time.

### The workflow may never push to `main`, and the reason is in the file

The refusal is written into the header of `integrate.yml` rather than only into
this entry, because the first person to think this should be end to end will
read the workflow and not the record. Two things, neither hypothetical:

- **A push to `main` is a deploy to a room full of students.** Whether now is a
  good moment is a fact about the clock and the timetable that nothing in CI can
  see.
- **Migrations are applied by hand, and several must be applied BEFORE the code
  calling them ships.** Two branches in one week carried exactly that. CI cannot
  catch it: the suite applies the migration files to an embedded Postgres, so a
  branch whose migration has never touched production is green. A machine
  merging on green CI would ship an RPC call to a function the live database
  does not have.

There is one cheap structural assertion of it in the script (the target branch
name is checked against `main`/`master` before anything runs) but the honest
guard is the sentence, in the place somebody will read it.

### The five things that would break this in a month

**Serialization, and the trap inside it.** Three sessions can finish within
seconds of each other, so the workflow takes a `concurrency` group with
`cancel-in-progress: false` and runs queue instead of racing. But GitHub keeps
at most ONE pending run per group: a third arrival cancels the one already
waiting. A workflow that only handled its own trigger would silently drop that
branch's merge. So the job does not handle only its own trigger -- it sweeps
EVERY `claude/**` branch each run, and a cancelled queue entry then costs
nothing but latency. That same property is what makes every other failure below
self-healing rather than terminal.

**Only on green, per branch and per commit.** The trigger is `workflow_run` on
the CI workflow, gated on `conclusion == 'success'`, on `event == 'push'` (a
same-repo branch produces both a push run and, once a PR exists, a
`pull_request` run -- taking only the push run keeps one trigger per branch) and
on the head repository being ours. Because the sweep touches branches other than
the trigger, each branch is then re-checked through the Actions API against the
exact SHA about to be merged: **a branch that was green two commits ago is not
green.** If that lookup fails for any reason -- `ci.yml` renamed, API error --
it reads as "unknown" and the branch is skipped, which fails closed rather than
merging on no evidence.

**The `workflow_run` trap** is named in a comment where it will be read: GitHub
runs the copy of the workflow that is on the DEFAULT branch, not the copy on the
branch whose CI finished. Edits to the file therefore do nothing until they are
on `main`, and this workflow will not run at all until it has been merged there
once. Every ref the job touches is named explicitly instead of inherited from
the event, since `github.ref` points at `main` here and never at the branch
being integrated.

**Fail loud, never force.** A conflict aborts that one merge, leaves the branch
undeleted and unmerged, lets the other (independent) branches through, and fails
the job with a summary naming the branch and the command to fix it. A conflict
here is two bundles genuinely touching one file, which is exactly the thing that
must not be resolved by a machine picking a side. There is no `--force` push in
the file. The one `--force-with-lease` is on a branch DELETION and is a
narrowing, not a widening: it pins the tip that was merged, so a session that
pushed another commit mid-run keeps its branch instead of losing that commit.

**Delete only after the push succeeds.** Merges are accumulated, `integration`
is pushed once, and only then are the merged branches deleted. A rejected push
(someone moved `integration` under us) deletes nothing and fails; the next run
redoes the whole sweep from the new tip.

**Least privilege.** `contents: write` to push `integration` and delete a ref;
`actions: read` to see another branch's CI conclusion. Nothing else, and each is
commented with what needs it.

### Idempotence, and the one thing it deliberately does not do

A branch whose commits are already contained in `integration` is skipped, not
merged and **not deleted**. That is more conservative than it looks: a branch
can be contained because this system merged it, or because it was merged to
`main` by hand weeks ago and `main` is merged in at the top of every run. From
inside the job those two are indistinguishable, so only a branch this run merged
itself is ever deleted. The dozen `claude/**` branches that accumulated by hand
this week are therefore left alone (see the last section).

### What was verified, and how

The suite cannot exercise a workflow, so this was not reported on the strength
of reading it.

- **YAML parse and structure**, with PyYAML against the real file: triggers,
  `permissions`, `concurrency`, the job gate and the three steps all parse to
  the intended values. No tab-indented line (YAML forbids tabs, and this repo is
  otherwise tab-indented). The only `--force` in the file is the lease-checked
  delete; no line pushes to `main`.
- **`bash -n`** on the extracted step script, under bash 5.2.
- **The job's `if:` gate against constructed `workflow_run` payloads**, seven
  cases: green push (runs), failure / cancelled / skipped (does not), a green
  `pull_request` run (does not), a green push from a fork (does not), manual
  dispatch (runs). All seven as intended. **This evaluated the expression's
  logic with a local evaluator implementing the operators used; it does not
  prove GitHub's own parser accepts the string.** That is untested until the
  first run.
- **The step script itself, driven end to end against a real git fixture** -- a
  bare origin, `main` carrying a `materials/` export commit made after
  `integration` branched, and seven branches covering every decision: two clean
  greens, a red, one green branch that conflicts with `main`'s change, one
  already contained in `integration`, one whose CI success is recorded against
  an older SHA than its tip, and a `lane/` branch that must be ignored. The
  Actions API was stubbed so each branch's CI conclusion could be dictated.
  Measured results:
  - The two greens merged and were deleted; `integration` gained `main` first.
  - The red, the stale-green, the already-contained and the `lane/` branch were
    all left untouched and unmerged, each with its reason in the summary.
  - The conflicting branch aborted cleanly, survived, and failed the job (exit
    1) without blocking the two clean merges.
  - **Re-running changed nothing**: `integration`'s SHA was byte-identical
    before and after, no push, and the outstanding conflict re-reported.
  - **`integration` missing** was created from `main` and pushed.
  - **A concurrent push onto a branch mid-run** (injected through the stub) made
    the delete fail the lease -- `(delete) -> claude/green-a (stale info)` -- so
    the branch survived carrying its new commit, with a warning and exit 0.
  - **A concurrent push onto `integration` mid-run** rejected the push, deleted
    nothing, and exited 1; a follow-up run then merged and deleted both branches
    normally.
  - **`integration` conflicting with `main`** stopped before any branch was
    considered: nothing merged, pushed or deleted, `integration` unchanged.

**Not verified, and the first real run is the first proof of it:** GitHub's own
parse of the `if:` expression; that `workflow_run` fires as expected against the
real `CI` workflow; that `GITHUB_TOKEN` with `contents: write` can delete a
`claude/**` ref in this repository's settings (if Actions is set to read-only
token permissions, or a ruleset protects branch deletion, the push succeeds and
the delete fails -- which surfaces as the warning, not as lost work); the exact
shape of the `actions/workflows/ci.yml/runs` response from the real API; and
whether Vercel builds `integration` (see below).

**What to watch on the first run:** the Actions tab for a run named *Integrate*
appearing at all after a `claude/**` CI run goes green -- if none appears, the
`if:` gate or the `workflow_run` wiring is wrong, and pressing **Run workflow**
on the Integrate workflow tests the rest of the job without it. Then the job
summary: it should name the branch as merged, and the branch should be gone.

### Baselines

`svelte-check` 0 errors / 37 warnings (31 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class`) and the full suite 143 files
/ 3255 tests passing, measured on this tree after fast-forwarding it onto
`main` at `6d90c0a`. This bundle adds no application code, so both were expected
to be unchanged and were: the same tree measured 142 files / 3232 tests at
`9fc9df0` before the fast-forward, and the extra file and 23 tests are
`tests/vanguard-universal-rewrites.test.ts`, which arrived from `main` with
another session's bundle.

### Two things left for whoever picks this up

**`CLAUDE.md` was not updated, and it should be.** Another session modified it
on `main` while this one was running (`c59909a`), so it was not this session's
to touch. The rule that belongs in it is short: session branches are deleted
automatically once CI is green and they are merged into `integration`; the
branch to look at is `integration`; `main` still moves only when a person moves
it; and a `claude/**` branch that is still standing means its CI failed or its
merge conflicted. The people-facing version of all of that is in
`.github/workflows/README.md` in the meantime, which is where somebody wondering
why a branch vanished will actually land.

**Deleting the `claude/**` branches already contained in `main` was deliberately
not done**, only reported on. See the report accompanying this bundle: the short
of it is that containment in `main` is a sound test that the work survives, but
containment is not the same question as "is anybody still using this branch",
and the safe version of that sweep needs an age floor and a dry run first.
