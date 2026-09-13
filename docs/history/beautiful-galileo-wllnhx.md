---
title: "Closing the migration gate: seed the history table, apply from a runner"
date: 2026-09-13
branches: ["claude/beautiful-galileo-wllnhx"]
migrations: []
subsystems: ["migrations", "ci", "tooling"]
---

Five lanes stopped at the applied-state gate in one week, each vouching for a
chain shorter than the one that existed. The gate is there because nothing in
the repository knows what production has. This bundle closes it with three
things and changes no file under `src/`.

## The premise, checked before anything was built on it

The prompt stated one fact and said to stop if it turned out to be wrong: the
remote has no `supabase_migrations.schema_migrations` table, so `supabase db
push` believes nothing is applied and plans the whole chain from `0001`.

**It holds, and the primary measurement is in this repository rather than in
anybody's memory.** `docs/history/record-idea-foundry-data-layer-0130-migration-only.md`
carries the raw error from 2026-08-23, taken against the live project
(`ifxbufvugkzfxhwcwqhf`, Postgres 17.6.1.127) after linking it:

    ERROR: 42P01: relation "supabase_migrations.schema_migrations" does not exist

`--dry-run` then planned all 130 files of the day against a database that
already had every one of them. **The two one-time imports, by file**, named the
same way in that entry and in `tools/apply-migration.mjs`'s own header:

- `supabase/migrations/0084_coin_legacy_import.sql` -- the Google Sheets ledger
  import, 71 students and ~216 transactions, written as RAW INSERTS on purpose
  because the rows are history rather than events.
- `supabase/migrations/0100_coin_legacy_reimport.sql` -- the re-import that adds
  the medium dimension `0096` introduced, with a remediation runbook at its foot.

**NOT re-measured here, and it cannot be.** No cloud session can reach this
database: the container's egress proxy answers a CONNECT to 5432 and then
carries no bytes, and there is no `IDEA_MIGRATION_URL` and no
`DEPLOY_PROBE_URL` in this container either (checked, both unset). Every claim
below about production rests on the repository's own record, and the seed is
written so that a person pasting it learns the truth from the database rather
than from this entry.

## One: the seed

`supabase/data/0209-seed-migration-history.sql`. Pasted once by hand, safe to
paste again, and it writes to `supabase_migrations.schema_migrations` and to
nothing else. It says that on its face and names its own seven statements so a
reader can check by counting rather than by trusting the sentence.

**IT HAS NO DOLLAR SIGN IN IT AT ALL.** The paste trap that cost `0194` a full
cycle is a dollar-quote token inside a `--` comment, which balances in Postgres
and breaks the editor's client-side splitter. This file needs no `do` block, so
it needs no dollar quoting, so the trap cannot fire. `grep -c '\$'` answers 0.

**The list stops at 0210, and 0211 is ASKED ABOUT rather than asserted.** This
is the load-bearing decision in the file. At branch time
`docs/migrations-applied/` carried a record for every one of `0193` through
`0210` and none for `0211`, while ledger `0203` said in words that `0211` was
"DELIVERED AND NOT APPLIED" and the prompt said it had since been pasted.
**Mid-session, ledger `0204` landed `docs/migrations-applied/0211-lucid-dirac-8b6m2f.md`
on `integration`, which says `outcome: applied`** -- and says on its own face
that it is `source: report`, Mr. Pina's account of 2026-09-13 with a
verification query's output behind it, not a measurement this repository made.
So the answer is now expected to be yes. **The conditional stayed anyway**, and
that is the decision worth recording: a `source: report` record is better than
silence and weaker than a measurement, the database can be asked for the price
of one catalog read, and the asymmetry below does not move because the evidence
got better.

The two errors are not symmetric. Under-seeding an applied migration costs a
`db push` that would re-run an idempotent file nobody runs anyway. **Over-seeding
an unapplied one is silent and permanent**: the row tells every later reader the
database holds something it does not, and `migrate.yml` skips it forever with
nothing anywhere reporting it. So statement 6 asks the database through
`public._ideacad_realtime_topic_id`, which `0211` creates, and writes the row
only on a yes. `tools/idea-status.py` derives no probe for `0211` at all, which
is why that object is named by hand here -- the machine is silent about this one
migration and a silence is not a yes.

`0190` and `0191` are not seeded and are confirmed absent in a row of their own,
so the gap reads as the decision it is.

**The verification returns rows, always, including when everything is right.**
The Supabase editor shows no `raise notice` and only the last statement's result
set; a file reporting itself through notices reports nothing. It names the table
it read, compares in both directions, and prints one row per difference by
migration number. A version at or above `0211` in the table and not in the list
is labelled EXPECTED, because that is a migration applied after the file was
written and is what is supposed to happen.

## Two: the workflow

`.github/workflows/migrate.yml`, on a push to `main`.

