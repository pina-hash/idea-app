---
title: "The IDEA Maps public-read boundary stops being proven by nothing: 31 policies mutation-proved, a 10-query search corpus that can go red, and the grant census that had been failing on main since the schema landed (`claude/maps-rls-boundary-tests-tvjq7v`, no migration)"
date: 2026-08-30
branches: [claude/maps-rls-boundary-tests-tvjq7v]
subsystems: ["IDEA Maps", "Testing", "Database"]
migrations: []
---

Test code and documentation only. No migration is written, and none is needed:
0161, 0162 and 0163 are on `main` and applied. Two defects found in the schema
are reported and pinned rather than fixed, because fixing either is a migration.

## `main` was red when this started, and the cause was the bundle under test

`npm test` on `origin/main` reported **3 failed, 4330 passed, 208 files**, all
three in `tests/grant-surface.test.ts`. That file reconciles what the catalog
actually grants against a declared list, and the maps migrations added nineteen
`authenticated` write privileges and six `anon` privileges that no entry
declared. The file's own failure message says what to do -- "either revoke it in
a migration or add it to ANON_SURFACE with the reason somebody decided it" --
and since this bundle may not write a migration and every one of those grants is
deliberate, the answer was the declarations.

`integration` was green throughout and still is, for a reason worth writing
down: **it does not carry 0161-0163 yet.** It sits 9 behind `main` and 2 ahead,
and the two ahead are unrelated. So "integration is green" and "main is red"
were both true at the same time and were the same fact seen from two sides. This
branch is cut from `main` rather than from `integration`, because the tests need
the migrations.

Seven objects gained entries (`maps_nodes`, `maps_item_types`, `maps_items`,
`maps_stock`, `maps_photos`, `maps_revisions`, `maps_search_log`),
`ANON_SURFACE_SIZE` moved 13 -> 19 and `AUTHENTICATED_WRITE_SURFACE_SIZE` 14 ->
21. Each entry carries the reason and, for the write surface, the point that
matters: **the grant is deliberately wide and the POLICY is the boundary**, so
the census entry is not a claim that the write is safe, it is a pointer at the
suite that proves it.

## Part 1: the RLS boundary

`tests/maps-rls-boundary.test.ts` (34 tests) and
`tests/maps-rls-mutation-proof.test.ts` (8 tests, 31 policies).

**The two refusal layers are two proofs, and the suite would be worth much less
with only one.** `anon` holds no write grant on any maps table, so it fails at
the GRANT layer with `42501 permission denied for table <t>` and no policy is
ever consulted. A signed-in non-admin DOES hold the grant -- 0161 grants write to
`authenticated` and puts `is_admin()` in the policy instead -- so it reaches RLS
and fails there with `42501 new row violates row-level security policy`. Both
are asserted, and the assertion is on the MESSAGE rather than the SQLSTATE,
because the SQLSTATE is the same for both and only the message says which layer
answered.

**The update and delete halves do not raise at all**, which is the trap in this
shape. A non-admin `update maps_nodes set ... where id = $1` matches zero rows
under `using (is_admin())` and returns success having changed nothing. Written
as `rejects.toThrow()` that assertion would simply be false; written as "no
error" it would pass against a deleted policy. It is asserted on `rowCount`,
with an admin performing the identical statement as the positive control.

### The mutation proof, and why a drop is not a control

Dropping a published-only policy makes an anonymous caller see NOTHING, so every
draft-invisibility assertion still passes -- vacuously, and looking exactly like
success. The mutation is therefore `ALTER POLICY ... USING (true)`, in-database,
against the file's own disposable database; no migration file is read or
re-applied at any point, and the restore is built from a `pg_get_expr` capture
taken before the mutation and compared back to it.

It runs over **all 31 policies on the maps tables**, and the catalog is asserted
to hold exactly the 31 the census names, so a policy a later migration adds is
uncovered loudly rather than silently.

Three things it found, all of which are the discipline working:

- **Two delete probes could not leak under a fully-opened policy.** `on delete
  restrict` from a child row refused them before RLS was consulted, and the
  probe helper swallowed the error and reported "refused". A probe that cannot
  succeed under any policy is a dead probe wearing a green tick. Fixed by giving
  every probe an **admin control that runs the identical statement** and must be
  true before any mutation is applied, so a `false` from the non-privileged
  actor can only mean the policy refused it.
- **A draft subject made an update probe measure the read policy instead of the
  write one.** PostgreSQL applies the SELECT policies to an UPDATE whose WHERE
  names a column, so a draft row is invisible to the non-admin and the update
  reports zero rows whatever the UPDATE policy says. The disposable subject is
  published now, deliberately, and the reason is in the file.
- **`maps_revisions`' write policies genuinely sit behind its read policy**, and
  that needed a four-state proof rather than a repair: `maps_revisions` has no
  public-read policy at all, so opening the write policy alone changes nothing.
  The proof asserts all four states -- this alone does not leak, both together
  do, the other alone does not, restored does not -- which is CLAUDE.md's
  defence-in-depth rule applied rather than quoted. **A first draft of that
  reasoning was wrong and the measurement corrected it**: it claimed the DELETE
  was an asymmetry that leaked with the read policy closed, when in fact the
  DELETE entry had never run, because the UPDATE entry ahead of it in the loop
  was failing. The comment now states the measurement.

One policy is not mutated and says so in its own census row rather than being
filtered out of the output: `maps_search_log_public_write` is `with check
(true)` as shipped, so it grants rather than restricts and there is no predicate
to open.

## Part 2: the search corpus (spec 5.5)

