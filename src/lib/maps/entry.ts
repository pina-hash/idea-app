/**
 * THE WAY INTO THE EDITOR, as one predicate and one path. The public viewer at
 * `/maps` shows an "Edit map" control to a caller who may edit and to nobody
 * else, and this is the whole of "may edit" as the surface knows it: a site
 * admin, or somebody holding at least one editor grant (0172). It is the same
 * question `/maps/edit`'s own `+layout.server.ts` answers with a 404, asked
 * one page earlier so the control is offered only where it would work.
 *
 * THIS IS THE CONVENIENCE HALF, NEVER THE GATE. The gate is the layout load
 * under `/maps/edit`, which refuses a caller holding neither with 404 whether
 * or not they saw a control; a viewer that rendered the link to everyone would
 * be ugly and would open nothing. `tests/maps-editor-entry.test.ts` opens each
 * half separately: the control is absent for a non-editor, and the route
 * refuses the same caller anyway.
 *
 * Pure and client-safe: no Svelte, no Supabase, no `$app`.
 */

import type { MapsEditorScope } from './grants';

export const MAPS_EDITOR_PATH = '/maps/edit';

/** Wording is the control's own; the test reads it off the render. */
export const MAPS_EDITOR_ENTRY_LABEL = 'Edit map';

/**
 * May this caller enter the editor at all? `null` is a caller whose scope has
 * not been resolved (signed out, or a signed-in non-admin whose grants have
 * not come back yet) and is answered NO: a control that appears only once the
 * answer is known is better than one that appears and then refuses.
 */
export function mapsCanEnterEditor(scope: MapsEditorScope | null | undefined): boolean {
	if (!scope) return false;
	return scope.admin || scope.grants.length > 0;
}
