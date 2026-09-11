---
title: "A landing lane that did not land: `0201` arrived on `integration` forty seconds after the range was read, and an unapplied migration in the range is a stop rather than a judgement call (`claude/determined-planck-ifkqxn`)"
date: 2026-09-11
branches: [claude/determined-planck-ifkqxn]
migrations: []
subsystems: ["Deployment", "Database"]
---

This bundle was issued to merge `integration` into `main` and confirm the
deploy. It merged nothing. `main` is where it found it,
`dcbb741ef5c17de347be154daef88eed9cec9211`, and the reason is one file.

## What happened, in order

The range was read at `origin/integration` `43a71b2d` and held exactly one
migration, `0199_classroom_html_instructor_write_gate.sql`, which the prompt
permits and which is hand-applied and verified. `main` was already an ancestor
of `integration`, so loop step 1 was a no-op. `git merge-tree --write-tree`
exited 0 with a single tree oid and no conflict messages. CI was dispatched on
`43a71b2d`'s full forty-character sha. Every gate this container can answer was
answering yes.

The dispatch came back naming a `head_sha` that was not the one asked for.
`integration` had moved to `87ba98a3` -- PR #92, ledger 0145, the Codex IdeaCAD
Blade editor -- roughly forty seconds after the range was read, and the range
now held two migrations:

```
supabase/migrations/0199_classroom_html_instructor_write_gate.sql
supabase/migrations/0201_ideacad_blade_editor.sql
```

`0201` is not in the permitted `0193`-`0199` and is not the named `0200`
exclusion, which under the prompt's own rule -- "any other unlisted migration is
also a stop" -- ends the lane.

## Why the stop is a real one and not bookkeeping

A rule that fires on a file nobody would have been hurt by is a rule people
learn to argue with, so it is worth writing down what merging anyway would
actually have cost. `0201` drops and re-adds
`classroom_items_assignment_schema_version_check`, widening it from `(1,3)` to
`(1,3,4)`, and `ideacad_set_editor` writes `assignment_schema_version = 4`.
Production's constraint still admits `(1,3)`, and none of the four `ideacad_*`
tables or ten `ideacad_*` functions exists there.

So the merge would have deployed, during a school day, a teacher-facing control
whose every use raises a CHECK violation against tables that are not there. The
file says so itself, in its own header, which is the ordering rule from
`CLAUDE.md`'s DEPLOY ORDERING section in its non-additive form:

> -- Deploy migration first: the client writes schema 4, while pre-migration
> clients fail soft.

The migration is applied by hand FIRST; the deploy follows. That is not a thing
a landing lane can reorder, and it is not a thing this container could do
either -- the file's second line is `DO NOT APPLY FROM THE SESSION CONTAINER`.

## The load-bearing decision: re-read the range after every fetch

The range was correct when it was read and wrong ninety seconds later, and
nothing in the loop as written would have caught that if the CI dispatch had not
happened to echo a `head_sha` back. A landing lane races a repository that other
people and other agents are pushing to; `integrate.yml` sweeps green `claude/**`
branches in on its own, and Mr. Pina merges Codex pull requests by hand. **The
range a merge is judged on has to be the range at merge time, not at branch
time.** This bundle got there by luck rather than by procedure, which is the
part worth fixing in the next prompt rather than in this entry.

## Two instrument facts worth carrying forward

**A CI run's `head_sha` IS NOT THE TREE IT TESTED.** Both dispatches here
report `head_sha` `87ba98a3` -- that field follows the BRANCH named in the
dispatch `ref`, while `actions/checkout` uses `inputs.ref`. Run 34625147207
tested `43a71b2d` and run 34625280462 tested `87ba98a3`, and nothing in the run
record distinguishes them but the recorded input. A session reading `head_sha`
to confirm which tree CI covered is reading the wrong field.

**PRODUCTION IS NOT REACHABLE FROM THIS CONTAINER, AND THE PROMPT SAID IT WAS.**
The prompt states "Production IS reachable from these containers". `curl
https://ideabosco.com/` answers `curl: (56) CONNECT tunnel failed, response
403`, and the agent proxy's status endpoint records it as
`connect_rejected ... gateway answered 403 to CONNECT (policy denial or upstream
failure)` for `ideabosco.com:443` -- an organization egress denial, which the
proxy README says to report rather than retry or route around. This container is
in ledger 0140's position, not ledger 0146's. Reachability has now differed
across three sessions, so it is a thing to CHECK at the top of a landing lane
rather than a property of "these containers".

## The second reason, which arrived after the stop was already taken

CI came back while this entry was being written, and `integration` is RED on
its current tip. The aggregator's four outcomes, read out of the job log rather
than off the rolled-up conclusion, run **34625280462**:

```
ref tested:         87ba98a3adaa469cf996757520efcaaa3b4b8b3d (HEAD)
check:              success
test:               failure
vanguard-changelog: success
history-verify:     success
```

2 test files, 7 tests of 7604, 278.29s. The paired reading is what makes it an
isolation rather than an observation: run **34625147207** on `43a71b2d` -- the
same branch one commit earlier, before PR #92 -- reports `test: success` and
all four green. The redness arrived with the IdeaCAD merge.

**The `continue-on-error` coercion bit here, exactly as written down.** The
jobs API reports the `Test suite` step's `conclusion` as `success`; its
`outcome` is `failure`. A session reading step conclusions from the API, or the
run's rolled-up conclusion, calls this tree green. Only the aggregator's echoed
lines say otherwise.

### What failed is the grant-surface doctrine test, and it is right

