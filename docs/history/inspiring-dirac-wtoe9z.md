---
title: Decision 07 answered public, and the audit that stopped the bundle
date: 2026-09-12
branches: ["claude/inspiring-dirac-wtoe9z"]
migrations: []
subsystems: ["foundry"]
---

Prompt 0176. Mr. Pina answered decision 07 against the default: Foundry stats
fully public, in two layers -- every student sees their OWN stats for any app
they played, and totals aggregated across everyone are public. The prompt
scoped the bundle to EXPOSING data and forbade a migration, with an explicit
audit gate in front of the work: does per-player playtime exist in the
database at all, or is only an aggregate stored?

**The audit's answer is a split one, and the split is the finding: the DATA
exists and the READ PATH cannot be widened without a migration.** So this
bundle stops at the report, which is what the prompt asked for in the case it
anticipated and what its `NO MIGRATION` line requires in the case it did not.

### The data exists, measured rather than read off the header

`student_app_plays` (0139) is one row per play SESSION and it is keyed to a
person. Measured against the real fixture -- the real migration files applied
unmodified to an embedded Postgres, chain `0001 ... 0139, 0137` -- the columns
are:

    id uuid | app_id uuid | version_id uuid | player uuid
    started_at timestamptz | last_seen_at timestamptz

So "my playtime on app X" is not a figure that would have to be collected. It
is already stored, exactly, as

    sum(last_seen_at - started_at) where player = auth.uid() and app_id = X

and `student_app_plays_resume_idx` is `(player, app_id, last_seen_at desc)`,
which is very nearly the index that query would want. **This is not a
data-collection bundle**, and nothing here proposes starting to collect
telemetry.

### But there is no door, and there cannot be one without SQL

The table answers nobody. Measured on the same fixture:

    has_table_privilege(role, 'public.student_app_plays', 'SELECT')
      anon          false
      authenticated false
      service_role  TRUE   <- see the finding below

plus RLS enabled with no policy. So a browser cannot select from it by either
of two independent refusals, exactly as 0139 designed.

Every client-reachable door is therefore a SECURITY DEFINER function, and the
census of them is four. None is caller-scoped:

| function | answers | scope of the aggregate |
|---|---|---|
| `foundry_play_counts(bool, bool)` | `plays`, `plays_7d` per app | across ALL players |
| `foundry_app_play_stats(uuid)` | `plays`, `players`, `seconds_played`, `last_played_at` | across ALL players, owner-or-admin gate |
| `foundry_play_start(uuid, uuid)` | `{ok, play_id, resumed}` | no figure at all |
| `foundry_play_ping(uuid)` | `{ok}` or a refusal | no figure at all |

Two of those name `auth.uid()`, and **neither uses it to filter plays**:
`foundry_play_counts` uses it as a signed-in gate (`auth.uid() is not null`)
and `foundry_app_play_stats` uses it for the owner gate. The aggregate in both
is over every row for the app.

**So there is no shape in which the client can compute a caller's own
playtime.** Layer 1 of the decision needs a new function. And layer 2 needs
one too: the two counts `foundry_play_counts` returns are ALREADY public to a
signed-in caller and already rendered on the gallery cards, so what "make the
totals public" actually asks for is the metrics behind the owner gate, and
moving that gate is a change to `foundry_app_play_stats`. Either layer is a
migration. There is no read-path-only half to ship.

Three no-migration routes were considered and all three are refused:

- **A client select on the table.** Impossible, per the two refusals above.
- **A service-role server route.** Technically reachable, because the grant
  survives (below) -- and refused twice over. `CLAUDE.md` pins
  `SUPABASE_SERVICE_ROLE_KEY` to five named readers and says nothing else may
  read it; and a route holding the key and deciding who may see a figure is
  the route becoming the authorization boundary instead of the database, which
  `CLAUDE.md` refuses by name for the analogous Foundry delete path. It would
  also be building a feature on top of a grant 0139's own comment says should
  not exist.
- **Client-side accumulation.** A browser tallying its own sessions is
  per-device, per-browser, dies on a cleared site data, and is a second system
  of record disagreeing with the first. There is no second ledger.

### The finding found on the way: `service_role` holds SELECT on the plays table

0139's own comment, at the table's grant block, says:

> `service_role` gets nothing either, and that is deliberate and different
> from `student_app_files`.

