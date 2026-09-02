# 08 Notebook: a spreadsheet
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: open
- Decision:
- Default this assistant would pick: A table inside a note; ask before anything larger.
- Why it is blocked on him: A table inside a note and a spreadsheet-shaped entry are different projects and nothing distinguishes which he meant.
- What it unblocks: A notebook rich-text lane (a table node in `rich-text-schema.ts`, `_classroom_doc_ok` widened first, the renderer and both projections taught the node) or a much larger entry-kind lane.
- Context: `src/lib/rich-text-schema.ts` (the closed node union), `CLAUDE.md`, "Rendering untrusted content" (three gates, and the gate widens in its own bundle before any producer emits the shape).
- Tree check (2026-09-02): no table node exists in the rich-text schema, so either reading is a new build.
