---
title: "IDEA Maps granted editors: a (person, container) allowlist that reaches drafts in one subtree and nothing else (`claude/maps-editor-grants-2ktnt3`, migration 0172)"
date: 2026-09-03
branches: [claude/maps-editor-grants-2ktnt3]
migrations: ["0172"]
subsystems: ["IDEA Maps", "Database", "Access model", "Tooling"]
---

Before this bundle exactly one person could put anything on the map. `IDEA_MAPS_SPEC.md`
section 7 had granted student editors in P2; Mr. Pina moved them to P1 on 2026-09-02 for
the obvious reason, which is that a map nobody can help fill stays half empty.

The contract is section 7's, unchanged: a grant is a (person, container) row meaning
subtree edit rights, DRAFT ONLY. Publishing stays admin, and so does touching anything
already on the public map.

## What landed

- **`supabase/migrations/0172_maps_editor_grants.sql`** -- the roster table
  `maps_editor_grants`, a bounded ancestor walk, three predicates over it, four RPCs, and
  twenty new RLS policies plus one on `storage.objects`. **Committed straight to `main`
  with its db test, per the prompt; every other commit in this bundle is on the branch.**
- **`src/lib/maps/grants.ts`** -- the pure, client-safe scope arithmetic. No Supabase, no
  Svelte.
- **`src/lib/maps/GrantAdmin.svelte`** -- the admin console.
- Scope threading through `MapsEditor`, `NodeDetail`, `ItemTypeDetail`, `MapsItemForm`,
  `MapsStockForm`, `MapsPublishPanel` and `ShelfEntry`.
- `src/routes/dev/maps-grants/**` -- the side-by-side harness, and two route specs.

## The decisions worth keeping

### The subtree test is a bounded walk, not a stored path

`maps_nodes` is self-referential, so "is this row at or below a node the caller holds" is
an ancestor question, and an ancestor question inside an RLS predicate is the kind of
thing that quietly becomes a table scan per row.

**The kind ladder bounds it.** `_maps_kind_pair_ok` (0161) allows only
site -> building/outdoor_zone -> room/outdoor_zone -> unit -> compartment, and a legal
parent's kind is always strictly higher, so the deepest chain a node can sit in is FIVE
EDGES. `_maps_node_ancestors` is a recursive CTE walking up from the row, capped at 12
levels as belt and braces against a cycle the ladder already makes unrepresentable.

A materialized path or a closure table was the rejected alternative, and reparenting is
why: either is a stored denormalisation that has to be rewritten for a whole subtree every
time a node moves, with nothing to notice when it is not. The walk cannot go stale because
there is nothing to keep in step.

**Measured rather than assumed** (`tests/db/maps-grants-boundary.test.ts`): a seeded tree
of **1813 nodes** -- roughly four times what the school will ever hold, at the ladder's
full depth -- read whole as an admin in **676.4ms** and whole as a grantee in **1230.2ms**.
1.8x a plain read for a per-row five-lookup walk, on a table that will realistically hold
hundreds of rows.

**The predicates are `SECURITY DEFINER` and that is forced, not preferred.** A
`SECURITY INVOKER` function selecting `maps_nodes` while being called from a `maps_nodes`
RLS policy is infinite policy recursion, which Postgres refuses outright.

### Second permissive policies, not a rewrite of 0161's

Every policy 0161 and 0163 applied is left byte-identical; 0172 adds `*_editor_*` policies
beside them. Permissive policies on one command OR together, so an admin's rights after
this file are `old OR (a predicate false for an admin's own path)` -- which is the old
rights, as a property of objects nobody touched rather than as a claim about text somebody
has to re-read. 0172's own section 6a walks `pg_policy` and raises if any pre-existing
admin policy has stopped naming `is_admin()` or has started naming an editor predicate;
the db test asserts the same thing from the outside over all **26** of them.

### The draft ceiling is in the policy, not in the RPC

