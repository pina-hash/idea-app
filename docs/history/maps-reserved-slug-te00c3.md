---
title: "`maps` joins the reserved short-link names (0166), ahead of the IDEA Maps route it will shadow (`claude/maps-reserved-slug-te00c3`, migration 0166)"
date: 2026-08-30
branches: [claude/maps-reserved-slug-te00c3]
migrations: ["0166"]
subsystems: ["Short links", "IDEA Maps", "Testing"]
---

### 1. What this is, and the one premise in the brief that did not hold

IDEA Maps ships a top-level route at `src/routes/maps/`. SvelteKit resolves a
real single-segment route ahead of the `[shortlink]` catch-all, so from the
moment that route lands, a short link with the slug `maps` can never be
reached. 0156 already wrote down why that matters: accepting such a slug does
not create a working link, it only misleads whoever created it. So `maps` is
added to both statements of the reserved set -- `_app_short_link_reserved` in
SQL (0166) and `RESERVED_SLUGS` in `src/lib/short-links.ts` -- and
`tests/short-link-reserved-names.test.ts` is pointed at the new definition.

**The brief said both halves of that test were currently red on `main`, and
they were not.** `src/routes/maps/` is on `claude/idea-maps-admin-editor-65iyd4`
and has not merged; `main` carries the maps MIGRATIONS (0161-0165, correctly,
since CLAUDE.md keeps migrations off branches) but not the maps ROUTE. Measured
before touching anything: `tests/short-link-reserved-names.test.ts` was **8
passed / 8** on `1fe5c4c`. The filesystem check is one-directional -- every
slug-shaped route must be reserved, not every reserved name must be a route --
so a name reserved ahead of its route is green both before and after the merge,
and this bundle is a no-op on today's tree that becomes load-bearing the day
the editor branch lands.

**What the brief got right, and it is the reason for the shape:** the two
halves of that test must move together. Adding `maps` to the TypeScript list
alone reddens the SQL-versus-TypeScript check, and the SQL half is a migration,
which is main-only. So the three files cannot be separated without leaving
`main` red in between -- which is why this went straight to `main` with no
branch, unusually for a bundle of this size.

### 2. Why 0166 was free

`ls supabase/migrations/` tops out at `0165_maps_search_conjunctive_tsquery.sql`
(165 files, contiguous). 0161-0165 are the IDEA Maps data layer, all of them on
`main`. `git log --all --diff-filter=A -- 'supabase/migrations/0166*'` returns
nothing, so no unmerged branch has claimed the number either -- checked across
all refs rather than against `main` alone, since a number taken on a branch
would still collide at apply time. Nothing after 0156 redefines
`_app_short_link_reserved` (0093 defines it, 0137 sweeps its grants, 0156
redefines it; `grep -rln` over the whole directory names exactly those three),
so 0156 is the definition this file supersedes.

### 3. The migration reports the collision instead of resolving it

A short link with the slug `maps` may already exist in production, created
before `/maps/` was a route, and reserving the name does not remove it. That
cannot be checked from a working copy -- the local `.env` points at a
placeholder project and nothing here can query the live database -- so the
answer is printed at apply time, in the SQL editor, for whoever runs the file.

The row is left in place unmodified. An authored slug is a permanent contract
and a migration refuses rather than destroys; a printed handout pointing at a
slug that vanished is worse than one pointing at a slug that has always been
dead. The only behavioural change for such a row is that
`app_short_link_upsert` will refuse to re-point it from now on, which is
correct. The notice names the slug, its target, its active flag and its label,
because whoever decides what to do about it needs to know what it pointed at;
retiring it (`active = false`) or re-issuing the handout is a separate,
deliberate decision by a person holding that notice.

Verified against a real database with a colliding row seeded first:

```
0166: app_short_links row "maps" now names a reserved slug.
      target=/classroom/maps-handout active=t label=Unit 2 shop map.
      It is LEFT IN PLACE UNMODIFIED -- nothing here deletes or deactivates it
      -- but it can no longer resolve once /maps/ ships, and
      app_short_link_upsert will refuse to re-point it from now on. ...
0166: 1 existing short link(s) hold a slug newly reserved by this file
      (of 1 name(s) added: maps).
0166: reserved slug list is now 33 names (32 from 0156, plus "maps"); anon and
      authenticated hold no EXECUTE on the predicate; service_role does.
```

The seeded row was still `('maps', '/classroom/maps-handout', active=true)`
after two applies. `slug` is the table's primary key, so at most one row can
ever match; the block is shaped as a count-and-loop anyway so the notice reads
the same whether the answer is none or one.

### 4. The grant names roles, which is the one place this file departs from 0156

0156 and 0093 both end on a bare `revoke all on function ... from public`,
which on a hosted Supabase project removes only the PUBLIC entry and leaves the
direct `anon`/`authenticated` grants the project's default privileges write
into every new function's ACL. 0166 names the roles instead
(`from public, anon, authenticated`) and grants `service_role` back explicitly.

