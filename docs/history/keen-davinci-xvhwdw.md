---
title: "A duplicated prompt, a merged fork, and the live controls that were left unpinned"
date: 2026-09-13
branches: ["claude/keen-davinci-xvhwdw"]
migrations: []
subsystems: ["migrations", "ci", "tooling"]
---

This bundle was issued to make `tools/deploy-probe.mjs` read the seeded
`supabase_migrations.schema_migrations` before falling back to the object
probes. **Three bundles were issued for that one job**, and by the time this
one finished, its work was already on `integration`, merged by the third.

What is left here is the part none of them had: the evidence that the two
privilege decisions in the merged probe are load-bearing.

## Three prompts, one job, and why no duplicate check could have caught it

Ledger `0213` (this one), `0216` and then `0220` were all issued by the router
chat, hours apart, naming overlapping ownership of `tools/deploy-probe.mjs`,
`tests/deploy-probe*` and three named paragraphs of `CLAUDE.md`.

**This bundle's duplicate check ran three ways and came back clean, and was
right to.** Every fetched remote ref's `docs/prompt-ledger/entries/` held
nothing in the `0213` slot; the live GitHub contents API for `main` and
`integration` held nothing; and the string `0213` across every ref's tree and
commit messages matched exactly one thing -- the MIGRATION `0213` on ledger
0212's branch, a different namespace. **0216's entry records a three-way check
that came back clean too**, for the mirror-image reason. Neither was wrong.
`docs/prompt-ledger/README.md` names that limit in its own words and says
nothing short of a lock closes it. This is the first time it has been hit twice
in one day on one file.

**Three sessions agreeing independently is worth more than any one of them.**
All three reached the same design -- history first, object probes kept, the
object deciding wherever it ran, status 3 preserved -- and two of them
independently found the same `psql` command-tag defect and independently
concluded that the third stale claim ledger 0209 named lives in
`.github/workflows/deploy.yml` and appears nowhere in `CLAUDE.md`. Two sessions
checked the same sentence against the tree and the tree won both times.

## Two decisions where the merged version overruled this branch, both correctly

**The `psql` command tag is handled by labelled rows, not by `--quiet`.** This
branch found the defect -- `set transaction read only;` emits a bare `SET` line
that `--tuples-only` does not suppress, so it landed in the version set as an
extra "version" and inflated every count printed -- and fixed it at the source
with the flag. `0220` gives every row a literal key column instead, on the
grounds that a flag is one edit away from being dropped by somebody tidying an
argument list and nothing would fail loudly when it went. That is the better
fix and this branch's was worse.

**`cannotRun` on an unreadable table is written down as REJECTED rather than
left undocumented.** 0216 argued that a failure after the preflight says
`present` is an anomaly and should stop the run; this branch argued it should
degrade. The merged header carries both and says why the degrade wins: the
narrowest rung is not a weaker answer, it is the pre-seed answer, which fails
closed by construction. A disagreement between two sessions is worth more
recorded than resolved silently.

## The two fixes that survived, and what they were fixing

**`to_regclass` RAISES for the role this tool is built for.** The presence
query resolved a NAME, on the stated grounds that `to_regclass` "returns null
instead of raising". It does not, for a role with no USAGE on the schema --
resolving a qualified name needs that privilege. Measured on a real Postgres,
as a role holding CONNECT and nothing else, against a database where the table
exists with 208 rows in it:

    to_regclass('supabase_migrations.schema_migrations')
      -> ERROR: permission denied for schema supabase_migrations
    the pg_class lookup
      -> present

That role is not a hypothetical: the file's own `information_schema` section
says "A role created for this job holds nothing but CONNECT". `pg_class` and
`pg_namespace` are readable by PUBLIC and filtered by neither privilege, which
is the same fact that section already turns on one paragraph up.

**`readable` is TWO privileges.** `has_table_privilege` answers about the
table's own ACL and says nothing about the schema, so a role granted SELECT on
the table and nothing on `supabase_migrations` would pass a table-only check
and then fail the real select with `permission denied for schema`.