`maps_publish` is admin-gated in its body (0161 line 520) and stays that way. But 0161's
UPDATE policy also permits a plain `update ... set status = 'published'` straight through
PostgREST, so a grantee policy that only said "in your subtree" would hand the grantee the
publish the RPC refuses them. Every editor write policy pins `status = 'draft'` in **both**
directions -- USING so a published row is never a candidate, WITH CHECK so a draft can
never be updated into a published one. Case 3 of the boundary test measures both routes.

### `maps_item_types` has no node, and cannot be given one

The item-type vocabulary is site-wide by design (spec 5.1: one type, stocked in many
places). A grantee may create and edit DRAFT item types globally, gated on holding at least
one grant. **The alternative was refused for a stated reason**: a grantee who cannot name a
new type cannot catalog a drawer containing anything the vocabulary does not already have,
which stalls the flow on the one person this tier exists to unblock. What it costs is that
two grantees can edit each other's draft types -- an editorial collision between two people
who were both given the licence, not a disclosure, since a draft is invisible to anon and
to the public.

### A photo has no status, so its ceiling is its owner's

`maps_photos` carries no publish state (0163: "a photo is CONTENT OF its owner") and its
public visibility follows the owner's. So hanging one on a PUBLISHED owner puts it on the
public map immediately, which is publishing by another route:
`_maps_photo_owner_editable` requires the owner to be draft AND in scope, for all three
owner shapes. `_maps_photo_owner_visible` is the read twin. One implementation of the reach
rule, called by four policies, rather than four restatements of the XOR.

`storage.objects` gets an INSERT policy only. The `maps-media` key is arbitrary text and
names no owner, so the bytes cannot be scoped; the `maps_photos` ROW is the real gate, and
0163 already names an unreferenced public image as this feature's acceptable failure.
UPDATE and DELETE stay admin-only, so a grantee can never overwrite or remove an object a
published photo points at.

### `maps_revisions` is deliberately NOT widened

A pending revision is the staged edit of a PUBLISHED object, and a grantee may not touch a
published object -- so there is nothing for them to stage. The retention machinery stays
admin-only with nothing new able to reach it. 0172's self-check raises if a `*_editor_*`
policy ever appears on that table.

## Two bugs the work found, both real rather than test artefacts

**`insert ... returning` was answering zero rows for a grantee.** Postgres applies the
SELECT policies to an INSERT's RETURNING clause, and PostgREST puts a RETURNING on every
insert (`.insert(v).select('id')`). The first read policy walked UP FROM THE ROW'S OWN ID
-- a STABLE function on the command's own snapshot, which does not contain the
just-inserted tuple. The row landed and the client read back nothing, which
`transports.insertRow` reports as a refused write. `maps_nodes_editor_read`'s second
disjunct is the fix: `maps_can_edit_node(parent_id)` reads the NEW ROW'S OWN COLUMN and
needs no lookup of the row. It covers the same set. Case 1c pins the RETURNING shape
specifically.

**"That object is no longer there" was the wrong sentence.** An UPDATE or DELETE refused by
RLS answers zero rows, not an error, so "gone" and "not yours" arrive identically. Before
0172 they could not be told apart and did not need to be -- every writer was an admin, who
could reach every row. A grantee makes the second case ordinary, and the advice is then
one that cannot work: the reload brings the row straight back. `absentOrRefused` in
`transports.ts` re-reads the row on the failure path only; an UPDATE's USING clause and a
SELECT policy are different predicates, so a row still readable after a write returned
nothing was refused rather than removed.

Also fixed while there: SQLSTATE `42501` now maps to a sentence about what the person may
do rather than to Postgres's "new row violates row-level security policy for table
\"maps_nodes\"". It was already non-retryable -- `isTransientSqlstate` is a whitelist and
42501 was never on it -- so the `0008` retry-vs-refusal rule was not being broken; only
the wording was.

## The app side: absence, not disabled controls

**Publishing is removed by omitting the transport.** `MapsTransports.publish` is optional
now, and `mapsTransportsFor(supabase, scope)` is the ONE place it is withheld. Both routes
that mount an editor call it. The TypeScript compiler found the two direct call sites
(`NodeDetail`'s subtree loop, `ShelfEntry`'s save) the moment the property became
optional, which is the argument for doing it this way rather than with a boolean.

