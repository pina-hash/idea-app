---
title: "Ledger 0431: HTML assignments -- a duplicate keeps its document, every document exports to the repo with a one-time backfill, closing flips an open worksheet live, full page, and Answers left as a list that jumps (migration 0298)"
date: 2026-10-23
branches: [main]
migrations: ["0298"]
subsystems: [Classroom, HTML assignments, Connector]
---

A solo session on main, beside 0432 and 0433 in their own worktrees. The queue
is docs/feedback/2026-10-23/QUEUE.md, items 1 to 5; the account Mr. Pina reads
is docs/feedback/2026-10-23/RESULTS-0431.md, which also carries the read-only
SELECT for duplicates already left empty.

### Found before building

- `classroom_duplicate_item` was last defined in 0193 and copied the spec,
  rubric and reference spec but never `classroom_html_assignments` nor
  `assignment_schema_version` (nor an IdeaCAD editor). 0268's trigger comment
  named "a duplicate" as a document write, which was false. The connector's
  `duplicate_post` maps to the same function (registry/classroom.yaml).
- The export in `src/lib/server/classroom-export.ts` read only specs; an HTML
  item answered `skipped: no_spec`. It runs as the caller, fired by the client
  after a write (`pingClassroomExport`).
- The frame's lock came from `engine.submission` at page load, nothing re-read
  it, and the item page's call budget is pinned by tests/classroom-poll.test.ts.
  The heartbeat already carried `feedback_at` (0238), which is the precedent.
- "Answers left" was the Progress rail's module chips (`hxProgressModuleLine`),
  words only. No expand mode existed; Foundry's AppStage overlay is the pattern.

### Built

- 0298: `_classroom_duplicate_work_surface` (new, first object, private) and
  0193's duplicate body verbatim plus one call; 0238's ping body verbatim plus a
  `lock` key. Signatures unchanged, so no deploy ordering.
- Export: `readExportSubject` shared by the per-save export and
  `exportHtmlBackfill`; route `/api/classroom/export/html` (admin, 404 for
  anyone else), which the connector build turned into a generated route tool.
  The document's `material.json` has no export time, so reruns commit nothing.
- Live lock: beat `lock` key (`presenceLockOf`), the grading page's `lock`
  notice, and `onlocked` on a save refused as shut; `resendAfterReopen` sends
  what was typed after a close once it reopens; `ItemDetail` shows the unsaved
  text with Copy.
- Full page on `HtmlAssignmentFrame` (`expandable`, `chrome`, `onexpand`).
- `AnswersLeft.svelte` over `hxAnswersLeft`; `idea:focus` (`HX_FOCUS_TYPE`) and
  `focusField`; responders in `src/routes/hx/_documents.ts` and the kit's
  `kit.js` (starter rebuilt).

### Outside the prompt's Owns, said here so it is not invisible

`src/lib/classroom/live.ts` (one topic), `src/lib/classroom/presence/transports.ts`
(one optional callback and `presenceLockOf`), `src/routes/hx/_documents.ts`
(the dev fixture's focus responder), `tools/hx-kit/kit/kit.js` and the rebuilt
`tools/hx-kit/starter.html`, `src/routes/api/classroom/export/html/+server.ts`,
and `src/lib/classroom/transports.ts` (`createHtmlAssignmentTransports` pings
the export). None is in another session's area.

### Measured

See RESULTS-0431.md for the numbers; tests/db/classroom-duplicate-html-assignment.test.ts
and tests/html-assignment-export.test.ts each carry a mutation proof
(wrong section's document; one course folder for every item), both reddened
and both restored md5-identical.

### Not verified

The live database (no container reaches it), a real GitHub push of the
backfill, a signed-in student page against production, iOS WebKit for the
full-page `100dvh`, and the jump inside a live Unit 3 document (it needs the
document rebuilt on the kit and re-uploaded).

### Deferred

The connector's `replace_html_assignment` does not ping the export (connector
code, 0432's area): the backfill catches it up. A hand registry entry with good
words for the backfill tool. The probe fixture's new Chromium 153 CSP console
wording is not in the harness's ignore pattern (pre-existing, unrelated).
