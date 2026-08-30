---
title: "IDEA Maps grows its first surface: the admin editor at /maps/edit, where a real room can finally be put into the system (`claude/idea-maps-admin-editor-65iyd4`, no migration)"
date: 2026-08-30
branches: [claude/idea-maps-admin-editor-65iyd4]
subsystems: ["IDEA Maps", "Testing"]
migrations: []
---

Application code only, on 0161-0165 exactly as they stand on `main` and on
production. No migration is written and none turned out to be needed; the two
places the schema shaped this surface awkwardly are recorded at the bottom
rather than fixed.

## What shipped

`/maps/edit`, admin-only: the node tree (create, rename, describe, reparent,
re-kind, delete, all six kinds), typed-inches geometry per spec 7 (no canvas,
no dragging -- bundle B), item types with chip-input aliases and tags (spec
5.1), unique items and stock placements inside their container's detail, and
draft-and-publish per object and per subtree with admin save-and-publish in
one action (spec 4.3). Plus the `/dev/maps-edit` harness (four states via
`?state=`), four browser-verify route specs, and three test files.

New module `src/lib/maps/`: `maps.ts` (the pure registry), `selects.ts` (the
ONE copy of the editor's read, shared by the server load and the client
reload), `transports.ts` (the injected write surface), and seven components
under `MapsEditor.svelte`. Route `src/routes/maps/edit/`. `.mp-root` joined
`split.css`'s room lists the way `.cd-root` and `.fg-root` did; the `maps` app
is registered in `site-manifest.ts`; CLAUDE.md's subsystem and admin-tier
lists carry the new route.

## The load-bearing decisions

**One promotion path, even where two were legal.** 0161's retention trigger
makes a direct UPDATE of a published live row archive correctly, so admin
save-and-publish could have written live rows. The editor instead ALWAYS
stages a published object's edit as the pending revision and promotes through
`maps_publish` -- save-and-publish is stage-then-publish in sequence
(`mapsSaveObject`, the one write decision all four forms call). What this buys:
a failed second half leaves a *visible pending edit*, never a half-applied live
row, and there is exactly one code path that changes what the public sees.
Draft rows are edited in place, because nobody but editors can see them.

**Subtree publish is composed per-object `maps_publish` calls**, which 0161's
header names as the editor's job. The confirm renders the real counts by kind
first (including DRAFT ITEM TYPES referenced by items or stock in the subtree,
because publishing a placement whose type stays invisible would put a row on
the public map that names nothing -- `mapsSubtreePublishPlan`), runs parents
before children, and reports `published N of M` with every failure named. Each
object is atomic on its own; a stop-halfway leaves independently consistent
objects and a report saying which.

**The kind ladder is surfaced before the action, from mirrors pinned to the
SQL.** `mapsKindPairOk` and `mapsOutlineOk` mirror `_maps_kind_pair_ok` and
`_maps_outline_ok`; `tests/maps-kind-rules.test.ts` compares each against the
DEPLOYED function (36 pairs; 15 outline shapes; real insert attempts for the
root rule; a real re-kind refusal for the child check), never against a
description. The add controls render one button per legal kind and none for
anything else; the kind picker collapses to a fixed value with its reason when
children constrain it; the parent picker lists only containers whose kind may
hold the thing being moved. The database stays the boundary.

**Unsaved work never discards silently, with ONE navigation guard.** Every
form owns a `SaveState` (`autosave: false` -- a save of a published object
mints a retained revision, so debouncing writes would fill history) plus an
`EditBaseline`; forms register `{dirty, flush}` handles with the shell, which
flushes before a selection switch and asks only about what a flush could not
land. Route navigation goes through one `guardSaveNavigation` whose own
`save()` is that same flush, so there is exactly one `beforeNavigate`.

**Delete acknowledgements land on the surface that survives.** A node or type
delete unmounts its own pane, so the note renders in the LIST; an item or
stock delete's note renders in the node detail that remains. Blocked deletes
are a sentence naming the real counts instead of a control the database would
refuse.

**The accent is one property.** `.mp-root { --maps-accent: var(--gear); }` in
`MapsEditor.svelte` -- every place the maps identity would go reads it, and
the Claude Design pass (spec section 10) fills in one line. No colour was
invented; everything else is the existing neutral register.

## Measured

`tools/browser-verify` over four specs (`maps-edit`, `?state=node-pending`,
`?state=compartment`, `?state=unit`) at 375px and 1440px: **8 route/width
runs, 116 measurements, 0 outside threshold** after one real fix -- text
inputs overflowed 375px by 14px (`scrollWidth 389 vs clientWidth 375`,
`input#...rect-h` overhang 14.3px) because an input's intrinsic ~20-char width
beats a grid track minimum; `width: 100%; min-width: 0` on the form inputs
fixed it and the re-run measured 0px overflow at both widths. Contrast, worst
measured: section tab label 6:1, hint copy 6.91:1, publish-panel copy 11.34:1,
tree row name 14.22:1, all against canvas-read grounds the harness resolved.
Tap targets: every asserted control >= 44px at both widths (smallest 65.4x44).
Chip-edge hues computed against their real grounds: amber 4.60:1 on `--bg2` /
4.90:1 on `--bg1`, green 6.39:1, ice 7.53:1, `--boundary` 3.42:1 -- all above
the 3:1 boundary floor. Harness limits apply as documented: fallback font
stack, `prefers-reduced-motion` unexercised (nothing here animates).

