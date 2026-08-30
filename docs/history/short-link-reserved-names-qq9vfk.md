---
title: The short-link reserved-name list is derived and cross-checked, not just retyped
date: 2026-08-29
branches: ["claude/short-link-reserved-names-qq9vfk"]
migrations: ["0156"]
subsystems: ["short-links"]
---


### What changed

`_app_short_link_reserved` (0093) was a hand-typed list of 21 route names,
written the day the short-link feature shipped and never revisited since. The
route tree moved on without it: eleven more top-level paths now answer before
the `[shortlink]` catch-all is ever reached, and a slug matching any of them
was accepted by `app_short_link_upsert` while being dead on arrival -- the real
route or asset always wins and the printed link 404s forever.

`0156_short_link_reserved_names.sql` redefines `_app_short_link_reserved`
(same signature, plain `create or replace`, no drop needed) with the current
set of 32 names. `src/lib/short-links.ts`'s `RESERVED_SLUGS` -- the
client-safe mirror `ShortLinkManager.svelte`'s precheck reads -- is updated to
match.

### What was actually missing, verified against the real tree rather than trusted from a prior count

Walked `src/routes/` and `static/` top level myself rather than trusting the
"eleven" figure handed off from another session. Found:

- **Routes**: `a`, `b` (Foundry's `/a/<app>/` and `/b/<app>/<version>/`
  bundle routes), `foundry` itself, `fsp-pulse`, `fsp-tech-selection`,
  `sitemap.xml` (a real `+server.ts` route, not a static file, but it answers
  the same way -- before the catch-all is ever reached).
