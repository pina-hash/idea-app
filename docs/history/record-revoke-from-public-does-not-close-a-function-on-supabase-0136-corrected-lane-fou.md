---
title: "`revoke ... from public` does not close a function on Supabase (`0136` corrected, `lane/foundry-manage`)"
date: 2026-08-25
branches: [lane/foundry-manage]
migrations: []
subsystems: ["IDEA Foundry", "Curriculum, migrations, policy"]
record_order: 144
---

## `revoke ... from public` does not close a function on Supabase (`0136` corrected, `lane/foundry-manage`)

**Migration:** `supabase/migrations/0136_foundry_delete.sql`, corrected IN PLACE.

### Why in place rather than a 0137

0136's first draft **reached its own self-check on production and raised**, which
rolled the entire file back: `pg_proc` held neither function and nothing partial
landed. So it is not an applied record, and the immutability rule -- which
exists so a file is never changed out from under a database that already ran it
-- has nothing to protect here. A 0137 correcting a 0136 that no database can
apply would leave a permanently failing file on `main`, which is worse.

**The client was already merged and deployed when this was found.** For the
window between that deploy and the corrected paste, every Delete control on
`/foundry/mine` and `/foundry/review` answered `PGRST202`. That is the exact
deploy-ordering hazard the branch was held back for, re-entered on a report that
the migration had applied.

### The defect

```
0136: public.foundry_delete_app is not a definer granted to authenticated and withheld from anon.
```

A hosted Supabase project bootstraps

```sql
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
```

which writes a **direct** grant to each of those roles into every new function's
`proacl` AT CREATION TIME. That is not the SQL default; the SQL default is a
single grant to `PUBLIC`. `revoke all on function f from public` removes exactly
that one entry, so on a real project the function is created already granted to
`anon` and the revoke never touches it.

Measured on the catalog, same function body, same `revoke ... from public`:

| default privileges | `proacl` after the revoke | `anon` |
| --- | --- | --- |
| none configured | `postgres=X/postgres \| authenticated=X/postgres` | false |
| Supabase's | `postgres=X/postgres \| anon=X/postgres \| authenticated=X/postgres \| service_role=X/postgres` | **true** |
| Supabase's, revoking the ROLES too | `postgres=X/postgres \| authenticated=X/postgres` | false |

Both revokes in 0136 now name the roles:

```sql
revoke all on function public.foundry_delete_app(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.foundry_delete_app(uuid) to authenticated;
```

That end state is independent of whatever default privileges a database carries,
which is the point: a narrowing that only works under one privilege
configuration silently does nothing under the other.

### THE FIXTURE WAS MORE PERMISSIVE THAN PRODUCTION, AND THAT IS THE REAL STORY

`tests/db/supabase-stub.sql` sets those default privileges **nowhere**. So in
the fixture a new function got no direct `anon` grant at all, `revoke ... from
public` closed it, and 0136's own assertion -- the correct assertion, unchanged
-- passed. A stub more permissive than the real thing does not fail loudly; it
CERTIFIES A BUG, which is the one thing that file must never do.

Adding the three lines to the stub reproduces the production error **verbatim**,
from the unmodified file, and the corrected file then applies.

**And it is not one migration's problem.** With the corrected stub, over a
15-migration chain: **94 of the 96 functions that chain intends to be
authenticated-only still hold a direct `anon` EXECUTE.** The only two correctly
closed are 0136's. All 13 of 0130/0131/0132's own Foundry functions leak,
including `foundry_create_app`, `foundry_submit_version`, `foundry_review_version`
and `foundry_set_app_hidden` -- functions students call today.

**The repo already believed otherwise, in writing.** Running the full suite
against the corrected stub reddens **41 assertions across 32 files** (43 failures
less the 2 pre-existing `spec-instructions-budget` ones). Those are not new
assertions: they are sweeps past sessions wrote deliberately, such as
`tests/classroom-decks.test.ts`'s

```js
for (const row of rows) expect(row.ok, row.fn).toBe(false);   // has_function_privilege('anon', ...)
```

Every one of them has been passing vacuously for as long as it has existed.

**Severity: reachable, not exploitable.** Every affected write RPC opens with
`if v_uid is null then raise 'You must be signed in.'`, and `auth.uid()` is null
for an `anon` caller, so what an unauthenticated PostgREST request reaches is a
function that refuses. A prosrc scan flagged 25 bodies that name neither
`auth.uid()` nor `is_admin()`; spot-checking the one that writes,
`coin_admin_adjust_balance`, shows it delegating to `coin_log_transaction`,
which raises unless `is_admin()` -- the nested-definer reuse convention, which
the regex cannot see through. The rest are private predicates and pure helpers.
So this is a gate weakened from "refused at the grant" to "refused in the body",
not an open door. **It should still be closed.**

### What is NOT landed here, and why

**The stub correction is written and measured but deliberately not committed.**
It is three lines:

```sql
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
```

Landing it alone turns the suite red on those 41 assertions -- which would be
the suite correctly reporting a real production defect, and equally would be a
red build nobody can tell from a broken one. It belongs in the same bundle as
the migration that closes the 94, so that the fixture starts telling the truth
in the same commit that makes the truth green. That bundle needs its own
verification and its own care: several functions are granted to `anon`
deliberately (the public coin ledger, the anonymous feedback path), and a blind
sweep would break the leaderboard.

### Verified

- The production error reproduces verbatim in the local fixture from the
  unmodified file, once the stub carries Supabase's default privileges.
- The corrected file applies, and **the assertion passes for the right reason**:
  asserted positively on the ACL itself, not on the self-check's verdict. Both
  functions come out `postgres=X/postgres | authenticated=X/postgres`, with
  `anon=false, authenticated=true, service_role=false, PUBLIC=false`.
- **Applied twice in a row against one clean database**, file unmodified both
  times. Both passes produced the identical state, asserted field for field
  rather than "it did not throw": exactly one overload per function (a re-paste
  leaving a second overload would not have thrown either), `anon=false`,
  `authenticated=true`, same `proacl` string.
- All 23 Foundry delete assertions green; full suite back to **2513 passed / 2
  failed**, the two pre-existing `spec-instructions-budget` failures.
  `svelte-check` 0 errors / 37 warnings.

### NOT verified

- Still nothing has run against the production project. The corrected file is
  verified against the embedded Postgres with the real chain applied in order,
  under a stub temporarily corrected to match a hosted project's default
  privileges. The 94-function figure is measured on that fixture, not queried
  from production -- and it covers 15 migrations of 136, so the real number
  across the whole schema is larger.
- The object sweep has still never touched a live bucket.

---

