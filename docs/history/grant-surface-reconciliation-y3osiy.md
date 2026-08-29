---
title: "A privilege nobody wrote: the grant surface reconciled against the migrations, and the test that would have caught it (`claude/grant-surface-reconciliation-y3osiy`, migration 0149)"
date: 2026-08-29
branches: [claude/grant-surface-reconciliation-y3osiy]
migrations: ["0149"]
subsystems: ["Database", "Security", "Testing", "Tournaments", "FSP", "Notebook", "Coin economy", "GAUNTLET"]
---

## A privilege nobody wrote: the grant surface reconciled against the migrations, and the test that would have caught it (`claude/grant-surface-reconciliation-y3osiy`, migration 0149)

A view holding a grant nobody wrote exposed student full names and room
participation for roughly two months. `0060` fixed three objects and stated the
mechanism in its header. A catalog sweep of production on 2026-08-28 found six
more. This bundle reconciles the whole surface and, more importantly, builds the
comparison that had never existed: the migrations are the intent, the catalog is
the reality, and nothing had ever put them side by side.

**The test is the deliverable. The revokes are the easy part.**

---

## The mechanism, and why it kept working

A hosted Supabase project bootstraps `alter default privileges in schema public
grant all on tables to anon, authenticated, service_role`. That is not the SQL
default -- the SQL default is one grant to `PUBLIC` -- so every table and view a
migration creates in `public` arrives holding SELECT, INSERT, UPDATE, DELETE,
TRUNCATE, REFERENCES and TRIGGER for both client roles *before* the migration
grants anything. `create or replace view` preserves grants, so an inherited
privilege survives every later recreation of the view.

A migration that says `grant select on public.x to authenticated` therefore does
not describe what `x` holds. It describes what its author was thinking about.

This is `0137`'s lesson one object class over. That migration closed the same gap
for FUNCTION execute grants, and `tests/db/supabase-stub.sql` gained the function
half of the hosted default privileges in the same commit, with a header that says
at length why a stub more permissive than the real thing "does not fail loudly".
**The table half was never added.** So in the fixture every object came out
holding exactly what its migration granted, any reconciliation was trivially
true, and this entire class of defect was invisible by construction.

## What was measured

`tests/db/hosted-table-default-privileges.sql` supplies the missing half.
Measured: with it, a view created by a migration comes out
`anon=arwdDxtm/postgres`, which is exactly production's
`DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`; without it, only what
the migration wrote. Applied over the full 146-file chain it reproduces the
production sweep **object for object** -- nineteen objects reachable by `anon`,
the same nineteen. That agreement is what licenses everything below.

The file also carries two other pieces of fixture completion the full chain needs
and the notebook chain never did: `auth.jwt()` (read by `0043`) and an empty
`supabase_realtime` publication (`0064` adds a table to it). Before those, the
chain died at `0043` and then at `0064`.

### How much was actually reachable

Driven as a real signed-out `anon` session against the full chain, rather than
inferred from the ACL:

| object | anon SELECT |
| --- | --- |
| `coin_balances` | `permission denied for table coin_transactions` |
| `gauntlet_speedrun_attempt_history` | `permission denied for table gauntlet_speedrun_attempts` |
| `notebook_entry_activity` | `permission denied for table notebook_entries` |
| `coin_contract_status` | **accepted, returns rows** |
| `notebook_folders` | accepted, 0 rows (RLS) |
| `fsp_item_opens` | accepted, 0 rows (RLS) |

The three `security_invoker = true` views were never exposing anything: the view
runs as the CALLER and the caller holds no grant on the base table, so the grant
on the view is real but inert. Removing it is hygiene, not an incident -- though
it is worth naming that "inert" here means one reloption away from meaning
something.

**`coin_contract_status` is the one that was genuinely open**, because it is
owner-privileged and so bypasses both the base tables' RLS and their grants. What
a signed-out caller could read is contract ids, a `claimed_count` and a computed
status. No identities: `student_email` is counted, never projected. Real, and
low-severity, and a decision nobody made.

`notebook_folders` and `fsp_item_opens` are tables, so `anon` is not the owner and
RLS applies; both return zero rows. RLS was the only thing containing them --
**and RLS does not constrain TRUNCATE at all**, so that privilege in particular
had nothing behind it. It is unreachable through PostgREST, which exposes no
TRUNCATE route, but it was a real privilege held by the anonymous role.

## The tracing, which was the work

