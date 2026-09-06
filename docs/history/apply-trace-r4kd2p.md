---
title: "`tools/apply-migration.mjs` now asks the bundle's ledger entry whether a migration was permitted, and writes a committed record under `docs/migrations-applied/` when one applies -- plus the honest state of `idea_migrator`, which exists with LOGIN and nothing else (`claude/apply-trace-r4kd2p`, no migration)"
date: 2026-09-06
branches: [claude/apply-trace-r4kd2p]
migrations: []
subsystems: ["Tooling", "Migrations", "Security", "Standards", "Decisions"]
---

Mr. Pina turned migration applies over to sessions on 2026-09-05. The scoped
role that was supposed to make that safe does not exist in any useful form, and
the guard it was designed around cannot be installed on Supabase at all (prompt
0065). So `tools/apply-migration.mjs` is the only thing between a session and
the production database, and this bundle closes the two holes in it that mattered
least when a person was in the loop and most now that nobody is.

**Nothing was applied anywhere.** `IDEA_MIGRATION_URL` was **not set** in this
session's environment, and no code path here would have used it if it had been:
every database in this bundle is a local one the harness created.

## What a person could reconstruct before this (A2)

Three artefacts, and the timing is the problem with all of them.

| artefact | written | records |
| --- | --- | --- |
| the ledger entry | **before** the work, as the bundle's FIRST commit | an intention |
| the history entry | at the end, by the session | whatever the session chose to say |
| the session's report | at the end, in chat | not in the repository at all |

So the two artefacts that live in the repository are a plan written before
anything happened and a narrative written afterwards by the same actor, and
neither is produced by the act itself. A migration that applied, raised halfway,
or was never run at all leaves the same evidence.

The tool contributed nothing: it imports exactly `readFileSync` and
`readdirSync` from `node:fs` and no write API of any kind, which its header
stated as a virtue. **It was a virtue about failure and silence about success.**

## The ledger gate

**The ordering rule was never an authorisation rule and that is the whole
argument.** `orderVerdict` refuses anything that is not the lowest unapplied
file, which is a good correctness check -- but a migration a session invented
and nobody asked for IS the lowest unapplied file the moment it is committed.
The ordering rule waves it straight through, correctly, because it is answering
a different question.

Meanwhile every bundle has declared the answer in writing since prompt 0001 and
nothing read it. Swept across all 66 entries on `origin/integration`: **every
single one carries a `Migration permitted:` line**, 42 refusing and 24
permitting. That distribution is what makes "no line means refuse" a safe
default rather than a rule that refuses everybody, and it is asserted as such.

**The line has two meanings and many spellings**, so the partition is `^no\b`
and nothing cleverer:

```
REFUSE   no. Highest on origin/main at issue: 0184
REFUSE   no. The role file carries a password and is not a migration.
PERMIT   at most one, number taken at commit time. Highest ...: 0180
PERMIT   exactly one, 0176. Highest on origin/main at issue: 0175
PERMIT   yes, exactly one, 0170. Highest ...: 0169
PERMIT   at most one, conditional. Highest ...: 0180
PERMIT   only if A3 proved it. Highest ...: 0180. NONE WRITTEN: ...
```

Not one permitting spelling in the corpus permits two, so "permits" means at
most one.

**THE PERMISSION REFUSES AND THE NUMBER ONLY WARNS**, which prompt 0066 asked me
to justify. 23 of the 66 entries say "number taken at commit time" precisely
because the number is not knowable when the entry is written; prompt 0056
renumbered mid-session, and prompt 0064's own line records taking 0184 after
0183 landed on main mid-flight. Two pairs of entries name the same number as
each other (0014/0015 both say 0173, 0031/0034 both say 0177). A gate that
refused on a mismatch would refuse the ordinary case. So a mismatch is a warning
carried into the committed record, where somebody reading the trace afterwards
sees it, and the refusal is reserved for the one thing an entry can state
unambiguously at issue time.

**AND THE NUMBER IS READ ONLY FROM THE PERMITTING CLAUSE.** Every entry --
including every refusing one -- carries `Highest on origin/main at issue: 0184`,
so a four-digit scan over the whole line would report 0184 as the permitted
number for a bundle permitted nothing. There is a test for exactly that, with a
positive control beside it.

### How the tool learns which bundle it is under

**Not the `Branch:` line, which is the obvious candidate and is the wrong one.**
It is a human sentence -- "none on the remote", "`claude/x` at `0d73f72`, swept
into integration as `2b54d87`, deployed to main as ..." -- and for the bundle
currently RUNNING it reads "assigned by the harness", because it is filled in at
the end. Keying on it would key on the one field that is reliably wrong at
exactly the moment the tool runs.

What is reliable is the repository's own standing rule: **a bundle's first
commit is its ledger entry.** So the tool asks git for the ledger entries this
branch ADDS relative to `origin/integration`, then `origin/main`; the first base
yielding exactly one wins. Measured on this branch, it answers `0066`.

