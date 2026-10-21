---
title: "Ledger 0423: IDEA Armory 0.4.0 -- field fixes from the Oct 8 to Oct 21 notes and incidents, Velopack auto-update, SolidWorks years warned not blocked (migration 0288)"
date: 2026-10-21
branches: [main]
migrations: ["0288"]
subsystems: [Armory, Migrations]
---

A scheduled session (solo, idea-armory with idea-app ledger 0423) read every Armory app note
(16, the whole list back to Oct 8) and every incident report (908, Oct 8 to Oct 21) through the
IDEA Website connector, checked each against idea-armory at 0.3.3 (e8f91d6), and built what was
still broken. **Nothing was pushed: the session's git proxy refused both repositories ("not in
this session's authorized repository set").** The work is committed locally and saved to the
project as patches (claude/armory-0423-patches.md); the next session with push access applies
them and pushes. No engine logs or crash reports were attached to the run, and the connector can
list incidents but cannot read a report's contents, so every cause below comes from the
summaries, the notes' logs, and the code.

## Shas, per task (idea-armory, all on top of e8f91d6, unpushed)

| Task | Commit | Found at 0.3.3 | Built |
|---|---|---|---|
| 1 Lost edits (80b71edc) | 3154b22 | Already fixed in 0.3.3 (CheckoutRules.NextCheckInStep, read before release). Reproduced as reported, four check-out/edit/check-in cycles, closed and open, with a save right after the check in's scan: passes. | A regression test of the exact reported flow, and a test hook (AfterNextScan). |
| 2 Live-updates token (b32e6726) | aa7add1 | Broken. A lab computer whose clock runs slow trusts Supabase's expires_at; the feed renewed only 60 s ahead; after an "expired" close it rejoined with the stale token every few seconds; each rejoin started a server read, and each quiet read flipped the status to Updating and back. | Expiry by this computer's clock (min of expires_at, expires_in, exp minus iat); renew 5 min ahead; on "expired" renew at once (at most every 30 s) and rejoin paced 5 s doubling to 60 s; logs deduplicated. A quick look that moves nothing keeps the settled status (4 s grace); a steady "Now" line; the status block keeps one height (reserved lines). |
| 3 Crashes (IDEA-06 mostly; also IDEA-12, IDEA-00, DESKTOP-QH30N35) | 08cf4bc | Every "crash" was "the previous run ended unexpectedly", the last log line an ordinary pass end, mostly overnight on IDEA-06 at intervals that match Windows restarts; one ended right after "the computer is going to sleep". No exception was ever logged. | At start, Windows' own event logs (System 41, 6008, 1074, 13, 6006; Application 1000, 1026, 1001 naming IdeaArmory) since the last line decide: a restart, shut down, power loss or sleep is logged, not reported; a real crash or an unrecorded end is still a crash incident, now with what Windows saw and the very last log line. |
| 4 Locked files (repeatedFailure 0063246e, 54c9e3c4, 3cdc2ff5) | d449ed5 | Broken: a sharing violation was a red CantRead notice, a FileFailed in the flight, and after three a repeatedFailure incident; a new file held by SolidWorks (Save As) was red too. | Sharing/lock violations (32/33) are a "lockWait" information notice, never FileFailed; the Windows scan reports held paths; a pass runs again 3 s later. Save As of a new file from a template not checked out is the official route and is tested. |
| 5 Slow passes | 28ddc41 | Nothing ever ended a stalled loop pass; download slices of ~60 s were reported as slow. The incidents' flights (phase timings) could not be read, so the stalling step is not named. | A pass watch: every step marks progress; a loop pass with none for 2 min is canceled and restarted, the log and flight saying the phase and step; a watch gap over 45 s is the computer asleep or the process paused, recorded as a power event (never a slow pass). A pass that moved files is slow only past 180 s. |
| 6 Auto-update | 95ba277 | No updater in any version. | Velopack 1.2.161 (MIT). IDEAArmory-win-Setup.exe installs per user; the app reads releases/latest/download/releases.win.json (never the rate-limited API) a minute after start and every 4 h, downloads, applies at quit or next start. Old-style installs of 0.4.0+ move themselves onto it; the install hook retires %LOCALAPPDATA%\Programs\IDEA Armory. 0.3.x needs 0.4.0 installed once by hand. Release workflow packs, installs, checks and uninstalls it on Windows. README "Publishing a release". Version 0.4.0. |
| 7 SolidWorks years | f3e493d, c2d9d69 | A newer year was refused in both modes (0.3.3 decision A3) and the server raised 22023. | Never blocked: Core allows it (NewerThanPin), migration 0288 records it, every computer shows one card per file with "This is on purpose" (silences that file). "Keep this file on this computer only" still keeps it (FileState.KeptHereHash). docs/agent/decisions-0.4.0.md. |
| 8 Quality of life | (in aa7add1) | Tooltips (750 ms), "Finished" only when nothing remains, continuous downloads, instant clicks, fast theme switch, running lines: all already done in 0.3.3 and still green (check-ui, RunningLineTests, ContinuousTransferTests, LargeVaultResponsivenessTests). Layout jumping: broken. Instructor override: Force check in exists; leads rename/move over check outs only by force checking in first. | The layout no longer jumps (task 2). Not built: organizing over someone's check out without force checking it in (see below). |

