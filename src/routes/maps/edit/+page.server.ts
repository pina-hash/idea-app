import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { loadMapsEditorData, type MapsReadClient } from '$lib/maps/selects';
import type { PageServerLoad } from './$types';

/**
 * THE MAPS EDITOR'S READ. Admin only, and THE LOAD ITSELF REFUSES -- a
 * non-admin never receives a page that renders empty.
 *
 * THE GATE ITSELF NOW LIVES IN `+layout.server.ts`, hoisted there when this
 * area gained its second page, so a new one cannot ship ungated. The identical
 * check below is DEFENCE IN DEPTH and not a second rule: both call the one
 * `isAdmin` helper, and a mutation test that opens either layer alone must
 * still find the other closed (CLAUDE.md). A non-admin gets 404 from whichever
 * runs first.
 *
 * A NON-ADMIN GETS 404, NOT A REDIRECT AND NOT 403, the same answer `/admin`,
 * `/coin-desk` and `/foundry/review` give: an editor lane's existence is not
 * public, and a redirect would confirm there is one to be turned away from.
 * That is also why this route is deliberately NOT in `authedPrefixes` -- the
 * prefix guard's redirect would be that confirmation. `/maps` itself is the
 * future PUBLIC viewer (spec section 6) and must never be prefix-guarded.
 *
 * THE GUARD HERE IS CONVENIENCE, AS EVERY APP-SIDE GUARD IS. The real boundary
 * is `is_admin()` inside 0161's RLS policies: the reads below run on the
 * CALLER'S OWN client, so even if this check were skipped, a non-admin's
 * selects would return published rows only and every write would be refused
 * by the database. What the guard buys is that a non-admin never lands on a
 * page whose every action would fail.
 *
 * The read itself is `loadMapsEditorData`, the ONE copy of the editor's read
 * -- the client-side reload after a write calls the same function, so what
 * the page opens on and what it refreshes to cannot drift.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.claims?.sub ?? null;
	if (!uid) error(404, 'Not found');
	if (!(await isAdmin(locals.supabase, uid))) error(404, 'Not found');

	try {
		// The structural cast stops TS instantiating supabase-js's deep query
		// generics against the narrow read-client slice; the calls are the same.
		return { maps: await loadMapsEditorData(locals.supabase as unknown as MapsReadClient) };
	} catch (cause) {
		error(500, cause instanceof Error ? cause.message : 'The map could not be loaded.');
	}
};
