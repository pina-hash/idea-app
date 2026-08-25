import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { FoundryApp, FoundryAppSummary } from '$lib/foundry/transports';
import type { PageServerLoad } from './$types';

/**
 * THE REVIEW QUEUE'S READ. Admin only.
 *
 * A NON-ADMIN GETS 404, NOT A REDIRECT AND NOT 403. This surface's EXISTENCE is
 * not public, which is the same reason `/admin`, `/coin-desk` and the teacher
 * tabs under `/classroom/[sectionId]` answer 404 -- a redirect would confirm
 * there is a review lane to be turned away from. It is therefore deliberately
 * not in `authedPrefixes` either; the parent `/foundry` layout already bounces
 * an anonymous visitor, and this check is what turns away a signed-in
 * non-admin.
 *
 * THE GUARD HERE IS CONVENIENCE, AS EVERY APP-SIDE GUARD IS. The real boundary
 * is `is_admin()` inside `foundry_review_version` and inside the source route,
 * neither of which this page can talk its way past. What the guard buys is that
 * a non-admin never lands on a page whose every action would fail.
 *
 * `p_include_unpublished` IS WHAT MAKES THIS THE QUEUE. Everything waiting for
 * review is by definition not published, so the gallery's own read would return
 * an empty list.
 *
 * `p_include_hidden` IS PASSED, AND IT USED TO NOT BE. The old reasoning was
 * that a hidden app is off the site and is not something to review back onto
 * it -- which is true about the QUEUE and wrong about the surface, because
 * hiding is REVERSIBLE by design (0130's `foundry_set_app_hidden` is one
 * function with a boolean, and restoring is the same call with false). With
 * the flag off, a hidden app appears on no surface anywhere: not the gallery,
 * not its owner's list, not this queue. So the moment the review console
 * gained a Hide control it would have gained a ONE-WAY DOOR, with a Restore
 * that nothing could ever be selected to press. The queue itself is unchanged
 * -- `queueOrder` still filters on `submitted_version_id` -- and the shelved
 * apps render in their own list below it.
 *
 * THE WIDENING IS NOT THIS ROUTE'S TO GRANT. `_foundry_app_in_population` gates
 * both flags on `is_admin()` INSIDE itself, so the same parameter passed from a
 * student's session widens nothing at all. The `isAdmin` check above is
 * convenience; that predicate is the boundary.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const uid = locals.claims?.sub ?? null;
	if (!uid) error(404, 'Not found');
	if (!(await isAdmin(locals.supabase, uid))) error(404, 'Not found');

	const { data: apps, error: listErr } = await locals.supabase.rpc('foundry_list_apps', {
		p_include_unpublished: true,
		p_include_hidden: true
	});
	if (listErr) error(500, listErr.message);

	const slug = url.searchParams.get('app');
	let selected: FoundryApp | null = null;

	if (slug) {
		const { data, error: getErr } = await locals.supabase.rpc('foundry_get_app', {
			p_slug: slug,
			p_include_unpublished: true,
			p_include_hidden: true
		});
		if (getErr) error(500, getErr.message);
		if (!data) error(404, 'Not found');
		selected = data as FoundryApp;
	}

	return {
		apps: (apps ?? []) as FoundryAppSummary[],
		selected
	};
};