**On production this is belt-and-braces rather than a fix, and the reason is
worth writing down: `create or replace` over an EXISTING function preserves
that function's ACL.** Default privileges apply at CREATE, not at REPLACE. So
0156's bare revoke was not silently reopening anything -- the function was
already sitting in the end state 0137's sweep put it in, and it still is.
Measured after two applies of 0166 on the real chain, `proacl` reads
`postgres=X/postgres | service_role=X/postgres`: `anon` false, `authenticated`
false, `service_role` true. What naming the roles buys is that the end state no
longer depends on how the function got there -- including the one case that
WOULD otherwise reopen it, a database where the function does not yet exist and
`create or replace` is genuinely a create.

`_app_short_link_reserved` needs neither `anon` nor `authenticated`: its only
caller is `app_short_link_upsert`, which is SECURITY DEFINER and runs it as the
owner. It is not named in any RLS policy, so the 0070/0109 lesson (a function
inside a `using` clause is evaluated as the querying role and must keep
`authenticated`) does not apply to it -- which is exactly why 0137 put it on
the private-helper list in the first place.

The file also carries a self-check that 0156 predates: it reads the predicate
and the catalog back and RAISES rather than trusting that the statements above
it ran. It asserts `maps` is reserved, that `open-lab` is NOT (a positive
control, so "everything is reserved" cannot pass as success), and that neither
`anon` nor `authenticated` holds EXECUTE.

### 5. Verification

- **Baseline, before any edit:** `tests/short-link-reserved-names.test.ts`
  8 passed / 8 on `1fe5c4c`. The brief's "both halves are currently red" is
  not what the tree reports; see section 1.
- **After the change, on today's `main` tree (no maps route):** 8 passed / 8.
- **After the change, with the merged state simulated** -- an untracked
  `src/routes/maps/+page.svelte`, the same technique the test's own mutation
  proof uses for its stray directory: 8 passed / 8. This is the state the
  bundle actually exists for, and it is the only way to exercise the
  filesystem half against `maps` while the editor branch is unmerged.
- **Negative control**, with the simulated route present and `'maps'` removed
  from `RESERVED_SLUGS`: 3 failed / 5 passed. Both halves bit, which is the
  point of running it in that state -- the filesystem check
  (`expected [ 'maps' ] to deeply equal []`), the sweep's own mutation proof
  (`expected [ 'maps', …(1) ] to deeply equal [ 'zz-mutation-proof-stray-route' ]`)
  and the SQL-versus-TypeScript check (`Set{…30} to deeply equal Set{…29}`,
  received `+ "maps"`). Restored from a copy, md5-verified identical
  (`da9e5f59217450274f3dbbd00d7a4311`), re-run green. **Restored from a saved
  copy and not with `git checkout --`**, per the rule in CLAUDE.md: the tree
  held two other uncommitted files at the time and a discard-to-HEAD would have
  taken them with it.
- **Double apply:** the file applied twice in a row against a real migrated
  database (chain 0001, 0003, 0020, 0067, 0093, 0137, 0156). The second apply
  raised no error and its NOTICE stream was byte-identical to the first's.
  `pg_proc` holds exactly ONE row for `_app_short_link_reserved` afterwards, so
  the replace left no second overload (it could not -- the argument list is
  unchanged, so the signature trap does not apply here, but it is asserted
  rather than reasoned).
- **End to end, through the real RPC:** as the pinned owner,
  `app_short_link_upsert('maps', ...)` is refused with `The slug "maps" is a
  real page on this site and would never be reached.`, while
  `app_short_link_upsert('open-lab', ...)` still lands -- the positive control
  that says the refusal is about the slug and not about the caller. (The first
  attempt at this ran as the connection owner and was refused by the
  `is_admin()` gate before the reserved check was ever reached, which is a
  defect in the probe rather than a result.)

### 6. Not verified

- **Anything against the live Supabase project.** The local `.env` is a
  placeholder ref; nothing in this repo can apply a migration or run an RPC
  against production. **So whether a short link with the slug `maps` actually
  exists is unknown from here** -- the notice in section 3 is the answer, and
  it is delivered to whoever pastes the file, not to this session. The
  collision case was exercised by SEEDING such a row into the test database,
  which proves the report fires and says what it should; it says nothing about
  whether production holds one.
- **The merged state itself.** `src/routes/maps/` is not on `main`, so the
  filesystem half was exercised against a simulated route directory rather
  than the real one. When `claude/idea-maps-admin-editor-65iyd4` merges, that
  check covers the real thing with no further change.
- **No browser pass.** Nothing here renders. `ShortLinkManager.svelte` reads
  `RESERVED_SLUGS` for its client-side precheck and gains one more name in the
  list it already refuses; no markup, style or layout moved.
- **No `classroom-updates.json` entry.** Nothing a student sees changes: the
  reserved list is an admin-facing authoring guard on `/admin`, and a student
  who scans a `maps` handout gets exactly what they got before this file.
