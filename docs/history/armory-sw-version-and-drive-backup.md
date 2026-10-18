---
title: "Ledger 0404: IDEA Armory -- one SolidWorks version per project, chosen at creation and moved up on purpose, and the nightly Google Shared Drive mirror (`claude/armory-sw-version-and-drive-backup`)"
date: 2026-10-18
branches: [claude/armory-sw-version-and-drive-backup]
migrations: ["0285"]
subsystems: [Armory, Migrations, Workflows, Backup, Connector]
---

Ledger 0404 (solo, through the session queue) answers two of Mr. Pina's decision 41
answers of 2026-10-18: "an ordinary 2026 project as an option", which he could not find a
way to make, and "finish the Google Shared Drive backup", which `docs/ARMORY.md` had
promised since the scope and nobody built.

## The audit, from the tree, before anything was built

1. **Did anything raise a project's SolidWorks version?** No. `pinned_release` defaults to
   2025 (0231) and `armory_raise_pinned_release` was mentor-only and raise-only (0231,
   never redefined). The only mention of it in `src/` was the activity words for the
   `pinned_release_raised` change kind in `src/lib/armory/view.ts`; no route, component
   or transport called it. **A site admin who creates a project IS made its mentor**:
   0232's `armory_create_project` inserts the caller into `armory_members` as `mentor`.
   So Mr. Pina could have raised his own projects by calling the RPC by hand, but no
   surface offered it, and a site admin who was not a member could not at all
   (`armory_require_role` with `mentor` only).
2. **How is a project created?** `src/routes/armory/+page.svelte` builds the `create`
   transport (site admins only) and `ArmoryProjects.svelte` renders the form; it calls the
   three-argument `armory_create_project(p_name, p_season, p_operation)` with a null season.
   It took no release.
