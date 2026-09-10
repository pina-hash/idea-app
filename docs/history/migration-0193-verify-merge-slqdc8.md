---
title: "Hand-applied `0193` verified from production by hand, the 19-commit `integration` range onto `main`, and a third gate 4 substitution that generalises to neither of the other two (`claude/migration-0193-verify-merge-slqdc8`, no migration authored)"
date: 2026-09-10
branches: [claude/migration-0193-verify-merge-slqdc8]
migrations: []
subsystems: ["Tooling", "Deployment", "Migrations"]
---

Prompt 0125. A landing bundle: it verifies that Mr. Pina's hand-applied `0193`
is the only migration in the range, merges `integration` into `main`, reconciles
`main` back into `integration`, and reads the resulting deploy off production.
It owns no source file and changed none. Started from `origin/main` at
`02ede0f3` in `/home/user/idea-app`, on branch
`claude/migration-0193-verify-merge-slqdc8`.

**THE DUPLICATE CHECK RAN FIRST AND CAME BACK CLEAN.** No
`docs/prompt-ledger/entries/0125-*` existed on `origin/main` or on
`origin/integration`, and a sweep of all 36 `refs/remotes/origin/claude/**`
refs for a `0125-` ledger file found nothing. A landing bundle that has already
run once and is run again would otherwise merge a range somebody else has
already merged, or write a second ledger entry under a number already spent.

**THE CONTAINER WAS ALREADY UNSHALLOW.** `git fetch --unshallow origin`
returned nothing to do and `git rev-parse --is-shallow-repository` answered
`false`. Git identity was ALREADY configured -- `user.name` `Claude`,
`user.email` `noreply@anthropic.com` -- and was not touched. All three of the
prompt's opening checks are reported because a version in this repo is a COMMIT
COUNT, which slides backwards over a shallow clone, and because
`tools/deploy-probe.mjs`'s `migrationsOnlyOn` asks git to list
`supabase/migrations` on two refs at once, which a one-commit clone cannot
answer honestly in either direction.

**THE MEASURED STATE IN THE PROMPT MATCHED THE TREE EXACTLY, AND THE TREE IS
WHAT WAS ACTED ON.** `origin/main` `02ede0f336f2d9c4852d9782a37db9162958600a`,
`origin/integration` `fd8e136ee300aacaa87036381064e5d76e8b14eb`,
`git rev-list --left-right --count origin/main...origin/integration` `0 19` --
so `main` was already an ancestor of `integration` and step 1's reconciling
merge had nothing to do on the first pass. Three ledger entries new on
`integration`: `0118-classroom-class-surfaces.md`,
`0123-merge-integration-and-confirm-deploy.md`,
`0124-frc-queue-accessibility-audit.md`. All three read `- Status: pushed`.

**THE MIGRATION CHECK, WHICH IS THE RULE THAT OVERRIDES EVERYTHING.**
`git diff --name-only origin/main...origin/integration -- supabase/migrations/`
printed exactly one path:
`supabase/migrations/0193_classroom_resource_layout.sql`. That is the file Mr.
Pina applied by hand before this bundle was issued, which is the whole reason
the migration stop does not fire -- for `0193` and for nothing else. Prompt 0120
claims `0194` and could have landed mid-flight; it had not, and the check was
re-run before the merge rather than trusted from the start of the session.

**GATE 4 SUBSTITUTION, AND THERE ARE NOW THREE ON RECORD FOR THREE DIFFERENT
REASONS, NONE OF WHICH GENERALISES TO ANOTHER.** This is the part worth reading
twice, because a substitution reused for the wrong reason is how a gate stops
being a gate.

  * **Ledger 0114's** rests on an EMPTY migration range. There is nothing for
    gate 4 to prove, so proving nothing is the correct answer.
  * **Ledger 0115's** rests on hand-applied `0192`.
  * **THIS ONE** rests on hand-applied `0193` PLUS an eight-value verification
    block Mr. Pina ran in the Supabase SQL editor against production
    immediately after applying it, every value matching the expected set in
    `0193`'s own header:

        columns_expect_2                          2
        checks_expect_2                           2
        functions_expect_7                        7
        anon_closed_expect_true                   true
        authenticated_open_expect_true            true
        duplicate_carries_placement_expect_true   true
        moved_rows_expect_0_on_first_apply        0
        sanitizer_expect                          Bridge-lab-final-v2-.png

