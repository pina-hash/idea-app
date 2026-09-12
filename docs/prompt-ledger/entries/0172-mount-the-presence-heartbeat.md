# 0172 Mount the presence heartbeat: nothing writes a presence row in production

- Issued: 2026-09-12
- By: router chat
- Owns: the presence region of
  `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` AND NOTHING ELSE IN
  THAT FILE, `tests/dom/presence-heartbeat-mount*`, `tests/dom/presence-console-mount*`,
  `tools/browser-verify/routes/presence*.mjs`, `docs/prompt-ledger/entries/0172-*`, and
  its own `docs/history/` entry. NO MIGRATION.
- Migration permitted: no. Claims: none. `0200` is applied and
  `src/lib/classroom/presence/**` is on `main`.
- Status: issued
- Branch: `claude/epic-mayer-48zzho`, branched from `origin/integration` at `3728698`
- Runs in parallel with: ledger 0171, which owns the IDEACAD region of the SAME route
  file. The presence region is this bundle's and nothing of theirs is touched.
- Notes: **LEDGER 0152 BUILT THE WHOLE PRESENCE SYSTEM AND DELIBERATELY LEFT ONE WIRE
  UNMADE.** `PresenceHeartbeat` is not mounted on the student's item page, so nothing
  writes a `classroom_presence` row in production today: the migration, both RPCs, the
  retention, the pure modules, the instructor surface and the component itself are all
  built and proved, and the console reads an empty table. 0152's own history entry names
  the file and the expression verbatim and says why it could not make the edit -- ledgers
  0147 through 0151 held that file in parallel.

  **DO NOT ADD A CLIENT THROTTLE.** `_classroom_presence_min_gap()` is 20 seconds and
  the component beats at 30, so the client is already the wider of the two. Confirm by
  reading, then MEASURE the client write rate. 0152 measured the database half at 100
  beats to 1 write; the client half has never been measured.

  **A STUDENT MUST NEVER SEE ANOTHER STUDENT'S PRESENCE.** 0152 proved that at the
  database with a signed-in peer control. The client half is proved separately here, with
  a control that would redden.

  **AND THIS BUNDLE OWES THE `classroom-updates.json` ENTRY** 0152 deliberately did not
  write: the moment the heartbeat mounts is the moment students start being measured.

## Outcome

Written at the end of the session; see `docs/history/epic-mayer-48zzho.md`.
