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
 * an empty list. `p_include_hidden` is NOT passed: a hidden app is off the site
 * and is not something to review back onto it.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const uid = locals.claims?.sub ?? null;
	if (!uid) error(404, 'Not found');
	if (!(await isAdmin(locals.supabase, uid))) error(404, 'Not found');

	const { data: apps, error: listErr } = await locals.supabase.rpc('foundry_list_apps', {
		p_include_unpublished: true
	});
	if (listErr) error(500, listErr.message);

	const slug = url.searchParams.get('app');
	let selected: FoundryApp | null = null;

	if (slug) {
		const { data, error: getErr } = await locals.supabase.rpc('foundry_get_app', {
			p_slug: slug,
			p_include_unpublished: true
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
