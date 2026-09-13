/**
 * The notebook's spreadsheet grid: the stored shape, the ProseMirror node, and
 * the NodeView that draws one.
 *
 * WHAT IS HERE AND WHAT IS NOT. This is decision 08's THIRD piece. Ledger 0180
 * audited the feature and measured the blocker; ledger 0187 built the formula
 * engine (`$lib/notebook/formula`, which this imports and does not touch); this
 * is the gate (`supabase/migrations/0210_notebook_note_grid.sql`) and the
 * editor.
 *
 * IT IS WIRED INTO `NoteEditor.svelte` NOW, AND THIS PARAGRAPH USED TO SAY IT
 * WAS NOT. Ledger 0192 shipped the node alone on purpose -- `CLAUDE.md`'s
 * validation-gate rule says the gate widens BEFORE anything can emit the shape
 * -- and named the four edits the producer bundle owed: a `NoteGrid` arm on
 * `NoteBlock` in `$lib/notebook-notes`, a branch in the server normalizer, a
 * renderer in `NoteContent.svelte`, and the extension list. **Ledger 0199 made
 * all four**, with `0210` applied, and every one of them IMPORTS what is below
 * rather than restating it. A comment describing an unwritten bundle is exactly
 * what goes stale the moment somebody writes it.
 *
 * THE `.svelte.ts` SPLIT IS THE `rich-text-schema.ts` RULE. `grid-doc` and
 * `grid-node` are importable by a node test with no DOM -- the schema is the
 * paste filter, and a test that builds a fixture from it must be able to read
 * it -- while `grid-nodeview.svelte.ts` imports `svelte` and
 * `@tiptap/pm/view` and can only run in a browser. Import the node view from
 * its own path, never from here, so nothing pulls a browser module into a node
 * test by accident.
 */

export {
	NOTE_GRID_MAX_ROWS,
	NOTE_GRID_MAX_COLS,
	NOTE_GRID_MAX_CELL_CHARS,
	NOTE_GRID_DEFAULT_ROWS,
	NOTE_GRID_DEFAULT_COLS,
	cellRef,
	emptyGrid,
	gridCells,
	gridCols,
	gridProblem,
	gridTextLength,
	isNoteGrid,
	type NoteGrid
} from './grid-doc';
export { GRID_DOM_ATTR, GRID_NODE_NAME, NotebookGrid, gridFromDom } from './grid-node';
