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
- **The sweep now runs the suite on the tree it just built, and a red merged
  tree makes the Integrate run red WITH THE FAILING ASSERTIONS NAMED IN ITS
  SUMMARY.** The merges are still pushed -- discarding several good merges to
  avoid recording one bad interaction is worse -- so a red Integrate run is a
  report, not a rollback. See "The merged tree is tested, and neither parent
  need have been red".
- **The CI nightly on `integration` runs at 01:00 Pacific in summer and 00:00
  in winter, and that hour is load-bearing.** It is inside the only window in
  which a day-boundary defect is visible; see "The nightly hour is chosen"
  below before moving it.
- **`main` is written by `deploy.yml` and by nothing else, and it now has a
  nightly schedule as well as the button.** It runs only when `main` is an
  ancestor of `integration`, CI is green on `integration`'s exact tip, and
  `tools/deploy-probe.mjs` has read production's own catalog and found every
  migration in range applied. All three or it does not run. `integrate.yml`
  still may never write `main` under any condition, and says at length why.
- **The typed confirmation is still there, and is now the FALLBACK rather than
  the gate.** You type it only when the probe cannot answer -- no
  `DEPLOY_PROBE_URL` secret, or a migration it has no probe for. It can never
  override a migration the probe read as NOT applied.
- **A `claude/**` branch that is still sitting there is a signal, not a
  leftover.** It means one of: its CI failed, its CI has not finished, its
  merge into `integration` conflicted, or its ledger entry still reads
  `Status: issued`, which is the sweep being told the session is still running.
  All four want a person, and the last one usually just wants the session's own
  final commit. (A fifth cause is now closed: until 2026-09-05 a branch whose CI
  you re-ran green BY HAND also sat there, invisible to the sweep. See
  "Re-running a red branch's CI".)

## Deploying: usually nothing, sometimes a button

**Deploy runs itself at 03:00 Pacific (10:00 UTC) every night.** It does
nothing on a night when `integration` is level with `main`, and that run is
GREEN -- nothing is wrong, there is simply nothing to deploy.

A run does, in order: refuse unless `main` is an ancestor of `integration` (if
it is not, press **Integrate** first and come back); ask PRODUCTION which
migrations it has applied; run the same checks CI runs, on `integration`'s exact
tip, in that run rather than trusting an earlier one; merge that exact sha into
`main` with `--no-ff`; push, never forced; and read `main` back to print the new
sha in the job summary.

**Every push to `main` deploys `ideabosco.com`,** which students use during
class. The night window is what that is about, and it is only half the reason
this used to be a button. The other half was migrations: they are applied BY
HAND in the Supabase SQL editor, several must land BEFORE the code that calls
them goes live, and CI cannot see production's catalog -- so a person typed the
assertion instead. `docs/decisions/entries/10-unattended-nightly-deploy.md`
recorded that, said "not yet", and named exactly what would unblock it: a
read-only Postgres credential in a GitHub secret. That is now
`DEPLOY_PROBE_URL`, and `tools/deploy-probe.mjs` reads production's
`pg_catalog` with it.

### What the probe answers, and what it refuses

It derives one catalog probe per migration -- `tools/idea-status.py` already
does that and is the only implementation of it -- and reports **per migration**,
never a count:

| it says | the deploy |
| --- | --- |
| every migration in range is APPLIED | runs |
| one is NOT APPLIED | is refused, on any trigger, whatever anyone typed |
| it has no probe for a migration | is refused; a person may carry it (below) |
| it could not run at all | is refused; a person may carry it (below) |

An unknown is never read as applied. When it refuses for a NOT APPLIED
migration the job summary names each one **and prints its SQL in a copyable
block**, so the whole of what is left for you is paste and run: applying a
migration needs a credential that can WRITE to production, which no workflow and
no cloud session may hold.

### Pressing it by hand, and the typed line

