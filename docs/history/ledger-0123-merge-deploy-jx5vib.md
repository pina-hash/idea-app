---
title: "The 0117 portal lane onto `main`, and the build stamp's date read back from a merge-commit deploy (`claude/ledger-0123-merge-deploy-jx5vib`, no migration)"
date: 2026-09-10
branches: [claude/ledger-0123-merge-deploy-jx5vib]
migrations: []
subsystems: ["Tooling", "Deployment", "Migrations"]
---

Prompt 0123. A landing bundle: it merges `integration` into `main`, reconciles
`main` back into `integration`, and reads the resulting deploy off production.
It owns no source file and changed none. Started from `origin/main` at
`131aeec2` in `/home/user/idea-app`, on branch
`claude/ledger-0123-merge-deploy-jx5vib`.

**THE DUPLICATE CHECK RAN FIRST AND CAME BACK CLEAN.** No
`docs/prompt-ledger/entries/0123-*` existed on `origin/main` or on
`origin/integration` -- both carried `0121-build-stamp-and-blade-exports.md` as
their newest entry -- and a sweep of every `refs/remotes/origin/claude/**` ref
for a `0123-` ledger file found nothing. A landing bundle that has already run
once and is being run again would otherwise merge a range somebody else has
already merged.

**THE CONTAINER STARTED SHALLOW.** `git fetch --unshallow origin` succeeded and
`git rev-parse --is-shallow-repository` then answered `false`. This matters more
here than it looks: a version in this repo is a COMMIT COUNT, so over a shallow
clone it slides backwards, and `tests/apply-migration-*.test.ts` reach
`migrationsOnlyOn` in `tools/deploy-probe.mjs`, which asks git to list
`supabase/migrations` on both `origin/main` and a second ref. Neither question
has an honest answer in a one-commit clone. Git identity was ALREADY configured
(`Claude <noreply@anthropic.com>`) and was not touched.

**THE MIGRATION CHECK IS THE STOP RULE AND IT WAS EMPTY.**
`git diff --name-only origin/main...origin/integration -- supabase/migrations/`
printed nothing at `21b0801d`. Four lanes were live beside this one and two of
them carry migrations -- 0118 on `src/lib/classroom/**` claiming 0193 and 0120
on `src/lib/gauntlet/**` claiming 0194 -- and both stop at their own branches
for exactly that reason, so neither raced this bundle to `main`. The check is
re-run before every merge in the loop rather than once at the start, because
`integrate.yml` can sweep a branch into `integration` at any moment. A migration
reaching `main` here would deploy code against a schema production does not
have, and this container cannot apply one.

**GATE 4 AND THE SUBSTITUTION, RECORDED BY NAME.** `node tools/deploy-probe.mjs`
answered, verbatim:

    deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set
    cannot be read. This is "cannot confirm", never "applied".

exit 1. That is the probe working: it fails closed, and `CANNOT SAY` is never a
pass. **Ledger 0114's gate 4 substitution was applied, reused by name rather
than invented here**: the gate exists to prove every migration in the range is
applied, the migration check above establishes the range holds none, so there is
nothing for the gate to prove. Its failure was not treated as a stop while that
check came back empty. **Ledger 0117 stopped at this same gate**, on a prompt
whose `Lands on:` line said that neither substitution on record generalised to
it; that is why 0117's work was still sitting on `integration` for this bundle
to land, and why prompt 0123 states explicitly that the substitution does apply.
The conditional in it is load-bearing and was checked rather than assumed: if
the migration check ever comes back non-empty, the stop rule fires first and the
substitution never applies.

**THE RANGE WAS ONE LANE.** `main` was already an ancestor of `integration`, so
step 1's reconciling merge was a no-op on the first pass. `integration` carried
eight commits and 34 files ahead of `main`, all of them prompt 0117's
portal-shell lane (`claude/portal-dashboard-theme-vycnkh`, swept in and deleted
by `integrate.yml`): the home page's section order, one full-width admin
console, the profile panel on the design system, Matrix rain in three rooms,
their tests and route specs, `tools/browser-verify/README.md`'s counts regions,
and `classroom-updates.json`. Its ledger read `Status: pushed`.
`git merge-tree --write-tree origin/main origin/integration` returned a single
tree oid with exit 0 and no conflict lines, so **the two-file conflict policy
was never exercised** -- neither the counts block of
`tools/browser-verify/README.md` nor `classroom-updates.json` conflicted, and
nothing outside those two would have been permitted to.

**THE BUILD STAMP'S DATE WAS ALREADY FIXED, AND THE BASELINE READ IS WHAT SAYS
SO.** Production was fetched at `/assignments/IDEA-Blade_Rulebook_v2_2` BEFORE
the merge, which was not asked for and turned out to carry the answer:

    Assignments v1.14 · 131aeec · Sep 9, 2026

`131aeec2` has two parents (`b03a9410`, `53e660bf`) and is therefore itself a
merge commit, and it carries prompt 0121's `a3d114c7`, "Give the build stamp its
date back on a merged deploy". So the first merge-commit deploy after that fix
had ALREADY happened and had ALREADY rendered a real date where 0116 measured
`local build` thirty seconds apart on 2026-09-09. This bundle's own merge is the
SECOND reading rather than the first. Taking the baseline cost one request and
turned a claim this bundle would otherwise have had to make on one data point
into a claim on two.


