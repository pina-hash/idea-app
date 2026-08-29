---
title: "IDEA Foundry, data layer (`0130`, migration ONLY)"
date: 2026-08-23
branches: []
migrations: ["0130"]
subsystems: ["IDEA Foundry"]
record_order: 118
---

**2026-08-23.** A new subsystem: students publish the static web apps they have
built. This bundle is the DATA LAYER and nothing else -- three tables, their
policies, three Storage buckets, eleven RPCs and a security suite. There is no
route, no component and no UI, and the extraction Edge Function that unpacks an
uploaded zip is a separate deployment that does not exist yet.

### The shape

`student_apps` (owner, slug, title, tagline, description, cover, build notes,
published version, metadata flag, hidden stamp) -> `student_app_versions` (one
upload attempt with a review state) -> `student_app_files` (one row per
extracted file).

`student_app_files` is the bundle proxy's lookup index rather than a jsonb
manifest, which is 0101's deck argument applied again: a serving route resolves
one (version, relative path) pair per request and a page pulls dozens of files,
so it wants an indexed lookup and not a document fetched and scanned per file.
It is also what keeps the serving route from ever LISTING storage.

`build_notes` is REQUIRED and non-empty. It is the column the surface exists to
collect -- a published app with no account of how it was made is a screenshot.

### The three rules that are schema rather than function

1. **At most one submitted version per app** is a PARTIAL UNIQUE INDEX
   (`student_app_versions_one_submitted_idx`), not a count-then-insert. The
   second submit fails in the database, whoever is calling.
2. **`published_version_id` belongs to its own app** is a COMPOSITE FOREIGN KEY
   `(published_version_id, id) -> (id, app_id)`, the
   make-the-invalid-state-unrepresentable convention 0069 and 0088 already use.
   MATCH SIMPLE is what makes the nullable column work: with nothing published
   the pair carries a null and the constraint is not checked at all.
3. **It points at an APPROVED version** is a trigger, in BOTH directions -- one
   refuses publishing something not approved, the other refuses moving a
   published version out of approved. Closing only the first leaves "approve,
   publish, then un-approve" wide open.

The RPCs check the same things. That redundancy is deliberate, and it was
verified by opening each layer SEPARATELY rather than assuming: with
`foundry_published_version_check` disabled the composite key still refuses a
foreign version with `23503`, and with the trigger back the same write refuses
with the trigger's own message.

### Liveness is one predicate

0116 stamped `deleted_at` and then had to chase every list in the notebook for a
filter. Here `_foundry_app_in_population(owner, hidden_at, published_version_id,
include_hidden, include_unpublished)` is the single expression of "which apps
does this caller mean", and the RLS policy, `foundry_list_apps` and
`foundry_get_app` all call it. There is no inline `hidden_at is null` in the
file outside that function and the partial indexes.

**Both widening flags are gated on `is_admin()` INSIDE the predicate**, which is
what makes "admins additionally see submitted and hidden" a parameter rather
than a second function: a student passing `true, true` reads exactly what a
student passing nothing reads, measured, so there is no second projection to
keep in step.

**A hidden app is invisible to its OWNER too.** Hiding is a staff act; an owner
who could still list around it would not have been hidden.

**A version is narrower than its app.** The review trail -- what was rejected,
why, how many attempts -- is between the student and the staff who reviewed it,
so a non-owner reading a published app gets the build and not the paperwork
(`zip_path`, `reviewed_by`, `review_note`, `reject_reason` all null). Asserted
with the owner's read of the same row as the positive control.

**No email leaves either read RPC.** The owner is a uuid plus the display and
full name already on their profile, asserted by sweeping the serialized payload
for `@` with a positive control first that the payload really is that app's.

### `_classroom_deck_path_ok` is REUSED, not cloned

