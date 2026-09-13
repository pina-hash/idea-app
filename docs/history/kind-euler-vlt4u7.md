---
title: "The deploy fallback that had never run, and a probe that reads the seeded history"
date: 2026-09-13
branches: ["claude/kind-euler-vlt4u7"]
migrations: []
subsystems: ["ci", "tooling", "migrations"]
---

Two defects, both measured by ledger 0215 on real runs of `deploy.yml`, and both
re-verified here before anything was built on them. Neither is in `src/`.

## One: the typed confirmation was unreachable code

`deploy.yml`'s probe step opened `set -uo pipefail`. GitHub invokes a `run:`
body as `bash --noprofile --norc -eo pipefail {0}`, so ERREXIT is already on
before the first line, and `set -o` only turns options ON -- it cannot clear
`-e`. The statement one line down is

```
node tools/deploy-probe.mjs "${ARGS[@]}" --json > probe.json 2> probe.err
PROBE=$?
```

so the probe's own exit 1 or exit 3 killed the step on the spot. `PROBE=$?` was
never read, `echo "probe exit: $PROBE"` never printed, and the entire `case`
below it -- including the typed confirmation that is the ONLY escape hatch from
gate 4, and which the file documents at length as the remedy for the machine
being silent -- had never once executed.

Ledger 0215 measured that on two real runs, `34743453154` with the field empty
and `34743521550` with the confirmation typed correctly. This bundle reproduced
it locally with a positive control before touching the file: the same body under
`bash -e` exits 1 and prints nothing; the same body with `set +e` prepended
prints `probe exit: 1` and reaches the decision.

**The fix is `set +e` as the first statement**, with the reason beside it. The
step reads a status and decides, and every `exit` in it is written deliberately,
which is exactly the shape ERREXIT must not govern.

**A fix asserted from reading the YAML is not a fix.**
`tests/deploy-probe-step.test.ts` extracts the step's body out of the PARSED
document -- PyYAML, addressed by the step's `id` rather than by its position --
writes it to a file, and runs it under `bash --noprofile --norc -eo pipefail`,
GitHub's own invocation, with a stub `tools/deploy-probe.mjs` at the real path
exiting with whatever status the case needs. Sixteen checks across all four
directions the prompt asked for (exit 1 and exit 3, confirmation present and
absent), plus exit 0, exit 2 in both confirmation states, both scheduled cases,
and a positive control that `go` is not simply always the same word.

**The negative control is the half that matters.** One check takes the same
extracted body, removes the `set +e` line -- which is byte for byte what the
file said before this bundle -- and asserts the run never prints `probe exit:`,
never writes an output and never writes a summary. Without it, "the fallback
ran" could not be told from "this harness would pass on the broken file too".

## Two: the probe reads the seeded history table first

`supabase/data/0209-seed-migration-history.sql` was pasted on 2026-09-13 and the
verification came back EQUAL: `supabase_migrations.schema_migrations` holds 209
rows, 0001 through 0211. `tools/deploy-probe.mjs` was still probing object by
object and answering status 3, "cannot confirm", for every migration
`tools/idea-status.py` cannot derive a probe from. Measured on this tree from
0200 up: **0202, 0203 and 0206 yield no probe at all**, so the tool could never
answer better than 3 for that range however healthy production was. Six lanes
stopped there.

It now reads the table first and runs the object probes regardless.

**The object probes are not deleted and the object probe wins.** A history row
is a CLAIM -- the seed wrote 209 of them from a list a person compiled, and
`apply-migration.mjs` writes one because it believes its own apply committed. An
object probe is EVIDENCE. The row can be wrong in the one direction that
matters, claiming an apply that never happened, and the object probe is the only
check in this repository that catches it. The tool's own header carries the
whole table and the reason; in short:

| row | probe | state | who decided |
| --- | --- | --- | --- |
| yes | applied | applied | both agree |
| yes | NOT applied | **NOT applied**, exit 2 | the probe. Named as a CONFLICT. |
| yes | no probe | applied | the row -- the only case it decides alone |
| no | applied | applied | the probe |
| no | NOT applied | NOT applied, exit 2 | the probe |
| no | no probe | **CANNOT SAY**, exit 3 | neither |
| no table | any | the probes alone | the pre-seed behaviour, unchanged |

**Exit 3 still exists and still means cannot confirm.** What the table removed
is the case where a migration had no probe AND nothing else to ask. A row is
never read as evidence against a probe that ran.

**The third argument defaults to the pre-seed behaviour, and that is load
bearing rather than tidy.** `tools/apply-migration.mjs` imports `verdicts` and
calls it with two arguments, and is not this bundle's file to change; a test
asserts the two-argument call is deep-equal to the three-argument call with no
table.

## Two defects this bundle created and the instruments caught

Both are worth recording because in each case the cheaper instrument was green.

**`psql` prints a command tag and `--tuples-only` does not suppress it.** `set
transaction read only;` emits a bare `SET` line ahead of the answer. The first
version of the presence read took the first non-empty line as the answer, read
`SET`, and reported that it could not tell whether the table exists -- which
measures as `cannotRun` on a perfectly reachable database. **The stubbed test
could not see it**; it was caught by `tests/db/deploy-probe-history-live.test.ts`
running the real SQL through the real `psql` against a real Postgres. Both
history reads now match a LABELLED row (`history-table|present`, `v|0211`),
which is the discipline `runSql` has always had and is why it never had the bug.
The live test now pins that the tag IS present and first, so a reader that
stopped seeing it cannot make the guard vacuous.

