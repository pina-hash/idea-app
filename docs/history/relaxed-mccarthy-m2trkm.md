---
title: "Feedback round 2026-10-07 (nineteen reports, R01 to R19) and the IDEA Armory v0.3 website requests, built as eleven clusters with one migration, `0233`: Armory's server half and website, admin edits of filed reports and the Send feedback rename, the class page, one student's page, the projector, dictation, ported HTML worksheets, the home page on Space White, Foundry major releases and VANGUARD build 215"
date: 2026-10-08
branches: [claude/relaxed-mccarthy-m2trkm]
migrations: ["0233"]
subsystems: ["IDEA Armory", "Feedback", "Classroom", "Projector", "Dictation", "Foundry", "VANGUARD", "Home page", "Ported HTML assignments", "Migrations"]
---

Mr. Pina's feedback console export of 2026-10-07 held nineteen reports, R01 to
R19 (all marked seen by `docs/feedback/2026-10-07/MARK_SEEN.sql`). Beside it he
sent the IDEA Armory v0.3 website requests: (1) live updates, (2) Force check in
for a site admin, (3) Delete forever for a project or a folder with the R2 bytes
cleaned up, (4) a table, RPC, console tab and Markdown export for the Windows
app's own feedback, (4b) automatic incident reports kept 90 days, (5) a team
status heartbeat, and (6) the lock-order deadlock fix with batch lock and
release. He asked for it pushed straight to `main` when done (ledger
`docs/prompt-ledger/entries/0368-feedback-round-2026-10-07-and-armory-v3.md`,
solo mode).

It was built as eleven clusters, each on its own `round/<cluster>` branch with
a build, a review and, for five of them, a fixer pass, then merged into
`claude/relaxed-mccarthy-m2trkm`. Where a fixer pass replaced what a builder
shipped, this entry records the fixer's version. There is ONE migration,
`supabase/migrations/0233_feedback_round_and_armory_v3.sql`, in six parts, and
the round's decisions are 47 to 57 under `docs/decisions/entries/`.

| Reports | Cluster | Decision |
|---|---|---|
| R16, R17, R18; v0.3 items 1, 2, 3, 5, 6 | Armory server half and website | 49 |
| R13; v0.3 items 4 and 4b | Feedback console edits and Armory tabs | 48 |
| R11 | The report control renamed Send feedback | 47 |
| R02, R04, R09 | The class page (R04 is quick posts) | 52 |
| R01, R15 | One student's page | 54 |
| R06, R08 | The projector | 50 |
| R14 | Dictation | 51 |
| R03, R07 | Ported HTML worksheets | 53 |
| R12, R19 | The home page on Space White | 55 |
| R10 | Foundry major releases | 56 |
| R05 | VANGUARD | 57 |

R05 is a student's report. svelte-check held at 0 errors and 37 warnings in 20
files (31/5/1) in every cluster's report.

### 1. IDEA Armory on the server: 0233 parts `armory-reports` and `armory-core`

**What changed.** `armory-reports` is the file's first part and
`armory_app_feedback` its first statement, so the deploy probe has a table no
earlier migration made.

- `armory_app_feedback` and `armory_app_incidents`: RLS `is_admin()`, `select`
  granted to `authenticated`, no client write. The incident key is composite,
  `(feedback_id, email)` referencing `(id, email)`, so an incident can only name
  its own reporter's note. `project_id` is `on delete set null`, and a submit
  naming a missing project stores none rather than refusing.
- Two submit functions with no identity parameter: 20 feedback an hour per
  account and 30 incidents an hour, refused `PT429`; bad input `22023` with a
  DETAIL reason (`too_large` carries the limit and the size); the report and the
  feedback context each capped at 1 MiB; every incident submit deletes incidents
  older than 90 days. A device name is cut to 120 characters, never refused; an
  app version is 1 to 64 characters on a report and at most 40 on a heartbeat.
- Two admin lists (`p_limit` clamped 1..1000, null meaning 200); the incident
  list never carries `report` and hides anything past 90 days before a submit
  prunes it. Two status functions in 0188's shape.

`armory-core`:

- **Item 1** had shipped in 0231; 0233 re-runs the guarded publication add and
  prints whether `armory_change_feed` is in the publication.
- **Item 2.** `armory_break_lock` admits a site admin and a null device, its
  refusal text and `P0001` byte-identical. `armory_my_projects` gains
  `can_take_back` and stays membership-only (it is what a computer syncs).
  `armory_set_project_archived` admits a site admin, and `armory_add_member` and
  its siblings give a site admin a mentor's reach on any project.
- **Item 3.** `armory_purge_project` (site admin, archived first, the name
  typed exactly: NFC, case and spaces, no server trimming) and
  `armory_purge_folder` (site admin or mentor, removed files only), both refusing
  `55006` `referenced_elsewhere` rather than break another file's history;
  `armory_purge_preview` for the counts. A project purge leaves a receipt in
  `armory_purged_projects` (`armory_project_purged` answers from it, and it keeps
  no member address), because the feed's project key and member RLS die with the
  project; a folder purge writes an ordinary `folder_purged` change. The orphan
  queue is `armory_orphaned_blobs` with `armory_orphans_count`,
  `armory_orphans_pending` (clamped 0..1000, re-checking references and marking a
  re-referenced hash kept) and `armory_orphans_swept`; only hashes no surviving
  version or side version names are queued, because storage is content-addressed
  and shared. A folder purge refuses only a checkout acquired AFTER the file's
  `deleted_at` (the tombstone never releases the remover's own lock, which is
  released and counted). `armory_refuse_version_mutation` passes a DELETE only
  when the file carries `purging_at` AND the deleting role is a member of the
  table's owner, and TRUNCATE is revoked from `service_role` on the three history
  tables.
- **Item 5.** `armory_devices` gains `last_seen`, `app_version` and `state`.
  `armory_heartbeat` writes nothing for a call within 20 seconds that changes
  nothing, stores a null or empty version or state as null, and refuses only an
  overlong version or a state that is not one word. `armory_team_status` reads it.
- **Item 6.** Eight per-file writers (acquire, release and break lock, side
  version, commit, tombstone, move, create) take the project row `FOR KEY SHARE`
  first; `acquire_lock` and `save_side_version` re-read the file after it, so a
  file purged mid-wait answers 'not a project member' rather than a raw `23503`.
  New batches `armory_lock_files` and `armory_release_locks` work in id order.
- **Website reads.** `armory_can_view` (member or site admin) re-points the ten
  member-read policies with ALTER POLICY and gates `armory_project_files` (gaining
  a per-file `side_versions`), `armory_file_history`, `armory_list_changes`
  (still `P0001`) and `armory_project_checkouts`, each keeping its own refusal.
  New: `armory_project_summaries`, `armory_people_search`, `_armory_person` and
  five indexes.
- **The people search gate.** The schema builder built the contract's gate
  (mentors and site admins) and raised the narrower one as a question; the
  merged file carries the narrower one, from the website cluster's commit
  `d8c34407`: a site admin, or a mentor of the project whose own address is a
  teacher's by `role_for_email`, else `42501`. It is a directory of every school
  account, and a mentor can grant mentor to a student address.

Each part ends with a self-check by name over its own objects; one refuses the
apply if the purge function's owner is not a member of the history tables'
owner. `docs/ARMORY.md` gained "The v0.3 server contract (migration 0233)" (every
RPC with its refusals and SQLSTATEs, the limits, the retention, the incident
export shape, what the Windows app must do) and had rule 5, Roles and owed
decision 3 edited in place. CLAUDE.md's `app_feedback` bullet now says "every
WEBSITE surface", "Archive, never delete" names the one exception, and a new
Armory paragraph carries the rules below. Tests: `tests/db/armory-v3.test.ts`,
`tests/db/armory-v3-purge.test.ts`, `tests/db/armory-v3-reports.test.ts`,
`tests/db/armory-v3-helpers.ts`.

**Load-bearing decisions.**

- **The owner half of the exemption is the one that matters.** `service_role`
  holds DELETE on the history tables and UPDATE on `armory_files` by the hosted
  default privileges, so a marker alone is a door any server with the key could
  open; a custom setting was refused because any role can set one.