**CI WAS DISPATCHED ON THE FULL FORTY-CHARACTER SHA, AND THE VERDICT WAS READ
OFF THE AGGREGATOR RATHER THAN OFF THE ROLLED-UP CONCLUSION.** Run
`34427266362`, `workflow_dispatch` with `ref` set to
`21b0801d9babfc66f606a81163948d2185fd6ae1`. Both halves of that sentence are
guards against a specific way this check reports success over nothing: a SHORT
sha makes `actions/checkout` fail, and because every later step is
`if: always()`, they run against an EMPTY workspace and report success, in a run
that finishes in under a minute. And `ci.yml` marks its four real steps
`continue-on-error: true`, which rewrites each one's `conclusion` to `success`
and leaves the truth in `outcome`, so the job-level conclusion is not the
verdict. The aggregator step prints the four outcomes:

    ref tested:         21b0801d9babfc66f606a81163948d2185fd6ae1 (HEAD)
    check:              success
    test:               success
    vanguard-changelog: success
    history-verify:     success

The workspace was real rather than empty, which is checkable from the timings
rather than assumed: checkout took 7s, the type and a11y check 29s, the suite
3m25s (01:54:20 to 01:57:45), and `history:verify` reassembled 168 entries and
2252747 bytes to a matching sha256. A run against an empty checkout has none of
those.

**WAITING WAS DONE AGAINST THE CLOCK, NOT AGAINST ARITHMETIC.** Ledger 0114
recorded a session diagnosing a healthy job as hung by polling before its own
timer had elapsed and reading its own estimate rather than the time; this
session started to do the same thing and caught it -- three polls in, the
container clock said 01:54:59 against a suite that had started at 01:54:20, so
39 seconds had passed where the poll count suggested several minutes. The fix
was to stop timing and start blocking on the condition itself: an until-loop on
the run's own `status` field, and afterwards a second one on production's own
stamp. Both halves of the report below are a read of the thing being claimed
rather than a read of how long it had been since something was sent.

**THE MERGE.** `main` `131aeec2` + `integration` `21b0801d` -> `02ede0f3`, with
`--no-ff` so the lane reverts as one commit; two parents confirmed on the
result, and the migration diff re-checked as empty against the merge itself
before pushing. Then the reconciling merge in the other direction:
`integration` `21b0801d` + `main` `02ede0f3` -> `da06d32e`, pushed, which puts
`integration` back to a superset of `main` so the next lane's `merge-tree`
starts clean. Neither merge conflicted, so no file was resolved and the
permitted-conflict list stayed unexercised. Nothing was force-pushed and no
source file was touched by this bundle.

**THE DEPLOY WAS CONFIRMED BY READING PRODUCTION, ON A LOOP AGAINST THE STAMP
ITSELF.** Push output says what was sent, not what is serving, and the gap
between the two is a Vercel build. Polled at 30s from the push, the stamp at
`/assignments/IDEA-Blade_Rulebook_v2_2` read `131aeec` twice and then:

    Assignments v1.14 · 02ede0f · Sep 10, 2026

`02ede0f` is the sha that was pushed, so the deploy is the merge and not
something earlier. **The date field renders a real date, `Sep 10, 2026`, and not
`local build`** -- which is the second confirmation of prompt 0121's fix and the
first taken deliberately rather than found. `02ede0f3` has two parents, so this
is genuinely the merge-commit case `deriveDeploy` used to fail on: before
`a3d114c7` its corroboration ran over a build-time `git log --no-merges`, which
by construction cannot contain the commit a merge-built deployment is built
from, so it found nothing to corroborate and withheld the date.

**THE VERSION NUMBER DID NOT MOVE AND THAT IS CORRECT, NOT A SECOND DEFECT.**
`v1.14` before the merge and `v1.14` after it. A version here is a COMMIT COUNT
taken over `--no-merges`, so a merge commit adds nothing to it by design; the
34 files of prompt 0117's lane arrived as commits that had already been counted
on their own branch. A reader expecting the number to tick with every deploy
would read this as the stamp being stuck.

**THE SECOND PASS OF THE LOOP LANDED NOTHING, BECAUSE THERE WAS NOTHING.** On
re-fetch, `main` was `02ede0f3` and `integration` `da06d32e`, ahead by exactly
one commit -- the reconciling merge this bundle had just pushed, which carries
no content of its own. `git diff origin/main origin/integration` was empty and
both refs resolved to the SAME tree, `58b0eae6`, which is also the exact tree
`git merge-tree --write-tree` had predicted before the first merge. No lane was
swept into `integration` during the roughly seven minutes this bundle held the
window, and the migration diff was still empty at the second reading. So the
loop ended having merged once in each direction.

**NOT VERIFIED, AND SAID PLAINLY.** The applied state of production's schema was
not read: `DEPLOY_PROBE_URL` is unset here and no instrument in this container
can reach the live database, which is exactly why the gate 4 substitution had to
be invoked rather than satisfied. Nothing was signed in to on production -- the
stamp is served to an anonymous reader on a public assignment page, which is the
whole reason it is the instrument for this check -- so no signed-in surface of
prompt 0117's lane (the admin console, the profile panel, the dashboard) was
looked at after the deploy. `npm run verify:browser` was not run: this bundle
changed no source file, and `node_modules` is absent in this container.

**ONE INCIDENTAL FINDING, REPORTED AND NOT ACTED ON.** The prompt's
permitted-conflict list named `static/classroom-updates.json`; the file is at the
REPOSITORY ROOT, `classroom-updates.json`, and `static/classroom-updates.json`
does not exist. It made no difference here -- neither merge conflicted, so the
list was never consulted -- but a future landing bundle resolving a conflict by
that path would be looking for a file that is not there. `CLAUDE.md` gives the
root path correctly.
