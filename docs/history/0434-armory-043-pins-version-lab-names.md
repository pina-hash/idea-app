---
title: "Ledger 0434: IDEA Armory 0.4.3 -- taskbar pins that survive the move to the updating install, the version and its date in Settings and the tray, computers told apart without their names, bulk lab renaming (no migration)"
date: 2026-10-23
branches: [main]
migrations: []
subsystems: [Armory]
---

A solo session with push access to pina-hash/idea-armory (main was `0f8d0dc`, the v0.4.2 tag,
already published) and idea-app (this record, `docs/ARMORY.md`, ledger 0434). Mr. Pina's items 16
to 19 of `docs/feedback/2026-10-23/QUEUE.md`; `docs/feedback/2026-10-23/RESULTS-0434.md` closes
each one. No server or website change.

## What changed (idea-armory, version 0.4.3)

- `TaskbarPins` points every pin of Armory in `User Pinned\TaskBar` at the installed
  `IdeaArmory.exe` with `IdeaBosco.Armory`, in Velopack's install and update step (before
  `LegacyInstall.Retire` deletes the older copy) and in `ShellIdentity.Repair` at every start; a
  rewritten pin brings one sentence on pinning again, once (`install.json`, `pinNoticeShown`).
- `tools/package-velopack.ps1` packs with `--aumid IdeaBosco.Armory` (the 0.4.2 manifest named
  Velopack's fallback `velopack.IDEAArmory`; no shortcut was measured taking it).
- `InstallRecord` (`install.json`): the version, when it first ran, the one before it (read from
  the log's last `started` line of another version when there is no record, as from 0.4.2).
  Settings' "About this Armory" (`AboutView` on `SettingsView`), the tray hover text's second
  line (`HostTips.TrayTooltip`), and "Armory updated from 0.4.2 to 0.4.3." once.
- `MachineId.FromParts`: the incident id also hashes the computer's own wired network address,
  because an image copied without Sysprep shares `MachineGuid`; with none it is the old id.
- `docs/LAB_COMPUTER_NAMES.md`, `tools/lab-names/` and `tools/test-lab-names.ps1`.

## The load-bearing finding

The first diagnosis, written before CI ran, was that Velopack's update rewrote the Start menu
shortcut and pins with its fallback identity. CI disproved it: after `Update.exe apply` of 0.4.3
over the published 0.4.2, the shortcut and a pin made from it kept their target (the path never
moves) and their identity. A pin breaks when the move onto the updating install deletes the
older copy's folder. The docs and comments were corrected in the same session; `--aumid` stays as
consistency. Whether File Explorer redraws a rewritten pin's picture on a real desktop is not
measurable on a runner, which is why the one sentence exists.

## Measured

- Linux, this container: 1,030 passed, 463 skipped, 0 failed (1,021 and 462 at `0f8d0dc`).
- CI on `31ae3a6` (draft pull request #8, closed, never merged): Linux with PostgreSQL 1,380 passed, 113 skipped, 0 failed; Windows Armory tests 1,144 passed, 358 skipped; Agent installers green, including the pin update test and the lab names check; check-ui PASS, bbox-diff 0 differing. RESULTS-0434.md has the detail.

## Not verified

A real lab computer, a real pin on a real desktop after a real update, a real rename. The lab's
domain, administrator account and any restore-on-restart program are unknown here.

## Deferred

The website's Team view folds a member's devices by computer name (`presenceDevices`); a stable
per-computer key on the server (the app's `machineId` hash, sent on register or heartbeat) would
let it fold by computer. Not built: a website and schema change outside this round.
