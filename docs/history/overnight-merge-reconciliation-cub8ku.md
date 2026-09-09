---
title: "The overnight landing: `integration` and `main` brought level in both directions with no migration in the range, and gate 4 of `IDEA_instructions.md` 4.20 deliberately substituted (`claude/overnight-merge-reconciliation-cub8ku`, no migration)"
date: 2026-09-09
branches: [claude/overnight-merge-reconciliation-cub8ku]
migrations: []
subsystems: ["Operations", "Deploy"]
---

An unattended operations bundle. Mr. Pina was asleep and had authorised the
merge and the deploy in advance; nobody could answer a question, so the prompt's
own instruction was that a STOP is a success and a clever recovery is not. It
owned the merge of `integration` into `main`, the reconciling merge back,
`docs/prompt-ledger/entries/0114-*` and this entry, and it owned NO source file.

At the start `origin/main` was `917d976f` and `origin/integration` was
`a3f26f1d` -- one commit past the `6b62987d` the prompt had measured, because
prompt 0109's docs lane landed in between. 21 commits sat on `integration` and
none on `main`, so gate 1 was already satisfied and the reconciling merge the
prompt anticipated was not needed at the top of the loop.

### The migration rule never fired, and that is the finding rather than a formality

`git diff --name-only origin/main...origin/integration -- supabase/migrations/`
came back EMPTY at every reading, before and after the merge. The prompt
expected it to become non-empty overnight, because prompt 0110 (tournaments) is
permitted migration 0192 and was running. It did not: at the time of the merge
all four live lanes -- 0108 loading, 0110 tournaments, 0111 feedback, 0112 maps
-- had pushed **only their `issued` ledger commit** and no source work at all.
0192 does not exist yet. So the range that landed carries no schema dependency,
which is the whole reason the landing was allowed to proceed unattended.

### Gate 4 was substituted, deliberately, and this is the record of it

`node tools/deploy-probe.mjs --ref origin/integration` cannot pass in the
overnight container. `DEPLOY_PROBE_URL` is unset, and the probe fails closed.
Run anyway, verbatim:

```
deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set cannot
be read. This is "cannot confirm", never "applied".
```

exit 1. That gate exists to prove every migration in the range is applied to
production. The migration check above already establishes the range contains no
migration, so there was nothing for it to prove, and its failure was not treated
as a stop. **This is a deviation from `IDEA_instructions.md` 4.20's six-gate
checklist and is recorded here by name so the next operations bundle knows it
was deliberate rather than overlooked.** The substitution is conditional and
narrow: it holds only while the migration check is empty. Had that check printed
a single file, the stop rule would have fired first and the substitution would
never have applied. A future bundle facing a non-empty range does not get to
reuse this paragraph.

### What was measured

**CI was run on the exact tip, not inherited from a branch's run.**
`integration` gets no push-triggered run of its own -- `ci.yml`'s own header
explains why, and GitHub's loop-breaker is the mechanism -- so the run was
dispatched through `workflow_dispatch` with `ref` pinned to the full sha
`a3f26f1d6281c609d3a17b3844a0ae797fcd10dc`. Run 34344181802 concluded
**success** in 5m08s. The tip had not moved when the merge was taken, which was
re-checked against that sha rather than assumed.

**The merge was proven clean before it was made and after.**
`git merge-tree --write-tree origin/main origin/integration` answered tree
`7e197fc6628ffd89d74a2782d7963d601b4641be` with zero conflicts, and the merge
commit's own tree hashed to the same value. The range touched
`tools/browser-verify/README.md`, one of the two files the prompt named as
conflict-prone, but `main` had not touched it, so nothing conflicted and neither
permitted resolution was exercised. `static/classroom-updates.json` was not in
the range at all.

**Every ledger entry newly on `integration` was read**: 0104 `deployed`, 0106,
0109 and 0113 all `pushed`. None read `issued`, which would have meant a session
still running and a stop.

**The deploy was confirmed by reading production, never by the push output.**
The stamp instrument is the rulebook footer at
`/assignments/IDEA-Blade_Rulebook_v2_2`, of the shape
`Assignments v1.12 · <sha> · <date>`. It read
`Assignments v1.12 · 917d976 · Sep 9, 2026` before the push -- exactly
`origin/main`'s tip, which is what establishes the instrument works and was
caught up rather than merely plausible. Two minutes after the push it read
`Assignments v1.12 · 5e7b44f · local build`, the pushed sha, and held
that on a re-read; `https://ideabosco.com/` answered 200.

**One observable changed across the deploy and is NOT explained by this
bundle's own change**, so it is recorded rather than fixed: the third field went
from a real date to `local build`. That is
`src/lib/site-versions.ts:203`'s fallback, `deploy.date || 'local build'`, so
`deploy.date` came out empty on this build while `deploy.sha` resolved
correctly. The landing itself is confirmed by the sha, which is the field the
gate turns on. Nothing here owned `site-versions.ts` or the Vercel environment
(`VERCEL_DEEP_CLONE` is the variable that governs whether the build gets a
complete history to read), and an unattended bundle guessing at build metadata
is exactly the improvisation this prompt forbade. It is left for a waking
session to judge whether it is transient.

### It landed TWICE, because the loop is the point

