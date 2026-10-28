---
title: "Assignment sources live in the repo; a library of modules is sized as one"
date: 2026-10-28
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

The FRC Classroom migration chat put all 13 FRC 2026/27 pages live on the 2.13 kit and could not archive them: the Drive connector refused files that large and Chrome would not upload from the session, so it handed Mr. Pina a zip to drag into Library C, against the project rule that he is never handed a file to upload. The day before, Launcher: Design's source existed nowhere this chat could reach and had to be rebuilt from the built page. Sources now go to `assignment-sources/<course>/<slug>.src.html` on main, committed by the authoring chat with the re-upload; Library C keeps a copy when it can. The repository is public; a source holds the manifest, rubric and page and never an answer, name or grade.

The same report carried a post-size WARN on every Training Library track ("12 classes against 4"), which is Part C judging a self-paced library as one deliverable. `<html data-post="library">` now turns those checks into an INFO line with the size.

Not changed: the kit cannot store one combined answer (a table plus ratings plus a date as one block); the FRC chat split Inspection Training's reports into a measurement block and a verdict block instead, which lost nothing because no student had answered. A combined block type would be a site change, not a kit one, and is not proposed here.
