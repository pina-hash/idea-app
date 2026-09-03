# 0026 Attachments and the composer: paste to upload, assignment thumbnails, format control
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `src/lib/file-drop.ts`, `ContentComposer.svelte`, `RichTextEditor.svelte`, `ItemBody.svelte`, the item card thumbnail in `ClassroomFeed.svelte`, `src/lib/classroom/attachments.ts` (conditional), `src/routes/dev/composer-attach/**`, `tests/classroom-file-drop.test.ts`, `tests/classroom-attachment-*`, `tests/dom/composer-attach*`, `tools/browser-verify/routes/composer-attach*.mjs`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0026-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0175
- Status: issued
- Branch: assigned by the harness
- Notes: Three instructor reports on one surface.

  Paste to upload should work everywhere a file can be attached. It works in
  some places today and not others, and an instructor cannot tell which from
  looking. `src/lib/file-drop.ts` already exists and prompt 0006 reused it
  rather than reimplementing, so the mechanism is there and the question is
  reach.

  Assignments want a thumbnail, so a feed of items is scannable rather than a
  wall of identical cards.

  And "format control" was reported without detail. Establish what was meant
  before building anything; a guess here produces a control nobody wanted.

  Deliberately excluded: the notebook's own paste and photo path, which is a
  different surface with a different contract; anything prompt 0012 touched
  in these files; and any migration.
