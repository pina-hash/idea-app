---
title: "A duplicated prompt, a merged fork, and the live controls that were left unpinned"
date: 2026-09-13
branches: ["claude/keen-davinci-xvhwdw", "claude/new-session-3yjcxp"]
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

---

## Correction from ledger 0274, 2026-09-22: the controls were already there

Everything above this line is the 2026-09-13 session's own account and is left
byte-identical. This section is ledger 0274, which was issued nine days later to
land or close the branch and found that the central claim above does not hold.
**`CLAUDE.md` says a past bundle's account is corrected by a NEW entry rather
than by an edit; this entry had never landed anywhere, so the correction is
appended here rather than published uncorrected and answered somewhere else.**

**WHY THE BRANCH STOOD FOR NINE DAYS, WHICH IS NOT WHAT ANYBODY ASSUMED.** CI on
its tip `4890582c` was RED, and `integrate.yml` merges only a green branch, so a
red tip is a branch that stands forever with nothing saying why. Two tests
failed, 463 files passed of 465, and **neither failure was in this branch's own
work**:

    tests/deploy-probe-cli.test.ts > ENDS STATUS 3: ... exits 0
      Error: Command failed: git commit-tree ... Author identity unknown
      fatal: empty ident name (for <runner@runnervmlun5p...internal.cloudapp.net>)

    tests/db/migrations-applied-record.test.ts > every record names a migration
    file that exists, and hashes it correctly
      0210-determined-albattani-16az27.md:
        expected '48a4ad20...' to be '550f5597...'

The first is a fixture that shells `git commit-tree` and a GitHub runner that
has no git identity: it passes on any machine where a person has configured one
and fails on every runner, which is the (c) answer -- environment-dependent, and
invisible locally. The second is a sha drift on the `0210` applied record. Both
were fixed on `integration` in the 164 commits the branch was behind:
`tests/deploy-probe-cli.test.ts` now passes `-c user.name=IDEA test fixture -c
user.email=fixture@example.invalid` to every git call, and the `0210` record was
reconciled. **Merging current `integration` clears both, and `npm test` on the
merged tree is 527 files and 9829 tests, all passing.**