The statement below it is `revoke all on public.student_app_plays from anon,
authenticated;` -- which does not name `service_role`, while **every one of
the file's five function revokes does** (`from public, anon, authenticated,
service_role`). On a hosted Supabase project the bootstrap default privileges
`grant all on tables to anon, authenticated, service_role` at creation time,
so the `service_role` entry the revoke never named is still there. Measured
`true` above.

The file's own self-check cannot see it: it asserts
`has_table_privilege` for `anon` and `authenticated` only. So the comment is
wrong about the schema and nothing in the repository disagrees with it. It is
the table half of the same defect `CLAUDE.md` records for `0201` -- a
migration that revoked without naming the roles -- one table over.

**Not fixed here.** It is a migration, this bundle has none, and closing it
needs its own answer for anything that might already be reading through that
grant (nothing in `src/` does: the four `src` readers all call the RPCs). It
is worth noting that the practical exposure is small -- the key has five
readers, none of them this table -- but the comment claiming a closed door
that is open is the part that costs somebody a wrong assumption later.

### What a migration would have to do, if one is allocated

Recorded so the next bundle does not re-derive it, not as a design decision
this bundle is entitled to make.

- **Layer 1** is one new definer function, caller-scoped by SIGNATURE rather
  than by a parameter -- `foundry_my_play_stats(p_app_id uuid)` taking no
  identity, filtering `player = auth.uid()`, so "can only ask about myself" is
  a property of the shape. The existing resume index covers it.
- **Layer 2** is the gate on `foundry_app_play_stats`. Note that widening it
  is the one place the decision collides with something already written down:
  0139's header states that `players` is a distinct COUNT and that on an app
  with one player it is 1, with `last_played_at` then naming when that one
  person played. Owner-and-admin, that was accepted and written down. Public,
  it means any student can learn that exactly one person has played an app and
  when -- and on an app whose author they know, that is a named person's play
  time inferred from an aggregate. **This is the peer-control boundary the
  prompt asks to be proven, and the n=1 case is where a straight gate widening
  fails it.** Deciding what to do about it (a threshold, dropping
  `last_played_at` from the public answer, or accepting it) is Mr. Pina's, and
  it should go back to him with decision 07 rather than being chosen by a
  session.
- Both would need the `0166` revoke shape, naming the roles.

### What was NOT done, and what is not verified

- **No code changed.** No file under `src/`, no test file, no migration. The
  two test paths the prompt reserved, `tests/db/foundry-stats*` and
  `tests/dom/foundry-stats*`, do not exist and were not created: there is
  nothing to assert until there is a read path, and a peer control written
  against today's functions would assert only what 0139 already asserts in
  `tests/foundry-telemetry.test.ts`.
- **The peer-control boundary proof is therefore NOT delivered**, because the
  thing it would guard does not exist yet. It is the first thing the follow-up
  bundle owes.
- **Nothing was verified against the live Supabase project.** This container
  cannot reach it: `IDEA_MIGRATION_URL`, `DEPLOY_PROBE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` are all unset and the local `.env` is the
  placeholder ref. Every schema claim above is measured against the embedded
  fixture with the real migration files, never against production.
- **No browser pass.** No mounted surface was touched.
- **Decision 07's own entry still reads `Status: open`** on `origin/main` and
  still records the old default ("Not public"). `docs/decisions/entries/07-*`
  is not this bundle's surface, so it is reported rather than edited. It
  should be updated with Mr. Pina's answer and with the n=1 question above.
- **A wording gap in decision 07, reported not fixed.** Its title says "the
  two owner-only metrics". Three sit behind the gate: `players`,
  `seconds_played` and `last_played_at`. The history entry for the bundle that
  last touched this (`foundry-decisions-cluster-m9d917`) names all three. A
  session reading "two" and widening two of them would leave one behind
  without noticing.

### Measured

- **`svelte-check` on `origin/integration` at `eef6e851`: 0 errors, 38
  warnings in 21 files** (32 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), with `.env` written
  before `svelte-kit sync`. `CLAUDE.md`'s baseline line says 40 in 22 with a
  34/5/1 breakdown; it is 38/21 at the branch point and this bundle changes no
  Svelte file, so the drift is not this bundle's. `CLAUDE.md` is not this
  bundle's surface. Reported, not fixed.
- **Full suite** on the committed tree: **405 files, 7819 tests, 0 failures**,
  387.15s. Nothing in this bundle is executable, so that is the branch point's
  own number carried across two documentation commits, which is the point of
  running it: a docs-only bundle that reddens the suite has done something it
  did not mean to.
- **Production reachability**, checked before the merge:
  `https://ideabosco.com/` 200 in 0.65s, `https://apps.ideabosco.com/` 200 in
  0.53s. The production DATABASE is unreachable, as above.
