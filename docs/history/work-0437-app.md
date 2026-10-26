---
title: "Ledger 0437: IDEA Armory 0.5.0 -- lab computers shared with no setup, one folder per project per computer with each person's waiting work held for them, folders of one's own folded back in, and an icon for every file type the lab uses (no migration)"
date: 2026-10-26
branches: [work-0437-app]
migrations: []
subsystems: [Armory]
---

A solo session with push access to pina-hash/idea-armory (main was `31ae3a6`, the v0.4.3 tag,
published 2026-10-25; this work landed there as `e761c89`, version 0.5.0, not published) and idea-app (this record, `docs/ARMORY.md`, ledger 0437,
`docs/feedback/2026-10-26/RESULTS-0437.md`). The task was `docs/feedback/2026-10-26/QUEUE-0437.md`
and the `docs/ARMORY.md` section on several people on one computer. No server or website change.

## The audit, from the tree at 31ae3a6

**How state binds to a person and a device.** The engine's document is
`<Armory folder>\.armory\state.json` (`EngineState`, schema 2 since 0.2.0). Its first pass binds it
to the signed-in `Email` and the sign-in's `DeviceId`; a reconnect of the same person moves the old id
into `FormerDevices` (`IsMine`), so their locks stay theirs. Another account saw
`Connections.VaultOwnedByOther` and nothing synced; `TakeOverFolderAsync` (0.3.2) handed the folder
over only when nothing of the owner's waited, and then forgot the email, device, former devices,
notices and kept-copy records. Locks are the server's, per device (`armory_acquire_lock(p_file,
p_device, ...)`), and every sign-in registers a new device. On a shared computer (0.3.3) each profile
has its own `SessionManager` over `%LOCALAPPDATA%\IDEA Armory\profiles\<id>\secrets\`, the host swaps
one pointer, and one engine runs per folder per process (`VaultRuntime`'s claim) and per Windows
account (the stores' `FileShare.None` lock files in `.armory`).

**Every on-disk shape a lab computer can have, 0.3.2 up.** `%LOCALAPPDATA%\IDEA Armory\`:
`settings.json` (`vaultRoot`, `startAtSignIn`, `theme`, and `sharedComputer` from 0.3.3),
`secrets\armory-session.secret` (one person), or `profiles\profiles.json` version 1 with
`profiles\<id>\secrets\armory-session.secret` and `armory-pin.secret` (shared, 0.3.3 to 0.4.3; PINs
on by default with `pinsChangedBy` null, or set by a mentor; `migrating` "on" or "off" after a crash
mid-toggle), `install.json` (0.4.3), logs and incidents. The Armory folder: projects,
`.armory\state.json` bound to one person (or to nobody after a 0.3.2 take-over), `journal.bin`,
the kept saves, the read-only and staging lock files. Folders of one's own,
`C:\IDEA\Armory-<first name>` then `-2`, `-3`, each with its own `.armory`, made when the shared folder
held someone else's work; the last student's check outs in the shared folder sealed read-only
meanwhile; and, after shared mode was turned off while its student worked in one, `settings.vaultRoot`
pointing at that folder.

**Where a save is attributed.** A capture records its snapshot and journal entry with the session's
email as author (`SaveRecorder.Record(id, path, author)`), but the upload goes under whichever session
runs the engine, and the server names the version's author from that sign-in. Until 0.5.0 nothing
but the refusal to run another account on a folder with waiting work kept a save from going out as
someone else.

**How a second Windows account failed.** Each Windows account has its own `%LOCALAPPDATA%` (own
sign-ins, own settings) and the same `C:\IDEA\Armory`. With the first account's Armory still running
(Fast User Switching keeps it), the second one's runtime could not open the stores' lock files, and the
window said "Armory can't use the folder C:\IDEA\Armory. Choose another folder in Settings.", which
leads to a second copy. With the first one not running, the folder's state named the first account, so
the second saw "This folder belongs to ..." and was offered the take-over (refused while anything
waited) or `C:\IDEA\Armory-<name>`.

**What the window showed for a file with no thumbnail.** Windows was asked for a picture only for
SolidWorks parts, assemblies and drawings and for pictures (`THUMB_KINDS` in `app.js`; `ShellThumbnails`
asks for a real thumbnail only, never the type's icon). Every other row drew a line glyph by
`kindOf`: the part, assembly or drawing glyph for the three SolidWorks types, and the plain page for
everything else.

**Already built and kept.** Per-person profiles and the sign-in that moves rather than copies; the
stop-for-good guarantee before the next engine starts; sealing check outs read-only; `FolderWaiting`;
per-sign-in devices with `FormerDevices`; journal authorship; `ShellThumbnails`' waits and caches; the
window's icon sprite.

## What changed (idea-armory, version 0.5.0)

- **The state document is the computer's (schema 3).** `EngineState.People` keeps every person's
  device ids; `EngineState.Held` keeps, under each address, that person's waiting work: whole file
  records (check outs, saves not sent, writes in flight, Explorer renames), their changed and new
  files, and their folder changes, with each held file's bytes' hash.
- **The hand-over is automatic** (`SyncEngine.People.cs`). The first pass of an engine for someone else
  holds the last person's waiting work after it has looked at the disk and before anything is
  captured, and returns the new person's own held work. A held path is never captured, attached,
  adopted, planned (not even a download), moved or sent; held files are kept read-only; a renamed one
  is found by its bytes; a renamed folder carries held paths; Check out, Rename, Delete folder and Put
  back refuse a held file in one sentence. A journal entry is attached only to its author's records.
  `TakeOverFolderAsync` is that hand-over, never a refusal. The view's connection is never
  `vaultOwnedByOther`; `AgentView.HeldForOthers` says whose work waits.
- **The fold** (`Armory.Core.FolderFold`, `FolderFoldRunner`, `AgentHost.Fold.cs`): at every start,
  before any engine, each folder of one's own a profile names or that sits beside the shared one with
  Armory's records is folded in by the plan table in PROFILES.md. Records come in held for their
  owner and are saved before any file moves; a step is re-checked against the disk just before it
  happens; anything replaced goes aside into `.armory\folded\<folder>\`; a finished folder's `.armory`
  goes there too and the folder goes (never a recursive delete). The outcome is one sentence on Home
  for a week (`AgentView.UpdateNote`). Profiles all point at the shared folder.
- **The host** (`AgentHost.Profiles.cs`): `profiles.json` version 2 (PINs kept on only where a mentor
  turned them on, `SharedComputer.PinsKeptAfterUpdate`); a single-person computer becomes shared when
  someone else signs in (`SharedComputer.BecomesShared`, `BecomeSharedAsync`); a switch lets the last
  person's engine run one pass of at most 15 seconds, then stops it for good and starts the next
  person's on the same folder, with no folder-busy step; the picker opens by itself only with two or
  more people (Switch always opens it). The "This computer is shared" switch, its turn-on and turn-off,
  and the `chooseFolder` and `setSharedComputer` bridge messages are gone. A folder another Windows
  user's Armory holds is named plainly and retried every 30 seconds.
- **File icons** (`Armory.Core.FileKinds`, `tools/agent-icon/make_file_icons.py`, `app.js`
  `FILE_KINDS`): 22 kinds, each drawn on the window's 20 px line grid and legible at 192 px; the window
  asks Windows for a picture of every kind it usually previews, and the picture still wins.
- **Tests replaced in `tests/GUARDS.txt`**, each by a test of the new rule named in the same commit:
  `Folder_plan_follows_the_hand_over_table`, `The_next_student_takes_over_the_folder_only_when_the_last_one_has_nothing_waiting`,
  `A_save_not_sent_keeps_the_folder_with_its_student`, `Work_waiting_offers_wait_or_own_folder_and_wait_changes_nothing`,
  `Own_folder_keeps_the_last_students_work_theirs_and_they_finish_it_later`,
  `Turning_shared_mode_on_moves_the_sign_in_and_never_leaves_two_copies`.

## Projects a person is not in (added mid-session, Mr. Pina's report of 2026-10-25)

The requirement: robotics work must be safe from freshmen signed in on the same computer. Audit:
an engine lists only its person's projects (`armory_my_projects`), so a project they are not in is
unusable for them (`ProjectState.Usable` false, `Departed` after `armory_project_purged` answers
null, which it does for anyone unless the project was deleted forever), never shown, synced,
captured or sent; its files keep the read-only bit the last member's engine set, and the read-only
rule sets it again if cleared. The gap was the hand-over after them: their edits looked like "their
waiting work" and were held for them forever, a new file of theirs in that project could be
captured as the next member's (the project lookup in `Hold` used the last read's usable flags), and
a held file anyone wrote over was captured as its owner's save when the owner returned. Built:
`PersonState.Projects` (each person's own list), `EngineState.Aside` with `SetAsideNow` (to the
recovery folder once closed, then the owner's journaled save or the team's version), the bytes
check in `ReturnHeld` (now after the scan), and a held file missing from disk staying held unless
its owner's save can restore it. Tests: `ProjectSafetyTests` (3, in `tests/GUARDS.txt`).
Mutation-tested: `NotIn` forced false, the bytes check removed, `SetAsideNow` emptied, and aside
paths not excluded from capture each redden at least one of the three; restored byte-identical.

## Load-bearing decisions

- **Held work lives outside the file records**, not as a flag on them: every loop over
  `state.Files` (sending, planning, check ins, the read-only rule) ignores it by construction, and only
  the few places that read the disk or the journal needed a hold check. Mutation-tested: removing the
  capture and planning filters, or the journal author filter alone, reddens the guarded tests.
- **Downgrade safety comes from the profile index**, which already existed: held work exists only
  where two or more people used a computer, and such a computer has `profiles.json` version 2, which
  Armory 0.3.3 to 0.4.x reads as "set up by a newer Armory" and runs nobody from.
- **Saves not sent in a folder of one's own** come in as the file on disk (its latest save), kept
  again under the owner's sign-in; earlier unsent saves stay in `.armory\folded\<folder>\armory`.
- **No server change.** Locks stay per person's device, which is right on a shared computer. One
  computer as one line on the website is written in `docs/ARMORY.md` as a request for Mr. Pina.

## Measured (2026-10-26)

See `docs/feedback/2026-10-26/RESULTS-0437.md` for the numbers (Linux suite with PostgreSQL, the
window checks, and the Windows jobs of the CI-only draft pull request idea-armory #9).

Two host tests were racy under load and were fixed in the tests: the hand-over activity line is
waited for like the owner, and the add-a-student test cancels only once the fake browser has
opened (the connect flow opens it asynchronously, so a late open from the cancelled flow made the
exact open count unreachable; it failed that way on the 0.4.3 tree too and once on GitHub's Linux
runner).

## Not verified

A real lab computer; SolidWorks with a held file open; Fast User Switching on real hardware; the fold
of a real lab's own folders; Windows' own previews of the new file types (CI checks the page asks, not
what Explorer draws); the database end-to-end tests on Windows (the Windows runner has no database,
so they run on the Linux runner and here).

## Deferred

A second Windows account handing its work to the engine that already runs; the folder-taken screen
(unreachable since 0.5.0) left in the page; one computer as one line on the website (a request).