Its name lies exactly the way `_classroom_doc_ok`'s does: it is a pure text
predicate naming no table, no column and no policy -- relative,
forward-slashed, contained, no traversal, no scheme, no drive letter. That is
precisely the rule a bundle path needs, for precisely the same reason (a proxy
resolves the stored string against a browser's request). A `_foundry_` copy is
the thing that would quietly stop matching, and it would have been frozen at
0101 while the original moved. The cost is that the test chain carries the
classroom canonical-items migrations under it; that is the right trade.

### Storage

`foundry-uploads` private, write-only under the owner's own prefix (a raw zip is
an input, not an artifact anybody reads back). `foundry-covers` public read,
owner writes own prefix. `foundry-bundles` private with **NO POLICY OF ANY
KIND**, which is the mechanism rather than an omission: `storage.objects` has
RLS on, so a bucket no policy names denies every `authenticated` and `anon`
request by default and only `service_role` can touch it. Any policy added there
later, for any reason, is what opens it.

The bundle path is `<app_id>/<version_id>/<path>`. Pruning is not built here,
but that layout means a whole version is one prefix delete and a whole app is
one prefix above it, so neither ever needs a file-by-file walk.

### Judgement calls worth recording

- **The slug is refused BY NAME** in `foundry_update_app_metadata`, not omitted
  from the whitelist. `/foundry/<slug>` is a printed, QR-coded address and the
  permanent-contract rule applies; the caller gets a sentence saying so rather
  than the generic unknown-field message.
- **`foundry_set_published_version` takes no null.** Taking an app off the site
  is `foundry_set_app_hidden`, which is an admin act with a record of who did
  it; allowing null would give an owner a quiet second way to do the same thing
  with nothing recorded.
- **A rejected version cannot be resubmitted.** The reviewer's answer stands on
  the row they answered; a fix is a new upload with its own ordinal.
- **Approving a build does not clear `metadata_flagged_at`.** Approving a BUILD
  is not reviewing the copy around it.
- **The flag is stamped only on a REAL change to an already published app**, and
  is not re-taken while already set -- the first unreviewed edit is when the
  drift started. A no-op save returns `changed: false` and stamps nothing.
- **Every emptiness gate goes through `_foundry_norm`**, one private
  `regexp_replace` stripping all leading and trailing whitespace, because
  `btrim` strips spaces only and would admit a value of newlines and tabs --
  the exact thing a required `build_notes` exists to refuse. Verified:
  whitespace-only build notes and a whitespace-only reject note are both
  refused.
- **`hidden_by` and `hidden_reason` are additions to the requested column list**,
  taken from 0116's `deleted_at`/`deleted_by` pair. A soft delete with no record
  of who did it or why is a stamp nobody can act on.

### Measured refusals

Every one is the message Postgres actually produced, against the real migration
files on a real embedded Postgres.

| check | code | message |
|---|---|---|
| non-owner submits another's version | `P0001` | `That version does not exist.` |
| author reviews their own | `P0001` | `Only an administrator can review a Foundry submission.` |
| domain `teacher`, no admin grant, reviews | `P0001` | `Only an administrator can review a Foundry submission.` |
| second version set to `submitted` | `23505` | `duplicate key value violates unique constraint "student_app_versions_one_submitted_idx"` |
| publish a draft (RPC) | `P0001` | `Only an approved version can be published (that one is draft).` |
| publish a draft (direct, past RLS and the RPC) | `P0001` | same, from the trigger |
| publish another app's approved version (RPC) | `P0001` | `That version does not belong to this app.` |
| the same, direct | `P0001` | `A published version must belong to the app publishing it.` |
| the same, trigger disabled | `23503` | `violates foreign key constraint "student_apps_published_version_fkey"` |
| client writes `foundry-bundles` (student) | `42501` | `new row violates row-level security policy for table "objects"` |
| client writes `foundry-bundles` (admin) | `42501` | same -- `is_admin()` opens nothing there |
| client writes another's prefix in `foundry-uploads` | `42501` | same |
| sixth app | `P0001` | `You already have 5 apps in Foundry, which is the limit...` |
| whitespace-only `build_notes` | `P0001` | `Say how you built it and which tools you used...` |

Positive controls beside each: the owner's identical submit lands
(`status: submitted`), the admin's identical review lands
(`status: approved, published: true`), the RPC withdraws the other submission in
the same transaction and leaves exactly one row submitted, its own approved
version publishes, `service_role` writes and reads `foundry-bundles`, an
own-prefix write to `foundry-uploads` succeeds, and hiding an app frees a cap
slot.