**When it cannot tell, it refuses, and `--ledger 0066` recovers it in one flag.**
Fail-closed is right and unusable is not, so every refusal in `resolveLedger`
carries a `how` line, and there is a test that walks three different refusal
shapes and asserts each one does.

**"At most one" is counted across INVOCATIONS, not per command line**, or a
session applies 0185 and then 0186 as two perfectly ordinary runs. The committed
record from the other half of this bundle is what makes that answerable: before
applying, the tool looks for a record already carrying this ledger id.

## The trace

One file per successful apply, `docs/migrations-applied/<nnnn>-<branch slug>.md`.

**The name follows the history split, and for the same stated reason.**
`classroom-updates.json` is the counter-example this repository already has: one
shared array, appended by every session, a conflict every time. The slug is the
branch with `claude/` or `lane/` stripped, exactly as `docs/history/` takes it,
and CLAUDE.md's argument carries over unchanged -- the harness mints one branch
per session and a branch name cannot be taken twice, so collision-freedom is by
construction rather than by anyone checking. The number alone would very nearly
work, since the ordering rule refuses an already-applied migration; it would
lose exactly one race, two sessions that both read the probe before either
committed. Two sessions are two branches.

It records the number, the filename, the sha256 of the bytes as applied, the
UTC instant, the authorising ledger entry with its permission line quoted in
full, the branch and commit, every notice in order with its severity, and the
per-object verification as a table.

**On the connection string.** No host, no port, no password, and the URL never
reaches the writer; every free-text field goes through `redact` on the way in,
so a URL appearing inside a notice is masked rather than committed to a public
repository. **`session_user` and `database` ARE recorded, and that is a
deliberate reading of "nothing from the connection string".** They are answers
the SERVER gave to a query rather than strings parsed out of the URL, and "this
ran as `postgres` rather than `idea_migrator`" is precisely the fact the record
exists to be able to state -- withholding it would make the trace unable to
answer its own question. That reasoning is written into the function.

**The write has exactly one call site and it sits after the commit and after
verification**, so every path that applied nothing returns before reaching it.
That is the mechanism, rather than a flag somebody has to keep true.

**It is written for `unverified` too**, not only for a clean run: "it applied and
one object is missing" is exactly the run somebody needs to find afterwards, and
a trace covering only the clean case would be missing the interesting half.

**If the write itself fails, the tool shouts and still reports the apply as
having happened**, naming the file to write by hand. Reporting a committed apply
as a failure is how somebody runs it a second time.

## What was measured

**B1's required control, both halves, against a real Postgres.**

- **Fails DURING the apply**: `create table` followed by a `raise exception`.
  The transaction rolls back, the directory is unchanged, and
  `to_regclass('public.t_during')` is null.
- **Fails AFTER the commit, before the write**: the apply commits, then the
  post-apply verification query throws the way a broken claim derivation would.
  The directory is unchanged and the table IS there -- a real "applied but
  untraced" moment, which the tool shouts about rather than describing a run it
  could not describe.
- **Positive control**: a run that commits DOES get a record, with the real
  notices and the real per-object result in it. Without this the two absences
  above would pass against a writer that never wrote anything at all.

**B2's three controls**, plus three more the shapes suggested: an entry saying
`no` refuses and names who can change it (and a positive control that the same
fixture with a permitting line passes); an entry permitting one allows the first
and refuses the second, keyed on the record the first wrote, with a different
ledger id proven unaffected; no entry at all refuses; an entry with no
permission line refuses; an ambiguous number refuses rather than picking; and
every refusal carries a recovery.

**The whole thing through the real CLI, against a real Postgres.** Unit tests of
every part pass just as well against a `main()` that calls none of them, so
three tests drive the binary: the gate refusing before any connection (no
`session_user` line in the output, which is how you can tell), a dry run passing
every check and writing nothing, and **a real migration really applied** --
`0042_frc_gate_submissions.sql` onto the 41 files below it -- writing exactly
one record, followed by a second run under the same ledger being refused on the
record the first one wrote.

**THE TARGET IS 0042 BECAUSE OF THE FIXTURE, NOT THE TOOL.**
`tests/db/supabase-stub.sql` has no `auth.jwt()`, which 0043 is the first
migration to need. Measured: a chain of everything below 0043 boots, and adding
0043 fails with `function auth.jwt() does not exist`. So 0042 is the deepest
honest end-to-end apply available here, and the test says so rather than
implying full-chain coverage.

**Mutation proof, four mutants, each restored from a `cp` copy and md5-verified
against `045f2897a1a5069dd59c423d81609486`.** No `git checkout --` was run on
any file in this session.

| mutation | reddened |
| --- | --- |
| the `^no` refusal removed from `ledgerPermission` | 7 tests |
| the `Highest on origin/main` clause no longer stripped before reading a number | 3 tests |
| `appliesUnderLedger` never matches, so "at most one" never fires | 1 test |
| `redact` removed from the record renderer | 2 tests |

## Two things caught while building, worth recording

