# What runs here, and what it does to your branches

Three workflows. `ci.yml` checks a push; `integrate.yml` collects the branches
that passed; `deploy.yml` is the one path that writes `main`.

## The short version

- **Session branches (`claude/**`) disappear on their own now. That is correct,
  not a mistake.** When CI goes green on one, `integrate.yml` merges it into
  `integration` and deletes it. The commits are on `integration`; nothing is
  lost.
- **The branch to look at is `integration`.** It is long-lived, it always has
  the latest `main` merged into it, and it carries every finished bundle that
  has not been deployed yet.
- **`main` still only moves when a person decides it moves.** `deploy.yml` is
  the only workflow that pushes it, it runs on `workflow_dispatch` alone, and
  it refuses unless the person pressing it TYPES that every migration on
  `integration` is applied to production. `integrate.yml` still may never write
  `main` under any condition, and says at length why.
- **A `claude/**` branch that is still sitting there is a signal, not a
  leftover.** It means one of: its CI failed, its CI has not finished, or its
  merge into `integration` conflicted. All three want a person.

## Deploying: press the Deploy button

Actions -> **Deploy** -> **Run workflow**, and type into the confirmation field,
exactly:

```
every migration on integration is applied to production
```

Anything else is refused before any check runs, and nothing is merged. Before
typing it, run `tools/idea-status.py` and paste its probe block into the
Supabase SQL editor: that query is the only thing that answers which migrations
production has actually applied, because no file in this repo records it.

The run then, in order: refuses unless `main` is an ancestor of `integration`
(if it is not, press **Integrate** first and come back); runs the same checks
CI runs, on `integration`'s exact tip, in that run rather than trusting an
earlier one; merges that exact sha into `main` with `--no-ff`; pushes, never
forced; and reads `main` back to print the new sha in the job summary.

**Every push to `main` deploys `ideabosco.com`,** which students use during
class. That is what the typed line and the button are protecting, and it is why
this is not on a schedule. An unattended nightly deploy was proposed and
declined: see the header of `deploy.yml` and
`docs/decisions/entries/10-unattended-nightly-deploy.md`.

`integration` is not deleted or reset afterwards. It keeps going; the next
sweep merges `main` back into it, which after a deploy is a fast-forward.

## Is `integration` green?

`integration` gets **no CI run from its own pushes** -- `integrate.yml` pushes
it with `GITHUB_TOKEN` and GitHub's loop-breaker starts no run from that. On
2026-08-29 it went red silently and stopped eight branches.

So `ci.yml` carries a **schedule** (04:30 UTC daily, which is 21:30 Pacific) and
a **workflow_dispatch** that test `integration` itself. A red scheduled CI run
is the signal that `integration` is broken and nothing will merge until somebody
looks. To check it on demand: Actions -> **CI** -> **Run workflow**, which
defaults to `integration` and accepts any other ref.

Neither of those triggers an Integrate sweep: `integrate.yml` requires
`github.event.workflow_run.event == 'push'`, so a scheduled or dispatched CI run
does not reach it. Neither does the CI that `deploy.yml` calls, which runs as a
job inside the Deploy run rather than as a run of its own.

## When something is stuck

Open the **Actions** tab and find the red **Integrate** run. Its job summary has
up to FIVE sections -- the first is always there and is about `integration`
itself rather than about any branch; the last three appear only when they have
something to report:

- **`integration` itself** -- whether it was caught up to `main` (and by how
  many commits), whether it was pushed, and, when something conflicted, that the
  red X is for the conflict and for nothing else.
- **Merged into `integration` and deleted** -- the branches that landed.
- **Already contained, deleted** -- branches whose every commit was already
  reachable from `integration` or `main`. Nothing was merged for these; the ref
  held nothing a delete could take away.
- **CONFLICTED -- a person is needed** -- see below.
- **Left alone**, with the reason: `CI on abc1234 is failure`, a ledger entry
  that `still says its session is running (Status: issued)`, or
  `already in integration` in the narrow case where the delete was refused or
  declined.

`already in integration` is normally a DELETE reason now and appears under
"Already contained, deleted"; it reaches "Left alone" only when the branch was
protected, when containment held solely in the runner's unpushed work, or when
the delete itself was refused.

**A RED RUN DOES NOT MEAN NOTHING LANDED.** Since the deadlock fix, `integration`
is caught up to `main` and pushed whenever it moved at all, including on a run
where every outstanding branch conflicted. The run is still red -- a conflict
needs a person and a green run is one nobody opens -- but the first summary
section says in words whether the target itself was pushed, and `deploy.yml` is
not blocked by it. Before the fix that main-merge was computed and thrown away
on such a run, which deadlocked Integrate against Deploy's own
"`integration` is behind `main`" refusal.

A conflict is two bundles genuinely touching the same file. Resolve it on the
branch, never on `integration`:

```
git fetch origin
git checkout claude/<the branch>
git merge origin/integration      # resolve, commit
git push origin claude/<the branch>
```

CI runs again, and the next green run picks it up. You can also press **Run
workflow** on Integrate to retry the sweep immediately.

Note that while one branch conflicts, **every** Integrate run stays red, because
it re-reports the outstanding conflict each time. Other branches still merge
normally underneath that red X; the summary is what tells you which is which.

## Two properties worth knowing before they surprise you

- **A `claude/**` branch is merged as soon as CI is green on its tip.** There is
  no "done" flag. If a session pushes a work-in-progress commit and CI passes,
  that commit is integrated and the branch is deleted. Push when you are
  finished. (Pushing again afterwards simply re-creates the branch, and only the
  new commits get merged next time.)
- **A push made by this workflow does not start another workflow run.** That is
  GitHub's own loop-breaker for `GITHUB_TOKEN`: `integration` therefore gets no
  CI run of its own. Every commit on it was green on its source branch, and CI
  runs again when a person merges to `main`, but `integration` itself is not
  independently checked. Vercel is unaffected -- it deploys through a GitHub App
  webhook, not through Actions, so `integration` still gets a preview build.