**I VERIFIED NONE OF THOSE EIGHT VALUES MYSELF, AND NO SESSION IN THIS
CONTAINER CAN.** The local `.env` is a placeholder Supabase project
(`example-ref`); nothing here can apply a migration, run an RPC or read a row
from production. `node tools/deploy-probe.mjs` was run anyway and its output is
verbatim:

    deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set cannot be read. This is "cannot confirm", never "applied".

exit code 1. **That exit 1 was not treated as a stop**, and the reason is
narrow: the probe's own rule -- `CANNOT SAY` is never a pass -- is about what
the PROBE may conclude, and it concluded nothing. What let this bundle proceed
is not the probe's silence but Mr. Pina's reading, which came from production
through the person who ran it and is the only channel available to a session
that cannot reach the database. **The distinction matters because the failure
mode is symmetric-looking:** a probe that cannot say and a probe that says no
print differently, and only the first one is survivable. If `DEPLOY_PROBE_URL`
is ever set in this container, the probe becomes the evidence and this
substitution stops applying.

**WHAT I COULD CHECK ABOUT THAT BLOCK, WHICH IS ITS SHAPE AND NOT ITS TRUTH.**
The eight labels Mr. Pina reported are the eight column aliases in `0193`'s own
header query, read out of `supabase/migrations/0193_classroom_resource_layout.sql`
at `origin/integration` -- `columns_expect_2`, `checks_expect_2`,
`functions_expect_7`, `anon_closed_expect_true`,
`authenticated_open_expect_true`, `duplicate_carries_placement_expect_true`,
`moved_rows_expect_0_on_first_apply`, and the last one aliased in the file as
`sanitizer_expect_Bridge_lab_final_v2_png`. The alias ENCODES the expected
value, so the reported `Bridge-lab-final-v2-.png` is checkable against the file
even though it is not checkable against the database. **That is corroboration of
provenance, not of application:** it establishes the block came from running
`0193`'s header query rather than from anywhere else, and says nothing whatever
about which database answered it. The application itself remains Mr. Pina's
reading alone, and this entry does not dress it up as anything more.

**CONFLICT POLICY, AND IT COST NOTHING THIS TIME.**
`git merge-tree --write-tree --messages origin/main origin/integration` wrote a
tree and emitted no conflict message at all, so neither of the two files the
prompt permits resolving in -- the counts block of
`tools/browser-verify/README.md` and `classroom-updates.json` -- came up. The
`classroom-updates.json` path was confirmed on disk anyway, because ledger 0123
found every prior prompt naming it under `static/`: at the repo root it exists,
and `static/classroom-updates.json` does not. A permitted resolution against a
file that is not there is not a resolution, it is an invention.

**THE PRODUCTION BASELINE WAS READ BEFORE THE MERGE, NOT ONLY AFTER.**
`https://ideabosco.com/assignments/IDEA-Blade_Rulebook_v2_2` stamped
`v1.14 · 02ede0f · Sep 10, 2026` -- `02ede0f` being `main`'s tip at the start of
this bundle, and a REAL DATE rather than `local build`. Taking the reading
first is what makes the reading after the merge mean anything: a stamp that
already named the sha you are about to push would prove nothing, and a stamp
still showing the old sha ten minutes later is only distinguishable from a slow
deploy if you know what the old one was.

