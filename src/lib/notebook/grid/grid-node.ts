/**
 * THE GRID AS A PROSEMIRROR NODE, WHICH IS THE WHOLE POINT AND NOT A DETAIL.
 *
 * Mr. Pina's bar for decision 08 is that a spreadsheet must work as well inside
 * a note as the text does, and ledgers 0180 and 0187 both established that this
 * is a bar ABOUT UNDO. `NoteEditor.svelte:202` is
 * `StarterKit.configure(NOTE_SCHEMA_OPTIONS)`, and `NOTE_SCHEMA_OPTIONS`
 * switches eight extensions off -- `history` is not one of them -- so
 * ProseMirror's history plugin owns Ctrl+Z inside a note.
 *
 *   * A GRID BESIDE THE EDITOR HAS NO UNDO AT ALL. Ctrl+Z in a cell either does
 *     nothing or undoes the prose behind it, which is worse than nothing. Giving
 *     it a stack of its own is two histories in one document, and they
 *     interleave wrongly the first time somebody types a paragraph, edits a
 *     cell and presses Ctrl+Z twice expecting their own order back. Nothing
 *     about that is fixable from outside ProseMirror: the plugin owns the
 *     transaction history, and a store beside it is not in that history.
 *   * A GRID INSIDE IT INHERITS UNDO, SELECTION AND THE PASTE FILTER FOR FREE,
 *     because every cell edit is a TRANSACTION and the history plugin records
 *     transactions. That is what this file is.
 *
 * THE SCHEMA IS THE PASTE FILTER, which is `rich-text-schema.ts`'s own rule and
 * is why `parseDOM` below is written the way it is rather than left permissive:
 * declaring a node type does not only decide what the editor can hold, it
 * decides what a paste can bring in.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import {
	NOTE_GRID_DEFAULT_COLS,
	NOTE_GRID_DEFAULT_ROWS,
	NOTE_GRID_MAX_COLS,
	NOTE_GRID_MAX_ROWS,
	emptyGrid,
	gridProblem,
	type NoteGrid
} from './grid-doc';

/** The node's name in the schema, and in a stored document's `type`. */
export const GRID_NODE_NAME = 'notebookGrid';

/**
 * The one DOM attribute the grid round-trips through, and the one place its
 * spelling is written down.
 *
 * 0195'S MANIFEST IS THE PRECEDENT AND THIS IS THE HALF THAT TRANSFERS: the
 * block's value is a JSON string of the whole grid, and there is no per-cell
 * attribute. In the editor's own JSON the attribute is a real array (ProseMirror
 * JSON is JSON, so nothing is gained by stringifying it there); through the DOM
 * -- which is the copy/paste and the `parseDOM` path -- it has to be a string,
 * because that is what an HTML attribute is. Two representations of one value,
 * with `toDOM`/`parseDOM` as the single conversion, rather than two values.
 */
export const GRID_DOM_ATTR = 'data-notebook-grid';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		notebookGrid: {
			/** Inserts an empty grid at the selection. */
			insertNotebookGrid: (rows?: number, cols?: number) => ReturnType;
			/**
			 * Replaces the WHOLE grid at `pos` with `grid`, as ONE transaction.
			 *
			 * THIS IS THE ONLY WRITE, AND THAT IS THE TRANSACTION-GRANULARITY
			 * DECISION MADE STRUCTURAL. There is no per-cell command, so there is
			 * no way for a NodeView to accidentally dispatch one transaction per
			 * keystroke: the smallest thing this extension can do to a grid is
			 * replace it, which is one undo step.
			 */
			setNotebookGrid: (pos: number, grid: NoteGrid) => ReturnType;
		};
	}
}

/**
 * Read a grid off a DOM element's attribute, or null.
 *
 * IT REFUSES RATHER THAN REPAIRS, and that is the paste filter doing its job: a
 * pasted element carrying a malformed or oversized grid contributes NOTHING
 * rather than a coerced half-grid, which is the same failure mode
 * `$lib/server/rich-text-normalize.ts` describes -- the content disappears
 * rather than surviving in a form nobody checked. `gridProblem` is the ONE
 * statement of what a valid grid is and it is called here rather than
 * re-implemented, so the paste filter and the SQL gate cannot come to disagree.
 */
