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
 * IT IS NOT WIRED INTO `NoteEditor.svelte` AND THAT IS THE SEQUENCING, NOT AN
 * OMISSION. `CLAUDE.md`'s validation-gate rule says the gate widens ALONE,
 * before anything can emit the shape. The one path from an editor document into
 * `notebook_entry_notes.content` is `$lib/server/rich-text-normalize.ts`, a
 * whitelist translator that BUILDS its output from the node types it names --
 * it does not name a grid, and it is not this bundle's file. So the next bundle
 * adds three things and IMPORTS everything below rather than restating it: a
 * `NoteGrid` arm on `NoteBlock` in `$lib/notebook-notes`, a branch in the
 * normalizer, and a renderer in `NoteContent.svelte`; then
 * `NoteEditor.svelte`'s extension list gains `NotebookGrid` and the feature is
 * on. By then the gate is applied.
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
