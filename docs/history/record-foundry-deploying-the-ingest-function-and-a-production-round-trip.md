---
title: "Foundry, deploying the ingest function and a production round trip"
date: 2026-08-23
branches: []
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 121
---

## Foundry, deploying the ingest function and a production round trip

`foundry-ingest` is DEPLOYED to `ifxbufvugkzfxhwcwqhf` (idea-app), version 1,
ACTIVE, `verify_jwt: true`. It was the FIRST function on the project -- the
functions list was empty beforehand, so nothing was replaced, and `--prune` was
deliberately not used (it deletes remote functions absent locally). No migration
ships with this; 0131 was already applied.

### 0131 was verified on production BEFORE deploying, not assumed

Read-only, through `supabase db query --linked`:
`_classroom_deck_path_ok`, `_foundry_norm` and `_foundry_slug_ok` all report
`has_function_privilege('service_role', ..., 'EXECUTE') = true`, and
`storage.objects` carries eight foundry policies including `foundry uploads read
own folder` (SELECT). `foundry-bundles` still carries NONE, which is the
mechanism.

### The deploy resolved the imports that live outside supabase/functions

This was the open question from the previous bundle, and the answer is that the
CLI handles it: the upload log names `src/lib/foundry/preflight.ts`,
`src/lib/bundle-path.ts`, `src/lib/foundry/html-dom.ts` and
`src/lib/foundry/zip.ts` alongside the two files in the function's own
directory. The shared-module layout survives a real deploy.

`--use-api` was used because there is no Docker on the Windows side; the WSL
CLI has Docker but no access token, and the Windows CLI has the token.

**One warning, benign and checked rather than ignored:** `WARN: Skipping import
path outside source root: /_platform/fonts.css`. That is the CLI's import
scanner reading the STRING CONSTANT `PLATFORM_FONTS_PATH` as if it were an
import specifier. It is a literal in a message, not an import, and nothing is
missing from the bundle.

### The round trip, on production

A throwaway owner, app and version were created for it and removed afterwards.
**Creating a production auth account was necessary and is worth naming**: the
function derives identity from the caller's JWT, so an invocation cannot be made
without a real signed-in user, and no existing account could be used without
credentials.

What was found, rather than that it matched:

- The account was created with `role=student` (the `@boscotech.net` domain rule
  in `role_for_email`) and `pathway=null`, and a `profiles` row appeared for it
  without any explicit insert -- the 0001 trigger.
- `foundry_create_app` and `foundry_create_version` both landed through the real
  RPCs; the version came back `ordinal=1 status=draft`.
- A 252-byte single-file zip uploaded to the owner's own `foundry-uploads`
  prefix.
- The invocation answered **HTTP 200** with
  `{"ok":true,"entry":"index.html","fileCount":1,"totalBytes":190,"strippedWrapper":null,"warnings":[],"notes":[],"status":"draft"}`
  -- so the version stayed DRAFT, which is the whole point: preflight passing is
  not submission.
- One `student_app_files` row: `index.html`, `text/html; charset=utf-8`, 190
  bytes. The content type is the one that matters -- a wrong one stops a browser
  executing the file.
- One object at
  `foundry-bundles/<app_id>/<version_id>/index.html`, which is the
  prune-friendly layout 0130 specifies.
- **The stored bytes were downloaded and compared to the source: identical.**
  That is the assertion the previous bundle's zip-reader bug would have failed,
  and it is the reason it is made here rather than inferred from a byte count.
- The manifest carried `zipBytes: 252`, `totalBytes: 190`, `fileCount: 1`,
  `droppedOsNoise: 0`, `strippedWrapper: null`, and empty `failures`,
  `warnings` and `notes`.

### Cleanup, and how it was proven

Objects were removed BEFORE the rows, because deleting the rows first would lose
the paths and the bucket has no cascade behind it. Then the file rows, the app
(which cascades to its version), and the auth user.

Proven twice, through two different interfaces, because one interface agreeing
with itself is not evidence:

- Through the Storage API: 0 objects under both the app-id and the user-id
  prefix, in all three foundry buckets.
- Independently through SQL on the live database: **0 rows in `storage.objects`
  for any `foundry-%` bucket at all**, 0 rows in each of `student_apps`,
  `student_app_versions` and `student_app_files`, 0 matching `auth.users`, and
  no surviving `profiles` row.

A census before and after agrees: every one of those counts was 0 before the
run and 0 after it. Production held no Foundry data before this and holds none
now.

### NOT verified

- **No student has used this.** The round trip is one synthetic single-file app.
  Nothing exercised a wrapper strip, a refusal, the cap or the idempotent re-run
  ON PRODUCTION -- those were proven on the local stack, against the real
  Storage service, but against a different copy of the policies.
- **No UI calls this yet.** There is still no Foundry route or component.
- **The browser preflight has still never run in a browser.**

---

