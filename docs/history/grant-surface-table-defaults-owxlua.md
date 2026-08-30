---
title: "The table default privileges move into the shared stub, and two notebook tests stop asserting a grant production does not have (`claude/grant-surface-table-defaults-owxlua`, no migration)"
date: 2026-08-29
branches: [claude/grant-surface-table-defaults-owxlua]
migrations: []
subsystems: ["Testing", "Database", "Security", "Notebook"]
---

The previous bundle (`claude/grant-surface-reconciliation-y3osiy`, migration
`0149`) measured that `tests/db/supabase-stub.sql` carried the FUNCTION half of a
hosted Supabase project's bootstrap default privileges and never the TABLE half,
kept the missing half in its own test's prelude, and named moving it into the
shared stub as deferred work: "**every other db suite still runs without table
default privileges, so an assertion elsewhere that `anon` cannot select something
is still weaker than it looks.**"

This is that move. **It found two.**

---

## What moved, and what deliberately did not

`tests/db/supabase-stub.sql` now issues all three bootstrap statements
(`functions`, `tables`, `sequences`) instead of one, so every database file in
the suite -- 48 of them -- applies its migrations to a fixture where a new table
or view arrives holding SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and
TRIGGER for `anon` and `authenticated`, exactly as production does. The header
that argued the function half now argues all three, in one place.

`tests/db/hosted-table-default-privileges.sql` is renamed
`tests/db/full-chain-fixture-completion.sql`, because after the move its name
was a lie: what is left in it is `auth.jwt()` (read by `0043`) and an empty
`supabase_realtime` publication (`0064` adds a table to it), which only the full
chain reaches. `tests/grant-surface.test.ts` applies it as before under the new
name.

**The realtime publication must NOT move into the shared stub, and that is a
finding rather than a preference.** `tests/notebook-review-acknowledged.test.ts`
asserts, as a test, that the fixture has NO `supabase_realtime` publication
("does nothing at all where no publication exists") and then CREATES one itself
in three sibling tests to exercise the other world. Both worlds are real -- the
Supabase dashboard is editable, so a project may or may not have published
anything -- so putting it in the stub would delete one of them and raise `42710`
in the other three. The reason is written into the file that keeps it.

`auth.jwt()` stayed with the publication rather than moving to the stub. It is
the same class as the `auth.uid()` already there and moving it would be
defensible; nothing needs it outside the full chain today, and a second edit to
a file 48 suites share buys nothing.

## The guard survived, and is doing more work than it was

`tests/grant-surface.test.ts` keeps its probe: it creates a table, reads back
what `anon` inherited, and fails if any of the seven is missing. **That guard is
more load-bearing after this change, not less.** When the defaults sat in that
file's own prelude the `beforeAll` named them literally, so a reader could see
them; now they are three lines in a file the test never mentions. Its failure
message was rewritten to say so, and to name the wider blast radius: if that line
is moved, narrowed or lost, every absence assertion in that file is vacuous **and
so is every assertion in the other db suites that a client role cannot reach
something.**

It probes an object it creates ITSELF rather than reading `pg_default_acl`,
because what matters is what a new object actually inherits, which is the thing
production does differently.

## The two findings

Four tests across two files went red. **Both were asserting a privilege
production does not withhold**, and in both cases the privilege was standing in
for a guarantee enforced by something else entirely.

### 1. `notebook_folders`: RLS refuses an INSERT and SILENTLY NO-OPS an UPDATE

`tests/notebook-folders.test.ts` > "there is no client write path to
notebook_folders" asserted `rejects 42501` for INSERT, UPDATE and DELETE, for
three actors. `0088` created the table and, unlike `0069` next door, **never
wrote the `revoke all ... from anon, authenticated`**. Measured on the fixture
now: `notebook_folders.relacl` is `authenticated=arwdDxtm/postgres` -- the whole
set, `anon` included.

Driven as `authenticated` against a folder the actor owns:

| statement | result |
| --- | --- |
| `insert` | **42501**, "new row violates row-level security policy" |
| `update` | **SUCCEEDS**, `rowCount` 0 |
| `delete` | **SUCCEEDS**, `rowCount` 0 |

The policy set is two SELECT policies and nothing else (`polcmd = 'r'`, both).
A table with RLS on and no INSERT policy REFUSES an insert, because a failed
WITH CHECK is an error -- but **an UPDATE or DELETE denied by RLS is not an
error, it is zero rows.** So one assertion could never have covered the three
verbs, and the one that was there was asserting the grant rather than the
containment.

**This is live on production today**: `0149` revokes it and `0149` has not been
applied. Nothing lands, but what stops it is RLS filtering to zero rows, not the
absence of a grant -- which means a policy added for a READ is capable of opening
a WRITE here, silently, with no test in a position to notice.

