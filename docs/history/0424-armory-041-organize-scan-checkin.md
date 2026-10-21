---
title: "Ledger 0424: IDEA Armory 0.4.1 -- the Windows check that stopped 0.4.0's installers, leads organizing over check outs, quiet passes and slow check ins (no migration)"
date: 2026-10-21
branches: [main]
migrations: []
subsystems: [Armory]
---

A solo session with push access to pina-hash/idea-armory (main was c8e6e09, the v0.4.0 tag)
and idea-app. No server code changed: idea-app 0236 already lets a lead organize over other
people's check outs, so this ledger claims no migration. Version 0.4.1; no release was
published (Mr. Pina publishes v0.4.1, idea-armory README "Publishing a release").

## Task A: why 0.4.0's installers were never built

The "Agent installers" run on main (39653861203) and both "Agent release" runs for v0.4.0
(39654201394 on the tag push, 39654201781 on the release) failed on Windows in
`AgentProcessTests.Check_fails_when_the_page_files_are_missing`: `Assert.Single` on an empty
stdout. The test builds "the app without its wwwroot folder" by copying a hand-kept list of
file names out of the build folder; 0.4.0 added `Velopack.dll`, which was not on the list, and
`Program.Main` calls `Updates.RunInstallerSteps` (Velopack) before `--check` is read, so the
copied app died with a missing assembly before it printed anything. The app was right; the
test's copy was not a whole app.

Fix (idea-armory f23a76b, pushed alone): the test copies everything beside `IdeaArmory.exe`
except `wwwroot`, asserts `wwwroot` is absent, asserts the same `--check` refusal as before
(`wwwroot` false, the default vault root, exit 1), and then, as a control, copies `wwwroot`
back and asserts the same copy passes. No assertion was loosened. "Agent installers" on
f23a76b (39654977112) passed, the test green in both of its Windows steps.

**v0.4.0 is published with no assets** (`gh api .../releases/tags/v0.4.0`: assets `[]`). Its
tag and release were not touched. The fix ships as 0.4.1, whose release notes carry 0.4.0's
too.

