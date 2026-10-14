---
title: "Ledger 0380: the 2026-10-14 overnight feedback round, 24 reports, one migration (0237) (`claude/awesome-planck-yb2spz`)"
date: 2026-10-14
branches: [claude/awesome-planck-yb2spz]
migrations: ["0237"]
subsystems: [Classroom, Armory, Foundry, Home, Admin, Feedback, Hall pass]
---

One unattended run over the 24 reports in the 2026-10-14 05:10 UTC feedback
export (Mode: solo, straight to `main`, one migration, 0237). Tier 1 and Tier 2
went to `main` as a checkpoint (`05764a14`) and were serving before Tier 3 was
finished; Tier 3 and its single migration went up in the second push.

## Root cause of item 1 (report e32659e9), in two sentences

A ported worksheet's completion is DERIVED on every read from the manifest it has
today, so the day an author adds a required block, raises a `minSentences` or
drops an `optional` (Hook 03 Stage 4, commit `a7bf412`, did the first) every
student who had finished is judged against a worksheet they never saw and reads
Missing or In progress on every surface at once. The fix keeps the first moment a
student's own load found the worksheet complete (`classroom_worksheet_latches`,
0237) and readers take the union, earlier instant wins, so a later edit can
neither un-finish a worksheet nor make it late.

NOT done, and said plainly: a SPEC assignment still has no derived completion
(decision 37's definer function was never written), and the Grades tab and the
teacher's home tally still do not count a finished worksheet. Both are named in
CLAUDE.md and are bigger than this report. The latch is a label only: it never
moves a submission to `submitted`, which would lock saves.

## The 24 reports

| Report | Item | Result |
|---|---|---|
| e32659e9 | 1 finished assignments read missing | **done** (latch, read on every surface; partial as above) |
| 403d1646 | 2 Armory "Get the Windows app" wrong file | **done** (`pickInstaller`, one function for the button and the download page) |
| b31afb76 | 3 grading refresh loses the student | **done** (`?student=` token, restored through the unsaved-work guard) |
| 4895b22f, b4fd83d4 | 4 comfortable home view dead space | **done** (grid cards, all 12 measured 78px) |
| 48bdb5be | 5 all apps look the same in white mode | **done** (per-card light twins; decision 55 amended) |
| 0e62e338 | 6 print uses too much ink | **done** (white paper, black ink, no backgrounds, no avatars) |
| bb3ce4a0 | 7 profile menu on top | **done** (global header layering) |
| c0964d99 | 8 rubric rail collapse/resize | **done** (normal, narrow, hidden; remembered; the class pane's own size keys) |
| 939e53d1 | 9 admin console dead space | **done** (multicol console, roster spans) |
| c1904a7f | 10 Armory team list compact | **done** (18 members average 74px at 1440) |
| f62ce574 | 11 Armory bulk force check in | **done** (`armory_break_locks`, 500 a call, per-file fallback) |
| 15a6d687, 45b78498 | 12 incidents multi-select filters | **done** (all four, and the Armory notes console) |
| 3d9e02d1 | 13 camera button on phones | **done as a default**: there is no camera control in the Foundry; the only bottom-corner phone control is the Feedback pill, so it is now 48px and 1.5rem above the edge |
| 5ba5f38b | 14 instructors edit team subtitles | **done** (no column needed: the style write already carries the tagline) |
| daaaaed1 | 15 download the original HTML | **done** (the stored document is the upload verbatim since 0195, so older posts work too; nothing new stored) |
| 7348d14c | 16 hall pass time budget | **done** (0237 part B; decision 58) |
| 84e293d4 | 17 Foundry class schedule | **done** (0237 part C; decision 59) |
| c5f811e4 | 18 edit major release details | **done** (0237 part D; `/foundry/review/gallery`) |
| 762bb647 | 19 collections | **done** (0237 part E) |
| 762bb647 (second half) | 20 publisher search by name | **done** (0237 part F) |
| 8274b260 | 21 upvotes | **done** (0237 part G) |
| 415af89e | 22 featured row | **done** (0237 part H) |
| 125e674f | 23 hide or show apps on home | **done** (per user, persisted in the existing preferences store) |

Nothing was "already shipped" and nothing was "not reached".

## Defaults chosen where the spec was silent (each is one line to change)

- Hall pass: the budget is per class; it starts at the apply instant (nothing is charged retroactively); the auto check in is lazy, on the next read, and records the close AT the cap; a hand send-out ignores the student's budget but is charged to it; a day is the Los Angeles day (decision 58).
- Foundry schedule: weekdays are ISO (Monday 1), times are on the school clock, a date with any exception row ignores the weekly pattern, and a hand open holds until the current window ends (decision 59).
- Gallery curation: collections delete for real; the featured row has at most 12 picks and fills to 6 from Most played and Trending, skipping apps nobody has played or voted on, and is absent with no picks; thumbnails go in `foundry-covers` under the admin's own folder (no new bucket, no new storage policy).
- Votes: a student cannot vote on their own game; no read shows who voted or an up/down split; net votes drive a new Most liked order and add this week's net to Trending.
- Item 13 resolved as described in the table; item 14 needed no column.

## What was measured

- `svelte-check`: 0 errors, 37 warnings, 20 files, the baseline.
- Full `npm test`: 733 of 744 files passed on the first full run; the failures were this round's own (fixed: a sequence grant from an identity column, the sort-order lists, the browser-verify README count, a stub that did not know the new reads, the hairline and boundary balance) plus three files that need a non-shallow checkout (they pass with full history) and `migrations-applied-record`, which reddens in the window between the push and the record `migrate.yml` writes.
- Chromium at 393 and 1920: the gallery with every curation layer (no horizontal scroll, no control under 44px), the curation and schedule editors, the hall pass card in three states, the home screen hide and show flow, Space White cards (8 distinct title colours), the print ink probe, Armory team and bulk check ins, the admin console, the grading rubric rail.
- New tests: the 0237 DB suites (`feedback-round-0380-latch-and-hallpass`, `feedback-round-0380-foundry`: pinned instants, both directions on every gate, the file's own scan and paste trap with planted controls, idempotent re-apply), pure suites for the gallery layers and the schedule, DOM mounts for the vote keys, collection card, subject list, publisher search, schedule editor and the hall pass budget.

## NOT verified

- Production: no session here can sign in, and this container reaches the database only through CI. Nothing was run against the live Supabase project.
- Uploading a real thumbnail to `foundry-covers` from a browser (the path rule and the bucket policy were read, not exercised).
- iOS Safari for the Feedback pill's new position and for the schedule editor's time inputs.
- The Armory 500-id bulk call against the real function (only the chunking and the fallback were driven).

## Steps for Mr. Pina

1. Open https://ideabosco.com/foundry/review/gallery and pick the featured row, make a collection ("Ported games"), and give GREENLINE and VANGUARD a thumbnail.
2. Open https://ideabosco.com/foundry/classes and set a class's weekly times under "Class schedule".
3. Open https://ideabosco.com/foundry/review/publishers and add a publisher by typing a name.
4. In any class, open the hall pass: set the minutes a day and the auto check in time from the instructor card.
5. Open a worksheet that was showing Missing for a student who had finished it (the latch fills in the next time that student's page loads).
6. If anything looks wrong on the live site, https://vercel.com/dashboard shows the deploy.
