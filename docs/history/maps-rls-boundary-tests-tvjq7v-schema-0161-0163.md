---
title: "The IDEA Maps schema bundle (0161-0163) gets the history entry it could not write, recorded retrospectively by the suite that had to read it (`claude/maps-rls-boundary-tests-tvjq7v`, migrations 0161, 0162, 0163)"
date: 2026-08-30
branches: [claude/maps-rls-boundary-tests-tvjq7v]
migrations: ["0161", "0162", "0163"]
subsystems: ["IDEA Maps", "Database", "Docs"]
---

**THIS ENTRY IS ABOUT SOMEBODY ELSE'S BUNDLE AND IS WRITTEN AFTER THE FACT.**
Commit `260ac80`, "IDEA Maps groundwork: the building map gets its database",
landed migrations 0161, 0162 and 0163 on `main` and committed no
`docs/history/` entry, because that session was constrained to SQL files only.
That is a gap in the record rather than a decision: the per-bundle record is
how a later session finds out why a subsystem is shaped the way it is, and
three migrations creating six tables, a search function and a storage bucket
are exactly the kind of thing somebody will need the reasoning for.

It is written from the migrations themselves and from
`docs/standards/IDEA_MAPS_SPEC.md` v1.1, by the session that read all three end
to end in order to test them. **It is not a first-hand account and does not
pretend to be**: where the migration headers state a reason, that reason is
reported here; where they do not, this entry says so rather than inventing one.
The filename carries this session's branch slug with a suffix, per the
convention `anon-coin-public-projections-mrlg0d-0157.md` set, because the
originating session left no branch of its own to name.

**THEY ARE APPLIED TO PRODUCTION.** The task that commissioned the test bundle
states it, and nothing in this repo can verify it: the local `.env` points at a
placeholder project (`example-ref`) and no session here can read the live
catalog. So "applied" is recorded here as an assertion made by the person who
applied them, not as something measured.

## What the three files created

**0161, the core model.** Six kinds of spatial container in one self-referencing
table (`maps_nodes`: site, building, outdoor_zone, room, unit, compartment),
plus `maps_item_types` (the searchable vocabulary), `maps_items` (unique things
with serials), `maps_stock` (a stocked type placed somewhere with a quantity),
and `maps_revisions`. `maps_publish` is the one RPC.

**0162, search.** `pg_trgm`, three immutable per-table vocabulary helpers with
`gin_trgm_ops` indexes over them, `maps_search` (SECURITY INVOKER), and
`maps_search_log`.

**0163, media.** The `maps-media` bucket (public read, 20 MiB, images only),
`maps_photos`, and four `storage.objects` policies.

## The decisions the schema made where the spec was silent

Each of these is stated in the migration's own header; they are collected here
because a header is not where anybody looks for a subsystem's reasoning.

- **The parent/child kind pairing is a trigger, and it is also the cycle
  guard.** A legal parent's kind is always strictly higher in the ladder, so a
  containment cycle is unrepresentable with no second mechanism. Re-kinding a
  node re-checks its children and refuses with a count rather than stranding
  them.
- **Outline is jsonb, position and rotation are typed numeric columns.** The
  outline is a variant-shaped document the editor reads and writes whole and
  nothing queries relationally; position and rotation are scalars with one
  shape. `_maps_outline_ok` validates the jsonb on a CHECK and is written
  against the `jsonb_typeof`-null trap -- every comparison is `is distinct
  from` and every path returns a non-null boolean.
- **Elevation lives on the compartment rows, not as a jsonb stack on the
  unit.** A jsonb list on the unit naming compartment ids goes stale the moment
  a compartment is added or deleted. `elevation_order` is deliberately NOT
  unique among siblings, because publish is per-object and a reorder published
  one object at a time would transiently collide.
- **Draft and publish is a live row with a status column plus jsonb snapshots
  in one side table.** The live row keeps a stable id, so items hold a real FK
  to their node and stock to its type -- a revisions-in-the-main-table design
  cannot have real foreign keys at all. The published content stays on the live
  row while an edit is pending, so the public read does not change until
  publish.
- **Retention is a property of the TABLE, not of client discipline.** A BEFORE
  UPDATE trigger on any row whose OLD status is `published` archives the old row
  as the next retained revision. An admin save-and-publish that updates the live
  row directly retains exactly as `maps_publish` does, because neither can skip
  the trigger.
- **`maps_publish` reads the promotable column list off the catalog** rather
  than naming columns, so a column added later cannot be silently dropped from
  promotion, and uses `jsonb_populate_record` over the CURRENT live row so a key
  absent from the snapshot keeps its live value instead of nulling out.
- **Writes are RLS policies on `is_admin()`, not definer RPCs.** 0161's header
  names this as a deliberate deviation from the repo's every-write-is-a-definer-RPC
  default, on the grounds that P1's editor is admin-only and `maps_publish` is
  the one RPC because promote-and-retain has to be atomic. The P2 student grant
  tier is left to its own bundle.
- **The ancestor chain is a computed join, so there is nothing to invalidate.**
  `maps_search` builds it with a recursive CTE at query time. The rejected
  alternative was a trigger-maintained denormalised names column, which would
  need a recursive subtree recompute on every reparent AND every rename.
- **`maps_search` is SECURITY INVOKER, and that IS the published-only
  guarantee.** RLS does the filtering, so there is no second, restatable copy of
  "published only" inside the function. Two consequences are accepted and
  stated in the header: a published node under a draft parent is unreachable for
  an anonymous caller, and an admin calling the same function sees drafts.
- **The search log carries no identity column of any kind** -- query, count,
  timestamp, and a uuid key rather than a sequence, on an anon-writable table.

## What this session found in them, having tested them

Recorded here rather than in the bundle entry beside it, because these are
properties of 0161-0163 rather than of the tests:

1. **`maps_search`'s trailing prefix term cancels the AND-semantics the header
   claims.** 0162's header says "websearch AND-semantics is what makes 'mill
   room caliper' narrow by place through the D band." Measured, that phrase does
   not narrow: the last token is OR'd in as a prefix term unconditionally, so
   the tsquery becomes `'mill' & 'room' & 'calip' | 'mill' & 'room' & 'caliper'
   | 'caliper':*` and the standalone `'caliper':*` admits every caliper in the
   building. `least(ts_rank_cd * 2, 1.0)` then saturates all of them to exactly
   1.0, so score, depth and label are all equal and the order between two
   room-level placements is unspecified. Reordering the same words to "caliper
   mill room" narrows correctly. Not changed: this bundle writes no migration.
2. **The score clamp costs most of the ranking granularity.** `least(ts_rank_cd
   * 2, 1.0)` saturates for any reasonable full-text match, so the great
   majority of ordering in practice comes from the depth tie break rather than
   from relevance.
3. **The grant census had not been updated for any of it** -- see the bundle
   entry beside this one.

Neither 1 nor 2 is a defect this session could repair, because repairing either
is a migration and this bundle is forbidden one. Both are pinned by tests so
they cannot be lost.

## What is explicitly NOT verified here

- That 0161-0163 are applied to production. Asserted by the commissioning task;
  unmeasurable from this repo.
- Anything about the `maps-media` bucket's real behaviour. The storage policies
  in 0163 are exercised against `tests/db/supabase-stub.sql`'s `storage`
  schema, not against Supabase Storage, and no object was ever uploaded.
- Any surface. There is no `/maps` route yet; this is schema only.
