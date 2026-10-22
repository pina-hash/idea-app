---
title: "Ledger 0430: IDEA Armory 0.4.2 -- the field round of 2026-10-22: the Armory folder never a project folder (Fix it), one card for thousands of files, quieter logs, truer incidents, Open from the website (no migration)"
date: 2026-10-22
branches: [main]
migrations: []
subsystems: [Armory]
---

A solo session with push access to pina-hash/idea-armory (main was 83ea2fa, the v0.4.1 tag) and
idea-app. The queue, its evidence and the same account as below are in
docs/feedback/2026-10-22-armory/ (RESULTS.md).

Armory 0.4.2, built and tested, not published (Mr. Pina publishes it). No migration.

## Pushed

- pina-hash/idea-armory main: `0f8d0dcf52946ee1590790e34e57bb0533066160` (version 0.4.2; commits 1314758, da88913, 8b6b2d6, bcb3467 and 0f8d0dc on `83ea2fa`, the v0.4.1 tag; nobody else had pushed).
- pina-hash/idea-app main: the code commit `a5860e2d` and the record commit that carries this file, pushed together (the file page's Open in SolidWorks, one presence line per computer, `docs/ARMORY.md`, this file, the history entry and ledger 0430).

## Every queue item and incident

"0.4.1 (commit)" means the fix shipped to computers with v0.4.1 (0.4.0's fixes first reached any computer in 0.4.1, because 0.4.0 has no installers). "0.4.2" is this round, idea-armory commits named by their subject's first words. Every incident was filed by **0.3.3** (one IDEA-06 group by 0.3.1 and 0.3.2 earlier in the week, not in the queue); none came from 0.4.1. The window's numbers were read from each incident's summary, not its flight (the connector cannot read flights).

| Item | Verdict | Where |
|---|---|---|
| 1. Project folder chosen as the Armory folder (note 62ba98eb) | **Fixed now** | idea-armory 8b6b2d6 ("Armory's folder can never be a project folder ..."): Settings corrects or refuses it in one sentence (`VaultRootRule`); a computer already in that state runs no engine there and shows one card with Fix it (`VaultRootRepair`), safe both with the doubled folder in place and already moved by hand. |
| 1. Hundreds of "outside every project" files, one notice | **Fixed now** | idea-armory 1314758: its own `outsideProject` card, one sentence, one action (Open the Armory folder); while Fix it is offered, the Fix it card stands in for it. |
| 2. The list stops at 200 | **Fixed now** | The 200 was an engine cap on the view (`NoticeItemsShown`), and the page labeled its key with the items it had, not the card's count. The 20 in the report is a separate, deliberate cap on the incident snapshot (`SnapshotItemsPerCard`), not a defect. idea-armory 1314758 and 8b6b2d6: `readNoticeItems` returns every file grouped by reason; the virtual list draws them, the key says the card's count. Tested at 1,500 files. |
| 3. `waiting:` every 3.3 s | **Fixed now** | idea-armory 1314758: logged once, again only if Windows says something else, and "let go" once; a held file is never a `sync:` line too; retries back off from 3 s to 60 s (about 85 passes an hour instead of 1,100). |
| 3. `sync:` repeats | **Fixed now** | 1314758: a problem is logged again only after a loop pass went by without it. |
| 3. "Asking Armory what changed" floods the panel (IDEA-00, 0.3.3) | **Still present in 0.4.1; fixed now** | 0.4.1 still wrote the step line on every pass that took over a second, and a held file made a pass every 3 s. 1314758: a step's line is one line however often it comes back; the backoff above. |
| 3. `solidworks:  changed` (empty name) | **Fixed now** | A new, unsaved document has no path; 1314758 names it "a new document (not saved yet)". |
| 3. `open files:` | Already right | Unchanged (2df88e5, 0.3.3). |
| 4. Idle slow passes on 0.4.1 | **None seen** | IDEA-06's 0.4.1 log shows idle passes of 557 and 693 ms over 1,593 records. The only idle cost found in 0.4.1 was the 3 s pass loop while SolidWorks held a file, fixed above. |
| 4. slowPass for proportionate work | **Fixed in 0.4.1, tightened now** | 0.4.1 (1c3ac1f): a pass that moved files is slow only past 3 minutes. da88913: past 60 s plus 250 ms a file moved (never under 3 minutes). |
| 4. slowPass spanning sleep | **Fixed in 0.4.1** | 1c3ac1f: the pass watch reads a gap of over 45 s between its looks as sleep or a paused process (a `power` event), and the rule leaves that pass out. 595b519 (0.3.3) already left out passes with a Windows power event. |
| 4. Crash for a sign-out, log-off or shutdown | **Shutdown and restart fixed in 0.4.1; sign out fixed now** | 49fd84a (0.4.0): restarts, shut downs, power loss and sleep are read from Windows' own records and not reported. da88913: the session line is written the moment Windows asks (before the window's thread can be cut off), and this account's own Winlogon 7002 sign out explains the end. |
| 4. Held by SolidWorks as repeatedFailure | **Fixed in 0.4.1** | 1d8b883 (0.4.0): a file another program holds waits and never records a failure. |
| 4. Check out waits of 16 to 307 s | **0.4.1 plus item 1** | The 307 s waits were the 0.3.3 scan opening every file (2284d7d) twice per click (1d22f35). The 16 s wait was a check out during item 1's mass download of 1,496 files; item 1 now stops that state from arising. |
| 5. Device id churn | **By design, website display fixed now** | Every sign-in registers a device (0231, `armory_register_device`). The app keeps every id it ran under (`FormerDevices`) and treats every lock under any of them as this computer's, so history is never split. The website listed each sign-in as a computer of its own; idea-app now shows one presence line per computer name (`presenceDevices`). Documented in idea-armory `docs/agent/ENGINE.md` "Device identity" and `docs/ARMORY.md`. |
| 6. ba81c57d, Armory part: Open from the website | **Fixed now** | idea-armory 8b6b2d6: the app answers `idea-armory:open?f=<file id>` with its own Open (no check out). idea-app: Open in SolidWorks on the file page, and a plain sentence with the download when nothing answers. The "stocks" part is IDEA Coin work, left open. |

### Incidents

| Id | Kind, device | Verdict |
|---|---|---|
| f17e6e41, 55f64e94, 9b8ae1e5, 3e9d9aad, 9931fb0d, cf81b8e7, 5168471b, dd6b9bd1 | slowPass, idle (0 work), 0.3.3 | Fixed in 0.4.1: 1c3ac1f (sleep or a paused process is not a slow pass; a stalled pass is ended in 2 minutes) and 2284d7d (a quiet look no longer opens every file). |
| 18006c14, d704a78c, 7b429618, 65822650, e494d9dd, fc84c35b, e06e5c80, 1407f7a6, 3af247d8, 2d4560d3, 2cc16e09, 95949852, bb9a7388, fc7add65, bba3afdb | slowPass, IDEA-06 overnight, 0.3.3 | Fixed in 0.4.1: 1c3ac1f and 2284d7d, as above. |
| 28c4c6c6 | slowPass, 61.8 s, 486 downloaded | Fixed in 0.4.1 (1c3ac1f, a moving pass under 3 minutes is not slow); now judged per file (da88913). The download itself was item 1, fixed now. |
| 1d333f64 | slowPass, action pass 307.3 s | Fixed in 0.4.1: 2284d7d and 1d22f35. |
| a346fd0c | slowAction, checkOut 16.1 s | The click waited behind item 1's mass download (fixed now, 8b6b2d6); the scan part is 1d22f35 (0.4.1). |
| 46c75d31 | slowAction, checkOut 307.5 s | Fixed in 0.4.1: 2284d7d and 1d22f35. |
| 9de5e9a5, 3a314848 | repeatedFailure, held by another process | Fixed in 0.4.1: 1d8b883. |
| 14ceca64, 7780af88 | crash after a pass of 25 min and 2.6 h with 0 work | Fixed in 0.4.1: a run that slept or was paused is told apart (1c3ac1f) and Windows' records explain restarts and power (49fd84a); a sign out is now explained too (da88913). |
| ddde51b0, b8aef460, f01b8281, d0d601c5, 1cf2e24e, 2879a06d, d9afe137, e83b02f8, 72841928 | crash "ended unexpectedly" on shared lab computers | Restart, shut down and power: fixed in 0.4.1 (49fd84a). Sign out: fixed now (da88913). A run Windows has no record of ending is still a crash, now with Windows' words; whether any of these was a real crash cannot be told from here (the flights are not readable through the connector). |

Filed after the queue was gathered (all 0.3.3, the same kinds, the same verdicts): slowPass ae7e2b63, f1124d40, a0307a25, 69be0a0d (IDEA-06), a431b961 (DESKTOP-PFH54TK), 57e1d8da (IDEA-20); crash e5c88274 (IDEA-06). Also open and not in the queue: readOnlyBroken 9e13944b (IDEA-06, 2026-10-21, 0.3.3): not a defect, it is Armory's record that it made a file read-only again.

## Verified, and not (2026-10-22)

- idea-armory, Linux (.NET 10.0.402, PostgreSQL 16): the whole suite at bcb3467, **1,371 passed, 112 skipped (Windows only), 0 failed** across 11 projects (EndToEnd 228, Core 522, Agent 258, Client 72, SolidWorks 68, Engine 61, TestSupport 50, Server 46, Telemetry 35, Platform.Windows 23, Storage 8; ledger 0424 measured 1,350). check-ui PASS (324 pages, 0 failures, 48 of 48 bridge types, every planted defect caught); bbox-diff 0 differing over 162 comparisons.
- idea-armory, Windows: CI-only draft pull request #7 (closed, never merged). The first run failed one new test on Windows only (it removed a folder of read-only files before clearing the bit, which Windows refuses); fixed in 0f8d0dc. On 0f8d0dc: Core tests, Armory tests and Agent installers passed on windows-latest, and so did Agent window checks (check-ui and bbox-diff in CI); 0 failed on Windows (Agent 281 passed and 19 skipped, Platform.Windows 91 and 3, the Postgres tests skipped there as always).
- idea-app: `npm run check` 0 errors, 33 warnings in 18 files (the baseline); the Armory browser specs (`--route armory`) 1,020 measurements, 0 outside threshold at 375 and 1440; the full `npm test` ran to its end with 880 of 884 files and 16,571 of 16,584 tests passing; the 13 failures (tests/classroom-panel-layout-render.test.ts 4, tests/db/cert-0262-exam.test.ts 7, tests/db/feedback-round-0380-foundry.test.ts 1, tests/db/ideacad-feature-graph-storage.test.ts 1) fail the same 13 on unchanged main 44a7b279 run alone in a separate worktree, touch no Armory file, and are not this round's; not investigated.
- **Not verified:** any of it on a lab computer. Fix it on IDEA-06's real folder is tested on the same layout in a temporary folder on Linux and Windows, not on IDEA-06. The browser's behavior for `idea-armory:` links (the "Open IDEA Armory?" question, and losing focus) is not measurable in the headless browser; the 2.5 s fallback is reasoned, not measured. Winlogon 7002 on a real sign out is not testable from CI. The Velopack update to 0.4.2 is built and tested only by "Agent release", when v0.4.2 is published.

## Live site

Read before this push, 2026-10-22: the footer of https://ideabosco.com/ says "IDEA Portal v1.2478 · 44a7b27 · Oct 22, 2026", which is idea-app main before this round (the queue's own commit). This push deploys on its own; the version after it is in the session's final report, not here.

## For Mr. Pina

1. **Publish v0.4.2.** Open https://github.com/pina-hash/idea-armory/releases/new, click **Choose a tag**, type `v0.4.2`, click **Create new tag: v0.4.2 on publish**, leave **Target** on `main`. In **Release title** type `IDEA Armory v0.4.2`, leave the description empty, leave **Set as the latest release** checked, click **Publish release**. The **Agent release** workflow attaches the files in about 40 minutes; computers on 0.4.1 update by themselves.
2. **Computers still on 0.3.x** (they cannot update themselves). Each one reported 0.3.3 or older in an incident this week, with no 0.4.1 report since: **IDEA-00, IDEA-06, IDEA-12, IDEA-16, IDEA-20, DESKTOP-DJ6VNO6, DESKTOP-PFH54TK, DESKTOP-F41DB2R, DESKTOP-LQIVMLN** (0.3.3) and **DESKTOP-QH30N35** (0.3.2). IDEA-06 reported 0.4.1 for Abraham at 21:19 UTC and 0.3.3 for Ethan Su at 22:54 UTC: either Ethan uses another Windows account there (Armory installs per Windows account) or a second computer is imaged as IDEA-06. Run the installer under every Windows account a computer uses. On each: download `IDEAArmory-win-Setup.exe` from the v0.4.2 release (copy it to a flash drive for the lab), sign in to Windows as that account, double-click it; at "Windows protected your PC" click **More info**, then **Run anyway**. It keeps the folder, files and sign-in.
3. **IDEA-06 after 0.4.2 arrives**: open Armory as Abraham. If the Armory folder is still `C:\IDEA\Armory\FRC 2026 Off-Season`, the card "Armory's folder is inside the FRC 2026 Off-Season project folder" shows; close SolidWorks and click **Fix it**. It is safe whether or not the stray folder was already moved to `C:\IDEA\Armory-old-IDEA06`. Anything changed in both places lands in `C:\IDEA\Armory kept copies <date>`.
4. Close the incidents and note 62ba98eb in the feedback console from the tables above once v0.4.2 is published (this round marked nothing).
