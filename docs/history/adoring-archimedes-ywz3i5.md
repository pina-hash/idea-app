---
title: "IDEA Armory website follow-ups for the Windows app 0.3.0 and 0.3.1: a three-minute presence window and offline-soon read at once, the app version and a Needs the new Armory link, Delete forever says files are moved on each computer as it next connects, the app feedback tabs explain linked notes, and migration `0234` adds `armory_break_locks`, Force check in for up to 500 files in one call; then for 0.3.2 the connect page names who is connecting with Not you? Use another account, and migration `0235` gives the app's Send feedback what the website's form has"
date: 2026-10-08
branches: [claude/adoring-archimedes-ywz3i5]
migrations: ["0234", "0235"]
subsystems: ["IDEA Armory", "Feedback console", "Migrations"]
---

Armory 0.3.0 (pina-hash/idea-armory) shipped the Windows app half of the v0.3 server
contract (0233). Part one is the website's catch-up to it and needed no migration; part two
(below) is migration 0234 for Armory 0.3.1.

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

## Part two: `armory_break_locks` (migration 0234, ledger 0374)

Armory 0.3.1 forces a check in of many files with one `armory_break_lock` per file, 16 at
a time. Check out all and Check in all already had batches (0233). 0234 adds the third:
`armory_break_locks(p_files uuid[], p_device uuid, p_operation uuid) returns jsonb`.

### Load-bearing decisions

- **The batch calls `armory_break_lock` itself for every file**, under
  `armory_derived_operation(p_operation, 'break:' || file)`, exactly as 0233's
  `armory_release_locks` calls `armory_release_lock`. So the role rule, the `lock_broken`
  payload, the refusal text and SQLSTATE, and taking the project row first are that
  function's, with no second copy to drift. The per-file exception block is what keeps
  one refusal from stopping the rest, and its savepoint releases what a refused file's
  call locked.
- **A null device is allowed and a named one is checked once for the whole call**:
  `armory_break_lock` allows null (the website has no computer), and
  `armory_release_locks` checks a device up front rather than once per file.
- **No defaults, one overload, granted to `authenticated` only**, revoked from `public`,
  `anon` and `authenticated` by name first (the 0166 shape). The file's self-check
  raises if anon can call it.
- **Nothing else changes.** No existing function is replaced, so the 0233 corpus answers
  stay byte-identical and there is no deploy ordering: the app falls back on `PGRST202`.

### The site's bulk controls and Realtime (items 2 and 3)

Checked, and nothing needed changing. The website has no bulk file action: Force check
in is one file at a time (Files and Checked out views), and folder rename, folder delete
and purge-folder are the Windows app's. The one multi-item loop on the site is adding
several people from the Team view (`addPeople`), which already holds the reload and
reloads once at the end. The project page's Realtime listener already folds a burst into
one reload (`changeCoalescer`, 1 s after the last event, never more than 5 s after the
first; report of 2026-10-07), so a 500-file batch is one reload, not 500.

### Measured

`tests/db/armory-break-locks.test.ts`, 16 tests on the chain through 0233 with data
seeded through the real 0231 to 0233 RPCs and 0234 applied on top: success with the
exact `lock_broken` payloads, mixed results (held, free, another project, an unknown id),
per-file parity with `armory_break_lock`, the count limit (0, nulls only, 501, and 500 as
the control), replay, a reused and a null operation id, a student, a student without a
device and an outsider refused per file with nothing broken, a site admin in no project
and a mentor allowed, anon refused, the apply scan, the paste trap and a clean re-paste.
Mutation proof on the migration, each against that one file (14 tests at the time; the
null-operation and unknown-id-for-an-admin cases came after), judged by the summary line:
granting anon (the file's own self-check refused the apply), replacing the per-file call
with a bare update (6 failed), reporting a refusal as a success (3), dropping the replay
(1), and letting one refusal abort the call (4). Restored md5-identical.

### Not verified

0234 is not applied to production from this session: no session holds
`IDEA_MIGRATION_URL`. `migrate.yml` applies it on the push that lands it on `main`. A
concurrent batch-versus-batch or batch-versus-folder-rename race was not driven; the
order argument rests on each file going through `armory_break_lock` in id order, the
same shape as 0233's other two batches.

## Part three: Armory 0.3.2 (migration 0235, ledger 0375)

Items 1 to 3 of the 0.3.2 request repeat the 0.3.1 ones and are 0234.

- **The connect page names the person.** `ArmoryConnect` asks "Connect <device> as
  <name>?", shows the address under it, and offers "Not you? Use another account"
  (an `onSwitch` transport; absent, no control), which the route wires to
  `signOutEverywhere` then `armorySignIn`, back to the same connect address. No protocol
  change.
- **0235: the app's note gets what the website's form has.** `praise`, `tried` (1000),
  `area` (120, the app's stand-in for the page the website captures by itself), and a
  PNG screenshot of the app window, 2 MiB, in a new private bucket keyed
  `<auth uid>/<uuid>.png`. The wide eight-argument submit has no defaults; the
  five-argument form became a wrapper that refuses `praise` with its own 0233 text, so a
  0.3.x app's answers are unchanged (a ten-case corpus put to the deployed body and
  again after, compared case for case). `armory_my_app_feedback` lists the caller's own
  notes with status (spam reads `closed`); the website has no such list and no replies,
  and replies are left to Mr. Pina. The console shows the three new fields and opens a
  screenshot through a five-minute signed link.
- **Measured.** `tests/db/armory-app-feedback-v2.test.ts`, 13 tests. Mutation proof, each
  against that file: any folder accepted (1 failed), everyone's notes in "Your feedback"
  (1), a default on the wide form (the file's own self-check refused the apply), the old
  form taking praise (1), spam shown (1), any bucket accepted (1). Restored md5-identical.
  Browser pass on the Armory and feedback harnesses: 746 measurements, 0 outside, the
  switch key 264.8x44.
- **Not verified.** A real Google round trip through "Use another account" (no session
  here holds a Google account), the signed screenshot link against real Storage, and
  Storage's own enforcement of the 2 MiB and PNG limits, which the test fixture does not
  model.
