---
title: "Two defects in the landed history probe, and the prompt collision that produced both bundles"
date: 2026-09-13
branches: ["claude/keen-davinci-xvhwdw"]
migrations: []
subsystems: ["migrations", "ci", "tooling"]
---

This bundle was issued to make `tools/deploy-probe.mjs` read the seeded
`supabase_migrations.schema_migrations` before falling back to the object
probes. Ledger 0216 was issued for the same job, on the same files, and landed
on `integration` first. What remains here is two defects in the version that
landed, both measured, and a record of how two bundles came to be written for
one job.

## The collision, and why neither duplicate check could have caught it

Both prompts came from the router chat, hours apart, naming overlapping
ownership: `tools/deploy-probe.mjs`, `tests/deploy-probe*`, and three named
paragraphs of `CLAUDE.md`.

**This bundle's duplicate check ran three ways and came back clean, and it was
right to.** Every fetched remote ref's `docs/prompt-ledger/entries/` held
nothing in the `0213` slot; the live GitHub contents API for `main` and
`integration` held nothing; and the string `0213` across every ref's tree and
commit messages matched exactly one thing, the MIGRATION `0213` on ledger
0212's branch, which is a different namespace. `0216` did not exist yet.

**0216's own entry records a three-way check that came back clean too**, for
the mirror-image reason. Neither was wrong. `docs/prompt-ledger/README.md`
states this limit in its own words -- two chats that both write a prompt before
either records an entry -- and says nothing short of a lock closes it. This is
the first time that limit has been hit on two prompts issued the same day for
the same file.

**Three sessions agreeing independently is worth more than any one of them.**
0216 reached the same design: history first, object probes kept, the object
deciding wherever it ran, status 3 preserved. It independently found the `psql`
command-tag defect -- `--tuples-only` does not suppress the `SET` tag, so the
tag arrives ahead of the answer -- and independently concluded that the third
stale claim ledger 0209 named lives in `.github/workflows/deploy.yml` and
appears nowhere in `CLAUDE.md`. That last one matters: two sessions checked the
same sentence against the tree and the tree won both times.

## Every overlapping file was resolved in favour of what landed

`tools/deploy-probe.mjs`, `CLAUDE.md` and `tests/deploy-probe-history.test.ts`
are 0216's. This branch's own `tests/deploy-probe-cli.test.ts` was deleted.
0216 additionally fixed something this bundle never had: `set -uo pipefail`
does not clear ERREXIT, so the probe step's own exit 1 and exit 3 killed the
step before `PROBE=$?` was read, making the only escape hatch from gate 4
unreachable code. That is in a file this bundle does not own.

Resolving the other way would have discarded a real fix to keep a duplicate.

## Defect one: `to_regclass` raises for the role this tool is built for

`HISTORY_PRESENCE_SQL` resolved the NAME, on the stated grounds that
`to_regclass` "returns null instead of raising, which is the whole reason it is
used here".

**It does not, for a role with no USAGE on the schema.** Resolving a qualified
name needs that privilege. Measured on a real Postgres, as a role holding
CONNECT and nothing else, against a database where the table exists with 208
rows in it:

    to_regclass('supabase_migrations.schema_migrations')
      -> ERROR: permission denied for schema supabase_migrations
    the pg_class lookup
      -> present

That role is not a hypothetical. The file's own `information_schema` section
says it in words: "A role created for this job holds nothing but CONNECT." So
through `to_regclass` the presence query raises, `runRows` reports a non-zero
psql status, `readHistory` returns `{ ok: false }`, and `main` answers
`cannotRun` -- **exit 1, every deploy stopped, on a database that is perfectly
reachable and perfectly correct.**

It asks `pg_catalog.pg_class` and `pg_catalog.pg_namespace` now, which are
readable by PUBLIC and filtered by neither privilege. That is the same fact the
file's own `information_schema` section already turns on, one section up.

**A scalar subquery rather than a joined one**, because a derived table that
matches nothing contributes no row: on a pre-seed database the whole statement
would come back empty and `readHistory` would report that it could not tell,
which is `cannotRun` again, instead of the ordinary `absent` it is.