## The negative controls, before and after

Two, both restored from an in-memory copy (never `git checkout --`) and
verified md5-identical, then re-run green:

1. **Permissive kind-rule mutation** (the rejected design): widening
   `mapsKindPairOk` to admit a unit directly inside a building reddened
   exactly the two oracle tests (`36 pairs` and the allowed-child derivation)
   -- 2 failed / 3 passed -- while the SQL stayed correct, which is the drift
   the oracle exists for. Restored: md5 `59491165c0739780a736035095c0fb2d`
   both sides, 5/5 green.
2. **Render mutation**: deleting the pending strip from `NodeDetail` reddened
   exactly the node pending-state render test (1 failed / 8 passed; the item
   type's own strip stayed green, proving the mutation was scoped). Restored:
   md5 `a660c667c5fdae0e607ff4596a91c6bc` both sides, 9/9 green.

## The guard proof

`tests/maps-editor-route.test.ts` drives the REAL `+page.server.ts` load
through the PostgREST shim: no session and a signed-in non-admin teacher both
reject with `status: 404`, and in the SAME test the admin's drive returns the
full fixture by identity (all 10 node names, the two draft nodes, the draft
type, and the staged pending revision with its snapshot). A second test proves
the 404 is about the surface, not emptiness: the same non-admin reads
published rows straight off the table (positive control) and still gets 404
from the route.

## Not verified

- The live Supabase project: no write, publish, or load here touched
  production. The RLS boundary itself is the earlier
  `maps-rls-boundary-tests-tvjq7v` bundle's proof; this bundle's db tests ran
  the same chain in the embedded fixture.
- A signed-in browser session on the real route: `/maps/edit` needs a Bosco
  Tech admin account no automated session holds. The Vercel preview checks for
  Mr. Pina are listed in the session report.
- Photo upload (bundle D), the plan canvas (B), the elevation editor beyond
  the typed per-compartment fields (C), the public viewer and search UI: out
  of scope and not built.

## The one thing this branch cannot fix: `maps` is not a reserved short-link name

`npm test` on this branch reports **2 failed / 4411 passed over 214 files**, and
the two failures are deliberate, known, and the truth. `/maps` is a new
top-level route, and `tests/short-link-reserved-names.test.ts`'s filesystem
sweep -- built precisely so a route added later "reddens the suite instead of
drifting silently the way this list did for a year" -- reddens on it: `maps`
is not in `RESERVED_SLUGS`, so an admin could mint a short link named `maps`
that a real page shadows forever.

Fixing it takes a MIGRATION: the same file's SQL<->TS check asserts the
deployed `_app_short_link_reserved` (0156) names the IDENTICAL set, so adding
`maps` to the TypeScript list alone only moves the redness onto the
mirror-equality tests while making the UI precheck disagree with the real
database gate -- the exact drift the file exists to prevent. This bundle was
told to write no migration and CLAUDE.md forbids a migration on a branch
regardless ("Migration work happens on main"), so the branch touches neither
half and the sweep stays red for the true reason. The one-commit fix, on
main, changing all three together:

1. `supabase/migrations/0166_short_link_reserve_maps.sql` -- redefine
   `public._app_short_link_reserved` on the 0156 pattern with `'maps'` added
   to the literal list (and 0156's own grants/revokes repeated, since a
   `create or replace` under this project's default privileges re-grants
   `anon`);
2. `'maps'` added to `RESERVED_SLUGS` in `src/lib/short-links.ts` (the file's
   own header says "change both together");
3. `'0166_short_link_reserve_maps.sql'` appended to the `CHAIN` in
   `tests/short-link-reserved-names.test.ts`, whose every test then goes green
   again.

Until that lands and is pasted into the SQL editor by hand, this branch's CI
is red on exactly those two tests, the integrate workflow will hold the
branch, and that hold is correct: shipping the route without the reservation
is how the footgun the sweep guards against reaches production.

## What the schema made awkward (reported, not changed)

1. **A pending revision cannot be staged for a NEW object**, since
   `maps_revisions` needs a live row to point at -- so "create as pending" is
   not expressible and creation is always a draft row. Consistent with the
   model (drafts are invisible), but it means "everything staged, nothing
   live" and "draft" are two spellings of not-public a P2 student tier will
   have to explain.
2. **`maps_publish` re-publishes a pending snapshot wholesale**, so a pending
   edit cannot be partially promoted; the editor treats the snapshot as the
   whole proposed row (which 0161 states) and always writes every content
   column into it, so an absent-key merge surprise cannot arise from this
   client.

Neither needs a migration for this bundle, and none was written.