Actions -> **Deploy** -> **Run workflow**. Leave the confirmation field EMPTY
and the probe answers on its own. Type it, exactly:

```
every migration on integration is applied to production
```

only when the probe cannot -- the secret is missing, or a migration has no
probeable object (a tombstone, a data-only fix). That line is what this
repository has always had and it still works with no secret configured at all.
Anything else typed into the field is refused before any check runs. Before
typing it, run `tools/idea-status.py` and paste its probe block into the
Supabase SQL editor.

`vars.DEPLOY_PROBE_SINCE` (a repository variable, not a secret) sets the lowest
migration number the probe asks about; unset takes `tools/idea-status.py`'s own
default. It is the way to move the watermark past a migration with no probeable
object without editing a workflow, and every run prints the window it used and
every row it read.

`integration` is not deleted or reset afterwards. It keeps going; the next
sweep merges `main` back into it, which after a deploy is a fast-forward.

### Setting up the secret (once)

In the Supabase SQL editor, as the project owner:

```sql
create role deploy_probe login password '<a long random password>'
  nosuperuser nocreatedb nocreaterole noinherit;
grant connect on database postgres to deploy_probe;
```

Nothing else. No `usage`, no `select`, no schema grants: every probe reads
`pg_catalog`, which is readable by PUBLIC and is NOT privilege-filtered.
Then add a repository secret named `DEPLOY_PROBE_URL`:

```
postgresql://deploy_probe:<the password>@<project host>:5432/postgres?sslmode=require
```

**This is why no probe may read `information_schema`.** That schema IS
privilege-filtered: a role with no grants sees no rows in it at all, so a probe
built on it answers `false` for a column that exists and the deploy refuses
forever, with nothing on screen saying why. Measured on a throwaway Postgres 16
with exactly the role above: `information_schema.columns` returned **0 rows**
and answered `false` for three columns that were present, while the
`pg_attribute` form answered `true` for all three.

## Is `integration` green?

`integration` gets **no CI run from its own pushes** -- `integrate.yml` pushes
it with `GITHUB_TOKEN` and GitHub's loop-breaker starts no run from that. On
2026-08-29 it went red silently and stopped eight branches.

So `ci.yml` carries a **schedule** and a **workflow_dispatch** that test
`integration` itself. A red scheduled CI run is the signal that `integration` is
broken and nothing will merge until somebody looks. To check it on demand:
Actions -> **CI** -> **Run workflow**, which defaults to `integration` and
accepts any other ref.

### The nightly hour is chosen, and moving it costs detection

**`0 8 * * *` -- 08:00 UTC, which is 01:00 Pacific in summer and 00:00 Pacific
in winter.** It was `30 4` (21:30 and 20:30 Pacific) until 2026-09-05.

GitHub cron is UTC and does not shift with daylight saving, so ONE entry lands
on TWO different local hours across the year, and any hour you pick has that
property. **Both** of these are inside 00:00 to 02:00 Pacific, which is the only
window in which a whole class of defect is visible at all.

`tests/db/classroom-hall-pass-limits.test.ts` is why. Six of its 24 tests failed
only between 00:00 and 02:00 Pacific -- the fixtures backdate up to 120 minutes
and land on the previous Los Angeles calendar day -- and it passed every CI run
for weeks from prompt 0016 onward. It surfaced because a person happened to
re-run a branch at 00:58, not because anything tested for it. A suite that only
ever runs during the working day samples one part of the clock and calls it
coverage.

Two things about the choice, both of which a future tidy-up would undo without
noticing:

- **UTC [08:00, 09:00) is the whole intersection.** Any other hour is inside the
  window for at most half the year. The old `30 4` was inside it for none of it.
- **Detection degrades across the window.** Measured at fixed Pacific instants:
  6 failures at 00:05, 00:30 and 01:00; only **2** at 01:30; **0** at 02:05,
  because only the tests backdating 90 minutes or more still fail late. `0 8` is
  the latest minute at which both local hours sit at or before the last
  full-strength reading. `30 8` would put the summer run at 01:30 and catch two
  of the six -- in the window, and still mostly reporting a pass.