**AND THE 106 LINES THIS BRANCH ADDS PIN NOTHING THAT IS NOT ALREADY PINNED.**
The claim above is that `tests/db/deploy-probe-history-live.test.ts` on
`integration` carries none of the CONNECT-only controls -- `create role` 0,
`has_schema_privilege` 0, `permission denied for schema` 0, `usage` 0 -- and
that therefore "reverting either fix reddens nothing". **The four marker counts
are correct and the conclusion drawn from them is not, because the sweep was run
over one file and the coverage is in its sibling.**
`tests/deploy-probe-history.test.ts`, which this very file imports beside, carries
`create role` 5 times, `probe_schemaonly` 3 times and `permission denied for
schema` once -- **and it carried all of them at this branch's own tip on
2026-09-13**, measured at `4890582c`, not acquired later. Its
`answers present=TRUE for a role with no schema USAGE, which to_regclass did not`
asserts, in one test and under `set role`, the whole of controls 5 and 6: that
`to_regclass` raises for a role without USAGE, that the catalog query answers
present for the same role, that SELECT-without-USAGE is not readable, that
USAGE-without-SELECT is not readable **on a mirror role of its own**, and the
positive control that granting both flips it. Control 7 is covered better still
by `tests/deploy-probe-cli.test.ts`'s `degrades to the object probes when the
role may not read the record, and says so`, which drives the REAL CLI as a REAL
login role holding nothing but CONNECT and ends on a positive control of 208
recorded rows -- where control 7 stubs the transport.

**Measured rather than argued, by the mutation proof this bundle was asked for.**
Three permissive mutants of the two privilege decisions -- reverting the
`pg_class` scalar subquery to `to_regclass`, dropping the `has_schema_privilege`
half of `readable`, dropping the `has_table_privilege` half -- each applied
alone, each judged by `npm test` over the four deploy-probe suites with the
summary line parsed out of stdout AND stderr, each restored from an in-memory
byte copy and md5-checked back to `97c56b96ff59a95566b5a5840ce3842e`:

    mutant                     with the 106 lines      without them
    M1 to_regclass             KILLED 4 failed/66      KILLED 2 failed/65
    M2 drop has_schema_priv    KILLED 3 failed/67      KILLED 2 failed/65
    M3 drop has_table_priv     KILLED 2 failed/68      KILLED 1 failed/66

**No mutant survives the removal.** In every row the killer present on both
sides is `tests/deploy-probe-history.test.ts`'s single CONNECT-only test. So the
106 lines are a second implementation of a check that already exists, which is
the one thing `CLAUDE.md`'s working conventions name outright: *a second
implementation of a check is the thing that quietly stops matching.* They are
not landed. The two roles they create, `probe_connect_only` and
`probe_schema_only`, are also CLUSTER-WIDE objects created with no
`if not exists` on the one shared cluster, one underscore away from the
`probe_schemaonly` the sibling file already creates there.

**What is kept is this entry.** Three prompts issued for one job, two decisions
where the merged version overruled this branch with a better reason, and four
instrument defects -- a commit that captured a mutant, a mutation script judging
through a race, a fixture that named a migration instead of building one, and
six type errors a green suite could not see -- are not duplicated anywhere and
are the part of this branch worth having.

**And the lesson is a generalisation of one this entry already contains.** It
records a fixture resting on a fact it did not control, and calls that an expiry
date nobody writes down. A coverage sweep scoped to one filename is the same
mistake pointed at the test suite instead of at the fixture: `create role 0` was
a true reading of a file and a false answer to the question being asked. **A
claim that nothing pins a decision is a claim about the whole suite, so the
sweep is the whole suite** -- or, better, it is the mutation proof itself, which
cannot be scoped to the wrong file because the thing it measures is whether
anything at all goes red.

**Not verified by this bundle.** Anything against production:
`DEPLOY_PROBE_URL`, `IDEA_MIGRATION_URL` and `SUPABASE_SERVICE_ROLE_KEY` are all
unset in a cloud container and a repository secret never reaches one, so
`tools/deploy-probe.mjs` cannot be run against the real database from here and
the applied state was read from `docs/migrations-applied/` instead. No browser
pass. `npm run verify:readme` was deliberately NOT run in its writing form: it
rewrites `README.md` and every file under `measured/`, which is outside this
bundle's owned paths. `npm run verify:counts -- --check` agrees with the tree.

**For Mr. Pina.** `tools/deploy-probe.mjs` was not touched: no defect was found
in it and its blob is identical to `origin/integration`'s.

**`claude/keen-davinci-xvhwdw` NEEDS A DELETE BY HAND, AND THIS ENTRY SAID THE OPPOSITE FOR ONE COMMIT.** It read that
`integrate.yml` would delete it once this landed. Its commits ARE contained in
`integration` now, which is the half that was right; but the workflow's
contained-delete path sits BELOW its CI-conclusion check, and that check
`continue`s on anything that is not `success`. This branch's tip `4890582c` is
RED -- which is why it stalled in the first place -- so it is skipped before
control ever reaches the delete, and no future run will take it either. A red
branch that is fully merged is therefore a ref that stands forever with nothing
saying why, which is the same failure this bundle was issued to resolve, one
level up. A cloud session cannot delete a remote branch, so this one is yours.

**If you want the 106 lines after all, they are not gone** -- they are the diff between `4890582c` and
`origin/integration` for `tests/db/deploy-probe-history-live.test.ts`, and
restoring them is one `git checkout`. The judgment this bundle made is that a
duplicate control is worse than no control, because it reads as coverage; it is
a judgment and it is reversible.
