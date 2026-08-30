import { error } from '@sveltejs/kit';
import { loadMapsEditorData, type MapsReadClient } from '$lib/maps/selects';
import type { PageServerLoad } from './$types';

/**
 * ITEM ENTRY AT THE SHELF -- the read. The ADMIN GATE is the area's
 * `+layout.server.ts` and is not restated here; that hoist is what makes this
 * page gated by existing rather than by remembering.
 *
 * `?node=<id>` IS THE CONTAINER, AND IT IS READ HERE BECAUSE THIS IS A PAGE
 * LOAD. A layout load must never read `url` (it would re-run on every
 * navigation); a page load is exactly where a query parameter belongs, and
 * re-running when the container changes is the behaviour wanted.
 *
 * The id is passed through UNVALIDATED on purpose: the component resolves it
 * against the nodes it was handed and falls back to the container picker when
 * it names nothing, which is the same answer a deleted node gives. Validating
 * here would mean a 404 for a bookmark to a drawer somebody removed, where the
 * useful answer is "pick a container".
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	try {
		return {
			maps: await loadMapsEditorData(locals.supabase as unknown as MapsReadClient),
			containerId: url.searchParams.get('node')
		};
	} catch (cause) {
		error(500, cause instanceof Error ? cause.message : 'The map could not be loaded.');
	}
};