The bundle is a loop, not a single merge, and the second pass is what shows why.
After the first landing the bundle's own branch was swept into `integration` by
`integrate.yml` and deleted -- which is the correct, documented outcome and not a
leftover -- putting `integration` five commits ahead again. CI was dispatched on
that tip (`ef8e3df5`) and went green, **and by the time the gates were re-read
the tip had already moved**: prompt 0108's loading lane had landed underneath it,
making `integration` `eecb6880`. The green run was therefore stale, and the rule
that saves this is the prompt's own -- wait for CI on the CURRENT tip, never an
older run. CI was re-dispatched on `eecb6880`, went green (run 34346541626), the
tip was confirmed to have HELD this time, and only then was the merge taken.

So `main` went `917d976f` -> `5e7b44f1` -> `1e258835`, each one gated
independently and each one confirmed against production:
`Assignments v1.12 · 5e7b44f · local build`, then
`Assignments v1.13 · 1e25883 · local build`. Both reconciling merges back onto
`integration` fast-forwarded, so neither permitted conflict resolution was
exercised in either direction, and `static/classroom-updates.json` was never in
a range at all.

**Gate 5 refused the third pass, which is the gate working rather than an
obstacle.** At the last reading prompts 0110 (tournaments), 0111 (feedback) and
0112 (maps) all still read `Status: issued` -- 0111 and 0112 with real work
pushed and 0112 with its history entry already written. An `issued` entry means
a session is still running, so none of the three was landable, and
`integrate.yml` will not sweep them either. Nothing was hurried on their behalf.

### The stop rule fired on the fourth pass, which is how this bundle was meant to end

The loop ran four full passes and landed eight prompts' worth of work --
0104, 0106, 0109 and 0113, then 0108, then 0112 and this bundle's own records,
then 0111 -- taking `main` `917d976f` -> `5e7b44f1` -> `1e258835` -> `999e0612`
-> `09433a98`, each merge behind its own independently re-read gates and each
confirmed against the production stamp rather than against a push.

At 13:22 UTC prompt 0110 set its ledger to `pushed`, `integrate.yml` swept
`claude/tournaments-surface-scroll-yqplco` into `integration` and deleted it,
and

```
git diff --name-only origin/main...origin/integration -- supabase/migrations/
```

printed a file for the first time all night:
`supabase/migrations/0192_tournament_entry_members_and_admin_hosts.sql`, claimed
by `docs/prompt-ledger/entries/0110-tournaments-surface.md` under
`Migration permitted: exactly one. Claims: 0192.` **`main` was not advanced past
`09433a98`, and nothing was cherry-picked around the migration.** That is the
prompt's own instruction and the reason for it is not procedural: this container
cannot reach the production database, Mr. Pina applies migrations by hand in the
Supabase SQL editor, and `main` deploys `ideabosco.com` -- so landing 0110's
tournaments work would put application code in front of students against a
schema that does not exist yet.

**A numbering fact the hand-apply needs, found while checking this:** 0190 and
0191 do not exist on any ref in the repository. Prompt 0099 claimed both and
wrote neither, so `main`'s highest migration is 0189 and 0192 follows it
directly. The gap is in the ledger, not in the chain.

### An instrument error worth writing down, because it nearly produced a false finding

Mid-run the session concluded the CI test suite had been executing for 17, then
30, then 38 minutes against a 4m39s norm, and began diagnosing `integration` as
broken -- it had already picked out `tests/classroom-grading-across-sections-parallel.test.ts`,
new in the range and with "parallel" in its name, as the hang candidate. **All of
it was wrong.** The session was starting background sleeps and then polling
before they elapsed, so wall-clock time had barely advanced; only about four
minutes had actually passed and the run was exactly on schedule. `date -u` was
what settled it, and nothing else would have.

The lesson generalises past this bundle: **elapsed time in an agent session is
not a quantity to reason about, it is one to read off a clock.** A poll loop that
does not block gives no information about duration, and the failure is silent and
plausible -- a slow-looking job is precisely what a broken one looks like, and
the diagnosis that follows is confident and unfalsifiable. Read `date -u`, or
subtract the API's own `started_at` from it; never accumulate an estimate across
tool calls.

The hedge that error triggered is also worth recording as a limit: a local
reproduction was attempted in a worktree under the session scratchpad, and
`npm test` died immediately on
`spawn .../node_modules/@embedded-postgres/linux-x64/native/bin/initdb EACCES`.
**The scratchpad is mounted noexec, so the embedded-Postgres suite cannot run
from it** -- a local suite run in this container has to live on the repo's own
filesystem. That says nothing about the tree; the worktree was removed and no
merge or push was affected.

### Not verified

The production database, which this container cannot reach at all -- hence the
gate 4 substitution. No signed-in surface, no browser pass, and no local test
suite: `npm test` was never run here for the reason above, and CI on the exact
sha is the whole of the evidence that the landed tree is green.

### Left standing

Roughly thirty `claude/**` branches are fully contained in `integration` yet
still present on the remote, several of them days old. `integrate.yml` is
supposed to delete a green, finished branch whose commits are already reachable,
so their survival means something else is true of them -- most likely a red or
absent CI run. This bundle did not touch them: deleting a branch is not in its
ownership, and the prompt was explicit that it shepherds `integration` to `main`
and nothing else.
