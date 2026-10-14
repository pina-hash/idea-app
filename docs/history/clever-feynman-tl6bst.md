---
title: "Ledger 0381: the 2026-10-14 exports validated, the gaps finished, and progressive feedback built (0238) (`claude/clever-feynman-tl6bst`)"
date: 2026-10-14
branches: [claude/clever-feynman-tl6bst]
migrations: ["0238"]
subsystems: [Classroom, Feedback, HTML assignments, Home, Admin, Foundry, Armory, Tournaments, Migrations, Standards]
---

Mr. Pina attached three feedback exports (19 reports from 2026-10-03 to 10-07, 26
from 10-07 to 10-14, and one long-term idea) and asked for three things in order:
validate that every request had been fully and properly built, finish what had not,
then build the progressive feedback engine (report 6b814ca1). Mid-session he added
three more: the class banner was "still glitching and pausing" and should loop
smoothly, a self-contained HTML standards document he can hand to any Claude chat
that builds an HTML assignment, and the removal of the one-migration-per-bundle rule.

## How the validation was done

Six read-only agents each took one cluster (classroom grading and item page, the
class page, Armory, home and admin, feedback console and misc, Foundry) with an
instruction not to trust the earlier history entries (0368, 0380) and to trace the
real routes, components and SQL. Each report came back DONE, PARTIAL or MISSING
with file and line evidence. The ones not DONE were then built here.

## What was not done, and what this bundle did about it

| Report | Verdict | What was built |
| --- | --- | --- |
| 4c614121 class banner animation | MISSING (by design it did not loop) | The pattern flows continuously: a registered property runs one period of the repeating gradient, linearly, phase-locked to the wall clock; Display settings has "Class banner motion" (Moving, Still) and `reduce` stops it (decision 61). |
| db499adb dead space on full screen | MISSING | `.cr-root` points `--measure-split` at `--measure-console`, the class list resizes from 16 to 120rem with the window's own maximum announced, and the list lays its units in columns by its own width. |
| c0964d99 rubric rail at 2560 | PARTIAL | The rubric has a separator like the class list's: drag, keys, Enter to reset, per-device width, keys inert while it is hidden. |
| e32659e9 finished work reading Missing | PARTIAL | 0238 part B: completion is judged against the worksheet's past manifests too, the grading console stamps a finish it finds (`classroom_worksheet_latch_for`), and the Grades tab counts a finished, ungraded worksheet as awaiting a grade. |
| 939e53d1, b4fd83d4, 4895b22f home and dashboard dead space | PARTIAL | The home spreads across wide screens, comfortable cards are wider, the dashboard and the roster lay out in columns. |
| 125e674f hide or show apps | DONE with a defect | The hidden apps fold closed with their count outside. |
| 48bdb5be all apps look the same on Space White | PARTIAL | Every app card has its own Space White ink, every pair at least 10 apart in CIEDE2000 (decision 62). |
| 403d1646 "Get the Windows app" | PARTIAL, a real defect | The download anchors carry `data-sveltekit-reload`, so the browser takes the file rather than the router taking the page. |
| c1904a7f Armory team list | DONE with a defect | Two columns at 72rem and up, aligned. |
| f62ce574 bulk Force check in | DONE | Arming now keys on the set of ids, so a re-read does not disarm it. |
| 415af89e featured row | DONE, empty until picked | The row fills from Most played and Trending with no picks (decision 63). |
| c5f811e4 edit house card details | PARTIAL | The house and major-release cards show their description; the admin copy says what each field changes. |
| 793dcd96 centre the tournament header | MISSING | Centred under the site plate. |
| 5ab3adb6 dictation | PARTIAL | Asked and answered: it stays on the browser's own recognition (decision 66); nothing moved. |
| changelog | (raised in the round) | Bookkeeping commits are hidden and each update shows its body's bullet list (decision 64). |
| 3d9e02d1 camera button on a phone | Plausible reading, unconfirmed | Left as it is and named in the report to Mr. Pina, because the report does not say which button. |

Everything else in the three exports was verified DONE in the code: the HTML
download from the edit form (daaaaed1), a refresh keeping the student being graded
(b31afb76), pictures inside the worksheet and the viewer (6a8e90e0), the in-document
download (787862db), the feedback console's multi-select filters and report editing
(15a6d687, 45b78498, d362bfb3), VANGUARD's death rule as decided (3b56fb50), the
Armory people search (d8810fd5), and the Foundry's major releases, schedules and votes
(927b1c69, 84e293d4, 8274b260).

## Progressive feedback (report 6b814ca1, decision 60)

Mr. Pina's answers fixed the shape: in place AND in a list; back and forth, a Fixed it
button and seen; one place to manage everything; ported HTML worksheets first.

- **0238 part A** adds two tables (threads and messages, RLS on, no policy, no grant)
  and seven definer functions. One function says which side a caller is
  (`_classroom_feedback_role`). A drawing is a closed vector shape on the picture's own
  0..10000 coordinates, only on this student's hand-in on this item. Nothing is
  deleted. `seen` never moves `updated_at`.
- **Part C** makes the heartbeat the student page already sends answer `feedback_at`,
  so the item page's spent call budget is untouched: the student re-reads only when
  that instant moves, and a payload-free `feedback` live notice makes it immediate.