**A control that certified its own absence.** The end-to-end apply test's first
draft treated a non-zero exit as "a real answer about the chain, not a failure
of this test" and returned early. That would have gone green having applied
nothing and proved nothing -- the exact shape this repository's own rules warn
about. It now requires exit 0 and prints the CLI's stdout and stderr in the
failure message.

**A sweep that matched itself.** The B4 credential sweep searches test sources
for `process.env[URL_VAR]` and for the CLI's path; written as plain literals,
those needles are in the sweep's own source, so it reported itself as an
offender -- which reads exactly like a real finding. The needles are built by
concatenation now, with the reason beside them.

**And a bad needle in an assertion.** `expect(output).not.toContain(password)`
looked right and is wrong here: the harness cluster's password is the literal
string `postgres`, which is also the role name the tool legitimately prints as
`session_user postgres`. The assertion is on the URL instead, and the reason is
in a comment so nobody re-adds it.

## B4: what this cannot rule out

`tests/apply-migration-trace.test.ts` proves two things about the SUITE: no test
reads the credential's value out of the environment, and every test that spawns
the CLI either sets `IDEA_MIGRATION_URL` to the harness URL or deletes it. The
second is the one that matters -- `env: { ...process.env }` with no override
would point the real tool at the real database with nothing on screen saying so,
and both existing spawns were already careful.

**IT CANNOT PROVE A SESSION WILL NOT POINT THE TOOL AT PRODUCTION, and that is
written into the test rather than assumed away.** The tool is handed one URL and
has no second source of truth to check it against; there is no marker on a
connection that says "this one is real", and a tool that refused the real
database would have no purpose. What stands between a session and an unwanted
write is four things, none of them a sandbox: the statement scanner (0065), the
ledger gate (0066), the ordering rule, and the committed record.

## `idea_migrator` exists and nobody uses it

The role was created on the production project with LOGIN and nothing else. The
paste stopped at `grant postgres to idea_migrator`, refused on PostgreSQL 17.0.6
from the SQL editor -- **exactly as that file's own "THE SERVER VERSION DECIDES
WHETHER THIS PASTE CAN SUCCEED" section predicted**, written a bundle earlier
from measurements on 17.10. Finishing it needs a superuser, which needs a
Supabase support ticket, and Mr. Pina declined to raise one.

**That is a decision, not an outstanding task**, and the file now opens by saying
so, because a file describing a credential nobody holds with nothing saying so is
how the next reader concludes the project applies migrations as `idea_migrator`.
What the tool connects as is the project's own `postgres` string, and it warns
about that on every single run.

**Nothing was lost.** Membership in `postgres` IS `postgres`: the privilege on
the far side of that grant is identical to the privilege the connection string
already carries. The role would have bought a separate USERNAME -- useful for
reading a log, worth nothing as a boundary -- because the narrowing the whole
design rested on was an event trigger Supabase does not permit. The "WHAT DOES
NOT PROTECT YOU" section is kept whole and is true word for word of the
credential in use, with one difference: its item 8 no longer needs a
`set role postgres` first, because the session already is `postgres`.

Decision 15's Status line records the same.

## Verification

- **`npx svelte-check`: 0 errors, 37 warnings**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`, over 20 files -- the documented baseline. It was 5
  errors first: four JSDoc typing gaps in the new code and one `pg.Notice` that
  is not an exported member. All five were mine and all five are fixed.
  `PUBLIC_SUPABASE_*` placeholders exported before `svelte-kit sync`, per the
  documented phantom-error trap.
- **Full suite, 2026-09-05 22:14:19 to 22:18:13 America/Los_Angeles**: 291 files,
  **5952 passed, 4 failed**, 233.05s.
- **THE 4 FAILURES ARE THE KNOWN PRE-EXISTING ONES** -- two in
  `tests/derived-numbers.test.ts` (browser-verify README region counts) and two
  in `tests/gauntlet-doc.test.ts`. Prompt 0066 named them and said four sessions
  in a row have each proved they are not theirs; the previous session proved it
  again with a worktree at `origin/integration`. Reported as found, not fixed,
  and nothing in this bundle touches either subsystem.
- **NOT VERIFIED: nothing ran against the live Supabase project.**
  `IDEA_MIGRATION_URL` was not set in this session and no connection was opened
  with it. The apply path is exercised only against harness Postgres instances.
  In particular, nobody has yet run this tool for real with the gate in place, so
  the first real apply is also the first test of the gate on the real ledger.
- No browser pass was run and none was relevant: this bundle changes no surface.

## What is deliberately not here

- **`supabase db push`.** Forbidden, untouched, and staying so.
- **Any use of the credential.** Not read, not connected, not tested against.
- **A number-based refusal.** Argued above; it would refuse the ordinary case.
- **A tamper-proof audit log.** The record is written by the same process that
  does the applying, into a repository that process can also edit. It catches a
  session that forgot. It does not catch a session that meant to, and
  `docs/migrations-applied/README.md` says that in its own last paragraph.
- **Anything in `supabase/roles/idea_migrator.sql` below its header**, which
  0066 did not own. The SQL is unchanged and still ready to paste if a support
  ticket is ever raised.