- **The private `_armory_*` helpers are revoked from `service_role` too**, found
  while building: `_armory_purge_files` is security definer, so it runs as the
  owner and passes the trigger. With the revoke removed, `service_role` deleted a
  file's whole history around the purge's admin gate; the self-check now refuses
  that apply.
- **Every replaced body was copied from 0231/0232 with only marked lines
  changed.** A 46-call corpus answered identically before and after, refusal
  text, SQLSTATE and DETAIL included, except `break_lock` with a null device.
- **Format checks, not lists**, for incident kind and device state, so an app
  release that adds a word lands. **`report_bytes` is set from the size as
  sent**, because the stored row is compressed. **Never `54000`**, which
  PostgREST answers with 500.

**Measured.**

- The deadlocks, on the real 0231 and 0232 bodies: a folder operation crossing a
  check out gave `{folder: 'locked 2', checkout: 'ERR 40P01'}`, and a purge's
  order crossing a take back gave `{purge: 'deleted 1', take: 'ERR 40P01'}`.
  After 0233: `{locked 2, ok=true}` and `{deleted 1, ok=false}`, and the reverse
  order also completes.
- 1048576 bytes accepted, 1048577 refused with DETAIL `{reason: too_large,
  field: report, limit: 1048576, size: 1048577}`; the stored row's
  `pg_column_size` for a 1 MiB report is 12026 bytes.
- 196 of 196 tests in seven files (armory-v3 42 tests in 6.4s, purge 22 in 4.7s,
  reports 18 in 3.3s); 27 of 27 mutants killed, one by 0233's own apply-time
  self-check, the file restored md5-identical after each.
- `tools/idea-status.py` on a scratch clone derived the probe `table
  public.armory_app_feedback`, and each of the 15 replaced functions carries a
  0233 marker (acquire_lock, break_lock, commit_version, create_file,
  file_history, list_changes, move_file, my_projects, project_checkouts,
  project_files, refuse_version_mutation, release_lock, save_side_version,
  set_project_archived, tombstone). `tools/claude-md-check.mjs` agreed.

**Not verified.** PostgREST's mapping (`PT429` to 429, `22023` to 400, `55000`,
`55006`, `P0002` to 500 is documented, not measured). Realtime delivery and its
2-second target. A 1 MiB RPC body through the gateway. Production's owner
relation (0231 was applied as `postgres`, and the self-check refuses otherwise).
The Windows app against any of these RPCs, including whether it filters reads by
project now that an admin session can read every project.

**Deferred.** `armory_add_member` is still an upsert that overwrites an existing
member's role; the website no longer sends such an add (section 2), but the RPC
refusal is a later migration. The blob-url un-queue that would narrow the
documented sweep race. Feedback notes keep student addresses forever, as asked;
only incidents expire.

### 2. IDEA Armory on the website (R16, R17, R18)

**What changed.**

- **The project page is views.** `/armory/<project>` is a header (notices, a
  status line naming the `C:\IDEA\Armory` folder, live or polling in words,
  role, yours and storage readouts, the tab strip) plus one view: Files, Checked
  out, Team, Activity, Project. `?view=` is read by the page component, never a
  load, so a tab press reruns nothing. Files arrives with each top-level folder
  closed past 40 files; search or a filter lists every match flat. Checked out is
  a searchable table filtered by holder, oldest first, 25 at a time with "Show 25
  more" and "Show all". Activity shows 15 rows, then up to 40. Project (mentor or
  site admin) holds rename, archive, storage and Delete forever.
- **People are site accounts.** The Team view reads `armory_team_status`:
  picture, chosen name, pathway chip, role, and "n checked out" opening Checked
  out for that person. A computer reads "Armory open", "Armory open, syncing",
  "Last heard from <time>" or "No status from this computer yet", never
  "offline"; the view keeps a 30s clock and re-reads every 60s. Addresses show
  only to mentors, CAD leads and site admins. Search by name is offered through
  `peopleSearchOffered`, the server's own gate, as a combobox with a 250ms
  debounce and a request counter run from the input handler, collecting picks in
  a tray added under one role; "Add by email" sits below it, open with a reason
  for anyone not offered the search.
- **The role picker stages its choice** behind "Change to <role>". It wrote on
  `change`, which Chrome fires at every arrow step, so arrowing through it made a
  student a CAD lead on the way past (the classroom teams' Move to rule).
- **Force check in** (renamed from Take back in `VERBS.takeBack`) calls
  `armory_break_lock` from Checked out and Files through one arming state,
  `ForceCheckIn`, sending `p_device: null` only when the summaries read answered
  (`v033Ready`), because before 0233 a null device is refused and the migration
  and the deploy have no fixed order.
- **Delete forever** (site admin, archived only) prices itself from
  `armory_purge_preview`, not the summary bytes, because storage is shared. One
  predicate, `purgeCanSend` (trimmed and NFC), drives the `aria-disabled` key and
  the handler; a preview saying it would be refused holds the key with the reason
  before anyone types; the operation id is minted once so a retry replays. `POST
  /api/armory/purge` runs on the caller's own client (a non-admin gets a bodyless
  404) and words a refusal from SQLSTATE plus `DETAIL.reason`, never the HTTP
  status (PostgREST answers `23505` as 409 and `55000`, `55006`, `P0002` as 500);
  0231's `P0001` texts stay matched as text because the Windows app reads them.
  `ok` is true the moment the RPC returns; the sweep follows and anything left is
  a `storageProblem` sentence.
- **The R2 sweep**, `$lib/server/armory/sweep.ts`: a presigned DELETE then a
  HEAD per hash, swept only on a HEAD 404 (R2 answers DELETE with 204 even for a
  key that was never there), six at a time within 8 seconds and 400 objects;
  with no storage configured it makes no request and says so. `POST
  /api/armory/sweep` is the admin's "Finish cleanup". DELETE joined sigv4.
  Neither route reads the service-role key.
- **The `/armory` index** cards follow My Classes from
  `armory_project_summaries`; archived projects fold; a site admin gets "Other
  projects" and a Storage cleanup panel. The room wears the classroom plate (title
  bar, tabs, wells, recessed readouts, each added to plate.css's lists for this
  room only), and Feedback is docked in the header (`SiteFeedback
  place="relocated"` in `ArmoryFrame`).
- **Live updates** coalesce through `changeCoalescer`: a burst reloads once, a
  second after it goes quiet (`ARMORY_CHANGE_COALESCE_MS`), and a stream that
  never quiets reloads at least every 5 seconds (`ARMORY_CHANGE_MAX_WAIT_MS`).
- **Before 0233 every new read falls back** (`PGRST202`, `42883`, `42P01`,
  `PGRST205`; a heartbeat column retries on `42703`), and the page says why a
  control is absent. `tests/armory-page-loads-ladder.test.ts` drives the real
  `/armory` and `/armory/[project]` loads with and without 0233 and fails if a
  load reads the url. Only `view` (and `who=me`) lives in the address; the holder
  filter is component state, because a reload would carry a student's address
  into request logs. `/dev/armory` mounts the real components in 26 states.

**The fixer pass.** The review's blocking finding was real: `armory_add_member`
(0231) is an upsert and `addPeople` skipped only an exact role match, so adding a
batch "As Student" that held a mentor demoted the mentor and said "Added"; Enter
on the highlighted row 0 could tray a member. Now `addPeople` in
`src/lib/armory/team.ts` never sends an address already in `members`
(case-insensitive), listing them in `otherRole` with their role for
`addPeopleWords`, which covers the picker and the paste box together; the picker
never trays a `member_role` row (it stays visible, `aria-disabled`, and explains)
and highlights the first addable person; its sentence got its own hook,
`armory-picker-message`. CLAUDE.md gained "AN ADD IS NEVER A ROLE CHANGE". Also:
the cleanup note survives an emptying sweep; `pick()` cancels a waiting search;
every R2 request is capped by a 10-second total deadline
(`ARMORY_SWEEP_BUDGET.deadlineMs`, each request the smaller of 5000ms and the
time left, never under 250ms; a removal started at 8s could run to about 18s); a
lost purge answer shows `PURGE_ANSWER_LOST` (cannot tell, pressing again is
safe), never "nothing was deleted"; the Checked out table states its ARIA roles;
a holder filter naming nobody falls back through `holderFilterOf` and says so;
and the probe tools `_armory-theme-contrast.mjs` (floors 4.5 for words, 3 for a
glyph, loud on a check matching nothing) and `_armory-v2-shots.mjs` read the new
views.