Every revoke in `0149` names the caller traced for it. A revoke that breaks a
working surface mid-class is worse than a grant contained by RLS.

- **`notebook_folders` -- two callers, both signed in.**
  `src/routes/notebook/+page.server.ts:414` on `locals.supabase`, and the
  `notebook_folders ( name )` embed in three rungs of `REVIEW_ENTRY_SELECTS`
  (`src/lib/notebook-selects.ts:244,267,307`) issued from the browser client at
  `src/routes/notebook/review/+page.svelte:197`. Both sit under `/notebook`,
  which is in `authedPrefixes`, and both files carry their own
  `if (!claims) redirect(303, '/')`. No API route, Edge Function, short link,
  public reference viewer or service-role client names it; every other reference
  in `supabase/migrations` is inside a SECURITY DEFINER body, which runs as the
  owner and needs no caller grant. **No anonymous path exists to break.**

- **`fsp_item_opens` -- no callers at all.** The only code naming it is
  `src/lib/fsp/item-opens.ts`, and *nothing imports that module* -- not in
  `src/`, `tests/` or `tools/`, and no commit in the history ever did. The "FSP
  homepage" its header describes does not exist; there is no `+page.svelte` at
  the root of `src/routes/fsp/`. `0048:42-43` claims "SELECT + INSERT only (no
  UPDATE/DELETE), so PostgREST can never issue a mutating statement the policies
  would otherwise have to guard" -- which was simply untrue of the database,
  because `0048` never wrote the `revoke all ... from anon, authenticated` its
  sibling `0046:32` has. `0149` makes that comment true.

- **`fsp_frc_interest` -- the anon INSERT is live and stays.** It backs
  `/fsp/frc-interest`, a public QR-code intake form. `/fsp` is not in
  `authedPrefixes`, the page has no server load, and the insert goes out on the
  browser anon client from `src/lib/fsp/frc-interest.ts:79`. `0046`'s header:
  "Prospective freshmen and parents scanning the code will not have a Bosco Tech
  account." Revoking it breaks the form for exactly the population it exists for,
  and it fails quietly, in the form's own error state.

## The twelve tournament tables: established, not assumed

The prompt's instruction was to establish intent rather than assume it, and to
report and change nothing if intent could not be established. It could.

The decisive evidence is not the grant but its shape. `0062:239-262` does not
merely grant: it runs `revoke all on public.%I from anon, authenticated` and
*then* `grant select`, per table, over a literal array naming all nine of its
tables; `0063:240-258` repeats it for the two reward tables and `0064:108-120`
writes it out longhand for the twelfth. **A revoke before the grant is the exact
opposite of inheritance** -- it strips the defaults and hands back precisely
SELECT. Twelve explicit, zero inherited.

A signed-out visitor really does render a bracket: `/tournaments` is deliberately
absent from `authedPrefixes`, and five of its eight routes load with no session.
`src/routes/tournaments/[id]/tv/+page.server.ts` states it as a prohibition --
"FULLY PUBLIC and deliberately session-blind ... needs no guard of its own -- and
must not gain one."

**And the identity question was decided on purpose**, which is the half worth
recording. No tournament table has an email column. There is no view over any of
them. A participant's public identity is `tournament_entries.display_name`, a
value the entrant TYPES at registration (`tournament_register_entry` takes
`p_display_name` and inserts `btrim(p_display_name)`) -- never a Google account
name copied from `profiles`, which is not read anywhere on the path. `0062`'s
header calls it an IDENTITY RULE. The `user_id` columns are public uuids, opaque
precisely because `profiles` is not anon-readable. So the public bracket carries a
chosen name, a chosen picture and chosen free text, consistent with the platform
rule that a chosen public identity replaces the account identity completely. A
beetleweight tournament is being hosted at the school in December.

The one residual the code cannot close: nothing stops a student typing their legal
name into a field designed to be chosen. That is a data question, not a code one.

## `coin_contract_status` keeps its owner privileges

It looks like the `0060` defect and is not one, and `0149`'s header preserves the
reasoning so the next sweep does not re-litigate it. `0077` answered `0060`'s rule
rather than ignoring it: an owner-privileged view must carry a row predicate
replacing the RLS it bypasses, and there is no row-level data being bypassed for a
predicate to protect, because every column is a count or a computed status.
Verified against `pg_get_viewdef` rather than the header -- the live definition
projects `c.id`, `count(k.student_email)::integer` and a CASE, and nothing else.
Adding `security_invoker` would collapse the count to the caller's own claim rows
and report `claimed_count` 0 or 1 for every contract: a functional break, not a
hardening. Only the accidental `anon` grant was wrong.