`tests/maps-search-corpus.test.ts`, 20 tests: 10 acceptance queries, the
anon/admin control, the miss-log path, two pinned gaps, and four mutations.

The corpus covers exact name, an alias sharing no token with its canonical name,
a transposition typo, a five-character live-typing prefix, brand-only,
part-number-only, the spec's own function query, a place-narrowed query, the
depth tie break in isolation, and a query that must return zero.

**Ranks, not membership**, and every rank claim carries the reason that position
is the right one, taken from the spec rather than from the function. **Where a
tie is genuine it is declared as a tie**: two placements of one item type in two
rooms at the same depth carry identical vocabulary, so `order by score desc,
depth asc, label asc` cannot separate them and their order is unspecified.
Naming one of them first would pin the assertion to heap order. Those cases
assert the SET occupying a rank RANGE, which is still a rank claim. (Twelve runs
of such a query gave one ordering, which is exactly why repetition is not the
instrument here -- addenda rule 22.)

**The corpus can fail, and the proof is in the file.** Four mutations, each
applied to the definition text read back with `pg_get_functiondef`, each
asserting its pattern's occurrence COUNT before applying so a mutation that
never landed cannot be mistaken for one nothing catches:

| mutation | demoted |
|---|---|
| tie break inverted to deeper-wins (the rejected alternative) | 6 queries |
| alias band removed from the vector and the trigram blob | `allen wrenches` -> 0 results |
| tag band removed | `thing that cuts aluminum` -> 0 results |
| trigram threshold raised 0.6 -> 0.9 | `calipre` -> 0 results |

The first is there because addenda rule 9 asks for a mutation to the *rejected
design* rather than only to a broken one: deeper-wins is tidier-looking and is
what a future refactor would reach for. Every restore is verified by comparing
the catalog text to the capture, and the **whole** corpus is re-run green
afterwards rather than the demoted subset, so a restore that repaired the named
queries and broke something else would still redden.

The occurrence guard earned itself immediately: the alias mutation was written
expecting 6 occurrences and there are 4, and the guard refused to proceed rather
than applying a partial edit.

## Two defects found in 0162, pinned rather than fixed

Both are migrations, and this bundle may not write one.

1. **The spec's own example phrasing does not narrow by place.** 0162's header
   claims "websearch AND-semantics is what makes 'mill room caliper' narrow by
   place through the D band". It does not: the live-typing prefix term is OR'd
   into the tsquery unconditionally, so the query becomes `... | 'caliper':*`
   and every caliper in the building matches at full rank. `least(ts_rank_cd *
   2, 1.0)` saturates them all to exactly 1.0, so the two room-level placements
   tie on score, depth AND label. Reordering to "caliper mill room" puts the
   place token last and narrows correctly -- that phrasing is the acceptance case,
   and the spec's own phrasing is a pinned gap.
2. **A British spelling finds nothing.** The tag is "cuts aluminum";
   "aluminium" does not stem onto it and the trigram leg scores the phrase below
   threshold. Recorded because 5.5's stated intent is that a student who knows
   the wrong name still finds it, and a spelling is a wrong name. The fix here is
   content -- an alias or a tag, which is exactly the miss-driven growth of 5.4 --
   not a schema change.

Both pinned tests are labelled as gaps and say in the file that they are
expected to go red when the gap is fixed, and that the redness is the fix
landing.

## Fixture fidelity: where `postgrest-shim.ts` does not model production

Named rather than asserted through, per addenda rule 30.

- **The shim models SELECT and RPC only. It has no insert, update or delete
  builder at all.** So no write refusal in this bundle is driven through it; the
  writes go through `db.asAnon` / `db.asUser`, which is the same role, the same
  grants and the same policies PostgREST would hit, and the assertions are on
  the SQLSTATE and message the shim's own `selectError`/`rpcError` say they pass
  through verbatim. What is NOT modelled is the HTTP shape around that error.
- **The maps client is not written yet**, so there are no select strings and no
  embeds to resolve, which is the one thing the shim exists to be strict about.
  When `/maps` ships, its loads should be driven through the shim so the embed
  resolution is covered; this bundle could not, because there is nothing to
  drive.
- `maps_search` is a `returns table` with nine columns, so it is a composite and
  the shim's single-column scalar hazard does not apply; it is called here as
  plain SQL rather than through `rpc()` because the corpus needs the typed row
  shape.

## Stub adjustments (addenda rule 16)

**None.** No grant, seed or patch was added to `tests/db/supabase-stub.sql` or
to any fixture to make a refusal happen. Every refusal observed here is produced
by the migrations as they stand. The one thing this suite arranges is content:
the corpus rows, seeded as an admin through the real policies and published
through the real `maps_publish`, never with the owner connection.

## What is NOT verified

- **Anything against the live Supabase project.** The local `.env` is a
  placeholder (`example-ref`); no migration was applied, no RPC called and no
  session signed in against production. That 0161-0163 are applied there is
  taken from the commissioning task, not measured.
- **Supabase Storage.** 0163's four `storage.objects` policies are NOT covered
  by this bundle. `maps_photos` row visibility is, in both directions, but no
  object was uploaded, and the stub's `storage` schema is not Storage. This is
  the same gap addenda rule 16 was written about, and it is the obvious next
  bundle.
- **Any surface.** There is no `/maps` route, so no browser pass was run and
  `npm run verify:browser` was not invoked.
- **Concurrency.** Nothing here tests `maps_publish`'s `for update` lock. Addenda
  rule 21 says a burst would prove nothing and the real instrument is a
  competing transaction holding the same lock; that is its own bundle.