**Measured** (`/dev/armory`, Chromium, fallback fonts):

- Files, 240 files in 12 folders, folded: 1473px at 375 and 1125px at 1440,
  against a 5-file baseline of 3983px and 1748px. Checked out, 60 checkouts,
  first 25 rows: 2577px at 375 (budget 2600) and 1783px at 1440 (budget 1800);
  50 rows 4264px and 2908px. Holder keys add up to 60 of 60; every Force check in
  answers a tap at its own centre (smallest 152.8x44).
- 0px overflow on all 18 route-and-width runs. Tabs 110.3x44 and 136.2x44,
  folder toggles 343x44 and 1216x44, search options 331.4x57.5, role pickers
  128x44, Remove 90.8x44, the purge box and key 260.8x44; 0 under 44.
- After the fixer pass, 84 contrast checks over all three themes, 0 below their
  floor and 0 matching nothing: worst 5.39 IDEA and 5.41 Matrix (the sentence
  saying why Delete forever is held), 4.95 Space White (a ticked setup step).
- plate.css scope proof: 0 differing elements on the classroom split, grading,
  Foundry gallery, coin desk and home routes, IDEA and Space White, 375 and 1440;
  the positive control `/dev/armory?state=many` showed 230 in every run; two
  same-tree captures of the themes-shape and People routes differed by 238, so
  those are capture noise.
- Full pass: 18 runs, 656 measurements at build and 668 after the fix, the only
  18 out each time being font-403 console errors. Mutations 10 of 10 at build and
  7 of 7 in the fix. The pre-fix picker read the tray `[1,1,18]` (a member in it)
  where the fix reads `[1,0,18]`. With the clock at 7.9s all 6 request timeouts
  were 2100ms or less. 60 events in about 1 second gave 1 reload; one every 600ms
  for 12 seconds gave 3 or more, the first within 5000ms.

**Not verified.** Nothing ran against the real 0233 SQL; a static read found
every jsonb key the site reads in it. PostgREST and realtime. Whether the R2
token may DELETE (if not, every sweep leaves files queued and the purge still
says ok). A signed-in `/armory` and the real Windows app. WebKit, a phone,
reduced motion. The deadline is pinned by a spy on `AbortSignal.timeout`, and the
purge route's platform cutoff (no `maxDuration`) was not measured. One residual
re-role: a person made a member on another computer before realtime delivers can
still be sent by the paste box.

**Deferred.** File history beside the list above 1024px (Mr. Pina's question; it
needs `.ar-root` in split.css's room lists). A website Delete forever for one
folder. The sweep race narrowing and the RPC-side role refusal.

### 3. Feedback: Send feedback, admin edits of a filed report, and the Armory tabs (R11, R13, v0.3 items 4 and 4b)

**The rename (R11, decision 47).** `REPORT_LABEL` is 'Send feedback' and
`REPORT_LABEL_SHORT` 'Feedback', identifiers and hooks unchanged. context.ts
gains `FEEDBACK_PROMPT` ('A problem, an idea, or something you liked?', opening
the box on the site, the legacy panel and VANGUARD), `FEEDBACK_GLYPH` (a speech
bubble) and `PROBLEM_GLYPH` (the triangle, now the error page's only). Five
mounts that hard-coded the word (the deck, the projector, three harnesses) read
`{REPORT_LABEL_SHORT}`, and ten browser specs moved. The longer word's width on
a phone came out of `ClassroomShell`'s row (the right gap 8 to 4px, the stacked
control's sides to 4px), never out of the word, because the plate holds mono
labels at 11px.

**Edits (R13, decision 48), 0233 part `feedback-edits`.** `app_feedback_edits`
holds one numbered revision per correction, keyed `(feedback_id, revision)`,
RLS on, no policy, no grant; concurrent saves queue on the report's row lock
(`for update`) with the key as backstop. `app_feedback_edit` is the one
admin-only writer, refusing `kind`, `empty`, `too_long`, `tried_too_long` and
`stale`; an unchanged save returns `changed:false` and stamps nothing, tested
BEFORE staleness so a retried save whose answer was lost does not read stale.
The wide `app_feedback_admin_list(text,integer,text)` is re-created at the same
signature with no defaults and every row gains `edit` (null when unedited), so
the narrow wrapper inherits it. The reporter's own columns are never written,
honouring 0053's append-only intent literally.

Client: readers `rowEdit`, `rowKind`, `rowMessage`, `rowTried`,
`rowOriginalTried`; `FeedbackEditForm` on the one save state (autosave off) with
`EditBaseline`, `SaveIndicator`, `guardSaveNavigation` and `holdDeployReload`; an
Edited tag, an "Edited by" line and an "As sent" panel. The Edit key appears only
when the load saw the `edit` key (`editReady`, over the merged newest and
long-term rows). The Markdown and the archive's report.md print the corrected
words with an `edited:` line and do NOT quote the original; the JSON and
index.json keep it; an unedited row exports byte-identical.
`tools/feedback_digest.py` prints only the corrected words, tagged `[edited]`,
because its output is pasted into a committed triage and an edit may exist to
remove a dictated name.

**The fixer pass on edits.** The form was the only holder of the typed
correction, so anything that took its card off the filtered list destroyed the
words: the card's own Seen or horizon key, a bulk move, and a filter tab (which
the review did not list); the dirty flag then stayed set and every other Edit
key refused. Withdrawing the dirty signal on teardown, as suggested, would still
have lost the typing. Built instead: the console holds `FeedbackEditDraft` (kind,
message, tried, `baseRevision`), fed by an `ondraft` callback from input handlers
only; a remount opens on it against the revision typed against, so another
admin's correction is still refused as stale, and marks itself dirty on its
first frame. The draft is NOT withdrawn on teardown (the next mount needs it);
the console clears it on save, discard, or the row leaving. A hidden open edit is
drawn in a "Being edited" section above the list, outside every count and export.
The card's own status and horizon keys are `aria-disabled` while its form is open,
with a sentence linked by `aria-describedby`; bulk moves still include it. An
editing id with no row counts as closed (`editingRow`). Also: `changed:false` at
another revision counts as landed and the transport reloads on every ok answer;
transient SQLSTATEs are retried through `isTransientSqlstate`; incident heading
ids are positional; the Armory status filters are `aria-pressed` buttons in a
`role=group`; the digest's `edit_of` matches `rowEdit`.

**The Armory tabs (items 4 and 4b).** `/admin/feedback` is a three-tab area
(`FeedbackSourcesNav`: Site, Armory app, Armory incidents). `+layout.server.ts`
gates it and each page still calls `requireFeedbackConsole` first, because a
layout load and a page load run concurrently (mutation-proven on all three).
`ArmoryFeedbackConsole` has status filters with counts, kind, version and person
filters, per-row and bulk status through `runBulk`, the context in a `<pre>`
inside a Disclosure, Markdown export with fences sized to the content, and a
name-withholding toggle. `ArmoryIncidentConsole` groups by kind and version,
has a per-day table over the last 14 school days of the filtered set, filters
including 'No project', a Download .json per card and one zip over a selection
through `buildZip`, capped at 64 MB (`ARMORY_INCIDENT_ZIP_BUDGET`) with the cut
stated; reports are read at download time on the admin's client in chunks of 10,
and the file is exactly the `idea-armory-incident/1` key set (a draft's
`submitter_identity` was removed). Before 0233 it shows
`ARMORY_REPORTS_NOT_READY`. `saveBlob` moved to `$lib/feedback/download.ts` and
`FEEDBACK_STATUSES` to feedback.ts for all three consoles.

**Measured.**

- The classroom header at 375 with the real fonts (through an `fs.allow` entry
  in vite.config.ts that was NOT committed; the file was restored
  byte-identical): Feedback 59.3x44, the class strip 58.2px with 1 whole icon,
  against 60.9 and 48.6 before. At 1440: 102.4x44 and a 111.4px strip with 2
  icons. In the fallback stack at 375: 64.8x44, a 50px strip, 0 icons, which
  FAILS its spec and is recorded, not fixed; at 480 and 560 it is 107.9x44 with a
  whole icon on screen.
- The Coin Ledger's button 77x44. Source keys 76.1x45.4, 0px overflow on every
  tab. Armory app tab: 36 controls, smallest 73.1x44; body 13.31:1, meta 6.47,
  tabs 6.84, `<pre>` 14.5. Incidents: 66 controls, smallest 73.1x44; 13.31, 6.47,
  15.27, 13.72, 6.84. Edit form: Edit 76.1x44, Save 116.8x44, Cancel 92.4x44, the
  kind picker 222.3x44 and 224x44. Being edited: heading 15.27, sentence 7.2,
  hold sentence 6.47, unlit keys at least 70.4x44, Save 124.1x44, Discard
  150.9x44.
- Build: 16 console runs (296 measurements), 10 header and quick-note (110), 48
  rename (734), 32 projector and deck (522), 0 outside after fixing a cold-start
  flake in the class view updates spec's month press (now retried up to 15
  seconds against its own effect). Fixer pass: 12 runs, 224 measurements, only
  font-403 rows out. Mutations: the edit admin gate, three route gates and the
  export identity toggle at build; 6 of 6 in the fix. The 12 touched test files
  passed 359 of 359.

