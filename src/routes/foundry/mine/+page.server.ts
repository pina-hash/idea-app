import { error } from '@sveltejs/kit';
import type { FoundryApp, FoundryAppSummary } from '$lib/foundry/transports';
import type { PageServerLoad } from './$types';

/**
 * THE STUDENT'S OWN APPS.
 *
 * Both reads run as the CALLER through `locals.supabase`, and neither adds an
 * identity filter of its own beyond the one the RPC's signature already takes:
 * `foundry_list_apps` is a definer whose population predicate is
 * `_foundry_app_in_population`, and passing `p_owner` here is ATTRIBUTION ("my
 * rows"), not authorization. The gate is the function.
 *
 * `p_include_unpublished` is what makes this the owner's view rather than the
 * gallery's: an app with no approved version is invisible to everyone else and
 * is most of what a student has while they are still working.
 *
 * SELECTION COMES OFF THE URL so an app is linkable and a reload lands where
 * the student was. This is a `+page.server.ts` rather than a layout load for
 * exactly that reason -- a layout load must never read `url`.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const uid = locals.claims?.sub ?? null;
	if (!uid) return { apps: [] as FoundryAppSummary[], selected: null, uid: '' };

	const { data: apps, error: listErr } = await locals.supabase.rpc('foundry_list_apps', {
		p_owner: uid,
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
		// "Not found" and "not yours" answer identically: the population
		// predicate returned nothing and there is nothing to tell apart.
		if (!data) error(404, 'Not found');
		selected = data as FoundryApp;
	}

	return {
		apps: (apps ?? []) as FoundryAppSummary[],
		selected,
		uid
	};
};
