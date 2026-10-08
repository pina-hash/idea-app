---
title: "IDEA Armory website follow-ups for the Windows app 0.3.0: a three-minute presence window and offline-soon read at once, the app version and a Needs the new Armory link on the Team view, Delete forever says files are moved on each computer as it next connects, the app feedback tabs explain linked notes, and docs/ARMORY.md brought up to date"
date: 2026-10-08
branches: [claude/adoring-archimedes-ywz3i5]
migrations: []
subsystems: ["IDEA Armory", "Feedback console"]
---

Armory 0.3.0 (pina-hash/idea-armory) shipped the Windows app half of the v0.3 server
contract (0233). This bundle is the website's catch-up to it. No migration.

## What changed

- **Presence window.** `ARMORY_ONLINE_MS` in `src/lib/armory/team.ts` was 120 seconds and
  is now 180. The app beats every 45 seconds; the Team view re-reads the team every
  `ARMORY_TEAM_POLL_MS` (60 s, plus or minus 20% jitter), so a healthy computer can show
  45 + 72 = 117 seconds just before a read. Two minutes left three seconds of slack and
  flickered to "Last heard from" on one dropped beat or one late read. Three minutes
  holds through one missed beat plus one late read (162 s). The test asserts the window
  is at least two minutes and at least that sum, and sweeps the ages in between.
- **offline-soon** now reads "Last heard from <time>" at once (it read "Armory open,
  closing" for the rest of the window). `deviceStateWords` no longer maps it.
- **App version and the tag.** Each computer shows its version quietly
  (`.ar-presence-version`, the line's secondary ink). `needsNewArmory` tags a computer
  whose version is empty or older than `ARMORY_HEARTBEAT_VERSION` (0.3.0) with a "Needs
  the new Armory" link to `/armory/download`, 44px tall. A version string this build
  cannot read is not tagged (an instrument that cannot tell says nothing); a 0.3.0
  pre-release counts as 0.3.0.
- **Delete forever wording.** The project confirm now opens "On the Armory server, this
  deletes ..." and carries `PURGE_COMPUTERS_WORDS` below the cost; the note on `/armory`
  after a delete carries `PURGED_COMPUTERS_WORDS`. Both say files are moved into the
  app's hidden recovery folder as each computer next connects, an open file once it is
  closed, and never that anything is instant or erased. The website has no folder Delete
  forever dialog (that confirm is the Windows app's); a purged folder appears on the
  website only as an activity line, which was left as it was.
- **Admin feedback tabs.** `ARMORY_REPORT_LINK_HELP` on both Armory tabs, and
  `ARMORY_INCIDENT_WAVE_NOTE` on the incidents tab.
- **docs/ARMORY.md.** Status line, item 1, item 3 (computers move files), item 5 (the
  window, the tag, and the 40 versus 64 character `app_version` mismatch with a proposed
  fix for the next migration, not written), and "What the Windows app must do" marked
  done in 0.3.0.

## Checked, not changed

- `/armory/download` reads `releases/latest` on GitHub (public first, then the token),
  cached five minutes per instance, never a pinned tag. GitHub's "latest" skips drafts
  and pre-releases, so 0.3.0 is offered once it is published as a full release.
- `docs/migrations-applied/0233-main.md` records the notice
  `armory_change_feed in supabase_realtime: yes, already`.

## Measured

`npm run verify:browser -- --route armory`: 20 route/width runs, 734 measurements, 0
outside threshold, including the tag (2 present, 144.7x44 smallest, 15.64:1), the app
version (7.37:1), the computers sentence (6.47:1), and Sam's offline-soon computer
reading "Last heard from 10:29 AM · Armory 0.3.0". The incidents tab's
filter `order-result` finding reproduces identically at the base commit and is not this
bundle's.

## Not verified

The Windows app's behavior (45-second cadence, the recovery folder, the 0.2.1 report
upload rate) is taken from the request and the 0.3.0 release notes, not observed. What a
0.2.x computer does with a deleted project before it updates was not checked; the
confirm says it catches up once it updates.