**Not verified.** A live PostgREST round trip of `app_feedback_edit` and the
Armory lists. The Armory consoles against the real schema functions in one
database (they were coded to the contract). Signed-in `/admin/feedback`. Space
White for the two new sentences. A real lost answer producing the
newer-revision shape end to end. Reduced motion, Safari, Chrome 154.

**Deferred.** Dashboard links to the Armory tabs (the strip is the way in). An
all-incidents trend table. Marking Seen while an edit is open. The 375 fallback
fit (about 5px spare with Share Tech Mono, none without). Font serving through a
symlinked `node_modules` in `tools/browser-verify`. A `readHistory` failure in
`tests/workflows.test.ts` predates this cluster and was left alone.

### 4. The class page (R02, R04, R09)

**What changed.**

1. **Opening an item no longer rebuilds the class page (R02).** ClassView's
   root was `<svelte:element this={asPane ? 'section' : 'main'}>`, and Svelte
   keys that block on the tag, so every item open and return rebuilt every child:
   the banner replayed, pollers restarted, an open theme vote closed, a typed
   quick post was lost. It is now one stable `<section class="classroom-page"
   class:as-pane role={asPane ? undefined : 'main'}>`, with
   `.classroom-page:where([role='main'])` standing in for app.css's `main`
   stacking rule below the untouched `.edit-layer-open` rule. The golden was
   rewritten mechanically (4 roots, 4 closers, 1 `as-pane`, 2 pattern wraps)
   rather than regenerated, and CLAUDE.md gained the tag-switch trap.
2. **The banner pattern no longer jumps (R02).** The hover swapped the
   `animation` shorthand, so leaving restarted the arrival. The loop moved to a
   `.ct-pattern-loop` layer attached from the start and paused; `:hover` sets only
   `animation-play-state`; `transform-origin` is on both layers (it does not
   inherit). Rays got a 72px overscan and +/-2.5deg (0.9deg was not visible).
3. **Quick posts carry files and 4000 characters (R04, decision 52), 0233 part
   `quick-posts`.** The CHECK and `classroom_quick_post_create` (same signature)
   take 4000 characters. `classroom_quick_post_files` is RLS on, no policy, no
   grant, and has no uploader column (it would always equal the author). A
   private bucket `quick-post-files` (45 MiB) has author-insert and
   audience-read policies keyed on the first path segment, in a guarded sub-block
   that raises a NOTICE instead of refusing when the applying role cannot write
   storage. `classroom_quick_post_add_file` (author only, while the notice is up,
   row lock, 10-file cap, idempotent on the key) and `classroom_quick_post_file`
   are new. The read projects per-post `files` (never a key or an address),
   `files_ready` (from `pg_policies`, so the picker appears only where the policy
   exists) and `limits`. A fourth upload role, `quick-post`, has its sign, record
   and get routes on the caller's client (get redirects to a signed `download=`
   URL); the 45 MiB guard is in `uploadQuickPostFile` and the sign route, and the
   shared 200 MB cap did not move. Nothing sweeps orphans: there is no delete
   policy. `QuickPostComposer` posts first, then uploads onto that notice; a
   failed file stays staged, "Attach the rest" goes to the SAME notice, "Close
   without them" takes two presses, a drop on the composer stages there, and the
   deploy reload is held while anything is in it. A long notice shows a lead
   (`quickPostSplit`, about 280 characters or 4 lines, `QUICK_POST_LEAD`) and one
   closed "Rest of the notice" Disclosure. Files sit under it through a new
   `AttachmentList compact` prop: pictures as 4.5rem tiles opening the Lightbox
   on the notice's set, other files as download rows. Students lose a file when
   its notice ends, managers keep it, and nothing is deleted.
4. **The narrowed list stays readable (R09).** CSS only: `.stream` is a
   `class-stream` size container with two tiers under `.classroom-page.as-pane`,
   so a phone keeps its 44px grip. At 25rem or less the drag grip and a collapsed
   expand arrow step aside (Move up and down stay in the row menu) and the unit
   header's keys wrap under its name; at 20rem or less the kind word is visually
   hidden while the glyph shows it. No meta field is ellipsized or hidden (ledger
   0281), so the plan's `overflow-wrap`, meta ellipsis, category hiding and
   `formatDueParts` were dropped after review; a dead padding rule (0px) went too.

**Measured.** The narrowed pane at 1440 (`/dev/classroom-split?names=long`,
stepping the real separator), before and after:

| Pane | Overflow | Broken words | Unit name | Long title width | Row |
|---|---|---|---|---|---|
| 18rem | 52px to 0 | 2/92 to 0/92 | 4 lines to 2 | 71.3px to 154.8px | 111.4px to 93px |
| 20rem | 20px to 0 | | | 103.3px to 186.8px | |
| 22rem | | | | 135.3px to 218.8px | |
| 24rem | | | | 167.3px to 250.8px | |
| 26rem | | | | 199.3px to 282.8px | |
| 30rem | | | | 263.3px (standard, unchanged) | |

- At 18rem the checkbox and row-menu trigger hit at their centres and the
  anchored menu opens on screen and on top.
- Through a real row click and Back at 375 and 1440 the root and header keep
  their identity; with the old root put back, 4 of 4 identity reads were false
  and 2 of 2 DOM tests reddened.
- Banner hover with a real pointer, same at 1440 and 375: stripes tx 5.66
  hovering, 5.75 after leaving and 5.75 after 500ms; rings scale 1.0122 to 1.0126
  to 1.0126; rays 0.323 to 0.334 to 0.334deg; the arrival finished at 4200ms.
  Worst corner margin over every arrival tenth and loop phase: rays 54.1px at
  375, 14.0px at 1440, 9.9px at 1920; stripes 7.0px; rings 0.0px.
- A long notice with 5 files: 433.3px folded and 859.2px open at 375, 384.7 and
  542.7 at 1440, 433.3 and 810.5 in the 26rem pane with 0px overflow and 3 tiles
  on a line. Tiles 72x72, the fold key 44px tall, lead and rows 13.72:1; a tile
  opens the Lightbox and ArrowRight moves the count and the picture.
- Compose: 3 staged files gave 1 create, 3 uploads, 1 refusal left staged, 2
  tiles; "Attach the rest" added 0 creates. Choose files 118.5x44, no `accept`.
- DB: 24 tests, 6 of 6 permissive mutants killed. Final pass: 102 runs, 1320
  measurements, 104 out: 102 font-403 rows and 2 that reproduce on base
  `5d9e2fae` (a teacher's posting keys not on one line at 375; one label under
  4px from its edge on the crowded sweep).

