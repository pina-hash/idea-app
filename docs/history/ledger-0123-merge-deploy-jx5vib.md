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

