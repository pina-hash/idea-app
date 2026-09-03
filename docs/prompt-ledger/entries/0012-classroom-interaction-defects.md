# 0012 Classroom: the typing collapse, the jumping list, and four smaller interaction defects
- Issued: 2026-09-02
- By: router chat for IDEA portal work
- Owns: `src/lib/classroom/ClassroomFeed.svelte`, `ClassView.svelte`, `ItemDetail.svelte`, `ItemBody.svelte`, `ContentComposer.svelte`, `RichTextEditor.svelte`, `src/routes/dev/classroom-interaction/**`, `tests/classroom-interaction-*`, `tests/dom/classroom-interaction-*`, `tools/browser-verify/routes/classroom-interaction-*.mjs`, the generated counts block in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0012-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0170
- Status: pushed
- Branch: claude/classroom-interaction-defects-xfjzpj
- Notes: Six instructor reports on the classroom feed and item surfaces. The
  first is a real reproducible defect and the rest are interaction quality.

  The one that matters: while typing, modules and dropdowns collapse on their
  own, the view is thrown to the bottom of the page, and the text box loses
  focus. That is work being interrupted mid-sentence and it is the single
  most disruptive thing reported about this surface.

  Deliberately excluded: any migration; `classroom.css`, whose 24px
  instructor density contract conflicts with the 44px tap floor as decision
  09; and the post organisation and sorting requests, which are a design
  question rather than a defect and are their own bundle.