### Also verified

- **The file re-applies.** The whole of `0130_foundry.sql` was pasted over the
  already-applied schema in the same session and succeeded with no error.
- **The circular reference does not block a hard delete.** Deleting an app that
  publishes a version succeeds and cascades its versions away (0 rows left) --
  the app row is gone by the time the deferred key check runs.
- **`pg_proc` holds exactly one row for each of the thirteen `foundry_*`
  functions** (eleven RPCs plus the two read predicates), the signature-trap
  assertion, with the full name list pinned so an accidental overload reddens.
- **Only `SELECT` is granted to `anon`/`authenticated`** on all three tables, and
  nothing at all to `anon` -- swept from `information_schema.role_table_grants`
  with a non-empty-result control first.

### Verified

- `svelte-check`: **0 errors, 37 warnings**, re-derived after `npx svelte-kit
  sync`. Breakdown unchanged: 31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`, over 20 files.
- Full suite: **89 files, 2151 tests, all passing**, including the new
  `tests/foundry-policies.test.ts` (16 tests).

### NOT verified

- **Nothing was applied to the live Supabase project.** The local `.env` is a
  placeholder; every claim above is against the embedded Postgres with the real
  migration files applied unmodified. `0130_foundry.sql` still has to be pasted
  into the SQL editor by hand.
- **No storage round trip.** The bucket policies were exercised against the
  `storage.objects` STUB, which the test grants to `authenticated` and
  `service_role` to match a real project (the stub ships no grants, so without
  that the denials would have been "permission denied for table objects" and
  would have proved nothing about the policy). No object was ever uploaded to
  real Supabase Storage.
- **No UI, no route, no browser pass.** There is nothing to render yet.
- **The extraction Edge Function does not exist.** `student_app_files` has a
  schema, a policy and a `service_role` grant and no writer.
- **Concurrency was reasoned about, not raced.** The five-app cap's lock on the
  owner's profile row and the ordinal's lock on the app row were not exercised
  with two simultaneous connections.
- **No `classroom-updates.json` entry.** Nothing here changes what a class sees.
- **`npm run build` was not run** (the pre-existing Windows EPERM in the Vercel
  adapter's `closeBundle`).

### Follow-up: reconciling 0130 against the live project, and why `db push` was refused

**2026-08-23, same day.** `0130_foundry.sql` was applied by hand in the SQL
editor. This pass was asked to reconcile the CLI's migration history with it.
**Nothing was pushed, and the history was left as it was.** What follows is why,
and what the live schema actually holds.

**The divergence is not about 0130.** The project was not linked at all
(`supabase migration list --linked` answered `LegacyProjectNotLinkedError`).
After linking to `ifxbufvugkzfxhwcwqhf` (`idea-app`, us-east-1, Postgres
17.6.1.127), the list came back with an **empty `remote` column for every one of
the 130 local files**, not just for 0130. The reason is one level down again:

```
ERROR: 42P01: relation "supabase_migrations.schema_migrations" does not exist
```

There is no history table on the remote, because the CLI has never been used
against this project -- which is exactly what `CLAUDE.md` has always said
("Applied MANUALLY in the Supabase SQL editor. There is no migration runner").

**So `supabase db push` would not have recorded one row.** `--dry-run` printed a
plan of **all 130 migrations**, `0001_profiles.sql` through `0130_foundry.sql`,
to be applied to the live database that already has every one of them applied.
That would replay the one-time imports and backfills (`0084_coin_legacy_import`,
`0100_coin_legacy_reimport`) over real student data. `migration repair` -- the
tool actually built for "schema present, history absent" -- was explicitly off
the table, and writing the same rows by hand is that tool under another name,
so it was not done either. **The push was refused and reported instead.** This
is now a rule in `CLAUDE.md` rather than only a note here.

**0130 itself would survive a second application**, which was the question
asked. Read top to bottom: every `create table` and `create index` is `if not
exists`, both `add constraint`s sit inside `do $$` blocks guarded on
`pg_constraint`, every function is `create or replace`, every one of the 10
`create policy` statements is preceded by its own `drop policy if exists` (13
drops, 10 creates), and every `insert`/`update` touching the three tables is
inside a function body that only runs when a caller invokes the RPC. It was also
re-pasted over the applied schema in the previous session with no error.

Two statements are worth quoting rather than waving past, since the standard was
"no DROP touches anything the migration does not itself create, and nothing
rewrites a row":

```sql
drop policy if exists "foundry bundles read" on storage.objects;
drop policy if exists "foundry bundles write" on storage.objects;
drop policy if exists "foundry bundles own folder" on storage.objects;
```

These three drop policies **0130 does not create** -- they were written to clear
anything an earlier draft might have left on the bundles bucket. Checked against
the live project: no policy by any of those names exists (there are 7 foundry
policies on `storage.objects`, 4 covers and 3 uploads, and **none** naming
`foundry-bundles`), so today they are no-ops. The hazard is narrow and fails
CLOSED: if a later migration ever creates a policy by one of those exact names, a
re-paste of 0130 deletes it silently, which removes client access to a bucket
that is meant to have none.

```sql
insert into storage.buckets (id, name, public)
values ('foundry-uploads', 'foundry-uploads', false)
on conflict (id) do update set public = false;
```

This (and the two beside it) **does rewrite a row** on a second application. It
rewrites a row the file itself creates, to a literal equal to what the file
declares, so it converges rather than drifting; the live values already read
`false / true / false` as intended.

**There is no data to lose, measured rather than assumed:** `student_apps` 0
rows, `student_app_versions` 0, `student_app_files` 0, and 0 objects under any
`foundry-*` bucket.

### What the live schema actually holds

Read directly with `supabase db query --linked`, not from a CLI summary.

- **Three tables**, all with `relrowsecurity = true`: `student_apps`,
  `student_app_versions`, `student_app_files`.
- **18 functions, every one with exactly one `pg_proc` row** -- 13 `foundry_*`
  (the 11 RPCs plus `foundry_can_read_app` / `foundry_can_read_version`) and 5
  `_foundry_*` (`_norm`, `_slug_ok`, `_app_in_population`, and the two trigger
  functions). No overload anywhere, and every identity signature matches the
  file. This is the signature trap, checked on the real project.
- **The partial unique index**, verbatim from `pg_get_indexdef`:
  `CREATE UNIQUE INDEX student_app_versions_one_submitted_idx ON
  public.student_app_versions USING btree (app_id) WHERE (status =
  'submitted'::text)`. The five other indexes on that table are present too.
- **The composite foreign key**, verbatim from `pg_get_constraintdef`:
  `FOREIGN KEY (published_version_id, id) REFERENCES student_app_versions(id,
  app_id)` -- the pair, not a single column.
- **Both triggers**, both `tgenabled = 'O'` (enabled):
  `foundry_published_version_check BEFORE INSERT OR UPDATE OF
  published_version_id ON public.student_apps`, and
  `foundry_version_status_check BEFORE UPDATE OF status ON
  public.student_app_versions`.
- **Three buckets**: `foundry-bundles` public=false, `foundry-covers`
  public=true, `foundry-uploads` public=false.
- **`foundry-bundles` carries no policy**, which is the design and is now
  confirmed on production rather than only in the file.
- **Table policies and grants**: one SELECT policy per table, all
  `{authenticated}`; SELECT is the only privilege held by `authenticated` and
  `anon` holds nothing at all.

### NOT verified

- **No write was made to the live project by this session.** Every remote
  statement was a read; nothing was pushed, repaired, inserted or altered.
- **The RPCs were not called on production.** Behaviour is still only proven on
  the embedded-Postgres fixture; what was checked here is that the schema
  objects exist and are shaped correctly.
- **Storage was not exercised on production.** The bucket rows and the absence
  of a bundles policy were read from the catalog; no object was uploaded.
- **The CLI history is still empty and remains so.** Any future `supabase db
  push`, `db pull` or `db diff` against this project will still see 130
  unapplied migrations. That is a standing decision, not an oversight.

---