`tests/workflows.test.ts` pins both properties and derives the local hours from
the cron rather than restating them, so this section cannot quietly drift from
the file.

Neither of those STARTS an Integrate sweep: `integrate.yml`'s job-level `if`
requires `github.event.workflow_run.event == 'push'`, so a scheduled or
dispatched CI run does not itself kick off a sweep. Neither does the CI that
`deploy.yml` calls, which runs as a job inside the Deploy run rather than as a
run of its own. Press **Run workflow** on Integrate to sweep on demand.

**Starting a sweep and counting in one are different questions, and they used
to have the same wrong answer.** Once a sweep is running, the per-branch check
counts a branch's newest completed CI run for its exact tip *whatever trigger
started that run*. That check used to filter on `event=push` too, which meant a
branch you had re-run green by hand was invisible to it -- see "Re-running a
red branch's CI" below.

## When something is stuck

Open the **Actions** tab and find the red **Integrate** run. Its job summary has
up to SEVEN sections. The first two are always there -- the first is about
`integration` itself rather than about any branch -- and the last four appear
only when they have something to report:

- **`integration` itself** -- whether it was caught up to `main` (and by how
  many commits), whether it was pushed, whether the static counts region was
  regenerated (with the numbers before and after), and, when something
  conflicted, that the red X is for the conflict and for nothing else. Since
  2026-09-06 it also carries the merged tree's own verdict -- passes, FAILS, or
  could not be run -- in words, on its own line.
- **Merged into `integration` and deleted** -- the branches that landed.
- **The merged tree's failing assertions** -- one line per `FAIL` the suite
  reported on the tree that was just pushed, as `<file> > <suite> > <test>`.
  This section is the point of the whole step: NEITHER PARENT OF A MERGE NEED
  HAVE BEEN RED for something to appear here.
- **Resolved mechanically** -- branches that CONFLICTED and were merged anyway,
  with what was done to each file. See below; nothing here picked a side of
  anybody's writing.
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
where every outstanding branch conflicted, and since 2026-09-06 also on a run
whose merged tree FAILS the suite. The run is still red -- a conflict needs a
person, a red merged tree needs a person, and a green run is one nobody opens --
but the first summary section says in words whether the target itself was
pushed, and `deploy.yml` is not blocked by it. **There are two independent
reasons a run can be red now** (a conflict, and the suite), both are reported,
and neither hides the other. Before the fix that main-merge was computed and thrown away
on such a run, which deadlocked Integrate against Deploy's own
"`integration` is behind `main`" refusal.

### Two files are resolved without you, and only two

Replaying every merge in this repository since 2026-08-30 gives 30 conflicting
paths, and 25 of them are one of two files that have a deterministic answer:

- **`tools/browser-verify/README.md`** -- the conflict is always inside the
  generated `<!-- counts:begin -->`/`<!-- counts:end -->` block. Git's own
  three-way merge resolves the conflicting hunks with `integration`'s side, and
  then `npm run verify:counts` regenerates the static half against the MERGED
  tree, which is the only tree whose answer is right. That is a tree read: no
  browser, no dev server, no network and no `node_modules`. Measured on a
  checkout with none of them, 2026-09-05: 313ms cold, 96-101ms warm.
- **`classroom-updates.json`** -- an append-only list. Two sessions each
  append; the answer is both appends, and every entry from both sides is in the
  result.

### And the counts are regenerated after a merge that did NOT conflict

The resolution above only runs when a merge CONFLICTS on that README. **The
merge that does not conflict is a separate gap and it is the one that has been
costing bundles.** Two branches that each add ONE route spec each regenerate the
static counts region to the same number for their own tree, so git sees an
IDENTICAL edit on both sides, takes it with no conflict at all, and `integration`
ends up claiming 103 route specs over a tree holding 104. The next bundle to
open on `integration` finds `tests/derived-numbers.test.ts` red through no fault
of its own.

