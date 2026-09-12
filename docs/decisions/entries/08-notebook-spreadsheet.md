# 08 Notebook: a spreadsheet
- Raised: 2026-08-31  By: chat "Managing multiple FRC platform projects"
- Status: decided 2026-09-12, and now blocked again on a second question (the formula engine)
- Decision: **A REAL SPREADSHEET INSIDE A NOTE.** Rows, columns, and a working
  formula engine. Explicitly NOT a table: Mr. Pina said he dislikes how Google Docs
  tables behave and does not want that shape. His bar is that it must work as well
  inside a note as the text editing currently does.
- Default this assistant would pick: (superseded) A table inside a note; ask before anything larger.
- Why it is blocked on him: (answered for the shape) The larger reading was the right one.
  **A SECOND DECISION IS NOW OPEN AND IS ALSO HIS: which formula engine, or none.**
  See ledger `0180` and `docs/history/kind-mayer-c2sn88.md` for the audit; the short
  form is that the only actively-maintained engine with a real dependency graph
  (HyperFormula) is **GPL-3.0-only**, which is a licensing decision about a public
  repository and not a technical one.
- What it unblocks: the build. It is a MIGRATION lane first and a rendering lane second,
  in that order, and the two cannot be folded together (see the gate below).
- Context: `src/lib/notebook-notes.ts:67` (the closed `NoteBlock` union),
  `supabase/migrations/0125_notebook_run_text_parity.sql:206`
  (`_notebook_note_content_ok`, the note's real gate), `CLAUDE.md`,
  "Rendering untrusted content" (three gates, and the gate widens in its own bundle
  before any producer emits the shape).
- **CORRECTION (2026-09-12, ledger 0180). THIS ENTRY NAMED THE WRONG GATE and the
  error was load-bearing.** The line above read "`_classroom_doc_ok` widened first".
  A note's content gate is **`_notebook_note_content_ok`**, not `_classroom_doc_ok`;
  ledger 0173 measured this first and 0180 confirmed it behaviourally. The two are
  different functions with different vocabularies, and widening `_classroom_doc_ok`
  -- which is the pure predicate `notebook_sessions.guidance_doc` and the classroom
  share -- would have changed nothing about whether a note can hold a grid. A lane
  that had acted on this entry as written would have written the wrong migration.
- Tree check (2026-09-02): no table node exists in the rich-text schema, so either reading is a new build.
- Tree check (2026-09-12, measured not read): still no table or grid block anywhere in
  the notebook -- `NoteBlock` is `p | ul | ol` and `NoteContent.svelte` walks exactly
  those three. `_notebook_note_content_ok` ends in `else return false` on any unknown
  block type, so **the database refuses a grid outright**: measured against the real
  migration chain on PostgreSQL 17.10, a `sheet`, `table` and `grid` block each answer
  **`false`** (false, not NULL -- 0125 closed that hole), as does a `p` carrying an extra
  key and a run carrying an extra key. **A spreadsheet in a note therefore CANNOT ship
  without a migration**, and that migration is a widening that must land alone, before
  anything can emit the shape.
