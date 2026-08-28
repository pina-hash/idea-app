# What runs here, and what it does to your branches

Two workflows. `ci.yml` checks a push; `integrate.yml` collects the branches
that passed.

## The short version

- **Session branches (`claude/**`) disappear on their own now. That is correct,
  not a mistake.** When CI goes green on one, `integrate.yml` merges it into
  `integration` and deletes it. The commits are on `integration`; nothing is
  lost.
- **The branch to look at is `integration`.** It is long-lived, it always has
  the latest `main` merged into it, and it carries every finished bundle that
  has not been deployed yet.
- **`main` still only moves when a person moves it.** No workflow in this repo
  pushes to `main`, and `integrate.yml` says at length why not. Deploying is
  merging `integration` into `main`, by hand, when you mean it.
- **A `claude/**` branch that is still sitting there is a signal, not a
  leftover.** It means one of: its CI failed, its CI has not finished, or its
  merge into `integration` conflicted. All three want a person.

## Deploying

```
git fetch origin
git checkout main && git pull
git merge --no-ff origin/integration
# apply any migration the bundles carry, BY HAND, in the Supabase SQL editor,
# BEFORE this push -- see the header of integrate.yml
git push origin main
```

`integration` is not deleted or reset afterwards. It keeps going; the next
sweep merges `main` back into it, which after a deploy is a fast-forward.

## When something is stuck

Open the **Actions** tab and find the red **Integrate** run. Its job summary
names every branch and what happened to it: merged, conflicted, or left alone
with the reason (`CI on abc1234 is failure`, `already in integration`).

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