**A GitHub Actions runner is not behind the proxy that stops a cloud session,
and `deploy.yml` is the evidence** rather than an assumption: its `migrations`
job already runs `tools/deploy-probe.mjs`, which shells to `psql` against
`secrets.DEPLOY_PROBE_URL` and reads production's `pg_catalog` on every deploy.
That path works today. This workflow is the same runner reaching the same
database with a credential that can write.

**IT ADDS NO APPLY PATH.** Everything below is already in
`tools/apply-migration.mjs` and is therefore not in the workflow: the
destructive-DDL tokenizer that strips comments from the middle of a statement,
the top-level-DML refusal, the ledger gate and the one-migration-per-entry rule,
the applied-set read and the refusal of anything that is not the lowest
unapplied file (including when a file BELOW it is merely unknown), the single
transaction, the per-object verification, and the record under
`docs/migrations-applied/`. The workflow chooses what to hand it and commits
what it wrote.

**`SUPABASE_ACCESS_TOKEN` IS NOT SET BY IT AND MUST NOT BE.** The prompt
permitted one on the grounds that the seed makes replay impossible. It turns out
not to be needed at all: that token is the Supabase CLI's, nothing here runs the
CLI, and `apply-migration.mjs` speaks the wire protocol with a scoped-role
connection string. The narrower credential is the only one required, so the
wider one is not set. The workflow's header records both halves -- why it COULD
be safe now, and why it is still absent -- because a later reader removing the
seed has to find the consequence written down where the credential is.

**The four outcomes, and three of them touch nothing.** Nothing to do (green);
applied and verified (record committed, green); applied and NOT verified (record
committed anyway, because that is exactly the run somebody needs to find, and
red); refused or failed (nothing applied, nothing written, red).

**Probe status 1 and status 3 are split, where `deploy.yml` treats them alike.**
Status 3 -- every probe that ran said applied, and one migration has no probe --
is the ORDINARY state of this project (three migrations in range have no
derivable probe), so it stops green. Status 1 -- the probe could not run at all
-- is RED here and quiet there, and the difference is that `deploy.yml` has a
typed human confirmation as its fallback while this workflow is the only applier
there is. A silent green on a broken probe is the gate ceasing to work with
nothing saying so.

**The ledger is MATCHED, never guessed, and through the one parser.** The tool's
own inference reads a branch's added files against `origin/integration`, which
on `main` adds nothing. So the workflow finds the entry whose `Migration
permitted:` line CLAIMS that number -- through `parseEntry` and `parsePermitted`
from `tools/migration-claims.mjs`, which is the one parser of that line.
A `grep` for the digits was written first and measured wrong: for `0211` it
returned `0202` as well as `0203`, because `0202`'s line reads "Highest on
origin/main at issue: 0211" while REFUSING a migration, and for `0210` it
returned four entries. Zero matches or more than one is a refusal naming the
recovery (a dispatch input), never a nearest guess: the wrong entry spends one
bundle's permission on another bundle's file.

**The one push is guarded to one directory.** The job holds `contents: write`
for the record commit alone, and the step checks the staged set against
`docs/migrations-applied/` before pushing. Never `--force`, and a rejected push
says the migration is applied and only the record did not land, because
re-running would try to apply it again.

## Three: `tools/apply-migration.mjs` inserts its own row

The half without which the seed is a lie within a week. A record that stops
being updated is worse than none, so every apply this tool commits writes its
own `supabase_migrations.schema_migrations` row.

**Where the row goes is not the same in both cases, and that is inherent.** A
file this tool wraps gets the insert INSIDE that transaction, before the commit,
so the migration and its row are atomic. A file that opens its own transaction
has already committed by the time the tool can speak, so the insert is a second
statement afterwards. The second case reports `historyRecorded: false` on an
`ok: true` result and the run comes out `unverified` -- the migration IS applied,
and saying otherwise is how somebody applies it twice. There are ten such files
in the tree today, so this is not a hypothetical branch.

**Writability is asked BEFORE the apply, not discovered during it.** A table
that is present and not insertable REFUSES the migration with nothing sent,
rather than producing a half state somebody has to repair. Absent is not a
refusal at all: that is the pre-seed world and it has to keep working.