## What this branch actually adds, and why it is the part that was missing

Both fixes are on `integration`. **None of the controls that pin them is.**
Measured on `integration`'s own `tests/db/deploy-probe-history-live.test.ts`:

    create role                    0
    has_schema_privilege           0
    permission denied for schema   0
    usage                          0

Every case in that file runs as the cluster owner, which reads anything. So the
choice of `pg_class` over `to_regclass`, and both halves of the two-privilege
check, are unpinned there: revert any of them and nothing reddens. **A check
that has never failed has not been tested**, and these had not.

Three controls, all against a CONNECT-only role on a real Postgres:

- **Control 5** puts both spellings to that role on one database, so the
  comparison is a measurement rather than a claim.
- **Control 6** pins both privilege halves from BOTH directions. It needs a
  second role: the first gains the table then the schema, so it never once asks
  a role that has the schema and not the table -- and without that mirror,
  dropping the TABLE half of the conjunction SURVIVES. That was found by the
  mutation proof, not by reading.
- **Control 7** pins the degrade: `versions` null rather than an empty record,
  and the verdicts coming out as the pre-seed ones.

Mutation-proved against `integration`'s own implementation: five permissive
mutants -- reverting to `to_regclass`, dropping either privilege half,
collapsing unreadable into an empty record, and narrowing the catalog lookup's
relkind list -- **all five killed, no survivors**, target restored to its exact
md5.

## What was NOT verified

- **Anything against production.** `IDEA_MIGRATION_URL`, `DEPLOY_PROBE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` are unset here and there is no `.env`, so whether
  the seed has been pasted is unknown and every measurement above is against
  the embedded harness with that seed applied to it.
- **The merge to `main`, blocked by this bundle's own subject.** Item 4 of the
  six-item checklist is `node tools/deploy-probe.mjs --ref origin/integration`
  exiting 0. With no credential it exits 1 -- cannot run, which is never a
  pass. That is not a defect in the checklist: item 4 asks a question about
  production, and a container with no credential cannot answer it. Production's
  version string cannot be reported for the same reason.
- **No browser pass**, as the prompt said.

## Four instrument defects in this session's own tooling

Recorded because every one produced a confident, wrong reading, and three were
mine.

**A commit captured a mutant.** `git add -A` ran while the mutation script had
`tools/deploy-probe.mjs` swapped out, committing `when true` in place of the
`has_schema_privilege` check -- one of the two defects this bundle exists to
fix. It was unpushed and was amended, and the fix was verified by reading the
markers back out of `HEAD` rather than off the working tree. **The rule that
follows is the one `CLAUDE.md` already states about `git checkout --` in
mutation scripts, pointed the other way: a mutation run makes the working tree
untrustworthy for as long as it is running, and nothing may be committed from
it.** Staging only files the script does not touch, and diffing the INDEX copy
against a known-good ref before committing, is what this session did afterwards.

**The mutation script judged runs with a bare `npx vitest run`.** `npm test`
passes `--no-file-parallelism`; a bare run does not, and these files boot
databases on one shared cluster. Run in parallel they raced -- 4 failed, 33
passed serially. A mutant "killed" by a race proves nothing, so that proof's
numbers were discarded and the whole thing re-run rather than reported.

**A fixture named a migration instead of building one.** An earlier test used
`0211` as "the migration with no derivable probe", on the strength of the seed
file's own header. `origin/main` moved mid-session and picked the file up, the
derivation started answering for it, and both directions of the pair inverted
at once. Which migration lacks a probe is a fact about two other tools and a
git ref. A fixture resting on a fact it does not control has an expiry date
nobody writes down.

**`svelte-check` caught six errors the full suite could not.** Widening
`readHistory` to return a third outcome made `history` nullable, and six call
sites read it without narrowing. The suite was green throughout, because vitest
does not typecheck. That is why the baseline is a separate instrument.