**The publish PANEL stays and the controls go.** A grantee needs the state sentence more
than an admin does -- it is what tells somebody standing at a toolbox that what they typed
is not on the public map yet -- so a null `onpublish` renders "A site admin publishes this
container" in the controls' place. That is the "a control absent for a reason says the
reason" rule, which is the `aria-disabled` argument for the case where there is nothing to
disable.

**A grant is shown by its containment path, never by a uuid.** `mapsNodePath` is the one
implementation, which is exactly why `maps_editor_roster` projects `node_id` and no path: a
SQL twin would be a second answer to "what is this container called". The browser spec
forbids the uuid by name.

**The gate at `/maps/edit` is now "admin OR holds a grant"**, still in the area's
`+layout.server.ts`, still 404 for anybody else. A grantee lands on the same pages and
mounts the same `MapsEditor`, narrowed by scope -- there is no second editor to keep in
step. The scope is resolved once in the layout and rides `page.data` down.

## Verification

**`tests/db/maps-grants-boundary.test.ts` -- 13 tests, all driven through `db.asUser`**
(claims GUC then `SET ROLE authenticated`, what PostgREST does). Nothing in it runs as the
connection owner or as `service_role`; both bypass RLS and would make every assertion pass
vacuously.

The seven cases the bundle owed, each executed, with the five refusals' positive controls:

| # | Case | Result | Control |
|---|---|---|---|
| 1 | grantee writes a draft inside their subtree | ALLOWED (insert, update, delete, item at depth 4) | -- |
| 1b | the grant reaches two levels below the granted node | ALLOWED | -- |
| 1c | `insert ... returning` gives the row back | 1 row | -- |
| 2 | grantee writes a draft outside it | REFUSED (insert, update, delete) | opened `maps_nodes_editor_insert` -> **landed**, restored md5 IDENTICAL |
| 2c | an outsider with no grant | REFUSED, and cannot see the draft | -- |
| 3 | grantee publishes | REFUSED via the RPC ("Only site admins can publish IDEA Maps content.") AND via a direct `set status='published'` | opened `maps_nodes_editor_update` -> **landed**, restored md5 IDENTICAL |
| 4 | grantee edits a published row inside their subtree | REFUSED (update and delete) | opened `maps_nodes_editor_update` -> **landed**, restored md5 IDENTICAL |
| 5 | grantee grants or revokes | REFUSED (both RPCs raise); roster returns 0 rows; the table is unreadable | opened `maps_editor_grants_admin_read` -> **saw rows**, restored md5 IDENTICAL |
| 6 | after revoke, case 1 | ALLOWED before, REFUSED after, same statement, same session | opened `maps_nodes_editor_insert` -> **landed**, restored md5 IDENTICAL |
| 7 | admin does all of it | ALLOWED (insert, update draft, update published, delete published, stage pending, roster 2 rows, publish through the RPC) | 26 pre-0172 admin policies still `is_admin()`, none naming an editor predicate |

**All seven were executed. None was reasoned about.** Every control flipped its case to
allowed, which is what says the refusal was the policy and not a missing fixture.

**The restore is from a captured copy, never from git.** `pg_get_expr` over `pg_policy` is
read BEFORE each mutation, the restore is built from that captured text, and the expression
is read back and compared by md5 -- so "restored identical" is a measurement. Nothing under
`supabase/migrations/` is read, written or re-applied, and no `git` command runs: CLAUDE.md's
rule exists because `git checkout --` inside a mutation script discarded three sessions'
uncommitted work.

The mutation is also proven to have LANDED before its result is read -- a mutation that
never applied is indistinguishable from one nothing catches, and is the likelier of the two.

**Re-apply**: the whole file is put to a database that already has it, self-check block and
all, and the policy count holds at 22 rather than doubling.