## The test

`tests/grant-surface.test.ts` applies the whole chain -- read off disk, so a
migration added tomorrow is reconciled the day it lands rather than the day
somebody remembers -- and reconciles the catalog against three list-driven
declarations, each entry carrying the reason somebody decided it.

- **A. The anonymous surface, exhaustively.** `anon` is the public internet and
  its reach is small enough to declare in full: thirteen objects. Drift fails in
  *both* directions -- holding more than declared is the defect; holding less
  means the list describes a surface that is gone, which is how a public form
  breaks with nothing saying so.
- **B. The client write surface, exhaustively.** The doctrine is zero client write
  grants on feature tables, so `authenticated` holding INSERT/UPDATE/DELETE/
  TRUNCATE is exactly the interesting set: fourteen objects, each a deliberate
  exception with a stated reason. `authenticated` SELECT is the ordinary case on
  ~100 objects and is deliberately not enumerated -- a list that long carries no
  signal and would be maintained by pasting.
- **C. REFERENCES and TRIGGER, with no exceptions at all.** Neither is ever
  granted deliberately anywhere in this codebase; both arrive only by
  inheritance. This is the check that still fires on a brand-new object *after*
  somebody has added it to A or B for a reason that sounded good.

A future migration's `create table` inherits all seven privileges and so reddens
all three at once. Both list lengths are pinned, so an entry added silently fails
and a reviewer has to read the reason. `service_role` is deliberately not
reconciled: it bypasses RLS by design and a CHECK constraint's function runs as
the writing role (`0131`), the same reason `0137` left it alone.

### Mutation proof

Four mutations, each restored from a copy and md5-verified, never `git checkout`:

1. **A new object carrying the default grants** (`create table` appended to
   `0149`) -- reddens **4 tests**: A's undeclared check (all seven privileges
   listed by name), B's undeclared check (four), C (two), and the positive
   control. The designed triple coverage, confirmed.
2. **The same object narrowed to a deliberate `anon SELECT`** and left undeclared
   -- reddens 2. Declared in `ANON_SURFACE` with a reason and the pin bumped to
   14 -- **green**. The intended workflow, exercised rather than asserted.
3. **A listed entry removed** (`vanguard_saves`) with the pin left at 14 --
   reddens 2, including the pin itself (`expected 13 to be 14`).
4. **The prelude's table default privileges stripped** -- reddens exactly the
   fixture guard, whose message names the vacuity risk. **The other 14 tests still
   pass**, which is the whole point: without that guard this file would be green
   over a fixture that cannot reproduce the defect it exists for.

The sweep also carries positive controls, because every reconciliation in it is an
absence assertion and an absence assertion over a sweep that swept nothing is
green for the wrong reason: it asserts the chain length, >100 objects found, the
exact declared-object counts for both roles, and >50 `authenticated` SELECTs.

## Report only, changed nothing

**`relforcerowsecurity = false` on all 106 RLS-enabled tables** (and all 106
tables in `public` have RLS on; none is without it). It is the Postgres default
and no migration ever issues `force row level security`, so in origin it is
**inherited**. But it is not accidental, and calling it merely inherited would be
wrong: `0041_frc_progress_lockdown.sql` names its absence *twice*, in writing, as
the mechanism its design depends on -- "Being SECURITY DEFINER, both bypass RLS as
the function/table owner (the table has no FORCE ROW LEVEL SECURITY), so the
revoked client grants and dropped policies below never affect them." The entire
"every write is a SECURITY DEFINER RPC" doctrine rests on the same property.
**It should stay off.** It is also harmless for the roles that matter: `anon` and
`authenticated` are not owners, so RLS applies to them regardless.

**I could not measure what enabling FORCE would do**, and the attempt is worth
recording because it corrected me. I enabled FORCE on `coin_contracts` and
`coin_contract_claims` and re-read `coin_contract_status`, expecting the
owner-privileged view to stop returning rows. It returned the same row. The reason
is the fixture: its `postgres` is `rolsuper = true`, and a superuser bypasses RLS
irrespective of FORCE, so the experiment could not distinguish anything. On a
hosted project `postgres` is not a superuser, so the result would likely differ --
but I did not verify that and am not claiming it.