**An apostrophe inside a single-quoted `jq` program.** A summary sentence added
to the status-2 arm read `production's catalog`, which closed the quote early
and made the entire step a syntax error -- bash exit 2, before one statement
ran. The YAML still parsed. `svelte-check` says nothing. Re-reading the diff did
not catch it. The step tests caught it only because they RUN the body. `bash -n`
over every `run:` body in `deploy.yml` is now a standing check with its own
positive control.

## Three stale claims corrected, and no more

Each was named by ledger 0209 and by `docs/history/beautiful-galileo-wllnhx.md`
as going stale the moment the seed was pasted, and each was true before
2026-09-13.

1. **`CLAUDE.md`, the `supabase db push` rule.** It asserted the remote has no
   `supabase_migrations.schema_migrations` table at all. It has one, with 209
   rows. **The rule stands and its reason changed**: `db push` is still not a
   way to apply ONE file, because it plans whatever it computes to be
   outstanding against the one production database with nobody reading the plan.
   The corollary went with it -- an empty `remote` column in
   `supabase migration list --linked` is no longer the normal state and is now
   worth looking at.
2. **`CLAUDE.md`, the `$env` section's credential census.** It is the `$env`
   surface only, and two Postgres connection strings now sit outside it:
   `IDEA_MIGRATION_URL` (write, one reader, held by `migrate.yml`) and
   `DEPLOY_PROBE_URL` (read-only, one reader, unset as a secret). The section's
   closing sentence claimed nothing in this repo can apply a migration; that
   half is false and is corrected, while the part that is still true -- a cloud
   container cannot open 5432 at all -- is kept and stated as measured.
3. **`deploy.yml`'s claim that nothing in CI and no cloud session may hold a
   write credential.** `migrate.yml` holds `IDEA_MIGRATION_URL` and applies the
   lowest unapplied migration on a merge to `main`. **This one is not in
   `CLAUDE.md`** -- `deploy.yml` is not mentioned anywhere in that file -- so it
   was corrected where it lives, in a file this bundle owns, with a pointer to
   `migrate.yml`'s own header for the other half of the decision (undo the seed
   and the secret must go with it).

Nothing else in `CLAUDE.md` was touched.

## What was measured

- **Baseline off `origin/integration` at `9b010f53`**, before any edit:
  `svelte-check` 0 errors, 37 warnings in 20 files, 31/5/1 -- matching
  `CLAUDE.md` exactly, needing no correction, after exporting the two public
  values and running `svelte-kit sync` (a checkout with no `.env` reports
  phantom errors). Full suite 460 files, 8737 tests, 0 failures, 440.15s.
- **Defect one reproduced before the fix**, locally, with a positive control:
  the real body shape under `bash -e` exits 1 printing nothing; the same with
  `set +e` prints `probe exit: 1` and continues.
- **Defect two re-verified before the fix**: 0202, 0203 and 0206 derive no probe
  from `tools/idea-status.py --json --since 200`.
- **Planted controls in both directions, five of them**, at the combination
  level and again against a real Postgres: a history row with the objects
  present; a row with the objects ABSENT (which is exit 2 and a named conflict);
  no row with the objects present; no table at all; and no credential.
- **The `to_regclass` guard proven necessary**, not assumed: the same read
  written as a plain `select` on the missing relation raises `does not exist`,
  which under `--single-transaction` with `ON_ERROR_STOP=1` would take the
  object probes down with it.
- **Both history statements proven unable to write**, by running a `create
  table` in the same shape and watching Postgres refuse it, then confirming the
  table is absent afterwards.
- **The full suite on the finished tree: 463 files, 8783 tests, 0 failures,
  467.08s.** Read off the summary line. **The run before it reported `Tests 2
  failed | 8781 passed` while `npm test` EXITED 0**, which is ledger 0199's trap
  arriving in this bundle rather than being quoted by it: judged by the exit
  code the tree would have been called green with two red tests in it. Both
  failures were this bundle's own stubbed fixtures in
  `tests/deploy-probe-history.test.ts`, still emitting the pre-fix wire shape
  after the labelled-row repair -- a stub tidier than its real producer, which
  is the thing `CLAUDE.md` says a fixture must never be. They now carry the
  `SET` tag `psql` actually prints, and the tag case is pinned in the cheap
  instrument as well as the live one.
- **Mutation proof, 15 mutants, 15 killed.** Judged by vitest's SUMMARY LINE and
  never by its exit code (ledger 0199's trap: `npm test` exits 0 with a failing
  test here), restoring from an in-memory copy and never with
  `git checkout --`, with an md5 check after every restore and an
  instrument-failure branch for a run whose summary cannot be found.
- **`node tools/claude-md-check.mjs`: agrees with the tree.**

## What was NOT verified

- **Anything against production.** There is no credential in this container and
  no route: `DEPLOY_PROBE_URL` is unset as a repository secret. Every claim
  about what production holds in this entry is Mr. Pina's report of the seed
  verification, not a measurement taken here.
- **That `deploy.yml` behaves this way on a real runner.** The step body was
  executed, under GitHub's own shell invocation, but in this container and
  against a stub probe. The first `workflow_dispatch` after this lands is the
  measurement, and gate 4 passing for the first time deserves more scrutiny than
  a gate that always did.
- **No browser pass**, and none is called for: no file under `src/` changed.