**CI ON `integration`'s TIP CAME BACK RED, AND THAT ENDED THE BUNDLE.** Run
[34430280567](https://github.com/pina-hash/idea-app/actions/runs/34430280567),
dispatched by `workflow_dispatch` with the FULL forty-character sha
`fd8e136ee300aacaa87036381064e5d76e8b14eb`. The checkout step took SEVEN
SECONDS and the job ran four and a half minutes, so this is not the short-sha
failure mode the prompt warns about, where `actions/checkout` dies and the
later `if: always()` steps report success against an empty workspace.

**THE FOUR `outcome` VALUES, READ FROM THE AGGREGATOR STEP'S OWN LOG rather
than from the rolled-up conclusions**, which is the distinction `continue-on-error: true`
makes and which the steps API actively hides -- every one of the four steps
reports `conclusion: success` there, including the one that failed:

    ref tested:         fd8e136ee300aacaa87036381064e5d76e8b14eb (HEAD)
    check:              success
    test:               failure
    vanguard-changelog: success
    history-verify:     success

`Test Files 1 failed | 354 passed (355)`, `Tests 5 failed | 6997 passed (7002)`.
All five failures are in `tests/derived-numbers.test.ts`, under
`tools/browser-verify/README.md counts regions`.

**IT IS A MERGE-RESULT DEFECT, WHICH IS THE EXACT FAILURE `ci.yml`'s OWN HEADER
PREDICTS, AND BOTH PARENTS WERE GREEN.** The measured counts region of
`tools/browser-verify/README.md` is generated by a full browser run and records
`covered`, the route specs that run actually visited. Two lanes in this range
each regenerated it from their own pass:

  * lane 0118 (classroom class surfaces) at `4274433b`, measured on `8cf256a3`,
    a region that DOES cover the eleven route specs that lane added;
  * lane 0124 (FRC queue accessibility) at `c62f5e76`, measured on `edf397f8`,
    which PREDATES those eleven specs and does not cover them.

The final merge, `fd8e136e`, resolved the file to the FRC lane's region --
`"sha":"edf397f8..."` is what sits at the tip -- **silently discarding lane
0118's correct measurement**. `git merge-tree` reports NO CONFLICT for any of
this: git auto-resolved it and simply picked the side that was wrong for the
merged tree. So the tree now carries eleven specs the measured region never
visited while that region claims `Measurements outside threshold: 0`, and
`npm test` refuses exactly that pair, by design:

    classroom-inspector-case-assignment-layout-0.mjs
    classroom-inspector-case-assignment-layout-1.mjs
    classroom-inspector-case-assignment-placement-top.mjs
    classroom-split-s-1-manage-1-state-selected.mjs
    classroom-split-s-1-manage-1-state-units.mjs
    classroom-tools-live-stalled.mjs
    classroom-tools-open-hall-pass-scope-manager.mjs
    classroom-tools-open-hall-pass.mjs
    classroom-tools-open-song-queue.mjs
    classroom-tools.mjs
    classroom-upload.mjs

**AND THERE IS NO CORRECT REGION SITTING IN GIT TO RESTORE, WHICH IS THE FINDING
THAT DECIDES WHAT HAPPENS NEXT.** The obvious repair -- put lane 0118's region
back, since it is a real measurement that covers the eleven -- was checked
against the merged tree and DOES NOT WORK: `4274433b`'s region covers 169 specs
and the merged tree has 177, missing six real ones that arrived from the other
side (`portal-admin.mjs`, `portal-admin-owner-1.mjs`,
`portal-admin-used-roster-admins.mjs`, `profile-menu-state-open.mjs`,
`themes-state-matrix-room-classroom.mjs`,
`themes-state-matrix-room-foundry.mjs`; the two `_shared` helpers in the diff
are not route specs). **Neither side's measurement covers the merged tree**,
because neither tree ever existed when either run was taken. The only honest
fix is a fresh full run of `tools/browser-verify/run.mjs` on the merged tree --
a browser and about six minutes -- and the artefact it writes is a
MEASUREMENT, which belongs to whoever runs it.

**SO NOTHING WAS MERGED AND NOTHING WAS DEPLOYED.** The loop's step 2 requires
green before step 4's merge, and green is not what came back. A push to `main`
is a deploy to `ideabosco.com`, so merging a range whose own suite refuses it
is the one move that cannot be taken back cheaply.

**WHY THIS BUNDLE DID NOT FIX IT ITSELF**, since the file is named in the
prompt's own conflict policy and the temptation is real. Two independent
reasons, either sufficient:

  1. **The policy covers a CONFLICT, and there was none.** It permits resolving
     the counts block of `tools/browser-verify/README.md` hunk by hunk when git
     stops and asks. Git did not stop and did not ask -- it merged cleanly and
     chose wrongly. Editing a cleanly-merged file is authoring, not resolving,
     and this bundle owns no source file.
  2. **There is nothing to resolve TO.** Even with the licence, both candidate
     regions are wrong for the merged tree, as measured above. The repair is a
     new measurement, not a choice between two existing ones.

**WHAT WOULD ACTUALLY CLEAR IT**, recorded so the next bundle does not
re-derive it: run `npm run verify:browser` (a full
`tools/browser-verify/run.mjs` pass) on `integration`'s tip, regenerate the
measured region with `npm run verify:readme`, commit that to `integration`, and
re-dispatch CI on the new tip. It is one commit to one file and it needs the
browser this container has. It is a bundle with a source file in it, which is
what this one is not.

**WHAT WAS NOT VERIFIED.** The eight production values, as set out above --
`node tools/deploy-probe.mjs` cannot read them here and no session in this
container can. Beyond that: nothing about the deploy, because there was no
deploy; and no browser pass was run, so the measured region's numbers are
reported as read from git and not re-measured. The production baseline
(`v1.14 · 02ede0f · Sep 10, 2026`) is a real reading and is unchanged by this
bundle, because `main` did not move.
