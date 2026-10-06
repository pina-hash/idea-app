---
title: "IDEA Armory v2, the website side (lane W, ledger 0366): migration `0232` (no season, rename, archive, name revival, folder rename and delete, the checkout list), a guided setup at `/armory/start`, one-click download, visible checkouts with Take back, search, filters, activity, my computers, storage, past-version downloads, the launcher card, the site plate, and the profile-menu overlap fixed"
date: 2026-10-06
branches: [claude/confident-einstein-axy6dy]
migrations: ["0232"]
subsystems: ["IDEA Armory", "Migrations", "Launcher", "Site plate"]
---

Mr. Pina tested Armory with students on 2026-10-06 and sent eight items. Lane A
rebuilds the Windows agent in pina-hash/idea-armory against the same contract
(C1 to C8); this is lane W, the ideabosco.com side.

## What changed

- **`supabase/migrations/0232_armory_v2.sql`**, 0231's conventions exactly.
  C1 `armory_projects.season` nullable and `armory_create_project` accepting a
  null on the unchanged signature; `armory_allocate_part_number` (the one reader
  that could not take a null) falls back to the current Los Angeles year. C2
  `armory_rename_project`, C3 `armory_set_project_archived` plus `archived_at`
  and `archived` in `armory_my_projects`. C4 `armory_create_file` revives a
  tombstoned holder of the name: same file id, tombstone row and deleted_at
  cleared, requested folder set, and any checkout left on the removed file
  released (the agent never releases after a tombstone, so without it every
  later save would be a side version), change `file_revived`. A live clash is
  still 23505 through `armory_live_name_taken`, 0231's helper narrowed to live
  rows with the same DETAIL keys. C5 `armory_rename_folder` and C6
  `armory_delete_folder` refuse with 55006 while someone else (another person,
  or the caller on another computer) has a file in them checked out, C5 also
  when the target already holds live files (case ignored, since Windows paths
  are); DETAIL is jsonb `{reason, names (10), total}`. C7
  `armory_project_checkouts`, with `holder_name` (display name, else full name)
  read inside the definer.
- **A 0231 repair rides in it:** `armory_change_feed_cursor_seq` inherited the
  project's default sequence grants, so `tests/grant-surface.test.ts` section D
  and `tests/db/grant-sequence-sweep-control.test.ts` had been red on `main`
  since 0231 (measured on a clean `origin/main` worktree: the same 5 failures).
  Revoked by name, 0203's shape; the sweep's sequence count is 4 now.
- **`/armory/start`**: four steps with live state. A tick only where the site
  can see it: a connected computer ticks download, install and connect (it
  could not exist otherwise), a project ticks the fourth. The page counts the
  caller's own `armory_devices` on the classroom's one poller while none exists
  and reloads when one appears. A mentor (an admin, or a mentor of any project)
  gets create, add people, share the link. `/armory` shows the setup card until
  a computer is connected, then one line.
- **`/armory/get`** is "Get the Windows app": a public release 302s to GitHub's
  own `browser_download_url` (only this repository's release prefix is
  followed), a private one streams with `ARMORY_RELEASES_TOKEN` to a signed-in
  browser, and neither lands on the setup page's flash-drive sentence.
  `x-armory-download` names the branch taken.
- **Projects**: create by name only; rename and archive/restore for mentors,
  each two presses; archived projects under a closed Disclosure.
- **Checkouts**: every row reads "Checked out by <name> on <computer>, since
  <time>" or "Available", as one sentence (the first draft printed "Checked
  out. Checked out by" and "Available. Available."); a panel lists every
  checkout; Checked out and Mine filters and a search; Take back for mentors and
  CAD leads, two presses, warning that unsaved work becomes a side version.
- **Elsewhere on the site**: people by bulk paste, role change, remove, with the
  last-mentor guard said in words; an activity feed in plain words for every
  change kind including the four new ones; My computers; storage used; a
  Download on every version and side version (a signed GET from
  `/armory/<p>/file/<f>/version/<v>`, named after the file).
- **Launcher**: an `armory` card, `ArmoryMark` (IdeaCAD construction, half a
  cycle ending on the rest frame, nothing hidden at rest, only transform and
  opacity animated), the site manifest, the home tour's words. The card
  declares no accent: the room has no colours of its own.
- **Visual standard**: buttons are the shared `.btn` (the plate's keys), inputs
  `.plate-well`, and `.ar-panel`, `.ar-project` and `.ar-chip` joined the
  plate's own lists, room-qualified with `:where(.ar-root)`.
- **The profile dropdown overlap** was CLAUDE.md's masthead trap: `main` and
  `.app-header` both `z-index: 1`, `main` later. `.ar-header` raises the header
  to 2.

## Measured

- DB: `tests/db/armory-v2.test.ts` 35 tests over the whole chain with 0231's own
  RPCs seeding a project, members, devices, files, versions and a removed file
  before 0232 applies. Mutations: no revival (3 red), same-person-other-device
  allowed (4 red), an anon grant (refused at apply by 0232's own self-check).
  File restored md5-identical each time.
- `tools/apply-migration.mjs 0232 --dry-run --ledger 0366`: every check passes
  up to "IDEA_MIGRATION_URL is not set".
- Dropdown hit test (`tools/browser-verify/_armory-v2-shots.mjs`): with the menu
  open over a full project page, 7 of 7 on-screen menu controls answer inside
  the panel at 1440 and 375, IDEA and Space White; with `.ar-header` removed
  (the negative control) 0 of 7.
- `npm run verify:browser -- --route armory`: 176 measurements, 0 outside
  threshold. `_armory-theme-contrast.mjs`: every Armory word at or above 4.5:1
  in IDEA, Matrix and Space White, worst 4.95:1 (Available on Space White).
  Its first draft pre-filled the canvas black and reported 1.12:1 for text the
  screenshots show as plainly readable; the fix reads a cleared canvas.
- Screenshots: `docs/armory/screens/v2/`, 28 states at 1440 and 375 in IDEA and
  Space White plus the open dropdown, 116 files, 0px horizontal scroll on every
  one, each looked at.

## Not verified

- Which download branch production takes. The container cannot reach
  ideabosco.com or api.github.com (both 403 at the proxy). Measured instead:
  pina-hash/idea-armory is public and its v0.1.0 release lists
  `IDEA-Armory-Setup-v0.1.0.exe` at a public download URL, so the public branch
  is expected; `x-armory-download` on `/armory/get` says for certain.
- A live Supabase (realtime, PostgREST's `payload->>device_id` filter), a real
  R2 signed GET honouring `response-content-disposition`, the Windows agent.

## Decisions taken alone

Take back sends the caller's most recently heard-from computer (C8's
`armory_break_lock` needs a registered device; with none the control is absent
and the panel says why). Archive writes `project_archived` and
`project_restored`. 55006 DETAIL is jsonb. The revival releases a leftover
checkout. Bulk add calls `armory_add_member` once per person and keeps what did
not land in the box. Storage counts each stored hash once.
