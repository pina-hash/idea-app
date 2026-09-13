---
title: "The deploy probe reads the seeded history first, and keeps the objects as evidence"
date: 2026-09-13
branches: ["claude/keen-davinci-xvhwdw"]
migrations: []
subsystems: ["migrations", "ci", "tooling"]
---

`tools/deploy-probe.mjs` could only ever INFER an apply. `tools/idea-status.py`
derives one catalog probe per migration -- the first object the file creates --
and a migration it can derive nothing from got no probe at all, so the answer
was status 3, CANNOT SAY. Five separate lanes stopped at that gate in one week.
It was unavoidable while nothing recorded what had been applied.

`supabase/data/0209-seed-migration-history.sql` gave the database a record of
its own. Ledger 0209's closing note named reading it as the obvious next
bundle, in a different file, with a different owner, and a different decision
about what counts as evidence. This is that bundle.

## The precondition is a stop, and it could not be met here

The prompt made the seed's paste a precondition and said to say so plainly if
it could not be verified. **It cannot be verified from a cloud container and
was not.** `IDEA_MIGRATION_URL`, `DEPLOY_PROBE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are all unset here and there is no `.env` at all --
measured, not assumed -- so there is no route to the database by which
`supabase_migrations.schema_migrations` could be looked at.

So everything below was built and measured against the embedded harness with
`0209-seed-migration-history.sql` applied to it, in both directions, through
the real `psql` binary. **Production behaviour is unverified.** What the tool
does on production the first time somebody runs it with a credential is a
prediction, and the only thing this bundle can honestly claim is that it does
the right thing against a database carrying exactly the state the seed writes.

## A row is a claim, the object is evidence, and the object wins

The prompt required the tool's own header to say which of the two is believed
when they disagree, and why. It does, and the asymmetry underneath it is the
half worth writing down here.

**A ROW IS A CLAIM.** It says somebody -- the seed, or
`tools/apply-migration.mjs` -- believed a file had been applied. Nothing
re-checked it afterwards, and 208 of the seed's rows were written from the
repository's own records rather than from the database. **A FALSE PROBE IS
EVIDENCE**: the database itself saying the object is not there. So a row
claiming an apply whose object is absent is NOT APPLIED, status 2, and the
disagreement is printed by name rather than folded into the tally. That is the
one failure the seed introduces as a possibility, and the object probes are the
only thing that catches it, which is why they are kept.

**AN ABSENT ROW IS SILENCE, NOT A DENIAL**, and that is why the asymmetry is
not an inconsistency. The table is not exhaustive by construction: the seed
stops at `0211` and every migration pasted by hand afterwards leaves no row
behind. So a missing row with a TRUE probe is APPLIED -- with the gap named in
the report, because `.github/workflows/migrate.yml` reads that table to choose
what to apply next and a record that is behind will make it re-offer something.

**AND STATUS 3 SURVIVES.** A row is a licence to answer where the machine
previously had nothing to say, never a licence to answer where nothing was
checked. No row AND no probe is still 3. A database with no history table at
all answers exactly as it did before this bundle, probe by probe, 3 included --
asserted as an EQUALITY against the explicit form rather than by reading the
default, because `tools/apply-migration.mjs` calls `verdicts` with two
arguments and must keep the behaviour it had.

    row   object   ->  verdict
    yes   true         APPLIED       both agree
    yes   false        NOT APPLIED   the evidence wins
    yes   (none)       APPLIED       what 0209 bought
    no    true         APPLIED       silence, not a denial; the gap is named
    no    false        NOT APPLIED   both agree
    no    (none)       CANNOT SAY    status 3, unchanged
    --    any          exactly as before the table existed

## The signature was widened additively, so no other file changed

`verdicts(probes, rows, history)` takes the record as an OPTIONAL third
argument defaulting to "the record cannot speak". `tools/apply-migration.mjs`
imports `verdicts` from this file and calls it with two, and
`tests/workflows.test.ts` pins that import list by name. Widening rather than
changing is what let this bundle leave that file alone entirely.

## Reading the table is two round trips, and it has to be

`supabase_migrations.schema_migrations` is an ordinary table, not a catalog.
The deploy role holds nothing but CONNECT, and **a `select` a role may not run
raises `permission denied` at executor startup**, which would abort the single
transaction the object probes ride in and take the whole answer down with it. A
`case` guard does not help: the permission is checked for every range table in
the statement, not per branch.

So the existence and the privilege are asked of `pg_catalog` FIRST, and the
rows are read only if that came back readable. **Measured rather than argued**:
the exact statement `readHistory` would send if it skipped the preflight, run
as a role with no grant, raises `permission denied`. That assertion is in the
suite, so the preflight cannot quietly become ceremony.

Every failure on that path degrades to the object probes with a REASON on
stderr, never an exception and never an empty set of versions. An empty set
would report every migration unrecorded and refuse the deploy on a transient
error, which is why `versions: null` and `new Set()` are deliberately different
things and a mutant that collapses them is killed by four assertions.

## Three defects the measurement found, none of which reasoning would have

**`to_regclass` NEEDS SCHEMA USAGE, AND THE PREFLIGHT IS BUILT FOR A ROLE THAT
HAS NONE.** The first version resolved the NAME. Resolving a qualified name
needs USAGE on its schema, so for exactly the role this tool runs as it answers
NULL for a table sitting right there -- and the tool would have told an
operator to paste a seed the database already had. Measured: `present: false`
through `to_regclass` and `present: true` through `pg_catalog.pg_class` for the
same role on the same database. `pg_class` and `pg_namespace` are readable by
PUBLIC and filtered by neither privilege, which is the same fact the file's
`information_schema` section already turns on.

**`readable` IS TWO PRIVILEGES.** `has_table_privilege` answers about the
table's own ACL and says nothing about the schema, so a role granted SELECT on
the table and nothing on `supabase_migrations` read `true` and would then have
failed the real select with `permission denied for schema`. Both are asked now,
with a three-step control in the suite: no grants, table only, then both.

**`psql` PRINTS ITS COMMAND TAGS ON STDOUT UNDER `--tuples-only`.** The
statements open with `set transaction read only;`, so a bare line reading `SET`
arrived ahead of the rows -- measured, `"SET\n0001\n0002\n"` against
`"0001\n0002\n"` with `--quiet`. The object probes never noticed because they
discard any line that is not `<int>|<t|f>`; the history read has no such shape
to filter on and silently gained a 209th "version" called `SET`, which matched
no migration and inflated every count the tool printed. Fixed at the source
with `--quiet` rather than downstream, because a filter there would be a
second, softer copy of "what a version is".

A fourth was found by the test file failing rather than by a browser: `verdicts`
assumed its caller had already normalized the version set, which is an
invariant living in the wrong place. Get it wrong and every migration reports
`unrecorded`, which reads as a CANNOT SAY and is therefore never investigated.
The lookup owns the normalization now.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings in 20 files, 31/5/1.** Re-derived on a
  clean `git worktree` at the branch point `8fe7a076` -- a baseline measured on
  the tree under test is not a baseline -- and again on the working tree.
  Identical. **`CLAUDE.md`'s stated figure needed no correction**, which is the
  first time in six readings; the two placeholder `$env` values were exported
  before the sync, without which the run reports 14 phantom errors in 31 files.
- **The branch point was GREEN**: 458 files, 8682 tests, all passed, at
  `8fe7a076` in the same worktree.
- **The whole CLI, end to end, through real `psql` against a real Postgres.**
  `tests/deploy-probe-cli.test.ts` plants the objects `0209` and `0210` create
  by hand, seeds the history, and drives `node tools/deploy-probe.mjs`. The
  window `--since 209` is chosen for what the derivation CANNOT do with it:
  `idea-status.py` derives nothing at all for `0211`, so it is the migration
  this tool could only ever have answered CANNOT SAY about. With the row it
  answers `record-only` APPLIED and the process exits 0. Without the row -- the
  same fixture minus one function, so the seed's own conditional withholds it --
  it answers `unknown` and exits 3. **That pair is the bundle.**
- **A mutation proof, judged by the summary line and never by vitest's exit
  code.** Eleven permissive mutants across the decision matrix, the degradation
  ladder, the two preflight privileges and the `psql` invocation. The target
  file is copied into memory and restored from that copy, never with
  `git checkout --`, which is a discard-to-HEAD and would have taken this
  session's uncommitted work with it.
- **The full suite**, at the end, on the merged tree.

## What was NOT verified

- **Anything against production.** There is no credential and no route. The
  seed's paste is unconfirmed and so is every claim about what the live
  database now holds.
- **The merge to `main`, which this bundle is blocked from making by its own
  subject.** Item 4 of the six-item checklist is
  `node tools/deploy-probe.mjs --ref origin/integration` exiting 0.
  `DEPLOY_PROBE_URL` is unset here, so it exits 1 -- cannot run, which is never
  a pass. **The bundle that exists to end the probe's silence is stopped by it.**
  That is not a defect in the checklist: item 4 is a question about production
  and a container with no credential genuinely cannot answer it. What this
  bundle changes is the answer the probe gives once somebody CAN run it.
- **No browser pass**, as the prompt said.

## The three `CLAUDE.md` paragraphs, and the one that was not there

Ledger 0209 named three paragraphs as going stale the moment the seed is
pasted. **One of the three is not in `CLAUDE.md` and never was.** Its entry
reads "three of ITS paragraphs" and lists `deploy.yml`'s quoted "applying a
migration ... needs a credential that can WRITE to production, which nothing in
CI and no cloud session may hold" -- and that sentence lives in
`.github/workflows/deploy.yml`, at its header and again in its status-2 summary
block. `CLAUDE.md` carries no quotation of it.

What `CLAUDE.md` carries is its own statement of the same claim, in the
Environment section: "Nothing in this repo can apply a migration, run an RPC,
or sign in against production." That is the paragraph that was corrected, and
the correction is the narrower sentence: **no SESSION holds either credential,
and CI now holds both** -- `DEPLOY_PROBE_URL` read-only for `deploy.yml`, and
`IDEA_MIGRATION_URL` with write access for `migrate.yml`, behind the scoped
`idea_migrator` role.

The third paragraph edited is the `IDEA_MIGRATION_URL` reader census, which
said "read by that one tool and nothing else" and was **already false on
`integration` before this bundle started**: `migrate.yml` hands the same secret
to `tools/deploy-probe.mjs` under `DEPLOY_PROBE_URL` when no read-only one is
set. Three holders, one writer, and the split named so a fourth reader is a
decision rather than a drift.

`deploy.yml`'s own copy is left alone deliberately -- it is that file's to
correct and this bundle owns three paragraphs of `CLAUDE.md` and no workflow --
and is named here with its lines so the next bundle does not have to find it.