- **Static** (served ahead of routing entirely, per CLAUDE.md's "Carrying over
  legacy content"): `downloads`, `tools`, `manifest.webmanifest`, `push-sw.js`,
  `robots.txt`. (`coins`, `fsp`, `greenline`, `vanguard` were already on the
  old list.)

That is eleven new entries the OLD list needed and did not have (`a`, `b`,
`downloads`, `foundry`, `fsp-pulse`, `fsp-tech-selection`,
`manifest.webmanifest`, `push-sw.js`, `robots.txt`, `sitemap.xml`, `tools`),
matching the count handed off -- but arrived at independently, by reading the
tree, not by trusting the number.

**Two more real top-level paths were deliberately left OUT**, and this took
tracing through both the route's own shape guard and `app_short_link_upsert`'s
copy of it to confirm: `_platform` (leading `_`) and `IDEA` (the static
folder, uppercase). Both fail `^[a-z0-9][a-z0-9._-]{0,60}$` -- enforced in the
`[shortlink]` route's `load` before any RPC runs, and again inside
`app_short_link_upsert` before the reserved check -- so no slug can ever equal
either name. Reserving them would be dead code the shape guard already makes
unreachable.

### Why it will drift again otherwise, and what stops it

SQL cannot read the filesystem, so `_app_short_link_reserved`'s list can never
be self-deriving -- the migration carries a static result, same as before.
What is new is `tests/short-link-reserved-names.test.ts`, which makes the next
drift loud instead of silent, in two independent ways:

1. **Filesystem coverage.** At test time it walks the real `src/routes/` and
   `static/` top-level entries, filters to the ones that fully match the slug
   shape (the same filter that excludes `_platform` and `IDEA`), and asserts
   every one is in `RESERVED_SLUGS`. A route or a static top-level asset added
   six months from now reddens this test instead of sitting unreserved for
   another year.
2. **SQL <-> TypeScript sync.** It reads `_app_short_link_reserved`'s own
   `pg_proc.prosrc` back out of a real, migrated Postgres and asserts the set
   of quoted literals in it is exactly `RESERVED_SLUGS` -- not a superset, not
   a subset. Nothing type-checks the SQL function and its TS mirror staying
   equal; this is what would catch one of them being edited without the
   other.

`tests/short-link-redirect.test.ts`'s existing hand-transcribed `RESERVED`
array (the per-name creation-refusal sweep, "a generated sweep asserts its
own case count") is updated to the same 32 names and its chain now includes
0156. It stays hand-transcribed on purpose, per its own header -- deriving the
creation-refusal sweep from the predicate under test would make it unable to
fail. `PRE_CHAIN` (the pre-0093 degrade-rung simulation) now also excludes
0156, since 0156's `do` block reads a table 0093 creates and would fail to
apply without it.

### Existing slugs that collide with the newly reserved names

None found -- this repo's local `.env` is a placeholder project (per
CLAUDE.md, "The local `.env` is a PLACEHOLDER Supabase project"), so there is
no live `app_short_links` table this session can read. The migration itself
reports the answer at apply time regardless: a `do $$ ... $$` block queries
`app_short_links` for any row whose slug is one of the eleven newly reserved
names and `raise notice`s each one found (or a single notice saying none was
found). Per CLAUDE.md, an authored slug is a permanent contract and a
migration refuses rather than destroys, so no row is touched either way -- a
colliding row was already unreachable (the real route or asset was already
winning before this migration), and the only behavioural change is that
`app_short_link_upsert` will refuse to re-point it going forward, which is
correct: an admin should not be able to keep re-pointing a slug that can never
resolve. **Whoever applies 0156 by hand should read the NOTICE output** and
tell the migration's author if any name comes back non-empty.

### The route's own shape refusal, confirmed unchanged

The `[shortlink]` route (`src/routes/[shortlink]/+page.server.ts`) has no
reserved-name check of its own -- that lives entirely in
`app_short_link_upsert`, checked at creation. What the route refuses is the
slug's SHAPE, before any RPC is made. This code was not touched by this
bundle; `tests/short-link-redirect.test.ts`'s existing
`'the ROUTE has no reserved check: what it refuses is the slug SHAPE'` test
(which counts RPC calls through the shim) still passes unmodified, confirming
the short-circuit still holds.

### Mutation proofs

- **A reserved name is refused at creation**: the extended 32-name loop in
  `tests/short-link-redirect.test.ts` (all passing).
- **The SQL <-> TypeScript sync check bites**: removed `'foundry'` from
  0156's SQL array only (TS untouched) -- both the "TS subset of SQL" test and
  the prosrc-set-equality test reddened with exactly `foundry` named. Restored
  the file from a saved copy, confirmed md5-identical, reran green. Then
  removed `'foundry'` from `RESERVED_SLUGS` only (SQL untouched) -- the
  filesystem-coverage test and both SQL/TS sync tests reddened. Restored from
  a saved copy, confirmed md5-identical, reran green.
- **A newly added route directory reddens the staleness check**: is now a
  standing test (`'mutation proof: an unreserved route directory reddens the
  sweep'`), not a one-off manual check -- it creates an untracked directory
  under `src/routes/` at test time, confirms the coverage sweep names exactly
  that directory as uncovered, then removes it in a `finally` block. Nothing
  tracked by git was ever touched by this proof, so there was nothing to
  restore via `git checkout --`.
- **The shape refusal still short-circuits before the RPC**: confirmed by
  rerunning the existing (unmodified) route test, which counts RPC calls and
  asserts zero for a malformed slug.

### Verification

- `svelte-check`: 0 errors, 37 warnings (unchanged mix) before and after, on a
  fresh `npm ci` checkout with `.env` written before `svelte-kit sync`.
- `npx vitest run --no-file-parallelism tests/short-link-reserved-names.test.ts
  tests/short-link-redirect.test.ts tests/short-link-list-gate.test.ts`: 74
  tests, all green.
- Full suite (`npm test`): reported in the session's final message.

### Not verified

- The live Supabase project (no access from this session; `.env` here is a
  placeholder project per CLAUDE.md).
- A real browser pass -- this bundle touches no rendered surface
  (`ShortLinkManager.svelte`'s precheck message text is unchanged; only the
  list it validates against grew).

### Left undone

- `coin-entry` stays on the reserved list though the route it named no longer
  exists (noted as stale-but-harmless in a prior session's history entry,
  `docs/history/route-test-coverage-yw1a9z.md`). It costs nothing -- an
  over-reservation blocks a slug nobody can create for a route that no longer
  exists, it does not create a dead link -- so it was left alone rather than
  folded into this bundle's diff.