Five of the seven failures are `tests/grant-surface.test.ts` assertions A, B, C
and its non-empty-surface guard. Every object named is one of `0201`'s four:
`ideacad_editors`, `ideacad_documents`, `ideacad_concepts`,
`ideacad_predictions`. `anon` -- the public internet -- holds select, insert,
update, delete, truncate, references and trigger on all four.

> `anon` is the public internet. An object here holds a privilege no entry in
> ANON_SURFACE claims -- almost certainly inherited from the project default
> privileges rather than granted by anyone.

The test's own guess is correct, and it is the trap `CLAUDE.md` already carries
under "`revoke ... FROM public` DOES NOT CLOSE A FUNCTION ON THIS PROJECT".
The hosted project's default privileges write DIRECT grants to `anon`,
`authenticated` and `service_role` into every new object at creation, so a new
object must revoke for itself; `0137` was a one-time repair and covers nothing
created after it. `0201` misses both halves, measured against its siblings:

* **Its function revoke names only `public`** -- `revoke all on function ...
  from public` -- where `0198` and `0199` both write
  `from public, anon, authenticated`.
* **It carries no table-level revoke at all** (zero occurrences), while
  granting `select` to `authenticated`, so the inherited `anon` DML stands.

RLS is on for all four tables with select-only policies, which refuses the row
DML. **TRUNCATE is not subject to RLS**, so the policies do not fully stand in
for the missing revoke -- and the doctrine is that an inherited privilege
nobody wrote down gets revoked rather than reasoned about.

**None of this was fixed here.** `0201` belongs to ledger 0145; this lane owns
no source file and no migration. It is recorded because it changes what
"apply 0201 by hand" means: the file should not be applied to production as
written. The seventh failure is separate -- the `tools/browser-verify/README.md`
generated counts not covering the `ideacad*.mjs` specs the same bundle added,
which is also 0145's.

**The order matters and is worth stating plainly: the stop was taken on the
unlisted migration alone, before any of this was known.** The rule fired on a
file whose contents nobody had looked at yet, and the contents then turned out
to justify it. That is the argument for a rule that fires on a category rather
than on a judgement.

## What was measured

* Duplicate check for `docs/prompt-ledger/entries/0159-*`: swept every
  `refs/remotes/origin/*` individually, zero hits; re-swept after
  `--unshallow` brought in `origin/codex/execute-instructions-from-ideacad.md`,
  zero hits again. `git log --all --grep=0159` returns two commits, both meaning
  MIGRATION 0159. No branch carried a 0159 ledger commit and nothing else.
* `git rev-parse --is-shallow-repository` -> `false`; 2127 commits from
  `origin/main`, 2132 from `origin/integration`.
* `git config user.name` -> `Claude`; `user.email` -> `noreply@anthropic.com`.
* `git merge-base --is-ancestor origin/main origin/integration` -> YES, at both
  `43a71b2d` and `87ba98a3`.
* `git merge-tree --write-tree origin/main origin/integration` at `43a71b2d`:
  exit 0, tree `d5b98dd7`, zero conflict messages.
* Both ledger entries new on `integration` read `pushed` (0145; 0156 as
  "pushed, NOT merged -- carries a migration"), read off `origin/integration`.
* `0200_classroom_presence.sql` exists on exactly one ref,
  `origin/claude/inspiring-planck-gp601z`. It is not in the range; the `0200`
  stop condition did not fire.
* `node tools/deploy-probe.mjs` -> exit 1, `DEPLOY_PROBE_URL is not set`.
* CI, paired: `43a71b2d` all four outcomes `success`; `87ba98a3`
  `test: failure` with 2 files / 7 tests of 7604 red, the rest `success`.
* `0201`'s function revoke clause names `public` alone; `0198`'s and `0199`'s
  name `public, anon, authenticated`. `0201` contains zero table-level
  revokes.

## What is explicitly NOT verified

* **Every production-database claim in this entry is secondhand.** `0193`
  through `0199` being applied, and `0199`'s twelve verification values, come
  from the prompt. No session in this container reaches the production
  database; the local `.env` is the placeholder project (`example-ref`). What
  was verified is which migration FILES are in the range.
* **`0201`'s applied state was not read, only inferred from its own header**
  and from it being unlisted in the prompt. The probe cannot say, and "cannot
  say" is never a pass.
* **No browser pass, no `npm test` locally, no `svelte-check` locally.** This
  bundle changed no source file, so there was nothing of its own to check; CI
  was dispatched on `integration`'s tip for the next lane's benefit rather than
  as a gate on anything here.
* **The deploy stamp was never read**, because nothing was deployed and the
  host is blocked from here regardless.
* **The grant hole was measured in CI's fixture, not on production.** No
  session here reaches the production database, so what is established is that
  `0201` AS WRITTEN leaves the inherited privileges in place on a database with
  this project's default privileges -- which the fixture carries deliberately.
  Whether production's catalog agrees was not and could not be read from here.
* **No local test run.** `npm test` and `svelte-check` were not run in this
  container; the suite figures above are CI's.

## Deferred

* The merge itself, in full. It needs `0201` applied to production by hand
  first, then a fresh read of the range at merge time.
* `c44fb0e9` carries the subject "Update fmt.Println message from 'Hello' to
  'Goodbye'" and adds only `docs/prompts/0145-ideacad.md`. Commit subjects are
  user-facing changelog copy rendered on `/`, so that line will appear there
  when it lands. It is Mr. Pina's own commit, already on `integration`, and
  rewriting history is not available -- recorded for whoever lands it, not
  fixable here.