TRUNCATE, which RLS does not constrain at all, is the one worth naming
separately. Measured: a bare `truncate public.notebook_folders` as
`authenticated` is refused `0A000` ("cannot truncate a table referenced in a
foreign key constraint"), and `truncate ... cascade` is refused `42501`
"permission denied for table notebook_entries" -- because `0069` DID write its
revoke and `authenticated` holds only SELECT there. **So the privilege is real
and its containment is incidental**: a foreign key, and a neighbouring table's
correct revoke.

The repair asserts the guarantee in the block's own name -- nothing lands -- by
distinguishing a raise from a zero-row no-op and then READING THE ROW BACK and
requiring it unchanged, which the old form never did. That holds in both worlds,
before `0149` and after. The privilege claim is not dropped: it moved to
`tests/grant-surface.test.ts`, which reconciles the whole catalog over the whole
chain and where `notebook_folders` appears in neither `ANON_SURFACE` nor
`AUTHENTICATED_WRITE_SURFACE`, so any write grant on it reddens.

### 2. `notebook_entry_activity`: the `anon` grant is real and inert for a reason the test never named

`tests/notebook-pin-activity.test.ts` > "anon can read nothing from it" asserted
`has_table_privilege('anon', <the view>, 'select')` is false. Measured now:
`notebook_entry_activity.relacl` is `anon=arwdDxtm/postgres`. It is one of the
six objects the 2026-08-28 production catalog sweep found, and `0149` -- which
that file's chain deliberately predates -- is what revokes it.

**The grant was never what made the heading true.** Driven as a real signed-out
session, `select * from public.notebook_entry_activity` is refused `42501
permission denied for table notebook_entries`. Two things make that so, and both
are necessary: the view is `security_invoker = true`, so it runs as the CALLER
rather than as its owner; and `notebook_entries` holds nothing for `anon`
(`relacl` `{postgres=arwdDxtm, service_role=arwdDxtm, authenticated=r}`) because
`0069` wrote the revoke `0091` did not.

The repair drives the anon session and asserts the refusal, then asserts the
mechanism on the object that actually carries it -- `anon` holds none of the
seven on `notebook_entries`. The refusal naming the BASE table rather than the
view is itself the tell that the view's own grant is not what refused.

### Both repairs gained a positive control

Each rewritten block is an absence assertion over statements that now RETURN
NORMALLY, which is the shape that passes when the harness has stopped reaching
the database. `notebook-folders` gained "the RPC that is the only write path does
move the row" (the same actor, the same row, through
`notebook_upsert_folder`, restored afterwards); `notebook-pin-activity` gained
"the same view is readable by the student it belongs to". Those two are the +2
tests in the count below.

## Accounting for what did NOT go red

Four reds out of **31 `has_table_privilege` / `relacl` assertion sites across 22
files** is few enough to be suspicious, and the premise of the change is that
this fixture has been permissive, so a clean sweep would have meant the defaults
did not take. Both halves were checked rather than banked:

- **The defaults took.** `tests/grant-surface.test.ts`'s probe creates a table
  and reads back all seven for `anon`. Independently, the ad-hoc probe run for
  this bundle read `notebook_folders.relacl` as `authenticated=arwdDxtm/postgres`
  where before it held only what `0088` granted.
- **The four reds ARE the positive control for the sweep**: the change
  demonstrably bites, in two files that had no idea they were relying on it.
- **The other 27 sites pass because their migrations wrote real revokes**, which
  is now measured rather than assumed -- they were put to a fixture that would
  have reddened them otherwise. `tests/gauntlet-modeling-reveal.test.ts`'s
  `anon` claim on `gauntlet_leaderboard` is the worked example: `0060:115` is
  `revoke all on public.gauntlet_leaderboard from anon`, so that assertion was
  always honest and would always have caught a regression.

## Verification

- **Baseline, this branch's tip (`7a4ba7b`, `origin/integration`, unmodified):
  164 files / 3539 tests passing.** The prompt's figure of 159/3444 is the
  previous bundle's own measurement at ITS tip; `integration` has absorbed five
  more files and 95 more tests since, and this is stated so the difference is not
  read as this change's doing.
- **After: 164 files / 3541 tests passing.** +2, and both are the new positive
  controls named above (`notebook-folders` 28 -> 29, `notebook-pin-activity`
  19 -> 20). No file added or removed. Three tests were rewritten in place in
  `notebook-folders` and one in `notebook-pin-activity`, so the count moves only
  by the two additions.
- `svelte-check` **0 errors / 37 warnings**, mix **31** `state_referenced_locally`
  / **5** `css_unused_selector` / **1** `perf_avoid_nested_class`. Unchanged;
  nothing under `src/` was touched.
- **Mutation proof.** The two `alter default privileges ... on tables/sequences`
  statements were removed from the shared stub: `tests/grant-surface.test.ts`
  reddens on **exactly one** test, its fixture guard, whose message names the
  vacuity risk. `tests/notebook-folders.test.ts` and
  `tests/notebook-pin-activity.test.ts` stay **green under both fixtures**, which
  is the property their repairs were written for -- they assert containment,
  which does not depend on whether the inherited grant is present. The stub was
  restored from a copy, never `git checkout`, and md5-verified identical
  (`74c1b79005e429c7faebabc4e6fc5210`).

## Not verified

- **Nothing was applied to production, and `0149` still has not been.** This
  bundle contains no migration. Both findings above describe the live database as
  it stands today, inferred from the migration files and reproduced in the
  fixture -- not read off the live catalog, which nothing in this repo can reach.
- **No browser pass.** Nothing under `src/` changes, so there is no rendered
  surface to measure; `npm run verify:browser` was not run.
- The 27 surviving assertion sites were reasoned about from the fact that they
  survived a fixture that reddens the dishonest ones, and spot-checked on
  `gauntlet_leaderboard`. Each one's migration was not individually re-read.

## Deferred

**Applying `0149` is what actually closes both findings**, and it is a
hand-applied migration, not a test change. Until it is applied, `authenticated`
holds UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on `notebook_folders` and
`anon` holds all seven on `notebook_entry_activity` in the live database.

**Appending `0149` to those two notebook chains was the rejected alternative.**
It would have let both assertions stand verbatim, and it is what `0137` already
does at the end of the shared chain. It was refused because it would hide the
finding: the chains would then describe a world production is not in, and nobody
would learn that RLS no-ops rather than refuses. The assertions moved to where
they are true instead.

No `classroom-updates.json` entry: nothing a student sees changes.