**Owner-privileged views over an RLS table without their own row predicate: none.**
There are exactly four views in `public` without `security_invoker`, and every one
is accounted for, read from `pg_get_viewdef` (reality) rather than migration
headers (intent):

| view | predicate |
| --- | --- |
| `gauntlet_leaderboard` | `where c.published` |
| `gauntlet_room_board` | `gauntlet_is_room_member(s.room_id)` |
| `gauntlet_room_roster` | `where gauntlet_is_room_member(pr.room_id)` |
| `coin_contract_status` | none, and none needed -- aggregates only, `0077`'s documented answer to `0060`'s rule |

The three GAUNTLET views do project `profiles.full_name`, which is the data the
original incident exposed; all three are `authenticated`-only and predicate-scoped
since `0060`.

**`0137`'s header is now stale in a way worth knowing**: it records "measured on
the catalog rather than assumed" that `anon` holds "INSERT on `fsp_frc_interest`
and SELECT on twelve `tournament_*` tables, **and nothing else in `public`**." The
2026-08-28 sweep contradicts that -- six more objects. The likeliest explanation is
that the measurement was taken against a database that did not yet have every file
applied. I have not edited `0137` (a migration is an immutable applied record);
this entry is the correction.

**`notebook_entry_activity` is the only auto-updatable view of the seven**
(`information_schema.views` reports `is_updatable = YES`; every other one
aggregates or windows). Its INSERT/UPDATE/DELETE grants were therefore the only
ones that could ever have been a write *path* rather than an inert privilege.
Measured, they are closed by `security_invoker` today -- an authenticated DELETE
answers `permission denied for table notebook_entries` -- which means a single
reloption stood between a client role and a write into the notebook. That is the
one this bundle was least willing to leave.

## Verification

- Baseline (`2d445d9`, unmodified tree): **158 files / 3429 tests passing**,
  `svelte-check` **0 errors / 37 warnings**, mix 31 `state_referenced_locally` /
  5 `css_unused_selector` / 1 `perf_avoid_nested_class`.
- After: **159 files / 3444 tests passing** (+1 file, +15 tests, exactly the new
  file), `svelte-check` **0 errors / 37 warnings**, mix unchanged 31/5/1.
- `0149` applies cleanly as part of the full 147-file chain in the fixture, and
  re-applies (every statement is a revoke or a grant). Its self-check asserts the
  end state from the catalog rather than trusting that its own statements ran, and
  `raise notice`s `anon`'s remaining reach: 13 objects.
- `anon` measured before `0149`: 19 objects. After: 13 (twelve tournament tables
  + `fsp_frc_interest`). `authenticated` write objects before: 22. After: 14.

## Not verified

- **`0149` has NOT been applied to production.** Nothing in this repo can reach
  the live project; the local `.env` is a placeholder.
- The four view revokes were reported as already applied by hand on 2026-08-28. I
  did not and could not confirm that against the live catalog; `0149` re-asserts
  them, which is correct either way.
- No browser pass. This bundle touches no `src/` file, so there is no rendered
  surface to measure. `npm run verify:browser` was not run.
- The production `relforcerowsecurity` behaviour under FORCE, as above.

## Deferred, deliberately

**The table default privileges belong in `tests/db/supabase-stub.sql`, and are
not there.** They sit in this bundle's own prelude instead, for two reasons:
turning them on in the shared stub changes what all 48 database files apply, which
is a decision for a bundle that owns them; and folded in here, a red suite could
not be told apart from a bad revoke. **The consequence is worth knowing and is
written into the test's header: every other db suite still runs without table
default privileges, so an assertion elsewhere that `anon` cannot select something
is still weaker than it looks.** Moving those two lines into the stub -- and
dealing with whatever it reddens -- is the right eventual home and is a bundle of
its own.

`tournament_invites` holds `anon SELECT` and is the one of the twelve no public
load ever queries; both reads are inside `if (claims)` and filtered to the caller.
It exposes `invited_user_id`/`invited_by` uuids -- who was invited to what -- and
was swept into `0062`'s loop with the tables that genuinely are bracket surfaces.
Nothing about it contradicts the identity rule (uuids only, no names), and it is
declared in `ANON_SURFACE` under the tournament reason. If the public surface is
ever narrowed, it is the first candidate. Not narrowed here: the instruction was to
establish intent and document it, and `0062` plainly intended all twelve.

No `classroom-updates.json` entry: nothing a student sees changes.
