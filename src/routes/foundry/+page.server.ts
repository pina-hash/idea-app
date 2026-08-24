import { error } from '@sveltejs/kit';
import type { FoundryApp, FoundryAppSummary } from '$lib/foundry/transports';
import type { PageServerLoad } from './$types';

/**
 * THE GALLERY: every published, non-hidden app.
 *
 * Both reads run as the CALLER through `locals.supabase` and neither adds an
 * identity filter of its own. `foundry_list_apps` is a SECURITY DEFINER whose
 * population predicate is `_foundry_app_in_population` (0130), and calling it
 * with NO arguments is what makes this the gallery rather than somebody's own
 * shelf: `p_owner` null means everyone's, and both widening flags default false
 * so an unpublished or hidden app is not in the answer.
 *
 * THE TWO WIDENING FLAGS ARE NOT PASSED, DELIBERATELY. They are gated on
 * `is_admin()` INSIDE the predicate, so passing them would be harmless for a
 * student and would quietly put hidden apps on an admin's gallery -- and hiding
 * is a staff act that takes an app off the site FOR STAFF TOO. An admin who
 * wants to see a hidden app looks at the review surface, not here.
 *
 * SELECTION COMES OFF THE URL so an app is linkable and a reload lands where
 * the viewer was. That is why this is a `+page.server.ts` and not a layout
 * load: a layout load must never read `url`.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { data: apps, error: listErr } = await locals.supabase.rpc('foundry_list_apps');
	if (listErr) error(500, listErr.message);

	const slug = url.searchParams.get('app');
	let selected: FoundryApp | null = null;

	if (slug) {
		const { data, error: getErr } = await locals.supabase.rpc('foundry_get_app', {
			p_slug: slug
		});
		if (getErr) error(500, getErr.message);
		// "Not found" and "not published" answer identically: the population
		// predicate returned nothing and there is nothing to tell apart.
		if (!data) error(404, 'Not found');
		selected = data as FoundryApp;
	}

	return {
		apps: (apps ?? []) as FoundryAppSummary[],
		selected
	};
};
