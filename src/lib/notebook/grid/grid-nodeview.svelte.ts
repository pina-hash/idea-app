/**
 * THE NODEVIEW: the one place a committed cell becomes a ProseMirror
 * transaction.
 *
 * ProseMirror asks for a NodeView when it needs to render a node it cannot draw
 * itself, and an `atom` has no content for it to draw -- so this is what puts
 * `GridView.svelte` on screen inside the document, and what carries a change
 * back out.
 *
 * IT IS EIGHT LINES OF DECISION AND THE REST IS PLUMBING. The decision is in
 * `commit` below: a whole grid arrives from the component and becomes exactly
 * ONE `setNodeAttribute` on one transaction. That is the granularity decision
 * made real -- see `GridView.svelte`'s header for the argument -- and it is why
 * the history plugin records one undo step per cell edit rather than one per
 * keystroke or one per grid.
 *
 * `getPos()` IS RE-ASKED ON EVERY COMMIT AND NEVER CAPTURED. ProseMirror hands
 * a NodeView a FUNCTION rather than a number precisely because the node moves:
 * a paragraph typed above this grid shifts its position, and a commit written
 * against a position captured at mount would write the attribute onto whatever
 * happens to be at the old offset. It returns `undefined` for a node that has
 * been removed, which is the case a commit racing a delete lands in, and the
 * guard below is what makes that a no-op instead of a throw inside a blur
 * handler.
 */

import { mount, unmount } from 'svelte';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView, NodeView } from '@tiptap/pm/view';
import GridView from './GridView.svelte';
import { GRID_NODE_NAME } from './grid-node';
import { gridProblem, type NoteGrid } from './grid-doc';

/** The node's attributes as a `NoteGrid`, or an empty one if it holds nothing. */
function gridOf(node: PMNode): NoteGrid {
	const rows = node.attrs.rows;
	const grid = { type: 'grid' as const, rows: Array.isArray(rows) ? rows : [['']] };
	// A NODE WHOSE ATTRIBUTE IS SOMEHOW INVALID RENDERS AS A ONE-CELL GRID
	// rather than throwing inside a render. A NodeView that throws takes the
	// whole editor down, which on this surface is a student's note becoming
	// unreadable -- and the only way an invalid attribute gets here is a paste
	// the filter let through or a rollback, neither of which is worth that.
	return gridProblem(grid) === null ? grid : { type: 'grid', rows: [['']] };
}

/**
 * The NodeView factory Tiptap's `addNodeView` returns.
 *
 * KEPT OUT OF `grid-node.ts` DELIBERATELY. That module is the SCHEMA -- the
 * paste filter and the stored shape -- and it must stay importable by a node
 * test with no DOM and no Svelte, exactly as `rich-text-schema.ts` is. This one
 * imports `svelte` and `@tiptap/pm/view` and can only run in a browser.
 */
export function notebookGridNodeView(props: {
	node: PMNode;
	view: EditorView;
	getPos: () => number | undefined;
	editor: { isEditable: boolean };
}): NodeView {
	const dom = document.createElement('div');
	dom.className = 'nb-grid-host';
	// AN ATOM'S OWN DOM IS NOT EDITABLE PROSEMIRROR CONTENT. Without this,
	// ProseMirror's contenteditable reaches into the cells' markup and a
	// keystroke can rewrite the NodeView's DOM out from under Svelte.
	dom.contentEditable = 'false';

	let current = $state.raw(gridOf(props.node));
	let editable = $state.raw(props.editor.isEditable);

	function commit(next: NoteGrid) {
		const pos = props.getPos();
		if (pos === undefined) return;
		// ONE TRANSACTION. `setNodeAttribute` on the whole `rows` attribute is
		// the entire write: one undo step, one revision's worth of change, and
		// no path by which a per-cell write could be added later without adding
		// a command to the schema first.
		props.view.dispatch(props.view.state.tr.setNodeAttribute(pos, 'rows', next.rows));
	}

	const component = mount(GridView, {
		target: dom,
		props: {
			get grid() {
				return current;
			},
			get editable() {
				return editable;
			},
			oncommit: commit,
			label: 'Spreadsheet'
		}
	});

	return {
		dom,
		/**
		 * ProseMirror re-uses a NodeView across an attribute change when this
		 * returns true, which is what lets an UNDO land in the grid already on
		 * screen rather than remounting it -- a remount would drop focus, and a
		 * student pressing Ctrl+Z would lose their place as well as their edit.
		 */
		update(node) {
			if (node.type.name !== GRID_NODE_NAME) return false;
			current = gridOf(node);
			return true;
		},
		selectNode() {
			dom.classList.add('is-selected');
		},
		deselectNode() {
			dom.classList.remove('is-selected');
		},
		/**
		 * EVERY DOM EVENT INSIDE THE GRID IS THE GRID'S. ProseMirror would
		 * otherwise interpret a click in a cell as a document selection and a
		 * keystroke as text input into an atom, both of which fight the inputs
		 * this component owns. This is the standard atom-with-controls answer and
		 * it is what makes the cells behave like form fields, which is what they
		 * are.
		 */
		stopEvent() {
			return true;
		},
		/** An atom has no ProseMirror content, so no mutation inside it is one. */
		ignoreMutation() {
			return true;
		},
		destroy() {
			void unmount(component);
		}
	};
}