So the sweep now runs `npm run verify:counts` ONCE at the end, on the final
merged tree, before the push:

- **Only when the tree moved** -- a branch merge or the `main` catch-up. A run
  that merged nothing regenerates nothing.
- **Only if it changes something.** The static region carries no clock and no
  commit, so regenerating an unchanged tree writes the bytes that were already
  there and nothing is committed. The summary says which of the two happened.
- **Only the static half.** The measured half needs a browser and about six
  minutes, and a sweep that rewrote it would be publishing a measurement it never
  took. The commit names one path, so nothing else can ride along.
- **A failure here never loses a merge.** Everything that merged is pushed
  anyway, the run warns, and the region is left as stale as it would have been
  before -- run `npm run verify:counts` on `integration` and commit the result.

The extra commit starts nothing: GitHub begins no workflow run from a push made
with `GITHUB_TOKEN`, which is the same rule `ci.yml`'s own header records as the
reason `integration` gets no CI run of its own from a push.

`tools/integrate-gate-proof.sh` cases 48-60 prove this against throwaway
repositories, and case 59 is the defect itself reproduced -- the same two clean
merges with the refresh withheld, which must come out stale, so case 51 is a
measurement rather than a hope.

Everything else is still yours, including a conflict in that README's PROSE,
which is somebody's writing and is left conflicted even though the file is on
the list. So is an update log that is not valid JSON, and an entry that was
edited or removed rather than appended. The sweep never takes a whole side of a
file: what git merged cleanly stays merged, and every resolution is named in the
job summary. `tools/integrate-gate-proof.sh` proves this against real conflicted
repositories by cutting the resolver out of `integrate.yml` and running it.

A conflict that reaches you is two bundles genuinely touching the same file.
Resolve it on the branch, never on `integration`:

```
git fetch origin
git checkout claude/<the branch>
git merge origin/integration      # resolve, commit
git push origin claude/<the branch>
```

CI runs again, and the next green run picks it up. You can also press **Run
workflow** on Integrate to retry the sweep immediately.

### The merged tree is tested, and neither parent need have been red

The counts regeneration above repairs ONE generated region. **The shape it
repairs is general, and this is the other half of it.**

**A check that relates two files is defeated by two branches each touching one
of them.** Neither branch's tree holds both edits, so neither branch can be red;
the merge is the first tree on which both exist, and nothing used to look at the
merge. It is not a coincidence when it happens and it is not anybody's mistake.

The measured case, from this repository's own history on 2026-09-05:

| | |
| --- | --- |
| `74be202` 19:48 UTC | added `tools/gauntlet-doc-check.mjs`, which requires every GAUNTLET migration to have a row in `docs/GAUNTLET.md`. Green. |
| `7d848d7` 20:30 UTC | added `0184_gauntlet_run_event_bounds.sql` and touched no document. Green -- the checker does not exist on this tree. |
| merge base | `fdf8c68`. Neither contains the other. |
| `5877f19` 21:28 UTC | the merge. The files are disjoint, so git took both with no conflict. **Red**, four assertions across two test files. |

Every row of that was re-measured in a container on 2026-09-06 rather than
inferred: exit 0 on the first tree, no checker at all on the second, and the
`0184` finding on the merge.

**There are 47 tests under `tests/` with the same property.** A census is in
`docs/history/red-merge-green-parents-ft3e57.md`. The three that need no
cleverness at all to trigger:

- `tests/db/migration-0177-tombstone.test.ts` -> `the migration series is
  contiguous, with 0177 in it`. Two branches each appending the next migration
  number both produce a contiguous chain; the merge has two `0186` and no
  `0187`.
- `tests/derived-numbers.test.ts` -> the counts regions. The case the
  regeneration above already covers, which is why it exists.