## Defect two: present-and-unreadable was a failure, and it is a degrade

The landed `readHistory` documented a rule -- "a query error is `cannotRun`,
not 'no table'... answering it by silently falling back to the object probes
would turn a broken credential into a quieter verdict rather than a reported
one" -- which is right about a broken credential and wrong about a missing
grant, and the two were indistinguishable because nothing asked.

The presence query now answers three states, and `unreadable` degrades: the
history is `null`, which is this tool's own word for "the table was not
consulted", so every verdict is the object probe's, exactly as before the table
existed. That is a working answer. The alternative is that the moment the seed
is pasted, a read-only role missing one grant on one new table stops every
deploy this repository can make, having previously answered fine.

**It is NOT collapsed into `absent`, and that is the half worth writing down.**
`absent` is a claim about the DATABASE; `unreadable` is a claim about this
ROLE's reach. An operator reading "the history table is not on this database"
acts on it by pasting a seed that is already applied. The degrade is said out
loud on stderr and carries its own line in the report, beside the one `absent`
already had -- otherwise a degraded run and a full one look identical in a job
summary.

**`readable` is TWO privileges.** `has_table_privilege` answers about the
table's own ACL and says nothing about the schema, so a role granted SELECT on
the table and nothing on `supabase_migrations` would pass a table-only check
and then fail the real select with `permission denied for schema`.

## What was measured

- **Three new controls in `tests/db/deploy-probe-history-live.test.ts`**, the
  file that drives the real SQL through the real `psql`. Control 6 puts both
  spellings to the CONNECT-only role on one database and pins that
  `to_regclass` raises and the catalog lookup answers `unreadable`. Control 7
  grants the table alone, asserts it is still `unreadable`, then grants the
  schema as the POSITIVE CONTROL -- without which a query answering
  `unreadable` for every input would pass. Control 8 pins the degrade: `ok`
  with a null history, the reason reported, and the verdicts coming out as the
  pre-seed ones.
- **All 46 of 0216's own tests pass against the fixed implementation**
  (`tests/deploy-probe-history.test.ts`, `tests/deploy-probe-step.test.ts`,
  `tests/db/deploy-probe-history-live.test.ts`), with two of its assertions
  updated to name the catalog lookup rather than `to_regclass`.
- **A mutation proof**, judged by the summary line and never by vitest's exit
  code, with the target copied into memory and restored from that copy --
  `git checkout --` is a discard-to-HEAD and would take a session's own
  uncommitted work with it.
- **`svelte-check` at the baseline** and **the full suite**.

## What was NOT verified

- **Anything against production.** `IDEA_MIGRATION_URL`, `DEPLOY_PROBE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` are unset here and there is no `.env`, so whether
  the seed has been pasted is unknown and every measurement above is against
  the embedded harness with that seed applied to it.
- **The merge to `main`, blocked by this bundle's own subject.** Item 4 of the
  six-item checklist is `node tools/deploy-probe.mjs --ref origin/integration`
  exiting 0. With no credential it exits 1 -- cannot run, which is never a
  pass. That is not a defect in the checklist: item 4 asks a question about
  production and a container with no credential cannot answer it.
- **No browser pass**, as the prompt said.

## Two instrument defects found in this session's own tooling

Worth recording because both produced confident, wrong readings.

**The mutation script judged runs with a bare `npx vitest run`.** `npm test`
passes `--no-file-parallelism`; a bare run does not, and these files boot
databases on one shared cluster. Run in parallel they raced -- 4 failed, 33
passed serially. A mutant "killed" by a race proves nothing, so the first
proof's numbers were discarded and the whole thing re-run serially rather than
reported.

**A fixture named a migration instead of building one.** An earlier version of
this branch's CLI test used `0211` as "the migration with no derivable probe",
on the strength of the seed file's own header. `origin/main` moved mid-session
and picked the file up, the derivation started answering for it, and both
directions of the pair inverted at once. Which migration lacks a probe is a
fact about two other tools and a git ref. That test is gone with the rest of
the duplicate, but the lesson is not: a fixture resting on a fact it does not
control has an expiry date nobody writes down.