**`tests/maps-grants-render.test.ts` -- 13 tests**, `svelte/server` render of the REAL
`MapsEditor` over the REAL harness fixture. Every claim carries both directions with
counts, and the admin render over the same fixture in the same call shape is the positive
control for every absence:

- publish controls -- draft container: admin **2**, grantee **0**; published container with
  a staged edit: **2 / 0**; draft item type: **2 / 0**; new container: **1 / 0**
- inside the grant: **1** save, **1** add-child, **0** refusal notes; outside: **0 / 0 / 1**
- tree rows: admin **8**, grantee **7** (the one draft outside the grant is gone; every
  published row stays, which is 0161's public read and not this tier's doing)
- editable ids: **5 of 8** nodes

**`npm run verify:browser -- --route /dev/maps-grants` -- 6 route/width runs, 94
measurements, 0 outside threshold**, at 375px and 1440px, in 14.6s.

Four findings on the first pass, all real and all fixed:

1. **50.4px horizontal overflow at 375px.** A `<select>`'s intrinsic width is its longest
   option, and the longest option here is a full containment path. `min-width: 0` on the
   flex PARENT does nothing -- the automatic minimum being overridden has to be the
   SELECT's own. The path is what makes a grant readable, so the control clips rather than
   the label shortening.
2. A contrast row read `no match` because the selector was `[data-testid=...] .col h2` and
   the testid IS on the `.col` element. A check that measures nothing reports as neither
   pass nor fail, which is the quiet half.
3. The who-publishes contrast was asserted on a PUBLISHED object, where the panel correctly
   offers neither a control nor a substitute sentence (`maps_publish` answers
   `nothing_pending`). It moved to `?state=granted`, and a third spec was added for that
   state -- the one a granted editor actually works in.
4. The spec asserted **no add-child under a published container for a grantee**, and that
   was wrong. A draft child under a published container is the ordinary case: the gate is
   "is this container in the subtree", not "is this container a draft". Present 1 on both
   sides now, stated as a scope control rather than a draft-ceiling one.

**The browser spec was mutation-proved**: with the grantee's transports left carrying
`publish`, **10 measurements across 5 checks x 2 widths** went red -- the zero-publish-controls
presence row, the who-publishes presence and contrast rows, and both text-contains rows.
The harness file was restored from a copy taken first and is md5-identical (`e5c71ae4...`
before and after), and the re-run is back to 0 outside threshold. No new CHECK TYPE was
added, so `--selftest` needed no new controls.