idea-app: migration `supabase/migrations/0288_armory_newer_release_uploads.sql` and
`tests/db/armory-newer-release.test.ts` (9 tests, deployed refusal measured first, re-apply
idempotent, grants; a mutant that still refuses a newer year fails 3 of them). Undo: re-run the
0231 body of `armory_check_release`.

## Feedback and incidents marked on the site

- Resolved (fixed in 0.3.3, released, verified green now): 13519ddf, 1f39cc26, 461393d8, 80b71edc,
  cbbc644a, 456fcb51, a4bd3371, ab118180, a639a44f, 42ab7874, 194706a9, 267b92de.
- Seen, not resolved: b32e6726 (fixed in unshipped 0.4.0); 47e9bf5e (0.3.3 still sent check in
  waits of 10.8 and 17.8 s on IDEA-06); a020c8f1 and d2664c23 (partly done since 0.3.3).
- Incidents: 808 from 0.2.1 to 0.3.1 resolved (fixed in 0.3.3 per its audit); the 98 from 0.3.2
  and 0.3.3 seen (their fixes are in unshipped 0.4.0).

## Verified, and not

Measured here (Linux, .NET 10.0.402, PostgreSQL 16): the whole idea-armory suite green, 1,345 passing
tests across 12 projects, with one load-only flake (ProfilesHostTests' add-a-student test timed
out at 1 min under the whole suite and passes alone and with its project); check-ui PASS (312
pages) and bbox-diff 0 differing; the 0288 db test green.

Not verified: anything Windows-only (the Windows platform tests skip here; Velopack install,
update and the legacy retirement; reading Windows event logs; the held-file flag from the real
scanner), the real Supabase Realtime server's close and refusal frames (a scripted socket stands
in), and the live database (0288 not applied).

## Not built, and why

- Organizing (rename, move) over someone else's check out without force checking it in. The
  server already lets a lead do it (0236), but idea-armory's server mirror predates 0236, and the
  holder's computer moving a writable, possibly open file needs its own design and Windows tests.
- The 15 to 20 s quiet passes on IDEA-06: the Windows scan opens every file on every pass; reusing
  the cached id when size and time are unchanged would cut it, but it changes the N4 read rules
  and can only be proved on Windows.
- Slow check ins (0.3.3, 10.8 to 17.8 s): needs the incidents' flights to see where the time goes.

## How to ship

1. A session with push access applies the patches, rebases, runs the checks and pushes
   idea-armory to main, then idea-app (0288 applies through migrate.yml; renumber if 0422 took it).
2. Mr. Pina publishes v0.4.0 (README, "Publishing a release").
3. Once, on each computer still on 0.3.x: run IDEAArmory-win-Setup.exe.
