---
title: "A student can delete their own app, and an admin can delete any (`0136`, `lane/foundry-manage`)"
date: 2026-08-25
branches: [lane/foundry-manage]
migrations: ["0136"]
subsystems: ["IDEA Foundry"]
record_order: 142
---

## A student can delete their own app, and an admin can delete any (`0136`, `lane/foundry-manage`)

**Branch:** `lane/foundry-manage`. **Migration:** `supabase/migrations/0136_foundry_delete.sql`.

### What was missing

0130 shipped `foundry_set_app_hidden`, which is ADMIN ONLY and which HIDES
rather than deletes. There was no path of any kind by which a student could
remove their own app: not a control, not an RPC, not a grant. On a school
platform holding a student's own work that is the half that matters. Shelving
somebody else's project is a staff judgement; throwing your own away is not.

### Hide and delete both stay, and the interface states the difference

They are different decisions and collapsing them would break one of the two:

- **hide** shelved but kept. Off the gallery, off the serving route, files
  intact, reversible by the same function that did it.
- **delete** gone. The app row, every version row, every file row and every
  stored object. No undo and nothing to restore from.

A single "remove" verb would mean either a delete a student cannot trust (their
work is still sitting there) or a hide staff cannot reverse. `/foundry/review`
renders the two as a definition list above the controls, so a reviewer reads
the difference rather than remembering it.

### The two-system problem, which was the only hard part

Rows live in Postgres, bytes live in Storage, there is no transaction across
them, and one of the two writes can land alone. Three arrangements, two worse:

| order | what a failure between them leaves |
| --- | --- |
| objects, then rows | a **live app whose every file 404s**. Still listed, still on the gallery, still resolved by the serving route. Reads as a corrupted upload, and the student finds it. |
| one call doing both | not available. The database cannot delete a Storage object; the Storage API cannot join a transaction. |
| **rows, then objects** | an **orphaned object**. Bytes in a private bucket that no row names, that nothing serves (the serving route's allowlist IS `student_app_files`, and that row is gone), and that no client can list. Costs storage and nothing else. |

So the RPC deletes the rows and RETURNS the paths it just orphaned -- the paths
only exist while the rows do, so publishing them to the caller is the last thing
the transaction does -- and the caller removes the objects with the service role.

**A failed sweep is therefore not a failed delete, and nothing on any surface
says it is.** `ok` is true the moment the RPC returns: the rows are the app. A
partial sweep adds `storageProblem`, a sentence shown beside the confirmation,
and a `console.error` naming every surviving object, which is the ONLY remaining
record of them.

### The RPCs

Both SECURITY DEFINER, `set search_path = ''`, revoked from `public`, granted to
`authenticated`, taking no identity parameter, and answering not-found and
not-yours identically -- 0130's conventions throughout.

- `foundry_delete_app(uuid)` -- owner or admin. Takes the published version with
  it, because the thing being removed is the app. Clears `published_version_id`
  before the delete so the composite foreign key's ordering is explicit rather
  than resting on how Postgres sequences a cascade against a self-referencing
  pair. Reports the app's `cover_path` for removal ONLY when no surviving app
  names the same object: `cover_path` is free text a student can set through
  `foundry_update_app_metadata`, so two of their apps CAN name one file, and
  removing bytes a live app still renders would break that app to tidy this one.
- `foundry_delete_version(uuid)` -- owner or admin, and never the version the
  app publishes. It locks the APP row, not the version: "is this the published
  one" is a fact about `student_apps.published_version_id`, and
  `foundry_set_published_version` takes that same lock before moving it. It
  checks `row_count` after the delete, because the version row is read before
  the app lock and a concurrent double-delete would otherwise return a plan for
  a row this transaction did not remove.

**A hidden app is not the owner's to delete.** 0130 already refuses an owner's
EDIT of a hidden app; a hidden app is one staff have shelved and not finished
with, and a student deleting it removes what is under discussion. An admin can
delete it, and the refusal names who to ask.

**A submitted version MAY be deleted.** 0130 already lets the owner withdraw a
submission to a draft with one press, so refusing would be a rule with a
two-click bypass, and a reviewer's queue row vanishing is a state withdraw
already produces.

### The route, and why there is one at all

`POST /api/foundry/delete` is the only Foundry write that is not a direct RPC
from the browser, and the reason is Storage rather than authorization.
`foundry-bundles` carries no storage policy of any kind, so no browser client
signed in as anybody can remove a single bundle byte; `foundry-uploads` and
`foundry-covers` do have delete policies, but they are pinned to `auth.uid()`,
which an admin deleting a student's app does not satisfy. One server-side sweep
is the only shape that works for both callers.

**It is not the authorization boundary.** It calls the RPC on
`locals.supabase` -- the caller's own client -- so `auth.uid()` and `is_admin()`
inside the definer are the real thing. The service key does one job afterwards:
removing the paths the database itself just returned.

`$lib/server/foundry-bundle.ts` gains `sweepFoundryObjects` and stays the ONE
Foundry reader of `SUPABASE_SERVICE_ROLE_KEY`.

### The sweep re-lists rather than parsing `remove()`'s answer

`remove()` returns a `FileObject[]`, which this code would have to match back
against the keys it sent. A mismatch in that spelling would silently produce
either a permanent false alarm or -- far worse, and unrecoverable, since the
rows that named the objects are already gone -- a claimed clean sweep. So
`removeAndVerify` removes, then LISTS the containers again and reports whatever
is still there. It costs one extra round trip per bucket group and makes "the
objects are gone" measured rather than parsed. It also lists the bundle PREFIX
rather than working from the rows, which is strictly more complete: an ingest
that failed between uploading an object and writing its row leaves an object no
row ever named.

### The review surface now asks for hidden apps, and it had to

`/foundry/review`'s load did not pass `p_include_hidden`, on the reasoning that
a hidden app is off the site and is not something to review back onto it. True
about the QUEUE and wrong about the SURFACE: hiding is reversible by design, but
with the flag off a hidden app appears on no surface anywhere -- not the
gallery, not its owner's list, not the queue. **The moment the console gained a
Hide control it would have gained a one-way door**, with a Restore nothing could
ever be selected to press. So the flag is passed, `queueOrder` is unchanged
(still filtered on `submitted_version_id`), the shelved apps render in their own
list below the queue, and a queue row for an app that is ALSO hidden carries a
shelved chip -- hiding does not move a version's status, so a hidden app can
still have a submission waiting, and deciding about one without knowing it is
shelved was the trap. The widening is not the route's to grant either way:
`_foundry_app_in_population` gates both flags on `is_admin()` inside itself.

### Two things the browser pass found

1. **The app-delete acknowledgement was destroyed by the act it reported.** It
   rendered inside `{#if app}` -- the detail pane -- and deleting the app
   unmounts that pane. Measured: the card vanished from the list and nothing
   anywhere said a word. There are two notes now, because the two deletes end in
   different places: a VERSION delete leaves the app open and its note belongs
   in the detail; an APP delete leaves the LIST, which is what `narrow="swap"`
   shows at every width when no detail is open.
2. **The "hide vs delete" definitions never sat side by side.** The rule was
   written as two columns above 34rem. Measured, the panel's own container is
   **418px at a 1440px viewport and about 541px at 1920** -- both under the
   544px asked for, so the rule was dead code no unused-selector warning would
   catch. This is the same mistake `.fdy-q-work` already documents making at
   58rem against the viewport figure. Lowering it was the rejected fix: at 418px
   two columns are ~200px each, four or five words a line for a forty-word
   definition, worse to compare than reading them in sequence. The rule is gone
   rather than tuned.

### Verified

**The boundaries, against a real Postgres with the real migration chain**
(`tests/foundry-delete.test.ts`, 15 assertions). Every refusal's ACTUAL message,
and every one paired with a positive control:

| case | what Postgres produced |
| --- | --- |
| owner deletes another owner's app | `That app does not exist.` |
| `@boscotech.edu` teacher, no admin grant, deletes a student's app | `That app does not exist.` |
| unknown app id | `That app does not exist.` (identical, so an id cannot be probed) |
| owner deletes their PUBLISHED version | `That is the build your app publishes. Make another approved version live first, or delete the whole app.` |
| ADMIN deletes that same published version | same sentence: the rule is about what it would leave behind, not who asks |
| another student deletes a version not theirs | `That version does not exist.` |
| owner deletes a HIDDEN app | `That app has been hidden by staff, so it is not yours to delete. Ask an instructor.` |
| signed-out (`anon`) | `permission denied for function foundry_delete_app` -- the GRANT refuses before the body runs |
| **admin deletes that hidden app** | no refusal |
| **owner deletes their own app INCLUDING its published version** | no refusal |

**What remains is LISTED, not counted.** After deleting one student's app beside
a neighbour's, the assertion is the neighbour's exact remaining rows by id:
one app row (`del-remains-theirs`, still publishing `t1`), one version row
(`t1`, `zip_path` intact) and two file rows (`assets/app.js`, `index.html`), and
nothing else in any of the three tables. After deleting one version of three,
the remaining two are named by id, ordinal and `zip_path`, their four file rows
by path, and the app still publishes what it published.

**Mutation proof.** Both ownership gates, the published-version gate and the
hidden gate were opened in the PERMISSIVE direction (`if false`) in one pass:
**5 of 15 assertions reddened**, exactly the denial ones. The published-version
case is instructive -- with the RPC's own refusal opened, the COMPOSITE FOREIGN
KEY refuses instead (`update or delete on table "student_app_versions" violates
foreign key constraint`), which is the defence in depth working. Restored
md5-identical (`148c544723b9daa679b01ed10c809401`) and re-verified green.

**The route handler, driven as the route** (`tests/foundry-delete-route.test.ts`,
8 assertions): a signed-out caller is refused before any RPC is reached (0
calls); the RPC is called on the CALLER's client exactly once with exactly its
own argument; the RPC's sentence passes through verbatim; a body naming both or
neither id, and a non-uuid id, are refused with 0 RPC calls, each paired with a
positive control that the well-formed body does reach its RPC; and with no
service key configured -- the WORST partial sweep, nothing removed at all -- the
route still answers `ok: true` with the row counts and a `storageProblem`.

**Both flows driven in a real Chromium** (Playwright against the dev server, on
the two dev harnesses, which mount the REAL components):

- Student surface: 5 versions rendered, **4 per-version Delete controls and 1
  live-build explanation line** -- the live build has no control and says why.
  Arm, read the confirm ("Delete v5 and its files? There is no undo." /
  "Yes, delete v5"), cancel, re-arm, confirm: versions 5 to 4, note "Version 5
  is deleted." Then the app: confirm reads `Yes, delete "Ember Clock"`, cards 3
  to 2, detail pane unmounted, list note `"Ember Clock" is deleted.` The
  partial-sweep sentence renders on the fixture wired to produce one.
- Cost line, real counts: *"This removes the app, all 5 versions, and every file
  stored for them. The build that is live on the gallery goes with it. A build
  waiting for review goes with it. There is no undo."*
- Review surface: hide (with reason) -> note, shelved list 0 to 1 row, queue row
  gains a Hidden chip; restore -> shelved list back to 0; delete -> work area
  unmounted, queue 1 to 0 row. Zero page errors.

**Viewport, measured at 1440 and 375 on both surfaces.** No horizontal overflow
on either at either width (`scrollWidth === clientWidth`, 1440/1440 and
375/375). Every control this lane added: 0 under 44px (44 to 54px), and 0
failing its own `elementFromPoint` hit test.

`svelte-check` **0 errors, 37 warnings** (31 `state_referenced_locally`, 5
`css_unused_selector`, 1 `perf_avoid_nested_class`) -- the documented baseline,
re-derived after `svelte-kit sync`, unchanged by this bundle.

Full suite: **2503 passed, 2 failed**, both `tests/spec-instructions-budget.test.ts`
and both **pre-existing** -- confirmed by stashing this branch's whole tree and
re-running that file alone, where they still fail. They come from a classroom
export commit and are not this lane's.

### NOT verified

- **Nothing has run against any Supabase project, hosted or local.** No Docker
  daemon in this session, and the local `.env` names a placeholder project. So:
  **the object sweep has never executed against real Storage.**
  `sweepFoundryObjects`'s listing, batched removal and re-list have only run in
  their not-configured branch. That the objects are gone is, on this lane, a
  claim about code that has not touched a bucket.
- **The migration has not been applied to production.** It is verified against
  the embedded Postgres with the real files applied in order, which is the
  fixture the suite uses, and against seeded PRE-migration data in the sense
  that the whole 0130/0131 chain is applied first and the apps, versions and
  file rows are created through the REAL RPCs before 0136's functions touch
  them. It has not been pasted into the SQL editor.
- **The real `/foundry/mine` and `/foundry/review` routes were not driven in a
  browser**, because both need a session against a real project. What was driven
  is the two dev harnesses, which mount the identical components with in-memory
  transports. **The route transports themselves -- `fetch` to
  `/api/foundry/delete` and back -- were exercised only through the handler
  test, never from a browser.**
- **The cover-sharing rule is verified in SQL and nowhere else.** That deleting
  app A leaves app B's shared cover object in place is asserted on the RPC's
  returned plan; that the sweep then really does not remove it is not observable
  without a Storage service.
- No production data, no real student app, no real bundle was deleted by
  anything in this session.

