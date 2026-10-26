# Ledger 0438: the assignment header, HTML gaps, connector grading, slow profiles, presentation check-off

Gathered by the IDEA & FRC chat on 2026-10-26 from the site feedback list and the connector gaps. Mr. Pina chose these at 05:00 on 2026-10-26. **Items 1 to 4 must be live before first class on 2026-10-27**, when the Unit 4 team posts (ledger 0436) go up; item 5 is wanted by 2026-10-28, the first sign-off day. Land items 1 to 4 first, then 5. A second session (ledger 0439, the IDEA calendar) writes idea-app at the same time; see "Running beside 0439".

## 1. The assignment header when the title is hidden
- **3ac88030** (Mr. Pina, /classroom/[sectionId]/item/[itemId]): "when i hide the title, the decals the title goes between are still visible. they should vanish too. on top of that, this whole area is highly space inefficient. taking up the whole row area across the entire screen for what reads as a bunch of junk. the title hide function should also be hidden in edit assignment options, not taking up room on the assignment page." Screenshot: `3ac88030-hide-title.png` beside this file (ASSIGNMENT label, UPDATED chip, a "Show title" button, the empty slashed decal bar, the due/points/posted line, all on separate rows across the full width).
- **36198988** (Mr. Pina, same page): "There's an artifact from when the double title issue was resolved. Where no there's little artifact where the old title used to be when it tells the activated there's still a little visual artifact that takes up an unnecessary amount of space." Screenshot: `36198988-title-artifact.png` beside this file.
- Outcome: with the title hidden, the decals and the empty bar are gone and the header is one compact line; the hide-title switch moves into the edit assignment options. Measure at 375 and 1440 and report the header height before and after.

## 2. Three small HTML assignment gaps (4fbab5ca, Mr. Pina, from the 2026-10-22 site audit)
"(1) idea:team-progress is not re-sent after a document reloads in place (toldTeam is not reset on a second idea:ready, HtmlAssignmentFrame.svelte:600); (2) the cross-class grading console leaves retired blocks out of its Answers and Answers by question views, though the exports keep them; (3) no export carries teacher notes, and the Grades tab has no export."
- Ledger 0436 just added `idea:team-state` and `idea:team-tracker` to the frame; check (1) against those too, since a reload must re-send every team message, not only progress.

## 3. Full grading from the connector (6db4fbe5, Mr. Pina, and connector gap 8fd1c0bb)
- 6db4fbe5: "Full grading from the Claude connector, fast and in bulk. Claude must see every part of any IDEA assignment and every turned-in submission, then grade from my input. Today it can set rubrics, read text answers, read turn-in status and grade one or many students on the rubric, but it cannot: (1) read file and picture answers (DXF, slices, screenshots, sketch photos; open gap 8fd1c0bb), (2) read the files a student attached on a regular assignment, (3) read the assignment itself (the HTML worksheet and its questions), (4) read my earlier notes and grades on a submission. Also needed for speed: one grading packet read per assignment (questions, rubric, every student's answers and file links, status) so a whole class fits in one call, then Claude proposes every score held for my review and one bulk call returns them."
- 8fd1c0bb: "Read the file and picture answers on an HTML assignment (uploaded DXF, sliced file, screenshots, sketch photos): read_answers returns only text answers, so handed-in files cannot be checked from a chat."
- His words from the chat, 2026-10-26: "Claude should be able to see every single aspect and part of any single assignment and turned in on the IDEA website and grade it given my input... very fast in bulk."
- Files reach Claude as short-lived signed links (images it can view, other files it can fetch), never as bytes in the database answer. Team grading by role from 0436 (0305) must be reachable the same way. Mark gap 8fd1c0bb built in your record; Mr. Pina's chat flips its status.

## 4. Slow student profiles (a5f80fd7, Mr. Pina, /classroom/[sectionId]/people/[studentEmail])
"it takes a particularly long time to load student profiles". Measure first (query count and time on the db fixture, waterfall in the load), fix the cause, report before and after.

## 5. Presentation check-off and notes from the phone (68d4780e, Mr. Pina)
"Presentation check-off and notes from my phone. When students present on my computer I cannot take notes or check them off there, so I need it on a separate device. A presentation queue per class (order, who is up, next, done); on my phone I mark Presented, Absent or Redo, take notes while they talk, and can score the rubric live. Notes land as instructor notes on that student's submission so they show when I grade. Replaces fc83019d (check off a presentation after a student has gone)."
- His words from the chat, 2026-10-26: "take notes and check students off for presentations on my phone while they are giving the presentations."
- 375px is the primary width. Teams present together in Unit 4: a queue entry may be a team (0436's posted draw) as well as one student. Connector tools for the queue (who is up, mark presented, note) follow from the registry as usual.
- **Not in scope:** driving the projector from the phone (4b733980). The queue must not add a server channel to the projector view.

## Running beside 0439
Session 0439 (the IDEA calendar) owns its own new routes and tables. Both sessions touch `classroom-updates.json`, the generated connector files and possibly `src/routes/classroom/[sectionId]/+layout*`. Rebase before each push; regenerate generated files with the repo's own tool, never merge them by hand; a real content conflict in a hand-written file is a stop.
