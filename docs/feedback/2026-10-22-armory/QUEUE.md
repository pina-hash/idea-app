# Armory field round, 2026-10-22 (ledger 0430)

Gathered by the IDEA & FRC chat on 2026-10-22 at 2:30 PM Pacific, through the IDEA Website connector
(`armory_app_feedback_admin_list`, `armory_app_incidents_admin_list`, `list_site_feedback`,
`armory_project_summaries`) and a look at IDEA-00's Armory window. Every open Armory item at that
moment is here. Times are UTC unless marked Pacific.

Mr. Pina, 2026-10-22: "fix all armory items that are currently in the logs and feedback as well".
He also asked for the two fixes found while diagnosing IDEA-06 (items 1 and 2).

## What is installed where (read before anything else)

- v0.4.1 was published 2026-10-21 (ledger 0424). 0.3.x cannot update itself; each computer needs
  `IDEAArmory-win-Setup.exe` from the v0.4.1 release run once (0424's "For Mr. Pina" item 2).
- Every incident below is from **0.3.3**. The one 0.4.1 report is note 62ba98eb
  (IDEA-06, 21:19 onward). IDEA-00, IDEA-06 (before 21:19), IDEA-12, IDEA-16, DESKTOP-DJ6VNO6 and
  DESKTOP-PFH54TK all reported as 0.3.3 today.
- So for every incident, first decide: already fixed in 0.4.1 (name the commit), or still present
  in 0.4.1 (fix it). Do not re-fix what 0.4.1 fixed.

## 1. A project folder chosen as the Armory folder (note 62ba98eb, IDEA-06, 0.4.1)

Abraham Jette-Kouri, filed 2026-10-22 21:20:55, kind idea, body "bruh", area "Home > FRC 2026
Off-Season". Full report: `note-62ba98eb-IDEA-06.json`; its log: `note-62ba98eb-IDEA-06.log`;
the window he saw: `idea-06-armory-home.png`.

What the log shows:
- 21:08:09 `settings saved: vault C:\IDEA\Armory\FRC 2026 Off-Season` (it had been
  `C:\Users\IDEA\Desktop\matthew g`; earlier on IDEA-06 it was `C:\IDEA\Armory`).
- Armory made `C:\IDEA\Armory\FRC 2026 Off-Season\FRC 2026 Off-Season\` and downloaded all 1,496
  project files into it (21:08 to 21:13, slowPass incident 28c4c6c6).
- The files already at `C:\IDEA\Armory\FRC 2026 Off-Season\00 Robot Assembly\...` became "outside
  every project": notice `cantSend`, count 1,498, each item "It is outside every project. Move it
  into one of your project folders so Armory can keep it."
- 0 uploads after the change. The server is untouched (project still 1,496 files).

Wanted:
- Settings refuses, or corrects to its parent, a folder that is a project folder or inside one
  (it holds Armory's own project marker, or its name matches a project the account is on and its
  contents match that project's tree). Say in one plain sentence what it did.
- A computer already in this state is detected on start and offered a one-click repair that moves
  Armory back to the parent and folds the doubled folder in without uploading duplicates and
  without losing any local edit (hash-compare; a differing local copy is kept as a kept copy, never
  overwritten). IDEA-06 is in this state now unless Mr. Pina has already moved the stray folders to
  `C:\IDEA\Armory-old-IDEA06` by hand (the chat told him to); the repair must be safe in both.
- Hundreds of "outside every project" files are ONE notice with one explanation and one action,
  never a per-file flood (his 2026-10-06 rule: thousands of files, minimal noise).

## 2. The problem list stops at 200 (IDEA-06 window)

The card says "1,498 files can't be uploaded" and the button says "SHOW THE 200 FILES". Every file
must be reachable: grouped by reason, virtualized, counts that match. The report snapshot carried
only 20 items; check whether the 200 is a UI cap, an engine cap, or both.

## 3. Log and activity noise

- IDEA-06 0.4.1: `waiting: FRC 2026 Off-Season/00 Robot Assembly/F26-ROB-0142 Full Assembly.SLDASM:
  The process cannot access the file ...` written every ~3.3 s for as long as SolidWorks holds it
  (60 lines in 4 minutes; the 200-line log tail was almost all this). Log a held file once, then on
  change.
- IDEA-00 (0.3.3, `idea-00-armory-home.jpg`): "What Armory is doing" shows "Asking Armory what
  changed" every 3 to 4 s. Check 0.4.1; an idle loop should not fill the panel.
- IDEA-06 0.3.3: `solidworks:  changed` with an empty file name (five times, 18:31 to 18:34). Find
  why the name is empty.
- `open files: The process cannot access ... (103 more like it since the last one)` is good; the
  `waiting:` and `sync:` lines need the same treatment.

## 4. Incidents (all status new)

| id | kind | device | who | version | summary |
|---|---|---|---|---|---|
| f17e6e41 | slowPass | DESKTOP-DJ6VNO6 | Landon Mercado | 0.3.3 | loop pass 852.1 s, 0 work |
| 55f64e94 | slowPass | IDEA-00 | Mr. Pina | 0.3.3 | loop pass 808.0 s, 0 work |
| 28c4c6c6 | slowPass | IDEA-06 | Abraham Jette-Kouri | 0.3.3 | loop pass 61.8 s, 486 downloaded (item 1's mass download) |
| a346fd0c | slowAction | IDEA-06 | Abraham Jette-Kouri | 0.3.3 | checkOut (1 target) waited 16.1 s |
| 14ceca64 | crash | IDEA-16 | Sebastian Chaidez | 0.3.3 | previous run ended unexpectedly; last line a loop pass that took 1,527,040 ms with 0 work |
| ddde51b0 | crash | IDEA-06 | mc (mchen.2030) | 0.3.3 | ended unexpectedly; last line a 17 s idle pass |
| b8aef460 | crash | IDEA-06 | mc | 0.3.3 | same, 16.5 s idle pass |
| f01b8281 | crash | IDEA-06 | Ethan Su | 0.3.3 | same, 63.8 s idle pass |
| 9b8ae1e5 | slowPass | IDEA-06 | Ethan Su | 0.3.3 | loop pass 846.8 s, 0 work |
| 3e9d9aad | slowPass | IDEA-06 | Lenin Casillas | 0.3.3 | 135.7 s, 0 work |
| 9931fb0d | slowPass | IDEA-06 | Tempe Bushman | 0.3.3 | 63.8 s, 0 work |
| d0d601c5 | crash | IDEA-06 | mc | 0.3.3 | ended unexpectedly; 15 s idle pass |
| 1cf2e24e | crash | IDEA-06 | Kelan Duenas | 0.3.3 | ended unexpectedly; 18.3 s idle pass |
| 2879a06d | crash | IDEA-06 | Isaiah Badillo | 0.3.3 | ended unexpectedly; 17.1 s idle pass |
| cf81b8e7 | slowPass | DESKTOP-PFH54TK | Zayuri Rosas-Garcia | 0.3.3 | 551.0 s, 0 work |
| d9afe137 | crash | IDEA-06 | Kelan Duenas | 0.3.3 | ended unexpectedly; 15.2 s idle pass |
| 5168471b | slowPass | DESKTOP-PFH54TK | Zayuri Rosas-Garcia | 0.3.3 | 278.6 s, 0 work |
| dd6b9bd1 | slowPass | IDEA-06 | mc | 0.3.3 | 63.8 s, 0 work |
| 46c75d31 | slowAction | IDEA-06 | Lance Y | 0.3.3 | checkOut (1 target) waited 307.5 s |
| 1d333f64 | slowPass | IDEA-06 | Lance Y | 0.3.3 | action pass 307.3 s, 0 work |
| 9de5e9a5 | repeatedFailure | IDEA-06 | Tempe Bushman | 0.3.3 | Blade Team 3/OIB-Body_Template-2.0.SLDPRT failed 3 times: held by another process |
| 3a314848 | repeatedFailure | DESKTOP-DJ6VNO6 | Landon Mercado | 0.3.3 | Blade Team 7/jolliwarmech assembly.SLDASM failed 3 times: held by another process |
| 72841928 | crash | IDEA-12 | Judith Mederos | 0.3.3 | ended unexpectedly; last line an incident upload |
| e83b02f8 | crash | IDEA-06 | Ethan Valdez | 0.3.3 | ended unexpectedly; 43.4 s idle pass |
| 18006c14, d704a78c, 7b429618, 65822650, e494d9dd, fc84c35b, e06e5c80, 1407f7a6, 3af247d8, 2d4560d3, 2cc16e09, 95949852, bb9a7388, fc7add65, bba3afdb | slowPass | IDEA-06 | Ethan Valdez (one mc) | 0.3.3 | idle loop passes of 60 to 1,369.9 s, 0 work, overnight 05:11 to 14:38 |
| 7780af88 | crash | IDEA-06 | Farzad Ahmed | 0.3.3 | ended unexpectedly; last line a loop pass of 9,492,234 ms (2.6 h) with 0 work |

Questions the session answers:
- Idle passes of minutes to hours with zero work: is this 0.4.1's quiet-scan fix (0424 item 2), or
  something else (sleep, a held lock, a network wait, a lab computer's virus scanner)? An idle pass
  that slow on 0.4.1 is a bug to fix; a pass that spans the computer sleeping is not a slow pass and
  must not file an incident.
- "Ended unexpectedly" on lab computers: a real crash, or Windows signing the student out (lab
  computers are shared; 0.3.3 logged `windows is ending the session (SystemShutdown)` only for
  shutdown)? A sign-out or log-off that ends Armory is not a crash and must not file one.
- slowPass on a pass that did real work (28c4c6c6: 486 downloads in 61.8 s) is not slow. Judge by
  time per unit of work, not wall time.
- A file held open by SolidWorks (9de5e9a5, 3a314848) is "waiting", not a repeated failure.
- checkOut waits of 16 to 307 s: is 0424 item 3 the whole fix?
- Incidents a later version fixed: the session marks nothing itself; it lists which ids each fix
  answers so the chat can close them.

## 5. Device identity churn (IDEA-06 log)

Two sign-ins two minutes apart on the same computer got different DeviceIds (21:07:46
e4755527-..., 21:09:54 8b906ba1-...). Find whether that is by design (per-student profiles on one
computer) or a defect that splits one computer's history and presence.

## 6. Website feedback ba81c57d (Abraham Jette-Kouri, 19:21:32, page /armory/[project]/file/[file], kind idea, long term)

Word for word: "Can you please make the IDEA library on the website more streamlined so I can open
documents directly from it instead of having to open the app? Also can you please find a way to
connect the armory stocks in such a way to where It can detect when a file is opened from a
computer or when a file is saved. Please just make the stocks for the armory not reliant on the
website because most things on the foundry do not involve the site."

Armory part, in scope: an "Open" on a file's website page that opens it in SolidWorks through the
installed app (a registered link the app answers, with the same check-out rules as opening from the
app), and a clear fallback when the app is not installed. The "stocks" part belongs to the IDEA
Coin feedback stock market, not Armory: out of scope here; leave it for the coin work.

## Not in scope

- The SolidWorks 2026 notice on IDEA-00 ("5 files in Blade Team Demo were saved in SolidWorks
  2026") is correct behavior (0288).
- Lab computers still on 0.3.3 are installed by hand (see the top). The session reports which
  computers have reported a version below the one it ships, from what the connector or server can
  read, so Mr. Pina has a list.
