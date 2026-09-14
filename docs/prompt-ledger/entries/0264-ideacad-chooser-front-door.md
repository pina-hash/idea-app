# 0264 IdeaCAD chooser: a real front door
- Issued: 2026-09-14T07:15:00Z
- By: Claude Code session
- Owns: `src/routes/ideacad/**`, `src/lib/ideacad/app/IdeaCadApp.svelte`, `src/lib/ideacad/app/types.ts`, their tests (`tests/ideacad-chooser.test.ts`, `tests/ideacad-chooser-render.test.ts`, `tools/browser-verify/routes/ideacad-preview-chooser*.mjs` (3 specs)), `docs/prompt-ledger/entries/0264-*`, `docs/history/laughing-archimedes-y0lh8j.md`
- Migration permitted: no. Claims: none. Highest on origin/main at issue: `eabed62`
- Status: pushed
- Branch: `claude/laughing-archimedes-y0lh8j`
- Notes: No `ui/`, `viewport/`, `blade/`, `BladeEditor.svelte`, `ideacad.css`, `store.ts`,
  `transports.ts`, `workspaces.ts`, `src/app.css` or `src/lib/classroom/**` file changed; the
  lane imports from `ui/feature-model.ts`, `archive-transports.ts`, `sharing.ts` and
  `blade/workspace.ts` and edits none of them.
- THREE OF THE SEVEN ASKS ARE NOT RENDERING DECISIONS AND WERE NOT SHIPPED. Rename,
  duplicate and delete each need a migration this lane was not permitted:
  `ideacad_documents` has no name column (a title IS `classroom_items.title`),
  `unique(item_id, student_email)` makes a second document per assignment impossible by
  construction, and decision 29 is archive-never-delete with `ideacad_set_document_archived`
  the only path, gated on `_classroom_manages_item`. That path IS shipped, confirmed,
  with a sentence saying nothing is deleted. The reasoning is in `app/types.ts`'s own
  header so the next session starts from the schema rather than from this line.