- `tests/gauntlet-volume-tolerance.test.ts` -> `all four agree`. One tolerance
  band written down in SQL, TypeScript, a VBA macro and a C# add-in, owned by
  different lanes.

So the sweep now runs `npm ci && npm test` **once, on the final merged tree**:

- **After the push and after the deletes.** `npm ci` plus a three-minute suite
  are the two longest things this job does and the two most able to end it from
  outside -- an out-of-memory kill, a runner eviction, the job cap. Run before
  the push, any of those would discard every merge in the sweep, each of which
  was individually fine. Run after, the merges are on the remote before the
  suite starts and nothing it can do reaches them.
- **A red tree is pushed anyway, and the run goes red.** Throwing away several
  good merges to avoid recording one bad interaction leaves the branches
  outstanding, `integration` behind `main`, and nobody told. A red
  `integration` is information a person needs.
- **The failing assertions are NAMED in the job summary**, by file, suite and
  test. Four bundles have now each spent part of an audit establishing that a
  red `integration` was inherited rather than theirs. That is what this ends.
- **The whole suite, not a subset.** A subset would have to be a list; the list
  would be the same kind of two-file agreement it is meant to police; and it
  would let through every merge-only failure that is not a listed check -- two
  branches editing one function's callers, a rename against a new call site.
- **`unrun` is a third verdict, not a kind of red.** An install that fails or a
  runner that dies naming no test is not a test failure, and reporting it as one
  sends somebody to read a diff that has nothing wrong with it. It still makes
  the run red and it still never blocks the push.

**The cost.** Measured on the GitHub runner that found `5877f19`: 174.50s for
287 files and 5,821 tests. `npm ci` was 15s in a cloud container. Against a
window this was reconstructed at in HOURS, roughly four minutes on a serialized
job is not the expensive side.

**The nightly CI run on `integration` does not become redundant, and its hour
does not move.** The sweep samples whatever hour a session finishes at, which is
the working day -- exactly the part of the clock "The nightly hour is chosen"
above says is NOT coverage. The nightly is the only thing sampling 00:00-02:00
Pacific, where a whole class of wall-clock defect is visible. It also catches
the run where the sweep's own suite step could not run.

`tools/integrate-gate-proof.sh` cases 61-75 prove this against throwaway
repositories with a stub `npm` on PATH whose `test` runs a real checker over the
fixture tree -- so cases 66 and 67, which observe that each PARENT is green,
are measurements rather than stipulations. `tests/workflows.test.ts` guards the
step against silent removal, with a positive control that mutates the real file
one edit at a time.

### Re-running a red branch's CI

If a branch went red for a reason that has since been fixed elsewhere, you can
re-run its CI by hand -- Actions -> **CI** -> **Run workflow**, pointed at the
branch -- and the next Integrate sweep will see the green run and merge it.

**This did not work before 2026-09-05 and failed silently.** The per-branch
check asked the Actions API only for runs a PUSH had started, so a run you
started by hand did not come back at all: the branch read as `CI on abc1234 is
unknown` -- not `failure` -- and was skipped. On 2026-09-04 three finished
branches sat in exactly that state, nothing merged, the sweep discarded its
push, the deploy stayed blocked, and a person merged all three by pull request
instead. The filter is gone. What still holds is the part that matters: the
green run has to be for **that exact commit**, so a branch that was green two
commits ago is still not green, and if a hand re-run comes back RED after an
earlier green one, the branch is red -- the sweep takes the newest run for the
sha, not the most flattering one.

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
  GitHub's own loop-breaker for `GITHUB_TOKEN`, and it holds for every commit
  the sweep makes, the counts regeneration included: `integration` gets no CI
  run from its own pushes. Every commit on it was green on its source branch,
  and the MERGE RESULT is checked by the nightly schedule in `ci.yml` rather
  than by the push -- see "Is `integration` green?". Vercel is unaffected: it
  deploys through a GitHub App webhook, not through Actions, so `integration`
  still gets a preview build.
