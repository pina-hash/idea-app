# 0192 Notebook spreadsheet: the gate migration, the ProseMirror grid node and its NodeView

- Issued: 2026-09-12T20:30:00Z
- By: router chat
- Owns: `supabase/migrations/0210_*.sql`, the grid node and NodeView under
  `src/lib/notebook/`, `tests/db/notebook-sheet*`, `tests/dom/notebook-sheet*`,
  `tools/browser-verify/routes/notebook*.mjs` and its measured store entries,
  `docs/decisions/entries/08-*`, `docs/prompt-ledger/entries/0192-*`, and its own
  `docs/history/` entry.
- Migration permitted: exactly one. Claims: 0210. Highest on origin/main at issue: 0208
- Status: pushed
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

  **OUTCOME.** Landed as three pieces. `supabase/migrations/0210_notebook_note_grid.sql`
  widens the gate and adds `_notebook_note_grid_len`;
  `src/lib/notebook/grid/` is the shape's declaration, the ProseMirror node and
  its NodeView; `/dev/notebook-sheet` plus
  `tools/browser-verify/routes/notebook-sheet.mjs` is the browser pass.

  **The text floor took ledger 0187's first answer: a grid's own cell text counts
  toward `v_total`.** A note whose only content is a materials table saves; a grid
  with every cell empty is still refused, which is 0125's intent holding. The
  floor line is byte-identical to 0125's -- what widened is what feeds the total.

  **A cell edit is ONE transaction and one block owns the whole grid.** Both are
  structural: the schema exposes exactly one write command and it replaces the
  whole grid, and the node is an `atom` with a single `rows` attribute.

  **What every stored note does is nothing, and the file proves it rather than
  claiming it**: the widened gate is created under a temporary name, compared
  against the deployed one row by row at apply time, and the migration REFUSES
  instead of applying if any answer moves. 0 of 4 seeded rows change answer; the
  fourth is deliberately the 0078 `<>` shape, without which the survey's refusal
  can never fire (measured both ways).

  **THE PRODUCER IS NOT HERE, deliberately.** `NotebookGrid` is not in
  `NoteEditor.svelte`'s extension list and `$lib/server/rich-text-normalize.ts`
  does not name a grid, so nothing in this bundle can write one to the table --
  which is what makes the gate genuinely alone. The next bundle adds the
  `NoteBlock` arm, the normalizer branch, the renderer and the editor wiring, and
  owes a `draft-mirror` `v: 2` for a reason that is NOT the obvious one: a build
  without the node, handed a mirrored document with one, does not throw and
  discards the WHOLE document, paragraphs included (measured).

  Full suite **443 files / 8,463 tests, 0 failures**, against a baseline
  re-derived in a clean `git worktree` at the merged base (`origin/integration`
  at `20a17d12`): **440 files / 8,414 tests / 0 failures**. The delta is exactly
  this bundle's three test files and 49 tests. `svelte-check` 0 errors / 37
  warnings in 20 files (31/5/1), identical to the baseline re-derived in a clean
  `git worktree` at the branch point, and **`CLAUDE.md` states exactly that and is
  correct** -- the first time in five corrections, so no edit was needed and none
  was made. Browser pass at 375 and 1440: 62 measurements, 0 outside threshold.
  Fourteen mutants plus a positive control, four files md5-restored; two survived
  on the first attempt and both were the mutant's fault, redone and killed.

  **THE BRANCH WAS CUT FROM `origin/integration` AT `7f5ca8f0` AND MERGED IT
  AGAIN AT `20a17d12`**, because ledger 0189 landed `0209_ideacad_history.sql`
  mid-session. Until it did, `tests/db/migration-0177-tombstone.test.ts` failed on
  this branch with a hole at 0209 that no ref accounted for -- the exact cost the
  ledger README names for allocating a number with a gap, and it closed itself the
  moment 0189's file landed rather than needing anything here.

  **The SQL paste trap checked two ways against planted controls**: dollar-quote
  tokens balanced (6 opens, 6 closes), and one bare `$` in a comment
  (`` `$lib/...` ``) rewritten as the real path. The sweep over all 208 migrations
  is its own positive control -- it finds the 4 real token-in-comment lines, two of
  them in `0194`, the file the rule was written about. **That rule arrived on this
  branch with the mid-session merge and was not in the `CLAUDE.md` this session
  opened.**

  **0210 IS NOT APPLIED** -- no live project is reachable from this container.