**Not verified.** Whether production's applying role (`idea_migrator`) can
write the bucket row and policies; the guarded NOTICE path was never exercised,
because the DB tests apply as the cluster owner. A real Storage round trip.
Safari and touch. Signed-in pages.

**Deferred.** A class's first theme vote, or a reset, still remounts the header
(`ClassThemeBanner`'s `{#if theme}`); fixing it breaks the byte-for-byte
null-theme rule, so it is Mr. Pina's call. A permanent hover spec (it needs a
`hover` prepare step in `tools/browser-verify/run.mjs`). A draft mirror for the
quick-post body.

### 5. One student's page (R01, R15)

**What changed** (decision 54). A manager-only page at
`/classroom/<section>/people/<email>` shows one student's work and activity in
one class and prints for a parent conference. Every refusal is the same 404 as
People and Grades, gated on the section layout's own `canManage`. It is reached
from the student's name on the People roster (`studentHref`, every student row,
never a row with `manages: true`) and from the palette's @ search, which used to
open the notebook.

`StudentOverview.svelte` shows identity and roster state; tiles; an assignments
table in `studentWorkChip`'s words with due, turn-in ("late"), score once
returned, working time, last typed and last opened, and the presence coverage
sentence once under it; notebook check-ins in the grid's glyph and word; when
each handout was last opened; hall passes (count, minutes, list, no flag at any
duration); saved teams (name and size only, never a teammate); coins across all
classes in the one history renderer (no note, no actor); music counts; IdeaCAD
models; and the student's Foundry apps the teacher can see, never play data,
omitted when empty. No percent and no letter grade: points over returned work as
"X of Y" with "The grade of record is in FACTS."; GAUNTLET and last sign-in are
not shown.

Every class read runs as the caller with an attribution filter on the student;
the whole-class reads (grid, team board, roster) are cut down on the server,
because a load's answer reaches the browser and the page is printed for a parent.
One new read, `classroom_student_overview` (0233 part `student-overview`),
returns NULL identically for no session, a null argument, an unmanaged section,
an address with no enrollment and an address that manages the section. It
returns hall passes (newest 500 plus a total), item views through
`classroom_postings` (reversing 0085's "no surface shows it", with no policy
added to `classroom_item_views`), song counts, coins through `_coin_balance`
(newest 500, with the ids `CoinTransactionRows` needs to collapse a transfer)
and `presence_limits` from 0200's five helpers, pinned equal by a test.
`buildStudentPage` in `$lib/classroom/student-overview.ts` serves the route and
the harness `/dev/classroom-student`. A student's open record outranks the "Not
opened" line. The streak counts turned-in entries only and says so (staff RLS
never returns drafts). Items back in draft that carry this student's work stay
listed as "Not posted now".

Printing switches to Space White on `beforeprint` and restores the exact theme
on `afterprint`, with every outside rule conditioned on `body:has(.so-root)`;
each section's "Include when printing" box starts ticked and is never stored.
Also: `studentEmailParam` replaces a double decode that answered 500 on
`a%25zz` in the read-only notebook student page, and `captureMeta` swaps any path
segment holding `@` or `%40` for `:student`, so a filed report no longer carries
a student's address. CLAUDE.md gained "ONE STUDENT'S PAGE".

