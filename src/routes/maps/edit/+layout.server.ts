import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { loadMapsScope, type MapsWriteClient } from '$lib/maps/transports';
import type { LayoutServerLoad } from './$types';

/**
 * THE MAPS EDITOR'S GATE, HOISTED, so a new page under `/maps/edit` cannot
 * ship ungated by somebody forgetting to copy a check. It moved here the
 * moment there was a second page (the shelf entry surface): a group-wide gate
 * is stated once, in the layout, and every page beneath it inherits.
 *
 * A NON-ADMIN GETS 404, NOT A REDIRECT AND NOT 403 -- the same answer `/admin`,
 * `/coin-desk` and `/foundry/review` give. An editor lane's existence is not
 * public, and a redirect would confirm there is one to be turned away from.
 * That is also why nothing under `/maps/edit` is in `authedPrefixes`. `/maps`
 * itself is the future PUBLIC viewer (spec section 6) and must never be
 * prefix-guarded, which is why this sits on `edit/` and not on `maps/`.
 *
 * THIS IS STILL CONVENIENCE, AS EVERY APP-SIDE GUARD IS. The real boundary is
 * `is_admin()` inside 0161's and 0163's RLS policies: every read and write on
 * these pages runs on the CALLER'S OWN client, so a caller who got past this
 * would still read published rows only and have every write refused by the
 * database. What the guard buys is that a non-admin never lands on a page
 * whose every action would fail.
 *
 * SINCE 0172 THE GATE IS "ADMIN OR HOLDS A GRANT", NOT "ADMIN". A granted
 * editor is a real editor: they land on the same pages, mount the same
 * MapsEditor, and are narrowed by their SCOPE rather than by a different
 * surface -- which is why there is no second editor to keep in step. Somebody
 * with neither still gets 404, not 403 and not a redirect, for the reason
 * above: the lane's existence is not public.
 *
 * THE SCOPE IS RESOLVED HERE, ONCE, and rides `page.data` down to both pages.
 * A page load resolving its own would be a second read that can disagree with
 * the one the gate was decided on.
 *
 * `params` and nothing else: a layout load must never read `url`, or it re-runs
 * on every navigation between the pages it covers.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const uid = locals.claims?.sub ?? null;
	if (!uid) error(404, 'Not found');
	const admin = await isAdmin(locals.supabase, uid);
	const scope = await loadMapsScope(locals.supabase as unknown as MapsWriteClient, admin);
	if (!scope.admin && scope.grants.length === 0) error(404, 'Not found');
	return { mapsScope: scope, mapsIsAdmin: admin };
};