Also seen on f23a76b's "Armory tests", not caused by it: a Windows cleanup race
(`ReplaceAndLockTests`' 1,500-file test vault, "part-1366.SLDPRT ... being used by another
process" while the folder was removed; the test vault now retries its removal for up to 10 s)
and the known Linux load flake in
`ProfilesHostTests.Adding_a_student_signs_into_a_new_profile_and_cancel_or_the_same_address_leaves_no_second_one`
(a third browser open counted where two were expected; it passes alone).

## Task B: the three items 0.4.0 left unbuilt

| Item | idea-armory | What was found | What was built |
|---|---|---|---|
| 1 Organize over check outs | d371a78 | The server allowed it since 0236, but the agent never asked: Rename file, Move and Rename folder refused a lead (or force checked in) whenever someone else held a file. idea-armory's server mirror predated 0236. On the holder's computer the team's move already waited for an open file (`ApplyRemoteMove`) and the Windows move is hash-checked and refused while a program has the file. | A mentor, CAD lead or instructor (`can_take_back`) renames and moves over check outs without force: `armory_move_file` without taking the lock (`LeadOver`), `armory_rename_folder` with the check outs in place; the answer says the check outs stay. The holder's computer moves its writable copy once SolidWorks lets go, with its last save, still checked out, and logs who moved it (`file_moved` `checked_out_by`, `folder_renamed` `over_checkouts`). Delete folder and Force are unchanged; a student is refused as before. Tests run against 0236's own bodies (`tests/Armory.TestSupport/sql-v3/armory_v3_organize.sql`, 0236 lines 71 to 131 and 183 to 281 as they are): `LeadOrganizeTests` (3), and a Windows test that holds a checked-out file open for writing, saves through the handle, and shows the move refused until it is let go, then made with the last bytes, still writable. |
| 2 Quiet passes of 15 to 20 s on IDEA-06 | 2284d7d | `LocalChangeDetector.Scan` reused hashes but still opened every file for reading on every pass (to read its id, size and time through that handle), and every open is a virus-scanner look on a lab computer. | A read-only file the cache read at the same path is taken from an attributes-only stamp (`NativeMethods.FileStampWithReadOnly`) when it was read-only then and is now, with the same NTFS id, size and time, outside the racy window. N4 holds: that earlier read shared read only (no writer then), and a read-only file can't be opened for writing since; writable files are opened as before, so SolidWorks holding one is still seen. Not from the last run's file map (it keeps no bit). Windows test `A_read_only_file_already_read_is_taken_from_its_stamp_and_a_writable_one_is_still_opened`. |
| 3 Slow check ins, 10.8 to 17.8 s | 1d22f35 | The connector lists incidents (154 slowPass, 5 slowAction from 0.3.x: checkOut and checkIn waits of 15.5 to 18.0 s on DESKTOP-QH30N35) but cannot read a report's flight, so the cause came from the code and note 47e9bf5e's log. A click waits for the loop pass's scan in progress (the loop gives way only after it), and then its own action pass scans the whole vault again: two full scans per click, each one item 2's 15 to 20 s on IDEA-06. | The loop pass that gives way right after its scan hands that scan to the action pass (`TakeFreshScan`, within 3 s of its end; `scanReused` in the flight), so a click costs at most what was left of one scan. Safe by the platform's own guards: every write, move and recovery refuses a file that changed or is open, and a check in reads the file before it lets go. `SlowScanActionTests` (2): one scan per click with a 3 s scan (and a mutant that never reuses fails it), and a save landing right after the reused scan is shared before the check in lets go. |

Plus da855af (the Windows test vault's cleanup), f6fa09a (version 0.4.1,
`docs/agent/release-notes/v0.4.1.md`, the README's publishing steps for v0.4.1, ENGINE.md and
docs/platform/local-changes.md, and four new entries in `tests/GUARDS.txt`) and 83ea2fa (the quiet-scan test's held case: a file held for writing is refused before the scan reads anything, found by the Windows run). idea-armory main is 83ea2fa.

## Verified, and not

Measured here (Linux, .NET 10.0.402, PostgreSQL 16): the whole idea-armory suite at f6fa09a, 1,350 passing and 112 skipped (Windows only) across 11 test projects, 0 failing (EndToEnd 225, Core 522, Agent 245, Client 72, SolidWorks 67, Engine 59, TestSupport 50, Server 46, Telemetry 33, Platform.Windows 23, Storage 8) (ledger 0423 measured 1,345). check-ui PASS (312 pages,
0 failures, every planted defect caught) and bbox-diff 0 differing. The Windows tests ran on
GitHub's windows-latest through a CI-only draft pull request (idea-armory #6, closed, never merged) before main was pushed: "Core tests", "Armory tests" and "Agent installers" all passed on 83ea2fa, the Windows platform tests among them; the first run, on f6fa09a, failed only the new quiet-scan test's held case, fixed in 83ea2fa.

Not verified: any time on a real lab computer. The 15 to 20 s and 10.8 to 17.8 s are 0.3.3
field figures; how much of them 0.4.1 removes is not measured, because the incidents' flights
can't be read through the connector and no Windows lab computer was reachable. The scan rule's
effect on a virus scanner is reasoned from how an attributes-only open works, not measured. The
flash-drive zip and the older setup are built, installed, upgraded and uninstalled on every push
by "Agent installers" (green on 83ea2fa); the install that updates itself (Velopack) is built and
tested only by "Agent release", when v0.4.1 is published.

## For Mr. Pina

1. Publish v0.4.1 (idea-armory README, "Publishing a release"). It becomes the latest release,
   which is what every installed Armory reads.
2. Then, once on each computer still on 0.3.x: run `IDEAArmory-win-Setup.exe` from the v0.4.1
   release.
3. The v0.4.0 release has no files. Leaving it is harmless once v0.4.1 is the latest; deleting
   it or marking it a pre-release is his call.