**The fixer pass.** The At a glance tiles had no print binding, so a cleared
section left its figure on the paper. Each tile now follows its section through a
`data-tile` hook (working time follows Assignments, whose note its sub-line
points at), and the row is left off when every governing box is cleared. The
print check was first vacuous (no hooks read as "0 printed") and now requires
each tile present before counting its absence. Also: the narrow notebook-entries
rung runs on `42703` only, so a timeout reads "not known" rather than a streak
counting binned entries (mutation-proven); the hall-pass sentence names the
subset when fewer than the total are held; an `approved` song reads "approved";
the print body is `background: none` (Space White's `--bg0` prints grey); and
`.tour-offer`, `.install-prompt` and `.pwp-overlay` joined the print-hide list.

**Measured.**

- 1440: document 2317px, 7 tiles on 1 row, the table 1326px with 0 overflow,
  panels in 2 columns of 682px. 375: 5776px, tiles in 4 rows, rows stacked as
  labelled blocks, 1 column of 343px. 0px scroll at both.
- Every contrast at or above 4.5:1; lowest 4.69 (Space White status and roster
  chips) and 5.05 (Space White links); IDEA chips 5.69 and figures 15.42, Matrix
  chips 5.74 and late word 5.41. Every control 44px or more (Print 56.6x44, the
  print boxes 165.4x44). People: 25 links for 25 students, 0 on the manager row,
  89.1x44, 11 of 11 hit points on the link, 7.35:1.
- Print from each theme: Space White during print, 0 boxes outside the page, ink
  6.21 to 18.78:1, 3 Letter pages, the theme restored exactly, 0 classmates in the
  text. After the fix, clearing Coins and Hall passes prints 0 of 1 tile each
  while 4 of 4 Assignments tiles print, and 3 pages become 2.
- 9 of 9 permissive mutations caught at build, files restored and md5-checked.

**Not verified.** A real signed-in manager against a real database. Chrome's
own Ctrl+P (the script dispatches the print events itself). Safari and Firefox
print. Production data shapes for `foundry_list_apps`, the IdeaCAD ladder and
`readWorksheetCompletions`. Whether other root-mounted boxes print on the real
route; the three hide selectors are reasoned, not measured.

**Deferred.** A GradingConsole link and `?student=` selection. Whether the
student's own streak should also count turned-in entries only (a decision). A
GAUNTLET line. `legacyStudentTarget` in `src/lib/notebook/legacy-routes.ts` still
decodes twice. A hall-pass override label that can print a teacher's address,
flagged for decision 54. Check-in cells read amber for Late, Missing and Flagged
because `--nb-cell-*` lives only on `.nb-root`. Every other per-student telemetry
table stays off the page, each its own disclosure decision.

### 6. The projector follows a theme change and can show a clock face (R06, R08)

**Theme follow (R06).** The theme was read from localStorage once, at module
evaluation, and the projector is a second window with no switch that a deploy
never reloads (`PROJECTOR_ROUTES`), so a later change never reached it.
`themeFromStorageEvent(key, newValue)` in `$lib/theme.ts` is pure (a removal, a
`clear()` or an unknown id reads as the default); `adoptSiteTheme(next)` moves
the state and NEVER writes storage, because a follower that repaired an unknown
id would fight another build's tab over the key; one `$effect` in `ThemeRoot`
listens for `storage` keyed on `e.key` alone (reading localStorage in the handler
throws where site data is blocked). The session gate and Space White's scope
still decide what paints. Carrying the theme in the projector frame was
rejected: a second writer of `data-theme` fixing one window.

**Clock face (R08).** `WallClock.svelte` draws an analog dial on the wall's own
`PlateRing` (its track flattened to one bezel tone) in existing tokens: 12
indices, hour, minute and second hands over `--plate-ring-band` halos, a bloom on
the hour and minute hands on dark themes, and the digits under it keeping the
wall's one `projector-clock`. `clockHandAngles` (`wall-clock.ts`) reads a new
`schoolClockParts` in school-calendar.ts; the hour and minute hands step once a
minute and sweep in once under `no-preference` (transform only, the resting angle
an SVG attribute on an outer group); under `reduce` there is no sweep and no
second hand, and no hand has a CSS transition. It has its own `--lp-dial`, is the
hero only while no timer is up, and is off by default. The frame's tenth key is
`clockFace` (`digits` or `dial`, anything else reading `digits`), with
`PROJECTOR_FRAME_VERSION` still 1. A fourth 44px "Clock face" key sits in the On
the wall row, with a line saying why a running timer keeps the hero. The choice
is `display.wallClock` per device with a manager-only "Projector clock" Settings
row, so the Display group's Reset never acts on an invisible field.
`/dev/classroom-projector` gained `?session=1`, `?face=dial`, `?demo=bare` and a
`data-projector-hydrated` marker (the first run lost a write to a pre-hydration
race); `tools/browser-verify/_theme-follow.mjs` drives four pages of one context.

**Measured.** At 1440x900 the dial is 639x639 with 50.4px digits, columns 652.9
and 660.1px, no scroll; bare, one 1353.6px column. At 375x780 the dial is 303x303
with 54.6px digits. Face off is unchanged (hero clock 203.0px and 105.75px). Hand
inks: IDEA hands 8.53:1, second 6.27, halo 10.31; Matrix 9.33, 7.66, 12.12; Space
White washed under `PROJECTOR_MODEL` 5.78, 3.43, 3.85. A light hand on a light
glow segment is 1.13 (IDEA) and 1.03 (Matrix), which is why the halo exists;
`--plate-ring-ticks` as an index would be 1.58 washed on Space White, the token
test's negative control. Every sampled frame of the arrival passes through the
dial centre and ends on the identity matrix. Theme follow latency is at most
102ms over 4 pages, the projector 9 to 66ms. Two mutants killed (the listener
removed; `adoptSiteTheme` writing storage), restored and md5-checked.

**Not verified.** WebKit and a real second monitor (the windows were pages of one
Chromium context; the real `window.open` popup was not driven). Reduce motion
beyond the motion check and a source test. Repaint cost on an old desktop; the
bloom was judged by eye. With site data blocked nothing follows. The signed-in
projector route.

**Deferred.** Frame cost with the dial up. A face in the class's voted look.
Larger digits on a bare wall. A projector window open during the deploy keeps
its old code and must be reopened once.

### 7. Dictation keeps listening and punctuates at sentence ends (R14)

**What changed** (decision 51: the browser's own speech service, nothing
stored).

- **Text.** `appendDictation` appends a chunk OPEN (never a period), drops
  standalone fillers (um, umm, uh, uhh, erm) and writes spoken punctuation as
  marks (comma, colon, semicolon, full stop, question mark, exclamation point or
  mark, new line, new paragraph). "Period" counts only as the last word and never
  after an ordinal, a number or a class-period word; "next line" is not a mark.
  `DictationJoin` is the one closer, adding a period only to text it wrote, when
  `continuesSentence` judges the next chunk a new sentence (words first, then a
  pause past `DICTATION_SENTENCE_PAUSE_MS` = 1000ms measured from the previous
  phrase's last interim, since the final arrives late) or when the session ends.
  This retires R03's period per final: the round's own export had 48 sentence
  breaks, at least 6 after a word that cannot end a sentence, and 9 filler
  tokens.
- **The driver.** `Dictation` gains an `options` argument, all off by default,
  so the palette's Speak is byte-for-byte unchanged. With keepAlive an
  unrequested end opens a fresh recogniser in the same session, never after a
  refused microphone, an `aborted` it did not cause, in a hidden tab, past
  `DICTATION_MAX_QUICK_RESTARTS` = 3 (the fourth quick end fails: exactly 4
  recognisers) or past `DICTATION_IDLE_MS` (60s) of silence. `listening` stays
  true across the gap so a STOP there is not lost.
- **Meter and ghost.** `mic-level.ts` opens once per session only when the
  permission already reads granted, stops every track on close and swallows
  every failure, in its own module so `dictation.ts` keeps its no-capture sweep;
  `DictationLevel.svelte` moves 5 bars by transform only under `no-preference`.
  `DictationGhost.svelte` is an `aria-hidden` mirror over the untouched textarea
  drawing `DictationJoin.preview`'s suffix in grey; a guess past the last line
  pins the field's height and pads its bottom by exactly those lines so both
  scroll as one. A transparent field was rejected because plate.css owns the
  plated textarea ground.
- **The report box.** Keep-alive and the meter on a fine pointer only; on a
  phone it ends at a pause and says "Paused. Press DICTATE to keep going.".
  Escape or a shade click while dictating only stops; a second Escape closes.
  SEND waits for the sentence in flight (FINISHING, `DICTATION_STOP_GRACE_MS` =
  1500ms). Ctrl or Cmd+Shift+Space toggles, printed with `aria-keyshortcuts`.
- **The grading console.** `GradingDictation` takes targets `{key, read,
  write}` with a `DictationJoin` per field and gains `settle()`, `stopField()`,
  `preview()` and `level`. The console settles before switching student, saving
  and returning; Escape stops dictation first, even from inside the field; a
  report box over the console owns every key (before, Escape in the box also
  closed the student); a D key in `GRADE_KEYS` dictates the comment; a
  `DictateButton` whose field unmounts stops its own session.

**The fixer pass.** "Discard and switch" called `applySelect`, the only writer
of the open student, with no dictation wait, so a session started while the
unsaved bar was up survived the switch and wrote its sentence into the next
student's comment. Now `applySelect` calls a new `GradingDictation.drop()`
(target cleared first, recogniser aborted, waiters released) when a session is
open, making the guarantee a property of the one writer; it also covers a session
started during `saveThenSwitch`'s save, which does not set `busy`. Discard drops
rather than settles, because it throws the old student's work away and a settle
could queue a second switch on a double press. Also: the D key asks the comment
DICTATE's own conditions; Escape calls a new `stop()` that empties a queued field
and yields to an open `<dialog>`; `MicLevel` holds the stream before awaiting
`AudioContext.resume()`; `DICTATION_LEVEL_NOTE` reads 'Any sound level shown
beside STOP is measured on this device and goes nowhere.'

**Measured** (375 and 1440). The mirror within 0.5px of the field with equal
metrics on the report box, the comment and a criterion note; the guess not in the
value. Guess ink 5.51:1 unplated; plated 6.82 (IDEA), 7.29 (Matrix), 7.76 (Space
White), worst over 3 grounds each, by `orderResult` compositing probes; STOP
11.34:1, status 6.91. DICTATE 109.8x44, STOP 107.3x44, grading STOP 63.1x44.
Motion gated (8 swept, 1 animated, 0 unsettled under reduce). Scripted specs: a
kept-alive session ran 2 recognisers without releasing the control; a 2.9s gap
closed a sentence and 0.3s carried on; the first Escape kept the box; a grading
switch stayed on the first student with the sentence written and nothing
listening. Build: 18 runs, 246 measurements, only placeholders (since filled) and
font-403 rows out. Fix: 290 tests passed, 4 of 4 mutants killed, the speech-hold
specs unchanged (68 measurements).

**Not verified.** Nothing about real speech, microphones or phones: the 1000ms
threshold, Chrome's auto-stop, words lost in a restart gap, the meter beside a
live recogniser, Android chimes, iOS restarts. GREENLINE, which now gets
keep-alive, the ghost and the meter, was not opened. Discard with a live session
was proven in happy-dom and by mutation only. Owed checks by Mr. Pina: two
minutes on Chrome for Windows with ten-second pauses, SEND mid-sentence, Escape,
a grading switch mid-sentence, one sentence on a phone.

**Deferred.** A regional recogniser language (it would move the palette's).
A server transcription model (Mr. Pina's privacy and cost call). D listed on a
browser with no speech service. A typed report lost on a plain CANCEL. The
grading pagehide net cannot wait for a sentence.

### 8. Ported HTML worksheets: Download works and pictures sit in their box (R03, R07)

**What changed** (decision 53; a session took over from a cut-off builder and
re-checked its commits with 28 test files and 8 mutants).

- **Downloads (R07).** `HX_SANDBOX_FLAGS` in
  `src/lib/classroom/html-assignment/bridge.ts` gains `allow-downloads`; the one
  constant feeds the iframe attribute and the `/hx/` CSP `sandbox` directive, so
  every deployed document's Download works with no re-upload, and the ETag folds
  the CSP so cached documents revalidate once. `allow-same-origin`,
  `allow-top-navigation`, `allow-forms` and `allow-modals` stay refused. The
  cost, written in four places: a document can now put a file on a viewer's disk
  WITHOUT A CLICK; the mitigation is admin-only import, and the fallback if it is
  withdrawn is an `idea:download {field}` message.
- **Pictures in place (R03).** A new message `idea:image-box {field,
  rect|null, clipTop}` is judged by `hxReceive` (field shape, the parent's map,
  then `hxBoxOf`, extracted from the video branch so there is one rectangle
  rule). The parent draws the stored picture over the frame at that box in parent
  chrome (`.hx-image-over`); no bytes go down and the CSP does not move; a null
  rect withdraws it. `hxImagePlacement(images, boxes)` puts every picture in
  exactly one of `{over, under}` (unit-tested and mutation-proved). An advisory
  `idea:image-box-state` goes back, kept against the review's suggestion to drop
  it; a document must never wait on it.
- **Viewing and saving.** Every picture opens in one `Lightbox`
  (`hx-lightbox`); the list under the frame wraps thumbnails in Enlarge and gives
  every row a worded 44px Download; a non-picture by `isImageFilename` (an
  `.SLDPRT`) becomes a file row or tile with a Download, never an `<img>`.
  `HtmlAnswerList` adds Enlarge, Download and its own Lightbox.
- **Harnesses and docs.** A dev fixture `/hx/photo`, `?doc=photo` and
  `?state=boxed` and `?state=boxed-file` states, and two instruments
  (`_hx-downloads.mjs`, `_hx-photo-box.mjs`). The SPEC goes to 1.6 (new 5.7 with
  both download tables, 5.2's missing `font-src data:` line, a stale section 7
  bullet) and the AUTHORING guide to 1.16 (new 10b, a copy-paste box reporter).

A live document shows pictures inside only after it is re-uploaded with the 10b
reporter, block ids unchanged; until then they stay in the improved list.

**Measured** (Chromium 141). 6 clicked controls and 4 no-click cases each gave 0
downloads without the flag and 1 with it; the fixture's own Download through the
real `/hx` route gave 1 and 0. The asked box (45,433,280,210 at 375 and
45,433,320,240 at 1440) was drawn to within 0.5px, the document heard
shown=true, Hide and Show round-tripped, and the rectangle held after the
console's scroller moved 300px. The picture button 248x186 and 320x240, Enlarge
17.18:1, the file tile's Download 91.8x44 at 15.42:1, list thumbnails 96x96, 0px
overflow, centre hit tests landing on the targets. The route set (20 specs at 2
widths): 614 measurements, 61 out, 40 of them font-403 rows and 21 reproducing
identically on a `git archive` of base `5d9e2fae`.

**Not verified.** Firefox and Safari. Chrome's prompt on a second automatic
download, and a real popup blocker (the instrument disables it). Production,
the live documents and the real storage proxy. Space White, the projector model
and compact density.

**Deferred.** Re-uploading each live document with the 10b reporter, starting
with IDEA209H item 1e1e0d66 and IDEA 100 item b0c93484. Rewriting the
project-knowledge copies of the SPEC and AUTHORING guide from HEAD. Whether
`HtmlQaPanel` should offer Download (it stays text-only).

### 9. The home page on Space White, and Portal updates redrawn (R12, R19)

**What changed** (decision 55).

1. **No particles on Space White**, reversing Mr. Pina's 2026-09-29 answer: the
   canvas is `display:none` as on Matrix (a rule in app.css), and the frame loop
   stops while the canvas has no box (`data-particles="paused"`), restarted by the
   existing theme watch, saving a 60Hz `offsetWidth` poll. IDEA is unchanged.
2. **One green ink on the Space White launcher.** Every card's title, glyph and
   call to action take `--acc: var(--green)`, the edge `--plate-hair`, and the 2px
   strip the card's own light twin, solid. CLAUDE.md's "if a colour cannot clear
   while staying recognisable, say so and stop" and decision 40 item 1 decided it:
   the Coin Ledger's twin landed on olive (#587000), the Foundry's on brown
   (#a15607), and the FRC title wore the error red. Identity pairs and the dark
   themes are untouched; CLAUDE.md was edited in place in seven bullets.
3. **Hero and tags.** Hero values take `--text-1`, scoped
   `.hero:not(.console-hero)` so `/dashboard` is not reached; the Updated flag is
   `--cyan` at (0,3,0) through `:where` so the plate's tag keeps its material; the
   gold Visual-tag rule is gone.
4. **Section labels are plate captions in every theme** (Apps, Your classes,
   Portal updates), and the old `// PORTAL UPDATES` divider is a labelled region.
5. **Portal updates (R19).** The overflow came from `.cl-tags { flex-shrink: 0
   }` beside a 200px note floor. Rows are a `7.25rem | minmax(0,1fr)` grid with
   tags under the sentence, one column under the panel's 34rem container query;
   every word is at the 11px plate floor; tags are recessed with a lamp for
   feature, fix and visual; the month heading is a sticky caption; the controls
   are 44px, Clear wearing `.changelog-toggle cl-clear tap-44` after the
   `.cl-more` precedent; the arrow rotation is motion-gated. Every spec hook and
   the lazy `import('virtual:site-changelog')` are unchanged.

**Measured** (fallback fonts). Changelog overflow in IDEA: 753, 202 and 60px at
375, 958 and 1440 before; 0px after in all three themes. Tags past the panel
edge 384, 15 and 6 before, 0 after; tags were 8.8px and 10 labels under 11px,
now 0. Toggle 28 to 44px, selects 25.6 to 44px, date fields 26.1 to 44px. The
grid: one 309px column at 375, 116 | 708px at 958, 116 | 850px at 1440, the
container query firing at 375 and not at 958, after a negative control on the
unfixed tree. Space White launcher: one ink rgb(59,108,54) at 5.87:1 (4.70
washed), one edge rgb(117,124,134), 0 gradient strips; hero values 14.99:1,
captions 5.42, changelog date 5.05 (4.06 washed). IDEA unchanged (FRC title 5.04,
hero values 7.04). Particles on Space White: 0 painted pixels 600ms after a
clear, the loop paused, the IDEA control repainting.

**Not verified.** Real fonts, reduced motion, Chrome 154, Safari, the classroom
fingerprint under Space White, a signed-in production session.

**Deferred.** `/dashboard`'s inline `style="color:var(--gold)"` hero values are
brown on Space White and beat any theme rule. No strip on Space White, if olive
and brown still read off. The four-line compact hero title at 958. The changelog
toggle's move to `$lib/Disclosure.svelte`. `LAUNCHER_CARDS` in
`tools/browser-verify/routes/_theme-shared.mjs` still says 13 while the launcher
renders 14.

### 10. Foundry major releases (R10)

**What changed** (decision 56). 0233 part `foundry-major` adds
`student_apps.major_release_at` and `major_release_by` (a uuid on `auth.users`,
`on delete set null`, with a guarded check that the actor never exists without
the stamp). `foundry_list_apps` is dropped at its unchanged `(uuid, boolean,
boolean)` arguments and re-created from 0173's text, and `foundry_get_app` takes
0173's text with one key; both were patched by a script rather than retyped, and
a diff showed only the inserted lines and the dollar tags.
`foundry_set_app_major(uuid, boolean)` is the one writer: `is_admin()`, no
identity parameter, idempotent both ways (`changed: false`), refusals
`not_found`, `hidden` and `not_published` (unmarking always allowed; hiding keeps
the flag), and it NEVER moves `updated_at`, because curation is not an edit and
Recently updated reads that column. No function projects the actor, a uuid
because `student_apps` has a table-wide select grant (as
`student_app_versions.reviewed_by` already is).

Client: `src/lib/foundry/major.ts` holds the predicates, sentences and the house
releases from `PORTAL_APPS`. `FoundryMajorMark` is the one mark, a violet star
and the word, pinned on a cover and `--violet-ink` in a page, never gold (gold
sits inside `FOUNDRY_HEAT_HUE_BAND`). `FoundryHouseCard` draws IDEA GREENLINE and
IDEA VANGUARD as "IDEA original" link cards, outside sort, search and counts.
`FoundryGallery` gains a "Major releases" section, the same multicol mosaic under
its own class `fdy-gal-major-grid` (so `.fdy-gal-mosaic` still means the full
list), its cards `ordered.filter(isMajorRelease)` then the house cards, so the one
sort control orders both; it renders only with a card, a non-empty gallery and no
search. Decision 39 is narrowed, not reversed: the full list under "All apps"
still holds every app, badged. `foundryMosaicStyle` moved to mosaic.ts
byte-identical (golden for 0 to 12 cards). `FoundryInspector` offers the control
only with `setMajor` and a payload carrying the key, and says "It was already a
major release." for `changed: false`. No notification: the owner sees the mark.

**The fixer pass.** The inspector's reset effects read `app.id` and
`version.id`, which subscribes them to the props, and every write on
`/foundry/review` ends in `invalidateAll()` (twice), handing over a new object
with the same id after the acknowledgement was set. That wiped "Marked as a major
release" and the "Saved at" note, closed an open source file and discarded a
half-typed review note. Both effects now return early on the same id, held in a
plain variable (`editsFor`, `filesFor`). The harness had missed it because it had
no `onDecided`; it now re-reads into fresh objects on `onDecided` and the spec
checks a count of 3. The acknowledgement is an always-mounted `role=status`
region; `FoundryHouseCard` takes its mark from a `Record` over the house ids; the
house focus ring is `:focus-visible` only. CLAUDE.md's refresh trap was extended
in place.

**Measured** (fallback fonts). With majors, the section's 4 cards in 1, 2 and 4
columns at 375, 958 and 1440, gaps 12.0, 12.0 and 0.0px, empty strip 0.0px; the
full list's 9 cards in 1, 3 and 5 columns, identical to the list without majors;
section to the All apps rule 28.0px, heading to first card 16.0px; 0 sideways
scrollers; the section follows the sort control. Badge word 13.62:1 and star 5.51
over a pure-white picture, the same on dark and Space White because pinned; house
title 6.30, kicker 13.48; headings 15.14 dark and 14.59 Space White; the
acknowledgement 6.87 and 7.98. House cards 343x228.7, 457x304.7, 314.5x209.7.
Remove 222.4x44.0, hit-testing to itself. Against the pre-fix component the spec
read "after 1 re-read(s), acknowledged: NOTHING"; fixed, both major specs pass
(98 measurements, 4 out, all font-403) and the DOM regression is red 5 of 5 on
the old component.

**Not verified.** The signed-in `/foundry` routes, production data (whether
uploaded copies of GREENLINE or VANGUARD exist), Matrix with a marked app,
WebKit, reduced motion, `FoundryMine`'s mark in a harness, a screen reader on the
status region.

**Deferred.** Mr. Pina marks the games he means after 0233 applies; if Foundry
copies of GREENLINE or VANGUARD exist they would appear twice, and dropping the
`houseReleases` prop is the one-line answer.

### 11. VANGUARD build 215: the death screen says what carries over (R05)

**What changed** (decision 57). A student reported coins and builds lost on
death, which is by design: a run's i¢ and REFIT purchases live on the per-run
`player` that `startGame` rebuilds; the STARTING BUILD (a fixed 1000 i¢ budget)
is saved to `vanguard_build`, and nothing on the death path writes it; VANGUARD
never touches the real coin ledger. The gap was copy, and the one sentence that
ever explained it sits on a HOW TO PLAY page `openTut` has no caller for. Build
215 in `src/lib/legacy/vanguard/index.html`, five exact-string insertions and
three deletions:

- MISSION END gains `#goCarry`: "i¢ AND REFIT UPGRADES LAST ONE RUN. YOUR
  STARTING BUILD STAYS SAVED.", in the staged reveal with no new keyframe ("FOR
  THE NEXT ONE" was dropped because co-op reuses the overlay and runs
  `freshBuild()`).
- The calibration IDEA COIN step adds "It lasts one run." (still 2 canvas
  lines).
- `endRun` restores the FELLED BY row that co-op `showEnd` hides.
- `VERSION` 214 to 215 with its CHANGELOG entry.

`docs/VANGUARD_BACKLOG.md` records the build, the silent over-budget reset and
the unreachable HOW TO PLAY pages, and marks a stale changelog note superseded.
No classroom-updates entry: the in-game changelog is the student-facing record.

**Measured** on the real `/vanguard/` route, signed out, Chromium 141, 1440x900
and 375x812, the baseline taken before any edit. A two-upgrade build read 2
upgrades, 800 spent and 200 i¢ carried in after a reload, at MISSION END and after a reload
following the death, on 214 and 215, `vanguard_build` unchanged; run coins did
not carry. `#goCarry` is 320px wide, 2 lines, 28.8px tall, contrast min 6.09 and
median 13.8:1 at 1440, 6.02 and 13.49 at 375. At 1440 the overlay does not scroll
(SUBMIT's bottom 587.5 to 620.9 of 900); at 375 it already scrolled on 214 and
SUBMIT moved 580 to 646.8, still inside the visible bottom of 656. A planted
hidden FELLED BY row was 0x0 on 214 and 121.8x10 on 215. No horizontal scroll.

**Not verified.** The signed-in cloud path (read from `mergeBuild` and
`applyCloud`, which keep the newer `_bts`), Chrome 154, a phone, co-op in a
browser, reduced motion.

**Deferred.** The day an outfit price RISES, the same build must ship a notice
and a `refreshBuildSummary()` call, or the title lists a wiped build and this
report comes back. Banking i¢ across runs, and the step's name IDEA COIN, are Mr.
Pina's calls.

### The round as a whole

**One migration, six parts.** `0233_feedback_round_and_armory_v3.sql` is one
additive file in the contract's order (`armory-reports`, `armory-core`,
`feedback-edits`, `student-overview`, `quick-posts`, `foundry-major`), each part
between `PART <name> BEGIN` and `END` markers with its own self-check by name.
Its first object, `armory_app_feedback`, is a table no earlier migration made,
so the deploy probe derives 0233's applied state from a fresh object.
`.github/workflows/migrate.yml` applies it on the push to `main`, and every
client surface that reads a new column or RPC degrades on `PGRST202`, `42883` or
`42703` until it lands, so the migration and the Vercel deploy may arrive in
either order. What undoes each part is stated in its own header (by hand, only
before a client depends on it); a purge itself cannot be undone.

`tests/db/migration-0233-apply.test.ts`, over `tests/db/chain-0233.ts`, tests
the file as a file: the paste trap (no dollar sign in a comment across the six
assembled parts), `scanFile` over the whole file (no top-level DML or
destructive DDL), the assembly (every part once, in order, the first object a
new table), the anon surface not growing with client table privileges growing by
exactly the two Armory report tables, and a second paste changing no catalog
object. The part suites are `tests/db/armory-v3*.test.ts`,
`tests/db/feedback-edit.test.ts`, `tests/db/classroom-student-overview.test.ts`,
`tests/db/classroom-quick-post-files.test.ts` and
`tests/db/foundry-major-release.test.ts`.

**After the apply.** Read `docs/migrations-applied/0233-*.md` and the migrate.yml
summary for whether `armory_change_feed` is in `supabase_realtime`, the Armory
self-checks, and whether the quick-posts storage half applied (if not, re-paste
0233 in the SQL editor to switch quick-post files on).

**Owed on the merged tree.** `npm run verify:counts` and `npm run verify:readme
-- --route <name>` for the new specs, which rewrite README regions and
`tools/browser-verify/measured/*.json` no cluster owned and which were not
written from worktrees where every font failed; `tests/derived-numbers.test.ts`
can read red until they run.

**Not verified, across the round.**

- No session can reach production. Nothing ran against real PostgREST, Supabase
  Realtime, Storage, R2 or a signed-in production page; every database claim is
  the embedded cluster with the real chain, and every page claim a `/dev`
  harness mounting the real component, or for VANGUARD the real public route
  signed out.
- Every worktree's `node_modules` was a symlink outside Vite's allowed roots, so
  `@fontsource` answered 403 and text was measured in the fallback stack; those
  403s are nearly every console-error row in every pass.
- Safari, WebKit, Firefox and real phones were not run (Chromium 141 only, while
  two reports came from Chrome 154).
- The harness runs `prefers-reduced-motion: no-preference`; reduced motion was
  reached only through motion rows and source tests.
- The cluster reports record runs of the test files each touched, not a
  full-suite run.