- **The client**: `notes.ts` (pure rules: status per side, attention, pins per field,
  drawings matched by picture URL, the inbox views, the client mirror of the marks
  gate), `transports.ts` (the RPCs, and an in-memory twin that enforces what a surface
  can see), `session.svelte.ts` (one state per person per work), `FeedbackPanel`,
  `FeedbackThreadView`, `Annotator` (a modal drawing tool: pen, arrow, box, circle,
  label, six colours, three widths, undo, redo, clear), `MarkLayer`, `MarkedPicture`,
  `FeedbackDrawing`, `FeedbackInbox`.
- **In place**: a worksheet reports where an answer sits with `idea:field-box` (the
  `idea:image-box` shape and rule); the frame draws a worded 44px pin there for a
  field with an open note, and lays drawings over the student's stored pictures. The
  parent tells the document which fields have a note with the advisory
  `idea:feedback` (names only). The conversation is always parent chrome.
- **Wiring**: the student's item page builds the session beside the answers
  controller and lists the notes above the worksheet; both grading consoles hand the
  console the instructor's transports, which renders the composer, threads and drawing
  tool for the open student and passes pins and drawings to the frame through the
  `htmlWork` snippet's new second argument. `/classroom/student-feedback` is the inbox,
  a staff door in the palette (`go.feedback`), 404 to anybody who manages no class.
- **Defects found by its own tests**: `refusalOf` used `in`, so a reason of
  `constructor` read as a real refusal (now `Object.hasOwn`); the inbox counted a
  resolved, unread note under "Needs you" (now `wantsAttention` excludes resolved); and
  the dev harness crashed the dev server by reading `page.url` from a `.then` that
  landed after the server render (reads now start in `onMount`).

## The one-migration rule (decision 65)

`tools/apply-migration.mjs` now lets a ledger entry apply as many migrations as its
`Claims:` line names, each once, still one file per apply and still the lowest
unapplied; `migrate.yml` dispatches itself again after a clean apply. `IDEA_instructions.md`
4.33, the ledger README template and the feedback-round skill say so.

## The HTML assignment brief

`docs/standards/IDEA_HTML_ASSIGNMENT_BRIEF.md` is the one self-contained file to hand a
Claude chat that builds a ported HTML assignment: the sandbox's limits, the manifest,
every bridge message both ways, the bridge client and the three reporters to copy, the
layout and hand-in rules, and the checklist. AUTHORING 1.24 adds section 10c (the
field-box reporter) and SPEC 1.8 adds the two new messages.

## What was measured

- `svelte-check`: 0 errors, 37 warnings in 20 files (the baseline), with placeholder
  environment values exported before the sync.
- Visual pass, `progressive-feedback`: 38 measurements at 375 and 1440, 0 outside
  threshold. Two pins, each inside the frame beside its own answer; the drawing (3
  shapes) inside its picture's box; every pin and note key 44px tall (smallest pin
  103.4x44); note words 14.5:1, place 7.27:1, status and pin words 15.42:1 on the room's
  ground; no horizontal scroll; no student instructor control (0 composer, 0 Resolve,
  0 Remove, 0 drawing keys against 2 Fixed it).
- The grading harness with and without feedback: 1 panel, 1 composer, 1 thread, 1 draw
  key and 1 picture key with it; 0 of each without it; no horizontal scroll at 375 or
  1440.
- Driven in Chromium: a pin press focuses its note; a reply moves the student's status
  to "Waiting on your teacher" and Fixed it to "You said fixed" with Not fixed yet
  offered; the drawing tool saved one box with words and the note and the frame both
  carried it (4 shapes over the picture with the seed's 3); a plain note on the team
  name got its own pin; the inbox opened on Needs you, filtered, opened a thread with
  its work link and searched. The drawing tool at 375: the dialog fills the window with
  no overflow and every key at 44px.
- `tests/db/progressive-feedback-0238.test.ts` (18): both sides of every permission
  boundary, the marks gate with FALSE never NULL, and the client mirror agreeing with
  the gate case for case (20 cases, both sides of the line). The four permissive
  mutants of the earlier proof were all killed.
- `tests/classroom-feedback-notes.test.ts` (16), `tests/html-assignment-field-box.test.ts`,
  `tests/dom/feedback-panel-roles-mount.test.ts` (6: both sides' controls by count, no
  panel for a student with no notes or on a site without 0238, reply and Fixed it on the
  real buttons, seen stamped without moving activity time, a burst of reads folded to
  two).

## NOT verified

- Nothing against production: 0238 is unapplied, no session can reach the database,
  and every surface degrades on PGRST202/42883 until it is applied.
- The live notice between two real browsers (only the in-memory bus was driven).
- A real ported document reporting `idea:field-box`: only the dev fixture does, so on
  today's posted worksheets every note is in the list and pins appear once a document
  is re-uploaded with the reporter.
- Space White for the new feedback surfaces (the dark room was measured).
- The drawing tool with a pen or a touch screen; only a mouse drag was driven.

## Deferred

- Feedback on spec assignments, notebook entries and plain hand-ins (decision 60's
  scope is ported worksheets first).
- Notes beside each answer in the grading console's Answers view (the list covers it).
- Showing a drawing inside the classroom Lightbox (the note's own enlarge shows it).