**`history_row:` is a front-matter field with three values**, so
`grep -L 'history_row: yes'` finds every apply that left the record behind.
`absent` and `NO` must never be confused: one is the pre-seed world, the other
is a migration applied with nothing recording it.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings in 20 files, 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`** -- re-derived off
  `origin/integration` at branch time and again at the end, both after
  `svelte-kit sync` with `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`
  exported. **The line in `CLAUDE.md` is correct and needed no correction**,
  which is worth recording after five consecutive drifts. With no `.env` the
  same tree reports **14** phantom errors in 31 files, which is one more file
  than the eleven that line names; the errors are the figure that matters and it
  was 14, as written.
- **The seed, against a real Postgres, in both directions.**
  `tests/db/migration-history-seed.test.ts` applies the file to an embedded
  cluster, asserts 208 rows, re-applies it and asserts 208 again, and reads the
  verification back. Then it plants a deleted row, a stray `0099b`, a future
  `0212` and a `0190`, and asserts each is reported in its own row with the
  right wording. **A verification that reports EQUAL when it should not is
  exactly the silent regression `CLAUDE.md` says to write a test for.**
- **The conditional `0211` row on two real databases**, one with
  `_ideacad_realtime_topic_id` present and one without: written on the first,
  withheld on the second, and the verification says which in words.
- **The history-row plumbing on real databases**: the wrapped path records and a
  raise takes the row down with the migration (asserted as an absence with the
  positive control beside it); the self-managed path records afterwards, and
  with the table renamed away the apply comes back `ok: true`,
  `historyRecorded: false`, with the migration's own table still there.
- **The workflow's shell, executed rather than read.** The YAML was parsed, each
  `run:` body extracted from the parsed document and run under `bash`: the
  ledger step resolves `0211` to `0203-ideacad-private-realtime.md` and exits 1
  with a recovery message for `0999`; the probe step exits 0 with an empty
  `target` when the secret is unset and exits 1 when it is set and the database
  is unreachable; the commit step was driven against a real bare git remote and
  committed and pushed a record, refused a staged file outside the record
  directory, and warned without failing when there was nothing to commit.
- **`tests/workflows.test.ts`: 63 passed**, sweeping the new file for the shapes
  that have actually broken a workflow here.
- **`node tools/claude-md-check.mjs`: agrees with the tree.**
- **The full suite, on the merged tree: 458 files, 8682 tests, 0 failures,
  372.8s, exit 0.** Read off the summary line rather than from the exit code,
  which is ledger 0199's trap and which cost the first reading of the branch
  point: the run before the merge reported `Test Files 1 failed | 457 passed`
  with `EXITCODE=1`, and that one failure was the branch point's, not this
  bundle's. This bundle added 9 tests and 1 file (8673 to 8682, 457 to 458).

## What was NOT verified

- **Anything against production.** No credential, and no route: 5432 is dead
  through this container's proxy. The workflow has never run, the secret does
  not exist, and the seed has never been pasted.
- **That a GitHub Actions runner can reach this particular database.** What is
  established is that `deploy.yml` already does exactly that with a read-only
  URL, and that a runner has no egress proxy. The first `workflow_dispatch` is
  the measurement.
- **That `0211` is applied to production.** The repository now says it is, in a
  record that says of itself that it is one person's report rather than a
  measurement. The seed asks the database rather than choosing, and reports.
- **No browser pass**, and none is called for: no file under `src/` changed.

## Left undone, deliberately

- **`CLAUDE.md` is not edited.** Three of its paragraphs go stale the moment the
  seed is pasted -- "NEVER RUN `supabase db push`" and its "the remote has **no**
  `supabase_migrations.schema_migrations` table at all", the `$env` section's
  reader census, and `deploy.yml`'s quoted "applying a migration ... needs a
  credential that can WRITE to production, which nothing in CI and no cloud
  session may hold". **Every one of them is still TRUE today**, because the seed
  has not been pasted and the secret is not set, and this bundle does not own
  that file while four other ledgers are in flight in it. The edit belongs to
  the bundle that lands after the seed is pasted, and it is named here so that
  bundle does not have to find it.
- **`tools/deploy-probe.mjs` still probes the catalog object by object**, so
  status 3 -- the silence that stopped five lanes -- is unchanged. Reading
  `supabase_migrations.schema_migrations` instead would end it outright, and
  that is the obvious next bundle. It is a different file, a different owner and
  a different decision about what counts as evidence, and it could not be done
  before the table existed.
- **`deploy.yml` is untouched.** Its refusal to merge while a migration is
  unapplied is not weakened by anything here; what changes is that the
  unapplied migration now gets applied by the next push to `main` instead of
  waiting for a person.

## The tree this branched from was red, and stopped being so mid-session

`origin/integration` at `78516fa2` failed `tests/db/migrations-applied-record.test.ts`
-- "has a record for every migration from 0193 onward, and no gaps" -- because
`0211_ideacad_realtime_policy.sql` was in the tree and `docs/migrations-applied/`
had no `0211-*.md`. **1 of 8673 tests, and it was never this bundle's**: ledger
`0204` was writing exactly those records. Measured on a clean `git worktree` at
the branch point before anything here was written, which is the only way that
sentence is worth anything -- a baseline measured on the tree under test is not
a baseline.

**It is green again on `34a44f2d`.** `0204` landed the `0211` record while this
bundle was being written, `origin/integration` was merged into this branch, and
that file passes. The sentence is kept rather than deleted because a bundle
whose branch point was red has to say so: everything measured against the
earlier baseline was measured against a red tree, and a reader who only sees the
green one cannot tell which.
