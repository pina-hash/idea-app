---
title: "Digital notebook (data layer)"
date: 2026-08-06
branches: []
migrations: ["0041", "0062", "0068"]
subsystems: ["Digital notebook"]
record_order: 23
---

Migration `0069_notebook.sql` (apply manually after 0068) plus
`src/lib/server/notebook-drive.ts` and the two `/api/notebook/*` routes are
the DATA LAYER for the digital engineering notebook: students photograph
notebook pages and upload them; instructors review, flag, and read a
per-section compliance grid. **Backend and schema only — no UI yet**; the UI
arrives in later sessions and should not need to touch this layer again.

- **Schema:** `notebook_sections` (**DROPPED IN `0094` -- sections and rosters
  are IDEA Classroom's now; see "Digital notebook (wired to IDEA Classroom,
  0094)" below. The rest of this bullet is the historical record of what 0069
  shipped.** course_id was a curriculum `Section.id`
  string, the 0003 `profiles.section_id` convention, NOT a FK; enrollment =
  `profiles.section_id` matches it; `instructor_id` references `auth.users`,
  the first DB representation of instructor assignment in the repo),
  `notebook_sessions` (required check-ins: unit, date, label; **its
  `section_id` is GONE since `0098` -- a check-in is a canonical record plus one
  `notebook_session_postings` row per section, `classroom_sections`-referencing
  since `0094`**),
  `notebook_entries` (one logical entry: session-linked, free via
  `custom_label`, or — since `0071_notebook_optional_label.sql`, apply after
  0070 — fully unlabeled (the 0069 has-a-target CHECK is dropped, and the
  RPCs that duplicated it in application logic, `notebook_create_entry` and
  `notebook_admin_override_entry`, were relaxed to match); a CHECK makes a
  session imply a section, and a composite FK `(session_id, section_id) ->
  notebook_session_postings (session_id, section_id)` (**repointed there by
  `0098`; through 0097 it referenced `notebook_sessions (id, section_id)`**)
  makes a mismatched pair unrepresentable; `upload_timestamp` is server-set and never a parameter),
  `notebook_entry_photos` (Drive file id + `original`/`enhanced` variant +
  `original_filename` since 0071, the browser-submitted name, informational
  only — display and the Drive naming fallback, never access control +
  `sequence_order`; photos are only ever ADDED, never replaced),
  `notebook_session_excusals` (an excusal is the sanctioned ABSENCE of an
  entry — deliberately NOT a fake entry status), and the append-only
  `notebook_admin_log` (bare-uuid subjects, no FKs, so log rows survive the
  deletion of what they describe). Since `0078` there is also
  `notebook_entry_notes` — written notes, one row per revision, reading
  through the SAME `notebook_can_read_entry` the photos do; see "Digital
  notebook (written notes)" below.
- **RLS:** students SELECT their own entries/photos; instructors SELECT
  their sections' (via `notebook_is_section_instructor` -- **`0094` dropped
  that function; the check is `classroom_manages_section()` now, i.e. teacher
  of record**); the chair tier is
  the ADMIN tier (0067) via `is_admin()` and reads everything (never write a
  new `is_teacher()` call — the 0067 naming trap). Photo visibility delegates
  to `notebook_can_read_entry` so it can never diverge from entry visibility.
  Sections/sessions are readable by any signed-in user. **Zero client write
  grants or policies on any notebook table**: every write goes through
  SECURITY DEFINER RPCs that re-check `auth.uid()` inside (the 0041/0062
  pattern).
