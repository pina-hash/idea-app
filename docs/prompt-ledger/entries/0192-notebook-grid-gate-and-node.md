# 0192 Notebook spreadsheet: the gate migration, the ProseMirror grid node and its NodeView

- Issued: 2026-09-12T20:30:00Z
- By: router chat
- Owns: `supabase/migrations/0210_*.sql`, the grid node and NodeView under
  `src/lib/notebook/`, `tests/db/notebook-sheet*`, `tests/dom/notebook-sheet*`,
  `tools/browser-verify/routes/notebook*.mjs` and its measured store entries,
  `docs/decisions/entries/08-*`, `docs/prompt-ledger/entries/0192-*`, and its own
  `docs/history/` entry.
- Migration permitted: exactly one. Claims: 0210. Highest on origin/main at issue: 0208
- Status: issued
- Branch: claude/determined-albattani-16az27 (cut from origin/integration 7f5ca8f0)
- Notes: THE THIRD AND LAST PIECE of decision 08. Ledger 0180 audited it and
  measured the blocker against real PostgreSQL 17.10; ledger 0187 built the
  formula engine (`src/lib/notebook/formula/**`, which this bundle IMPORTS and
  must not touch). What is left is the gate and the editor node.

  `0209` is claimed by ledger 0189, in flight, which is why this claims `0210`
  with a one-number gap and not the tool's `next free`.

  THREE THINGS, in dependency order. (1) The gate migration lands ALONE, before
  any producer can emit the shape: `_notebook_note_content_ok` (`0125:206`)
  answers FALSE for `sheet`, `table` and `grid`, and its obligation outranks the
  widening -- it must answer every already-stored note exactly as the deployed
  gate does, proven by putting a corpus to the deployed function first, applying
  over the same database, and comparing case for case. (2) The text floor
  (`0125:285`) is a DECISION to state in writing: a student who builds a
  materials table and writes no sentences is the ordinary case, so leaving
  `v_total > 0` alone ships a spreadsheet that cannot be saved on its own.
  Ledger 0187 named three answers and recommended counting a grid's own cell
  text toward `v_total`. (3) The grid goes INSIDE ProseMirror as a custom node,
  not beside the editor: `NoteEditor.svelte:202` is
  `StarterKit.configure(NOTE_SCHEMA_OPTIONS)` and `history` is not one of the
  eight extensions switched off, so beside the editor there is no undo at all
  and a second stack interleaves wrongly. Mr. Pina's bar is a bar about undo.

  TWO THINGS TO DECIDE AND STATE: whether a cell edit is one transaction or one
  per keystroke, and how the node's attributes serialise, where `0195`'s
  manifest is the precedent -- ONE BLOCK OWNS THE WHOLE GRID, never a block per
  cell, because a per-cell id in a note is the same orphaning against
  `notebook_entry_notes` that `0128`'s real port produced.

  Autosave and conflict need nothing (`EntryNotes.svelte:162` is
  `autosave: false`; `0129`'s coalescing covers the draft path). Follow `0166`'s
  grant shape: revoke from `public, anon, authenticated` BY NAME.
