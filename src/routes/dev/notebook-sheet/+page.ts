import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the notebook's spreadsheet grid: the REAL ProseMirror
 * node, the REAL NodeView, the REAL `GridView.svelte` and the REAL formula
 * engine, inside a REAL Tiptap editor configured exactly as `NoteEditor.svelte`
 * configures one. No auth, no Supabase, no network. 404s in production.
 *
 * IT EXISTS BECAUSE THE ONE CLAIM THAT MATTERS IS A BROWSER CLAIM. `tests/dom/`
 * proves the document behaves and the component behaves, but happy-dom has no
 * layout engine, so a grid's cells, its header row and its behaviour in a narrow
 * pane are measurable nowhere else -- and a grid is exactly the surface where
 * every content check passes over a broken layout. Ledger 0171 lost two rows
 * below an invisible fold this way.
 *
 * THE SECOND THING IT PROVES IS THAT THE NODEVIEW MOUNTS AT ALL. Svelte mounted
 * inside a ProseMirror NodeView is the one join in this bundle that no test can
 * exercise: `tests/dom/notebook-sheet-undo.test.ts` deliberately builds the
 * editor WITHOUT a NodeView, because putting Svelte inside ProseMirror inside
 * happy-dom would add two failure modes between the file and the claim it makes.
 * So this route is where that join is verified, in a real browser.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