3. **Does the Windows app read `pinned_release`?** NOT ANSWERED: this session's GitHub
   access was limited to `pina-hash/idea-app`, and `pina-hash/idea-armory`'s
   `docs/agent/CONTRACT.md` could not be read (the API answered "repository not
   configured for this session"). What the tree does say: `armory_my_projects` projects
   `pinned_release` (0231 onwards), and the SERVER enforces the pin regardless of the app,
   because `armory_check_release` (0231), called by `armory_commit_version_with_release`
   and `armory_save_side_version_with_release`, refuses a save whose release is newer than
   the pin. So raising a project to 2026 is what lets a 2026-saved file land, whatever the
   app does with the number.
4. **The mirror's credentials and where it can run.** The Google OAuth client
   (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`) and a refresh token
   (`GOOGLE_DRIVE_REFRESH_TOKEN`, scope `drive`, a Bosco Tech account) live in Vercel and
   are read only by `src/lib/server/notebook-drive.ts`; `.github/workflows/backup.yml`
   already uses the SAME values under its own names (`BACKUP_GOOGLE_*`), which is the
   precedent. R2 is four Vercel variables read only by `src/lib/server/armory/storage.ts`,
   which signs URLs and never moves bytes. A night's copy can be gigabytes: a Vercel Hobby
   function stops at its duration limit and both cron slots are the coin economy's
   (`vercel.json`: autopay and the Friday digest), so the job is a scheduled GitHub
   workflow running a Node script (six hours, a disk to stage one file at a time), the
   choice `cert-jobs.yml` and `backup.yml` already made. Nothing measured better.

## A. One project, one SolidWorks version

**0285** (`supabase/migrations/0285_armory_release_choice.sql`):

- `_armory_release_ceiling()`: the Los Angeles year plus one (SolidWorks names a release
  for the year after it ships). The first object in the file, and new, so the deploy probe
  sees it. Private: no client role may execute it.
- `armory_create_project(text, smallint, smallint, uuid)`: the WIDE form, no defaults.
  The deployed three-argument form keeps its signature and becomes a thin wrapper calling
  it with a null release (the column default, never a second copy of 2025). The
  CLAUDE.md signature-trap exception, because the Windows app and the website before this
  bundle call the narrow form. Its refusals keep their text, SQLSTATE and order: the
  release check comes after all of them and cannot fire for a null.
- `armory_raise_pinned_release`: a site admin acts as a mentor (the 0233
  `armory_add_member` shape; P0002 `project not found` for one that is not there). The
  ONE NARROWING: a release above the ceiling is refused, after the role and the increase
  checks. Nothing stored is affected.
- Revoked from anon by name (0166's shape), and a self-check over this file's own
  objects: two create forms, neither with a default, one raise, every one security definer
  with a pinned search path, anon none, the ceiling no client role.

**The website.** `src/lib/armory/solidworks-version.ts` is the vocabulary (the offered
releases, `newestRelease` mirroring the ceiling, `raiseChoices`, the words, the refusal
words). The Project tab (`ArmoryProjectSettings.svelte`) leads with a SolidWorks version
panel: the version, big; what it means; for a mentor or a site admin a key per release
above it when there is more than one, and one "Move up to SolidWorks N" key that arms on
the first press and puts the cost under itself ("Once anyone saves a file in SolidWorks
2026, that file will not open in SolidWorks 2025 ...") and moves on the second, with a
"Keep 2025" key while armed; for anyone else, who can move it; for everyone, why there is
no way down. The project header and every project card carry a "SolidWorks N" readout, so
a student sees the version without a Project tab. Create offers two keys, 2025 (lit, the
default) and 2026, with what the lit one means under them; **the create transport names
`p_release` only for a release that is not the default**, so a 2025 project goes through
the three-argument form on every database, and a 2026 project on a database without 0285
reads "Create the project, then move it up from its Project tab" rather than failing
silently. The look is the existing site plate: `ar-panel` plates, raised `btn` keys with
the plate's `aria-pressed` lighting (the same keys as the Files filters), recessed
`ar-readout` chips, nothing new in the palette. The change feed's existing
`pinned_release_raised` words are reused.

## B. The nightly Shared Drive mirror

`tools/armory-drive-mirror-plan.mjs` is every decision, over injected adapters;
`tools/armory-drive-mirror.mjs` is the three adapters (Supabase over HTTPS, R2 by a signed
GET using the website's own `presignUrl` and `contentObjectKey`, Google Drive) and the
command line; `.github/workflows/armory-drive-mirror.yml` runs it at 11:07 UTC (4:07 a.m.
in Los Angeles in summer, 3:07 in winter), one at a time, `schedule` and
`workflow_dispatch` only. `contentObjectKey` moved to `src/lib/server/armory/object-key.ts`
(no imports) so plain Node can load the same rule the website signs with; `storage.ts`
re-exports it and the test asserts it is the same function.

- **What lands**: `<project>/<folder>/<name>` for every live file with a first version,
  every project including archived ones, plus `ARMORY-MANIFEST.csv`,
  `ARMORY-MANIFEST.json` and `README.txt` at the root (project, path, version number,
  author, saved release, SHA-256, date, size, archived, whether the Drive copy is current).
- **Incremental**: a Drive file tagged with the same Armory file id and hash is skipped;
  a changed one is updated in place (Drive keeps the older content in its version
  history); a moved or renamed one is moved; a renamed project's folder is renamed.
- **Never deletes**: a file Armory no longer has moves to `_removed/<the path it had>`;
  one that comes back moves back. Neither adapter has a delete; the source test sweeps the
  tool for `'DELETE'` with the backup tool as the positive control.
- **Never writes to R2 or the database**: the store adapter is GET-only, and the R2 key
  Mr. Pina makes is "Object Read only".
- **Safe twice, safe halfway**: nothing is remembered between runs except what Drive
  holds; an upload appears in Drive only when it completes. A `--budget-minutes` limit
  (330 in the workflow) stops starting new copies and the summary says how many are left.
- **Integrity**: every download is hashed on the way to disk and refused if it does not
  match its name.
- **Read narrowly**: four tables, named columns only (`armory_projects` id, name,
  pinned_release, archived; `armory_files` id, project_id, folder, name,
  current_version_id, deleted_at, live with a first version only; `armory_versions` id,
  file_id, content_sha256, byte_length, author_email, created_at;
  `armory_version_releases` version_id, saved_release, non-side only), paged 1000 at a
  time on the table's key. No members, devices, locks, feed or receipts. It needs the
  service role key because every Armory table has member-only RLS; that is a new reader of
  the key's VALUE under its own name, and CLAUDE.md's census says so.
- **Unset secrets**: a green run whose summary says "not set up" and names each missing
  secret.
- **Dry run**: `--dry-run` reads and plans and writes nothing anywhere. `--fixture
  tools/armory-drive-mirror.fixture.json` runs the whole job over memory (two projects,
  one on 2026; a Drive from an earlier run holding one current, one stale and one moved
  copy and one from a deleted project): measured 2026-10-18, dry run "Copied (would) 1,
  Updated 1, Moved 1, Skipped 1, Moved to _removed 1, Folders made 5, 26 bytes", exit 0;
  the same without `--dry-run`, identical counts, exit 0; with no environment, "not set
  up" naming all ten, exit 0.

**This container cannot reach R2, Supabase production or Google**, so the real adapters
have run only against fakes: the store adapter against a fake `fetch` (every request a
GET, the four tables, the exact column lists, paging past 1000, the R2 path, the
download's hash and cleanup). The Google adapter has NOT been exercised against anything;
its first real run is the schedule's.

## What Mr. Pina does, once (about fifteen minutes)

Every secret goes in at **https://github.com/pina-hash/idea-app/settings/secrets/actions**
-> **New repository secret**, one at a time: type the exact Name, paste the value, press
**Add secret**. Nothing else needs a click: the schedule makes the first run at 4:07 a.m.
and every night after.

1. **Make the Shared Drive.** In Google Drive (drive.google.com), signed in as your
   Bosco Tech account: **Shared drives** -> **New** -> name it `IDEA Armory backup` ->
   **Create**. Open it; the address ends in `/drive/folders/<id>`. Copy the `<id>`.
   - Secret **`ARMORY_MIRROR_DRIVE_FOLDER_ID`** = that id.
   - Share it with nobody else, or with named accounts only, never "anyone with the link":
     it is every team's CAD work and the manifest names who saved each file.
2. **The Google sign-in, three secrets.**
   - **`ARMORY_MIRROR_GOOGLE_CLIENT_ID`** and **`ARMORY_MIRROR_GOOGLE_CLIENT_SECRET`** =
     the same values as `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in
     Vercel (vercel.com -> the idea-app project -> **Settings** -> **Environment
     Variables**), or from Google Cloud Console -> **APIs & Services** -> **Credentials**
     -> the site's OAuth client if Vercel hides them. They are also the values you gave
     `BACKUP_GOOGLE_CLIENT_ID` and `BACKUP_GOOGLE_CLIENT_SECRET`.
   - **`ARMORY_MIRROR_GOOGLE_REFRESH_TOKEN`**: open **https://ideabosco.com/admin/drive-connect**
     signed in to the site, approve with the SAME Bosco Tech account that made the Shared
     Drive, press **Copy to clipboard** on the page that comes back, and paste it here.
     **Do not change anything in Vercel**, whatever that page says: the site keeps its own
     token, and Google leaves earlier tokens working.
3. **The Supabase read, two secrets.** supabase.com -> the idea-app project -> **Project
   Settings** -> **API Keys** (and **Data API** for the URL).
   - **`ARMORY_MIRROR_SUPABASE_URL`** = the Project URL, `https://<ref>.supabase.co`
     (the same as `PUBLIC_SUPABASE_URL` in Vercel).
   - **`ARMORY_MIRROR_SUPABASE_SERVICE_ROLE_KEY`** = the `service_role` secret key (the
     same value as `SUPABASE_SERVICE_ROLE_KEY` in Vercel).
4. **A read-only R2 key, four secrets.** dash.cloudflare.com -> **R2 Object Storage** ->
   **Manage API tokens** (API on the R2 overview) -> **Create API token**: name
   `IDEA Armory mirror (read only)`, permission **Object Read only**, **Apply to specific
   buckets only** -> the Armory bucket -> **Create API token**.
   - **`ARMORY_MIRROR_R2_ACCESS_KEY_ID`** = the **Access Key ID** it shows.
   - **`ARMORY_MIRROR_R2_SECRET_ACCESS_KEY`** = the **Secret Access Key** it shows once.
   - **`ARMORY_MIRROR_R2_ACCOUNT_ID`** = the **Account ID** on the R2 overview page (the
     same as `ARMORY_R2_ACCOUNT_ID` in Vercel).
   - **`ARMORY_MIRROR_R2_BUCKET`** = the bucket's name (the same as `ARMORY_R2_BUCKET` in
     Vercel).

**What a correct first run looks like.** The next morning the Shared Drive holds one folder
per Armory project with its files in their folders, `ARMORY-MANIFEST.csv`,
`ARMORY-MANIFEST.json` and `README.txt`. The run's own job summary, for whoever reads it, says "Armory Shared Drive mirror",
the number of projects and current files, **Copied** equal to the number of files,
**Already current, skipped 0**, **Failed 0**, **Left for the next run 0** (or a count, if
the first night's copy is larger than five and a half hours; the next night finishes it).
The second night reads **Copied 0** and **Already current, skipped** equal to the number of
files. A summary reading "not set up" names exactly which of the ten secrets is still
missing.

## Checks, measured 2026-10-18

- `tests/db/armory-release-choice.test.ts`: 15 of 15, on every migration before 0285
  seeded through the real RPCs, then 0285 on top. A corpus of 14 deployed calls (both
  creates and raises, refusals with codes 22023, 23505 and 42501) answers case for case
  the same before and after; the pair has no defaults; anon executes none; a re-paste
  changes no catalog object.
- **Mutation proof**, against that one file, permissive direction, restored from a copy
  and md5-checked (`7fc86f153272b1f1f7d1c50e7e2c9260` before and after): the raise-only
  rule weakened to "any non-null release" killed (3 failed); the role gate opened to
  everyone acting as a mentor killed (5 failed); the ceiling removed killed (1 failed).
  3 of 3.
- `tests/armory-drive-mirror.test.ts`: 16 of 16 (plan, two runs, dry run, a dropped upload
  then a finishing run, the time limit, removal and return, a renamed project, a hash
  mismatch, the store adapter's requests, the secrets and the workflow, the manifest).
- `tests/armory-solidworks-version.test.ts`: 8 of 8 (what is offered, the words, the
  Project tab rendered with and without the transport: 1 move key and 2 choice keys
  against 0 and 0, the create call naming `p_release` only off the default).
- `npm run verify:browser` on `/dev/armory?state=settings`, its Space White twin and the
  stacked `/dev/armory`, at 375 and 1440: 6 runs, 416 measurements, 0 outside threshold,
  0px horizontal overflow at both widths. The two-press move drove 2025 to 2026 at both
  widths (every click one attempt). Version keys 248.5x44 (settings) and 149.5x44 (Space
  White, Create), 0 under 44px; the panel's words 6.47:1 dark and 6.09:1 Space White, the
  keys 10.46:1, the armed danger key 4.89:1 on Space White; every key answers a hit test at
  its centre.
- `npm run check` with placeholder `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`:
  0 errors, 33 warnings in 18 files, the baseline.

## Outside the Owns list, each forced

- `src/lib/server/connector/registry/armory.yaml`, `overlay.generated.json` and
  `schema.generated.json`: `npm run connector:build` added the four-argument overload
  (`tests/connector-coverage.test.ts` fails on a stale schema), and
  `tests/connector-registry.test.ts` requires every argument of a call entry to have a
  spoken name, so `armory_create_project` gained `p_release` as `solidworks` (2025 or
  2026, left out for 2025). The connector picks the overload by the argument names it
  is handed, so a call without it is the deployed three-argument form. `armory_raise_pinned_release` is called through the project
  page's local `rpc()` wrapper, which the inventory's `.rpc('name')` scan does not see (as
  with `armory_add_member`), so the coverage test asked for no new entry; giving the
  connector a "move a project to SolidWorks 2026" call is a follow-up for the connector's
  owner.
- `tests/workflows.test.ts`: one line in the per-file push map for the new workflow (0).
- `tools/browser-verify/README.md` and `tools/browser-verify/measured/armory*.json`:
  written by `npm run verify:readme` for the two new specs and the edited stacked one.

## The full suite, and the one failure this bundle causes

`npm test` on the rebased tree (with `origin/main` and `origin/integration` fetched in full,
which `tests/apply-migration-guard.test.ts`, `tests/apply-migration-trace.test.ts` and
`tests/identity-style-shared.test.ts` need): 848 files, 15,974 tests, **2 failed**, read
off the summary line.

- `tests/db/migrations-applied-record.test.ts`: `docs/migrations-applied/` holds a record
  for 0270 and none for 0269. Present on `origin/main` before this bundle (ledger 0401
  recorded the same failure); not this bundle's.
- **`tests/db/migration-0177-tombstone.test.ts`, "the migration series is contiguous":
  CAUSED BY THIS BUNDLE'S NUMBER.** The dispatch assigned 0285 and reserved 0270 to 0284
  for the website connector and the coin market, but only 0270 to 0272 exist; 0273 to
  0284 are holes, and the test fails on every hole no `claude/**` branch is holding (in CI
  it holds none). The number was kept because the prompt fixes it and forbids 0270 to
  0284; the apply path does not need contiguity (`migrate.yml` applies the lowest
  unapplied FILE that exists). **This needs a decision from whoever owns the numbering:**
  the coin lane (ledger 0402) holds 0275 and the part-numbers lane (0405) holds 0286, so
  the series stays holed until the reserved numbers are either used or filled with
  tombstones in the 0177 shape (`supabase/migrations/0177_*.sql`).

## Not verified

- The Windows app's handling of `pinned_release` (its repository was not readable here).
- Any real run of the mirror against R2, Supabase or Google, and Drive's handling of the
  resumable uploads and parent moves in a Shared Drive. The first scheduled run is the
  first real one.
- 0285 against production. `migrate.yml` applies the lowest unapplied migration on the
  push; `docs/migrations-applied/` on this tree holds records through 0270 and none for
  0271 or 0272, so if those are not applied, 0285 waits behind them.