- **RPCs:** `notebook_create_entry` (self-only; inserts the entry plus its
  first 'original' photo — and, since `0075_notebook_optional_photo.sql`
  (apply after 0074), the PHOTO IS CONDITIONAL ON THE TIER: `p_drive_file_id`
  is optional, a SESSION-LINKED entry still requires one and raises the same
  'A Drive file id is required.' it always did, and a free-form entry needs
  only ONE of {photo, custom_label}, refusing only when both are missing.
  Deliberately in the RPC and not a table CHECK: the rule spans the entry and
  its photos, and it is a rule about CREATION — `notebook_add_photo` may
  legitimately take a note-only entry to one photo later, which a constraint
  could not tell apart from a violation. `photo_id` comes back null on a
  note), `notebook_add_photo` (owner-only; a resubmission onto a
  FLAGGED entry flips it to `pending_review`, never silently clears the
  flag; UNTOUCHED by 0075 and already correct for a zero-photo entry, since
  its `coalesce(max(sequence_order), 0) + 1` yields 1 — verified, not
  assumed), `notebook_flag_entry` (instructor-of-section or admin; reason from
  the fixed list, stamps reviewed_by/at), `notebook_resolve_entry`
  (same tier; closes the loop back to `compliant` — added beyond the spec
  because nothing else let an instructor accept a resubmission),
  `notebook_admin_upsert_section` (admin-only — assigning instructor power is
  role-assignment-tier trust; also added beyond the spec since no other write
  path to sections exists), `notebook_admin_upsert_session` +
  `notebook_admin_delete_session` (instructor-of-section or admin; delete
  DETACHES entries — session_id nulled, `custom_label` backfilled from the
  deleted session's label so the has-a-target CHECK holds — and logs),
  `notebook_admin_override_entry` (admin-only; re-point session/section, fix
  status/label, before/after logged) with `notebook_admin_set_excusal` as its
  excusal half, and `notebook_get_section_grid` (instructor-of-section or
  admin): sessions x roster with per-cell
  `missing/excused/compliant/flagged/pending_review`, latest-entry
  `entry_id`/`entry_count`/`upload_timestamp`, and `on_time` computed as
  upload date in America/Los_Angeles <= session_date. The grid roster is
  enrollment UNION anyone with entries/excusals in the section, so transfers
  stay visible.
- **Drive:** photo bytes live in a folder inside a Google Shared Drive, never
  Postgres. `src/lib/server/notebook-drive.ts` is the one egress point (the
  ONE-MODULE-KNOWS-THE-CREDENTIAL convention `src/lib/server/push.ts` also
  follows) and the ONLY code that reads the credentials.
  **Auth is OAuth on behalf of a real Bosco Tech account, not a service
  account** (supersedes the original service-account module): the shared
  drive blocks outside identities, which a service account is by definition,
  so it could never be granted access. An ADMIN runs the one-time consent
  flow at `/admin/drive-connect` (404 to everyone else including signed-out —
  the `/admin` rule — and deliberately NOT in `authedPrefixes`; a status card
  on `/admin` links it): it redirects to Google requesting the FULL
  `https://www.googleapis.com/auth/drive` scope (not `drive.file`: the target
  folder pre-exists in the shared drive, neither created by this app nor
  granted through a Picker flow, and drive.file's per-file model does not
  reliably cover creating files inside it — the limitation the original
  service-account module already documented) with `access_type=offline` AND
  `prompt=consent`, both
  explicit because without both Google will not reliably return a refresh
  token at all. The callback matches the registered redirect URI
  `https://ideabosco.com/admin/drive-connect/callback` exactly (a constant in
  the module, used in both the consent request and the code exchange),
  verifies a state cookie (CSRF), exchanges the code, and DISPLAYS the
  refresh token once (`cache-control: no-store`, never logged, never stored
  in the database) with the instruction to paste it into Vercel as
  `GOOGLE_DRIVE_REFRESH_TOKEN` and redeploy; a missing refresh token in the
  response gets the revoke-at-myaccount-and-retry explanation. The module
  mints short-lived access tokens from the refresh token on demand (cached
  until near expiry, one forced re-mint + retry on a 401 upload), and every
  Drive call carries `supportsAllDrives=true` because the target is a
  shared-drive-NESTED folder, which the plain endpoints pretend not to see;
  uploads land in folder `1WT0isqdSIPu1kMV142fu-6TsbP3tlmVs` (the module
  default; `GOOGLE_DRIVE_NOTEBOOK_FOLDER_ID` overrides). Env:
  `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` +
  `GOOGLE_DRIVE_REFRESH_TOKEN` (see Environment). Routes
  `/api/notebook/upload` (Drive upload then `notebook_create_entry`) and
  `/api/notebook/add-photo` (then `notebook_add_photo`) authenticate the
  caller's real session first (`locals.claims`, 401 signed out) and run the
  RPC under the caller's OWN cookie session, so the RPC's internal check is
  the boundary; a refused RPC deletes the just-uploaded file best-effort;
  neither route (nor anything else) touches the client secret or refresh
  token directly. 4 MB cap (Vercel body limit), JPEG/PNG/WebP/HEIC only.
  Neither route is in `authedPrefixes` (they answer their own 401s, the
  vanguard-save pattern). **Drive filenames are human-readable** (the admin
  browses the folder by eye):
  `{date}_{identifier}_{label}_{variant}_{entry-short-id}.{ext}` via
  `notebookDriveFilename` (LA-calendar date; identifier = display_name ->
  full_name -> email local part, the greenline author_name order; label =
  session label else custom_label else — 0071 — the original filename with
  its extension stripped, else "entry", each slugified and capped at 40;
  short-id = first 8 of the entry uuid). The upload route pushes to Drive
  BEFORE the entry exists, so it uploads under a provisional random short-id
  and best-effort RENAMES (`renameNotebookFile`) to the entry's short-id
  after the RPC returns; add-photo names correctly at upload. Cosmetic only:
  the DB still stores only the Drive file id, and a failed name lookup or
  rename never fails an upload.
- **Smoke test:** `/admin/notebook-drive-test` (the `/admin` 404 gate, not in
  `authedPrefixes`) is a bare admin-only form that pushes ONE real image
  through the existing `/api/notebook/upload` as a `custom_label` entry and
  shows the entry id + Drive file id with a view-in-Drive link (or the
  route's actual error). Temporary scaffolding to prove the Drive write path
  before the student-facing upload UI exists; retire it once that lands.
  `/dev/notebook-drive-test` (404 in production, no auth) mounts the same
  page component for harness verification.
- **Verified** against a real embedded Postgres (0001 + 0003 + 0020 + 0067 +
  0069 applied unmodified, Supabase-shaped auth/storage stubs, the tournament
  harness approach): RLS isolation between two students, instructor and
  admin visibility, the anon/authenticated write boundary, flag ->
  add_photo -> `pending_review`, delete-session detach, override/excusal
  logging, and the grid's shape and on-time math (re-run for the OAuth pass:
  62 assertions, all green). The OAuth Drive layer was verified through the
  REAL shipped route handlers + module against a mocked Google (58
  assertions: exact consent params including `access_type=offline` +
  `prompt=consent`, 404 for anon / student / non-admin teacher, the state
  CSRF check, the code-exchange and refresh-grant request shapes, multipart
  upload with `supportsAllDrives=true` into the folder id, token caching and
  the 401 re-mint retry) and live on the dev server (anonymous
  `/admin/drive-connect` + callback answer 404 with no redirect leaked;
  anonymous uploads answer 401). **NOT verified: a real file landing in the
  real shared-drive folder** — that requires the one-time human consent step
  no session can perform: after deploy, an admin visits
  `/admin/drive-connect`, approves with a school account that can write to
  the notebook folder, pastes the displayed token into Vercel as
  `GOOGLE_DRIVE_REFRESH_TOKEN`, redeploys, then uploads a real photo. 0069
  itself is code-only until applied by hand in the SQL editor, per the
  migration convention.