**`npx svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived after `svelte-kit sync`
with the two `PUBLIC_SUPABASE_*` placeholders exported, per the missing-`.env` note.

**Full suite**: see the final report on the branch.

## Not verified, and why

- **Nothing here ran against the live Supabase project.** The local `.env` is a placeholder
  and this container has no Docker and no WSL, so no local Supabase stack either. Every
  database claim above comes from the embedded-Postgres harness with the real migration
  files applied unmodified.
- **No signed-in session of any kind was exercised.** `/maps/edit` needs a real Bosco Tech
  Google account, which no cloud session holds. Everything in the browser pass is the
  dev-guarded harness, which needs no auth by construction.
- **`prefers-reduced-motion` is `no-preference` in the harness** and web fonts are blocked
  (the proxy resets `fonts.googleapis.com`), so text is measured in the fallback stack.
- **The `maps-media` storage policy was not exercised end to end.** The stub provides
  enough `storage` for the schema; an actual object upload as a grantee is Mr. Pina's step.

## Applying 0172, cold

**Do not run `supabase db push`.** It would replay all 172 files including 0084 and 0100,
which are one-time imports over live student coin data.

One file, pasted whole into the Supabase SQL editor, after 0171:

```
supabase/migrations/0172_maps_editor_grants.sql
```

A correct notice pane, in order:

```
0172: every 0161/0163 admin policy still reads is_admin() and names no editor predicate.
0172: maps_nodes -- 9 policies total, 4 of them the editor tier.
0172: maps_item_types -- 9 policies total, 4 of them the editor tier.
0172: maps_items -- 9 policies total, 4 of them the editor tier.
0172: maps_stock -- 9 policies total, 4 of them the editor tier.
0172: maps_photos -- 9 policies total, 4 of them the editor tier.
0172: maps_revisions has 0 editor policies, as intended -- staging stays admin-only.
0172: storage.objects -- one maps_media_editor_insert, no editor update or delete.
0172: every editor insert/update/delete policy on the four content tables pins status = draft in every clause it has.
0172: _maps_photo_owner_editable pins the owner to draft.
0172: maps_publish still refuses a non-admin in its own body. Publish is unchanged.
0172: public._maps_node_ancestors(uuid) -- anon f, authenticated f.
0172: public._maps_photo_owner_editable(uuid,uuid,uuid) -- anon f, authenticated t.
0172: public._maps_photo_owner_visible(uuid,uuid,uuid) -- anon f, authenticated t.
0172: public.maps_can_edit_node(uuid) -- anon f, authenticated t.
0172: public.maps_can_view_node(uuid) -- anon f, authenticated t.
0172: public.maps_editor_grant(text,uuid,text) -- anon f, authenticated t.
0172: public.maps_editor_revoke(text,uuid) -- anon f, authenticated t.
0172: public.maps_editor_roster(uuid) -- anon f, authenticated t.
0172: public.maps_is_editor() -- anon f, authenticated t.
0172: public.maps_my_editor_grants() -- anon f, authenticated t.
0172: maps_editor_grants -- RLS on, admin-read only, no client write path, 0 row(s). No seed: an empty roster is exactly the world 0161 left behind.
0172: IDEA Maps granted editors in place. Draft-only, subtree-scoped, publish unchanged. Grants are made by hand -- see section 7.
```

`_maps_node_ancestors` is the one line reading `authenticated f`, and that is deliberate: a
client grant on it would let any signed-in caller walk the whole tree, drafts included.
**Anything raising instead of noticing means stop and read the message**; each raise names
the exact thing it found.

The file is idempotent -- re-pasting it is ordinary and safe, and is asserted in the db
test rather than assumed.

## Mr. Pina's own steps, in order

Everything below needs a signed-in Bosco Tech account, which no cloud session holds. There
is no way around this and it is not a gap in the verification -- it is the part of the
system that is made of real accounts.

1. **Apply 0172** in the SQL editor and read the notice pane against the block above.
2. **Deploy the branch** (or merge it), so the editor knows about grants. Order does not
   matter: the app degrades on `PGRST202` until the migration lands, and the migration is
   inert until the app ships.
3. **Grant one student one room.** From the SQL editor the RPC will refuse you --
   `is_admin()` reads the session's JWT claims and the SQL editor has none -- so use the
   plain insert 0172 section 7 spells out, or use the console on `/maps/edit` while signed
   in as yourself, which is the path worth testing:
   - open `/maps/edit`, scroll to **Who can edit the map**
   - enter a real `@boscotech.net` student address, pick a room, press **Grant editing**
   - confirm the roster row appears and reads by path, not by id
4. **Try a refusal first.** Enter a `@gmail.com` address. It must be refused, in the same
   words, before you press anything.
5. **Sign in as that student** (or have them do it, watching) and check, in this order:
   - `/maps/edit` **opens** for them, where before it was a 404
   - the banner at the top names the room they were given, by path
   - the tree shows their room and its contents, the spine above it, and every published
     node -- and **no draft outside their room**
   - opening a container inside their room shows **Save draft** and **no Save & publish**
   - opening a container that is already public shows **no Save at all**, with a sentence
     saying why
   - there is **no Who-can-edit panel** anywhere on their page
   - `/maps/edit/shelf` opens, the container picker offers **only containers inside their
     room**, and the camera works
6. **Revoke it while they are still on the page**, then have them press Save. It must be
   refused immediately, without them signing out and in.
7. **Check a second student with no grant still gets 404** on `/maps/edit`.

Step 5's last two lines and step 6 are the ones worth doing carefully: the shelf camera
path is the only place a grantee touches Storage, and the immediacy of a revoke is the
property that would be quietly wrong if anything cached.
