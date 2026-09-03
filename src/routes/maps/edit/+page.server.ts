import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { loadMapsScope, type MapsWriteClient } from '$lib/maps/transports';
import { loadMapsEditorData, type MapsReadClient } from '$lib/maps/selects';
import type { PageServerLoad } from './$types';

/**
 * THE MAPS EDITOR'S READ. Admin only, and THE LOAD ITSELF REFUSES -- a
 * non-admin never receives a page that renders empty.
 *
 * THE GATE ITSELF NOW LIVES IN `+layout.server.ts`, hoisted there when this
 * area gained its second page, so a new one cannot ship ungated. The identical
 * check below is DEFENCE IN DEPTH and not a second rule: both call the one
 * `isAdmin` helper and the one `loadMapsScope`, and a mutation test that opens
 * either layer alone must still find the other closed (CLAUDE.md). Somebody
 * with neither admin nor a grant gets 404 from whichever runs first.
 *
 * SINCE 0172 THE GATE IS "ADMIN OR HOLDS A GRANT". The READ below is unchanged
 * and needs no scope filter: it runs on the CALLER'S OWN client, so 0172's
 * read policies decide what comes back -- a grantee receives their subtree,
 * the ancestor spine above it and every published row, and an explicit filter
 * here would be a second copy of that rule (the read-path rule: RLS is the
 * boundary, do not restate it).
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
	const admin = await isAdmin(locals.supabase, uid);
	const scope = await loadMapsScope(locals.supabase as unknown as MapsWriteClient, admin);
	if (!scope.admin && scope.grants.length === 0) error(404, 'Not found');

	try {
		// The structural cast stops TS instantiating supabase-js's deep query
		// generics against the narrow read-client slice; the calls are the same.
		return {
			maps: await loadMapsEditorData(locals.supabase as unknown as MapsReadClient),
			mapsScope: scope
		};
	} catch (cause) {
		error(500, cause instanceof Error ? cause.message : 'The map could not be loaded.');
	}
};