export function gridFromDom(el: HTMLElement): NoteGrid | null {
	const raw = el.getAttribute(GRID_DOM_ATTR);
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	const grid = { type: 'grid' as const, rows: (parsed as { rows?: unknown })?.rows };
	return gridProblem(grid) === null ? (grid as NoteGrid) : null;
}

/**
 * The Tiptap node.
 *
 * `atom: true` AND `isolating: true`, and they answer different questions.
 * `atom` says the node has no editable ProseMirror content of its own -- the
 * cells are the NodeView's DOM, not child nodes -- which is what makes "one
 * block owns the whole grid" true at the schema level rather than by
 * convention. `isolating` stops a backspace at the start of the paragraph after
 * a grid from reaching into it, and stops a selection dragged across it from
 * half-deleting it.
 *
 * WHY THE CELLS ARE NOT PROSEMIRROR CHILD NODES, which is the shape a
 * `@tiptap/extension-table` reader would expect. A cell holds a FORMULA SOURCE,
 * which is a single line of plain text with no marks, no links and no lists;
 * modelling it as a ProseMirror text block would put the note's whole inline
 * schema inside every cell and make `=SUM(A1:A3)` something a student could
 * accidentally embolden half of. It would also make the per-cell node the join
 * key this feature must not have. An atom with one attribute is the shape 0195
 * chose for the same reason.
 *
 * THE COST OF `atom`, STATED RATHER THAN DISCOVERED: ProseMirror does not manage
 * the caret inside the grid, so the NodeView owns cell focus and keyboard
 * movement itself. That is a real cost and it is the right trade -- the
 * alternative buys ProseMirror's caret and pays with the schema and the join key
 * above -- but it is why `GridView.svelte` is a real component and not a
 * rendering function.
 */
export const NotebookGrid = Node.create({
	name: GRID_NODE_NAME,
	group: 'block',
	atom: true,
	isolating: true,
	selectable: true,
	draggable: false,

	addAttributes() {
		return {
			rows: {
				default: null as string[][] | null,
				parseHTML: (el) => gridFromDom(el as HTMLElement)?.rows ?? null,
				renderHTML: (attrs) => ({
					[GRID_DOM_ATTR]: JSON.stringify({ rows: attrs.rows ?? [] })
				})
			}
		};
	},

	parseHTML() {
		// A TAG PLUS AN ATTRIBUTE, never the tag alone. `table` is a common thing
		// to paste out of a browser and a bare `tag: 'table'` here would claim
		// every one of them -- turning an arbitrary pasted web table into a
		// notebook grid whose cells are whatever markup happened to be in them.
		// This claims only what this editor itself produced.
		return [{ tag: `div[${GRID_DOM_ATTR}]` }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes, { class: 'nb-grid-serialized' })];
	},

	addCommands() {
		return {
			insertNotebookGrid:
				(rows = NOTE_GRID_DEFAULT_ROWS, cols = NOTE_GRID_DEFAULT_COLS) =>
				({ commands }) => {
					const r = Math.min(Math.max(1, Math.trunc(rows)), NOTE_GRID_MAX_ROWS);
					const c = Math.min(Math.max(1, Math.trunc(cols)), NOTE_GRID_MAX_COLS);
					return commands.insertContent({
						type: GRID_NODE_NAME,
						attrs: { rows: emptyGrid(r, c).rows }
					});
				},

			setNotebookGrid:
				(pos, grid) =>
				({ tr, dispatch }) => {
					// REFUSED, NOT CLAMPED. A caller handing over a grid the gate
					// would reject is a bug in that caller, and silently trimming
					// it would put a document in the editor that cannot be saved
					// with nothing anywhere saying so.
					if (gridProblem(grid) !== null) return false;
					const node = tr.doc.nodeAt(pos);
					if (!node || node.type.name !== GRID_NODE_NAME) return false;
					if (dispatch) tr.setNodeAttribute(pos, 'rows', grid.rows);
					return true;
				}
		};
	}
});
