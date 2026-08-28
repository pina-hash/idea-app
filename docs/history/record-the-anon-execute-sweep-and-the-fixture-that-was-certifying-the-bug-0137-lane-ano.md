---
title: "The anon EXECUTE sweep, and the fixture that was certifying the bug (`0137`, `lane/anon-execute-sweep`)"
date: 2026-08-25
branches: [lane/anon-execute-sweep]
migrations: ["0137"]
subsystems: ["Platform & access", "Curriculum, migrations, policy"]
record_order: 145
---

## The anon EXECUTE sweep, and the fixture that was certifying the bug (`0137`, `lane/anon-execute-sweep`)

**Branch:** `lane/anon-execute-sweep`. **Migration:** `supabase/migrations/0137_anon_execute_sweep.sql`.

### What it closes

Every migration in this repo narrows a function with `revoke all on function f
from public`. On a hosted Supabase project that removes the PUBLIC entry and
nothing else, because the project's default privileges wrote a DIRECT grant to
`anon`, `authenticated` and `service_role` into the function's `proacl` at
creation time. Measured on the full 136-migration chain: **360 of 369 functions
in `public` were reachable by `anon`.** After 0137: **18**, which are the
deliberate public surfaces.

### The partition, which was the whole job

**Kept for `anon` (18)** -- every one is a function some migration granted to
`anon` in its own text, not a guess about what looks public: the eight
`coin_public_*` ledger RPCs; `classroom_public_reference`,
`classroom_public_attachment`, `classroom_attachment_object_is_public` and
`_classroom_item_live`; `app_short_link_target`; and the five unauthenticated
GAUNTLET run-path functions (`gauntlet_macro_start` / `_submit`,
`gauntlet_run_targets`, `gauntlet_run_events_insert`,
`gauntlet_run_analysis_upsert`), which 0016 documents as "the Start macro is
unauthenticated (anon key); the code is the credential".

**A SECOND PARTITION APPEARED HALFWAY THROUGH AND IS THE MORE SERIOUS HALF.**
The same default privileges hand `authenticated` a direct grant too, and
**88 functions in this schema are granted to nobody by any migration** -- the
`_`-prefixed helpers the repo deliberately keeps unreachable, among them
`_notebook_user_id_for_email`, the uuid/email bridge CLAUDE.md says must never
become a granted view because "a granted email-to-uuid view is a school
directory". On production every one of them is callable by any signed-in
student. Those 88 lose `authenticated` as well as `anon`. Three exclusions,
each measured rather than assumed:

- **`is_teacher`** is named inside RLS policies. A function in a `using` clause
  is evaluated as the QUERYING role, so revoking it does not narrow the read,
  it breaks it. This is the 0070 lesson 0109 writes down.
- **8 trigger functions** fire without an EXECUTE check and error on a direct
  call, so revoking them is churn.
- **`service_role` is never touched, on either partition.** 0131 is the
  cautionary tale: a CHECK constraint's function runs as the WRITING role.

**Where the uncertainty is:** the five GAUNTLET entries are kept on the strength
of the migrations' stated intent; this bundle did not re-confirm the macro still
calls them. Keeping is the conservative direction. And of the 88, eight are not
`_`-prefixed (`coin_eating_pass_active`, `coin_eating_pass_strikes`,
`gauntlet_gen_code`, `gauntlet_gen_room_code`, `gauntlet_jnum`,
`gauntlet_publish_blocker`, `greenline_item_price`, `role_for_email`); they
qualify by the same rule (no migration grants them) but they are the entries a
reviewer should look at hardest.

### It preserves every other role exactly

The loop captures each function's grantees BEFORE the revoke and puts them all
back except the one being removed, and separately re-grants `authenticated` and
`service_role` when `has_function_privilege` said they held EXECUTE -- which
covers access that came through PUBLIC rather than a direct grant. So no role
loses anything it had and none gains anything. Measured: `service_role`
**362 -> 362, unchanged**; `authenticated` 362 -> 280, and every function that
lost it is on the private list.

### The fixture correction ships in the same commit

`tests/db/supabase-stub.sql` set no default privileges, so the whole class of
defect was invisible here and **41 assertions across 32 files were passing
vacuously**. Three lines added; the suite is green *with them* because 0137 makes
the assertions true rather than because the fixture is lying.

**Chains had to move with it.** 0137 is a sweep over whatever the chain above it
created, so it goes LAST in every chain -- including the harness default. Five
files needed hand work rather than an appended line: `notebook-session-postings`,
`coin-medium` and `classroom-leveled-rubrics` apply a migration BY HAND after
the chain, and re-creating a function under the project's default privileges
hands the new one a fresh `anon` grant, so the sweep is re-applied after each;
`notebook-draft-state` and `notebook-session-postings` also filter 0137 out of
their "world as it was" halves, because a before-state carrying a sweep from 39
migrations in the future is not that world.

### Verified

- **Full 136-migration chain, then 0137 twice on the same database.** Both
  passes identical: `anon` 360 -> 18 -> 18, `authenticated` 362 -> 280 -> 280,
  `service_role` 362 -> 362 -> 362.
- **Suite: 2545 passed, 2 failed**, both the pre-existing
  `spec-instructions-budget` failures from a classroom export. `svelte-check`
  0 errors / 37 warnings.
- **The assertions bite.** `classroom_set_rubric` was moved onto the keep list
  -- a wrong partition decision, which is the failure mode that matters -- and
  `classroom-leveled-rubrics.test.ts` reddened by name:
  `classroom_set_rubric(uuid, jsonb): expected true to be false`. Restored
  md5-identical (`80a4a143b7581067cbded3df3e5906a8`) and re-verified green.
  Before the stub correction that same mutation changed nothing at all.

### A process note worth recording

Midway through, a `git checkout -- tests/` reverted the stub correction and it
was not noticed for several suite runs, all of which went green against the
lying fixture. It surfaced only because a mutation that should have reddened
did not. **A green run against an unverified fixture proves nothing**, and the
tell was that the mutation was inert -- which is the same instrument this file's
own verification depends on.

### NOT verified

- **Nothing has run against production.** All figures are from the embedded
  Postgres with the real migration files applied in order, under a stub
  corrected to match a hosted project's default privileges. A reconnaissance
  query for the live database is in the session report; production may diverge
  from source if anything was ever granted by hand.
- The eight non-`_` private helpers and the five GAUNTLET keeps are classified
  from migration text, not from observing a caller.

---

