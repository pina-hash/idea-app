import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for THE INSERTION PATH: `NoteEditor.svelte` itself, with the
 * grid control in its own toolbar. No auth, no Supabase, no network. 404s in
 * production.
 *
 * WHY IT IS NOT `/dev/notebook-sheet`. That route is ledger 0192's and mounts a
 * Tiptap editor it builds ITSELF -- deliberately, because when it was written
 * `NoteEditor.svelte` did not have the grid in its extension list and could not
 * be given one until the gate was applied. Its own header says what happens
 * next: "this route should then mount `NoteEditor` directly". This is that
 * route, standing beside it rather than replacing it, because the two prove
 * different things and the older one's measurements are already in the store.
 *
 *   * `/dev/notebook-sheet` proves the NODE, the NodeView and the engine behave
 *     inside a correctly configured editor.
 *   * THIS one proves a STUDENT CAN GET ONE. The toolbar control, the refusal
 *     when the selection is already inside a grid, the problem list under a grid
 *     with errors in it, and the empty-grid notice -- none of which exist below
 *     `NoteEditor`, and all of which are the whole of what ledger 0199 added.
 *
 * IT MOUNTS THE REAL COMPONENT, never a copy: the editor here is the editor a
 * student writes a note in, with the same toolbar, the same autocorrect plugin
 * and the same dynamic import. What the harness supplies is only what the
 * notebook's own page supplies -- a seed document and an `onchange`.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
